package model

import (
	"context"
	"database/sql"
	"time"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

const MonthlyWalletReportLimit = 100

type MonthlyUsageTotals struct {
	Quota     int64 `json:"quota"`
	Count     int64 `json:"count"`
	TokenUsed int64 `json:"token_used"`
}

type MonthlyUsageRow struct {
	ModelName string `json:"model_name"`
	UseGroup  string `json:"use_group"`
	TokenID   int    `json:"token_id"`
	TokenName string `json:"token_name" gorm:"->"`
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
	Page                 int                `json:"page"`
	PageSize             int                `json:"page_size"`
	Total                int64              `json:"total"`
	PageCount            int64              `json:"page_count"`
	Summary              MonthlyUsageTotals `json:"summary"`
	CompletedTopups      int64              `json:"completed_topups"`
	Rows                 []MonthlyUsageRow  `json:"rows"`
}

func GetMonthlyWalletReport(userID int, month time.Time) (*MonthlyWalletReport, error) {
	return GetMonthlyWalletReportPage(context.Background(), userID, month, 1, 50)
}

func monthlyUsageQuery(ctx context.Context, userID int, start, end time.Time) *gorm.DB {
	usage := DB.WithContext(ctx).Model(&QuotaData{}).
		Where("user_id = ? AND created_at >= ? AND created_at < ?", userID, start.Unix(), end.Unix()).
		Select("model_name, use_group, token_id, SUM(quota) AS quota, SUM(count) AS count, SUM(token_used) AS token_used").
		Group("model_name, use_group, token_id")
	// Resolve names using independently scoped token ownership: a stale or
	// corrupt collected token ID must not disclose another user's token name.
	tokens := DB.WithContext(ctx).Model(&Token{}).Select("id, name").Where("user_id = ?", userID)
	return DB.WithContext(ctx).Table("(?) AS monthly_usage", usage).
		Joins("LEFT JOIN (?) AS report_tokens ON report_tokens.id = monthly_usage.token_id", tokens).
		Select("monthly_usage.*, COALESCE(report_tokens.name, '') AS token_name")
}

func GetMonthlyWalletReportPage(ctx context.Context, userID int, month time.Time, page, pageSize int) (*MonthlyWalletReport, error) {
	start := time.Date(month.Year(), month.Month(), 1, 0, 0, 0, 0, time.UTC)
	end := start.AddDate(0, 1, 0)
	page = max(1, min(1000000, page))
	pageSize = max(1, min(MonthlyWalletReportLimit, pageSize))
	report := &MonthlyWalletReport{
		Month: start.Format("2006-01"), WindowStart: start.Unix(), WindowEnd: end.Unix(),
		GeneratedAt: common.GetTimestamp(), Source: "quota_data",
		CollectionEnabled: common.DataExportEnabled, FlushIntervalMinutes: common.DataExportInterval,
		RowLimit: MonthlyWalletReportLimit, Page: page, PageSize: pageSize, Rows: make([]MonthlyUsageRow, 0),
	}
	base := DB.WithContext(ctx).Model(&QuotaData{}).Where("user_id = ? AND created_at >= ? AND created_at < ?", userID, start.Unix(), end.Unix())
	if err := base.Select("COALESCE(SUM(quota), 0) AS quota, COALESCE(SUM(count), 0) AS count, COALESCE(SUM(token_used), 0) AS token_used").Scan(&report.Summary).Error; err != nil {
		return nil, err
	}
	if err := monthlyUsageQuery(ctx, userID, start, end).Count(&report.Total).Error; err != nil {
		return nil, err
	}
	report.PageCount = (report.Total + int64(pageSize) - 1) / int64(pageSize)
	if err := monthlyUsageQuery(ctx, userID, start, end).
		Order("monthly_usage.quota DESC, monthly_usage.model_name ASC, monthly_usage.use_group ASC, monthly_usage.token_id ASC").
		Limit(pageSize).Offset((page - 1) * pageSize).Scan(&report.Rows).Error; err != nil {
		return nil, err
	}
	// Providers store Amount and Money in different units, and historical
	// orders do not snapshot the credited quota. Count successful orders only.
	if err := DB.WithContext(ctx).Model(&TopUp{}).
		Where("user_id = ? AND status = ? AND complete_time >= ? AND complete_time < ?", userID, common.TopUpStatusSuccess, start.Unix(), end.Unix()).
		Count(&report.CompletedTopups).Error; err != nil {
		return nil, err
	}
	return report, nil
}

// OpenMonthlyWalletReportRows streams all grouped rows using one database
// cursor. The caller must close it and honor the supplied request context.
func OpenMonthlyWalletReportRows(ctx context.Context, userID int, month time.Time) (*sql.Rows, error) {
	start := time.Date(month.Year(), month.Month(), 1, 0, 0, 0, 0, time.UTC)
	return monthlyUsageQuery(ctx, userID, start, start.AddDate(0, 1, 0)).
		Order("monthly_usage.quota DESC, monthly_usage.model_name ASC, monthly_usage.use_group ASC, monthly_usage.token_id ASC").Rows()
}
