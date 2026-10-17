package controller

import (
	"net/http"
	"slices"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/perf_metrics_setting"
	"github.com/gin-gonic/gin"
)

func GetAvailabilityDiagnostics(c *gin.Context) {
	// Defense in depth: this projection must never inherit the ordinary user's
	// read-only availability policy, even if a route is registered incorrectly.
	if c.GetInt("role") < common.RoleAdminUser {
		availabilityAPIError(c, http.StatusForbidden, "Administrator access is required")
		return
	}
	var query struct {
		Model  string `form:"model" binding:"required,max=255"`
		Group  string `form:"group" binding:"required,max=64"`
		Source string `form:"source" binding:"required,oneof=real probe"`
		Hours  int    `form:"hours" binding:"required,oneof=24 168"`
	}
	if c.ShouldBindQuery(&query) != nil {
		availabilityAPIError(c, http.StatusBadRequest, "Invalid availability filters")
		return
	}
	pairs, err := service.VisibleAvailabilityHistoryPairs(c)
	if err != nil {
		availabilityAPIError(c, http.StatusInternalServerError, "Unable to load availability diagnostics")
		return
	}
	pair := model.AvailabilityPair{Model: query.Model, Group: query.Group}
	if !slices.Contains(pairs, pair) {
		availabilityAPIError(c, http.StatusNotFound, "Model group is unavailable")
		return
	}
	end := time.Now().Unix()
	start := end - end%3600 - int64(query.Hours-1)*3600
	if query.Source == "real" {
		// The real-metric collector only commits completed buckets. Be explicit
		// about the cutoff even after a bucket-size configuration change.
		end = end - end%perf_metrics_setting.GetBucketSeconds() - 1
	}
	result, err := model.QueryAvailabilityDiagnostics(c.Request.Context(), query.Source, pair, start, end)
	if err != nil {
		availabilityAPIError(c, http.StatusInternalServerError, "Unable to load availability diagnostics")
		return
	}
	if query.Source == "real" {
		result.CollectionDelaySeconds = perf_metrics_setting.GetBucketSeconds() + int64(perf_metrics_setting.GetFlushIntervalMinutes())*60
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": result})
}
