package controller

import (
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

func GetMonthlyWalletReport(c *gin.Context) {
	now := time.Now().UTC()
	monthText := c.DefaultQuery("month", now.Format("2006-01"))
	month, err := time.Parse("2006-01", monthText)
	if err != nil || month.Year() < 2000 || month.After(time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)) {
		common.ApiErrorT(c, "Invalid billing month")
		return
	}
	report, err := model.GetMonthlyWalletReport(c.GetInt("id"), month)
	if err != nil {
		common.SysError("failed to load monthly usage report: " + err.Error())
		common.ApiErrorT(c, "Unable to load monthly usage report")
		return
	}
	common.ApiSuccess(c, report)
}

func GetAffiliateRewards(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	pageInfo.Page = max(1, pageInfo.Page)
	pageInfo.PageSize = max(1, min(100, pageInfo.PageSize))
	rows, total, err := model.GetAffiliateRewards(c.GetInt("id"), pageInfo)
	if err != nil {
		common.SysError("failed to load referral rewards: " + err.Error())
		common.ApiErrorT(c, "Unable to load referral reward history")
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(rows)
	common.ApiSuccess(c, pageInfo)
}
