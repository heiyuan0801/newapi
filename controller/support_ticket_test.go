package controller

import (
	"context"
	"fmt"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/schema"
)

func supportTicketTestDatabase(t *testing.T, dialect string) *gorm.DB {
	t.Helper()
	var dialector gorm.Dialector = sqlite.Open(":memory:")
	if dialect == "mysql" {
		dsn := os.Getenv("TEST_MYSQL_DSN")
		if dsn == "" {
			t.Skip("isolated MySQL DSN is not configured")
		}
		dialector = mysql.Open(dsn)
	}
	if dialect == "postgres" {
		dsn := os.Getenv("TEST_POSTGRES_DSN")
		if dsn == "" {
			t.Skip("isolated PostgreSQL DSN is not configured")
		}
		dialector = postgres.Open(dsn)
	}
	db, err := gorm.Open(dialector, &gorm.Config{NamingStrategy: schema.NamingStrategy{TablePrefix: "support_feature_test_"}})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	oldDB, oldLogDB := model.DB, model.LOG_DB
	oldType, oldLogType := common.MainDatabaseType(), common.LogDatabaseType()
	dbType := common.DatabaseTypeSQLite
	if dialect == "mysql" {
		dbType = common.DatabaseTypeMySQL
	}
	if dialect == "postgres" {
		dbType = common.DatabaseTypePostgreSQL
	}
	common.SetDatabaseTypes(dbType, dbType)
	model.DB, model.LOG_DB = db, db
	tables := []any{&model.SupportTicket{}, &model.SupportTicketMessage{}, &model.Log{}, &model.TopUp{}}
	require.NoError(t, db.Migrator().DropTable(tables...))
	require.NoError(t, db.AutoMigrate(tables...))
	require.NoError(t, db.AutoMigrate(tables...))
	t.Cleanup(func() {
		require.NoError(t, db.Migrator().DropTable(tables...))
		model.DB, model.LOG_DB = oldDB, oldLogDB
		common.SetDatabaseTypes(oldType, oldLogType)
		require.NoError(t, sqlDB.Close())
	})
	return db
}

type supportTestResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
	Data    struct {
		Id          int                          `json:"id"`
		Status      string                       `json:"status"`
		ReferenceId string                       `json:"reference_id"`
		ModelName   string                       `json:"model_name"`
		GroupName   string                       `json:"group_name"`
		Items       []model.SupportTicket        `json:"items"`
		Ticket      model.SupportTicket          `json:"ticket"`
		Messages    []model.SupportTicketMessage `json:"messages"`
		Total       int                          `json:"total"`
		Page        int                          `json:"page"`
	} `json:"data"`
}

func supportTicketRequest(t *testing.T, userId, role int, method, target, body string) (supportTestResponse, string, int) {
	t.Helper()
	router := gin.New()
	router.Use(func(c *gin.Context) { c.Set("id", userId); c.Set("role", role); c.Next() })
	router.GET("/tickets", ListSupportTickets)
	router.POST("/tickets", CreateSupportTicket)
	router.GET("/tickets/:id", GetSupportTicket)
	router.PATCH("/tickets/:id", UpdateSupportTicket)
	router.POST("/tickets/:id/replies", ReplySupportTicket)
	request := httptest.NewRequest(method, target, strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)
	var response supportTestResponse
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	return response, recorder.Body.String(), recorder.Code
}

func TestSupportTicketWorkflowDatabaseMatrix(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, dialect := range []string{"sqlite", "mysql", "postgres"} {
		t.Run(dialect, func(t *testing.T) {
			db := supportTicketTestDatabase(t, dialect)
			require.NoError(t, db.Create(&model.Log{UserId: 7, RequestId: "failed-own", Type: model.LogTypeError, ModelName: "gpt-demo", Group: "vip", Content: "private diagnostic body", Other: "private diagnostics"}).Error)
			require.NoError(t, db.Create(&model.Log{UserId: 8, RequestId: "failed-other", Type: model.LogTypeError, ModelName: "private-model"}).Error)
			require.NoError(t, db.Create(&model.Log{UserId: 7, RequestId: "success-own", Type: model.LogTypeConsume}).Error)
			require.NoError(t, db.Create(&model.TopUp{UserId: 7, TradeNo: "order-own", Status: "pending"}).Error)
			require.NoError(t, db.Create(&model.TopUp{UserId: 8, TradeNo: "order-other", Status: "pending"}).Error)

			t.Run("owned failed request copies only safe context", func(t *testing.T) {
				created, raw, _ := supportTicketRequest(t, 7, common.RoleCommonUser, "POST", "/tickets", `{"title":"Request failed","body":"Please investigate","reference_type":"request","reference_id":"failed-own"}`)
				require.True(t, created.Success)
				assert.Equal(t, "vip", created.Data.GroupName)
				assert.Equal(t, "gpt-demo", created.Data.ModelName)
				assert.NotContains(t, raw, "private diagnostic")
				target := fmt.Sprintf("/tickets/%d", created.Data.Id)
				for _, mutation := range []struct{ method, suffix, body string }{{"GET", "", ""}, {"PATCH", "", `{"status":"closed"}`}, {"POST", "/replies", `{"body":"other user's reply"}`}} {
					response, leaked, _ := supportTicketRequest(t, 8, common.RoleCommonUser, mutation.method, target+mutation.suffix, mutation.body)
					assert.False(t, response.Success)
					assert.NotContains(t, leaked, "Please investigate")
				}
				started, _, _ := supportTicketRequest(t, 1, common.RoleAdminUser, "PATCH", target, `{"status":"in_progress"}`)
				require.True(t, started.Success)
				replied, _, _ := supportTicketRequest(t, 1, common.RoleAdminUser, "POST", target+"/replies", `{"body":"We are checking"}`)
				require.True(t, replied.Success)
				assert.Equal(t, "awaiting_user", replied.Data.Status)
				answered, _, _ := supportTicketRequest(t, 7, common.RoleCommonUser, "POST", target+"/replies", `{"body":"Additional details"}`)
				require.True(t, answered.Success)
				assert.Equal(t, "open", answered.Data.Status)
				closed, _, _ := supportTicketRequest(t, 7, common.RoleCommonUser, "PATCH", target, `{"status":"closed"}`)
				require.True(t, closed.Success)
				blocked, _, _ := supportTicketRequest(t, 7, common.RoleCommonUser, "POST", target+"/replies", `{"body":"Cannot post to a closed ticket"}`)
				assert.False(t, blocked.Success)
				detail, _, _ := supportTicketRequest(t, 7, common.RoleCommonUser, "GET", target+"?page=2&page_size=2", "")
				require.True(t, detail.Success)
				assert.Equal(t, 3, detail.Data.Total)
				require.Len(t, detail.Data.Messages, 1)
				assert.Equal(t, "Additional details", detail.Data.Messages[0].Body)
				assert.Equal(t, "user", detail.Data.Messages[0].AuthorType)
			})
			t.Run("references cannot attach another account or successful request", func(t *testing.T) {
				for _, ref := range []struct{ kind, id string }{{"request", "failed-other"}, {"request", "success-own"}, {"order", "order-other"}} {
					body, err := common.Marshal(model.SupportTicketDraft{Title: "Help", Body: "Investigate", ReferenceType: ref.kind, ReferenceId: ref.id})
					require.NoError(t, err)
					response, _, _ := supportTicketRequest(t, 7, common.RoleCommonUser, "POST", "/tickets", string(body))
					assert.False(t, response.Success)
				}
				response, _, _ := supportTicketRequest(t, 7, common.RoleCommonUser, "POST", "/tickets", `{"title":"Payment help","body":"Check this order","reference_type":"order","reference_id":"order-own"}`)
				require.True(t, response.Success)
				assert.Equal(t, "order-own", response.Data.ReferenceId)
			})
			t.Run("user scope and bounded input are enforced", func(t *testing.T) {
				own, _, _ := supportTicketRequest(t, 8, common.RoleCommonUser, "POST", "/tickets", `{"title":"General help","body":"No association"}`)
				require.True(t, own.Success)
				second, _, _ := supportTicketRequest(t, 8, common.RoleCommonUser, "POST", "/tickets", `{"title":"Another issue","body":"Independent second ticket"}`)
				require.True(t, second.Success)
				mine, _, _ := supportTicketRequest(t, 8, common.RoleCommonUser, "GET", "/tickets?page_size=1", "")
				require.True(t, mine.Success)
				assert.Equal(t, 2, mine.Data.Total)
				all, _, code := supportTicketRequest(t, 8, common.RoleCommonUser, "GET", "/tickets?scope=all", "")
				assert.Equal(t, 403, code)
				assert.False(t, all.Success)
				admin, _, _ := supportTicketRequest(t, 1, common.RoleAdminUser, "GET", "/tickets?scope=all&page=2&page_size=1", "")
				require.True(t, admin.Success)
				assert.GreaterOrEqual(t, admin.Data.Total, 2)
				assert.Len(t, admin.Data.Items, 1)
				lastPage, _, _ := supportTicketRequest(t, 8, common.RoleCommonUser, "GET", "/tickets?page=99&page_size=20", "")
				require.True(t, lastPage.Success)
				assert.Equal(t, 1, lastPage.Data.Page)
				assert.Len(t, lastPage.Data.Items, 2, "a removed last page falls back to the last remaining page")
				for _, target := range []string{"/tickets?page=-1", "/tickets?page_size=101", "/tickets?status=invalid"} {
					invalid, _, _ := supportTicketRequest(t, 7, common.RoleCommonUser, "GET", target, "")
					assert.False(t, invalid.Success)
				}
				tooLong, err := common.Marshal(model.SupportTicketDraft{Title: "Oversized", Body: strings.Repeat("x", 16385)})
				require.NoError(t, err)
				invalid, _, _ := supportTicketRequest(t, 7, common.RoleCommonUser, "POST", "/tickets", string(tooLong))
				assert.False(t, invalid.Success)
				largeRequest := `{"title":"oversized request","body":"ok","padding":"` + strings.Repeat("x", 65536) + `"}`
				invalid, _, _ = supportTicketRequest(t, 7, common.RoleCommonUser, "POST", "/tickets", largeRequest)
				assert.False(t, invalid.Success)
			})
			t.Run("competing final replies cannot exceed the conversation limit", func(t *testing.T) {
				created, err := model.CreateSupportTicket(context.Background(), 7, model.SupportTicketDraft{Title: "Conversation limit", Body: "Initial message"})
				require.NoError(t, err)
				messages := make([]model.SupportTicketMessage, 498)
				for i := range messages {
					messages[i] = model.SupportTicketMessage{TicketId: created.Id, AuthorType: "user", Body: "Earlier message", CreatedAt: 100}
				}
				require.NoError(t, db.CreateInBatches(messages, 100).Error)
				if dialect != "sqlite" {
					sqlDB, err := db.DB()
					require.NoError(t, err)
					sqlDB.SetMaxOpenConns(4)
				}
				start := make(chan struct{})
				results := make(chan error, 2)
				var workers sync.WaitGroup
				for range 2 {
					workers.Go(func() {
						<-start
						_, err := model.ChangeSupportTicket(context.Background(), created.Id, 7, false, "", "Final reply")
						results <- err
					})
				}
				close(start)
				workers.Wait()
				close(results)
				successes := 0
				for err := range results {
					if err == nil {
						successes++
					} else {
						require.ErrorIs(t, err, model.ErrSupportTicketInput)
					}
				}
				assert.Equal(t, 1, successes)
				var count int64
				require.NoError(t, db.Model(&model.SupportTicketMessage{}).Where("ticket_id = ?", created.Id).Count(&count).Error)
				assert.Equal(t, int64(500), count)
			})
		})
	}
}
