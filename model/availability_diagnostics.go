package model

import (
	"cmp"
	"context"
	"slices"

	"gorm.io/gorm"
)

const AvailabilityDiagnosticsSampleLimit = 20000

type AvailabilityErrorCount struct {
	Category string `json:"category"`
	Count    int64  `json:"count"`
}

type AvailabilityAffectedChannel struct {
	ID       int    `json:"id" gorm:"column:channel_id"`
	Name     string `json:"name" gorm:"-"`
	Failures int64  `json:"failures"`
}

type AvailabilityDiagnostics struct {
	ModelName                   string                        `json:"model_name"`
	Group                       string                        `json:"group"`
	Source                      string                        `json:"source"`
	WindowStart                 int64                         `json:"window_start"`
	WindowEnd                   int64                         `json:"window_end"`
	RequestCount                int64                         `json:"request_count"`
	SuccessCount                int64                         `json:"success_count"`
	FailureCount                int64                         `json:"failure_count"`
	UnsupportedCount            int64                         `json:"unsupported_count"`
	LatencySampleCount          int64                         `json:"latency_sample_count"`
	P50LatencyMs                *int64                        `json:"p50_latency_ms"`
	P95LatencyMs                *int64                        `json:"p95_latency_ms"`
	P99LatencyMs                *int64                        `json:"p99_latency_ms"`
	LatestSampleAt              int64                         `json:"latest_sample_at"`
	LatestBucketAt              int64                         `json:"latest_bucket_at"`
	CollectionDelaySeconds      int64                         `json:"collection_delay_seconds"`
	SampleLimit                 int                           `json:"sample_limit"`
	Truncated                   bool                          `json:"truncated"`
	PercentileUnavailableReason string                        `json:"percentile_unavailable_reason"`
	ErrorCategories             []AvailabilityErrorCount      `json:"error_categories"`
	AffectedChannels            []AvailabilityAffectedChannel `json:"affected_channels"`
	AffectedChannelsTruncated   bool                          `json:"affected_channels_truncated"`
	UnattributedFailures        int64                         `json:"unattributed_failures"`
}

// QueryAvailabilityDiagnostics returns an administrator-only projection. Probe
// lookups use the model/group hash plus checked_at composite index; counts are
// database aggregates, and at most 20,000 latency values and 100 affected
// channels cross the database boundary. No minute-level relay samples are added.
func QueryAvailabilityDiagnostics(ctx context.Context, source string, pair AvailabilityPair, start, end int64) (AvailabilityDiagnostics, error) {
	result := AvailabilityDiagnostics{
		ModelName: pair.Model, Group: pair.Group, Source: source, WindowStart: start, WindowEnd: end,
		SampleLimit:     AvailabilityDiagnosticsSampleLimit,
		ErrorCategories: []AvailabilityErrorCount{}, AffectedChannels: []AvailabilityAffectedChannel{},
	}
	if source == "real" {
		var row struct {
			Requests, Successes, LatestBucket int64
		}
		err := DB.WithContext(ctx).Model(&PerfMetric{}).
			Select("COALESCE(SUM(request_count), 0) AS requests, COALESCE(SUM(success_count), 0) AS successes, COALESCE(MAX(bucket_ts), 0) AS latest_bucket").
			Where(map[string]any{"model_name": pair.Model, "group": pair.Group}).
			Where("bucket_ts >= ? AND bucket_ts <= ?", start, end).Scan(&row).Error
		result.RequestCount, result.SuccessCount, result.LatestBucketAt = row.Requests, row.Successes, row.LatestBucket
		result.FailureCount = max(0, row.Requests-row.Successes)
		result.PercentileUnavailableReason = "aggregated_real_metrics"
		return result, err
	}
	query := func() *gorm.DB {
		return DB.WithContext(ctx).Model(&AvailabilityProbeSample{}).
			Where("pair_key = ? AND checked_at >= ? AND checked_at <= ?", AvailabilityPairKey("probe", pair.Model, pair.Group), start, end)
	}
	var outcomes []struct {
		Outcome, ReasonCode string
		Count, LatestAt     int64
	}
	if err := query().Select("outcome, reason_code, COUNT(*) AS count, MAX(checked_at) AS latest_at").Group("outcome, reason_code").Find(&outcomes).Error; err != nil {
		return result, err
	}
	categories := map[string]int64{}
	for _, row := range outcomes {
		result.LatestSampleAt = max(result.LatestSampleAt, row.LatestAt)
		switch row.Outcome {
		case "success":
			result.SuccessCount += row.Count
		case "failure":
			result.FailureCount += row.Count
			category := row.ReasonCode
			if !slices.Contains([]string{"probe_failed", "probe_timeout", "probe_unavailable"}, category) {
				category = "unknown"
			}
			categories[category] += row.Count
		case "unsupported":
			result.UnsupportedCount += row.Count
		}
	}
	result.RequestCount = result.SuccessCount + result.FailureCount
	for category, count := range categories {
		result.ErrorCategories = append(result.ErrorCategories, AvailabilityErrorCount{Category: category, Count: count})
	}
	slices.SortFunc(result.ErrorCategories, func(a, b AvailabilityErrorCount) int { return cmp.Compare(a.Category, b.Category) })
	latencies := []int64{}
	latencyQuery := query().Where("outcome IN ? AND latency_ms > 0", []string{"success", "failure"})
	if err := latencyQuery.Count(&result.LatencySampleCount).Error; err != nil {
		return result, err
	}
	if result.LatencySampleCount > AvailabilityDiagnosticsSampleLimit {
		result.Truncated = true
		result.PercentileUnavailableReason = "sample_limit"
	} else if result.LatencySampleCount == 0 {
		result.PercentileUnavailableReason = "no_latency_samples"
	} else {
		// All measured samples are loaded, never a biased prefix. Nearest-rank
		// percentiles describe successful and failed measured probes together.
		if err := latencyQuery.Select("latency_ms").Order("latency_ms ASC").Limit(AvailabilityDiagnosticsSampleLimit + 1).Scan(&latencies).Error; err != nil {
			return result, err
		}
		if len(latencies) > AvailabilityDiagnosticsSampleLimit || int64(len(latencies)) != result.LatencySampleCount {
			result.Truncated = true
			result.PercentileUnavailableReason = "samples_changed"
		} else {
			p50 := latencies[(len(latencies)*50+99)/100-1]
			p95 := latencies[(len(latencies)*95+99)/100-1]
			p99 := latencies[(len(latencies)*99+99)/100-1]
			result.P50LatencyMs, result.P95LatencyMs, result.P99LatencyMs = &p50, &p95, &p99
		}
	}
	if err := query().Where("outcome = ? AND (channel_id IS NULL OR channel_id = ?)", "failure", 0).Count(&result.UnattributedFailures).Error; err != nil {
		return result, err
	}
	if err := query().Select("channel_id, COUNT(*) AS failures").Where("outcome = ? AND channel_id > ?", "failure", 0).
		Group("channel_id").Order("failures DESC, channel_id ASC").Limit(101).Find(&result.AffectedChannels).Error; err != nil {
		return result, err
	}
	if len(result.AffectedChannels) > 100 {
		result.AffectedChannelsTruncated = true
		result.AffectedChannels = result.AffectedChannels[:100]
	}
	if len(result.AffectedChannels) > 0 {
		ids := make([]int, 0, len(result.AffectedChannels))
		for _, channel := range result.AffectedChannels {
			ids = append(ids, channel.ID)
		}
		var channels []Channel
		if err := DB.WithContext(ctx).Model(&Channel{}).Select("id, name").Where("id IN ?", ids).Find(&channels).Error; err != nil {
			return result, err
		}
		names := map[int]string{}
		for _, channel := range channels {
			names[channel.Id] = channel.Name
		}
		for i := range result.AffectedChannels {
			result.AffectedChannels[i].Name = names[result.AffectedChannels[i].ID]
		}
	}
	return result, nil
}
