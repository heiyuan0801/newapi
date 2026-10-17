package model

import (
	"context"
	"errors"
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
	ticket := &SupportTicket{UserId: userId, Title: draft.Title, Status: "open", ReferenceType: draft.ReferenceType, ReferenceId: draft.ReferenceId, CreatedAt: now, UpdatedAt: now, Version: 1}
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
		return tx.Create(&SupportTicketMessage{TicketId: ticket.Id, AuthorId: userId, AuthorType: "user", Body: draft.Body, CreatedAt: now}).Error
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
	body = strings.TrimSpace(body)
	if body != "" && (status != "" || len(body) > 16384) {
		return nil, ErrSupportTicketInput
	}
	if body == "" && (!ValidSupportStatus(status) || (!admin && status != "closed" && status != "open")) {
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
		result := tx.Model(&SupportTicket{}).Where("id = ? AND version = ?", id, ticket.Version).Updates(map[string]any{"status": status, "updated_at": now, "version": ticket.Version + 1})
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
			if err := tx.Create(&SupportTicketMessage{TicketId: id, AuthorId: userId, AuthorType: authorType, Body: body, CreatedAt: now}).Error; err != nil {
				return err
			}
		}
		ticket.Status, ticket.UpdatedAt, ticket.Version = status, now, ticket.Version+1
		return nil
	})
	return &ticket, err
}
