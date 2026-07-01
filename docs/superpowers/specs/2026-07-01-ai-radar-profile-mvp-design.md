# ChancePing 聊天式 AI 雷达 MVP 核心闭环设计

> 状态：三批 GPT 雷达调研验证后修订，待 Jason 评审
> 日期：2026-07-01
> 适用范围：`rescue/mvp-codex` 分支后续 MVP 工作
> 前置文档：`2026-06-30-mvp-ux-rescue-design.md`
> 对照分析：`../../GPT雷达_vs_ChancePing_MVP对照分析_2026-07-01.md`

## 1. 本次设计决定

ChancePing 的 MVP 定义为：

> 一个能记住客户在找什么、可以反复执行，并交付可验证机会报告的聊天式 AI 雷达。

客户通过聊天自由描述、补充文件、修改需求和发出运行命令。系统在后台完成画像、搜索计划、来源检查、候选抽取、证据验证、匹配评分和报告生成。

MVP 不是：

- 一组按行业硬编码的雷达模板。
- 一个要求客户配置关键词、Provider 和评分权重的搜索工具。
- 只有聊天记录、不能稳定重跑的 GPT 复制品。
- 把搜索结果链接重新排版成报告的资讯聚合器。

推荐产品形态：

```text
聊天是主要交互界面
+ 雷达画像是长期记忆
+ 项目准备度是本轮行动基础
+ 搜索计划和真实执行日志在后台保存
+ 原始候选、字段证据和评分可以回放
+ 机会卡片和 Markdown 是聊天中的结构化交付物
+ 我的雷达负责保存、重跑和查看历史
```

## 2. 调研验证结论

本设计经过四类 GPT 雷达、四份实际报告、四份可观察执行记录和四份机制审计交叉验证：

1. 《阿柴送信》文化项目机会雷达。
2. AI 创作赛事雷达。
3. 文创、工艺美术和非遗赛事雷达。
4. 跨境金融与关键岗位 BD 情报雷达。

它们的行业完全不同，但共同工作流一致：

```text
恢复客户需求
→ 判断本次意图
→ 拆分搜索主题
→ 生成查询词
→ 搜索并打开网页
→ 提取候选事实
→ 合并、验证和淘汰
→ 相对客户画像评分
→ 生成行动建议
→ 输出垂直 Markdown
```

调研同时暴露出 GPT 方案的关键缺陷：

- 画像依赖聊天上下文，新会话可能丢失。
- 固定来源不代表本轮真的检查过。
- 原始候选和淘汰数量经常没有保存，报告统计甚至可能矛盾。
- 总分存在，但运行时子分和证据未保存，事后只能重新构造。
- 同一条内容可能混淆直接机会、业务线索、参考案例和观察信号。
- 找到官网不等于完整抽取费用、资格、版权和获奖后义务。
- 公司官网、招聘入口和客服电话可能被错误理解为已确认业务机会或 BD 联系人。

因此，ChancePing 应复制 GPT 的低操作成本和自然表达能力，但必须用结构化存储、可重复运行、字段级证据和历史记录解决其黑盒问题。

## 3. MVP 客户承诺

客户只需要做五件事：

1. 说出或上传自己正在寻找的机会。
2. 回答少量真正影响结果的问题。
3. 确认 AI 对雷达需求的理解。
4. 查看本轮机会、行动建议和 Markdown 报告。
5. 觉得有用时保存为长期雷达，以后说一句话再次运行。

产品负责：

1. 将非结构化表达和文件转成结构化雷达画像。
2. 记住客户确认过的长期需求和后续修改。
3. 将画像编译为搜索计划并真实执行。
4. 保存本轮查询、来源覆盖、失败状态和原始候选。
5. 对关键字段分别验证，不把推断包装成事实。
6. 相对当前画像和项目准备度筛选、评分与分级。
7. 把结果转成客户本周可以执行的动作。
8. 保存画像、运行、机会、评分、证据和报告之间的关系。

## 4. 产品原则

### 4.1 聊天优先，但不是只有聊天

第一屏直接提供聊天输入、文件上传和少量示例，不要求选择雷达类型。

聊天负责：

- 表达需求。
- 自然澄清。
- 修改画像。
- 添加来源。
- 运行雷达。
- 解释结果。
- 导出报告。

结构化后台负责：

- 长期记忆。
- 版本控制。
- 搜索执行。
- 证据和评分。
- 持久化和审计。

### 4.2 一个雷达只有一个主要主体

每个长期雷达必须绑定一个主要客户、公司、项目、作品或角色。

允许一个主体有多个目标，例如《阿柴送信》同时寻找参赛、展陈和合作机会；不允许一个雷达同时代表 ChancePing、《阿柴送信》、润葭文化和另一个无关品牌。

若用户的表达包含多个无关主体，AI 应询问本次先为谁建立雷达，或建议分别保存多个雷达。

### 4.3 先理解，再搜索

```text
原始表达不是雷达画像
雷达画像不是搜索计划
搜索结果不是最终机会
机会事实不等于客户价值
```

首次运行必须有客户确认过的画像版本。后续运行可以直接复用，不重复询问已经确认的需求。

### 4.4 AI 对话，不是机械问卷

AI 每轮只问一个最影响搜索质量的问题，并自然复述已理解内容。

MVP 最多澄清 3 轮，每轮都允许 `先按默认理解继续`。达到上限后必须生成画像，把仍不确定的内容写成默认假设。

内部可以检查身份、机会类型、地域、时间、行动目的、排除条件和指定来源，但这些维度不能一次性变成客户问卷。

### 4.5 一个事实只表达它能证明的结论

- 有赛事官网，不代表所有规则字段都已验证。
- 有公司官网，不代表存在招聘需求。
- 有 Careers 页面，不代表愿意使用外部猎头。
- 有 IPO 新闻，不代表已经确认某个岗位。
- 有客服电话，不代表它是 BD 联系入口。

事实、模型推断、客户假设和策略建议必须分开保存和展示。

### 4.6 允许没有结果，不允许凑数

搜索没有发现合格机会时，应交付已检查来源、淘汰原因、未确认事项和下次监控重点。`Top 3`、`Top 15` 只是一种报告布局，不能成为结果数量要求。

## 5. 客户主流程

### 5.1 首次建立雷达

```text
打开聊天
→ 自由描述或上传文件
→ AI 判断本次意图和信息充分度
→ 0 至 3 轮自然澄清
→ 聊天内展示雷达理解摘要
→ 用户确认或继续修改
→ 冻结画像版本
→ 生成并执行搜索计划
→ 展示运行进度和简化回执
→ 返回总判断、机会卡片和报告摘要
→ 用户展开、复制或下载完整 Markdown
→ 可选：保存为长期雷达
```

### 5.2 已保存雷达再次运行

用户可以在该雷达会话中输入：

```text
执行本周雷达
```

系统应：

1. 识别为 `RUN_RADAR`，不重复询问已确认需求。
2. 使用当前有效画像版本创建新的 `RadarRun`。
3. 重新生成时间窗口、搜索计划和查询词。
4. 保存新的候选、评估和报告。
5. 将结果绑定同一个 `radarId` 和新的 `runId`。

### 5.3 修改雷达

用户可以直接说：

```text
以后不要看收费赛事，优先广东，并加入这个官网。
```

系统识别为 `ADJUST_RADAR` 或 `ADD_SOURCE`，生成画像修订摘要。用户确认后创建新的 `RadarProfileRevision`，历史运行仍保留旧版本引用。

### 5.4 示例路径

首页保留约 3 个差异明显的完整表达，统一放在“试试看这些例子”下。示例用于教育，不是行业分类。

示例点击后进入同一聊天链路，可以跳过澄清，但不能跳过画像理解摘要，也必须允许调整。

### 5.5 保存长期雷达

按钮文案：

```text
保存为长期雷达，之后持续盯
```

保存动作必须完成：

```text
创建 custom 雷达
→ 保存已确认画像和修订版本
→ 激活雷达
→ 创建或绑定一次正式 RadarRun
→ 机会入库并绑定 radarId/radarIds
→ 生成绑定 radar_id + run_id 的 Markdown 报告
→ RadarRun.reportId 回写
→ 我的雷达能查看本次机会和报告
```

免费用户最多拥有 3 个长期自定义雷达。示例预览和未保存即时结果不占配额。

## 6. 会话与运行意图

### 6.1 必须识别的意图

```ts
type RadarIntent =
  | "CREATE_OR_UPDATE_RADAR"
  | "RUN_RADAR"
  | "ADJUST_RADAR"
  | "ADD_SOURCE"
  | "EXPLAIN_RESULT"
  | "EXPORT_REPORT";
```

MVP 不要求复杂多 Agent 编排，但后端必须明确区分“修改需求”和“立即运行”，避免用户补一句条件就误触发搜索。

### 6.2 会话状态

```ts
interface RadarConversation {
  id: string;
  radarId?: string;
  originalInput: string;
  uploadedArtifacts: string[];
  turns: Array<{ role: "user" | "assistant"; content: string }>;
  currentDraft: RadarRequirementSpec;
  assumptions: string[];
  clarificationCount: number;
  status: "understanding" | "clarifying" | "confirming" | "ready" | "running" | "delivered";
}
```

未确认会话在 MVP 中可以暂存内存，但页面刷新前应尽量保留。画像一旦确认或保存，必须进入持久化数据。

### 6.3 文件输入

文件只用于补充客户画像、项目材料和约束，不直接被视为机会。

系统区分：

- 用户明确表达。
- 文件提取事实。
- AI 默认假设。
- 后续用户修正。

用户后续明确回答优先于文件推断。MVP 复用现有上传与解析能力，不扩展为通用知识库、音视频解析或批量文件管理系统。

### 6.4 内部完整度判断

`requirementConfidence` 继续作为内部控制信号，不直接展示给客户：

- 大于等于 85：直接展示雷达理解摘要。
- 60 至 84：询问一个最影响搜索结果的问题。
- 低于 60：先请用户补充一项关键背景，再继续。
- 用户回答后重新生成画像；达到 3 轮后无论分数如何都进入确认摘要，并列出默认假设。

若后端低置信度却没有返回问题，前端只显示一个通用补充请求作为异常兜底，不使用关键词表承担主要语义判断。

## 7. 雷达画像与版本

### 7.1 `RadarRequirementSpec` 继续作为画像事实来源

现有 `RadarRequirementSpec` 保留，至少覆盖：

- 主要主体和身份。
- 目标机会和行动目的。
- 地域、语言和时间窗口。
- 必须满足和必须排除条件。
- 固定来源与用户指定 URL。
- 报告偏好和默认假设。

需要增加或明确：

- `primary_subject`：唯一主要主体。
- `profile_version`：画像版本。
- `risk_policy`：该行业必须核验的决策字段。
- `report_blueprint`：公共报告骨架和垂直模块。
- `scoring_policy`：垂直评分维度与权重。

### 7.2 画像修订

```ts
interface RadarProfileRevision {
  id: string;
  radarId: string;
  version: number;
  spec: RadarRequirementSpec;
  changedFields: string[];
  changeSummary: string;
  confirmedAt: string;
}
```

每次运行绑定一个确定的 `profileRevisionId`。后续修改不能悄悄改变历史报告的解释依据。

### 7.3 项目准备度快照

长期画像描述客户通常是谁和想找什么；`ProjectReadinessSnapshot` 描述本次真正能拿去行动的项目、作品、资质、材料、预算和缺口。

```ts
interface ProjectReadinessSnapshot {
  id: string;
  radarId: string;
  runId: string;
  availableAssets: string[];
  qualifications: string[];
  materialGaps: string[];
  timeBudget?: string;
  moneyBudget?: string;
  packagingOptions: string[];
  assumptions: string[];
}
```

准备度快照可以由 AI 根据聊天和文件生成，但推测项必须标为假设。一次性的“62/100 准备度”不能写死进长期画像。

### 7.4 客户可见的画像摘要

聊天中只展示：

- 你是。
- 你想盯。
- 优先看。
- 地域与时间。
- 排除。
- 指定信号源。
- 默认假设。

不展示原始 `spec`、Provider、搜索策略、内部置信度和评分调试字段。

### 7.5 画像生成响应

`POST /api/radars/generate` 至少返回：

```ts
interface RadarGenerateResponseData {
  spec: RadarRequirementSpec;
  suggestedName: string;
  completeness: number;
  requirementConfidence: number;
  questionsToConfirm: Array<{ id: string; question: string; priority: number }>;
  profileSummary: {
    identity: string;
    target: string;
    priorities: string[];
    regionsAndTime: string;
    exclusions: string[];
    sourceHints: string[];
    assumptions: string[];
  };
}
```

`completeness` 表示必要字段是否存在，`requirementConfidence` 表示系统是否真正理解，两者不能互相替代。

## 8. 搜索计划与真实执行记录

### 8.1 搜索计划

```ts
interface RadarSearchPlan {
  id: string;
  radarId?: string;
  runId: string;
  profileRevisionId: string;
  themes: string[];
  queries: Array<{
    query: string;
    language: string;
    region?: string;
    timeWindow?: string;
    sourceDomain?: string;
  }>;
  configuredSources: string[];
  exclusions: string[];
  maxCandidates: number;
}
```

搜索计划不作为客户配置页。客户确认“找什么”，系统决定“怎么搜”。

### 8.2 运行日志

```ts
interface SearchExecutionLog {
  runId: string;
  queryExecutions: Array<{
    query: string;
    provider: string;
    startedAt: string;
    status: "succeeded" | "failed";
    rawResultCount: number;
    error?: string;
  }>;
  openedUrls: Array<{
    url: string;
    status: "succeeded" | "partial" | "failed";
    errorType?: string;
    fetchedAt: string;
  }>;
}
```

日志必须来自程序实际执行，不允许让 LLM 在报告生成阶段事后编造。

### 8.3 来源覆盖回执

每个配置来源在本轮只有一个明确状态：

```ts
type SourceCheckStatus =
  | "checked_with_results"
  | "checked_no_results"
  | "failed"
  | "not_checked";
```

“固定来源”与“本次已检查来源”必须分开。客户默认只看简化回执，完整覆盖记录用于验收和排查。

### 8.4 Provider 和 Source Hints

- `custom` 雷达不得默认映射为 `ai_competition`。
- Query 由画像、来源提示、地域和时间生成。
- 用户添加 URL 或平台名后，后续运行持续检查。
- Source Hints 保持 MVP-light，不建设完整来源管理后台。
- Provider 失败必须保存状态，不能用无关 Mock 假装成功。

### 8.5 API 与密钥

- MVP 只要求打通一个真实搜索 Provider 和一个真实 LLM 组合。
- `api.env` 只能本地显式加载，不提交，不在生产环境默认加载。
- `verify-live-mvp` 不加入 `verify:all`，仅在 Jason 明确允许时运行。
- 不在日志、报告、错误信息或 Git 历史中输出密钥。

## 9. 原始候选与去重

### 9.1 原始候选必须先保存

```ts
interface RawCandidate {
  id: string;
  runId: string;
  query: string;
  title: string;
  url: string;
  snippet?: string;
  sourceDomain: string;
  sourceType: "official" | "organizer" | "government" | "media" | "aggregator" | "social" | "search_snippet";
  discoveredAt: string;
  status: "raw" | "merged" | "assessed" | "rejected";
}
```

运行统计只能从数据状态聚合，不允许报告模板自行计算。必须满足：

```text
raw count
→ deduplicated count
→ assessed count
→ accepted + rejected count
```

各阶段口径明确，不能再次出现候选数与分类合计不一致。

### 9.2 去重与合并

去重综合：

- 标准化标题。
- 主办方或公司主体。
- 官方域名。
- 截止时间或事件日期。
- 内容哈希。

同一机会可以有多个来源。官方来源优先作为关键字段证据，媒体和聚合页保留为辅助来源，不直接丢弃。

## 10. 字段级证据与验证

### 10.1 证据不是整张卡片的一个标签

```ts
interface EvidenceRecord {
  id: string;
  runId: string;
  candidateId: string;
  field: string;
  value: unknown;
  sourceUrl: string;
  sourceType: string;
  extractedText?: string;
  fetchedAt: string;
  status: "verified" | "conflicting" | "unverified" | "not_applicable";
}
```

截止时间、资格、费用、奖金、版权、获奖后义务、实物交付、差旅和联系方式必须能各自拥有证据状态。

这属于 MVP 做出可靠判断所需的内部证据和简化状态，不等于建设 V1.7 来源透明管理后台。MVP 客户只看到必要的证据状态和官方来源，复杂来源管理、反馈调优和全量审计界面继续延期。

### 10.2 风险策略

每个画像生成轻量 `RiskPolicy`，规定该行业的决策字段。

比赛类至少检查：

- 截止时间。
- 参赛资格。
- 报名和后续费用。
- 知识产权与授权。
- 获奖后义务。
- 实物、运输、保险和海关。
- 线下答辩和差旅。

BD 和招聘类至少检查：

- 触发信号是否真实。
- 招聘入口是否当前有效。
- 联系路径类型和用途。
- 是否只是模型推测岗位。
- 私人信息与合规边界。
- 猎头合作预算是否未知。

### 10.3 联系路径分类

```ts
type ContactRouteType =
  | "official_business_contact"
  | "official_recruiting_contact"
  | "careers_page"
  | "ir_contact"
  | "application_form"
  | "customer_service"
  | "unknown";
```

客服电话可以作为信息入口，但不得默认生成“立即 BD”的动作。

## 11. 机会评估模型

### 11.1 四个正交维度

```text
机会类型：它是什么
价值等级：它对当前画像有多重要
证据状态：我们确认到什么程度
行动状态：客户现在应该做什么
```

机会类型：

```ts
type OpportunityKind =
  | "direct_opportunity"
  | "business_lead"
  | "reference_case"
  | "watch_signal"
  | "rejected";
```

行业专属的“岗位信号”“招聘会信号”“赛事”“采购”作为 subtype，不继续膨胀全局枚举。

证据状态：

```ts
type EvidenceStatus =
  | "confirmed"
  | "partially_verified"
  | "needs_review"
  | "unverified";
```

行动状态：

```ts
type ActionStatus = "act_now" | "prepare" | "monitor" | "drop";
```

### 11.2 先硬门槛，后评分

正式直接机会至少满足该雷达 `RiskPolicy` 的关键字段门槛。关键字段缺失时，可以是高价值线索，但不能包装成“已经确认、可以直接行动”。

例子：

- TCAMP 与客户高度匹配，但官方报名入口和资格未确认，应是高价值 `needs_review` 线索，不是已确认可报名机会。
- IPO 可以是 S 级商业线索，但不能因此写成已确认招聘委托。
- 赛事官网存在但获奖义务未知时，行动建议必须先核验规则。

### 11.3 垂直评分策略与统一等级

评分维度由画像的 `scoring_policy` 定义：

- 文化项目雷达关注主题、作品形态、背书、改造成本和传播价值。
- 文创赛事雷达关注适配、官方性、时效、版权和转化价值。
- BD 雷达关注需求信号、客户价值、业务匹配、时效、可触达性和长期潜力。
- 研学雷达关注采购可能性、预算信号、服务匹配、地域和触达路径。

等级阈值为产品统一规则，以兼容现有 ChanceScore：

- S：90 至 100。
- A：80 至 89。
- B：65 至 79。
- C：50 至 64。
- 50 以下：不进入正式推荐区。

不同雷达可以有不同维度和权重，不能自行修改等级阈值。

### 11.4 评分必须可回放

```ts
interface OpportunityAssessment {
  id: string;
  opportunityId: string;
  radarId: string;
  runId: string;
  profileRevisionId: string;
  readinessSnapshotId?: string;
  kind: OpportunityKind;
  evidenceStatus: EvidenceStatus;
  actionStatus: ActionStatus;
  score: number;
  grade?: "S" | "A" | "B" | "C";
  scoringPolicyVersion: string;
  scoreItems: Array<{
    dimension: string;
    weight: number;
    score: number;
    evidenceIds: string[];
    rationale: string;
    basis: "fact" | "model_judgment" | "mixed";
  }>;
  assessedAt: string;
  supersedesAssessmentId?: string;
}
```

事后复核或新证据可以产生新评估，但不能覆盖原始运行分数。界面默认展示最新评估，同时保留“本轮原始评分”。

### 11.5 为什么适合与行动建议

`whyFit` 必须引用具体画像字段。行动建议由以下内容共同生成：

```text
客户画像
+ 项目准备度
+ 机会要求
+ 关键证据
+ 时间与成本
= 可执行建议
```

建议至少包含：

- 为什么适合。
- 本周动作。
- 行动前置条件。
- 材料或能力缺口。
- 推荐包装方式。
- 联系或提交路径。
- 最晚行动时间。

事实支持和模型策略建议应能区分。

## 12. 结果交付

### 12.1 聊天时间线

运行过程显示清楚但不过度技术化的状态：

1. 正在理解你的需求。
2. 正在制定搜索计划。
3. 正在搜索和核验来源。
4. 正在筛选并生成报告。

完成后显示简化运行回执，例如检查了多少来源、多少失败、多少候选进入评估。完整 Query 和 URL 日志默认折叠。

### 12.2 机会卡片

信息顺序：

1. 标题、机会类型和价值等级。
2. 为什么适合你。
3. 证据状态。
4. 截止时间或时间状态。
5. 建议动作和前置条件。
6. 官方来源。

客户不需要在卡片上看到全部子分，但应能展开“为什么这样判断”。

### 12.3 Markdown 报告蓝图

每个雷达保存 `RadarReportBlueprint`。公共骨架：

1. 本轮总判断。
2. 雷达画像和版本摘要。
3. 搜索范围与简化运行回执。
4. 重点机会总表。
5. 重点机会详解。
6. 风险和待复核项。
7. 本周行动清单。
8. 观察、淘汰和无结果说明。
9. 下一轮监控重点。
10. 来源索引。

垂直模块示例：

- 《阿柴送信》：项目包装、展陈外联和内容复用。
- 文创赛事：版权、费用、实物与物流义务。
- BD 雷达：联系人角色、候选人关键词、线索完整度和话术。
- 研学雷达：采购方式、预算信号、服务匹配和触达路径。

报告默认展示摘要，完整 Markdown 可展开、复制和下载。实际报告可以很长，但不应把数百行内容直接铺满第一屏。

## 13. 数据关系与持久化

以下是逻辑数据契约，不要求 MVP 为每个对象建立独立数据库表。实现可以在现有 Store 中嵌入结构化 JSON，只要关系、版本、查询和测试不变量成立，且后续可以平滑迁移。

核心关系：

```text
RadarConversation
→ Radar
→ RadarProfileRevision
→ RadarRun
→ ProjectReadinessSnapshot
→ RadarSearchPlan
→ SearchExecutionLog / SourceCheck
→ RawCandidate
→ Opportunity
→ EvidenceRecord
→ OpportunityAssessment
→ ReportArtifact
```

必须满足：

- `RadarRun.profileRevisionId` 指向本轮画像。
- `OpportunityAssessment` 绑定 `radarId + runId + profileRevisionId`。
- 同一机会可以属于多个雷达，但每个雷达拥有独立评估。
- 报告绑定 `radar_id + run_id`。
- `RadarRun.reportId === ReportArtifact.id`。
- 页面刷新后雷达、运行、机会、评估和报告仍存在。

## 14. 错误与降级

### 14.1 LLM 不可用

保留原始输入和文件，不生成错误画像。允许重试。Mock 必须明确是演示，并与输入语义一致。

### 14.2 搜索不可用

运行状态标记失败或部分成功。可以返回上次结果作为历史参考，但必须明确“本轮未联网”，不能声称完成最新核验。

### 14.3 页面打不开

保存 URL、错误类型和重试状态。其他来源只能作为辅助证据；关键字段仍为未验证。

### 14.4 来源冲突

关键字段标为 `conflicting`，报告进入待复核清单。默认优先官方和更新更晚的来源，但不能静默丢弃冲突。

### 14.5 没有合格机会

返回：

- 已检查来源。
- 被淘汰结果及原因。
- 放宽地区或时间等建议。
- 增加指定来源的入口。
- 保存为长期雷达继续监控。

### 14.6 报告文件生成失败

先在页面保留完整 Markdown 文本，允许复制；文件生成可重试，不影响本轮机会和运行记录。

## 15. MVP 验收场景

### 15.1 模糊需求自然澄清

输入：

```text
我想盯乒乓球比赛
```

预期：不直接搜索；最多 3 轮、每轮一个问题；生成单一主体画像并显示默认假设。

### 15.2 完整需求直接确认

输入：

```text
我是乒乓球选手，想盯未来30天内国内外可报名的乒乓球比赛，
优先看 ITTF、WTT、中国乒协官网，排除培训广告。
```

预期：直接生成理解摘要；确认后检查指定来源并返回相关机会。

### 15.3 研学企业客户线索

输入：

```text
我们是一家研学文旅公司，想找近期有研学、红色教育或团队学习需求的国企和企业，
优先广东及周边，希望找到采购、招标、合作征集或活动计划。
```

预期：识别为商业线索雷达，不误判为比赛；采购信号和模型推断分开；报告提供触达前置条件。

### 15.4 文创赛事字段完整性

输入：为润葭文化运行文创非遗赛事雷达。

预期：DIA 一类机会不能只检查知识产权归属，还要检查获奖后赠送、实物、物流、保险和海关等义务；未确认字段进入待复核。

### 15.5 BD 线索边界

输入：为猎头团队搜索本周 IPO 和关键岗位 BD 信号。

预期：IPO 是商业线索，不是已确认招聘需求；Careers 页面不等于猎头预算；客服电话不得被标为招聘联系人。

### 15.6 同一机会相对画像评分

同一广东非遗赛事分别由《阿柴送信》和润葭文化雷达评估。

预期：基础事实复用，评分和行动建议可以不同；两个 `OpportunityAssessment` 分别绑定各自画像和运行。

### 15.7 原始候选和计数一致

预期：原始、去重、评估、接受和淘汰数量可以从存储对象聚合，分类总数一致；报告不自行编造统计。

### 15.8 空结果

预期：允许零正式推荐，仍生成来源覆盖、淘汰理由、材料准备和下次监控报告。

### 15.9 长期雷达闭环

保存任一已确认画像后：

- 免费用户未满 3 个时保存成功。
- 雷达激活并产生正式运行。
- 机会包含当前 `radarId` 或 `radarIds`。
- 报告绑定 `radar_id + run_id`。
- `RadarRun.reportId === reportId`。
- 我的雷达能看到本次机会和报告。
- 输入“执行本周雷达”产生新 `runId`，不重复询问画像。
- 刷新后数据仍存在。

## 16. 测试策略

### 16.1 单元测试

- 意图识别不会混淆修改与运行。
- 单一主体约束。
- 最多 3 轮澄清和默认继续。
- 画像修订与历史版本。
- 来源覆盖四种状态。
- 原始候选状态和计数不变量。
- 字段证据验证和冲突。
- 四个评估维度互不替代。
- 统一等级阈值。
- 原始评分和重算评分并存。
- 免费用户 3 个雷达配额。

### 16.2 API 测试

- 会话、上传、画像确认和修订。
- 创建 `RadarRun` 后产生 SearchPlan 和真实执行日志。
- RawCandidate、EvidenceRecord 和 Assessment 关系正确。
- 报告使用本次评估结果，绑定 radar/run。
- 保存、激活、再次运行和刷新持久化。

### 16.3 黄金样例

四份 GPT 雷达资料作为测试样例，不作为客户模板：

- 《阿柴送信》：高匹配但官方入口未确认。
- AI 赛事：多个客户混入同一画像必须被阻止。
- 文创赛事：统计一致、版权和履约字段完整。
- BD 雷达：事实、线索、联系人类型和模型推断分离。

另保留乒乓球和研学文旅作为未预设行业的泛化测试。

### 16.4 浏览器验收

```text
聊天首页
→ 自由输入或上传文件
→ AI 自然澄清
→ 聊天内确认画像
→ 运行进度
→ 机会卡片和证据状态
→ 报告摘要
→ 展开完整 Markdown
→ 保存长期雷达
→ 再次输入“执行本周雷达”
→ 查看新运行和历史报告
```

静态检查不能代替真实浏览器验收。

### 16.5 回归验证

每批代码修改至少运行：

```bash
npm run typecheck
npm run verify:v15:e2e
npm run verify:v15
npm run verify:v16
npm run verify:all
```

## 17. 分阶段交付边界

本节只定义里程碑，不是实施任务清单。设计获批后另写 Implementation Plan。

### Milestone A：聊天与画像

- 聊天成为主要入口。
- 识别意图并自然澄清。
- 单一主体画像、修订版本和文件输入。
- 聊天内确认理解摘要。

### Milestone B：真实搜索与运行审计

- 画像驱动 SearchPlan。
- 一个真实搜索 Provider。
- Query、URL、来源覆盖和 RawCandidate 持久化。
- `custom` 摆脱 `ai_competition` 默认。

### Milestone C：证据、评估与行动

- 字段级 EvidenceRecord。
- 垂直 RiskPolicy 和 ScoringPolicy。
- 四维结果模型。
- 可回放评分和项目准备度。

### Milestone D：报告与长期雷达

- 公共报告骨架和垂直模块。
- 摘要、完整 Markdown、复制和下载。
- 保存、再次运行、历史与数据绑定。
- 浏览器端到端验收。

每个里程碑完成后先由 Jason 验收，再进入下一个。

## 18. 当前明确不做

- Task 5-8 和 V1.7 功能继续暂停，直到新版基础 MVP 通过。
- 大量客户可见行业模板。
- 完整来源管理后台。
- 自动定时和消息推送。
- CRM 和自动外联。
- 自动报名或自动投标。
- 验证码绕过和通用登录态爬虫。
- 全量多语言固定源扫描。
- 截图和 HTML 快照存证。
- 雷达市场、团队协作和付费体系。
- 大规模品牌视觉重构。
- 删除 V1.5/V1.6 旧能力。

## 19. 现有代码兼容策略

保留：

- `RadarRequirementSpec` 和校验器。
- 上传与文件解析。
- 会话骨架、RadarGenerator 和 SpecCompiler 职责。
- SearchOrchestrator 和 Provider 适配层。
- 雷达、运行、机会和报告存储。
- 现有 ChanceScore 阈值。
- 当前机会卡片和 Markdown 展示中可复用部分。

改造：

- 客户主路径收敛到聊天。
- 澄清语义回到后端，前端只做兜底。
- 画像增加主体、版本、风险、评分和报告蓝图。
- 搜索新增真实日志、覆盖状态和原始候选。
- 机会评估从机会事实中分离，并绑定画像与运行。
- 报告由 Assessment 和 Evidence 生成，不直接从搜索摘要拼接。

暂不删除：

- 旧 RadarKind、编辑器、机会库和独立报告页。
- 它们从普通客户主路径隐藏，继续保障 V1.5/V1.6 回归。

## 20. 最终成功判断

当一个从未预设过的新客户角色出现时，ChancePing 仍能：

1. 在聊天中听懂客户的非结构化需求和文件。
2. 必要时自然追问，并形成单一主体画像。
3. 让客户确认后保存可版本化的长期理解。
4. 真实搜索，并交代本轮检查了什么、失败了什么。
5. 保存原始候选和字段级证据，不把推断写成事实。
6. 相对画像与项目准备度给出可解释评分和行动建议。
7. 交付摘要、机会卡片和垂直 Markdown 报告。
8. 保存为长期雷达，并能通过一句“执行本周雷达”重复运行。

达到这八点，MVP 才成立。模板数量、页面数量、报告长度、Provider 数量和看似精确的总分都不能替代这一判断。
