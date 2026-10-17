package controller

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	sqlmysql "github.com/go-sql-driver/mysql"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/schema"
)

func TestWalletReportsDatabaseMatrix(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, tc := range []struct {
		kind, env string
		typ       common.DatabaseType
	}{
		{"sqlite", "", common.DatabaseTypeSQLite},
		{"mysql", "TEST_MYSQL_DSN", common.DatabaseTypeMySQL},
		{"postgres", "TEST_POSTGRES_DSN", common.DatabaseTypePostgreSQL},
	} {
		t.Run(tc.kind, func(t *testing.T) {
			dsn := os.Getenv(tc.env)
			if tc.env != "" && dsn == "" {
				t.Skip(tc.env + " is not configured")
			}
			var driver gorm.Dialector = sqlite.Open(t.TempDir() + "/wallet-report.db")
			if tc.kind == "mysql" {
				driver = mysql.Open(dsn)
			}
			if tc.kind == "postgres" {
				driver = postgres.Open(dsn)
			}
			db, err := gorm.Open(driver, &gorm.Config{NamingStrategy: schema.NamingStrategy{TablePrefix: "wallet_report_test_"}})
			require.NoError(t, err)
			sqlDB, err := db.DB()
			require.NoError(t, err)
			sqlDB.SetMaxOpenConns(1)
			useLogExportDatabases(t, db, db, tc.typ, tc.typ)
			tables := []any{&model.User{}, &model.Token{}, &model.TopUp{}, &model.QuotaData{}, &model.AffiliateReward{}}
			require.NoError(t, db.Migrator().DropTable(tables...))
			require.NoError(t, db.AutoMigrate(tables...))
			t.Cleanup(func() { require.NoError(t, db.Migrator().DropTable(tables...)); require.NoError(t, sqlDB.Close()) })
			var version string
			versionQuery := "SELECT version()"
			if tc.kind == "sqlite" {
				versionQuery = "SELECT sqlite_version()"
			}
			require.NoError(t, db.Raw(versionQuery).Scan(&version).Error)
			t.Logf("database version: %s", version)
			users := []model.User{
				{Id: 1, Username: "referrer", Password: "unused-test-hash", AffCode: "ref-1", AffQuota: 20, AffHistoryQuota: 50, AffCount: 2},
				{Id: 2, Username: "invitee", Password: "unused-test-hash", AffCode: "ref-2", InviterId: 1},
				{Id: 3, Username: "unrelated", Password: "unused-test-hash", AffCode: "ref-3"},
			}
			require.NoError(t, db.Create(&users).Error)
			require.NoError(t, db.Create(&model.Token{Id: 11, UserId: 1, Key: "wallet-test-only", Name: "primary"}).Error)
			start := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
			end := start.AddDate(0, 1, 0)
			quotaRows := []model.QuotaData{
				{UserID: 1, ModelName: "model-a", UseGroup: "default", TokenID: 11, CreatedAt: start.Unix(), Count: 2, Quota: 100, TokenUsed: 40},
				{UserID: 1, ModelName: "model-a", UseGroup: "default", TokenID: 11, CreatedAt: start.Add(time.Hour).Unix(), Count: 3, Quota: 200, TokenUsed: 50},
				{UserID: 1, ModelName: "model-a", UseGroup: "vip", TokenID: 12, CreatedAt: end.Unix() - 3600, Count: 1, Quota: 70, TokenUsed: 20},
				{UserID: 1, ModelName: "outside", CreatedAt: end.Unix(), Count: 100, Quota: 9000},
				{UserID: 3, ModelName: "private-model", CreatedAt: start.Unix(), Count: 100, Quota: 9000},
			}
			require.NoError(t, db.Create(&quotaRows).Error)
			topups := []model.TopUp{
				{UserId: 1, TradeNo: "completed-in-month", Amount: 7, Money: 500, Status: common.TopUpStatusSuccess, CreateTime: start.Unix() - 3600, CompleteTime: start.Unix()},
				{UserId: 1, TradeNo: "creem-completed", Amount: 500000, Money: 2, PaymentProvider: model.PaymentProviderCreem, Status: common.TopUpStatusSuccess, CompleteTime: start.Unix()},
				{UserId: 1, TradeNo: "stripe-completed", Amount: 100, Money: 10, PaymentProvider: model.PaymentProviderStripe, Status: common.TopUpStatusSuccess, CompleteTime: start.Unix()},
				{UserId: 1, TradeNo: "next-month", Amount: 100, Money: 100, Status: common.TopUpStatusSuccess, CompleteTime: end.Unix()},
				{UserId: 1, TradeNo: "pending-in-month", Amount: 100, Money: 100, Status: common.TopUpStatusPending, CompleteTime: start.Unix()},
				{UserId: 3, TradeNo: "other-user", Amount: 100, Money: 100, Status: common.TopUpStatusSuccess, CompleteTime: start.Unix()},
			}
			require.NoError(t, db.Create(&topups).Error)

			t.Run("monthly_user_scope_and_utc_boundaries", func(t *testing.T) {
				recorder := httptest.NewRecorder()
				ctx, _ := gin.CreateTestContext(recorder)
				ctx.Set("id", 1)
				ctx.Request = httptest.NewRequest(http.MethodGet, "/?month=2026-01&user_id=3", nil)
				GetMonthlyWalletReport(ctx)
				var payload struct {
					Success bool                      `json:"success"`
					Data    model.MonthlyWalletReport `json:"data"`
				}
				require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &payload))
				require.True(t, payload.Success)
				assert.Equal(t, model.MonthlyUsageTotals{Quota: 370, Count: 6, TokenUsed: 110}, payload.Data.Summary)
				require.Len(t, payload.Data.Rows, 2)
				assert.Equal(t, "default", payload.Data.Rows[0].UseGroup)
				assert.Equal(t, "primary", payload.Data.Rows[0].TokenName)
				assert.Empty(t, payload.Data.Rows[1].TokenName)
				assert.Equal(t, start.Unix(), payload.Data.WindowStart)
				assert.Equal(t, end.Unix(), payload.Data.WindowEnd)
				assert.EqualValues(t, 3, payload.Data.CompletedTopups)
				assert.NotContains(t, recorder.Body.String(), "private-model")
				assert.NotContains(t, recorder.Body.String(), "money")
				assert.NotContains(t, recorder.Body.String(), "topup_credits")
			})

			t.Run("disabled_collection_preserves_recorded_usage", func(t *testing.T) {
				previous := common.DataExportEnabled
				common.DataExportEnabled = false
				t.Cleanup(func() { common.DataExportEnabled = previous })
				report, err := model.GetMonthlyWalletReport(1, start)
				require.NoError(t, err)
				assert.False(t, report.CollectionEnabled)
				assert.EqualValues(t, 370, report.Summary.Quota)
				report, err = model.GetMonthlyWalletReport(1, start.AddDate(0, -1, 0))
				require.NoError(t, err)
				assert.Empty(t, report.Rows)
				assert.Zero(t, report.Summary.Quota)
			})

			t.Run("referral_award_is_idempotent_and_private", func(t *testing.T) {
				awarded, err := model.AwardAffiliateRegistrationReward(1, 2, 100)
				require.NoError(t, err)
				assert.True(t, awarded)
				awarded, err = model.AwardAffiliateRegistrationReward(1, 2, 100)
				require.NoError(t, err)
				assert.False(t, awarded)
				var owner model.User
				require.NoError(t, db.First(&owner, 1).Error)
				assert.Equal(t, 120, owner.AffQuota)
				assert.Equal(t, 150, owner.AffHistoryQuota)
				assert.Equal(t, 3, owner.AffCount)
				recorder := httptest.NewRecorder()
				ctx, _ := gin.CreateTestContext(recorder)
				ctx.Set("id", 1)
				ctx.Request = httptest.NewRequest(http.MethodGet, "/?p=999999&page_size=-1&user_id=3", nil)
				GetAffiliateRewards(ctx)
				var payload struct {
					Success bool `json:"success"`
					Data    struct {
						Page, PageSize, Total int
						Items                 []model.AffiliateReward
					} `json:"data"`
				}
				require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &payload))
				require.True(t, payload.Success)
				assert.Equal(t, 1, payload.Data.Page)
				assert.Equal(t, 1, payload.Data.Total)
				require.Len(t, payload.Data.Items, 1)
				assert.Equal(t, 100, payload.Data.Items[0].Quota)
				assert.NotContains(t, recorder.Body.String(), "invited_user_id")
				assert.NotContains(t, recorder.Body.String(), "user_id")
				page := &common.PageInfo{Page: 1, PageSize: 10}
				rows, total, err := model.GetAffiliateRewards(3, page)
				require.NoError(t, err)
				assert.Zero(t, total)
				assert.Empty(t, rows)
			})

			if tc.kind == "mysql" {
				t.Run("mysql_found_rows_does_not_repeat_awards", func(t *testing.T) {
					config, err := sqlmysql.ParseDSN(dsn)
					require.NoError(t, err)
					config.ClientFoundRows = true
					foundDB, err := gorm.Open(mysql.Open(config.FormatDSN()), &gorm.Config{NamingStrategy: schema.NamingStrategy{TablePrefix: "wallet_report_test_"}})
					require.NoError(t, err)
					foundSQL, err := foundDB.DB()
					require.NoError(t, err)
					defer foundSQL.Close()
					previous := model.DB
					model.DB = foundDB
					defer func() { model.DB = previous }()
					awarded, err := model.AwardAffiliateRegistrationReward(1, 2, 100)
					require.NoError(t, err)
					assert.False(t, awarded)
					var owner model.User
					require.NoError(t, foundDB.First(&owner, 1).Error)
					assert.Equal(t, 120, owner.AffQuota)
					assert.Equal(t, 150, owner.AffHistoryQuota)
					assert.Equal(t, 3, owner.AffCount)
				})
			}

			t.Run("invalid_or_failed_rewards_do_not_create_history", func(t *testing.T) {
				for _, values := range [][3]int{{1, 1, 100}, {1, 3, 100}, {1, 2, -1}, {1, 2, common.MaxWalletQuota + 1}} {
					awarded, err := model.AwardAffiliateRegistrationReward(values[0], values[1], values[2])
					assert.Error(t, err)
					assert.False(t, awarded)
				}
				invited := model.User{Id: 4, Username: "rollback-invitee", Password: "unused-test-hash", AffCode: "ref-4", InviterId: 1}
				require.NoError(t, db.Create(&invited).Error)
				require.NoError(t, db.Model(&model.User{}).Where("id = ?", 1).Update("aff_count", 2147483647).Error)
				awarded, err := model.AwardAffiliateRegistrationReward(1, 4, 100)
				assert.Error(t, err)
				assert.False(t, awarded)
				var total int64
				require.NoError(t, db.Model(&model.AffiliateReward{}).Where("invited_user_id = ?", 4).Count(&total).Error)
				assert.Zero(t, total)
				var owner model.User
				require.NoError(t, db.First(&owner, 1).Error)
				assert.Equal(t, 120, owner.AffQuota)
			})
		})
	}
}

func TestMonthlyWalletReportRejectsInvalidMonth(t *testing.T) {
	for _, month := range []string{"not-a-month", "2026-13", "1999-12", "9999-01", "2026-01-01"} {
		t.Run(month, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			ctx, _ := gin.CreateTestContext(recorder)
			ctx.Set("id", 1)
			ctx.Request = httptest.NewRequest(http.MethodGet, fmt.Sprintf("/?month=%s", month), nil)
			GetMonthlyWalletReport(ctx)
			var payload struct {
				Success bool `json:"success"`
			}
			require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &payload))
			assert.False(t, payload.Success)
		})
	}
}
