package model

import (
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"slices"

	"gorm.io/gorm"
)

const (
	SystemTaskTypeAvailabilityMonitor        = "availability_monitor"
	SystemTaskTypeAvailabilityHistoryCleanup = "availability_history_cleanup"
)

// AvailabilityProbeSample deliberately does not share the real relay metric table.
type AvailabilityProbeSample struct {
	ID         int64  `json:"-" gorm:"primaryKey"`
	SampleKey  string `json:"-" gorm:"size:64;uniqueIndex"`
	PairKey    string `json:"-" gorm:"size:64;index"`
	ModelName  string `json:"model_name" gorm:"size:255"`
	Group      string `json:"group" gorm:"size:64"`
	CheckedAt  int64  `json:"checked_at" gorm:"index"`
	Outcome    string `json:"outcome" gorm:"size:16"`
	LatencyMs  int64  `json:"latency_ms"`
	ReasonCode string `json:"reason_code" gorm:"size:32"`
}

// A pending incident doubles as durable consecutive-failure state. Only open
// and resolved records are projected to users. Nullable ActiveKey allows one
// pending/open record per source/model/group and many completed incidents.
type AvailabilityIncident struct {
	ID                 int64   `json:"id" gorm:"primaryKey"`
	PairKey            string  `json:"-" gorm:"size:64;index"`
	ActiveKey          *string `json:"-" gorm:"size:64;uniqueIndex"`
	ModelName          string  `json:"model_name" gorm:"size:255"`
	Group              string  `json:"group" gorm:"size:64"`
	Source             string  `json:"source" gorm:"size:16"`
	Status             string  `json:"status" gorm:"size:16;index"`
	StartedAt          int64   `json:"started_at" gorm:"index"`
	LastObservedAt     int64   `json:"last_observed_at"`
	ResolvedAt         int64   `json:"resolved_at" gorm:"index"`
	SuccessRate        float64 `json:"success_rate"`
	ReasonCode         string  `json:"reason_code" gorm:"size:32"`
	Failures           int     `json:"-"`
	Recoveries         int     `json:"-"`
	NotifiedAt         int64   `json:"-"`
	RecoveryNotifiedAt int64   `json:"-"`
}

type AvailabilityPair struct {
	Model string `gorm:"column:model_name"`
	Group string
}

func AvailabilityHistoryPairs(ctx context.Context, admin bool) ([]AvailabilityPair, error) {
	pairs := []AvailabilityPair{}
	var abilities []Ability
	if err := DB.WithContext(ctx).Select([]string{"model", "group"}).Distinct().Find(&abilities).Error; err != nil {
		return nil, err
	}
	for _, ability := range abilities {
		pairs = append(pairs, AvailabilityPair{Model: ability.Model, Group: ability.Group})
	}
	if !admin {
		return pairs, nil
	}
	for _, table := range []any{&AvailabilityProbeSample{}, &AvailabilityIncident{}} {
		var stored []AvailabilityPair
		if err := DB.WithContext(ctx).Model(table).Select([]string{"model_name", "group"}).Distinct().Find(&stored).Error; err != nil {
			return nil, err
		}
		pairs = append(pairs, stored...)
	}
	return pairs, nil
}

func LatestAvailabilityProbesByPair(ctx context.Context, pairs []AvailabilityPair) (map[string]int64, error) {
	latest := map[string]int64{}
	for chunk := range slices.Chunk(pairs, 500) {
		keys := make([]string, 0, len(chunk))
		for _, pair := range chunk {
			keys = append(keys, AvailabilityPairKey("probe", pair.Model, pair.Group))
		}
		var rows []struct {
			PairKey   string
			CheckedAt int64
		}
		if err := DB.WithContext(ctx).Model(&AvailabilityProbeSample{}).Select("pair_key, MAX(checked_at) AS checked_at").Where("pair_key IN ?", keys).Group("pair_key").Find(&rows).Error; err != nil {
			return nil, err
		}
		for _, row := range rows {
			latest[row.PairKey] = row.CheckedAt
		}
	}
	return latest, nil
}

func AvailabilityPairKey(source, modelName, group string) string {
	// Length-prefixes avoid ambiguities even when configured names contain separators.
	return fmt.Sprintf("%x", sha256.Sum256(fmt.Appendf(nil, "%d:%s%d:%s%d:%s", len(source), source, len(modelName), modelName, len(group), group)))
}

func SaveAvailabilityProbe(ctx context.Context, sample AvailabilityProbeSample) error {
	if !slices.Contains([]string{"success", "failure", "unsupported"}, sample.Outcome) {
		return errors.New("invalid probe outcome")
	}
	if !slices.Contains([]string{"", "probe_failed", "probe_timeout", "probe_unavailable", "unsupported"}, sample.ReasonCode) {
		return errors.New("invalid probe reason")
	}
	sample.PairKey = AvailabilityPairKey("probe", sample.ModelName, sample.Group)
	return DB.WithContext(ctx).Create(&sample).Error
}

func ListAvailabilityProbes(ctx context.Context, start, end int64, pairs []AvailabilityPair) ([]AvailabilityProbeSample, error) {
	if len(pairs) == 0 {
		return []AvailabilityProbeSample{}, nil
	}
	keys := make([]string, 0, len(pairs))
	for _, pair := range pairs {
		keys = append(keys, AvailabilityPairKey("probe", pair.Model, pair.Group))
	}
	var samples []AvailabilityProbeSample
	err := DB.WithContext(ctx).Where("pair_key IN ? AND checked_at >= ? AND checked_at <= ?", keys, start, end).Order("checked_at ASC, id ASC").Find(&samples).Error
	return samples, err
}

type AvailabilityProbeBucket struct {
	PairKey        string
	BucketTs       int64
	RequestCount   int64
	SuccessCount   int64
	TotalLatencyMs int64
}

// Aggregate in the database so a seven-day chart never loads every individual
// probe request. Integer modulo and CASE are supported by all three engines.
func QueryAvailabilityProbeBuckets(ctx context.Context, start, end int64, pairs []AvailabilityPair) ([]AvailabilityProbeBucket, error) {
	buckets := []AvailabilityProbeBucket{}
	for chunk := range slices.Chunk(pairs, 500) {
		keys := make([]string, 0, len(chunk))
		for _, pair := range chunk {
			keys = append(keys, AvailabilityPairKey("probe", pair.Model, pair.Group))
		}
		var rows []AvailabilityProbeBucket
		const hourBucket = "checked_at - (checked_at % 3600)"
		err := DB.WithContext(ctx).Model(&AvailabilityProbeSample{}).
			Select("pair_key, "+hourBucket+" AS bucket_ts, COUNT(*) AS request_count, SUM(CASE WHEN outcome = 'success' THEN 1 ELSE 0 END) AS success_count, SUM(latency_ms) AS total_latency_ms").
			Where("pair_key IN ? AND checked_at >= ? AND checked_at <= ? AND outcome IN ?", keys, start, end, []string{"success", "failure"}).
			Group("pair_key, " + hourBucket).Order("bucket_ts ASC").Find(&rows).Error
		if err != nil {
			return nil, err
		}
		buckets = append(buckets, rows...)
	}
	return buckets, nil
}

type AvailabilityIncidentFilter struct {
	Model    string
	Group    string
	Source   string
	Status   string
	Page     int
	PageSize int
}

func ListAvailabilityIncidents(ctx context.Context, filter AvailabilityIncidentFilter, pairs []AvailabilityPair) ([]AvailabilityIncident, int64, error) {
	items := []AvailabilityIncident{}
	if len(pairs) == 0 {
		return items, 0, nil
	}
	keys := make([]string, 0, len(pairs)*2)
	for _, pair := range pairs {
		if filter.Model != "" && pair.Model != filter.Model || filter.Group != "" && pair.Group != filter.Group {
			continue
		}
		for _, source := range []string{"real", "probe"} {
			if filter.Source == "" || filter.Source == "all" || source == filter.Source {
				keys = append(keys, AvailabilityPairKey(source, pair.Model, pair.Group))
			}
		}
	}
	if len(keys) == 0 {
		return items, 0, nil
	}
	query := DB.WithContext(ctx).Model(&AvailabilityIncident{}).Where("pair_key IN ? AND status IN ?", keys, []string{"open", "resolved"})
	if filter.Status == "open" || filter.Status == "resolved" {
		query = query.Where("status = ?", filter.Status)
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	err := query.Order("started_at DESC, id DESC").Offset((max(filter.Page, 1) - 1) * filter.PageSize).Limit(filter.PageSize).Find(&items).Error
	return items, total, err
}

type AvailabilityObservation struct {
	Model         string
	Group         string
	Source        string
	StartedAt     int64
	ObservedAt    int64
	Valid         bool
	SuccessRate   float64
	ReasonCode    string
	MaxGapSeconds int64
}

type AvailabilityAlertPolicy struct {
	SuccessRateThreshold float64
	FailureThreshold     int
	RecoveryThreshold    int
	CooldownSeconds      int64
	SilenceUntil         int64
}

type AvailabilityNotification struct {
	Incident AvailabilityIncident
	Recovery bool
}

// ApplyAvailabilityObservation consumes a non-overlapping observation once.
// Notification claims are persisted in the same transaction as transitions;
// delivery is best-effort, and a process restart cannot send duplicate claims.
func ApplyAvailabilityObservation(ctx context.Context, observation AvailabilityObservation, policy AvailabilityAlertPolicy, now int64) (*AvailabilityNotification, error) {
	if observation.Source != "real" && observation.Source != "probe" {
		return nil, errors.New("invalid availability source")
	}
	key := AvailabilityPairKey(observation.Source, observation.Model, observation.Group)
	var notification *AvailabilityNotification
	err := DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var incident AvailabilityIncident
		err := lockForUpdate(tx).Where("pair_key = ?", key).Order("id DESC").First(&incident).Error
		if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		if incident.ID != 0 && incident.LastObservedAt >= observation.ObservedAt {
			return nil
		}
		if incident.ID != 0 && observation.MaxGapSeconds > 0 && observation.ObservedAt-incident.LastObservedAt > observation.MaxGapSeconds {
			incident.Failures, incident.Recoveries = 0, 0
			if incident.Status == "pending" {
				incident.StartedAt = observation.StartedAt
			}
		}
		failed := observation.Valid && observation.SuccessRate < policy.SuccessRateThreshold
		if incident.ID == 0 || incident.Status == "resolved" {
			if !failed {
				return nil
			}
			incident = AvailabilityIncident{PairKey: key, ActiveKey: &key, ModelName: observation.Model, Group: observation.Group, Source: observation.Source, Status: "pending", StartedAt: observation.StartedAt}
		}
		incident.LastObservedAt = observation.ObservedAt
		if !observation.Valid {
			if incident.Status == "pending" {
				return tx.Delete(&incident).Error
			}
			incident.Recoveries = 0
			return tx.Save(&incident).Error
		}
		incident.SuccessRate = observation.SuccessRate
		if failed {
			incident.Failures++
			incident.Recoveries = 0
			incident.ReasonCode = "low_success_rate"
			if observation.Source == "probe" {
				incident.ReasonCode = "probe_failed"
			}
			if incident.Status == "pending" && incident.Failures >= max(policy.FailureThreshold, 1) {
				incident.Status = "open"
			}
			if incident.Status == "open" && incident.NotifiedAt == 0 && now >= policy.SilenceUntil {
				var previous AvailabilityIncident
				err := tx.Where("pair_key = ? AND notified_at > 0", key).Order("notified_at DESC").First(&previous).Error
				if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
					return err
				}
				if previous.ID == 0 || now-previous.NotifiedAt >= policy.CooldownSeconds {
					incident.NotifiedAt = now
					notification = &AvailabilityNotification{}
				}
			}
		} else if incident.Status == "pending" {
			return tx.Delete(&incident).Error
		} else {
			incident.Recoveries++
			if incident.Recoveries >= max(policy.RecoveryThreshold, 1) {
				incident.Status = "resolved"
				incident.ActiveKey = nil
				incident.ResolvedAt = observation.ObservedAt
				if incident.NotifiedAt > 0 && incident.RecoveryNotifiedAt == 0 && now >= policy.SilenceUntil {
					incident.RecoveryNotifiedAt = now
					notification = &AvailabilityNotification{Recovery: true}
				}
			}
		}
		if err := tx.Save(&incident).Error; err != nil {
			return err
		}
		if notification != nil {
			notification.Incident = incident
		}
		return nil
	})
	return notification, err
}

func LatestAvailabilityProbeTime(ctx context.Context) (int64, error) {
	var timestamp int64
	err := DB.WithContext(ctx).Model(&AvailabilityProbeSample{}).Select("COALESCE(MAX(checked_at), 0)").Scan(&timestamp).Error
	return timestamp, err
}

func CleanupAvailabilityHistory(ctx context.Context, cutoff int64) error {
	if err := DB.WithContext(ctx).Where("checked_at < ?", cutoff).Delete(&AvailabilityProbeSample{}).Error; err != nil {
		return err
	}
	return DB.WithContext(ctx).Where("(status = ? AND resolved_at < ?) OR (status = ? AND last_observed_at < ?)", "resolved", cutoff, "pending", cutoff).Delete(&AvailabilityIncident{}).Error
}
