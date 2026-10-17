package controller

import (
	"context"
	"errors"
	"net/http"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/availability_setting"
	"github.com/gin-gonic/gin"
)

func availabilityAPIError(c *gin.Context, status int, message string) {
	common.ApiErrorStatus(c, status, common.NewMessage(message))
}

func GetAvailabilityMonitor(c *gin.Context) {
	pairs, err := service.VisibleAvailabilityHistoryPairs(c)
	if err != nil {
		availabilityAPIError(c, 500, "Unable to load availability monitoring")
		return
	}
	hours := 24
	if c.Query("hours") == "168" {
		hours = 168
	}
	probe, _, err := service.QueryAvailabilityProbes(c.Request.Context(), pairs, hours)
	if err != nil {
		availabilityAPIError(c, 500, "Unable to load availability monitoring")
		return
	}
	setting := availability_setting.Get()
	latestProbes, err := model.LatestAvailabilityProbesByPair(c.Request.Context(), pairs)
	if err != nil {
		availabilityAPIError(c, 500, "Unable to load availability monitoring")
		return
	}
	lastProbe := int64(0)
	for _, timestamp := range latestProbes {
		lastProbe = max(lastProbe, timestamp)
	}
	latest, err := model.GetLatestSystemTask(model.SystemTaskTypeAvailabilityMonitor)
	if err != nil {
		availabilityAPIError(c, 500, "Unable to load availability monitoring")
		return
	}
	lastRun := int64(0)
	running := false
	if latest != nil {
		lastRun = latest.UpdatedAt
		running = latest.Status == model.SystemTaskStatusRunning || latest.Status == model.SystemTaskStatusPending
	}
	start, end := service.AvailabilityEvaluationWindow(setting, time.Now().Unix())
	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{
		"probe_enabled": setting.ProbeEnabled, "alerts_enabled": setting.AlertsEnabled,
		"last_run_at": lastRun, "last_probe_at": lastProbe, "running": running, "probe": probe,
		"probe_interval_minutes":              setting.ProbeIntervalMinutes,
		"effective_evaluation_window_minutes": (end - start + 1) / 60,
		"evaluation_window_start":             start, "evaluation_window_end": end,
	}})
}

func GetAvailabilityProbes(c *gin.Context) {
	modelName, group := c.Query("model"), c.Query("group")
	if modelName == "" || group == "" {
		availabilityAPIError(c, 400, "Invalid availability filters")
		return
	}
	pairs, err := service.VisibleAvailabilityHistoryPairs(c)
	if err != nil {
		availabilityAPIError(c, 500, "Unable to load availability monitoring")
		return
	}
	pair := model.AvailabilityPair{Model: modelName, Group: group}
	if !slices.Contains(pairs, pair) {
		availabilityAPIError(c, 404, "Model group is unavailable")
		return
	}
	hours := 24
	if c.Query("hours") == "168" {
		hours = 168
	}
	_, detail, err := service.QueryAvailabilityProbes(c.Request.Context(), []model.AvailabilityPair{pair}, hours)
	if err != nil {
		availabilityAPIError(c, 500, "Unable to load availability monitoring")
		return
	}
	detail.ModelName = modelName
	c.JSON(http.StatusOK, gin.H{"success": true, "data": detail})
}

func GetAvailabilityIncidents(c *gin.Context) {
	var query struct {
		Model    string `form:"model" binding:"max=255"`
		Group    string `form:"group" binding:"max=64"`
		Source   string `form:"source" binding:"omitempty,oneof=all real probe"`
		Status   string `form:"status" binding:"omitempty,oneof=all open resolved"`
		Page     int    `form:"page" binding:"omitempty,gte=1,lte=100000"`
		PageSize int    `form:"page_size" binding:"omitempty,gte=1,lte=100"`
	}
	if c.ShouldBindQuery(&query) != nil {
		availabilityAPIError(c, 400, "Invalid availability filters")
		return
	}
	if query.Page == 0 {
		query.Page = 1
	}
	if query.PageSize == 0 {
		query.PageSize = 20
	}
	pairs, err := service.VisibleAvailabilityHistoryPairs(c)
	if err != nil {
		availabilityAPIError(c, 500, "Unable to load availability monitoring")
		return
	}
	items, total, err := model.ListAvailabilityIncidents(c.Request.Context(), model.AvailabilityIncidentFilter{Model: query.Model, Group: query.Group, Source: query.Source, Status: query.Status, Page: query.Page, PageSize: query.PageSize}, pairs)
	if err != nil {
		availabilityAPIError(c, 500, "Unable to load availability monitoring")
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"items": items, "total": total, "page": query.Page, "page_size": query.PageSize}})
}

func RunAvailabilityProbe(c *gin.Context) {
	setting := availability_setting.Get()
	if !setting.ProbeEnabled {
		availabilityAPIError(c, 409, "Availability probing is disabled")
		return
	}
	pairs, err := service.AvailabilityPairs(nil)
	if err != nil {
		availabilityAPIError(c, 500, "Unable to start availability probing")
		return
	}
	if len(service.AvailabilityProbeTargets(pairs, setting)) == 0 {
		availabilityAPIError(c, 409, "Select models and groups before probing")
		return
	}
	task, created, err := service.EnqueueSystemTask(model.SystemTaskTypeAvailabilityMonitor, availabilityMonitorPayload{Manual: true})
	if err != nil {
		availabilityAPIError(c, 500, "Unable to start availability probing")
		return
	}
	if !created {
		availabilityAPIError(c, 409, "An availability monitoring task is already running")
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"task_id": task.TaskID, "status": task.Status}})
}

type availabilityMonitorHandler struct{}
type availabilityMonitorPayload struct {
	Manual bool `json:"manual"`
}
type availabilityMonitorResult struct {
	Probed  int `json:"probed"`
	Skipped int `json:"skipped"`
}

func (availabilityMonitorHandler) Type() string { return model.SystemTaskTypeAvailabilityMonitor }
func (availabilityMonitorHandler) Enabled() bool {
	s := availability_setting.Get()
	return s.ProbeEnabled || s.AlertsEnabled
}
func (availabilityMonitorHandler) Interval() time.Duration {
	s := availability_setting.Get()
	if s.AlertsEnabled {
		return time.Minute
	}
	return time.Duration(max(1, s.ProbeIntervalMinutes)) * time.Minute
}
func (availabilityMonitorHandler) NewPayload() any { return availabilityMonitorPayload{} }
func (availabilityMonitorHandler) Run(ctx context.Context, task *model.SystemTask, runnerID string) {
	var payload availabilityMonitorPayload
	if err := task.DecodePayload(&payload); err != nil {
		finishSystemTaskHandler(task, runnerID, model.SystemTaskStatusFailed, nil, errors.New("invalid availability task payload"))
		return
	}
	result, err := runAvailabilityMonitor(ctx, task.TaskID, payload.Manual)
	status := model.SystemTaskStatusSucceeded
	if err != nil {
		status = model.SystemTaskStatusFailed
	}
	finishSystemTaskHandler(task, runnerID, status, result, err)
}

func runAvailabilityMonitor(ctx context.Context, runID string, manual bool) (availabilityMonitorResult, error) {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	setting := availability_setting.Get()
	result := availabilityMonitorResult{}
	if !setting.ProbeEnabled && !setting.AlertsEnabled {
		return result, nil
	}
	pairs, err := service.AvailabilityPairs(nil)
	if err != nil {
		return result, errors.New("availability catalog query failed")
	}
	now := time.Now().Unix()
	if setting.AlertsEnabled {
		alertPairs, err := service.AvailabilityAlertPairs(ctx)
		if err != nil {
			return result, errors.New("availability catalog query failed")
		}
		if err := service.EvaluateRealAvailability(ctx, alertPairs, setting, now); err != nil {
			return result, errors.New("availability evaluation failed")
		}
	}
	latest, err := model.LatestAvailabilityProbeTime(ctx)
	if err != nil {
		return result, errors.New("availability probe lookup failed")
	}
	if setting.ProbeEnabled && (manual || now-latest >= int64(setting.ProbeIntervalMinutes)*60) {
		targets, selectionErr := service.ScheduledAvailabilityProbeTargets(ctx, pairs, setting)
		if selectionErr != nil {
			return result, errors.New("availability target selection failed")
		}
		if len(targets) > 0 {
			userID, err := resolveChannelTestUserID(nil)
			if err != nil {
				return result, errors.New("availability test user is unavailable")
			}
			jobs := make(chan model.AvailabilityPair)
			results := make(chan error, len(targets))
			var workers sync.WaitGroup
			for range min(max(setting.ProbeConcurrency, 1), min(len(targets), 8)) {
				workers.Go(func() {
					for pair := range jobs {
						if ctx.Err() != nil {
							return
						}
						live := availability_setting.Get()
						if !live.ProbeEnabled {
							return
						}
						// A scope change also takes effect before the next request.
						if len(service.AvailabilityProbeTargets([]model.AvailabilityPair{pair}, live)) == 0 {
							continue
						}
						results <- runAvailabilityProbe(ctx, runID, userID, pair, live)
					}
				})
			}
			go func() {
				defer close(jobs)
				for _, pair := range targets {
					select {
					case <-ctx.Done():
						return
					case jobs <- pair:
					}
				}
			}()
			go func() { workers.Wait(); close(results) }()
			var firstErr error
			for err := range results {
				if err != nil {
					firstErr = errors.New("availability probe persistence failed")
					cancel()
				}
				result.Probed++
			}
			if firstErr != nil {
				return result, firstErr
			}
		}
	}
	if err := model.CleanupAvailabilityHistory(ctx, now-int64(max(setting.RetentionDays, 1))*86400); err != nil {
		return result, errors.New("availability history cleanup failed")
	}
	return result, ctx.Err()
}

// Retention remains effective after both monitoring switches are off. The
// daily maintenance job performs no upstream requests and leaves open incidents.
type availabilityHistoryCleanupHandler struct{}

func (availabilityHistoryCleanupHandler) Type() string {
	return model.SystemTaskTypeAvailabilityHistoryCleanup
}
func (availabilityHistoryCleanupHandler) Enabled() bool           { return true }
func (availabilityHistoryCleanupHandler) Interval() time.Duration { return 24 * time.Hour }
func (availabilityHistoryCleanupHandler) NewPayload() any         { return nil }
func (availabilityHistoryCleanupHandler) Run(ctx context.Context, task *model.SystemTask, runnerID string) {
	err := model.CleanupAvailabilityHistory(ctx, time.Now().Unix()-int64(max(availability_setting.Get().RetentionDays, 1))*86400)
	status := model.SystemTaskStatusSucceeded
	if err != nil {
		status = model.SystemTaskStatusFailed
		err = errors.New("availability history cleanup failed")
	}
	finishSystemTaskHandler(task, runnerID, status, nil, err)
}

func runAvailabilityProbe(ctx context.Context, runID string, userID int, pair model.AvailabilityPair, setting availability_setting.Setting) (err error) {
	// A provider adaptor panic must never terminate a system-task worker/process.
	defer func() {
		if recover() != nil {
			err = errors.New("availability probe failed")
		}
	}()
	if ctx.Err() != nil || !availability_setting.Get().ProbeEnabled {
		return ctx.Err()
	}
	sample := model.AvailabilityProbeSample{SampleKey: model.AvailabilityPairKey(runID, pair.Model, pair.Group), ModelName: pair.Model, Group: pair.Group, CheckedAt: time.Now().Unix(), Outcome: "failure", ReasonCode: "probe_unavailable"}
	channel, selectErr := model.GetChannel(pair.Group, pair.Model, 0, nil)
	if selectErr != nil {
		return errors.New("availability channel selection failed")
	}
	endpoint := availabilityProbeEndpoint(channel, pair.Model)
	if channel != nil && endpoint == "" {
		sample.Outcome = "unsupported"
		sample.ReasonCode = "unsupported"
	} else if channel != nil {
		probeCtx, cancel := context.WithTimeout(ctx, time.Duration(max(1, min(setting.ProbeTimeoutSeconds, 120)))*time.Second)
		started := time.Now()
		test := testChannelRequest(probeCtx, channel, userID, pair.Model, endpoint, shouldUseStreamForAutomaticChannelTest(channel), pair.Group, true)
		sample.LatencyMs = time.Since(started).Milliseconds()
		if ctx.Err() != nil {
			cancel()
			return ctx.Err()
		}
		if errors.Is(probeCtx.Err(), context.DeadlineExceeded) {
			sample.ReasonCode = "probe_timeout"
		} else if test.localErr == nil && test.newAPIError == nil {
			sample.Outcome = "success"
			sample.ReasonCode = ""
		} else {
			sample.ReasonCode = "probe_failed"
		}
		cancel()
	}
	if err := model.SaveAvailabilityProbe(ctx, sample); err != nil {
		return err
	}
	rate := float64(0)
	if sample.Outcome == "success" {
		rate = 100
	}
	return service.ApplyAvailabilityObservation(ctx, model.AvailabilityObservation{Model: pair.Model, Group: pair.Group, Source: "probe", StartedAt: sample.CheckedAt, ObservedAt: sample.CheckedAt, Valid: sample.Outcome != "unsupported", SuccessRate: rate, ReasonCode: sample.ReasonCode, MaxGapSeconds: int64(max(setting.ProbeIntervalMinutes, 1)) * 120}, setting, time.Now().Unix())
}

func availabilityProbeEndpoint(channel *model.Channel, modelName string) string {
	if channel == nil {
		return ""
	}
	apiType, _ := common.ChannelType2APIType(channel.Type)
	// Only adapters using the context-bound shared HTTP transport are probed.
	// SDK/async transports without that guarantee remain gray/unsupported.
	if !slices.Contains([]int{constant.APITypeOpenAI, constant.APITypeAnthropic, constant.APITypeGemini, constant.APITypeDeepSeek, constant.APITypeSiliconFlow, constant.APITypeOpenRouter, constant.APITypeXai, constant.APITypeNewAPI, constant.APITypeSub2API, constant.APITypeCodex, constant.APITypeAdvancedCustom}, apiType) {
		return ""
	}
	if slices.Contains([]int{constant.ChannelTypeMidjourney, constant.ChannelTypeMidjourneyPlus, constant.ChannelTypeSunoAPI, constant.ChannelTypeKling, constant.ChannelTypeJimeng, constant.ChannelTypeDoubaoVideo, constant.ChannelTypeVidu, constant.ChannelTypeTaskPlugin, constant.ChannelTypeSora}, channel.Type) {
		return ""
	}
	name := strings.ToLower(modelName)
	if common.IsImageGenerationModel(modelName) {
		return ""
	}
	for _, marker := range []string{"embedding", "embed", "rerank", "tts", "whisper", "audio", "speech", "video"} {
		if strings.Contains(name, marker) {
			return ""
		}
	}
	endpoints := common.GetEndpointTypesByChannelType(channel.Type, modelName)
	if channel.Type == constant.ChannelTypeAdvancedCustom {
		config := channel.GetOtherSettings().AdvancedCustom
		if config == nil {
			return ""
		}
		endpoints = config.SupportedEndpointTypesForModel(modelName)
	}
	for _, endpoint := range endpoints {
		if slices.Contains([]constant.EndpointType{constant.EndpointTypeOpenAI, constant.EndpointTypeOpenAIResponse, constant.EndpointTypeAnthropic, constant.EndpointTypeGemini}, endpoint) {
			return string(endpoint)
		}
	}
	return ""
}
