package controller

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

func supportTicketError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, model.ErrSupportTicketInput):
		common.ApiErrorT(c, "Invalid support ticket input")
	case errors.Is(err, model.ErrSupportTicketNotFound):
		common.ApiErrorT(c, "Support ticket not found")
	case errors.Is(err, model.ErrSupportReference):
		common.ApiErrorT(c, "The associated request or order was not found in your account")
	case errors.Is(err, model.ErrSupportTicketClosed):
		common.ApiErrorT(c, "Reopen the ticket before replying")
	case errors.Is(err, model.ErrSupportTicketConflict):
		common.ApiErrorT(c, "The ticket changed. Refresh and try again")
	default:
		common.ApiErrorT(c, "Unable to update support tickets")
	}
}

func supportTicketPage(c *gin.Context) (int, int, bool) {
	page, err := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, sizeErr := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	if err != nil || sizeErr != nil || page < 1 || page > 100000 || pageSize < 1 || pageSize > 100 {
		supportTicketError(c, model.ErrSupportTicketInput)
		return 0, 0, false
	}
	return page, pageSize, true
}

func ListSupportTickets(c *gin.Context) {
	page, pageSize, valid := supportTicketPage(c)
	if !valid {
		return
	}
	status := c.DefaultQuery("status", "all")
	scope := c.DefaultQuery("scope", "mine")
	if (status != "all" && !model.ValidSupportStatus(status)) || (scope != "mine" && scope != "all") {
		supportTicketError(c, model.ErrSupportTicketInput)
		return
	}
	if scope == "all" && c.GetInt("role") < common.RoleAdminUser {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "Unauthorized, insufficient privileges"})
		return
	}
	items, total, page, err := model.ListSupportTickets(c.Request.Context(), c.GetInt("id"), scope == "all", status, page, pageSize)
	if err != nil {
		supportTicketError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"items": items, "total": total, "page": page, "page_size": pageSize})
}

func CreateSupportTicket(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 65536)
	var draft model.SupportTicketDraft
	if err := c.ShouldBindJSON(&draft); err != nil {
		supportTicketError(c, model.ErrSupportTicketInput)
		return
	}
	ticket, err := model.CreateSupportTicket(c.Request.Context(), c.GetInt("id"), draft)
	if err != nil {
		supportTicketError(c, err)
		return
	}
	common.ApiSuccess(c, ticket)
}

func GetSupportTicket(c *gin.Context) {
	page, pageSize, valid := supportTicketPage(c)
	if !valid {
		return
	}
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id < 1 {
		supportTicketError(c, model.ErrSupportTicketInput)
		return
	}
	ticket, err := model.GetSupportTicket(c.Request.Context(), id, c.GetInt("id"), c.GetInt("role") >= common.RoleAdminUser)
	if err != nil {
		supportTicketError(c, err)
		return
	}
	messages, total, err := model.GetSupportTicketMessages(c.Request.Context(), id, page, pageSize)
	if err != nil {
		supportTicketError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"ticket": ticket, "messages": messages, "total": total, "page": page, "page_size": pageSize})
}

func ReplySupportTicket(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 65536)
	var input struct {
		Body string `json:"body"`
	}
	if err := c.ShouldBindJSON(&input); err != nil || strings.TrimSpace(input.Body) == "" {
		supportTicketError(c, model.ErrSupportTicketInput)
		return
	}
	changeSupportTicket(c, "", input.Body)
}

func UpdateSupportTicket(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 16384)
	var input struct {
		Status string `json:"status"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		supportTicketError(c, model.ErrSupportTicketInput)
		return
	}
	changeSupportTicket(c, input.Status, "")
}

func changeSupportTicket(c *gin.Context, status, body string) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id < 1 {
		supportTicketError(c, model.ErrSupportTicketInput)
		return
	}
	ticket, err := model.ChangeSupportTicket(c.Request.Context(), id, c.GetInt("id"), c.GetInt("role") >= common.RoleAdminUser, status, body)
	if err != nil {
		supportTicketError(c, err)
		return
	}
	common.ApiSuccess(c, ticket)
}
