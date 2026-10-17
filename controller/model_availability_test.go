package controller

import (
	"context"
	"fmt"
	"io"
	"maps"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/availability_setting"
	"github.com/QuantumNous/new-api/setting/config"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/schema"
)

func availabilityTestDB(t *testing.T, dialect string, matrix bool) *gorm.DB {
	t.Helper()
	var dialector gorm.Dialector = sqlite.Open(":memory:")
	if dialect == "mysql" {
		dsn := os.Getenv("TEST_MYSQL_DSN")
		if dsn == "" {
			t.Skip("isolated MySQL DSN is not configured")
		}
		dialector = mysql.Open(dsn)
	}
	if dialect == "postgres" {
		dsn := os.Getenv("TEST_POSTGRES_DSN")
		if dsn == "" {
			t.Skip("isolated PostgreSQL DSN is not configured")
		}
		dialector = postgres.Open(dsn)
	}
	prefix := ""
	if matrix {
		prefix = "availability_feature_test_"
	}
	db, err := gorm.Open(dialector, &gorm.Config{NamingStrategy: schema.NamingStrategy{TablePrefix: prefix}})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	oldDB, oldLogDB, oldRedis := model.DB, model.LOG_DB, common.RedisEnabled
	oldType, oldLogType := common.MainDatabaseType(), common.LogDatabaseType()
	model.DB, model.LOG_DB, common.RedisEnabled = db, db, false
	dbType := common.DatabaseTypeSQLite
	if dialect == "mysql" {
		dbType = common.DatabaseTypeMySQL
	}
	if dialect == "postgres" {
		dbType = common.DatabaseTypePostgreSQL
	}
	common.SetDatabaseTypes(dbType, dbType)
	oldPath, oldMaster := common.SQLitePath, common.IsMasterNode
	if !matrix {
		// InitDB also initializes reserved-column quoting used by existing
		// catalog/real-metric queries; replacing only model.DB is insufficient.
		require.NoError(t, sqlDB.Close())
		t.Setenv("SQL_DSN", "local")
		common.SQLitePath = filepath.Join(t.TempDir(), "availability.sqlite")
		common.IsMasterNode = true
		require.NoError(t, model.InitDB())
		db = model.DB
		model.LOG_DB = db
		sqlDB, err = db.DB()
		require.NoError(t, err)
		sqlDB.SetMaxOpenConns(1)
	}
	t.Cleanup(func() {
		if matrix {
			require.NoError(t, db.Migrator().DropTable(&model.AvailabilityProbeSample{}, &model.AvailabilityIncident{}, &model.NotificationDelivery{}, &model.Ability{}))
		}
		model.DB, model.LOG_DB, common.RedisEnabled = oldDB, oldLogDB, oldRedis
		common.SetDatabaseTypes(oldType, oldLogType)
		common.SQLitePath, common.IsMasterNode = oldPath, oldMaster
		require.NoError(t, sqlDB.Close())
	})
	if matrix {
		require.NoError(t, db.Migrator().DropTable(&model.AvailabilityProbeSample{}, &model.AvailabilityIncident{}, &model.NotificationDelivery{}, &model.Ability{}))
	}
	require.NoError(t, db.AutoMigrate(&model.AvailabilityProbeSample{}, &model.AvailabilityIncident{}, &model.NotificationDelivery{}))
	if matrix {
		require.NoError(t, db.AutoMigrate(&model.Ability{}))
	}
	return db
}

func availabilityTestSettings(t *testing.T, values map[string]string) {
	t.Helper()
	old := availability_setting.Get()
	common.OptionMapRWMutex.Lock()
	oldMap := maps.Clone(common.OptionMap)
	if common.OptionMap == nil {
		common.OptionMap = map[string]string{}
	}
	common.OptionMapRWMutex.Unlock()
	t.Cleanup(func() {
		oldValues, err := config.ConfigToMap(old)
		require.NoError(t, err)
		common.OptionMapRWMutex.Lock()
		defer common.OptionMapRWMutex.Unlock()
		require.NoError(t, config.UpdateConfigFromMap(config.GlobalConfig.Get("availability_setting"), oldValues))
		common.OptionMap = oldMap
	})
	require.NoError(t, model.DB.AutoMigrate(&model.Option{}))
	options := map[string]string{"availability_setting.probe_enabled": "false", "availability_setting.alerts_enabled": "false"}
	maps.Copy(options, values)
	require.NoError(t, model.UpdateOptionsBulk(options))
}

func TestAvailabilityPersistenceDatabaseMatrix(t *testing.T) {
	for _, dialect := range []string{"sqlite", "mysql", "postgres"} {
		t.Run(dialect, func(t *testing.T) {
			db := availabilityTestDB(t, dialect, true)
			versionQuery := "SELECT version()"
			if dialect == "sqlite" {
				versionQuery = "SELECT sqlite_version()"
			}
			var version string
			require.NoError(t, db.Raw(versionQuery).Scan(&version).Error)
			t.Logf("database version: %s", version)
			require.NoError(t, db.AutoMigrate(&model.AvailabilityProbeSample{}, &model.AvailabilityIncident{}, &model.NotificationDelivery{}))
			require.NoError(t, db.AutoMigrate(&model.Channel{}))
			t.Cleanup(func() { require.NoError(t, db.Migrator().DropTable(&model.Channel{})) })
			diagnosticPair := model.AvailabilityPair{Model: "diagnostics-fixture", Group: "private"}
			require.NoError(t, db.Create(&model.Channel{Id: 89001, Name: "Internal route", Key: "must-never-be-returned", BaseURL: new("http://private.invalid")}).Error)
			for i, sample := range []model.AvailabilityProbeSample{
				{Outcome: "success", LatencyMs: 100, ChannelID: 89001},
				{Outcome: "success", LatencyMs: 200, ChannelID: 89001},
				{Outcome: "failure", ReasonCode: "probe_failed", LatencyMs: 500, ChannelID: 89001},
				{Outcome: "failure", ReasonCode: "probe_timeout", LatencyMs: 1000},
				{Outcome: "unsupported", ReasonCode: "unsupported"},
			} {
				sample.ModelName, sample.Group, sample.CheckedAt = diagnosticPair.Model, diagnosticPair.Group, 100
				sample.SampleKey = fmt.Sprintf("diagnostics-fixture-%d", i)
				require.NoError(t, model.SaveAvailabilityProbe(context.Background(), sample))
			}
			diagnostics, err := model.QueryAvailabilityDiagnostics(context.Background(), "probe", diagnosticPair, 99, 101)
			require.NoError(t, err)
			assert.EqualValues(t, 4, diagnostics.RequestCount)
			assert.EqualValues(t, 2, diagnostics.SuccessCount)
			assert.EqualValues(t, 2, diagnostics.FailureCount)
			assert.EqualValues(t, 1, diagnostics.UnsupportedCount)
			require.NotNil(t, diagnostics.P50LatencyMs)
			require.NotNil(t, diagnostics.P95LatencyMs)
			require.NotNil(t, diagnostics.P99LatencyMs)
			assert.EqualValues(t, 200, *diagnostics.P50LatencyMs)
			assert.EqualValues(t, 1000, *diagnostics.P95LatencyMs)
			assert.EqualValues(t, 1000, *diagnostics.P99LatencyMs)
			assert.Equal(t, []model.AvailabilityErrorCount{{Category: "probe_failed", Count: 1}, {Category: "probe_timeout", Count: 1}}, diagnostics.ErrorCategories)
			assert.Equal(t, []model.AvailabilityAffectedChannel{{ID: 89001, Name: "Internal route", Failures: 1}}, diagnostics.AffectedChannels)
			assert.EqualValues(t, 1, diagnostics.UnattributedFailures)
			encodedDiagnostics, err := common.Marshal(diagnostics)
			require.NoError(t, err)
			assert.NotContains(t, string(encodedDiagnostics), "must-never-be-returned")
			assert.NotContains(t, string(encodedDiagnostics), "private.invalid")
			ctx := context.Background()
			now := int64(1800000000)
			pair := model.AvailabilityPair{Model: "same-model", Group: "default"}
			sample := model.AvailabilityProbeSample{SampleKey: model.AvailabilityPairKey("run-1", pair.Model, pair.Group), ModelName: pair.Model, Group: pair.Group, CheckedAt: now, Outcome: "failure", ReasonCode: "probe_failed"}
			require.NoError(t, model.SaveAvailabilityProbe(ctx, sample))
			require.Error(t, model.SaveAvailabilityProbe(ctx, sample), "one run cannot persist the same pair twice")
			samples, err := model.ListAvailabilityProbes(ctx, now-1, now+1, []model.AvailabilityPair{pair})
			require.NoError(t, err)
			require.Len(t, samples, 1)
			buckets, err := model.QueryAvailabilityProbeBuckets(ctx, now-1, now+1, []model.AvailabilityPair{pair})
			require.NoError(t, err)
			require.Len(t, buckets, 1)
			assert.EqualValues(t, 1, buckets[0].RequestCount)
			assert.Zero(t, buckets[0].SuccessCount)
			success := sample
			success.SampleKey = model.AvailabilityPairKey("run-2", pair.Model, pair.Group)
			success.CheckedAt = now + 10
			success.Outcome = "success"
			success.ReasonCode = ""
			success.LatencyMs = 100
			require.NoError(t, model.SaveAvailabilityProbe(ctx, success))
			last, err := model.LatestAvailabilityProbesByPair(ctx, []model.AvailabilityPair{pair})
			require.NoError(t, err)
			assert.EqualValues(t, now+10, last[model.AvailabilityPairKey("probe", pair.Model, pair.Group)])
			skipped := sample
			skipped.SampleKey = model.AvailabilityPairKey("run-3", pair.Model, pair.Group)
			skipped.Outcome = "unsupported"
			skipped.ReasonCode = "unsupported"
			require.NoError(t, model.SaveAvailabilityProbe(ctx, skipped))
			buckets, err = model.QueryAvailabilityProbeBuckets(ctx, now-1, now+20, []model.AvailabilityPair{pair})
			require.NoError(t, err)
			require.Len(t, buckets, 1)
			assert.EqualValues(t, 2, buckets[0].RequestCount)
			assert.EqualValues(t, 1, buckets[0].SuccessCount)
			assert.EqualValues(t, 100, buckets[0].TotalLatencyMs)
			historyPairs, err := model.AvailabilityHistoryPairs(ctx, true)
			require.NoError(t, err)
			assert.Contains(t, historyPairs, pair)
			private, err := model.ListAvailabilityProbes(ctx, now-1, now+1, []model.AvailabilityPair{{Model: pair.Model, Group: "vip"}})
			require.NoError(t, err)
			assert.Empty(t, private)
			policy := model.AvailabilityAlertPolicy{SuccessRateThreshold: 95, FailureThreshold: 2, RecoveryThreshold: 2, CooldownSeconds: 600}
			for _, step := range []struct {
				minute   int64
				rate     float64
				notify   bool
				recovery bool
			}{
				{1, 0, false, false}, {1, 0, false, false}, {2, 0, true, false}, {3, 0, false, false}, {4, 100, false, false}, {5, 100, true, true}, {5, 100, false, false},
				{6, 0, false, false}, {7, 0, false, false}, {13, 0, true, false},
			} {
				obs := model.AvailabilityObservation{Model: pair.Model, Group: pair.Group, Source: "probe", StartedAt: now + step.minute*60, ObservedAt: now + step.minute*60, Valid: true, SuccessRate: step.rate}
				notice, err := model.ApplyAvailabilityObservation(ctx, obs, policy, obs.ObservedAt)
				require.NoError(t, err)
				if step.notify {
					require.NotNil(t, notice)
					assert.Equal(t, step.recovery, notice.Recovery)
				} else {
					assert.Nil(t, notice)
				}
			}
			items, total, err := model.ListAvailabilityIncidents(ctx, model.AvailabilityIncidentFilter{Page: 1, PageSize: 20}, []model.AvailabilityPair{pair})
			require.NoError(t, err)
			assert.EqualValues(t, 2, total)
			require.Len(t, items, 2)
			assert.Equal(t, "open", items[0].Status)
			assert.Equal(t, "resolved", items[1].Status)
			encoded, err := common.Marshal(items)
			require.NoError(t, err)
			for _, field := range []string{"pair_key", "active_key", "failures", "recoveries", "notified_at", "request_count"} {
				assert.NotContains(t, string(encoded), field)
			}
			// A separate model/group/source cannot inherit this incident.
			other := model.AvailabilityObservation{Model: pair.Model, Group: "vip", Source: "real", StartedAt: now, ObservedAt: now + 60, Valid: true, SuccessRate: 0}
			_, err = model.ApplyAvailabilityObservation(ctx, other, policy, now+60)
			require.NoError(t, err)
			other.ObservedAt += 60
			other.Valid = false
			_, err = model.ApplyAvailabilityObservation(ctx, other, policy, now+120)
			require.NoError(t, err)
			other.ObservedAt += 60
			other.Valid = true
			_, err = model.ApplyAvailabilityObservation(ctx, other, policy, now+180)
			require.NoError(t, err)
			vip, total, err := model.ListAvailabilityIncidents(ctx, model.AvailabilityIncidentFilter{Page: 1, PageSize: 20}, []model.AvailabilityPair{{Model: pair.Model, Group: "vip"}})
			require.NoError(t, err)
			assert.Zero(t, total)
			assert.Empty(t, vip)
			key := model.AvailabilityPairKey("real", pair.Model, "vip")
			require.Error(t, db.Create(&model.AvailabilityIncident{PairKey: key, ActiveKey: &key, Source: "real", Status: "pending"}).Error, "active incident uniqueness survives reconnects")
			gap := model.AvailabilityObservation{Model: "gap-model", Group: "vip", Source: "real", StartedAt: now, ObservedAt: now, Valid: true, SuccessRate: 0, MaxGapSeconds: 60}
			for _, timestamp := range []int64{now, now + 180} {
				gap.ObservedAt = timestamp
				_, err = model.ApplyAvailabilityObservation(ctx, gap, policy, timestamp)
				require.NoError(t, err)
			}
			_, gapTotal, err := model.ListAvailabilityIncidents(ctx, model.AvailabilityIncidentFilter{Page: 1, PageSize: 20}, []model.AvailabilityPair{{Model: "gap-model", Group: "vip"}})
			require.NoError(t, err)
			assert.Zero(t, gapTotal, "missed windows break consecutive-failure counting")
			require.NoError(t, model.CleanupAvailabilityHistory(ctx, now+400))
			remaining, total, err := model.ListAvailabilityIncidents(ctx, model.AvailabilityIncidentFilter{Page: 1, PageSize: 20}, []model.AvailabilityPair{pair})
			require.NoError(t, err)
			assert.EqualValues(t, 1, total)
			require.Len(t, remaining, 1)
			assert.Equal(t, "open", remaining[0].Status)
		})
	}
}

func TestAvailabilitySettingsAndCostScope(t *testing.T) {
	availabilityTestDB(t, "sqlite", false)
	availabilityTestSettings(t, nil)
	for _, tc := range []struct{ key, value string }{
		{"probe_enabled", "1"}, {"probe_timeout_seconds", "121"}, {"probe_interval_minutes", "0"}, {"probe_concurrency", "9"},
		{"probe_max_pairs", "201"}, {"minimum_samples", "0"}, {"evaluation_window_minutes", "1.5"}, {"success_rate_threshold", "NaN"},
		{"success_rate_threshold", "101"}, {"failure_threshold", "21"}, {"recovery_threshold", "0"}, {"retention_days", "366"},
		{"silence_until", "4102444801"}, {"notification_cooldown_minutes", "-1"}, {"probe_models", "null"}, {"probe_groups", `["bad\nname"]`},
		{"probe_models", `[" "]`}, {"unknown", "true"},
	} {
		require.Error(t, model.UpdateOption("availability_setting."+tc.key, tc.value), tc.key)
	}
	require.NoError(t, model.UpdateOption("availability_setting.probe_groups", `["`+strings.Repeat("中", 64)+`"]`))
	require.Error(t, model.UpdateOptionsBulk(map[string]string{"availability_setting.probe_enabled": "true", "availability_setting.probe_concurrency": "100"}))
	assert.False(t, availability_setting.Get().ProbeEnabled, "bulk validation happens before any field changes")
	pairs := []model.AvailabilityPair{{Model: "a", Group: "default"}, {Model: "a", Group: "vip"}, {Model: "b", Group: "default"}}
	s := availability_setting.Get()
	s.ProbeEnabled = true
	s.ProbeModels = []string{}
	s.ProbeGroups = []string{}
	assert.Empty(t, service.AvailabilityProbeTargets(pairs, s))
	s.ProbeModels = []string{"a"}
	assert.Empty(t, service.AvailabilityProbeTargets(pairs, s))
	s.ProbeGroups = []string{"vip"}
	assert.Equal(t, pairs[1:2], service.AvailabilityProbeTargets(pairs, s))
	s.ProbeAllModels = true
	s.ProbeAllGroups = true
	s.ProbeMaxPairs = 2
	assert.Equal(t, pairs[:2], service.AvailabilityProbeTargets(pairs, s))
	s.ProbeEnabled = false
	assert.Empty(t, service.AvailabilityProbeTargets(pairs, s))
	// A per-cycle cap rotates to never/least-recently probed pairs.
	rotating := []model.AvailabilityPair{}
	for i := range 21 {
		pair := model.AvailabilityPair{Model: fmt.Sprintf("model-%02d", i), Group: "default"}
		rotating = append(rotating, pair)
		if i < 20 {
			require.NoError(t, model.SaveAvailabilityProbe(context.Background(), model.AvailabilityProbeSample{SampleKey: model.AvailabilityPairKey("rotation", pair.Model, pair.Group), ModelName: pair.Model, Group: pair.Group, CheckedAt: 100, Outcome: "success"}))
		}
	}
	s.ProbeEnabled = true
	s.ProbeMaxPairs = 20
	next, err := service.ScheduledAvailabilityProbeTargets(context.Background(), rotating, s)
	require.NoError(t, err)
	require.Len(t, next, 20)
	assert.Equal(t, rotating[20], next[0])
	r := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(r)
	c.Request = httptest.NewRequest(http.MethodPost, "/", nil)
	RunAvailabilityProbe(c)
	assert.Equal(t, 409, r.Code)
	result, err := runAvailabilityMonitor(context.Background(), "disabled", true)
	require.NoError(t, err)
	assert.Zero(t, result.Probed)
	assert.True(t, (availabilityHistoryCleanupHandler{}).Enabled(), "retention remains scheduled with both monitoring switches off")
	require.NoError(t, model.CleanupAvailabilityHistory(context.Background(), 101))
	var oldSamples int64
	require.NoError(t, model.DB.Model(&model.AvailabilityProbeSample{}).Count(&oldSamples).Error)
	assert.Zero(t, oldSamples)
}

func TestAvailabilityProbeSeparationAndStop(t *testing.T) {
	db := availabilityTestDB(t, "sqlite", false)
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.Channel{}, &model.Ability{}, &model.Log{}, &model.PerfMetric{}, &model.SystemTask{}, &model.SystemTaskLock{}))
	availabilityTestSettings(t, map[string]string{"availability_setting.probe_enabled": "true", "availability_setting.probe_models": `["probe-model"]`, "availability_setting.probe_groups": `["default","vip"]`, "availability_setting.probe_concurrency": "1"})
	require.NoError(t, db.Create(&model.User{Id: 900401, Username: "availability-fixture", Group: "default", Role: common.RoleRootUser, Status: common.UserStatusEnabled, Quota: 123456}).Error)
	var calls atomic.Int32
	started := make(chan struct{}, 1)
	release := make(chan struct{})
	var hold atomic.Bool
	var failure atomic.Bool
	var timeout atomic.Bool
	var bodyTimeout atomic.Bool
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		if failure.Load() {
			w.WriteHeader(503)
			_, _ = w.Write([]byte(`{"error":{"message":"fixture-private-url-and-token"}}`))
			return
		}
		if timeout.Load() {
			_, _ = io.Copy(io.Discard, r.Body)
			if bodyTimeout.Load() {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(200)
				w.(http.Flusher).Flush()
			}
			<-r.Context().Done()
			return
		}
		if hold.Load() {
			started <- struct{}{}
			<-release
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":"fixture","object":"chat.completion","model":"probe-model","choices":[{"index":0,"message":{"role":"assistant","content":"ok"},"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}`))
	}))
	defer upstream.Close()
	service.InitHttpClient()
	channel := model.Channel{Id: 900402, Type: constant.ChannelTypeOpenAI, Status: common.ChannelStatusEnabled, Name: "fixture", BaseURL: &upstream.URL, Key: "fixture-not-a-secret", Group: "default,vip", Models: "probe-model"}
	require.NoError(t, db.Create(&channel).Error)
	require.NoError(t, db.Create(&[]model.Ability{{Group: "default", Model: "probe-model", ChannelId: channel.Id, Enabled: true}, {Group: "vip", Model: "probe-model", ChannelId: channel.Id, Enabled: true}}).Error)
	probe := testChannelRequest(context.Background(), &channel, 900401, "probe-model", string(constant.EndpointTypeOpenAI), false, "vip", true)
	require.NoError(t, probe.localErr)
	require.Nil(t, probe.newAPIError)
	assert.Equal(t, "vip", probe.context.GetString("group"))
	var count int64
	require.NoError(t, db.Model(&model.Log{}).Count(&count).Error)
	assert.Zero(t, count)
	require.NoError(t, db.Model(&model.PerfMetric{}).Count(&count).Error)
	assert.Zero(t, count)
	var user model.User
	require.NoError(t, db.First(&user, 900401).Error)
	assert.Equal(t, 123456, user.Quota)
	// Disable while the first request is active; the queued second group must not start.
	calls.Store(0)
	hold.Store(true)
	done := make(chan error, 1)
	go func() { _, err := runAvailabilityMonitor(context.Background(), "stop-run", true); done <- err }()
	select {
	case <-started:
	case <-time.After(5 * time.Second):
		t.Fatal("local probe did not start")
	}
	require.NoError(t, model.UpdateOption("availability_setting.probe_enabled", "false"))
	close(release)
	select {
	case err := <-done:
		require.NoError(t, err)
	case <-time.After(5 * time.Second):
		t.Fatal("probe worker did not stop")
	}
	assert.EqualValues(t, 1, calls.Load())
	// Unsupported image/task protocols remain unsampled/gray and never generate images.
	assert.Empty(t, availabilityProbeEndpoint(&channel, "gpt-image-2"))
	assert.Empty(t, availabilityProbeEndpoint(&model.Channel{Type: constant.ChannelTypeTaskPlugin}, "anything"))
	data, _, err := service.QueryAvailabilityProbes(context.Background(), []model.AvailabilityPair{{Model: "probe-model", Group: "default"}, {Model: "probe-model", Group: "vip"}}, 24)
	require.NoError(t, err)
	require.Len(t, data.GroupModels, 1)
	assert.Equal(t, "default", data.GroupModels[0].Group)
	assert.Zero(t, data.WindowStart%3600)
	for _, point := range data.GroupModels[0].RecentSuccessSeries {
		assert.GreaterOrEqual(t, point.Ts, data.WindowStart)
	}
	// Upstream failures and timeouts become fixed categories; upstream text
	// never enters persisted history or user-facing metrics.
	hold.Store(false)
	failure.Store(true)
	require.NoError(t, model.UpdateOption("availability_setting.probe_enabled", "true"))
	s := availability_setting.Get()
	require.NoError(t, runAvailabilityProbe(context.Background(), "error-run", 900401, model.AvailabilityPair{Model: "probe-model", Group: "default"}, s))
	failure.Store(false)
	timeout.Store(true)
	s.ProbeTimeoutSeconds = 1
	require.NoError(t, runAvailabilityProbe(context.Background(), "timeout-run", 900401, model.AvailabilityPair{Model: "probe-model", Group: "default"}, s))
	bodyTimeout.Store(true)
	require.NoError(t, runAvailabilityProbe(context.Background(), "body-timeout-run", 900401, model.AvailabilityPair{Model: "probe-model", Group: "default"}, s))
	timeout.Store(false)
	samples, err := model.ListAvailabilityProbes(context.Background(), time.Now().Unix()-60, time.Now().Unix()+1, []model.AvailabilityPair{{Model: "probe-model", Group: "default"}})
	require.NoError(t, err)
	require.Len(t, samples, 4)
	assert.Equal(t, "probe_failed", samples[1].ReasonCode)
	assert.Equal(t, "probe_timeout", samples[2].ReasonCode)
	assert.Equal(t, "probe_timeout", samples[3].ReasonCode)
	encoded, err := common.Marshal(samples)
	require.NoError(t, err)
	assert.NotContains(t, string(encoded), "fixture-private-url-and-token")
}

func TestAvailabilityRealWindowsAndUserProjection(t *testing.T) {
	db := availabilityTestDB(t, "sqlite", false)
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.Channel{}, &model.Ability{}, &model.PerfMetric{}, &model.SystemTask{}))
	availabilityTestSettings(t, map[string]string{"availability_setting.alerts_enabled": "true", "availability_setting.failure_threshold": "1", "availability_setting.silence_until": "4102444800"})
	oldPerf, err := config.ConfigToMap(config.GlobalConfig.Get("perf_metrics_setting"))
	require.NoError(t, err)
	require.NoError(t, config.UpdateConfigFromMap(config.GlobalConfig.Get("perf_metrics_setting"), map[string]string{"bucket_time": "hour", "enabled": "true"}))
	t.Cleanup(func() {
		require.NoError(t, config.UpdateConfigFromMap(config.GlobalConfig.Get("perf_metrics_setting"), oldPerf))
	})
	s := availability_setting.Get()
	now := time.Now().Unix()
	start, end := service.AvailabilityEvaluationWindow(s, now)
	assert.EqualValues(t, 3600, end-start+1)
	assert.Less(t, end, now-now%3600)
	pairs := []model.AvailabilityPair{{Model: "busy", Group: "default"}, {Model: "sparse", Group: "default"}, {Model: "current-only", Group: "default"}}
	require.NoError(t, db.Create(&[]model.PerfMetric{{ModelName: "busy", Group: "default", BucketTs: start, RequestCount: 10, SuccessCount: 0}, {ModelName: "sparse", Group: "default", BucketTs: start, RequestCount: 1, SuccessCount: 0}, {ModelName: "current-only", Group: "default", BucketTs: now - now%3600, RequestCount: 100, SuccessCount: 0}}).Error)
	require.NoError(t, service.EvaluateRealAvailability(context.Background(), pairs, s, now))
	require.NoError(t, service.EvaluateRealAvailability(context.Background(), pairs, s, now+1))
	items, total, err := model.ListAvailabilityIncidents(context.Background(), model.AvailabilityIncidentFilter{Page: 1, PageSize: 20}, pairs)
	require.NoError(t, err)
	assert.EqualValues(t, 1, total)
	require.Len(t, items, 1)
	assert.Equal(t, "busy", items[0].ModelName)
	assert.Zero(t, items[0].NotifiedAt)
	// Configure a private group with a model also visible in the ordinary group.
	oldUsable := setting.UserUsableGroups2JSONString()
	require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(`{"default":"Default"}`))
	t.Cleanup(func() { require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(oldUsable)) })
	require.NoError(t, db.Create(&model.User{Id: 900403, Username: "viewer", Group: "default", Role: common.RoleCommonUser, Status: common.UserStatusEnabled}).Error)
	require.NoError(t, db.Create(&model.Channel{Id: 900404, Type: constant.ChannelTypeOpenAI, Status: common.ChannelStatusEnabled}).Error)
	require.NoError(t, db.Create(&[]model.Ability{{Model: "busy", Group: "default", ChannelId: 900404, Enabled: true}, {Model: "busy", Group: "svip", ChannelId: 900404, Enabled: true}}).Error)
	for _, group := range []string{"default", "svip"} {
		require.NoError(t, model.SaveAvailabilityProbe(context.Background(), model.AvailabilityProbeSample{SampleKey: model.AvailabilityPairKey("projection", "busy", group), ModelName: "busy", Group: group, CheckedAt: now, Outcome: "failure", ReasonCode: "probe_failed"}))
	}
	r := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(r)
	c.Request = httptest.NewRequest(http.MethodGet, "/", nil)
	c.Set("id", 900403)
	c.Set("role", common.RoleCommonUser)
	GetAvailabilityMonitor(c)
	require.Equal(t, 200, r.Code)
	assert.Contains(t, r.Body.String(), `"group":"default"`)
	assert.NotContains(t, r.Body.String(), "svip")
	for _, private := range []string{"request_count", "success_count", "sample_key", "pair_key", "fixture-not-a-secret", "failures", "notified_at"} {
		assert.NotContains(t, r.Body.String(), private)
	}
	r = httptest.NewRecorder()
	c, _ = gin.CreateTestContext(r)
	c.Request = httptest.NewRequest(http.MethodGet, "/?model=busy&group=svip", nil)
	c.Set("id", 900403)
	c.Set("role", common.RoleCommonUser)
	GetAvailabilityProbes(c)
	assert.Equal(t, 404, r.Code)
	for _, query := range []string{"?source=bad", "?status=pending", "?page=-1", "?page_size=1000"} {
		r = httptest.NewRecorder()
		c, _ = gin.CreateTestContext(r)
		c.Request = httptest.NewRequest(http.MethodGet, "/"+query, nil)
		GetAvailabilityIncidents(c)
		assert.Equal(t, 400, r.Code)
	}
	require.NoError(t, db.Model(&model.Ability{}).Where("channel_id = ?", 900404).Update("enabled", false).Error)
	alertPairs, err := service.AvailabilityAlertPairs(context.Background())
	require.NoError(t, err)
	assert.Contains(t, alertPairs, model.AvailabilityPair{Model: "busy", Group: "default"})
	r = httptest.NewRecorder()
	c, _ = gin.CreateTestContext(r)
	c.Request = httptest.NewRequest(http.MethodGet, "/?source=real", nil)
	c.Set("id", 900403)
	c.Set("role", common.RoleCommonUser)
	GetAvailabilityIncidents(c)
	assert.Contains(t, r.Body.String(), `"model_name":"busy"`, "disabled channels do not hide retained authorized history")
	require.NoError(t, db.Where("channel_id = ?", 900404).Delete(&model.Ability{}).Error)
	r = httptest.NewRecorder()
	c, _ = gin.CreateTestContext(r)
	c.Request = httptest.NewRequest(http.MethodGet, "/?source=real", nil)
	c.Set("role", common.RoleAdminUser)
	GetAvailabilityIncidents(c)
	assert.Contains(t, r.Body.String(), `"model_name":"busy"`, "administrators retain incident history after channel removal")
}

func TestAvailabilityDiagnosticsPrivilegesAndAggregation(t *testing.T) {
	db := availabilityTestDB(t, "sqlite", false)
	availabilityTestSettings(t, nil)
	for _, role := range []int{0, common.RoleCommonUser} {
		r := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(r)
		c.Request = httptest.NewRequest(http.MethodGet, "/?model=hidden&group=private&source=probe&hours=24&channel_id=123", nil)
		c.Set("role", role)
		GetAvailabilityDiagnostics(c)
		assert.Equal(t, http.StatusForbidden, r.Code)
		assert.NotContains(t, r.Body.String(), "channel")
		assert.NotContains(t, r.Body.String(), "request_count")
	}
	now := time.Now().Unix()
	require.NoError(t, db.Create(&model.Ability{Model: "admin-model", Group: "default", ChannelId: 89901}).Error)
	require.NoError(t, db.Create(&[]model.PerfMetric{
		{ModelName: "admin-model", Group: "default", BucketTs: now - now%3600 - 3600, RequestCount: 10, SuccessCount: 7, TotalLatencyMs: 5000},
		{ModelName: "admin-model", Group: "default", BucketTs: now - now%3600, RequestCount: 99, SuccessCount: 99},
	}).Error)
	for _, query := range []struct {
		value string
		code  int
	}{
		{"?model=admin-model&group=default&source=real&hours=24", 200},
		{"?model=missing&group=default&source=probe&hours=24", 404},
		{"?model=admin-model&group=default&source=invalid&hours=24", 400},
		{"?model=admin-model&group=default&source=real&hours=8760", 400},
		{"?source=real&hours=24", 400},
	} {
		r := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(r)
		c.Request = httptest.NewRequest(http.MethodGet, "/"+query.value, nil)
		c.Set("role", common.RoleAdminUser)
		GetAvailabilityDiagnostics(c)
		require.Equal(t, query.code, r.Code, query.value)
		if query.code == 200 {
			var response struct {
				Data model.AvailabilityDiagnostics `json:"data"`
			}
			require.NoError(t, common.Unmarshal(r.Body.Bytes(), &response))
			assert.EqualValues(t, 10, response.Data.RequestCount)
			assert.EqualValues(t, 7, response.Data.SuccessCount)
			assert.EqualValues(t, 3, response.Data.FailureCount)
			assert.Nil(t, response.Data.P95LatencyMs, "averaged hourly latency cannot produce a percentile")
			assert.Equal(t, "aggregated_real_metrics", response.Data.PercentileUnavailableReason)
			assert.Positive(t, response.Data.CollectionDelaySeconds)
			assert.Empty(t, response.Data.AffectedChannels, "configured channels are not evidence of affected channels")
		}
	}
	pair := model.AvailabilityPair{Model: "capped-model", Group: "default"}
	samples := make([]model.AvailabilityProbeSample, model.AvailabilityDiagnosticsSampleLimit+1)
	for i := range samples {
		samples[i] = model.AvailabilityProbeSample{SampleKey: fmt.Sprintf("cap-%d", i), PairKey: model.AvailabilityPairKey("probe", pair.Model, pair.Group), ModelName: pair.Model, Group: pair.Group, CheckedAt: now, Outcome: "success", LatencyMs: 100}
	}
	require.NoError(t, db.CreateInBatches(&samples, 500).Error)
	data, err := model.QueryAvailabilityDiagnostics(context.Background(), "probe", pair, now-1, now+1)
	require.NoError(t, err)
	assert.True(t, data.Truncated)
	assert.Equal(t, "sample_limit", data.PercentileUnavailableReason)
	assert.Nil(t, data.P50LatencyMs)
	assert.EqualValues(t, model.AvailabilityDiagnosticsSampleLimit+1, data.RequestCount, "counts remain complete when percentile loading is capped")
}
