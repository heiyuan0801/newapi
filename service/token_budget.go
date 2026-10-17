package service

import (
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/bytedance/gopkg/util/gopool"
)

func tokenBudgetStartedAt(info *relaycommon.RelayInfo) int64 {
	if info != nil && info.TokenBudgetStartedAt > 0 {
		return info.TokenBudgetStartedAt
	}
	return common.GetTimestamp()
}

func checkAndSendTokenBudgetNotify(info *relaycommon.RelayInfo) {
	if info == nil || info.IsPlayground || info.TokenId <= 0 {
		return
	}
	queueTokenBudgetNotify(info.UserId, info.TokenId, tokenBudgetStartedAt(info))
}

func queueTokenBudgetNotify(userID, tokenID int, at int64) {
	gopool.Go(func() {
		periods, err := model.ClaimTokenBudgetNotices(tokenID, at)
		if err != nil {
			common.SysError("Failed to claim API key budget notification")
			return
		}
		if len(periods) == 0 {
			return
		}
		user, err := model.GetUserById(userID, false)
		if err != nil {
			common.SysError("Failed to load API key budget notification recipient")
			return
		}
		settings := user.GetSetting()
		for _, period := range periods {
			title := i18n.Translate(settings.Language, "notify.token_budget_title")
			content := i18n.Translate(settings.Language, "notify.token_budget_"+period)
			if err := NotifyUser(userID, user.Email, settings, dto.NewNotify("token_budget_"+period, title, content, []any{})); err != nil {
				common.SysError("Failed to send API key budget notification")
			}
		}
	})
}
