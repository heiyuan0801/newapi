package model

import (
	"context"
	"errors"
	"fmt"
	"slices"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const SystemTaskTypeNotificationDelivery = "notification_delivery"

// NotificationDelivery stores delivery state, never destination credentials or
// provider response bodies. A provider acknowledgement means accepted, not read.
type NotificationDelivery struct {
	ID            int64  `json:"id" gorm:"primaryKey"`
	EventKey      string `json:"event_key" gorm:"size:160;uniqueIndex"`
	Kind          string `json:"kind" gorm:"size:40;index"`
	RecipientID   int    `json:"recipient_id" gorm:"index"`
	IncidentID    int64  `json:"incident_id" gorm:"index"`
	Status        string `json:"status" gorm:"size:16;index:idx_notification_due,priority:1"`
	Attempts      int    `json:"attempts"`
	MaxAttempts   int    `json:"max_attempts"`
	NextAttemptAt int64  `json:"next_attempt_at" gorm:"index:idx_notification_due,priority:2"`
	CreatedAt     int64  `json:"created_at" gorm:"index"`
	UpdatedAt     int64  `json:"updated_at"`
	SentAt        int64  `json:"sent_at"`
	LastErrorCode string `json:"last_error_code" gorm:"size:40"`
	Channel       string `json:"channel" gorm:"size:16"`
	Payload       string `json:"-" gorm:"type:text"`
	LeaseToken    string `json:"-" gorm:"size:40"`
	LeaseUntil    int64  `json:"-" gorm:"index"`
}

// The fixed metadata whitelist deliberately excludes reply text, API tokens,
// destinations and webhook secrets. RecipientID zero addresses the root user.
type NotificationDeliveryDraft struct {
	EventKey    string  `json:"-"`
	Kind        string  `json:"-"`
	RecipientID int     `json:"-"`
	IncidentID  int64   `json:"incident_id,omitempty"`
	TicketID    int     `json:"ticket_id,omitempty"`
	ModelName   string  `json:"model_name,omitempty"`
	Group       string  `json:"group,omitempty"`
	Source      string  `json:"source,omitempty"`
	SuccessRate float64 `json:"success_rate,omitempty"`
}

func EnqueueNotificationDeliveryTx(tx *gorm.DB, draft NotificationDeliveryDraft, now int64) (*NotificationDelivery, error) {
	if draft.EventKey == "" || len(draft.EventKey) > 160 || draft.RecipientID < 0 || !slices.Contains([]string{"availability_fault", "availability_recovery", "support_ticket_reply", "test"}, draft.Kind) {
		return nil, errors.New("invalid notification delivery")
	}
	payload, err := common.Marshal(draft)
	if err != nil {
		return nil, err
	}
	item := NotificationDelivery{EventKey: draft.EventKey, Kind: draft.Kind, RecipientID: draft.RecipientID, IncidentID: draft.IncidentID, Status: "pending", MaxAttempts: 4, NextAttemptAt: now, CreatedAt: now, UpdatedAt: now, Payload: string(payload)}
	if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&item).Error; err != nil {
		return nil, err
	}
	// Read by the unique event key on every engine; MySQL's no-op upsert may
	// report a primary key even when the existing event won the conflict.
	var stored NotificationDelivery
	if err := tx.Where("event_key = ?", draft.EventKey).Take(&stored).Error; err != nil {
		return nil, err
	}
	return &stored, nil
}

func EnqueueNotificationDelivery(ctx context.Context, draft NotificationDeliveryDraft, now int64) (*NotificationDelivery, error) {
	var item *NotificationDelivery
	err := DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var err error
		item, err = EnqueueNotificationDeliveryTx(tx, draft, now)
		return err
	})
	return item, err
}

func HasDueNotificationDeliveries(now int64) bool {
	var count int64
	err := DB.Model(&NotificationDelivery{}).Where("(status IN ? AND next_attempt_at <= ?) OR (status = ? AND lease_until <= ?)", []string{"pending", "retry"}, now, "sending", now).Limit(1).Count(&count).Error
	return err == nil && count > 0
}

// The row lease survives restarts. Conditional update also protects SQLite,
// where FOR UPDATE is unavailable. Delivery is at-least-once across crashes:
// an acknowledgement lost before persistence can lead to a bounded retry.
func ClaimNotificationDelivery(ctx context.Context, now int64) (*NotificationDelivery, error) {
	var claimed *NotificationDelivery
	err := DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var item NotificationDelivery
		err := lockForUpdate(tx).Where("(status IN ? AND next_attempt_at <= ?) OR (status = ? AND lease_until <= ?)", []string{"pending", "retry"}, now, "sending", now).Order("next_attempt_at ASC, id ASC").Take(&item).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil
		}
		if err != nil {
			return err
		}
		if item.Attempts >= item.MaxAttempts {
			return tx.Model(&NotificationDelivery{}).Where("id = ? AND attempts = ?", item.ID, item.Attempts).Updates(map[string]any{"status": "failed", "last_error_code": "delivery_interrupted", "lease_token": "", "lease_until": 0, "updated_at": now}).Error
		}
		lease := common.GetRandomString(32)
		result := tx.Model(&NotificationDelivery{}).Where("id = ? AND status = ? AND attempts = ? AND lease_until = ?", item.ID, item.Status, item.Attempts, item.LeaseUntil).Updates(map[string]any{"status": "sending", "attempts": item.Attempts + 1, "lease_token": lease, "lease_until": now + 180, "updated_at": now})
		if result.Error != nil || result.RowsAffected == 0 {
			return result.Error
		}
		item.Status, item.Attempts, item.LeaseToken, item.LeaseUntil, item.UpdatedAt = "sending", item.Attempts+1, lease, now+180, now
		claimed = &item
		return nil
	})
	return claimed, err
}

func FinishNotificationDelivery(ctx context.Context, item *NotificationDelivery, status, errorCode, channel string, now int64) error {
	if !slices.Contains([]string{"sent", "failed", "retry", "cancelled"}, status) || !slices.Contains([]string{"", "recipient_unavailable", "destination_missing", "unsupported_method", "delivery_failed", "rate_limited", "alerts_disabled", "alerts_silenced", "invalid_payload"}, errorCode) {
		return errors.New("invalid notification delivery outcome")
	}
	next := int64(0)
	if status == "retry" {
		if item.Attempts >= item.MaxAttempts {
			status = "failed"
		} else {
			next = now + []int64{60, 300, 1800}[min(max(item.Attempts-1, 0), 2)]
		}
	}
	sentAt := int64(0)
	if status == "sent" {
		sentAt = now
	}
	result := DB.WithContext(ctx).Model(&NotificationDelivery{}).Where("id = ? AND status = ? AND lease_token = ?", item.ID, "sending", item.LeaseToken).Updates(map[string]any{"status": status, "last_error_code": errorCode, "channel": channel, "next_attempt_at": next, "sent_at": sentAt, "updated_at": now, "lease_token": "", "lease_until": 0})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		return errors.New("notification delivery lease lost")
	}
	return nil
}

func ActiveNotificationDeliveryLease(ctx context.Context, item *NotificationDelivery, now int64) (bool, error) {
	var count int64
	err := DB.WithContext(ctx).Model(&NotificationDelivery{}).Where("id = ? AND status = ? AND lease_token = ? AND lease_until > ?", item.ID, "sending", item.LeaseToken, now).Count(&count).Error
	return count == 1, err
}

type NotificationDeliveryFilter struct {
	Status     string
	Kind       string
	IncidentID int64
	Page       int
	PageSize   int
}

func ListNotificationDeliveries(ctx context.Context, filter NotificationDeliveryFilter) ([]NotificationDelivery, int64, error) {
	query := DB.WithContext(ctx).Model(&NotificationDelivery{})
	if filter.Status != "" && filter.Status != "all" {
		query = query.Where("status = ?", filter.Status)
	}
	if filter.Kind != "" && filter.Kind != "all" {
		query = query.Where("kind = ?", filter.Kind)
	}
	if filter.IncidentID > 0 {
		query = query.Where("incident_id = ?", filter.IncidentID)
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	items := []NotificationDelivery{}
	err := query.Order("id DESC").Limit(filter.PageSize).Offset((max(filter.Page, 1) - 1) * filter.PageSize).Find(&items).Error
	return items, total, err
}

func AvailabilityNotificationEventKey(id int64, recovery bool) string {
	return fmt.Sprintf("availability:%d:%t", id, recovery)
}

func CleanupNotificationDeliveries(ctx context.Context, cutoff int64) error {
	return DB.WithContext(ctx).Where("created_at < ? AND status IN ?", cutoff, []string{"sent", "failed", "cancelled"}).Delete(&NotificationDelivery{}).Error
}
