package model

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

var (
	ErrSupportTicketInput    = errors.New("invalid support ticket input")
	ErrSupportTicketNotFound = errors.New("support ticket not found")
	ErrSupportReference      = errors.New("support reference not found")
	ErrSupportTicketClosed   = errors.New("support ticket is closed")
	ErrSupportTicketConflict = errors.New("support ticket changed")
)

type SupportTicket struct {
	Id                 int    `json:"id"`
	UserId             int    `json:"user_id" gorm:"index:idx_support_owner_updated,priority:1"`
	Title              string `json:"title" gorm:"type:varchar(200)"`
	Status             string `json:"status" gorm:"type:varchar(24);index"`
	ReferenceType      string `json:"reference_type" gorm:"type:varchar(16)"`
	ReferenceId        string `json:"reference_id" gorm:"type:varchar(255)"`
	ModelName          string `json:"model_name" gorm:"type:varchar(255)"`
	GroupName          string `json:"group_name" gorm:"type:varchar(128)"`
	ReferenceCreatedAt int64  `json:"reference_created_at"`
	ReferenceStatus    string `json:"reference_status" gorm:"type:varchar(32)"`
	CreatedAt          int64  `json:"created_at"`
	UpdatedAt          int64  `json:"updated_at" gorm:"index:idx_support_owner_updated,priority:2"`
	Version            int    `json:"-"`
	AssignedToID       int    `json:"assigned_to_id" gorm:"default:0;index"`
	Priority           string `json:"priority" gorm:"type:varchar(16);default:normal;index"`
	UnreadCount        int64  `json:"unread_count" gorm:"-"`
	AssignedToName     string `json:"assigned_to_name" gorm:"-"`
}

type SupportTicketMessage struct {
	Id         int    `json:"id"`
	TicketId   int    `json:"ticket_id" gorm:"index:idx_support_message_ticket,priority:1"`
	AuthorId   int    `json:"-"`
	AuthorType string `json:"author_type" gorm:"type:varchar(16)"`
	Body       string `json:"body" gorm:"type:text"`
	CreatedAt  int64  `json:"created_at"`
}

type SupportTicketDraft struct {
	Title         string `json:"title"`
	Body          string `json:"body"`
	ReferenceType string `json:"reference_type"`
	ReferenceId   string `json:"reference_id"`
}

func ValidSupportStatus(status string) bool {
	return status == "open" || status == "in_progress" || status == "awaiting_user" || status == "closed"
}

// CreateSupportTicket copies only a small, server-verified reference. Log and
// payment payloads, credentials, account balances and upstream diagnostics never
// become automatic attachments. LOG_DB can be separate, so it is read-only here.
func CreateSupportTicket(ctx context.Context, userId int, draft SupportTicketDraft) (*SupportTicket, error) {
	draft.Title, draft.Body = strings.TrimSpace(draft.Title), strings.TrimSpace(draft.Body)
	draft.ReferenceType, draft.ReferenceId = strings.TrimSpace(draft.ReferenceType), strings.TrimSpace(draft.ReferenceId)
	if userId <= 0 || draft.Title == "" || utf8.RuneCountInString(draft.Title) > 200 || draft.Body == "" || len(draft.Body) > 16384 {
		return nil, ErrSupportTicketInput
	}
	now := common.GetTimestamp()
	ticket := &SupportTicket{UserId: userId, Title: draft.Title, Status: "open", ReferenceType: draft.ReferenceType, ReferenceId: draft.ReferenceId, CreatedAt: now, UpdatedAt: now, Version: 1, Priority: "normal"}
	switch draft.ReferenceType {
	case "":
		if draft.ReferenceId != "" {
			return nil, ErrSupportTicketInput
		}
	case "request":
		if draft.ReferenceId == "" || len(draft.ReferenceId) > 64 {
			return nil, ErrSupportTicketInput
		}
		var log Log
		err := LOG_DB.WithContext(ctx).Select("user_id", "request_id", "model_name", "group", "created_at", "type").Where("user_id = ? AND request_id = ? AND type = ?", userId, draft.ReferenceId, LogTypeError).Take(&log).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrSupportReference
		}
		if err != nil {
			return nil, err
		}
		ticket.ModelName, ticket.GroupName, ticket.ReferenceCreatedAt, ticket.ReferenceStatus = log.ModelName, log.Group, log.CreatedAt, "failed"
	case "order":
		if draft.ReferenceId == "" || len(draft.ReferenceId) > 255 {
			return nil, ErrSupportTicketInput
		}
		var order TopUp
		err := DB.WithContext(ctx).Select("user_id", "trade_no", "create_time", "status").Where("user_id = ? AND trade_no = ?", userId, draft.ReferenceId).Take(&order).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrSupportReference
		}
		if err != nil {
			return nil, err
		}
		ticket.ReferenceCreatedAt, ticket.ReferenceStatus = order.CreateTime, order.Status
	default:
		return nil, ErrSupportTicketInput
	}
	err := DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(ticket).Error; err != nil {
			return err
		}
		if err := tx.Create(&SupportTicketMessage{TicketId: ticket.Id, AuthorId: userId, AuthorType: "user", Body: draft.Body, CreatedAt: now}).Error; err != nil {
			return err
		}
		return tx.Create(&SupportTicketEvent{TicketID: ticket.Id, ActorType: "user", Kind: "created", NewValue: "open", CreatedAt: now}).Error
	})
	return ticket, err
}

func ListSupportTickets(ctx context.Context, userId int, all bool, status string, page, pageSize int) ([]SupportTicket, int64, int, error) {
	query := DB.WithContext(ctx).Model(&SupportTicket{})
	if !all {
		query = query.Where("user_id = ?", userId)
	}
	if status != "all" {
		query = query.Where("status = ?", status)
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, page, err
	}
	page = min(page, max(1, int((total+int64(pageSize)-1)/int64(pageSize))))
	items := []SupportTicket{}
	err := query.Order("updated_at DESC, id DESC").Limit(pageSize).Offset((page - 1) * pageSize).Find(&items).Error
	if err == nil {
		err = fillSupportTicketUnread(ctx, items, userId)
	}
	return items, total, page, err
}

func GetSupportTicket(ctx context.Context, id, userId int, admin bool) (*SupportTicket, error) {
	query := DB.WithContext(ctx).Where("id = ?", id)
	if !admin {
		query = query.Where("user_id = ?", userId)
	}
	var ticket SupportTicket
	err := query.Take(&ticket).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrSupportTicketNotFound
	}
	if err == nil {
		items := []SupportTicket{ticket}
		if err = fillSupportTicketUnread(ctx, items, userId); err == nil {
			ticket = items[0]
		}
	}
	return &ticket, err
}

func GetSupportTicketMessages(ctx context.Context, ticketId, page, pageSize int) ([]SupportTicketMessage, int64, error) {
	query := DB.WithContext(ctx).Model(&SupportTicketMessage{}).Where("ticket_id = ?", ticketId)
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	items := []SupportTicketMessage{}
	err := query.Order("id ASC").Limit(pageSize).Offset((page - 1) * pageSize).Find(&items).Error
	return items, total, err
}

// ChangeSupportTicket performs the authorization and version check inside the
// same transaction as the reply. The version predicate also protects SQLite,
// where SELECT FOR UPDATE is unavailable, from silently losing status changes.
func ChangeSupportTicket(ctx context.Context, id, userId int, admin bool, status, body string) (*SupportTicket, error) {
	return ChangeSupportTicketOperations(ctx, id, userId, admin, SupportTicketChange{Status: status, Body: body})
}

func ChangeSupportTicketOperations(ctx context.Context, id, userId int, admin bool, change SupportTicketChange) (*SupportTicket, error) {
	status, body := change.Status, strings.TrimSpace(change.Body)
	metadata := change.AssignedToID != nil || change.Priority != ""
	if metadata && !admin {
		return nil, ErrSupportTicketInput
	}
	if change.Priority != "" && !ValidSupportPriority(change.Priority) {
		return nil, ErrSupportTicketInput
	}
	if change.AssignedToID != nil && *change.AssignedToID < 0 {
		return nil, ErrSupportTicketInput
	}
	if body != "" && (status != "" || metadata || len(body) > 16384) {
		return nil, ErrSupportTicketInput
	}
	if body == "" && ((!metadata && status == "") || (status != "" && (!ValidSupportStatus(status) || (!admin && status != "closed" && status != "open")))) {
		return nil, ErrSupportTicketInput
	}
	var ticket SupportTicket
	err := DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		query := lockForUpdate(tx).Where("id = ?", id)
		if !admin {
			query = query.Where("user_id = ?", userId)
		}
		if err := query.Take(&ticket).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrSupportTicketNotFound
			}
			return err
		}
		if !admin && body == "" && status == "open" && ticket.Status != "closed" {
			return ErrSupportTicketInput
		}
		if body != "" {
			if ticket.Status == "closed" {
				return ErrSupportTicketClosed
			}
			var count int64
			if err := tx.Model(&SupportTicketMessage{}).Where("ticket_id = ?", id).Count(&count).Error; err != nil {
				return err
			}
			if count >= 500 {
				return ErrSupportTicketInput
			}
			status = "open"
			if admin {
				status = "awaiting_user"
			}
		}
		now := common.GetTimestamp()
		actorType := "user"
		if admin {
			actorType = "support"
		}
		updates := map[string]any{"updated_at": now, "version": ticket.Version + 1}
		events := []SupportTicketEvent{}
		if status != "" && status != ticket.Status {
			updates["status"] = status
			events = append(events, SupportTicketEvent{TicketID: id, ActorType: actorType, Kind: "status", OldValue: ticket.Status, NewValue: status, CreatedAt: now})
		}
		if change.Priority != "" && change.Priority != ticket.Priority {
			updates["priority"] = change.Priority
			events = append(events, SupportTicketEvent{TicketID: id, ActorType: actorType, Kind: "priority", OldValue: ticket.Priority, NewValue: change.Priority, CreatedAt: now})
			ticket.Priority = change.Priority
		}
		if change.AssignedToID != nil && *change.AssignedToID != ticket.AssignedToID {
			if *change.AssignedToID > 0 {
				var assignee User
				if err := tx.Select("id").Where("id = ? AND role >= ? AND status = ?", *change.AssignedToID, common.RoleAdminUser, common.UserStatusEnabled).Take(&assignee).Error; err != nil {
					if errors.Is(err, gorm.ErrRecordNotFound) {
						return ErrSupportTicketInput
					}
					return err
				}
			}
			updates["assigned_to_id"] = *change.AssignedToID
			events = append(events, SupportTicketEvent{TicketID: id, ActorType: actorType, Kind: "assigned", OldValue: fmt.Sprint(ticket.AssignedToID), NewValue: fmt.Sprint(*change.AssignedToID), CreatedAt: now})
			ticket.AssignedToID = *change.AssignedToID
		}
		result := tx.Model(&SupportTicket{}).Where("id = ? AND version = ?", id, ticket.Version).Updates(updates)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return ErrSupportTicketConflict
		}
		if body != "" {
			authorType := "user"
			if admin {
				authorType = "support"
			}
			message := SupportTicketMessage{TicketId: id, AuthorId: userId, AuthorType: authorType, Body: body, CreatedAt: now}
			if err := tx.Create(&message).Error; err != nil {
				return err
			}
			events = append(events, SupportTicketEvent{TicketID: id, ActorType: authorType, Kind: "reply", CreatedAt: now})
			if admin && ticket.UserId != userId {
				if _, err := EnqueueNotificationDeliveryTx(tx, NotificationDeliveryDraft{EventKey: fmt.Sprintf("support_ticket_reply:%d", message.Id), Kind: "support_ticket_reply", RecipientID: ticket.UserId, TicketID: id}, now); err != nil {
					return err
				}
			}
		}
		if len(events) > 0 {
			if err := tx.Create(&events).Error; err != nil {
				return err
			}
		}
		if status != "" {
			ticket.Status = status
		}
		ticket.UpdatedAt, ticket.Version = now, ticket.Version+1
		return nil
	})
	return &ticket, err
}
