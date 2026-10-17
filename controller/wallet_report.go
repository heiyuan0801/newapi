package controller

import (
	"context"
	"encoding/csv"
	"errors"
	"io"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

var monthlyExportSlots = make(chan struct{}, 2)
var errMonthlyExportTooLarge = errors.New("monthly report export exceeds the size limit")

type boundedMonthlyExportWriter struct {
	writer    io.Writer
	remaining int64
}

func (w *boundedMonthlyExportWriter) Write(data []byte) (int, error) {
	if int64(len(data)) > w.remaining {
		return 0, errMonthlyExportTooLarge
	}
	n, err := w.writer.Write(data)
	w.remaining -= int64(n)
	return n, err
}

func GetMonthlyWalletReport(c *gin.Context) {
	month, ok := walletReportMonth(c)
	if !ok {
		return
	}
	page := common.GetPageQuery(c)
	if c.Query("page_size") == "" && c.Query("ps") == "" && c.Query("size") == "" {
		page.PageSize = 50
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()
	report, err := model.GetMonthlyWalletReportPage(ctx, c.GetInt("id"), month, page.Page, page.PageSize)
	if err != nil {
		common.SysError("failed to load monthly usage report: " + err.Error())
		common.ApiErrorT(c, "Unable to load monthly usage report")
		return
	}
	common.ApiSuccess(c, report)
}

func GetWalletReconciliation(c *gin.Context) {
	month, ok := walletReportMonth(c)
	if !ok {
		return
	}
	page := common.GetPageQuery(c)
	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()
	report, err := model.GetWalletReconciliation(ctx, c.GetInt("id"), month, c.DefaultQuery("source", "all"), c.Query("cursor"), page.PageSize)
	if err != nil {
		if errors.Is(err, model.ErrInvalidReconciliationCursor) {
			common.ApiErrorT(c, "Invalid reconciliation filter or cursor")
			return
		}
		common.SysError("failed to load wallet reconciliation: " + err.Error())
		common.ApiErrorT(c, "Unable to load wallet reconciliation")
		return
	}
	common.ApiSuccess(c, report)
}

func walletReportMonth(c *gin.Context) (time.Time, bool) {
	now := time.Now().UTC()
	monthText := c.DefaultQuery("month", now.Format("2006-01"))
	month, err := time.Parse("2006-01", monthText)
	if err != nil || month.Year() < 2000 || month.After(time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)) {
		common.ApiErrorT(c, "Invalid billing month")
		return time.Time{}, false
	}
	return month, true
}

// ExportMonthlyWalletReport streams the database cursor into a private bounded
// temporary file first. Query failures can then return an error instead of a
// successful but incomplete CSV. The finished download has a Content-Length.
func ExportMonthlyWalletReport(c *gin.Context) {
	month, ok := walletReportMonth(c)
	if !ok {
		return
	}
	select {
	case monthlyExportSlots <- struct{}{}:
		defer func() { <-monthlyExportSlots }()
	default:
		common.ApiErrorT(c, "Monthly report export is busy. Try again later.")
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Minute)
	defer cancel()
	rows, err := model.OpenMonthlyWalletReportRows(ctx, c.GetInt("id"), month)
	if err != nil {
		common.SysError("failed to export monthly usage report: " + err.Error())
		common.ApiErrorT(c, "Unable to load monthly usage report")
		return
	}
	defer rows.Close()
	file, err := os.CreateTemp("", "new-api-monthly-*.csv")
	if err != nil {
		common.SysError("unable to create a private monthly usage export file")
		common.ApiErrorT(c, "Unable to load monthly usage report")
		return
	}
	defer func() {
		_ = file.Close()
		if os.Remove(file.Name()) != nil {
			common.SysError("unable to remove a private monthly usage export file")
		}
	}()
	output := &boundedMonthlyExportWriter{writer: file, remaining: 100 << 20}
	_, err = output.Write([]byte("\xef\xbb\xbf"))
	writer := csv.NewWriter(output)
	if err == nil {
		err = writer.Write([]string{"month_utc", "model", "group", "token_id", "token_name", "requests", "tokens", "quota_units", "source", "report_type"})
	}
	count := 0
	for err == nil && rows.Next() {
		var row model.MonthlyUsageRow
		err = rows.Scan(&row.ModelName, &row.UseGroup, &row.TokenID, &row.Quota, &row.Count, &row.TokenUsed, &row.TokenName)
		if err != nil {
			break
		}
		err = writer.Write([]string{month.Format("2006-01"), walletCSVText(row.ModelName), walletCSVText(row.UseGroup), strconv.Itoa(row.TokenID), walletCSVText(row.TokenName), strconv.FormatInt(row.Count, 10), strconv.FormatInt(row.TokenUsed, 10), strconv.FormatInt(row.Quota, 10), "quota_data", "collected_usage_not_settlement_ledger"})
		count++
		if count%500 == 0 {
			writer.Flush()
			err = writer.Error()
		}
	}
	if err == nil {
		err = rows.Err()
	}
	writer.Flush()
	if err == nil {
		err = writer.Error()
	}
	if err == nil {
		err = ctx.Err()
	}
	if err == nil {
		err = file.Close()
	}
	if err != nil {
		common.SysError("monthly usage export interrupted: " + err.Error())
		if errors.Is(err, errMonthlyExportTooLarge) {
			common.ApiErrorT(c, "Monthly report exceeds the 100 MiB export limit")
			return
		}
		common.ApiErrorT(c, "Unable to load monthly usage report")
		return
	}
	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.Header("Cache-Control", "no-store")
	c.Header("X-Content-Type-Options", "nosniff")
	c.Header("X-Export-Status", "complete")
	c.Header("Access-Control-Expose-Headers", "X-Export-Status, Content-Disposition, Content-Length")
	c.FileAttachment(file.Name(), "monthly-usage-"+month.Format("2006-01")+".csv")
}

func walletCSVText(value string) string {
	trimmed := strings.TrimLeft(value, " \t\r\n")
	if trimmed != "" && strings.ContainsRune("=+-@", rune(trimmed[0])) || strings.HasPrefix(value, "\t") || strings.HasPrefix(value, "\r") || strings.HasPrefix(value, "\n") {
		return "'" + value
	}
	return value
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
