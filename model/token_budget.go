package model

import (
	"errors"
	"fmt"
	"time"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var ErrTokenBudgetExceeded = errors.New("API key daily or monthly spending budget is exhausted")

func TokenBudgetPeriods(at int64) (day, month int64) {
	now := time.Unix(at, 0).UTC()
	day = time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC).Unix()
	month = time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC).Unix()
	return
}

func tokenBudgetTimestamp(at []int64) int64 {
	if len(at) > 0 && at[0] > 0 {
		return at[0]
	}
	return common.GetTimestamp()
}

func TokenHasBudget(id int) (bool, error) {
	var token Token
	err := DB.Select("daily_budget", "monthly_budget").First(&token, id).Error
	return token.DailyBudget > 0 || token.MonthlyBudget > 0, err
}

// Each budget update is one conditional SQL statement, including on SQLite
// where SELECT FOR UPDATE is unavailable. Lifetime quota retains its existing
// Redis/batch accounting; a failed lifetime reservation compensates this one.
func applyTokenBudgetDelta(id int, delta, at int64, reserve bool) (bool, error) {
	var token Token
	if err := DB.Select("id", "daily_budget", "monthly_budget", "daily_budget_start", "monthly_budget_start").First(&token, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) && !reserve {
			return false, nil
		}
		return false, err
	}
	if token.DailyBudget == 0 && token.MonthlyBudget == 0 && token.DailyBudgetStart == 0 && token.MonthlyBudgetStart == 0 {
		return false, nil
	}
	day, month := TokenBudgetPeriods(at)
	query := DB.Model(&Token{}).Where("id = ?", id)
	if reserve {
		// A cap pauses new submissions even if their initial estimate is zero.
		for _, period := range []struct {
			prefix string
			start  int64
		}{{"daily", day}, {"monthly", month}} {
			name := period.prefix + "_budget"
			query = query.Where(fmt.Sprintf("(%s = 0 OR %s_start > ? OR (%s_start < ? AND %s >= ? AND %s > 0) OR (%s_start = ? AND %s_used < %s AND %s_used <= %s - ?))", name, name, name, name, name, name, name, name, name, name), period.start, period.start, delta, period.start, delta)
		}
	}
	assignments := clause.Set{}
	starts := clause.Set{}
	for _, period := range []struct {
		prefix string
		start  int64
	}{{"daily", day}, {"monthly", month}} {
		name := period.prefix + "_budget"
		used := name + "_used"
		start := name + "_start"
		// Old request refunds/settlement never change a newer period. Positive
		// final settlement may exceed the estimate; keep the actual charge and
		// block later submissions instead of silently dropping billable usage.
		expression := fmt.Sprintf("CASE WHEN %s > ? THEN %s WHEN %s < ? THEN ? WHEN ? > 0 AND %s > ? THEN ? WHEN %s + ? < 0 THEN 0 ELSE %s + ? END", start, used, start, used, used, used)
		assignments = append(assignments, clause.Assignment{Column: clause.Column{Name: used}, Value: gorm.Expr(expression, period.start, period.start, min(int64(common.MaxWalletQuota), max(int64(0), delta)), delta, int64(common.MaxWalletQuota)-max(int64(0), delta), int64(common.MaxWalletQuota), delta, delta)})
		starts = append(starts, clause.Assignment{Column: clause.Column{Name: start}, Value: gorm.Expr(fmt.Sprintf("CASE WHEN %s < ? THEN ? ELSE %s END", start, start), period.start, period.start)})
	}
	// MySQL evaluates assignments left to right: update usages before starts.
	assignments = append(assignments, starts...)
	result := query.Clauses(assignments).Updates(map[string]any{})
	if result.Error != nil {
		return true, result.Error
	}
	if result.RowsAffected == 0 && reserve {
		// A positive current-period reservation must actually change counters.
		// Do not turn a failed UPDATE into success merely because a concurrent
		// refund subsequently makes its cap predicate match.
		if delta > 0 {
			query = query.Where("daily_budget_start > ? AND monthly_budget_start > ?", day, month)
		}
		// MySQL reports changed rows: zero-cost checks and fully old-period
		// adjustments can match without changing a value.
		var matched int64
		if err := query.Count(&matched).Error; err != nil {
			return true, err
		}
		if matched == 0 {
			return true, ErrTokenBudgetExceeded
		}
	}
	return true, nil
}

func adjustTokenQuotaWithBudget(id int, key string, delta int, at int64) error {
	if delta == 0 {
		return nil
	}
	handled, err := applyTokenBudgetDelta(id, int64(delta), at, false)
	if err != nil {
		return err
	}
	if delta > 0 {
		err = decreaseTokenQuotaAccounting(id, key, delta)
	} else {
		err = increaseTokenQuotaAccounting(id, key, -delta)
	}
	if err != nil && handled {
		_, rollbackErr := applyTokenBudgetDelta(id, -int64(delta), at, false)
		return errors.Join(err, rollbackErr)
	}
	return err
}

// ClaimTokenBudgetNotices durably deduplicates each 80% notice by UTC period.
// Usage includes reservations, so notifications are claimed after settlement.
func ClaimTokenBudgetNotices(id int, at int64) ([]string, error) {
	day, month := TokenBudgetPeriods(at)
	var notices []string
	for _, period := range []struct {
		prefix string
		start  int64
	}{{"daily", day}, {"monthly", month}} {
		name := period.prefix + "_budget"
		result := DB.Model(&Token{}).Where("id = ? AND budget_reminder_enabled = ?", id, true).
			Where(name+" > 0 AND "+name+"_start = ? AND "+name+"_notified < ?", period.start, period.start).
			Where(name+"_used >= ("+name+" - "+name+" / 5)").Update(name+"_notified", period.start)
		if result.Error != nil {
			return nil, result.Error
		}
		if result.RowsAffected == 1 {
			notices = append(notices, period.prefix)
		}
	}
	return notices, nil
}
