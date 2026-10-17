package perfmetrics

import (
	"github.com/QuantumNous/new-api/model"
	"sync"
)

// Monitor decisions are durable, so a snapshot must not observe the gap
// between draining a completed hot bucket and committing its database upsert.
var availabilitySnapshotMu sync.RWMutex

// AvailabilityWindowCounts is internal monitor input. Request volume is never
// added to the ordinary user-facing performance projection.
type AvailabilityWindowCounts struct {
	Model     string
	Group     string
	Requests  int64
	Successes int64
}

func QueryAvailabilityWindow(startTs, endTs int64, groups []string) ([]AvailabilityWindowCounts, error) {
	availabilitySnapshotMu.RLock()
	defer availabilitySnapshotMu.RUnlock()
	result := []AvailabilityWindowCounts{}
	for group := range allowedGroupSet(groups) {
		rows, err := model.GetPerfMetricsSummaryAll(startTs, endTs, []string{group})
		if err != nil {
			return nil, err
		}
		merged := map[string]AvailabilityWindowCounts{}
		for _, row := range rows {
			merged[row.ModelName] = AvailabilityWindowCounts{Model: row.ModelName, Group: group, Requests: row.RequestCount, Successes: row.SuccessCount}
		}
		hotBuckets.Range(func(key, value any) bool {
			k := key.(bucketKey)
			if k.group != group || k.bucketTs < startTs || k.bucketTs > endTs {
				return true
			}
			counts := value.(*atomicBucket).snapshot()
			row := merged[k.model]
			row.Model, row.Group = k.model, group
			row.Requests += counts.requestCount
			row.Successes += counts.successCount
			merged[k.model] = row
			return true
		})
		for _, row := range merged {
			result = append(result, row)
		}
	}
	return result, nil
}
