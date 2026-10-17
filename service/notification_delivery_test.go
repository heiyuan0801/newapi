package service

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/setting/availability_setting"
	"github.com/QuantumNous/new-api/setting/config"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/schema"
)

func notificationDeliveryDatabase(t *testing.T, dialect string) *gorm.DB {
	t.Helper()
	var driver gorm.Dialector = sqlite.Open(":memory:")
	dbType := common.DatabaseTypeSQLite
	if dialect == "mysql" {
		dsn := os.Getenv("TEST_MYSQL_DSN")
		if dsn == "" {
			t.Skip("isolated MySQL DSN is not configured")
		}
		driver, dbType = mysql.Open(dsn), common.DatabaseTypeMySQL
	} else if dialect == "postgres" {
		dsn := os.Getenv("TEST_POSTGRES_DSN")
		if dsn == "" {
			t.Skip("isolated PostgreSQL DSN is not configured")
		}
		driver, dbType = postgres.Open(dsn), common.DatabaseTypePostgreSQL
	}
	db, err := gorm.Open(driver, &gorm.Config{NamingStrategy: schema.NamingStrategy{TablePrefix: "notification_delivery_test_"}})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	oldDB, oldType, oldRedis := model.DB, common.MainDatabaseType(), common.RedisEnabled
	model.DB, common.RedisEnabled = db, false
	common.SetMainDatabaseType(dbType)
	tables := []any{&model.User{}, &model.AvailabilityIncident{}, &model.NotificationDelivery{}}
	require.NoError(t, db.Migrator().DropTable(tables...))
	require.NoError(t, db.AutoMigrate(tables...))
	require.NoError(t, db.AutoMigrate(tables...))
	t.Cleanup(func() {
		require.NoError(t, db.Migrator().DropTable(tables...))
		model.DB, common.RedisEnabled = oldDB, oldRedis
		common.SetMainDatabaseType(oldType)
		require.NoError(t, sqlDB.Close())
	})
	return db
}

func TestNotificationDeliveryDatabaseMatrix(t *testing.T) {
	require.NoError(t, i18n.Init())
	for _, dialect := range []string{"sqlite", "mysql", "postgres"} {
		t.Run(dialect, func(t *testing.T) {
			db := notificationDeliveryDatabase(t, dialect)
			ctx := context.Background()
			now := time.Now().Unix()
			calls, responseStatus := 0, http.StatusNoContent
			var received WebhookPayload
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls++
				body, err := io.ReadAll(r.Body)
				require.NoError(t, err)
				require.NoError(t, common.Unmarshal(body, &received))
				assert.Equal(t, generateSignature("test-only-webhook-secret", body), r.Header.Get("X-Webhook-Signature"))
				w.WriteHeader(responseStatus)
				_, _ = w.Write([]byte("private-provider-error api_key=DO-NOT-STORE"))
			}))
			t.Cleanup(server.Close)
			oldClient, oldWorker, oldLimit := httpClient, system_setting.WorkerUrl, constant.NotifyLimitCount
			fetch, oldAvailability := system_setting.GetFetchSetting(), availability_setting.Get()
			oldFetch := *fetch
			httpClient, system_setting.WorkerUrl, constant.NotifyLimitCount = server.Client(), "", 100
			fetch.EnableSSRFProtection = false
			t.Cleanup(func() {
				httpClient, system_setting.WorkerUrl, constant.NotifyLimitCount = oldClient, oldWorker, oldLimit
				*fetch = oldFetch
				oldValues, err := config.ConfigToMap(oldAvailability)
				require.NoError(t, err)
				common.OptionMapRWMutex.Lock()
				defer common.OptionMapRWMutex.Unlock()
				require.NoError(t, config.UpdateConfigFromMap(config.GlobalConfig.Get("availability_setting"), oldValues))
			})
			setting, err := common.Marshal(dto.UserSetting{NotifyType: dto.NotifyTypeWebhook, WebhookUrl: server.URL, WebhookSecret: "test-only-webhook-secret", Language: "en"})
			require.NoError(t, err)
			root := model.User{Username: "notification-fixture-root", AffCode: "notify-root", Role: common.RoleRootUser, Status: common.UserStatusEnabled, Setting: string(setting)}
			require.NoError(t, db.Create(&root).Error)
			missing := model.User{Username: "notification-fixture-missing", AffCode: "notify-missing", Status: common.UserStatusEnabled, Setting: `{"notify_type":"webhook"}`}
			require.NoError(t, db.Create(&missing).Error)

			t.Run("transaction intent and idempotency", func(t *testing.T) {
				err := db.Transaction(func(tx *gorm.DB) error {
					_, err := model.EnqueueNotificationDeliveryTx(tx, model.NotificationDeliveryDraft{EventKey: "rolled-back", Kind: "test", RecipientID: root.Id}, now)
					require.NoError(t, err)
					return errors.New("rollback business event")
				})
				require.Error(t, err)
				var count int64
				require.NoError(t, db.Model(&model.NotificationDelivery{}).Where("event_key = ?", "rolled-back").Count(&count).Error)
				assert.Zero(t, count)
				first, err := EnqueueNotificationTest(ctx, root.Id, now)
				require.NoError(t, err)
				duplicate, err := EnqueueNotificationTest(ctx, root.Id, now)
				require.NoError(t, err)
				assert.Equal(t, first.ID, duplicate.ID)
				processed, err := ProcessNotificationDeliveries(ctx, 20)
				require.NoError(t, err)
				assert.Equal(t, 1, processed)
				require.NoError(t, db.First(first, first.ID).Error)
				assert.Equal(t, "sent", first.Status)
				assert.Equal(t, 1, first.Attempts)
				assert.NotZero(t, first.SentAt)
				before := calls
				processed, err = ProcessNotificationDeliveries(ctx, 20)
				require.NoError(t, err)
				assert.Zero(t, processed)
				assert.Equal(t, before, calls)
			})

			t.Run("failed provider retries are bounded and redacted", func(t *testing.T) {
				responseStatus = http.StatusBadGateway
				defer func() { responseStatus = http.StatusNoContent }()
				item, err := model.EnqueueNotificationDelivery(ctx, model.NotificationDeliveryDraft{EventKey: "retry-fixture", Kind: "support_ticket_reply", RecipientID: root.Id, TicketID: 17}, now)
				require.NoError(t, err)
				before := calls
				for attempt := 1; attempt <= 4; attempt++ {
					processed, err := ProcessNotificationDeliveries(ctx, 1)
					require.NoError(t, err)
					assert.Equal(t, 1, processed)
					require.NoError(t, db.First(item, item.ID).Error)
					assert.Equal(t, attempt, item.Attempts)
					assert.Equal(t, "delivery_failed", item.LastErrorCode)
					assert.Zero(t, item.SentAt)
					if attempt < 4 {
						assert.Equal(t, "retry", item.Status)
						assert.Greater(t, item.NextAttemptAt, now)
						// Simulate the next scheduled time without sleeping.
						require.NoError(t, db.Model(item).Update("next_attempt_at", now-1).Error)
					} else {
						assert.Equal(t, "failed", item.Status)
					}
				}
				assert.Equal(t, before+4, calls)
				processed, err := ProcessNotificationDeliveries(ctx, 1)
				require.NoError(t, err)
				assert.Zero(t, processed)
				assert.Contains(t, received.Content, "/support-tickets?ticket=17")
				records, _, err := model.ListNotificationDeliveries(ctx, model.NotificationDeliveryFilter{Page: 1, PageSize: 100})
				require.NoError(t, err)
				projection, err := common.Marshal(records)
				require.NoError(t, err)
				for _, secret := range []string{"DO-NOT-STORE", "test-only-webhook-secret", server.URL, "private-provider-error", "payload", "lease_token"} {
					assert.NotContains(t, string(projection), secret)
				}
			})

			t.Run("unconfigured destination is a permanent failure", func(t *testing.T) {
				item, err := model.EnqueueNotificationDelivery(ctx, model.NotificationDeliveryDraft{EventKey: "missing-fixture", Kind: "test", RecipientID: missing.Id}, now)
				require.NoError(t, err)
				before := calls
				_, err = ProcessNotificationDeliveries(ctx, 1)
				require.NoError(t, err)
				require.NoError(t, db.First(item, item.ID).Error)
				assert.Equal(t, "failed", item.Status)
				assert.Equal(t, "destination_missing", item.LastErrorCode)
				assert.Zero(t, item.SentAt)
				assert.Equal(t, before, calls)
			})

			t.Run("restart lease excludes concurrent sender and expires", func(t *testing.T) {
				item, err := model.EnqueueNotificationDelivery(ctx, model.NotificationDeliveryDraft{EventKey: "lease-fixture", Kind: "test", RecipientID: root.Id}, now)
				require.NoError(t, err)
				first, err := model.ClaimNotificationDelivery(ctx, now)
				require.NoError(t, err)
				require.NotNil(t, first)
				assert.Equal(t, item.ID, first.ID)
				second, err := model.ClaimNotificationDelivery(ctx, now)
				require.NoError(t, err)
				assert.Nil(t, second)
				assert.Greater(t, first.LeaseUntil-now, int64(40))
				recovered, err := model.ClaimNotificationDelivery(ctx, first.LeaseUntil+1)
				require.NoError(t, err)
				require.NotNil(t, recovered)
				assert.Equal(t, 2, recovered.Attempts)
				assert.NotEqual(t, first.LeaseToken, recovered.LeaseToken)
				require.Error(t, model.FinishNotificationDelivery(ctx, first, "sent", "", "webhook", now))
				require.NoError(t, model.FinishNotificationDelivery(ctx, recovered, "sent", "", "webhook", now))
			})

			t.Run("two workers claim one event once", func(t *testing.T) {
				item, err := model.EnqueueNotificationDelivery(ctx, model.NotificationDeliveryDraft{EventKey: "concurrent-fixture", Kind: "test", RecipientID: root.Id}, now)
				require.NoError(t, err)
				sqlDB, err := db.DB()
				require.NoError(t, err)
				if dialect != "sqlite" {
					sqlDB.SetMaxOpenConns(2)
					defer sqlDB.SetMaxOpenConns(1)
				}
				type result struct {
					item *model.NotificationDelivery
					err  error
				}
				results := make(chan result, 2)
				start := make(chan struct{})
				var workers sync.WaitGroup
				for range 2 {
					workers.Go(func() {
						<-start
						claimed, err := model.ClaimNotificationDelivery(ctx, now)
						results <- result{claimed, err}
					})
				}
				close(start)
				workers.Wait()
				close(results)
				claimedCount := 0
				for result := range results {
					require.NoError(t, result.err)
					if result.item != nil {
						claimedCount++
						assert.Equal(t, item.ID, result.item.ID)
						require.NoError(t, model.FinishNotificationDelivery(ctx, result.item, "sent", "", "webhook", now))
					}
				}
				assert.Equal(t, 1, claimedCount)
			})

			t.Run("incident and intent commit together and respect opt out", func(t *testing.T) {
				common.OptionMapRWMutex.Lock()
				require.NoError(t, config.UpdateConfigFromMap(config.GlobalConfig.Get("availability_setting"), map[string]string{"alerts_enabled": "true", "silence_until": "0"}))
				common.OptionMapRWMutex.Unlock()
				observation := model.AvailabilityObservation{Model: "notification-model", Group: "default", Source: "probe", StartedAt: now, ObservedAt: now, Valid: true, SuccessRate: 0}
				policy := model.AvailabilityAlertPolicy{SuccessRateThreshold: 95, FailureThreshold: 1, RecoveryThreshold: 1}
				notification, err := model.ApplyAvailabilityObservation(ctx, observation, policy, now)
				require.NoError(t, err)
				require.NotNil(t, notification)
				var delivery model.NotificationDelivery
				require.NoError(t, db.Where("incident_id = ?", notification.Incident.ID).Take(&delivery).Error)
				assert.Equal(t, "pending", delivery.Status)
				common.OptionMapRWMutex.Lock()
				require.NoError(t, config.UpdateConfigFromMap(config.GlobalConfig.Get("availability_setting"), map[string]string{"alerts_enabled": "false"}))
				common.OptionMapRWMutex.Unlock()
				before := calls
				_, err = ProcessNotificationDeliveries(ctx, 1)
				require.NoError(t, err)
				require.NoError(t, db.First(&delivery, delivery.ID).Error)
				assert.Equal(t, "cancelled", delivery.Status)
				assert.Equal(t, "alerts_disabled", delivery.LastErrorCode)
				assert.Equal(t, before, calls)
				incidents, _, err := model.ListAvailabilityIncidents(ctx, model.AvailabilityIncidentFilter{Page: 1, PageSize: 20}, []model.AvailabilityPair{{Model: observation.Model, Group: observation.Group}})
				require.NoError(t, err)
				require.Len(t, incidents, 1)
				assert.Equal(t, "open", incidents[0].Status)
				assert.Equal(t, "cancelled", incidents[0].NotificationStatus)
				assert.Equal(t, "not_requested", incidents[0].RecoveryNotificationStatus)
			})

			t.Run("cancelled recipient query cannot send after the attempt ends", func(t *testing.T) {
				item, err := model.EnqueueNotificationDelivery(ctx, model.NotificationDeliveryDraft{EventKey: "cancelled-query-fixture", Kind: "test", RecipientID: root.Id}, now)
				require.NoError(t, err)
				queryStarted := make(chan time.Time, 1)
				require.NoError(t, db.Callback().Query().Before("gorm:query").Register("notification_test_wait_for_cancel", func(tx *gorm.DB) {
					if tx.Statement.Table != "notification_delivery_test_users" {
						return
					}
					deadline, _ := tx.Statement.Context.Deadline()
					queryStarted <- deadline
					<-tx.Statement.Context.Done()
					tx.AddError(tx.Statement.Context.Err())
				}))
				defer db.Callback().Query().Remove("notification_test_wait_for_cancel")
				attemptCtx, cancel := context.WithCancel(ctx)
				defer cancel()
				type outcome struct {
					processed int
					err       error
				}
				finished := make(chan outcome, 1)
				before := calls
				go func() {
					processed, err := ProcessNotificationDeliveries(attemptCtx, 1)
					finished <- outcome{processed, err}
				}()
				select {
				case deadline := <-queryStarted:
					cancel()
					assert.False(t, deadline.IsZero(), "recipient reads must share the bounded attempt deadline")
					assert.Less(t, deadline.Unix(), now+180, "the attempt must expire before another worker can reclaim the row")
				case <-time.After(2 * time.Second):
					t.Fatal("recipient query was not reached")
				}
				select {
				case result := <-finished:
					require.NoError(t, result.err)
					assert.Equal(t, 1, result.processed)
				case <-time.After(2 * time.Second):
					t.Fatal("cancelled notification attempt did not finish")
				}
				assert.Equal(t, before, calls)
				require.NoError(t, db.First(item, item.ID).Error)
				assert.Equal(t, "retry", item.Status)
				assert.Zero(t, item.SentAt)
			})

			t.Run("retention removes completed records while preserving pending work", func(t *testing.T) {
				old := now - 31*86400
				pending, err := model.EnqueueNotificationDelivery(ctx, model.NotificationDeliveryDraft{EventKey: "old-pending-fixture", Kind: "test", RecipientID: root.Id}, old)
				require.NoError(t, err)
				require.NoError(t, db.Model(&model.NotificationDelivery{}).Where("status IN ?", []string{"sent", "failed", "cancelled"}).Update("created_at", old).Error)
				require.NoError(t, model.CleanupNotificationDeliveries(ctx, now-30*86400))
				var completed int64
				require.NoError(t, db.Model(&model.NotificationDelivery{}).Where("status IN ?", []string{"sent", "failed", "cancelled"}).Count(&completed).Error)
				assert.Zero(t, completed)
				require.NoError(t, db.First(pending, pending.ID).Error)
				assert.Equal(t, "pending", pending.Status)
			})
			var version string
			query := "SELECT version()"
			if dialect == "sqlite" {
				query = "SELECT sqlite_version()"
			}
			require.NoError(t, db.Raw(query).Scan(&version).Error)
			t.Logf("notification delivery database version: %s", version)
		})
	}
}

func TestNotificationHTTPTransportHonorsCancellation(t *testing.T) {
	oldClient, oldWorker := httpClient, system_setting.WorkerUrl
	fetch := system_setting.GetFetchSetting()
	oldFetch := *fetch
	t.Cleanup(func() { httpClient, system_setting.WorkerUrl, *fetch = oldClient, oldWorker, oldFetch })
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { t.Error("cancelled request reached provider") }))
	t.Cleanup(server.Close)
	httpClient, system_setting.WorkerUrl = server.Client(), ""
	fetch.EnableSSRFProtection = false
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	for _, method := range []string{"webhook", "bark", "gotify"} {
		t.Run(method, func(t *testing.T) {
			var err error
			switch method {
			case "webhook":
				err = sendWebhookNotifyWithContext(ctx, server.URL, "fixture-secret", dto.Notify{})
			case "bark":
				err = sendBarkNotifyWithContext(ctx, server.URL, dto.Notify{})
			case "gotify":
				err = sendGotifyNotifyWithContext(ctx, server.URL, "fixture-secret", 5, dto.Notify{})
			}
			require.Error(t, err)
			assert.True(t, strings.Contains(fmt.Sprint(err), "context canceled"))
		})
	}
}
