package model

import (
	"context"
	"encoding/base64"
	"errors"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

var ErrInvalidReconciliationCursor = errors.New("invalid reconciliation cursor")

var reconciliationSources = []string{"consume", "refund", "topup", "redemption", "reward"}

type WalletReconciliationSummary struct {
	ConsumeQuota         int64 `json:"consume_quota"`
	RefundQuota          int64 `json:"refund_quota"`
	NetLogQuota          int64 `json:"net_log_quota"`
	CollectedQuota       int64 `json:"collected_quota"`
	CollectionDifference int64 `json:"collection_difference"`
	CompletedTopups      int64 `json:"completed_topups"`
	RedemptionQuota      int64 `json:"redemption_quota"`
	RewardQuota          int64 `json:"reward_quota"`
}

type WalletReconciliationCoverage struct {
	CompleteLedger       bool     `json:"complete_ledger"`
	ConsumeLogsEnabled   bool     `json:"consume_logs_enabled"`
	CollectionEnabled    bool     `json:"collection_enabled"`
	FlushIntervalMinutes int      `json:"flush_interval_minutes"`
	UnlinkedLogEvents    int64    `json:"unlinked_log_events"`
	Limitations          []string `json:"limitations"`
}

// A source event identifies a recorded transaction, not a reconstructed wallet
// movement. In particular old top-up orders have no reliable quota snapshot.
// Refund and consume amounts may relate to wallet or subscription funding.
// Redemption quota is the current code record, which an administrator may have
// edited after use; it is not an immutable historical credit snapshot.
type WalletReconciliationEvent struct {
	Source        string `json:"source"`
	ID            int    `json:"id"`
	OccurredAt    int64  `json:"occurred_at"`
	Quota         *int64 `json:"quota"`
	Reference     string `json:"reference"`
	RequestID     string `json:"request_id"`
	TaskID        string `json:"task_id"`
	ModelName     string `json:"model_name"`
	UseGroup      string `json:"use_group"`
	TokenName     string `json:"token_name"`
	BillingSource string `json:"billing_source"`
}

type WalletReconciliationReport struct {
	Month       string                       `json:"month"`
	WindowStart int64                        `json:"window_start"`
	WindowEnd   int64                        `json:"window_end"`
	GeneratedAt int64                        `json:"generated_at"`
	Summary     WalletReconciliationSummary  `json:"summary"`
	Coverage    WalletReconciliationCoverage `json:"coverage"`
	Events      []WalletReconciliationEvent  `json:"events"`
	Source      string                       `json:"source"`
	Total       int64                        `json:"total"`
	PageSize    int                          `json:"page_size"`
	HasMore     bool                         `json:"has_more"`
	NextCursor  string                       `json:"next_cursor"`
}

type reconciliationCursor struct {
	Month     string `json:"month"`
	Filter    string `json:"filter"`
	Source    string `json:"source"`
	CreatedAt int64  `json:"created_at"`
	ID        int    `json:"id"`
	RequestID string `json:"request_id"`
}

func GetWalletReconciliation(ctx context.Context, userID int, month time.Time, source, cursorText string, pageSize int) (*WalletReconciliationReport, error) {
	if source == "" {
		source = "all"
	}
	if source != "all" && !slices.Contains(reconciliationSources, source) {
		return nil, ErrInvalidReconciliationCursor
	}
	start := time.Date(month.Year(), month.Month(), 1, 0, 0, 0, 0, time.UTC)
	end := start.AddDate(0, 1, 0)
	var cursor *reconciliationCursor
	if cursorText != "" {
		if len(cursorText) > 1024 {
			return nil, ErrInvalidReconciliationCursor
		}
		encoded, err := base64.RawURLEncoding.DecodeString(cursorText)
		if err != nil {
			return nil, ErrInvalidReconciliationCursor
		}
		cursor = &reconciliationCursor{}
		if common.Unmarshal(encoded, cursor) != nil || cursor.Month != start.Format("2006-01") || cursor.Filter != source || !slices.Contains(reconciliationSources, cursor.Source) || source != "all" && cursor.Source != source || cursor.CreatedAt < start.Unix() || cursor.CreatedAt >= end.Unix() || cursor.ID < 0 || len(cursor.RequestID) > 64 {
			return nil, ErrInvalidReconciliationCursor
		}
	}
	pageSize = max(1, min(100, pageSize))
	report := &WalletReconciliationReport{
		Month: start.Format("2006-01"), WindowStart: start.Unix(), WindowEnd: end.Unix(), GeneratedAt: common.GetTimestamp(),
		Source: source, PageSize: pageSize, Events: make([]WalletReconciliationEvent, 0),
		Coverage: WalletReconciliationCoverage{
			CompleteLedger: false, ConsumeLogsEnabled: common.LogConsumeEnabled,
			CollectionEnabled: common.DataExportEnabled, FlushIntervalMinutes: common.DataExportInterval,
			Limitations: []string{"logs_may_be_retained_or_disabled", "collected_usage_may_lag", "historical_topup_credit_unknown", "historical_rewards_untracked", "wallet_adjustments_not_fully_covered", "funding_sources_mixed", "non_atomic_cross_database_snapshot", "pending_tasks_and_reservations_not_reconciled"},
		},
	}
	// Old ClickHouse rows may have both the synthetic id=0 and no request ID.
	// Their values remain in the aggregates, but no cursor can identify them
	// reliably. Count and disclose that gap instead of inventing row identities.
	if err := LOG_DB.WithContext(ctx).Model(&Log{}).
		Where("user_id = ? AND created_at >= ? AND created_at < ? AND type IN ? AND id = 0 AND request_id = ''", userID, start.Unix(), end.Unix(), []int{LogTypeConsume, LogTypeRefund}).
		Count(&report.Coverage.UnlinkedLogEvents).Error; err != nil {
		return nil, err
	}
	if report.Coverage.UnlinkedLogEvents > 0 {
		report.Coverage.Limitations = append(report.Coverage.Limitations, "legacy_log_events_without_identifiers")
	}
	var logTotals []struct {
		Type  int
		Quota int64
	}
	if err := LOG_DB.WithContext(ctx).Model(&Log{}).
		Where("user_id = ? AND created_at >= ? AND created_at < ? AND type IN ?", userID, start.Unix(), end.Unix(), []int{LogTypeConsume, LogTypeRefund}).
		Select("type, COALESCE(SUM(quota), 0) AS quota").Group("type").Scan(&logTotals).Error; err != nil {
		return nil, err
	}
	for _, total := range logTotals {
		if total.Type == LogTypeConsume {
			report.Summary.ConsumeQuota = total.Quota
		} else {
			report.Summary.RefundQuota = total.Quota
		}
	}
	report.Summary.NetLogQuota = report.Summary.ConsumeQuota - report.Summary.RefundQuota
	if err := DB.WithContext(ctx).Model(&QuotaData{}).
		Where("user_id = ? AND created_at >= ? AND created_at < ?", userID, start.Unix(), end.Unix()).
		Select("COALESCE(SUM(quota), 0)").Scan(&report.Summary.CollectedQuota).Error; err != nil {
		return nil, err
	}
	// quota_data collects consumption only. Refunds are separately shown and
	// must not be subtracted from the log side of this source comparison.
	report.Summary.CollectionDifference = report.Summary.CollectedQuota - report.Summary.ConsumeQuota
	for _, eventSource := range reconciliationSources {
		query := reconciliationSourceQuery(ctx, userID, eventSource, start.Unix(), end.Unix())
		var count int64
		if err := query.Count(&count).Error; err != nil {
			return nil, err
		}
		if eventSource == "topup" {
			report.Summary.CompletedTopups = count
		}
		if eventSource == "redemption" || eventSource == "reward" {
			var quota int64
			if err := reconciliationSourceQuery(ctx, userID, eventSource, start.Unix(), end.Unix()).Select("COALESCE(SUM(quota), 0)").Scan(&quota).Error; err != nil {
				return nil, err
			}
			if eventSource == "redemption" {
				report.Summary.RedemptionQuota = quota
			} else {
				report.Summary.RewardQuota = quota
			}
		}
		if source != "all" && source != eventSource {
			continue
		}
		report.Total += count
		events, err := reconciliationSourceEvents(ctx, userID, eventSource, start.Unix(), end.Unix(), cursor, pageSize+1)
		if err != nil {
			return nil, err
		}
		report.Events = append(report.Events, events...)
	}
	slices.SortFunc(report.Events, func(a, b WalletReconciliationEvent) int {
		if a.OccurredAt != b.OccurredAt {
			if a.OccurredAt > b.OccurredAt {
				return -1
			}
			return 1
		}
		if a.Source != b.Source {
			return slices.Index(reconciliationSources, a.Source) - slices.Index(reconciliationSources, b.Source)
		}
		if a.ID != b.ID {
			if a.ID > b.ID {
				return -1
			}
			return 1
		}
		return strings.Compare(b.RequestID, a.RequestID)
	})
	report.HasMore = len(report.Events) > pageSize
	if report.HasMore {
		report.Events = report.Events[:pageSize]
		last := report.Events[len(report.Events)-1]
		encoded, err := common.Marshal(reconciliationCursor{Month: report.Month, Filter: source, Source: last.Source, CreatedAt: last.OccurredAt, ID: last.ID, RequestID: last.RequestID})
		if err != nil {
			return nil, err
		}
		report.NextCursor = base64.RawURLEncoding.EncodeToString(encoded)
	}
	return report, nil
}

func reconciliationSourceQuery(ctx context.Context, userID int, source string, start, end int64) *gorm.DB {
	switch source {
	case "consume", "refund":
		logType := LogTypeConsume
		if source == "refund" {
			logType = LogTypeRefund
		}
		return LOG_DB.WithContext(ctx).Model(&Log{}).Where("user_id = ? AND created_at >= ? AND created_at < ? AND type = ? AND (id > 0 OR request_id <> '')", userID, start, end, logType)
	case "topup":
		return DB.WithContext(ctx).Model(&TopUp{}).Where("user_id = ? AND complete_time >= ? AND complete_time < ? AND status = ?", userID, start, end, common.TopUpStatusSuccess)
	case "redemption":
		// Soft deletion is an administrative cleanup, not a reversal.
		return DB.WithContext(ctx).Unscoped().Model(&Redemption{}).Where("used_user_id = ? AND redeemed_time >= ? AND redeemed_time < ? AND status = ?", userID, start, end, common.RedemptionCodeStatusUsed)
	default:
		return DB.WithContext(ctx).Model(&AffiliateReward{}).Where("user_id = ? AND created_at >= ? AND created_at < ?", userID, start, end)
	}
}

func reconciliationSourceEvents(ctx context.Context, userID int, source string, start, end int64, cursor *reconciliationCursor, limit int) ([]WalletReconciliationEvent, error) {
	query := reconciliationSourceQuery(ctx, userID, source, start, end)
	timeColumn := "created_at"
	if source == "topup" {
		timeColumn = "complete_time"
	} else if source == "redemption" {
		timeColumn = "redeemed_time"
	}
	isLog := source == "consume" || source == "refund"
	if cursor != nil {
		sourceOrder := slices.Index(reconciliationSources, source) - slices.Index(reconciliationSources, cursor.Source)
		switch {
		case sourceOrder < 0:
			query = query.Where(timeColumn+" < ?", cursor.CreatedAt)
		case sourceOrder > 0:
			query = query.Where(timeColumn+" <= ?", cursor.CreatedAt)
		case isLog:
			query = query.Where("created_at < ? OR (created_at = ? AND (id < ? OR (id = ? AND request_id < ?)))", cursor.CreatedAt, cursor.CreatedAt, cursor.ID, cursor.ID, cursor.RequestID)
		default:
			query = query.Where(timeColumn+" < ? OR ("+timeColumn+" = ? AND id < ?)", cursor.CreatedAt, cursor.CreatedAt, cursor.ID)
		}
	}
	query = query.Order(timeColumn + " DESC, id DESC").Limit(limit)
	events := make([]WalletReconciliationEvent, 0, limit)
	switch source {
	case "consume", "refund":
		var logs []Log
		if err := query.Select([]string{"id", "created_at", "quota", "request_id", "model_name", "group", "token_name", "other"}).Order("request_id DESC").Find(&logs).Error; err != nil {
			return nil, err
		}
		for _, log := range logs {
			var metadata struct {
				TaskID        string `json:"task_id"`
				BillingSource string `json:"billing_source"`
			}
			// Only explicit public structured fields are projected. Never expose
			// the log's content, credentials, IP, admin_info or upstream details.
			if common.UnmarshalJsonStr(log.Other, &metadata) != nil {
				metadata.TaskID, metadata.BillingSource = "", ""
			}
			if metadata.BillingSource != "wallet" && metadata.BillingSource != "subscription" {
				metadata.BillingSource = "unknown"
			}
			quota := int64(log.Quota)
			events = append(events, WalletReconciliationEvent{Source: source, ID: log.Id, OccurredAt: log.CreatedAt, Quota: &quota, Reference: log.RequestId, RequestID: log.RequestId, TaskID: metadata.TaskID, ModelName: log.ModelName, UseGroup: log.Group, TokenName: log.TokenName, BillingSource: metadata.BillingSource})
		}
	case "topup":
		var orders []TopUp
		if err := query.Select("id, complete_time, trade_no").Find(&orders).Error; err != nil {
			return nil, err
		}
		for _, order := range orders {
			// Subscription payments can be mirrored into TopUp as well. The
			// historical record alone does not prove a wallet credit.
			events = append(events, WalletReconciliationEvent{Source: source, ID: order.Id, OccurredAt: order.CompleteTime, Reference: order.TradeNo, BillingSource: "unknown"})
		}
	case "redemption":
		var codes []Redemption
		if err := query.Select("id, redeemed_time, quota").Find(&codes).Error; err != nil {
			return nil, err
		}
		for _, code := range codes {
			quota := int64(code.Quota)
			events = append(events, WalletReconciliationEvent{Source: source, ID: code.Id, OccurredAt: code.RedeemedTime, Quota: &quota, Reference: strconv.Itoa(code.Id), BillingSource: "wallet"})
		}
	default:
		var rewards []AffiliateReward
		if err := query.Select("id, created_at, quota").Find(&rewards).Error; err != nil {
			return nil, err
		}
		for _, reward := range rewards {
			quota := int64(reward.Quota)
			events = append(events, WalletReconciliationEvent{Source: source, ID: reward.Id, OccurredAt: reward.CreatedAt, Quota: &quota, Reference: strconv.Itoa(reward.Id), BillingSource: "referral"})
		}
	}
	return events, nil
}
