package model

import (
	"context"
	"errors"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type SupportTicketChange struct {
	Status       string `json:"status"`
	Body         string `json:"-"`
	Priority     string `json:"priority"`
	AssignedToID *int   `json:"assigned_to_id"`
}

type SupportTicketEvent struct {
	ID        int64  `json:"id" gorm:"primaryKey"`
	TicketID  int    `json:"ticket_id" gorm:"index"`
	ActorType string `json:"actor_type" gorm:"size:16"`
	Kind      string `json:"kind" gorm:"size:24"`
	OldValue  string `json:"old_value" gorm:"size:24"`
	NewValue  string `json:"new_value" gorm:"size:24"`
	CreatedAt int64  `json:"created_at"`
}

type SupportTicketRead struct {
	ID            int64 `json:"-" gorm:"primaryKey"`
	TicketID      int   `json:"-" gorm:"uniqueIndex:idx_ticket_read_viewer,priority:1"`
	ViewerID      int   `json:"-" gorm:"uniqueIndex:idx_ticket_read_viewer,priority:2"`
	LastMessageID int   `json:"-"`
}

func ValidSupportPriority(priority string) bool {
	return priority == "low" || priority == "normal" || priority == "high" || priority == "urgent"
}

func fillSupportTicketUnread(ctx context.Context, tickets []SupportTicket, viewerID int) error {
	if len(tickets) == 0 {
		return nil
	}
	ids := make([]int, 0, len(tickets))
	for _, ticket := range tickets {
		ids = append(ids, ticket.Id)
	}
	// Table names follow the configured naming strategy, including test prefixes.
	messages := DB.NamingStrategy.TableName("SupportTicketMessage")
	receipts := DB.NamingStrategy.TableName("SupportTicketRead")
	var counts []struct {
		TicketID    int
		UnreadCount int64
	}
	err := DB.WithContext(ctx).Table(messages+" AS messages").Select("messages.ticket_id, COUNT(*) AS unread_count").
		Joins("LEFT JOIN "+receipts+" AS receipt ON receipt.ticket_id = messages.ticket_id AND receipt.viewer_id = ?", viewerID).
		Where("messages.ticket_id IN ? AND messages.author_id <> ? AND messages.id > COALESCE(receipt.last_message_id, 0)", ids, viewerID).
		Group("messages.ticket_id").Scan(&counts).Error
	if err != nil {
		return err
	}
	byID := make(map[int]int64, len(counts))
	for _, count := range counts {
		byID[count.TicketID] = count.UnreadCount
	}
	for i := range tickets {
		tickets[i].UnreadCount = byID[tickets[i].Id]
	}
	assignedIDs := []int{}
	for _, ticket := range tickets {
		if ticket.AssignedToID > 0 {
			assignedIDs = append(assignedIDs, ticket.AssignedToID)
		}
	}
	if len(assignedIDs) > 0 {
		var agents []User
		if err := DB.WithContext(ctx).Select("id", "username", "display_name").Where("id IN ? AND role >= ?", assignedIDs, common.RoleAdminUser).Find(&agents).Error; err != nil {
			return err
		}
		names := map[int]string{}
		for _, agent := range agents {
			name := agent.DisplayName
			if name == "" {
				name = agent.Username
			}
			names[agent.Id] = name
		}
		for i := range tickets {
			tickets[i].AssignedToName = names[tickets[i].AssignedToID]
		}
	}
	return nil
}

// MarkSupportTicketRead only advances to a message that actually belongs to the
// authorized ticket. A concurrent, later reply remains unread.
func MarkSupportTicketRead(ctx context.Context, ticketID, viewerID int, admin bool, messageID int) error {
	if messageID < 1 {
		return ErrSupportTicketInput
	}
	return DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		query := lockForUpdate(tx).Where("id = ?", ticketID)
		if !admin {
			query = query.Where("user_id = ?", viewerID)
		}
		var ticket SupportTicket
		if err := query.Take(&ticket).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrSupportTicketNotFound
			}
			return err
		}
		var message SupportTicketMessage
		if err := tx.Select("id").Where("id = ? AND ticket_id = ?", messageID, ticketID).Take(&message).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrSupportTicketInput
			}
			return err
		}
		receipt := SupportTicketRead{TicketID: ticketID, ViewerID: viewerID, LastMessageID: messageID}
		if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&receipt).Error; err != nil {
			return err
		}
		return tx.Model(&SupportTicketRead{}).Where("ticket_id = ? AND viewer_id = ? AND last_message_id < ?", ticketID, viewerID, messageID).Update("last_message_id", messageID).Error
	})
}

func GetSupportTicketEvents(ctx context.Context, ticketID, page, pageSize int) ([]SupportTicketEvent, int64, error) {
	query := DB.WithContext(ctx).Model(&SupportTicketEvent{}).Where("ticket_id = ?", ticketID)
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	items := []SupportTicketEvent{}
	err := query.Order("id DESC").Offset((page - 1) * pageSize).Limit(pageSize).Find(&items).Error
	return items, total, err
}
