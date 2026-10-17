package model

import (
	"time"

	"github.com/QuantumNous/new-api/common"
)

const MonthlyWalletReportLimit = 5000

type MonthlyUsageTotals struct {
	Quota     int64 `json:"quota"`
	Count     int64 `json:"count"`
	TokenUsed int64 `json:"token_used"`
}

type MonthlyUsageRow struct {
	ModelName string `json:"model_name"`
	UseGroup  string `json:"use_group"`
	TokenID   int    `json:"token_id"`
	TokenName string `json:"token_name" gorm:"-"`
	MonthlyUsageTotals
}

// MonthlyWalletReport is a report of collected usage, not an accounting
// ledger. quota_data is asynchronously collected and may have historic gaps.
type MonthlyWalletReport struct {
	Month                string             `json:"month"`
	WindowStart          int64              `json:"window_start"`
	WindowEnd            int64              `json:"window_end"`
	GeneratedAt          int64              `json:"generated_at"`
	Source               string             `json:"source"`
	CollectionEnabled    bool               `json:"collection_enabled"`
	FlushIntervalMinutes int                `json:"flush_interval_minutes"`
	Truncated            bool               `json:"truncated"`
	RowLimit             int                `json:"row_limit"`
	Summary              MonthlyUsageTotals `json:"summary"`
	CompletedTopups      int64              `json:"completed_topups"`
	Rows                 []MonthlyUsageRow  `json:"rows"`
}

func GetMonthlyWalletReport(userID int, month time.Time) (*MonthlyWalletReport, error) {
	start := time.Date(month.Year(), month.Month(), 1, 0, 0, 0, 0, time.UTC)
	end := start.AddDate(0, 1, 0)
	report := &MonthlyWalletReport{
		Month: start.Format("2006-01"), WindowStart: start.Unix(), WindowEnd: end.Unix(),
		GeneratedAt: common.GetTimestamp(), Source: "quota_data",
		CollectionEnabled: common.DataExportEnabled, FlushIntervalMinutes: common.DataExportInterval,
		RowLimit: MonthlyWalletReportLimit, Rows: make([]MonthlyUsageRow, 0),
	}
	base := DB.Model(&QuotaData{}).Where("user_id = ? AND created_at >= ? AND created_at < ?", userID, start.Unix(), end.Unix())
	if err := base.Select("COALESCE(SUM(quota), 0) AS quota, COALESCE(SUM(count), 0) AS count, COALESCE(SUM(token_used), 0) AS token_used").Scan(&report.Summary).Error; err != nil {
		return nil, err
	}
	if err := DB.Model(&QuotaData{}).
		Where("user_id = ? AND created_at >= ? AND created_at < ?", userID, start.Unix(), end.Unix()).
		Select("model_name, use_group, token_id, SUM(quota) AS quota, SUM(count) AS count, SUM(token_used) AS token_used").
		Group("model_name, use_group, token_id").Order("quota DESC, model_name ASC, use_group ASC, token_id ASC").
		Limit(MonthlyWalletReportLimit + 1).Scan(&report.Rows).Error; err != nil {
		return nil, err
	}
	if len(report.Rows) > MonthlyWalletReportLimit {
		report.Truncated = true
		report.Rows = report.Rows[:MonthlyWalletReportLimit]
	}
	tokenIDs := make([]int, 0, len(report.Rows))
	for _, row := range report.Rows {
		if row.TokenID > 0 {
			tokenIDs = append(tokenIDs, row.TokenID)
		}
	}
	if len(tokenIDs) > 0 {
		var tokens []struct {
			Id   int
			Name string
		}
		if err := DB.Model(&Token{}).Select("id, name").Where("user_id = ? AND id IN ?", userID, tokenIDs).Find(&tokens).Error; err != nil {
			return nil, err
		}
		names := make(map[int]string, len(tokens))
		for _, token := range tokens {
			names[token.Id] = token.Name
		}
		for i := range report.Rows {
			report.Rows[i].TokenName = names[report.Rows[i].TokenID]
		}
	}
	// Providers store Amount and Money in different units, and historical
	// orders do not snapshot the credited quota. Count successful orders only.
	if err := DB.Model(&TopUp{}).
		Where("user_id = ? AND status = ? AND complete_time >= ? AND complete_time < ?", userID, common.TopUpStatusSuccess, start.Unix(), end.Unix()).
		Count(&report.CompletedTopups).Error; err != nil {
		return nil, err
	}
	return report, nil
}
