package service

import (
	"context"
	"slices"
	"sort"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	perfmetrics "github.com/QuantumNous/new-api/pkg/perf_metrics"
	"github.com/QuantumNous/new-api/setting/availability_setting"
	"github.com/QuantumNous/new-api/setting/perf_metrics_setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/gin-gonic/gin"
)

// AvailabilityPairs uses enabled catalog entries and current configured groups;
// no user-controlled model/group string can expand this set.
func AvailabilityPairs(c *gin.Context) ([]model.AvailabilityPair, error) {
	abilities, err := model.GetAllEnableAbilityWithChannels()
	if err != nil {
		return nil, err
	}
	groups := ratio_setting.GetGroupRatioCopy()
	allowed := map[string]string{}
	if c != nil && c.GetInt("role") < common.RoleAdminUser {
		group, err := model.GetUserGroup(c.GetInt("id"), false)
		if err != nil {
			return nil, err
		}
		allowed = GetUserUsableGroups(group)
	} else {
		for group := range groups {
			allowed[group] = ""
		}
	}
	seen := map[model.AvailabilityPair]bool{}
	pairs := []model.AvailabilityPair{}
	for _, ability := range abilities {
		if _, ok := groups[ability.Group]; !ok {
			continue
		}
		if _, ok := allowed[ability.Group]; !ok {
			continue
		}
		pair := model.AvailabilityPair{Model: ability.Model, Group: ability.Group}
		if !seen[pair] {
			pairs = append(pairs, pair)
			seen[pair] = true
		}
	}
	sort.Slice(pairs, func(i, j int) bool {
		if pairs[i].Model != pairs[j].Model {
			return pairs[i].Model < pairs[j].Model
		}
		return pairs[i].Group < pairs[j].Group
	})
	return pairs, nil
}

// Passive alerts keep configured-but-disabled routes in scope: automatic
// channel disabling must not erase the failed real calls that caused it.
func AvailabilityAlertPairs(ctx context.Context) ([]model.AvailabilityPair, error) {
	catalog, err := model.AvailabilityHistoryPairs(ctx, false)
	if err != nil {
		return nil, err
	}
	groups := ratio_setting.GetGroupRatioCopy()
	pairs := []model.AvailabilityPair{}
	for _, pair := range catalog {
		if _, ok := groups[pair.Group]; ok {
			pairs = append(pairs, pair)
		}
	}
	return pairs, nil
}

func AvailabilityProbeTargets(pairs []model.AvailabilityPair, setting availability_setting.Setting) []model.AvailabilityPair {
	targets := AvailabilityProbeCandidates(pairs, setting)
	return targets[:min(len(targets), max(1, min(setting.ProbeMaxPairs, 200)))]
}

func AvailabilityProbeCandidates(pairs []model.AvailabilityPair, setting availability_setting.Setting) []model.AvailabilityPair {
	targets := []model.AvailabilityPair{}
	if !setting.ProbeEnabled || !setting.HasProbeScope() {
		return targets
	}
	for _, pair := range pairs {
		if !setting.ProbeAllModels && !slices.Contains(setting.ProbeModels, pair.Model) {
			continue
		}
		if !setting.ProbeAllGroups && !slices.Contains(setting.ProbeGroups, pair.Group) {
			continue
		}
		targets = append(targets, pair)
	}
	return targets
}

func ScheduledAvailabilityProbeTargets(ctx context.Context, pairs []model.AvailabilityPair, setting availability_setting.Setting) ([]model.AvailabilityPair, error) {
	candidates := AvailabilityProbeCandidates(pairs, setting)
	latest, err := model.LatestAvailabilityProbesByPair(ctx, candidates)
	if err != nil {
		return nil, err
	}
	// Oldest/never-probed pairs take priority, so a per-cycle cost cap cannot
	// permanently starve models later in the catalog.
	sort.SliceStable(candidates, func(i, j int) bool {
		return latest[model.AvailabilityPairKey("probe", candidates[i].Model, candidates[i].Group)] < latest[model.AvailabilityPairKey("probe", candidates[j].Model, candidates[j].Group)]
	})
	return candidates[:min(len(candidates), max(1, min(setting.ProbeMaxPairs, 200)))], nil
}

func VisibleAvailabilityHistoryPairs(c *gin.Context) ([]model.AvailabilityPair, error) {
	admin := c.GetInt("role") >= common.RoleAdminUser
	pairs, err := model.AvailabilityHistoryPairs(c.Request.Context(), admin)
	if err != nil {
		return nil, err
	}
	if admin {
		seen := map[model.AvailabilityPair]bool{}
		unique := []model.AvailabilityPair{}
		for _, pair := range pairs {
			if !seen[pair] {
				seen[pair] = true
				unique = append(unique, pair)
			}
		}
		return unique, nil
	}
	group, err := model.GetUserGroup(c.GetInt("id"), false)
	if err != nil {
		return nil, err
	}
	allowed := GetUserUsableGroups(group)
	configured := ratio_setting.GetGroupRatioCopy()
	visible := []model.AvailabilityPair{}
	for _, pair := range pairs {
		if _, ok := allowed[pair.Group]; !ok {
			continue
		}
		if _, ok := configured[pair.Group]; ok {
			visible = append(visible, pair)
		}
	}
	return visible, nil
}

func AvailabilityEvaluationWindow(setting availability_setting.Setting, now int64) (int64, int64) {
	bucketSeconds := perf_metrics_setting.GetBucketSeconds()
	window := int64(max(setting.EvaluationWindowMinutes, 1)) * 60
	window = ((window + bucketSeconds - 1) / bucketSeconds) * bucketSeconds
	// Evaluate only completed, non-overlapping windows. Hourly stored metrics
	// cannot truthfully describe a five-minute rolling window.
	end := now/window*window - 1
	return end - window + 1, end
}

func ApplyAvailabilityObservation(ctx context.Context, observation model.AvailabilityObservation, setting availability_setting.Setting, now int64) error {
	if !setting.AlertsEnabled {
		return nil
	}
	notification, err := model.ApplyAvailabilityObservation(ctx, observation, model.AvailabilityAlertPolicy{
		SuccessRateThreshold: setting.SuccessRateThreshold, FailureThreshold: setting.FailureThreshold,
		RecoveryThreshold: setting.RecoveryThreshold, CooldownSeconds: int64(setting.NotificationCooldownMinutes) * 60, SilenceUntil: setting.SilenceUntil,
	}, now)
	if err != nil || notification == nil {
		return err
	}

	return nil
}

func EvaluateRealAvailability(ctx context.Context, pairs []model.AvailabilityPair, setting availability_setting.Setting, now int64) error {
	if !setting.AlertsEnabled || !perf_metrics_setting.GetSetting().Enabled {
		return nil
	}
	start, end := AvailabilityEvaluationWindow(setting, now)
	groups := []string{}
	for _, pair := range pairs {
		if !slices.Contains(groups, pair.Group) {
			groups = append(groups, pair.Group)
		}
	}
	counts, err := perfmetrics.QueryAvailabilityWindow(start, end, groups)
	if err != nil {
		return err
	}
	byPair := map[model.AvailabilityPair]perfmetrics.AvailabilityWindowCounts{}
	for _, row := range counts {
		byPair[model.AvailabilityPair{Model: row.Model, Group: row.Group}] = row
	}
	for _, pair := range pairs {
		if ctx.Err() != nil || !availability_setting.Get().AlertsEnabled {
			return ctx.Err()
		}
		row := byPair[pair]
		rate := float64(0)
		if row.Requests > 0 {
			rate = float64(row.Successes) * 100 / float64(row.Requests)
		}
		err := ApplyAvailabilityObservation(ctx, model.AvailabilityObservation{Model: pair.Model, Group: pair.Group, Source: "real", StartedAt: start, ObservedAt: end, Valid: row.Requests >= int64(setting.MinimumSamples), SuccessRate: rate, MaxGapSeconds: end - start + 1}, setting, now)
		if err != nil {
			return err
		}
	}
	return nil
}

type AvailabilityProbeData struct {
	Summary     *perfmetrics.Summary            `json:"summary"`
	WindowStart int64                           `json:"window_start"`
	WindowEnd   int64                           `json:"window_end"`
	Models      []perfmetrics.ModelSummary      `json:"models"`
	GroupModels []perfmetrics.ModelGroupSummary `json:"group_models"`
}

// QueryAvailabilityProbes returns hourly probe aggregates using the same chart
// projection as real metrics, without exposing sample volumes or raw failures.
func QueryAvailabilityProbes(ctx context.Context, pairs []model.AvailabilityPair, hours int) (AvailabilityProbeData, perfmetrics.QueryResult, error) {
	if hours != 168 {
		hours = 24
	}
	end := time.Now().Unix()
	start := end - end%3600 - int64(hours-1)*3600
	data := AvailabilityProbeData{WindowStart: start, WindowEnd: end, Models: []perfmetrics.ModelSummary{}, GroupModels: []perfmetrics.ModelGroupSummary{}}
	detail := perfmetrics.QueryResult{SeriesSchema: "availability-probe-v1", WindowStart: start, WindowEnd: end, Groups: []perfmetrics.GroupResult{}, Series: []perfmetrics.BucketPoint{}}
	buckets, err := model.QueryAvailabilityProbeBuckets(ctx, start, end, pairs)
	if err != nil {
		return data, detail, err
	}
	type totals struct {
		count   int64
		success int64
		latency int64
	}
	groupTotals := map[model.AvailabilityPair]totals{}
	hourTotals := map[model.AvailabilityPair]map[int64]totals{}
	modelTotals := map[string]totals{}
	total := totals{}
	byKey := make(map[string]model.AvailabilityPair, len(pairs))
	for _, pair := range pairs {
		byKey[model.AvailabilityPairKey("probe", pair.Model, pair.Group)] = pair
	}
	for _, sample := range buckets {
		pair := byKey[sample.PairKey]
		if hourTotals[pair] == nil {
			hourTotals[pair] = map[int64]totals{}
		}
		bucket := sample.BucketTs
		group := groupTotals[pair]
		hour := hourTotals[pair][bucket]
		modelTotal := modelTotals[pair.Model]
		group.count += sample.RequestCount
		hour.count += sample.RequestCount
		modelTotal.count += sample.RequestCount
		total.count += sample.RequestCount
		group.latency += sample.TotalLatencyMs
		hour.latency += sample.TotalLatencyMs
		modelTotal.latency += sample.TotalLatencyMs
		total.latency += sample.TotalLatencyMs
		group.success += sample.SuccessCount
		hour.success += sample.SuccessCount
		modelTotal.success += sample.SuccessCount
		total.success += sample.SuccessCount
		groupTotals[pair] = group
		hourTotals[pair][bucket] = hour
		modelTotals[pair.Model] = modelTotal
	}
	for _, pair := range pairs {
		group := groupTotals[pair]
		if group.count == 0 {
			continue
		}
		summary := perfmetrics.ModelGroupSummary{ModelName: pair.Model, Group: pair.Group, AvgLatencyMs: group.latency / group.count, SuccessRate: float64(group.success) * 100 / float64(group.count)}
		series := []perfmetrics.BucketPoint{}
		for ts, hour := range hourTotals[pair] {
			series = append(series, perfmetrics.BucketPoint{Ts: ts, AvgLatencyMs: hour.latency / hour.count, SuccessRate: float64(hour.success) * 100 / float64(hour.count)})
		}
		sort.Slice(series, func(i, j int) bool { return series[i].Ts < series[j].Ts })
		for _, hour := range series {
			summary.RecentSuccessSeries = append(summary.RecentSuccessSeries, perfmetrics.SuccessRatePoint{Ts: hour.Ts, SuccessRate: hour.SuccessRate})
		}
		data.GroupModels = append(data.GroupModels, summary)
		detail.Groups = append(detail.Groups, perfmetrics.GroupResult{Group: pair.Group, AvgLatencyMs: summary.AvgLatencyMs, SuccessRate: summary.SuccessRate, Series: series})
		if len(pairs) == 1 {
			detail.ModelName = pair.Model
			detail.Series = series
			detail.Summary = &perfmetrics.Summary{AvgLatencyMs: summary.AvgLatencyMs, SuccessRate: summary.SuccessRate}
		}
	}
	for modelName, counts := range modelTotals {
		data.Models = append(data.Models, perfmetrics.ModelSummary{ModelName: modelName, AvgLatencyMs: counts.latency / counts.count, SuccessRate: float64(counts.success) * 100 / float64(counts.count)})
	}
	sort.Slice(data.Models, func(i, j int) bool { return data.Models[i].ModelName < data.Models[j].ModelName })
	if total.count > 0 {
		data.Summary = &perfmetrics.Summary{AvgLatencyMs: total.latency / total.count, SuccessRate: float64(total.success) * 100 / float64(total.count)}
	}
	return data, detail, nil
}
