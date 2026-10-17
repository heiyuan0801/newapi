package main

import (
	"crypto/sha256"
	"fmt"
	"os"
	"sort"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

func must(err error) {
	if err != nil {
		panic(err)
	}
}
func main() {
	common.IsMasterNode = os.Getenv("MATRIX_INSPECT_EMPTY") != "1"
	common.DebugEnabled = true
	common.SQLitePath = os.Getenv("MATRIX_SQLITE_PATH")
	if os.Getenv("MATRIX_CONFIRM_DISPOSABLE") != "yes" {
		panic("this command requires an isolated disposable database")
	}
	must(model.InitDB())
	if os.Getenv("MATRIX_INSPECT_EMPTY") == "1" {
		tables, err := model.DB.Migrator().GetTables()
		must(err)
		if len(tables) != 0 {
			panic("refusing a non-empty disposable database")
		}
		connection, err := model.DB.DB()
		must(err)
		must(connection.Close())
		return
	}
	must(model.InitLogDB())
	db := model.DB
	if os.Getenv("MATRIX_SEED") == "1" {
		password, err := common.Password2Hash("matrix-fixture-unused-password")
		must(err)
		user := model.User{Username: "matrix-preserved", Password: password, DisplayName: "Matrix fixture", Role: 1, Status: 1, Email: "fixture@example.invalid", Quota: 345678, UsedQuota: 1234, Group: "default", AffCode: "matrix-fixture-aff", AuthVersion: 1}
		must(db.Where("username = ?", user.Username).FirstOrCreate(&user).Error)
		address := "http://127.0.0.1:9"
		channel := model.Channel{Type: 1, Key: "synthetic-channel-fixture-key-not-real", Status: 1, Name: "matrix-preserved-channel", BaseURL: &address, Models: "matrix-preserved-model", Group: "default", CreatedTime: 1700000000, UsedQuota: 2345}
		must(db.Where("name = ?", channel.Name).FirstOrCreate(&channel).Error)
		token := model.Token{UserId: user.Id, Key: "matrix-token-fixture-key-not-real-0000000000000001", Status: 1, Name: "matrix-preserved-token", CreatedTime: 1700000001, ExpiredTime: -1, RemainQuota: 234567, UsedQuota: 1234, Group: "default"}
		must(db.Where("name = ?", token.Name).FirstOrCreate(&token).Error)
		perf := model.PerfMetric{ModelName: "matrix-preserved-model", Group: "default", BucketTs: 1700000400, RequestCount: 17, SuccessCount: 13, TotalLatencyMs: 12345, TtftSumMs: 1234, TtftCount: 13, OutputTokens: 5678, GenerationMs: 6789}
		must(db.Where("model_name = ? AND bucket_ts = ?", perf.ModelName, perf.BucketTs).FirstOrCreate(&perf).Error)
		option := model.Option{Key: "MatrixPreservedOption", Value: "matrix-preserved-value"}
		must(db.Where(&model.Option{Key: option.Key}).FirstOrCreate(&option).Error)
	}
	var sqliteVersion string
	if common.MainDatabaseType() == common.DatabaseTypeSQLite {
		must(db.Raw("SELECT sqlite_version()").Scan(&sqliteVersion).Error)
	}
	tables, err := db.Migrator().GetTables()
	must(err)
	sort.Strings(tables)
	type indexInfo struct {
		Name    string   `json:"name"`
		Columns []string `json:"columns"`
		Unique  bool     `json:"unique"`
		Primary bool     `json:"primary"`
	}
	indexes := map[string][]indexInfo{}
	counts := map[string]int64{}
	for _, table := range tables {
		var count int64
		must(db.Table(table).Count(&count).Error)
		counts[table] = count
		list, e := db.Migrator().GetIndexes(table)
		must(e)
		for _, v := range list {
			u, _ := v.Unique()
			p, _ := v.PrimaryKey()
			indexes[table] = append(indexes[table], indexInfo{v.Name(), v.Columns(), u, p})
		}
		sort.Slice(indexes[table], func(i, j int) bool { return indexes[table][i].Name < indexes[table][j].Name })
	}
	type rows map[string][]map[string]any
	values := rows{}
	for _, table := range []string{"users", "channels", "tokens", "perf_metrics", "options"} {
		var result []map[string]any
		must(db.Table(table).Find(&result).Error)
		for _, row := range result {
			for key, value := range row {
				if raw, ok := value.([]byte); ok {
					row[key] = string(raw)
				}
			}
		}
		values[table] = result
	}
	hashes := map[string]map[string]string{}
	for _, table := range []string{"users", "channels", "tokens"} {
		hashes[table] = map[string]string{}
		for _, row := range values[table] {
			field := "key"
			if table == "users" {
				field = "password"
			}
			hashes[table][fmt.Sprint(row["id"])] = fmt.Sprintf("%x", sha256.Sum256([]byte(fmt.Sprint(row[field]))))
		}
	}
	for _, row := range values["users"] {
		delete(row, "password")
		delete(row, "access_token")
	}
	for _, row := range values["channels"] {
		delete(row, "key")
	}
	for _, row := range values["tokens"] {
		delete(row, "key")
	}
	output := map[string]any{"version": common.Version, "captured_at": time.Now().UTC().Format(time.RFC3339), "sqlite_version": sqliteVersion, "counts": counts, "indexes": indexes, "rows": values, "sensitive_fixture_hashes": hashes}
	data, err := common.Marshal(output)
	must(err)
	must(os.WriteFile(os.Getenv("MATRIX_SNAPSHOT"), append(data, '\n'), 0600))
	must(model.CloseDB())
	fmt.Println("Release migration and snapshot succeeded")
}
