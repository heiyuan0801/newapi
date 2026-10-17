package controller

import (
	"bytes"
	"context"
	"encoding/csv"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
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
			var logDriver gorm.Dialector = sqlite.Open(t.TempDir() + "/wallet-report-logs.db")
			if tc.kind == "mysql" {
				driver = mysql.Open(dsn)
				logDriver = mysql.Open(dsn)
			}
			if tc.kind == "postgres" {
				driver = postgres.Open(dsn)
				logDriver = postgres.Open(dsn)
			}
			db, err := gorm.Open(driver, &gorm.Config{NamingStrategy: schema.NamingStrategy{TablePrefix: "wallet_report_test_"}})
			require.NoError(t, err)
			sqlDB, err := db.DB()
			require.NoError(t, err)
			sqlDB.SetMaxOpenConns(1)
			logDB, err := gorm.Open(logDriver, &gorm.Config{NamingStrategy: schema.NamingStrategy{TablePrefix: "wallet_report_log_test_"}})
			require.NoError(t, err)
			logSQL, err := logDB.DB()
			require.NoError(t, err)
			logSQL.SetMaxOpenConns(1)
			useLogExportDatabases(t, db, logDB, tc.typ, tc.typ)
			tables := []any{&model.User{}, &model.Token{}, &model.TopUp{}, &model.QuotaData{}, &model.AffiliateReward{}, &model.Redemption{}}
			require.NoError(t, db.Migrator().DropTable(tables...))
			require.NoError(t, db.AutoMigrate(tables...))
			require.NoError(t, logDB.Migrator().DropTable(&model.Log{}))
			require.NoError(t, logDB.AutoMigrate(&model.Log{}))
			t.Cleanup(func() { require.NoError(t, db.Migrator().DropTable(tables...)); require.NoError(t, sqlDB.Close()) })
			t.Cleanup(func() {
				require.NoError(t, logDB.Migrator().DropTable(&model.Log{}))
				require.NoError(t, logSQL.Close())
			})
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
			require.NoError(t, db.Create(&model.Token{Id: 12, UserId: 3, Key: "unrelated-wallet-test-only", Name: "other-secret-token"}).Error)
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

			t.Run("reconciliation_matches_sources_without_claiming_a_wallet_ledger", func(t *testing.T) {
				logs := []model.Log{
					{UserId: 1, CreatedAt: start.Unix(), Type: model.LogTypeConsume, Quota: 300, RequestId: "charge-1", ModelName: "model-a", Other: `{"billing_source":"wallet","task_id":"task-a","admin_info":{"secret":"never-expose"}}`},
					{UserId: 1, CreatedAt: start.Unix() + 1, Type: model.LogTypeConsume, Quota: 100, RequestId: "charge-2", ModelName: "model-b", Other: `{"billing_source":"subscription"}`},
					{UserId: 1, CreatedAt: start.Unix() + 1, Type: model.LogTypeRefund, Quota: 25, RequestId: "refund-1", Content: "task-guessed-from-private-text", Other: `{"task_id":"task-a","billing_source":"wallet"}`},
					{UserId: 3, CreatedAt: start.Unix(), Type: model.LogTypeConsume, Quota: 9999, RequestId: "other-private-request", ModelName: "private-model"},
				}
				require.NoError(t, logDB.Create(&logs).Error)
				legacy := model.Log{UserId: 1, CreatedAt: start.Unix(), Type: model.LogTypeConsume, Quota: 7, ModelName: "legacy-unlinked-model"}
				require.NoError(t, logDB.Create(&legacy).Error)
				require.NoError(t, logDB.Model(&model.Log{}).Where("id = ?", legacy.Id).Update("id", 0).Error)
				code := model.Redemption{Key: "used-test-code-not-exposed", Name: "private-code-name", Status: common.RedemptionCodeStatusUsed, UsedUserId: 1, RedeemedTime: start.Unix() + 1, Quota: 30}
				require.NoError(t, db.Create(&code).Error)
				require.NoError(t, db.Delete(&code).Error)
				reward := model.AffiliateReward{UserId: 1, InvitedUserId: 999, Quota: 15, CreatedAt: start.Unix()}
				require.NoError(t, db.Create(&reward).Error)
				t.Cleanup(func() { require.NoError(t, db.Delete(&reward).Error) })
				var before model.User
				require.NoError(t, db.First(&before, 1).Error)
				report, err := model.GetWalletReconciliation(context.Background(), 1, start, "all", "", 2)
				require.NoError(t, err)
				assert.Equal(t, model.WalletReconciliationSummary{ConsumeQuota: 407, RefundQuota: 25, NetLogQuota: 382, CollectedQuota: 370, CollectionDifference: -37, CompletedTopups: 3, RedemptionQuota: 30, RewardQuota: 15}, report.Summary)
				assert.False(t, report.Coverage.CompleteLedger)
				assert.Contains(t, report.Coverage.Limitations, "historical_topup_credit_unknown")
				assert.Contains(t, report.Coverage.Limitations, "non_atomic_cross_database_snapshot")
				assert.EqualValues(t, 1, report.Coverage.UnlinkedLogEvents)
				assert.Contains(t, report.Coverage.Limitations, "legacy_log_events_without_identifiers")
				assert.EqualValues(t, 8, report.Total)
				var events []model.WalletReconciliationEvent
				for {
					events = append(events, report.Events...)
					if !report.HasMore {
						break
					}
					require.NotEmpty(t, report.NextCursor)
					report, err = model.GetWalletReconciliation(context.Background(), 1, start, "all", report.NextCursor, 2)
					require.NoError(t, err)
					require.LessOrEqual(t, len(events), 8, "cursor must make progress")
				}
				require.Len(t, events, 8)
				identities := make(map[string]bool)
				for _, event := range events {
					identity := fmt.Sprintf("%s:%d:%s", event.Source, event.ID, event.RequestID)
					assert.False(t, identities[identity], "duplicate event %s", identity)
					identities[identity] = true
					if event.Source == "topup" {
						assert.Nil(t, event.Quota, "legacy order units must not be guessed")
						assert.Equal(t, "unknown", event.BillingSource, "a payment record alone cannot prove a wallet credit")
					}
					if event.Source == "refund" {
						assert.Equal(t, "task-a", event.TaskID)
					}
				}
				assert.Equal(t, "charge-2", events[0].RequestID)
				assert.Equal(t, "refund", events[1].Source)
				assert.Equal(t, "redemption", events[2].Source)
				assert.Equal(t, "charge-1", events[3].RequestID)
				recorder := httptest.NewRecorder()
				ctx, _ := gin.CreateTestContext(recorder)
				ctx.Set("id", 1)
				ctx.Request = httptest.NewRequest(http.MethodGet, "/?month=2026-01&source=all&page_size=100&user_id=3", nil)
				GetWalletReconciliation(ctx)
				assert.Contains(t, recorder.Body.String(), `"success":true`)
				for _, private := range []string{"other-private-request", "private-model", "legacy-unlinked-model", "never-expose", "admin_info", "used-test-code-not-exposed", "private-code-name", "task-guessed-from-private-text", "invited_user_id"} {
					assert.NotContains(t, recorder.Body.String(), private)
				}
				var after model.User
				require.NoError(t, db.First(&after, 1).Error)
				assert.Equal(t, before.Quota, after.Quota)
				assert.Equal(t, before.AffQuota, after.AffQuota)
				first, err := model.GetWalletReconciliation(context.Background(), 1, start, "consume", "", 1)
				require.NoError(t, err)
				assert.EqualValues(t, 2, first.Total)
				_, err = model.GetWalletReconciliation(context.Background(), 1, start, "refund", first.NextCursor, 1)
				assert.ErrorIs(t, err, model.ErrInvalidReconciliationCursor)
				_, err = model.GetWalletReconciliation(context.Background(), 1, start.AddDate(0, 1, 0), "consume", first.NextCursor, 1)
				assert.ErrorIs(t, err, model.ErrInvalidReconciliationCursor)
			})

			t.Run("large_monthly_report_is_paged_and_exported_without_truncation", func(t *testing.T) {
				exportDir := t.TempDir()
				t.Setenv("TMPDIR", exportDir)
				const combinations = 5005
				rows := make([]model.QuotaData, combinations)
				for i := range rows {
					name := fmt.Sprintf("bulk-%04d", i)
					if i == 0 {
						name = " =SUM(1,1)"
					}
					rows[i] = model.QuotaData{UserID: 1, CreatedAt: start.Unix(), ModelName: name, UseGroup: "default", TokenID: 11, Quota: 1, Count: 1, TokenUsed: 2}
				}
				require.NoError(t, db.CreateInBatches(rows, 100).Error)
				require.NoError(t, db.Model(&model.Token{}).Where("id = ?", 11).Update("name", "@malicious-token-formula").Error)
				report, err := model.GetMonthlyWalletReportPage(context.Background(), 1, start, 51, 100)
				require.NoError(t, err)
				assert.EqualValues(t, combinations+2, report.Total)
				assert.EqualValues(t, 51, report.PageCount)
				assert.Equal(t, 51, report.Page)
				require.Len(t, report.Rows, 7)
				assert.False(t, report.Truncated)
				assert.EqualValues(t, combinations+370, report.Summary.Quota)
				recorder := httptest.NewRecorder()
				ctx, _ := gin.CreateTestContext(recorder)
				ctx.Set("id", 1)
				ctx.Request = httptest.NewRequest(http.MethodGet, "/?month=2026-01&user_id=3", nil)
				ExportMonthlyWalletReport(ctx)
				assert.Equal(t, "text/csv; charset=utf-8", recorder.Header().Get("Content-Type"))
				assert.Equal(t, "complete", recorder.Header().Get("X-Export-Status"))
				assert.Equal(t, fmt.Sprint(recorder.Body.Len()), recorder.Header().Get("Content-Length"))
				files, err := os.ReadDir(exportDir)
				require.NoError(t, err)
				assert.Empty(t, files, "completed exports must remove their private temporary file")
				csvRows, err := csv.NewReader(strings.NewReader(strings.TrimPrefix(recorder.Body.String(), "\xef\xbb\xbf"))).ReadAll()
				require.NoError(t, err)
				require.Len(t, csvRows, combinations+3)
				assert.Equal(t, []string{"month_utc", "model", "group", "token_id", "token_name", "requests", "tokens", "quota_units", "source", "report_type"}, csvRows[0])
				// Text collations can order the formula model differently across
				// databases, so verify every exported identity and value by content.
				const escapedFormulaModel = "' =SUM(1,1)"
				const escapedFormulaToken = "'@malicious-token-formula"
				expectedRows := map[[3]string][]string{
					{"model-a", "default", "11"}: {"2026-01", "model-a", "default", "11", escapedFormulaToken, "5", "90", "300", "quota_data", "collected_usage_not_settlement_ledger"},
					{"model-a", "vip", "12"}:     {"2026-01", "model-a", "vip", "12", "", "1", "20", "70", "quota_data", "collected_usage_not_settlement_ledger"},
				}
				for i := range combinations {
					name := fmt.Sprintf("bulk-%04d", i)
					if i == 0 {
						name = escapedFormulaModel
					}
					expectedRows[[3]string{name, "default", "11"}] = []string{"2026-01", name, "default", "11", escapedFormulaToken, "1", "2", "1", "quota_data", "collected_usage_not_settlement_ledger"}
				}
				seenRows := make(map[[3]string]bool, len(expectedRows))
				formulaRows := 0
				for _, row := range csvRows[1:] {
					require.Len(t, row, 10)
					identity := [3]string{row[1], row[2], row[3]}
					expected, exists := expectedRows[identity]
					require.True(t, exists, "unexpected exported identity %q", identity)
					assert.False(t, seenRows[identity], "duplicate exported identity %q", identity)
					seenRows[identity] = true
					assert.Equal(t, expected, row)
					if row[1] == escapedFormulaModel {
						formulaRows++
					}
				}
				assert.Len(t, seenRows, len(expectedRows), "every expected identity must be exported exactly once")
				assert.Equal(t, 1, formulaRows, "the neutralized formula model must appear exactly once")
				assert.NotContains(t, recorder.Body.String(), "private-model")
				assert.NotContains(t, recorder.Body.String(), "other-secret-token")
				cancelled, cancel := context.WithCancel(context.Background())
				cancel()
				_, err = model.GetMonthlyWalletReportPage(cancelled, 1, start, 1, 100)
				assert.ErrorIs(t, err, context.Canceled)
				recorder = httptest.NewRecorder()
				ctx, _ = gin.CreateTestContext(recorder)
				ctx.Set("id", 1)
				ctx.Request = httptest.NewRequest(http.MethodGet, "/?month=2026-01", nil).WithContext(cancelled)
				ExportMonthlyWalletReport(ctx)
				assert.Contains(t, recorder.Body.String(), `"success":false`)
				assert.NotContains(t, recorder.Header().Get("Content-Type"), "text/csv")
				files, err = os.ReadDir(exportDir)
				require.NoError(t, err)
				assert.Empty(t, files)
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

func TestMonthlyWalletExportGuards(t *testing.T) {
	t.Run("bounded_output_never_writes_past_the_limit", func(t *testing.T) {
		var output bytes.Buffer
		writer := &boundedMonthlyExportWriter{writer: &output, remaining: 4}
		n, err := writer.Write([]byte("1234"))
		require.NoError(t, err)
		assert.Equal(t, 4, n)
		n, err = writer.Write([]byte("5"))
		assert.ErrorIs(t, err, errMonthlyExportTooLarge)
		assert.Zero(t, n)
		assert.Equal(t, "1234", output.String())
	})
	t.Run("formula_prefixes_are_neutralized", func(t *testing.T) {
		for _, value := range []string{"=1+1", " +SUM(1,1)", "-1+1", "@formula", "\ttext", "\rtext", "\ntext"} {
			assert.Equal(t, "'"+value, walletCSVText(value))
		}
		assert.Equal(t, "normal model-name", walletCSVText("normal model-name"))
	})
	t.Run("concurrent_export_limit_returns_an_error_without_a_csv", func(t *testing.T) {
		for range cap(monthlyExportSlots) {
			monthlyExportSlots <- struct{}{}
		}
		t.Cleanup(func() {
			for range cap(monthlyExportSlots) {
				<-monthlyExportSlots
			}
		})
		recorder := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(recorder)
		ctx.Set("id", 1)
		ctx.Request = httptest.NewRequest(http.MethodGet, "/?month=2026-01", nil)
		ExportMonthlyWalletReport(ctx)
		assert.Contains(t, recorder.Body.String(), `"success":false`)
		assert.NotContains(t, recorder.Header().Get("Content-Type"), "text/csv")
	})
}

func TestWalletReconciliationRejectsInvalidFilters(t *testing.T) {
	for _, query := range []string{"source=invalid", "source=all&cursor=not-base64!", "source=all&cursor=" + strings.Repeat("a", 1025)} {
		t.Run(query[:min(40, len(query))], func(t *testing.T) {
			recorder := httptest.NewRecorder()
			ctx, _ := gin.CreateTestContext(recorder)
			ctx.Set("id", 1)
			ctx.Request = httptest.NewRequest(http.MethodGet, "/?month=2026-01&"+query, nil)
			GetWalletReconciliation(ctx)
			assert.Contains(t, recorder.Body.String(), `"success":false`)
		})
	}
}
