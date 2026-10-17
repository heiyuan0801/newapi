package controller

import (
	"net/http"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

func GetNotificationDeliveries(c *gin.Context) {
	if c.GetInt("role") < common.RoleAdminUser {
		common.ApiErrorStatus(c, http.StatusForbidden, common.NewMessage("Permission denied"))
		return
	}
	var query struct {
		Status     string `form:"status" binding:"omitempty,oneof=all pending retry sending sent failed cancelled"`
		Kind       string `form:"kind" binding:"omitempty,oneof=all availability_fault availability_recovery support_ticket_reply test"`
		IncidentID int64  `form:"incident_id" binding:"omitempty,gte=1"`
		Page       int    `form:"page" binding:"omitempty,gte=1,lte=100000"`
		PageSize   int    `form:"page_size" binding:"omitempty,gte=1,lte=100"`
	}
	if c.ShouldBindQuery(&query) != nil {
		common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Invalid notification filters"))
		return
	}
	query.Page = max(query.Page, 1)
	if query.PageSize == 0 {
		query.PageSize = 20
	}
	items, total, err := model.ListNotificationDeliveries(c.Request.Context(), model.NotificationDeliveryFilter{Status: query.Status, Kind: query.Kind, IncidentID: query.IncidentID, Page: query.Page, PageSize: query.PageSize})
	if err != nil {
		common.ApiErrorStatus(c, http.StatusInternalServerError, common.NewMessage("Unable to load notification deliveries"))
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"items": items, "total": total, "page": query.Page, "page_size": query.PageSize}})
}

func TestNotificationDelivery(c *gin.Context) {
	if c.GetInt("role") < common.RoleAdminUser {
		common.ApiErrorStatus(c, http.StatusForbidden, common.NewMessage("Permission denied"))
		return
	}
	item, err := service.EnqueueNotificationTest(c.Request.Context(), c.GetInt("id"), time.Now().Unix())
	if err != nil {
		common.ApiErrorStatus(c, http.StatusInternalServerError, common.NewMessage("Unable to queue test notification"))
		return
	}
	c.JSON(http.StatusAccepted, gin.H{"success": true, "data": item})
}
