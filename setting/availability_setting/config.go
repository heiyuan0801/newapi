package availability_setting

import (
	"errors"
	"math"
	"slices"
	"strconv"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/config"
)

// Setting keeps active requests opt-in independently from passive alerts.
type Setting struct {
	ProbeEnabled                bool     `json:"probe_enabled"`
	ProbeIntervalMinutes        int      `json:"probe_interval_minutes"`
	ProbeTimeoutSeconds         int      `json:"probe_timeout_seconds"`
	ProbeConcurrency            int      `json:"probe_concurrency"`
	ProbeModels                 []string `json:"probe_models"`
	ProbeGroups                 []string `json:"probe_groups"`
	ProbeAllModels              bool     `json:"probe_all_models"`
	ProbeAllGroups              bool     `json:"probe_all_groups"`
	ProbeMaxPairs               int      `json:"probe_max_pairs"`
	AlertsEnabled               bool     `json:"alerts_enabled"`
	SuccessRateThreshold        float64  `json:"success_rate_threshold"`
	MinimumSamples              int      `json:"minimum_samples"`
	EvaluationWindowMinutes     int      `json:"evaluation_window_minutes"`
	FailureThreshold            int      `json:"failure_threshold"`
	RecoveryThreshold           int      `json:"recovery_threshold"`
	NotificationCooldownMinutes int      `json:"notification_cooldown_minutes"`
	SilenceUntil                int64    `json:"silence_until"`
	RetentionDays               int      `json:"retention_days"`
}

var settings = Setting{
	ProbeIntervalMinutes: 10, ProbeTimeoutSeconds: 30, ProbeConcurrency: 1,
	ProbeModels: []string{}, ProbeGroups: []string{}, ProbeMaxPairs: 20,
	SuccessRateThreshold: 95, MinimumSamples: 5, EvaluationWindowMinutes: 5,
	FailureThreshold: 3, RecoveryThreshold: 2, NotificationCooldownMinutes: 30,
	RetentionDays: 30,
}

func init() { config.GlobalConfig.Register("availability_setting", &settings) }

func Get() Setting {
	// Option updates hold this same lock while applying registered config fields.
	common.OptionMapRWMutex.RLock()
	defer common.OptionMapRWMutex.RUnlock()
	snapshot := settings
	snapshot.ProbeModels = slices.Clone(settings.ProbeModels)
	snapshot.ProbeGroups = slices.Clone(settings.ProbeGroups)
	return snapshot
}

func (s Setting) HasProbeScope() bool {
	return (s.ProbeAllModels || len(s.ProbeModels) > 0) && (s.ProbeAllGroups || len(s.ProbeGroups) > 0)
}

// ValidateOption is also called by bulk updates, before any writes occur.
func ValidateOption(key, value string) error {
	field, matches := strings.CutPrefix(key, "availability_setting.")
	if !matches {
		return nil
	}
	invalid := errors.New("Invalid availability monitoring setting")
	switch field {
	case "probe_enabled", "probe_all_models", "probe_all_groups", "alerts_enabled":
		if value != "true" && value != "false" {
			return invalid
		}
		return nil
	case "probe_models", "probe_groups":
		if len(value) > 65536 || !strings.HasPrefix(strings.TrimSpace(value), "[") {
			return invalid
		}
		var values []string
		if common.UnmarshalJsonStr(value, &values) != nil || len(values) > 200 {
			return invalid
		}
		maxLength := 255
		if field == "probe_groups" {
			maxLength = 64
		}
		for _, item := range values {
			if strings.TrimSpace(item) != item || item == "" || !utf8.ValidString(item) || utf8.RuneCountInString(item) > maxLength || strings.ContainsFunc(item, unicode.IsControl) {
				return invalid
			}
		}
		return nil
	case "success_rate_threshold":
		n, err := strconv.ParseFloat(value, 64)
		if err != nil || math.IsNaN(n) || math.IsInf(n, 0) || n < 0 || n > 100 {
			return invalid
		}
		return nil
	}
	limits := map[string][2]int64{
		"probe_interval_minutes": {1, 1440}, "probe_timeout_seconds": {1, 120},
		"probe_concurrency": {1, 8}, "probe_max_pairs": {1, 200},
		"minimum_samples": {1, 100000}, "evaluation_window_minutes": {1, 1440},
		"failure_threshold": {1, 20}, "recovery_threshold": {1, 20},
		"notification_cooldown_minutes": {0, 10080}, "silence_until": {0, 4102444800},
		"retention_days": {1, 365},
	}
	limit, ok := limits[field]
	n, err := strconv.ParseInt(value, 10, 64)
	if !ok || err != nil || n < limit[0] || n > limit[1] {
		return invalid
	}
	return nil
}
