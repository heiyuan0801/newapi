<div align="center">

![new-api](/web/public/logo.png)

# New API

**连接模型、应用与 Agent 的 AI 网关**

<p align="center">
  <strong>简体中文</strong> |
  <a href="./README.zh_TW.md">繁體中文</a> |
  <a href="./README.md">English</a> |
  <a href="./README.fr.md">Français</a> |
  <a href="./README.ja.md">日本語</a>
</p>

<p align="center">
  <a href="https://raw.githubusercontent.com/Calcium-Ion/new-api/main/LICENSE">
    <img src="https://img.shields.io/github/license/Calcium-Ion/new-api?color=brightgreen" alt="license">
  </a><!--
  --><a href="https://github.com/Calcium-Ion/new-api/releases/latest">
    <img src="https://img.shields.io/github/v/release/Calcium-Ion/new-api?color=brightgreen&include_prereleases" alt="release">
  </a><!--
  --><a href="https://hub.docker.com/r/CalciumIon/new-api">
    <img src="https://img.shields.io/badge/docker-dockerHub-blue" alt="docker">
  </a>
  <a href="https://atomgit.com/QuantumNous/new-api" target="_blank">
    <img alt="AtomGit G-Star" src="https://atomgit.com/QuantumNous/new-api/star/badge.svg"/>
  </a>
</p>

<p align="center">
  <a href="https://trendshift.io/repositories/20180" target="_blank">
    <img src="https://trendshift.io/api/badge/repositories/20180" alt="QuantumNous%2Fnew-api | Trendshift" style="width: 250px; height: 55px;" width="250" height="55"/>
  </a>
  <br>
  <a href="https://hellogithub.com/repository/QuantumNous/new-api" target="_blank">
    <img src="https://api.hellogithub.com/v1/widgets/recommend.svg?rid=539ac4217e69431684ad4a0bab768811&claim_uid=tbFPfKIDHpc4TzR" alt="Featured｜HelloGitHub" style="width: 250px; height: 54px;" width="250" height="54" />
  </a><!--
  -->
  <a href="https://atomgit.com/QuantumNous/new-api" target="_blank">
    <img alt="AtomGit G-Star" src="https://atomgit.com/QuantumNous/new-api/star/new_badge.svg" width="250" height="55" />
  </a>
</p>

<p align="center">
  <a href="#screenshots">项目截图</a> •
  <a href="#capabilities">核心能力</a> •
  <a href="#quick-start">快速开始</a> •
  <a href="#deployment">部署运维</a> •
  <a href="#development">开发扩展</a> •
  <a href="#documentation">文档社区</a>
</p>

</div>

---


## 本地界面定制（2026-10-17）

状态：已实现本地预览，等待用户验收。参考 [gpt.ge](https://gpt.ge/) 的公开页面及用户提供的三张后台截图，统一首页、模型广场、登录注册和控制台的视觉；保留 New API 品牌、项目归属、账户契约和后端接口。

| 页面 | 本项目路由 | 本次调整 |
| --- | --- | --- |
| 首页 | `/` | 居中大标题、灰色网格、服务卡片、可切换和复制的协议示例 |
| 模型广场 | `/pricing` | 横向筛选、厂商工具栏、卡片与表格切换、完整筛选抽屉，并可携带模型和分组一键打开测试 |
| 登录 | `/sign-in` | 独立居中卡片、圆角表单、原有 OAuth/MFA/Passkey 入口 |
| 注册 | `/sign-up` | 同一视觉体系，沿用注册开关、密码与邮箱验证、条款要求 |
| 仪表盘 | `/dashboard/overview` | 欢迎信息、三项累计数据与三项今日数据卡片、近七日模型用量统计和公告面板；保留原有设置引导与其他分析入口 |
| API 令牌 | `/keys` | BaseURL 与账户摘要横卡、名称和令牌查询、当前页排序、刷新与筛选、紧凑表格和状态开关；保留创建、编辑、删除、配额、分组和分页，新增每日/月消费预算和提醒开关 |
| 使用日志 | `/usage-logs/common` | 四项紧凑统计卡、日期与令牌/模型筛选、日志类型、白色圆角表格和内联分页；保留导出、详情、高级筛选及敏感信息开关 |
| 绘图日志 | `/usage-logs/drawing` | 独立标题、任务摘要、紧凑时间与任务 ID 查询、白色圆角表格、状态/进度、键盘复制和图片重试 |
| 模型可用率 | `/model-availability` | 同一模型合并展示不同分组，真实调用与主动探测独立统计，24 小时与 7 天趋势、绿黄红灰状态、分组筛选及详情、故障与恢复历史 |
| 可用率监控设置 | `/system-settings/operations/availability` | 管理员控制探测与告警开关、模型和分组范围、频率、超时、并发、告警阈值、静默与历史保留期限 |
| 任务日志 | `/usage-logs/task` | 同一任务页视觉，手机独立卡片、结果与失败详情入口、内联分页、加载失败重试和刷新失败保留数据 |
| 充值 | `/wallet` | 居中账户余额、按配置显示的额度与折扣选项、支付和兑换入口、右侧账户摘要及邀请入口；保留订单历史、订阅与付款确认，新增 UTC 月度用量、模型/分组/令牌汇总及 CSV 导出 |
| 邀请计划 | `/wallet/affiliate` | 待使用收益、累计收益与成功邀请数，邀请链接/邀请码复制、奖励说明、原有转余额确认和升级后的注册奖励明细 |
| 工单 | `/support-tickets` | 用户提交与跟进问题，管理员处理全站队列；可从失败请求和充值订单关联创建 |
| 模型测试 | `/playground?model=…&group=…` | 精确预选模型及分组、校验当前可访问组合并显示相应价格；打开页面不自动发送请求 |
| 个人中心 | `/profile` | 渐变资料横幅、账户摘要、胶囊页签、紧凑账户绑定列表，以及通知、资料、安全和偏好设置 |

控制台共享白色顶栏、左侧分组导航、面包屑、细边框圆角卡片与黑色主按钮；适配桌面和手机，保留深色主题及已有管理入口。附加的令牌模型/IP/使用时间列仍可在“筛选 → 视图”中显示。

日志导航采用可折叠分组，保留使用、绘图、任务和审计日志各自的显示设置。充值与邀请计划沿用原有钱包显示设置，个人中心和安全入口继续独立控制。统计、金额与支付方式均取自当前实例；在线充值、兑换或奖励转余额按服务端配置启用。当前日志统计未提供 MPM，界面显示“暂不可用”；邀请计划使用现有邀请和转余额能力，没有新增提现能力；奖励明细记录本次升级后新发放的固定注册奖励，不回填旧累计数据，也不改变原有奖励规则。

绘图与任务摘要中的总数来自当前权限及筛选范围的接口总数，成功/失败明确限于当前页。任务筛选保留服务端支持的日期、任务 ID 和管理员渠道条件；查询与重置保留每页条数，刷新保持未提交草稿，中文输入法确认不会误提交。任务 ID 支持键盘复制，图片预览重新打开或换图会清除旧错误并支持重试。任务结果的懒加载、地址校验和管理员/普通用户字段边界继续沿用原实现。

模型、价格、余额、调用和图表均使用本实例的数据接口；未配置渠道时显示空目录。OAuth、账户绑定、Passkey 和其他入口随服务端配置及权限显示。令牌默认掩码展示，复制完整密钥仍需通过原有服务端接口；账户修改、验证、二次认证及确认弹窗沿用现有安全流程。数据不足时保留加载、空状态或错误反馈。

主动探测和告警默认关闭，管理员保存明确的模型与分组范围后可启用。探测会发送真实上游请求，可能产生上游费用；探测样本独立存储，不计入用户消费或真实调用成功率。告警可在探测关闭时评估真实调用，连续异常确认故障、连续健康确认恢复，样本不足不触发故障或恢复。通知复用现有邮件、Webhook、Bark 或 Gotify 配置，支持冷却和静默；通知按持久化事件去重，沿用现有通知管道的尽力投递语义。真实调用按已完成的统计桶评估：默认小时桶时，实际窗口至少 60 分钟，不能作为分钟级实时告警。故障记录按当前用户可访问的模型分组过滤；不会向普通用户暴露渠道凭据或实际调用数量。

令牌预算默认每日和每月均为 0（关闭），独立于累计额度。预算按 UTC 自然日/月重置，达到上限后停止新请求；已开始请求按真实用量结算，可能超过预估预扣和预算。异步任务的补扣与退款保留首次实际预扣所属周期，长连接按每轮实际预扣归属周期。可单独启用 80% 提醒，复用账户现有通知配置。

月度报告来自 `quota_data` 已采集用量，显示采集状态和刷新间隔；未采集、历史缺口及退款差异不作为完整结算账本。单月超过 5000 个组合时明确提示截断并禁止导出。充值只统计成功订单数，不混合不同支付渠道的货币和额度单位。CSV 复用公式注入防护。工单读写均限制归属或管理员权限，仅关联本人的失败请求 ID 或订单号，按最小字段保存上下文，不自动复制密钥、完整请求和支付内容。

`http://127.0.0.1:3301/model-availability` 是带明显标识的只读示例预览，全部业务数据均为模拟数据；`3300` 使用独立本地实例的真实数据。新增监控、工单、奖励表及预算字段已分别验证 SQLite、MySQL 与 PostgreSQL 的首次建库、从正式版本升级和重复启动。

本地预览地址为 `http://127.0.0.1:3300/`，真实上游调用须在配置渠道后另行验证。前端检查在 `web/` 执行 `bun run typecheck`、`bun run test src/features/home src/features/auth src/features/pricing src/features/dashboard src/features/keys src/features/profile src/features/security src/components/layout src/hooks`、涉及文件的 lint 及 `bun run build`。开发启动、后端启动和初始化沿用下文说明。认证和凭据界面的调整参考 OWASP [Authentication](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html) 与 [Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) 指南；本次验证不等同于全站安全认证。

---

## 📝 项目说明

New API 是面向应用、Agent 和团队的自托管 AI 网关。将不同厂商的模型服务接入统一入口，在同一套控制台中管理渠道、访问权限、用量与成本。

你可以用它为团队分配已授权的模型资源，在切换上游时减少客户端改动，或搭建自己的多模型服务。支持接入 OpenAI、Anthropic、Google Gemini、Azure OpenAI、AWS Bedrock、Vertex AI、DeepSeek、通义千问及其他兼容服务。

> [!IMPORTANT]
> - 本项目仅面向合法授权的 AI API 网关、组织内部鉴权、多模型管理、用量统计、成本核算和私有化部署场景。
> - 使用者必须合法取得上游 API Key、账号、模型服务或接口权限，并遵守上游服务条款及适用法律法规。
> - 使用者应确保其使用方式符合上游服务条款及适用法律法规。
> - 面向公众提供生成式人工智能服务时，使用者应遵守[《生成式人工智能服务管理暂行办法》](http://www.cac.gov.cn/2023-07/13/c_1690898327029107.htm)等监管要求，自行完成所在司法辖区要求的备案、许可、内容安全、实名、日志留存、税务和上游授权等合规义务。

<!-- -->

> [!WARNING]
> 将本项目作为面向公众的生成式 AI 服务或 API 转售服务运营时，使用者应先完成备案、内容安全、实名、日志留存、税务、支付和上游授权等合规义务。

---

<a id="screenshots"></a>

## 项目截图

以下账号、渠道、插件安装状态、用量、价格和费用均为模拟数据，插件市场展示官方目录。点击图片可查看原图。

| 数据看板 | 插件市场 |
| --- | --- |
| [![数据看板：模拟请求量、费用和性能指标](assets/screenshots/dashboard.zh-CN.jpg)](assets/screenshots/dashboard.zh-CN.jpg) | [![插件市场：官方插件目录与模拟安装状态](assets/screenshots/plugin-marketplace.zh-CN.jpg)](assets/screenshots/plugin-marketplace.zh-CN.jpg) |
| **模型广场** | **使用日志** |
| [![模型广场：模拟模型价格与可用状态](assets/screenshots/models.zh-CN.jpg)](assets/screenshots/models.zh-CN.jpg) | [![使用日志：模拟 Token 用量、费用和响应耗时](assets/screenshots/usage-logs.zh-CN.jpg)](assets/screenshots/usage-logs.zh-CN.jpg) |

---

## 🤝 我们信任的合作伙伴

<p align="center">
  <em>排名不分先后</em>
</p>

<p align="center">
  <a href="https://www.cherry-ai.com/" target="_blank">
    <img src="./docs/images/cherry-studio.png" alt="Cherry Studio" height="80" />
  </a><!--
  --><a href="https://github.com/iOfficeAI/AionUi/" target="_blank">
    <img src="./docs/images/aionui.png" alt="Aion UI" height="80" />
  </a><!--
  --><a href="https://bda.pku.edu.cn/" target="_blank">
    <img src="./docs/images/pku.png" alt="北京大学" height="80" />
  </a><!--
  --><a href="https://www.aliyun.com/" target="_blank">
    <img src="./docs/images/aliyun.png" alt="阿里云" height="80" />
  </a><!--
  --><a href="https://io.net/" target="_blank">
    <img src="./docs/images/io-net.png" alt="IO.NET" height="80" />
  </a>
</p>

---

## 🙏 特别鸣谢

<p align="center">
  <a href="https://www.jetbrains.com/?from=new-api" target="_blank">
    <img src="https://resources.jetbrains.com/storage/products/company/brand/logos/jb_beam.png" alt="JetBrains Logo" width="120" />
  </a>
</p>

<p align="center">
  <strong>感谢 <a href="https://www.jetbrains.com/?from=new-api">JetBrains</a> 为本项目提供免费的开源开发许可证</strong>
</p>

---

<a id="capabilities"></a>

## 核心能力

| 方向 | 可以做什么 |
| --- | --- |
| 模型接入 | 支持 OpenAI Chat Completions、Responses、Anthropic Messages 和 Gemini 协议，以及上游支持的流式输出、工具调用、推理与多模态输入 |
| 渠道调度 | 配置模型映射、渠道优先级与权重、失败重试、渠道亲和性和多密钥管理 |
| 用量与成本 | 管理额度、订阅套餐、用量日志、缓存计费，以及基于表达式的阶梯定价 |
| 访问控制 | 管理用户、分组、细粒度权限和 API Key 限制；支持 OAuth/OIDC、通行密钥、两步验证与登录会话管理 |
| 异步任务 | 通过 JavaScript 插件扩展图片、视频等任务 API，统一查询任务状态和获取产物 |
| Web 控制台 | 配置渠道与模型、查看用量和审计日志、在 Playground 中调试模型；支持简体中文、繁体中文、英语、法语、日语、俄语和越南语 |

### 协议与接口

| 接口类型 | 常用入口 |
| --- | --- |
| OpenAI Chat / Responses | `POST /v1/chat/completions`、`POST /v1/responses` |
| Anthropic Messages | `POST /v1/messages` |
| Gemini | `POST /v1beta/models/{model}:generateContent`、`POST /v1beta/models/{model}:streamGenerateContent` |
| Realtime / Responses WebSocket | `GET /v1/realtime`、`GET /v1/responses`（WebSocket 升级） |
| 图片 / 音频 | `/v1/images/generations`、`/v1/images/edits`、`/v1/audio/speech`、`/v1/audio/transcriptions`、`/v1/audio/translations` |
| 向量 / 重排 | `POST /v1/embeddings`、`POST /v1/rerank` |
| 任务插件 | `POST /v1/tasks/{pluginKey}`、`GET /v1/tasks/{taskId}`，以及各插件声明的协议路由 |

[RelayKit](./relaykit/README.md) 提供上述四种文本协议之间的请求、响应和流式转换。实际可用能力取决于渠道、上游模型和转换路径；协议特有的工具与字段可能无法完整映射。WebSocket 同样需要上游与渠道配置支持。

本 README 描述当前源码的能力，部署时请同时查看所选版本的发布说明。

<a id="quick-start"></a>

## 快速开始

### 使用 Docker 本地体验

以下命令使用 SQLite 启动单实例，仅监听本机端口：

```bash
mkdir -p data
docker run --name new-api -d --restart unless-stopped \
  -p 127.0.0.1:3000:3000 \
  -e TZ=Asia/Shanghai \
  -v "$(pwd)/data:/data" \
  calciumion/new-api:latest
```

打开 [http://localhost:3000](http://localhost:3000)，按初始化向导创建管理员账号。SQLite 数据库存放在挂载的 `data` 目录中，更换容器后仍会保留。

### 发起第一次请求

1. 新建渠道，填写上游 API Key、可用模型和所属分组，执行渠道测试。
2. 配置模型价格，确保调用用户有可用额度或有效订阅。
3. 在控制台创建 API Key，确保它能访问对应分组和模型。
4. 对于 OpenAI 兼容客户端，将 Base URL 设为 `http://localhost:3000/v1`，密钥使用 **New API 签发的 Key**。

在终端中将 `NEW_API_KEY` 环境变量设为该密钥，查询它可以访问的模型：

```bash
curl --fail-with-body http://localhost:3000/v1/models \
  -H "Authorization: Bearer ${NEW_API_KEY}"
```

然后调用 Responses，将 `your-enabled-model` 替换为已启用且支持该接口的模型名称：

```bash
curl --fail-with-body http://localhost:3000/v1/responses \
  -H "Authorization: Bearer ${NEW_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"model":"your-enabled-model","input":"Hello!"}'
```

<a id="deployment"></a>

## 部署与运维

### Docker Compose

仓库的 [Compose 配置](./docker-compose.yml) 默认启动 **New API + PostgreSQL + Redis**，并提供 MySQL 和独立 ClickHouse 日志库的配置示例。

```bash
git clone https://github.com/QuantumNous/new-api.git
cd new-api
```

启动前编辑 `docker-compose.yml`：同时替换数据库、Redis 服务及对应连接串中的示例密码，并设置固定的随机 `SESSION_SECRET`（可用 `openssl rand -hex 32` 生成）。通过 HTTPS 访问控制台时，设置 `SESSION_COOKIE_SECURE=true`，并在 `SESSION_COOKIE_TRUSTED_URL` 中填写控制台对外的精确 HTTPS Origin。

```bash
docker compose up -d
docker compose logs -f new-api
```

### 存储与配置

| 组件 | 可选方案 |
| --- | --- |
| 主数据库 | SQLite、MySQL ≥ 5.7.8、PostgreSQL ≥ 9.6 |
| 独立日志库 | 通过 `LOG_SQL_DSN` 配置，额外支持 ClickHouse |
| 缓存 | 可选 Redis 与内存缓存；多节点需要共享限流额度时使用共享 Redis |
| 容器平台 | Linux amd64 / arm64 |

| 环境变量 | 用途 |
| --- | --- |
| `SQL_DSN` | 主数据库连接串；未设置时使用 SQLite |
| `LOG_SQL_DSN` | 可选的独立日志数据库连接串 |
| `REDIS_CONN_STRING` | Redis 连接串 |
| `SESSION_SECRET` | 持久保存的鉴权密钥，所有节点必须一致 |
| `CRYPTO_SECRET` | 默认使用 `SESSION_SECRET`；共享 Redis 的节点必须使用相同的有效值 |
| `SESSION_COOKIE_SECURE` | HTTPS 控制台设为 `true`，启用 Secure 刷新 Cookie 和严格的刷新／退出来源校验 |
| `SESSION_COOKIE_TRUSTED_URL` | Secure 模式必填：以逗号分隔的精确 HTTPS Origin，不含路径或通配符；本地 HTTP 模式不设置 |
| `TRUSTED_PROXIES` | 可信反向代理 IP/CIDR，或 `none`；按实际网络显式配置 |

完整配置见[环境变量示例](./.env.example)、[环境变量文档](https://docs.newapi.ai/zh/docs/installation/config-maintenance/environment-variables)和[鉴权与登录会话说明](./docs/authentication.md)。容器变量应通过 Compose 的 `environment` 或 `env_file` 注入；只复制 `.env.example` 不会自动将变量传入容器。

正式部署时使用 HTTPS，并配置反向代理支持流式响应与 WebSocket 升级。持久化并备份数据库和挂载数据。多节点必须共用主数据库和鉴权密钥；独立 Redis 或内存限流器会按节点分别计数。不同拓扑下的会话传播行为见鉴权文档。

从[发布页](https://github.com/QuantumNous/new-api/releases)选择明确的镜像版本，阅读升级说明并先备份再升级。`latest` 会随发布构建变化；已有实例应按实际版本评估迁移与兼容性。

<a id="development"></a>

## 开发与扩展

后端使用 Go 和 Gin；控制台使用 React 19、TypeScript、Rsbuild、TanStack 与 Tailwind CSS 4。前端依赖和脚本使用 Bun；Go 语言基线见 [go.mod](./go.mod)，容器构建工具链见 [Dockerfile](./Dockerfile)。

后端会嵌入 `web/dist`，首次启动前先构建前端：

```bash
# 仓库根目录
cd web
bun install --frozen-lockfile
bun run build
cd ..
go run .
```

在另一个终端启动前端开发服务器：

```bash
cd web
bun run dev -- --port 5173
```

访问 [http://localhost:5173](http://localhost:5173)，开发服务器会将 API 请求代理到 3000 端口的后端。需要容器化开发后端时，参阅 [docker-compose.dev.yml](./docker-compose.dev.yml) 和 [makefile](./makefile) 中的 `make dev`。

| 目录 | 职责 |
| --- | --- |
| `router/`、`middleware/`、`controller/` | HTTP 路由、访问校验与 API 处理 |
| `relay/` | 上游适配与请求调度 |
| `service/`、`model/` | 业务逻辑与持久化 |
| [relaykit/](./relaykit/README.md) | 可独立构建的协议 DTO 与转换 Go 模块 |
| [plugins/tasks/](./plugins/tasks/) | JavaScript 任务插件；编写方式与宿主边界见 [Task Plugin API v1](./docs/plugin-api/v1.md) |
| `web/` | Web 控制台，参阅[前端开发约定](./web/AGENTS.md) |
| [electron/](./electron/README.md) | 桌面封装与打包 |

贡献前请阅读 [AGENTS.md](./AGENTS.md)。按改动范围执行检查：Go 模块使用 `make test`；前端在 `web/` 下运行 `bun run typecheck`、`bun run lint`、`bun run test` 和 `bun run build`。修改 RelayKit 后还必须在 `relaykit/` 下执行 `GOWORK=off go build ./...`。

<a id="documentation"></a>

## 文档与社区

| 资源 | 入口 |
| --- | --- |
| 官方文档 | [使用指南](https://docs.newapi.ai/zh/docs) · [安装部署](https://docs.newapi.ai/zh/docs/installation) · [API 参考](https://docs.newapi.ai/zh/docs/api) |
| 项目导读 | [DeepWiki](https://deepwiki.com/QuantumNous/new-api) |
| 使用问题与交流 | [常见问题](https://docs.newapi.ai/zh/docs/support/faq) · [社区渠道](https://docs.newapi.ai/zh/docs/support/community-interaction) |
| 缺陷与功能建议 | [GitHub Issues](https://github.com/QuantumNous/new-api/issues) |
| 安全漏洞 | 按[安全政策](./.github/SECURITY.md)进行私下报告 |

反馈问题时请附上版本、部署方式、复现步骤及脱敏日志。欢迎贡献文档、翻译、渠道适配和有针对性的回归测试。

---

## 🔗 相关项目

### 上游项目

| 项目 | 说明 |
|------|------|
| [One API](https://github.com/songquanpeng/one-api) | 原版项目基础 |
| [Midjourney-Proxy](https://github.com/novicezk/midjourney-proxy) | Midjourney 接口支持 |

### 配套工具

| 项目 | 说明 |
|------|------|
| [new-api-key-tool](https://github.com/Calcium-Ion/new-api-key-tool) | Key 额度查询工具 |
| [new-api-horizon](https://github.com/Calcium-Ion/new-api-horizon) | New API 高性能优化版 |

---

## 📜 许可证

本项目采用 [GNU Affero 通用公共许可证 v3.0 (AGPLv3)](./LICENSE) 授权。

根据 AGPLv3 第 7 条，本项目还适用[附加条款](./NOTICE)。修改版本必须在适当法律声明及界面中显著的关于、法律、页脚或署名位置保留作者署名 `Frontend design and development by New API contributors.`，并保留指向原项目 <https://github.com/QuantumNous/new-api> 的可见链接。

本项目为开源项目，在 [One API](https://github.com/songquanpeng/one-api)（MIT 许可证）的基础上进行二次开发。

如果您所在的组织政策不允许使用 AGPLv3 许可的软件，或您希望规避 AGPLv3 的开源义务，请发送邮件至：[support@quantumnous.com](mailto:support@quantumnous.com)

署名及依赖声明见 [NOTICE](./NOTICE) 和[第三方许可证](./THIRD-PARTY-LICENSES.md)。

---

## 🌟 Star History

<div align="center">

[![Star History Chart](https://api.star-history.com/svg?repos=Calcium-Ion/new-api&type=Date)](https://star-history.com/#Calcium-Ion/new-api&Date)

</div>

---

<div align="center">

### 💖 感谢使用 New API

如果这个项目对你有帮助，欢迎给我们一个 ⭐️ Star！

**[官方文档](https://docs.newapi.ai/zh/docs)** • **[问题反馈](https://github.com/Calcium-Ion/new-api/issues)** • **[最新发布](https://github.com/Calcium-Ion/new-api/releases)**

<sub>Built with ❤️ by QuantumNous</sub>

</div>
