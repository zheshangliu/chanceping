# ChancePing Handoff

> 写给没有任何上下文的新会话。最后更新：2026-07-11。

## 1. 项目与当前目标

ChancePing（盯机会）是一个“AI 机会雷达”系统：用户用自然语言说明自己要盯的机会，系统生成雷达、搜索候选、筛选机会卡、保存结果并生成 Markdown 报告。

当前产品已经分成两条表面：

- **后台 / 盯机会**：`https://www.chanceping.com`
  - 面向个人或企业创建、自定义和运行机会雷达。
  - 一个聊天窗口对应一个雷达。
- **公开前台 / 盯比赛·全球 AI 赛事导航**：`https://aievents.chanceping.com`
  - 展示公开 AI 赛事流，不要求用户登录。
  - 数据来自后台维护的 AI 赛事公共库。

当前最高目标不是扩展成全行业平台，而是先把以下两件事做稳：

1. 自定义雷达从用户人话到 V1.0 雷达、搜索、机会卡、报告的真实主链路。
2. 一窗口一雷达、多窗口和长期上下文的数据层收口。

## 2. 当前分支、仓库、部署

- 本地仓库：`/Users/1sunflower/Documents/chanceping`
- 工作分支：`rescue/mvp-codex`
- 远端仓库：`https://github.com/zheshangliu/chanceping.git`
- **不要直接修改 `main`。**
- 线上为阿里云 **轻量应用服务器（SWAS）**，不是 ECS。
- 服务使用 systemd：`chanceping.service`。
- Git 工作树：`/opt/chanceping`
- 运行目录：`/opt/chanceping/current`，是指向 release 目录的符号链接。

### 最新已推送并部署的提交

- `ae5643a Q7AE: streamline public events supporting sections`
- 该提交与前一个 `e026c31`、`b1b6eb2` 已推到 GitHub 并由用户部署。

### 已验证的线上 smoke

最近运行：

```bash
CHANCEPING_DEPLOY_BASE_URL=https://www.chanceping.com node --run verify:q7:aliyun-remote-smoke
```

结果：**30 PASS / 0 FAIL**。已核实：

- `/health`、后台、`/aievents` 正常。
- 公共 AI 赛事流正常且有卡片。
- 页面不出现 DeepSeek 字样。
- 可见文案使用“盯机会正在理解并生成雷达 / 画雷达 / 搜索机会并整理证据 / 生成机会报告”。
- 内置「全球 AI 赛事导航」能打开且标题正确。
- 每位匿名用户可创建 3 个自定义雷达，第 4 个会被阻止。
- 自定义雷达删除正常。
- 公共接口不泄露密钥、内部 `radarId` 或 `runId`。

## 3. 已完成能力

### 3.1 AI 赛事公开导航

- 路径：`/aievents`。
- 已有公开 AI 赛事卡片、分类、历史赛事入口、分页、截止时间排序、基础封面抓取与来源 logo 兜底。
- 已引入多批赛事来源，数据公开展示与后台公共雷达有桥接。
- 公开页定位为「盯比赛｜全球 AI 赛事导航」，不对用户展示内部待复核、评分或新增历史。
- 公开页已做蓝色科技风基础 UI。
- 信息源网络已改为默认单行预览，点击或桌面悬停可展开全部来源。
- 已去掉下滑时的“快速决策列表”悬浮框。
- 已移除底部重复的“联系与合作”栏。
- 页面保留“定制你的机会雷达”入口，展示开发者 Jason 的邮箱和微信。
- 已增加“补充赛事来源或建议”表单；**目前提交会打开本机邮件客户端并预填 Jason 的邮箱，不是服务器自动发邮件。**

### 3.2 后台 Hero Demo 和内置公共雷达

- 内置雷达展示名统一为「全球 AI 赛事导航」。
- 它是系统内置/公共雷达，不占用户 3 个自定义雷达配额。
- 「我的雷达」与聊天边栏应固定显示该内置卡，并能进入公开赛事内容或对应聊天窗口。
- Hero Demo 采用演示壳：新用户可体验 V1.0 雷达、确认、进度、报告和机会卡，而无需每次真实跑耗时搜索。
- 自定义雷达允许真实调用后端流程。页面进度改为产品可见任务描述，不显示 LLM/API 供应商名。
- 后台已可选中英双语。
- 顶部已有「开发者：Jason · 联系我」入口，显示：
  - 邮箱：`sunny251610056@gmail.com`
  - 微信：`liuzheshangwx`

### 3.3 一窗口一雷达基础

- 前端已经支持一个聊天窗口绑定一个雷达的基本形式。
- 用户可创建最多 3 个自定义雷达窗口、改名、删除。
- 自定义雷达数据应按匿名浏览器 user id 隔离。
- 用户点击结果页“调整雷达画像”应回到对应聊天窗口，而不是孤立表单页。
- 当前仍是“基础多窗口”，长期记忆、完整版本历史、上下文摘要还没有完全产品化，见下文计划。

### 3.4 搜索、筛选和报告

此前 Q.0-Q.6 系列已经做过：

- RadarVersionSpec / Radar Diff。
- Search Intent Planner、source archetype、query family 扩展。
- 结果语义分层（direct opportunity、business lead、channel partner lead、customer lead、watch signal、reference case 等）。
- 行动层报告（decision、recommended angle、material gaps、next actions、risk notes、monitoring keywords）。
- 机会准入、来源、受益人/行动主体、弱来源恢复、候选排序等安全 gate。
- Search Cost Guard、Serper 缓存、额度/重试保护。
- Q.6 后不应重新放宽安全 gate 来硬凑卡。

## 4. 当前主要问题 / 卡点

### 4.1 自定义雷达真实线上路径质量还不够稳

用户在不同设备用不同领域测试，发现：

- V1.0 雷达通常能生成，但 V1.1/V1.2 修订有时不符合新需求。
- 一些自定义行业搜索会返回赛事、无关结果，或因网关/异步问题失败。
- 曾出现“服务器返回网页错误页，不是 JSON”，说明线上 API 失败处理仍需更稳。
- 结果页的“调整雷达画像”曾错误跳到独立修订页，预期应跳回雷达聊天窗口。

因此下一个大任务应是：**用真实/接近真实的自定义雷达流程做系统性回归和修复，不要只打磨 AI 赛事 Demo。**

### 4.2 线上长任务体验与网关

产品决定：

- 不要因 1-2 分钟即中断用户搜索。
- 最长等待可接受到约 10 分钟，宁可给用户最终可用报告。
- 更理想的实现是异步 job + 前端轮询，而不是单个 HTTP 请求长挂 10 分钟。
- 进度只显示产品语言，如：
  - “盯机会正在整理你的需求”
  - “盯机会正在搜索官方来源与可行动入口”
  - “盯机会已筛到 N 份候选网页，正在核对适配度”
  - “盯机会正在整理机会卡和报告”
- 不显示 Qwen、DeepSeek、Serper 或内部思维链。

现有异步 job 已经有雏形，但需要检查超时、失败重试、状态轮询和错误 JSON 化是否覆盖所有路由。

### 4.3 Qwen 与 DeepSeek 的对比尚未完成

用户要求将参赛版默认从 commercial/DeepSeek 迁移为 Qwen，并保留一项对比任务：

- 相同的用户输入、雷达修订和搜索上下文下，比较 Qwen 与 DeepSeek：
  - 雷达结构化输出合法率
  - 用户意图吸收质量
  - 查询策略相关性
  - 机会卡相关性/有效性
  - 平均耗时、失败率和成本
- 不要只凭主观判断；应新增可重复的固定 case benchmark 和报告。
- 不打印 API key、不提交 `api.env`。

### 4.4 AI Events 表单真正发邮件尚未做

现在“补充赛事来源或建议”只使用 `mailto:` 打开用户邮件客户端。

用户希望“直接发到我的邮箱”，但线上要真正自动发送必须先配置邮件服务。当前：

- `.env.example` 有 `EMAIL_SMTP_*` 占位变量。
- `api.env` 没有邮件服务配置。
- `src/notify/email-adapter.ts` 是 stub，不会真实发送。
- 也没有 `nodemailer` / Resend 等依赖。

推荐：使用阿里云 DirectMail（服务器也在阿里云），或 Resend。需要用户提供/配置已验证发件域、AccessKey/API Key 等敏感信息到服务器 env，不能提交 Git。之后新增：

1. `/api/public/ai-events/feedback`。
2. 输入校验、rate limit / honeypot 防垃圾。
3. 真正发送到 `sunny251610056@gmail.com`。
4. 前端成功/失败状态。

## 5. 推荐下一阶段计划

按顺序推进，不要再次陷入只补单一行业的 if/else。

### P1：自定义雷达真实主链路稳定化（最高优先）

目标：任何普通用户能完成：自然语言需求 -> V1.0 -> 确认 -> 搜索 -> 可用机会卡 + Markdown 报告 -> 刷新后仍在。

实施建议：

1. **修订与聊天回流**
   - 结果页“调整雷达画像”统一跳回对应雷达聊天窗口，带入结果反馈。
   - 用户反馈作为结构化 `result_feedback` 进入修订，而不是只拼接到 description。
2. **异步 run 可靠性**
   - 审核所有 API 的错误响应：始终返回 JSON，不让前端接到 HTML 错误页。
   - 后台 run job 有 `queued/running/succeeded/failed` 状态、可重试、失败原因、轮询上限。
   - 网关 timeout 策略：不要依赖一个 10 分钟阻塞请求；尽可能由后端 job 持续运行、前端轮询。
3. **用户可见进度**
   - 替换供应商名和工程词为“盯机会”产品文案。
   - 进度可滚动更新，但不要暴露思维链或 API 名。
4. **随机行业诊断（不再作为发布门槛）**
   - 用 10 个不同行业、熟悉度不同的新手场景跑完整路径。
   - 设规则：连续 3 个行业同类失败，立即暂停并先修通用问题。
   - 用于发现跨行业的产品级问题，例如解析失败、错误跳转、静默 mock、报告无法恢复、泛页面成卡。
   - 无强机会时必须有诚实的“本轮无足够证据”解释，不能硬造。
   - 默认只生成诊断报告；仅在显式设置 `CHANCEPING_Q7Z_STRICT_QUALITY_GATE=true` 时才以 9/10 作为严格 CI 门槛。
5. **停止行业专项刷分**
   - 不再为了某个随机行业有卡而补专属同义词或来源模板。
   - 仅修通用机制，禁止按行业硬编码补丁。

### P2：一窗口一雷达正式数据层

在 P1 稳住后实现：

- `RadarChatWindow`：窗口与 radar id 一对一。
- `RadarChatMessage`：用户/助手/system event，绑定 version/run。
- `RadarMemorySummary`：最近 10-20 条消息 + 长期确认规则 + 当前确认版本 + 近期结果反馈的摘要。
- `RadarVersionHistory` / `RadarDiffHistory`。
- `CurrentConfirmedRadarVersion` 与 `DraftRadarVersion` 分离。
- 用户确认前不持久化 draft 为当前版本、不搜索；确认后才更新当前版本并运行。
- 每个匿名用户至少保留“内置公共雷达 + 3 个自定义雷达”。未来登录后只需把匿名 user key 映射到账户，不推翻模型。

### P3：Qwen vs DeepSeek benchmark 和默认模型切换

- 建立固定 10-20 个 prompt 样本，含补充、否定、结果反馈。
- 两模型均跑 Radar Interpreter/Reviser。
- 记录 JSON 合法性、字段变化、策略质量、耗时、成本和失败率。
- 明确参赛版默认 profile（用户倾向 Qwen），commercial/DeepSeek 保留为评测对照。

### P4：AI Events 运营收口（当前产品主线）

- 在 SWAS 上确认三天一次的定时任务（systemd timer）真正启用且会写入数据。
- 公共导航只显示当前有效 + 历史赛事；截止时间优先排序。
- 若要自动邮件，先配置 DirectMail/Resend，再实现服务端反馈 API。
- 后期再用 Product Design 做更深视觉打磨；当前不必大改 UI。

## 6. 绝对不要再踩的坑

### 部署与 Git

1. **不要在 `/opt/chanceping/current` 执行 `git pull`。**
   - `current` 是 release symlink，不是 Git root。
   - Git 工作树是 `/opt/chanceping`。
2. 正确线上部署命令（Workbench 可从 `admin` 直接粘贴）：

```bash
sudo bash -lc '
cd /opt/chanceping && \
git fetch origin rescue/mvp-codex && \
git pull --ff-only origin rescue/mvp-codex && \
git archive --format=tar HEAD | tar -x -C /opt/chanceping/current && \
systemctl restart chanceping && \
systemctl status chanceping --no-pager -l
'
```

3. **不要使用 `rsync --delete` 部署。**会有误删 runtime data、node_modules 或 secrets 的风险。
4. 使用现有 `chanceping-push-deploy` skill 推送：
   - `/Users/1sunflower/.codex/skills/chanceping-push-deploy/SKILL.md`
   - 它会忽略用户本地未追踪资料，push 后输出正确 Workbench 命令。
5. GitHub HTTPS 有时因为网络/HTTP2 失败。可先：

```bash
git config --global http.version HTTP/1.1
git config --global credential.helper osxkeychain
```

6. 不要声称 push/deploy 成功，除非命令明确成功。

### 数据与安全

1. **绝不提交 `api.env`、API key、SMTP/DirectMail/Resend 凭据。**
2. 不要把 `api.env` 或密钥打印到终端/报告。
3. `verify:all` 必须保持 mock-safe；线上 live 是显式环境，不允许静默 mock fallback。
4. 不要把搜索发现、snippet 或 LLM 推断写成已核验事实。
5. 公共 API 不应暴露内部 radar id、run id、候选原始数据或任何 key。
6. 如果邮件服务未配置，不能假装“已发到邮箱”；必须真实说明目前是 `mailto:`。

### 产品和工程

1. 不要再按 Golden/随机行业逐个写 `if industry === ...`。修通用的 RadarVersionSpec、关键词包、query family、source archetype、semantic/ownership gate。
2. 不要为了让卡片数量好看而放宽 Q.6 安全 gate；诚实无卡优于错误卡。
3. 不要把 LLM 直接写数据库或直接搜索。正确路径：

```text
用户消息 -> LLM 生成修订草案 -> schema/safety 校验 -> Radar Diff -> 用户确认 -> 持久化确认版本 -> run search
```

4. 不要在用户可见进度中暴露 Qwen、DeepSeek、Serper 或内部思维链。
5. 不要做大规模 UI 重构、登录、付费、雷达市场、团队协作，除非产品优先级重新明确。
6. AI Events 是公开前台；后台“盯机会”是系统工作台。两者共用数据，但不要把内部评分/复核负担塞给公开访客。

## 7. 常用验证命令

执行前若 `node` 不在 PATH：

```bash
export PATH="/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH"
```

至少运行：

```bash
node --run typecheck
node --run verify:v15:e2e
node --run verify:v15
node --run verify:v16
node --run verify:all
git diff --check
```

与 Q7 相关的常用项：

```bash
node --run verify:q7:ai-events-page
node --run verify:q7:hero-chat
node --run verify:mvp-browser
CHANCEPING_DEPLOY_BASE_URL=https://www.chanceping.com node --run verify:q7:aliyun-remote-smoke
```

测试不能只验证字段存在。至少覆盖：

```text
opportunityCards.length > 0
机会库 entry 绑定当前 radarId/radarIds
Markdown 包含至少一个机会标题
RadarRun.reportId === reportId
刷新后数据仍存在
```

## 8. 工作区状态提示

下一个会话开始时先检查：

```bash
git status --short --branch
git log --oneline -5
```

此前存在以下用户本地未追踪资料，通常不要提交、不要删除：

```text
.superpowers/
artifacts/
docs/superpowers/plans/2026-07-07-ai-events-hybrid-source-radar-ui-plan.md
docs/superpowers/specs/2026-07-05-ai-contest-navigator-demo-master-plan_副本.md
ui-audit-2026-07-07-aievents/
```

## 9. 第一件建议做的事

新会话建议从 **P1 自定义雷达真实主链路稳定化** 开始：先用浏览器和 API 跑 2-3 个与 AI 赛事完全不同的真实场景，复现“修订错误 / 返回 HTML 而非 JSON / 搜索不相关”中的至少一个，然后从统一异步 job、错误 JSON、聊天回流和通用 Radar Revision 层修复，而不是修改单一行业模板。
