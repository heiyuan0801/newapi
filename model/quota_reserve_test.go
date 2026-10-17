package model

import (
	"math"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func createReserveTestUser(t *testing.T, quota int) User {
	t.Helper()
	user := User{
		Username:    "reserve-user-" + common.GetRandomString(6),
		Password:    "unused-password-hash",
		Role:        common.RoleCommonUser,
		Status:      common.UserStatusEnabled,
		Group:       "default",
		AuthVersion: 1,
		Quota:       quota,
		AffCode:     "reserve-aff-" + common.GetRandomString(8),
	}
	require.NoError(t, DB.Create(&user).Error)
	return user
}

func createReserveTestToken(t *testing.T, remainQuota int) Token {
	t.Helper()
	token := Token{
		UserId:      1,
		Key:         "reserve-token-" + common.GetRandomString(8),
		Name:        "reserve-test",
		Status:      common.TokenStatusEnabled,
		ExpiredTime: -1,
		RemainQuota: remainQuota,
	}
	require.NoError(t, token.Insert())
	return token
}

func getUserQuotaFromDB(t *testing.T, id int) int {
	t.Helper()
	var user User
	require.NoError(t, DB.Select("quota").First(&user, id).Error)
	return user.Quota
}

func getTokenFromDB(t *testing.T, id int) Token {
	t.Helper()
	var token Token
	require.NoError(t, DB.First(&token, id).Error)
	return token
}

func resetBatchUpdateTestState(t *testing.T) {
	t.Helper()
	oldBatchEnabled := common.BatchUpdateEnabled
	common.BatchUpdateEnabled = false
	for i := range BatchUpdateTypeCount {
		batchUpdateLocks[i].Lock()
		batchUpdateStores[i] = make(map[int]int)
		batchUpdateLocks[i].Unlock()
	}
	t.Cleanup(func() {
		common.BatchUpdateEnabled = oldBatchEnabled
		for i := range BatchUpdateTypeCount {
			batchUpdateLocks[i].Lock()
			batchUpdateStores[i] = make(map[int]int)
			batchUpdateLocks[i].Unlock()
		}
	})
}

func TestTryReserveQuotaWithoutRedis(t *testing.T) {
	truncateTables(t)
	resetBatchUpdateTestState(t)

	user := createReserveTestUser(t, 100)
	reserved, err := TryReserveUserQuota(user.Id, 60)
	require.NoError(t, err)
	assert.True(t, reserved)
	assert.Equal(t, 40, getUserQuotaFromDB(t, user.Id))

	reserved, err = TryReserveUserQuota(user.Id, 41)
	require.NoError(t, err)
	assert.False(t, reserved)
	assert.Equal(t, 40, getUserQuotaFromDB(t, user.Id))

	token := createReserveTestToken(t, 80)
	reserved, err = TryReserveTokenQuota(token.Id, token.Key, 25, false)
	require.NoError(t, err)
	assert.True(t, reserved)
	reloaded := getTokenFromDB(t, token.Id)
	assert.Equal(t, 55, reloaded.RemainQuota)
	assert.Equal(t, 25, reloaded.UsedQuota)

	reserved, err = TryReserveTokenQuota(token.Id, token.Key, 56, false)
	require.NoError(t, err)
	assert.False(t, reserved)
	assert.Equal(t, 55, getTokenFromDB(t, token.Id).RemainQuota)
}

func TestRedisBatchReserveNeverFallsBackToStaleDatabaseBalance(t *testing.T) {
	truncateTables(t)
	resetBatchUpdateTestState(t)
	useUserCacheMiniRedis(t)
	common.BatchUpdateEnabled = true

	user := createReserveTestUser(t, 10)
	reserved, err := TryReserveUserQuota(user.Id, 8)
	require.NoError(t, err)
	assert.True(t, reserved)
	assert.Equal(t, 10, getUserQuotaFromDB(t, user.Id), "batch delta is not flushed yet")

	reserved, err = TryReserveUserQuota(user.Id, 3)
	require.NoError(t, err)
	assert.False(t, reserved, "stale DB balance must not authorize a second spend")
	cachedUser, err := GetUserCache(user.Id)
	require.NoError(t, err)
	assert.Equal(t, 2, cachedUser.Quota)

	token := createReserveTestToken(t, 9)
	reserved, err = TryReserveTokenQuota(token.Id, token.Key, 7, false)
	require.NoError(t, err)
	assert.True(t, reserved)
	reserved, err = TryReserveTokenQuota(token.Id, token.Key, 3, false)
	require.NoError(t, err)
	assert.False(t, reserved)
	assert.Equal(t, 9, getTokenFromDB(t, token.Id).RemainQuota)

	batchUpdate()
	assert.Equal(t, 2, getUserQuotaFromDB(t, user.Id))
	reloadedToken := getTokenFromDB(t, token.Id)
	assert.Equal(t, 2, reloadedToken.RemainQuota)
	assert.Equal(t, 7, reloadedToken.UsedQuota)
}

func TestBatchUpdateAccumulatesTwoMaximumRequestCharges(t *testing.T) {
	truncateTables(t)
	resetBatchUpdateTestState(t)
	common.BatchUpdateEnabled = true

	user := createReserveTestUser(t, common.MaxQuota*2+100)
	require.NoError(t, DecreaseUserQuota(user.Id, common.MaxQuota, false))
	require.NoError(t, DecreaseUserQuota(user.Id, common.MaxQuota, false))

	batchUpdate()
	assert.Equal(t, 100, getUserQuotaFromDB(t, user.Id))
}

func TestShutdownFlushPersistsQueuedQuotaExactlyOnce(t *testing.T) {
	truncateTables(t)
	resetBatchUpdateTestState(t)
	common.BatchUpdateEnabled = true
	user := createReserveTestUser(t, 100)
	token := createReserveTestToken(t, 80)
	addNewRecord(BatchUpdateTypeUserQuota, user.Id, -30)
	addNewRecord(BatchUpdateTypeTokenQuota, token.Id, -30)
	addNewRecord(BatchUpdateTypeUsedQuota, user.Id, 30)
	addNewRecord(BatchUpdateTypeRequestCount, user.Id, 1)
	assert.Equal(t, 100, getUserQuotaFromDB(t, user.Id))
	FlushBatchUpdates()
	FlushBatchUpdates()
	var reloaded User
	require.NoError(t, DB.First(&reloaded, user.Id).Error)
	assert.Equal(t, 70, reloaded.Quota)
	assert.Equal(t, 30, reloaded.UsedQuota)
	assert.Equal(t, 1, reloaded.RequestCount)
	assert.Equal(t, 50, getTokenFromDB(t, token.Id).RemainQuota)
	assert.Equal(t, 30, getTokenFromDB(t, token.Id).UsedQuota)
}

func TestBatchUpdateAccumulatorSaturatesOverflow(t *testing.T) {
	resetBatchUpdateTestState(t)

	addNewRecord(BatchUpdateTypeUserQuota, 1, math.MaxInt)
	addNewRecord(BatchUpdateTypeUserQuota, 1, 1)
	batchUpdateLocks[BatchUpdateTypeUserQuota].Lock()
	assert.Equal(t, math.MaxInt, batchUpdateStores[BatchUpdateTypeUserQuota][1])
	batchUpdateLocks[BatchUpdateTypeUserQuota].Unlock()

	batchUpdateLocks[BatchUpdateTypeUserQuota].Lock()
	batchUpdateStores[BatchUpdateTypeUserQuota] = make(map[int]int)
	batchUpdateLocks[BatchUpdateTypeUserQuota].Unlock()
	addNewRecord(BatchUpdateTypeUserQuota, 1, math.MinInt)
	addNewRecord(BatchUpdateTypeUserQuota, 1, -1)
	batchUpdateLocks[BatchUpdateTypeUserQuota].Lock()
	assert.Equal(t, math.MinInt, batchUpdateStores[BatchUpdateTypeUserQuota][1])
	batchUpdateLocks[BatchUpdateTypeUserQuota].Unlock()
}

func TestReserveFallsBackToDatabaseWhenRedisIsUnavailable(t *testing.T) {
	truncateTables(t)
	resetBatchUpdateTestState(t)
	server := useUserCacheMiniRedis(t)

	user := createReserveTestUser(t, 20)
	require.NoError(t, populateUserCache(user))
	server.Close()

	// Redis 故障时降级为数据库条件更新：服务保持可用且不会超扣。
	reserved, err := TryReserveUserQuota(user.Id, 5)
	require.NoError(t, err)
	assert.True(t, reserved)
	assert.Equal(t, 15, getUserQuotaFromDB(t, user.Id))

	reserved, err = TryReserveUserQuota(user.Id, 16)
	require.NoError(t, err)
	assert.False(t, reserved)
	assert.Equal(t, 15, getUserQuotaFromDB(t, user.Id))
}

func TestSynchronousReserveCompensatesCacheWhenPersistenceFails(t *testing.T) {
	truncateTables(t)
	resetBatchUpdateTestState(t)
	useUserCacheMiniRedis(t)

	user := createReserveTestUser(t, 10)
	require.NoError(t, populateUserCache(user))
	require.NoError(t, DB.Delete(&user).Error)

	reserved, err := TryReserveUserQuota(user.Id, 6)
	assert.False(t, reserved)
	assert.ErrorIs(t, err, gorm.ErrRecordNotFound)
	cached, cacheErr := cacheGetUserBase(user.Id)
	require.NoError(t, cacheErr)
	assert.Equal(t, 10, cached.Quota)

	token := createReserveTestToken(t, 12)
	_, err = GetTokenByKey(token.Key, true)
	require.NoError(t, err)
	require.NoError(t, DB.Delete(&token).Error)
	reserved, err = TryReserveTokenQuota(token.Id, token.Key, 7, false)
	assert.False(t, reserved)
	assert.ErrorIs(t, err, gorm.ErrRecordNotFound)
	cachedToken, cacheErr := cacheGetTokenByKey(token.Key)
	require.NoError(t, cacheErr)
	assert.Equal(t, 12, cachedToken.RemainQuota)
	assert.Zero(t, cachedToken.UsedQuota)
}

func TestTokenCacheInitPreservesLiveQuotaAndFenceBlocksStaleSnapshot(t *testing.T) {
	truncateTables(t)
	resetBatchUpdateTestState(t)
	server := useUserCacheMiniRedis(t)

	token := createReserveTestToken(t, 100)
	loaded, err := GetTokenByKey(token.Key, true)
	require.NoError(t, err)
	stale := *loaded

	result, err := cacheApplyTokenQuotaDelta(token.Id, token.Key, -70)
	require.NoError(t, err)
	require.Equal(t, cacheQuotaOK, result)

	// 已存在的哈希只刷新 TTL：数据库快照不得覆盖已被原子预扣的余额。
	code, err := cacheInitToken(stale)
	require.NoError(t, err)
	assert.Equal(t, 2, code)
	cached, err := cacheGetTokenByKey(token.Key)
	require.NoError(t, err)
	assert.Equal(t, 30, cached.RemainQuota)

	// 变更期间：fence 删除缓存并拦截并发读者手中的过期快照。
	require.NoError(t, invalidateTokenCacheForMutation(token.Key))
	code, err = cacheInitToken(stale)
	require.NoError(t, err)
	assert.Zero(t, code, "the pre-mutation snapshot must not be published while fenced")
	_, err = cacheGetTokenByKey(token.Key)
	assert.Error(t, err)

	// fence 过期后可重新从数据库水合。
	server.FastForward(time.Duration(tokenCacheFenceSeconds+1) * time.Second)
	fresh, err := GetTokenByKey(token.Key, false)
	require.NoError(t, err)
	assert.Equal(t, 100, fresh.RemainQuota)
	cached, err = cacheGetTokenByKey(token.Key)
	require.NoError(t, err)
	assert.Equal(t, 100, cached.RemainQuota)
}

func TestTokenBudgetReservationEnforcesLimitsAndCompensatesLifetimeFailure(t *testing.T) {
	truncateTables(t)
	resetBatchUpdateTestState(t)
	at := time.Date(2026, 10, 17, 10, 0, 0, 0, time.UTC).Unix()
	token := createReserveTestToken(t, 100)
	require.NoError(t, DB.Model(&token).Updates(map[string]any{"daily_budget": 80, "monthly_budget": 150}).Error)
	reserved, err := TryReserveTokenQuota(token.Id, token.Key, 60, false, at)
	require.NoError(t, err)
	require.True(t, reserved)
	reserved, err = TryReserveTokenQuota(token.Id, token.Key, 21, false, at)
	require.ErrorIs(t, err, ErrTokenBudgetExceeded)
	assert.False(t, reserved)
	assert.Equal(t, int64(60), getTokenFromDB(t, token.Id).DailyBudgetUsed)
	// A failed lifetime reservation must not consume periodic budget.
	require.NoError(t, DB.Model(&token).Update("remain_quota", 1).Error)
	reserved, err = TryReserveTokenQuota(token.Id, token.Key, 10, false, at)
	require.NoError(t, err)
	assert.False(t, reserved)
	assert.Equal(t, int64(60), getTokenFromDB(t, token.Id).DailyBudgetUsed)
	require.NoError(t, IncreaseTokenQuota(token.Id, token.Key, 20, at))
	assert.Equal(t, int64(40), getTokenFromDB(t, token.Id).MonthlyBudgetUsed)
}

func TestTokenBudgetUTCResetDoesNotCreditNewPeriodForOldRefund(t *testing.T) {
	truncateTables(t)
	resetBatchUpdateTestState(t)
	at := time.Date(2026, 10, 31, 23, 59, 0, 0, time.UTC).Unix()
	token := createReserveTestToken(t, 1000)
	require.NoError(t, DB.Model(&token).Updates(map[string]any{"daily_budget": 80, "monthly_budget": 100, "unlimited_quota": true}).Error)
	reserved, err := TryReserveTokenQuota(token.Id, token.Key, 80, true, at)
	require.NoError(t, err)
	require.True(t, reserved)
	reserved, err = TryReserveTokenQuota(token.Id, token.Key, 1, true, at)
	require.ErrorIs(t, err, ErrTokenBudgetExceeded)
	assert.False(t, reserved)
	next := at + 120
	reserved, err = TryReserveTokenQuota(token.Id, token.Key, 25, true, next)
	require.NoError(t, err)
	require.True(t, reserved)
	require.NoError(t, IncreaseTokenQuota(token.Id, token.Key, 80, at))
	got := getTokenFromDB(t, token.Id)
	assert.Equal(t, int64(25), got.DailyBudgetUsed)
	assert.Equal(t, int64(25), got.MonthlyBudgetUsed)
	require.NoError(t, DecreaseTokenQuota(token.Id, token.Key, 75, next))
	assert.Equal(t, int64(100), getTokenFromDB(t, token.Id).MonthlyBudgetUsed, "actual settlement is retained even above the daily estimate")
	reserved, err = TryReserveTokenQuota(token.Id, token.Key, 1, true, next)
	require.ErrorIs(t, err, ErrTokenBudgetExceeded)
	assert.False(t, reserved)
}

func TestTokenBudgetReminderClaimsOncePerUTCPeriod(t *testing.T) {
	truncateTables(t)
	resetBatchUpdateTestState(t)
	at := time.Date(2026, 10, 17, 10, 0, 0, 0, time.UTC).Unix()
	token := createReserveTestToken(t, 1000)
	require.NoError(t, DB.Model(&token).Updates(map[string]any{"daily_budget": 100, "monthly_budget": 100, "budget_reminder_enabled": true}).Error)
	reserved, err := TryReserveTokenQuota(token.Id, token.Key, 79, false, at)
	require.NoError(t, err)
	require.True(t, reserved)
	notices, err := ClaimTokenBudgetNotices(token.Id, at)
	require.NoError(t, err)
	assert.Empty(t, notices)
	require.NoError(t, DecreaseTokenQuota(token.Id, token.Key, 1, at))
	notices, err = ClaimTokenBudgetNotices(token.Id, at)
	require.NoError(t, err)
	assert.Equal(t, []string{"daily", "monthly"}, notices)
	notices, err = ClaimTokenBudgetNotices(token.Id, at)
	require.NoError(t, err)
	assert.Empty(t, notices)
	require.NoError(t, IncreaseTokenQuota(token.Id, token.Key, 20, at))
	require.NoError(t, DecreaseTokenQuota(token.Id, token.Key, 20, at))
	notices, err = ClaimTokenBudgetNotices(token.Id, at)
	require.NoError(t, err)
	assert.Empty(t, notices, "refund and threshold recrossing do not repeat a period notice")
}

func TestTokenBudgetDatabaseMatrix(t *testing.T) {
	previousDB, previousSQLite := DB, common.SQLitePath
	previousType := common.MainDatabaseType()
	defer func() {
		DB = previousDB
		common.SQLitePath = previousSQLite
		common.SetMainDatabaseType(previousType)
		initCol()
	}()
	for _, dialect := range []string{"sqlite", "mysql", "postgres"} {
		t.Run(dialect, func(t *testing.T) {
			var dsn string
			switch dialect {
			case "sqlite":
				common.SQLitePath = filepath.Join(t.TempDir(), "budget.db")
				dsn = "local"
			case "mysql":
				dsn = os.Getenv("TEST_MYSQL_DSN")
			case "postgres":
				dsn = os.Getenv("TEST_POSTGRES_DSN")
			}
			if dsn == "" {
				t.Skip("real test database DSN is not configured")
			}
			t.Setenv("TOKEN_BUDGET_TEST_DSN", dsn)
			db, _, err := chooseDB("TOKEN_BUDGET_TEST_DSN", false)
			require.NoError(t, err)
			sqlDB, err := db.DB()
			require.NoError(t, err)
			defer sqlDB.Close()
			DB = db
			initCol()
			require.NoError(t, DB.AutoMigrate(&Token{}))
			token := createReserveTestToken(t, 1000)
			defer DB.Unscoped().Delete(&token)
			at := time.Date(2026, 10, 31, 23, 59, 0, 0, time.UTC).Unix()
			require.NoError(t, DB.Model(&token).Updates(map[string]any{"daily_budget": 100, "monthly_budget": 120, "unlimited_quota": true, "budget_reminder_enabled": true}).Error)
			for range 2 {
				reserved, err := TryReserveTokenQuota(token.Id, token.Key, 0, true, at)
				require.NoError(t, err)
				require.True(t, reserved, "zero estimate prechecks remain valid when MySQL reports no changed rows")
			}
			// Both concurrent requests cannot reserve 60 from a budget of 100.
			start := make(chan struct{})
			results := make(chan error, 2)
			var workers sync.WaitGroup
			for range 2 {
				workers.Go(func() { <-start; _, err := TryReserveTokenQuota(token.Id, token.Key, 60, true, at); results <- err })
			}
			close(start)
			workers.Wait()
			close(results)
			successes := 0
			for err := range results {
				if err == nil {
					successes++
				} else {
					require.ErrorIs(t, err, ErrTokenBudgetExceeded)
				}
			}
			require.Equal(t, 1, successes)
			require.NoError(t, DecreaseTokenQuota(token.Id, token.Key, 20, at))
			notices, err := ClaimTokenBudgetNotices(token.Id, at)
			require.NoError(t, err)
			assert.Equal(t, []string{"daily"}, notices)
			// Both counters reset on month rollover, including MySQL assignment order.
			reserved, err := TryReserveTokenQuota(token.Id, token.Key, 25, true, at+120)
			require.NoError(t, err)
			require.True(t, reserved)
			require.NoError(t, IncreaseTokenQuota(token.Id, token.Key, 80, at))
			got := getTokenFromDB(t, token.Id)
			assert.Equal(t, int64(25), got.DailyBudgetUsed)
			assert.Equal(t, int64(25), got.MonthlyBudgetUsed)
			require.NoError(t, DecreaseTokenQuota(token.Id, token.Key, 75, at+120))
			reserved, err = TryReserveTokenQuota(token.Id, token.Key, 1, true, at+120)
			require.ErrorIs(t, err, ErrTokenBudgetExceeded)
			assert.False(t, reserved)
		})
	}
}

func TestTokenBudgetFailedReservationCannotBecomeUncountedAfterConcurrentRefund(t *testing.T) {
	truncateTables(t)
	resetBatchUpdateTestState(t)
	token := createReserveTestToken(t, 1000)
	at := time.Date(2026, 10, 17, 10, 0, 0, 0, time.UTC).Unix()
	day, month := TokenBudgetPeriods(at)
	require.NoError(t, DB.Model(&token).Updates(map[string]any{"daily_budget": 100, "daily_budget_used": 100, "daily_budget_start": day, "monthly_budget_start": month}).Error)
	refunded := false
	require.NoError(t, DB.Callback().Update().After("gorm:commit_or_rollback_transaction").Register("test:budget-concurrent-refund", func(tx *gorm.DB) {
		if refunded || tx.Error != nil || tx.RowsAffected != 0 || tx.Statement.Table != "tokens" {
			return
		}
		refunded = true
		// This explicit concurrent outcome occurs after a cap rejected the UPDATE.
		// No clocks, sleeps, random stress, or duplicated accounting logic needed.
		require.NoError(t, DB.Model(&Token{}).Where("id = ?", token.Id).Update("daily_budget_used", 0).Error)
	}))
	defer DB.Callback().Update().Remove("test:budget-concurrent-refund")
	reserved, err := TryReserveTokenQuota(token.Id, token.Key, 50, false, at)
	require.True(t, refunded)
	assert.False(t, reserved)
	assert.ErrorIs(t, err, ErrTokenBudgetExceeded)
	assert.Equal(t, int64(0), getTokenFromDB(t, token.Id).DailyBudgetUsed)
}
