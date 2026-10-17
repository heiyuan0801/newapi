package service

import (
	"context"
	"errors"
	"fmt"
	"html"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/setting/availability_setting"
	"gorm.io/gorm"
)

type notificationDeliveryHandler struct{}

func init() { RegisterSystemTaskHandler(notificationDeliveryHandler{}) }

func (notificationDeliveryHandler) Type() string { return model.SystemTaskTypeNotificationDelivery }
func (notificationDeliveryHandler) Enabled() bool {
	return model.HasDueNotificationDeliveries(time.Now().Unix())
}
func (notificationDeliveryHandler) Interval() time.Duration { return 15 * time.Second }
func (notificationDeliveryHandler) NewPayload() any         { return nil }
func (notificationDeliveryHandler) Run(ctx context.Context, task *model.SystemTask, runnerID string) {
	processed, err := ProcessNotificationDeliveries(ctx, 20)
	status, message := model.SystemTaskStatusSucceeded, ""
	if err != nil {
		status, message = model.SystemTaskStatusFailed, "notification delivery persistence failed"
	}
	if err := model.FinishSystemTask(task.TaskID, runnerID, status, map[string]int{"processed": processed}, message); err != nil {
		common.SysLog("notification delivery task result persistence failed")
	}
}

// ProcessNotificationDeliveries performs only persisted, bounded delivery work.
// It never probes models. A 180s row lease exceeds the 40s provider deadline.
func ProcessNotificationDeliveries(ctx context.Context, limit int) (int, error) {
	processed := 0
	for range min(max(limit, 1), 100) {
		if err := ctx.Err(); err != nil {
			return processed, err
		}
		item, err := model.ClaimNotificationDelivery(ctx, time.Now().Unix())
		if err != nil || item == nil {
			return processed, err
		}
		// Bound the entire attempt, including recipient reads and rate checks,
		// rather than starting the deadline only after those operations finish.
		deliveryCtx, cancelDelivery := context.WithTimeout(ctx, 40*time.Second)
		status, code, channel := deliverNotification(deliveryCtx, item)
		cancelDelivery()
		// Persist acknowledgement even if task cancellation raced with the
		// external response; otherwise a successful send would be retried.
		persistCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		err = model.FinishNotificationDelivery(persistCtx, item, status, code, channel, time.Now().Unix())
		cancel()
		if err != nil {
			return processed, err
		}
		processed++
	}
	return processed, nil
}

func deliverNotification(ctx context.Context, item *model.NotificationDelivery) (status, code, channel string) {
	if item.Kind == "availability_fault" || item.Kind == "availability_recovery" {
		setting := availability_setting.Get()
		if !setting.AlertsEnabled {
			return "cancelled", "alerts_disabled", ""
		}
		if time.Now().Unix() < setting.SilenceUntil {
			return "cancelled", "alerts_silenced", ""
		}
	}
	var user model.User
	query := model.DB.WithContext(ctx).Select("id", "email", "setting", "status")
	if item.RecipientID == 0 {
		query = query.Where("role = ?", common.RoleRootUser)
	} else {
		query = query.Where("id = ?", item.RecipientID)
	}
	if err := query.Take(&user).Error; err != nil {
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return "retry", "delivery_failed", ""
		}
		return "failed", "recipient_unavailable", ""
	}
	if user.Status != common.UserStatusEnabled {
		return "failed", "recipient_unavailable", ""
	}
	var setting dto.UserSetting
	if user.Setting != "" && common.UnmarshalJsonStr(user.Setting, &setting) != nil {
		return "failed", "invalid_payload", ""
	}
	channel = setting.NotifyType
	if channel == "" {
		channel = dto.NotifyTypeEmail
	}
	switch channel {
	case dto.NotifyTypeEmail:
		if (setting.NotificationEmail == "" && user.Email == "") || common.SMTPServer == "" {
			return "failed", "destination_missing", channel
		}
	case dto.NotifyTypeWebhook:
		if setting.WebhookUrl == "" {
			return "failed", "destination_missing", channel
		}
	case dto.NotifyTypeBark:
		if setting.BarkUrl == "" {
			return "failed", "destination_missing", channel
		}
	case dto.NotifyTypeGotify:
		if setting.GotifyUrl == "" || setting.GotifyToken == "" {
			return "failed", "destination_missing", channel
		}
	default:
		return "failed", "unsupported_method", ""
	}
	var draft model.NotificationDeliveryDraft
	if err := common.UnmarshalJsonStr(item.Payload, &draft); err != nil {
		return "failed", "invalid_payload", channel
	}
	subject, content := "", ""
	switch item.Kind {
	case "availability_fault", "availability_recovery":
		key, contentKey := i18n.MsgAvailabilityFaultSubject, i18n.MsgAvailabilityFaultContent
		if item.Kind == "availability_recovery" {
			key, contentKey = i18n.MsgAvailabilityRecoverySubject, i18n.MsgAvailabilityRecoveryContent
		}
		variables := map[string]any{"Model": html.EscapeString(draft.ModelName), "Group": html.EscapeString(draft.Group), "Source": html.EscapeString(draft.Source), "Rate": draft.SuccessRate}
		subject, content = i18n.Translate(setting.Language, key), i18n.Translate(setting.Language, contentKey, variables)
	case "support_ticket_reply":
		if draft.TicketID <= 0 {
			return "failed", "invalid_payload", channel
		}
		subject = i18n.Translate(setting.Language, "notification.ticket_reply_subject")
		content = i18n.Translate(setting.Language, "notification.ticket_reply_content", map[string]any{"TicketID": draft.TicketID, "Link": fmt.Sprintf("/support-tickets?ticket=%d", draft.TicketID)})
	case "test":
		subject, content = i18n.Translate(setting.Language, "notification.test_subject"), i18n.Translate(setting.Language, "notification.test_content")
	default:
		return "failed", "invalid_payload", channel
	}
	active, err := model.ActiveNotificationDeliveryLease(ctx, item, time.Now().Unix())
	if err != nil || !active || ctx.Err() != nil {
		return "retry", "delivery_failed", channel
	}
	if err := notifyUserWithContext(ctx, user.Id, user.Email, setting, dto.NewNotify(item.Kind, subject, content, nil)); err != nil {
		// Never persist native errors: net/url and SMTP errors may contain
		// usable credentials, addresses, secrets or upstream response bodies.
		if strings.HasPrefix(err.Error(), "notification limit exceeded") {
			return "retry", "rate_limited", channel
		}
		return "retry", "delivery_failed", channel
	}
	return "sent", "", channel
}

// The event key is an atomic per-user UTC minute bucket. Duplicate requests
// return the same queued event and cannot multiply external test messages.
func EnqueueNotificationTest(ctx context.Context, userID int, now int64) (*model.NotificationDelivery, error) {
	if userID <= 0 {
		return nil, fmt.Errorf("invalid notification recipient")
	}
	key := fmt.Sprintf("notification-test:%d:%d", userID, now/60)
	item, err := model.EnqueueNotificationDelivery(ctx, model.NotificationDeliveryDraft{EventKey: key, Kind: "test", RecipientID: userID}, now)
	if err == nil {
		notifySystemTaskRunner()
	}
	return item, err
}
