package openai

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestRealtimeBudgetRejectionFlushesEachUsageBufferOnce(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	previousDB, previousLogDB := model.DB, model.LOG_DB
	previousMain, previousLog := common.MainDatabaseType(), common.LogDatabaseType()
	previousMaster, previousRedis, previousBatch := common.IsMasterNode, common.RedisEnabled, common.BatchUpdateEnabled
	model.DB = db
	common.SetDatabaseTypes(common.DatabaseTypeSQLite, common.DatabaseTypeSQLite)
	common.IsMasterNode, common.RedisEnabled, common.BatchUpdateEnabled = false, false, false
	t.Setenv("LOG_SQL_DSN", "")
	require.NoError(t, model.InitLogDB())
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.Token{}, &model.Log{}, &model.Channel{}))
	require.NoError(t, i18n.Init())
	previousRatios := ratio_setting.ModelRatio2JSONString()
	require.NoError(t, ratio_setting.UpdateModelRatioByJSONString(`{"realtime-budget-rejection":1}`))
	t.Cleanup(func() {
		model.DB, model.LOG_DB = previousDB, previousLogDB
		common.SetDatabaseTypes(previousMain, previousLog)
		common.IsMasterNode, common.RedisEnabled, common.BatchUpdateEnabled = previousMaster, previousRedis, previousBatch
		require.NoError(t, ratio_setting.UpdateModelRatioByJSONString(previousRatios))
		_ = sqlDB.Close()
	})
	day, month := model.TokenBudgetPeriods(time.Now().Unix())
	user := model.User{Id: 1, Username: "realtime-budget-user", Quota: 1000, Status: common.UserStatusEnabled}
	token := model.Token{Id: 1, UserId: 1, Key: "realtime-budget-test-key", Name: "test", Status: common.TokenStatusEnabled, RemainQuota: 1000, DailyBudget: 100, DailyBudgetUsed: 100, DailyBudgetStart: day, MonthlyBudgetStart: month}
	require.NoError(t, db.Create(&user).Error)
	require.NoError(t, token.Insert())
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodGet, "/v1/realtime", nil)
	info := &relaycommon.RelayInfo{UserId: 1, TokenId: 1, TokenKey: token.Key, OriginModelName: "realtime-budget-rejection", UserGroup: "default", ChannelMeta: &relaycommon.ChannelMeta{}, StartTime: time.Now(), PriceData: types.PriceData{ModelRatio: 1, GroupRatioInfo: types.GroupRatioInfo{GroupRatio: 1}}, UserSetting: dto.UserSetting{Language: "en"}}
	info.UsingGroup = "default"
	usage := &dto.RealtimeUsage{InputTokens: 10, TotalTokens: 10}
	usage.InputTokenDetails.TextTokens = 10
	local := &dto.RealtimeUsage{InputTokens: 8, TotalTokens: 8}
	local.InputTokenDetails.TextTokens = 8
	total := &dto.RealtimeUsage{}
	err = preConsumeUsage(c, info, usage, total, local)
	require.ErrorContains(t, err, "budget")
	assert.Equal(t, dto.RealtimeUsage{}, *usage, "rejected payment must consume the pending buffer")
	// A final shutdown flush must not add the same upstream usage again.
	require.NoError(t, preConsumeUsage(c, info, usage, total, nil))
	assert.Equal(t, dto.RealtimeUsage{}, *local, "authoritative usage discards its duplicate local estimate even after rejection")
	require.NoError(t, preConsumeUsage(c, info, local, total, nil))
	assert.Equal(t, 10, total.TotalTokens)
	service.PostWssConsumeQuota(c, info, info.OriginModelName, total, nil)
	require.NoError(t, db.First(&token, 1).Error)
	assert.Equal(t, 10, token.UsedQuota, "actual already-served usage is settled once")
}
