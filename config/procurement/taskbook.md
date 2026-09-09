# 盯非遗｜采购／订单来源网络与V2接入完整执行任务书 V1.0

> 执行对象：Codex。以本文件为唯一主任务；03为数据目录，04为覆盖清单，05为检索规则，06为回归夹具，07为API依据。不要把每一份附件再拆成互相冲突的任务。

**Goal：** 在现有盯非遗V2中接通国内外成熟采购／订单聚合源及文化买方入口，输出真实、方向正确、状态明确的采购机会，保护已上线赛事模块。

**Architecture：** 继续复用 Source Pool → Fetch → Normalize → Dedup → Filter → Display → 72h更新与巡检。采购专用适配器和可选字段补充在现有V2；本轮不另建雷达项目、不另造评分／官方核验系统。

**Tech Stack：** 当前仓库TypeScript/Node.js/Hono；正式API/CSV/RSS优先，HTML次之，已有安全网络抓取与原子JSON写入继续复用。

**Spec：** 本文件第1—6节是设计约束，第7—12节是实施与验收步骤；其余附件提供真实入口和用例。

## 0. 版本、授权与边界

仓库：`zheshangliu/chanceping`；分支：`rescue/mvp-codex`。
本轮研究时远端HEAD：`9814ef69b05b36c86c4146afa475c7d7ad51c987`（生产巡检提交）；生产业务提交：`8e163490012c3c83f8c60818d1141ae28f76134c`。
执行前实时读取远端；若有更新，先识别与本任务的关系，保留新改动和已有审计，不reset回旧业务提交。

用户已授权：全面来源研究后的接入、隔离开发、测试、真实只读抓取、保存开发副本、相关commit及push。
**未授权：生产部署、生产数据写入、DNS修改、付费服务购买、供应商注册、投标/报价提交、对外联系。**
不改赛事UI，不改赛事全局相关性、解码或截止算法；公共函数必须修时提供独立失败复现，不能借本任务重构赛事。
不换翻译Provider。采购外语仍走既有DeepSeek/翻译缓存；原文可读时翻译失败不隐藏机会。
不输出密钥、登录cookie、管理员token。保持DNS/IP固定、重定向前检查、TLS、响应体限额、编码判断和公开乱码屏蔽。

## 1. 本轮“完整”如何验收

目录含 **177个研究登记项**，不是177个网站都能抓，也不是177个运行源。包括聚合平台、买方公告、供货入口、37个中国地方分网节点、工具目录和明确反例。

本轮要求：
1. 03目录每项均有最终处置；可访问的P0/P1都实际探测，不能只挑20项就报告全量完成。
2. 04地域/行业每行记录已有覆盖、补链结果或明确缺口；不是假设全世界所有市县/机构都已覆盖。
3. 找到新机构采购页先查是否已被聚合平台覆盖；仅有独有价值、稳定更新或重要低额漏项才新增运行source。
4. 对不通/需登录/收费/无公开列表者记录真实原因、尝试过的正式替代入口和剩余动作。一个失败不拖停其他源。
5. 当前窗口内的相关结果全处理；速率和单次预算可有限，但分页游标必须续跑，`partial`不得冒充`complete`。

完成率分开：研究项处置率、可公开探测项完成率、适配器通过数、真实有效机会数。禁止用目录数等于接通数，用抓取anchor数等于采购数。

## 2. 机会范围与分类

### 2.1 本模块纳入

文创/非遗/工艺商品采购，文化礼品与纪念品，伴手礼和包装/IP设计，博物馆文创开发，文化活动/客户沙龙/非遗体验执行，文化展陈与装置制作，文化相关花艺布置、艺术委托、供应商入围/商品选品申请。

### 2.2 明确分开四种内容

| 对用户含义 | 分类处理 |
|---|---|
| 买方正在找货／找服务／征求报价 | `category=procurement_project`，机会类型为项目采购或委托 |
| 买方长期接收产品提案／供应商资料 | 供货/入库申请；明确“入库不保证订单”，不伪造采购金额 |
| 采购意向、需求调研、前期市场接洽 | 计划/观察；不表示已开始正式投标 |
| 代销、联营、授权合作、收费进渠道 | `channel_collaboration`或独立子标签，不计为确定采购订单 |

平台在向用户批发产品、卖制造服务、卖课程或卖摊位，方向不是买方需求；不纳入采购。不得重复历史“Met/NMA/Van Gogh批发页当订单”的错误。

### 2.3 相关性规则

先确认真实公告卡片/公共API记录，再根据**采购对象、标包、服务内容**判断。采购人是博物馆不等于其服务器、空调、道路施工就是文创订单。“设计”“AI”“文化机构”单词不能独自触发相关。
使用05规则的对象词+需求动词/明确公告栏目。混合项目若有可独立投标的文化标包可以保留该包，并保留上级项目ID。
禁止给每条打80分之类的分数；来源原文足够说明内容、方向和状态即可展示，少量可选字段缺失不构成发布禁令。

## 3. 采购生命周期与时间：不照搬比赛规则

需要保留 `notice_type` 和项目阶段：intent/market_engagement/prequalification/open/amendment/awarded/cancelled/closed/ongoing_intake/unknown。
这是采购对象的可选字段，不要求修改全站三态枚举。前台三个分组即可：**可响应项目、供应申请、计划/观察**；结果和结束进入历史，不占默认当前。

**同一采购常有多段时间：**获取文件、报名/资格预审、答疑、投标、开标、合同履行。
- 明确必须报名而报名已经截止：不能因投标日尚未来到就标“新供应商现在可参加”。提示“前置报名已截止；已报名者查看原文”。
- 开标日、结果公布日、展览日、交货完成日，不当报名/报价截止。
- 只有来源明确说明延期、更正或新版本取代旧版，才更新截止；未来日不天然更可靠。
- 同类型截止冲突无证据可决定：精确截止留空并保留分歧，但不把两个不同流程节点错误叫冲突。
- 日期只有日历日时保存date-only，不虚构23:59和时区；有明确时区再计算UTC。
- 缺日期且公告明确征集可用“响应时间见原文”；不知道是否开放不能默认CURRENT。已结束状态不得因deadline空而复活。
- 72小时仍用既有调度。公告短窗口的漏看风险写报告，本轮不擅自改全站频率。

## 4. 钱、地点、资格与身份

预算/最高限价、预计框架上限、成交金额、保证金、文件费、入场费、佣金分别存；框架上限不等于保证收入。币种符号不明就保留符号和unknown，不能把所有$当USD。
采购人、代理机构、发布平台分开。来源地区、买方地区、履行地、申请资格分开。未明确接受境外申请时写“申请资格查看原文”，不编“全球可投”。香港主体与大陆主体资格不得由系统代替用户判断。
项目号和标包号优先；没有号则使用买方+规范标题+年份/轮次+核心链接等保守组合。公告ID不是采购项目ID；同项目更正与成交是版本，不是新订单。不同标包保留独立可响应项。
公开联系字段仅取明确的业务联系；私人联系方式、会员遮罩、用户账户材料不收集。

## 5. 来源接入方法与真实证据

所有候选先进入**开发研究注册表**，不是生产Source Pool。03不能直接写为ACTIVE；每个运行来源的最终状态由真实探测决定。

为每个源输出：`research_source_id, resolved_url, observed_at, transport, http_status, access_constraint, latest_content_date, pagination_mode, sample_records, notice_types_seen, raw_count, qualifying_count, adapter_id, runtime_state, reason`。

首次观察404/403不表示网站没有价值。允许沿官方目录、主站导航、正式公开API/RSS以及已获许可的公共网页重试。禁止绕过验证码或付费；没有凭据就标`CREDENTIAL_NOT_CONFIGURED`。搜索索引只作发现，不能直接以snippet替代完整采购条件。

接入优先级：API/CSV/OCDS/RSS → 专用HTML卡片与详情 → 公开JS数据/浏览器页面。不能将JSON/CSV当HTML后抓anchor，也不能用通用anchor提取整个政府首页。
内容首页/列表可能同域不同系统：保留别名和最终地址；广东旧ccgp目录与现代智慧云合并为同source，不重复计数。

## 6. 最小数据结构（可选字段，不另建一套数据库）

在 `src/opportunity-v2/types.ts` 新增可选 `procurement?: ProcurementMeta`，保留现有字段兼容。建议：
```ts
interface ProcurementMeta {
  kind: 'purchase' | 'commission' | 'supplier_intake' | 'framework' | 'market_engagement';
  direction: 'buyer_demand' | 'supplier_application';
  stage: 'planned' | 'prequalification' | 'open' | 'ongoing_intake' | 'awarded' | 'cancelled' | 'closed' | 'unknown';
  noticeType: string;
  projectId?: string; noticeId?: string; lotId?: string; previousNoticeId?: string;
  buyer?: { name: string; country?: string; region?: string };
  agent?: string; deliveryLocation?: string;
  eligibilityText?: string;
  topics?: string[];
  budget?: { value?: number; currency?: string; raw: string; tax?: 'inclusive'|'exclusive'|'unknown'; basis: 'budget'|'ceiling'|'framework_estimate'|'unknown' };
  fees?: Array<{ type: 'bid_bond'|'document_fee'|'other'; value?: number; currency?: string; raw: string }>;
  milestones?: Array<{ type: 'document_access'|'registration'|'prequalification'|'submission'|'opening'|'delivery'|'other'; date?: string; time?: string; timezone?: string; precision: 'date'|'datetime'|'relative'|'unknown'; mandatory?: boolean; raw: string; sourceUrl: string }>;
  canNewSupplierRespond: 'yes'|'no'|'unknown';
  applicationUrl?: string; documentsUrl?: string;
  versionPublishedAt?: string; lastCheckedAt?: string;
}
```
必要时用现有项目命名风格调整camel/snake，但语义不得丢。`milestones`每个值和原文/URL一起保存；不是整个HTML全塞入pool。未知字段不写“否”；不要要求所有可选字段齐全才能展示。
旧 `deadline` 是派生展示字段，不可独立从别处取得。采购状态使用采购专用选择函数，避免影响比赛deadline代码。

## 7. 开始前检查：保护现有成果

- [ ] 在外部干净worktree/副本开发；读取当前AGENTS/skills及最新分支。
- [ ] 清点现有V2与Legacy来源，按域名/入口/机构对照03，输出already_registered/adapter_exists/legacy_only/new；不重复登记已经有的源。
- [ ] 固定一份现有生产只读快照到开发基线，记录比赛ID集合、LOEWE、字段hash、中文缓存hash、UI输出和source31基线；不写生产。
- [ ] 运行实际存在的typecheck/verify命令并保存原始日志；区分历史失败与本任务失败。
- [ ] 在测试副本中新增配置、数据和环境路径，保证任何脚本的默认路径不会误写 `/var/lib/chanceping`。

## 8. 分波连续执行，不逐波等待用户再批准

### Wave A：全目录探测与正式接口基础

遍历03全部研究项。EXCLUDE写明方向反例后跳过采集；DISCOVERY用来补下游入口；CHANNEL保持单独范围。没有URL的先用证据目录解析，不猜。
04地理矩阵逐行查覆盖；大洲缺口先用成熟跨国API/官方目录补，没查完必须报告 `coverage_gap`，不能写“全球全覆盖”。
对可公开访问的source进行真实查询（对象词+公告类型），存一个包含正例、反例、更正、状态的最小fixture。历史公告可以当测试结构，但不得作为当前机会导入。

### Wave B：高价值主干

优先接：
- 国内：`proc-cn-ccgp, proc-cn-ggzy, proc-cn-cebpub, proc-cn-gdgpo, proc-cn-gzygcg, proc-cn-gzsun, proc-cn-szygcg, proc-cn-cfcpn, proc-cn-cib, proc-cn-spdb, proc-cn-sdebank, proc-cn-365trade`。
- 海外结构化：`proc-eu-ted, proc-uk-fts, proc-uk-cf, proc-ca-canadabuys, proc-fr-boamp`；`proc-us-sam`仅有合法key时live。
- 文化买方：`proc-cn-nnhm, proc-cn-gzmuseum, proc-cn-yantian`；海外产品提案用 `proc-us-nmaahc, proc-us-nm-museums, proc-us-nyhistory`，但放供应申请。
这些顺序是实施顺序，不是最终只接这些。遇单源阻断继续下一个，不全任务停工。

### Wave C：区域与行业密度

对03其余可接入P0/P1继续实现或复用adapter：37中国地方节点、其他银行/国企、港澳台、UK分区、欧洲国家、澳新、亚洲、国际组织和其他地区。相同OCDS/平台技术用配置复用，不每个域名复制一个庞大parser。
商业平台只有公开内容或合法授权才接；有价值但需付费记待授权，不自动购买。供应商平台（Alibaba/MIC/ITC等）的登录要求如实标注。

### Wave D：补缺口、运行和交付

从04覆盖矩阵继续补缺；任何新增源先写研究证据并实测，再加入运行Source。完成开发副本真实运行、去重与生命周期回填，生成完整交付。无须为了来源数量达标乱加，亦不得无声跳过未接通项。

## 9. 具体代码落点与实现步骤

以下是拟议文件路径；执行前对照当前目录，可合并职责但不能另起V3工程。

### Task 9.1 研究清单和可续跑探测
- Create `config/procurement/source-research.json`（复制03，明确不是运行seed）；`config/procurement/query-pack.json`（05）。
- Create `scripts/probe-ich-procurement-sources.ts`，输出 `reports/ich/procurement/source-probe.json` 和逐项ledger。
- 状态包含未探测/可读/壳页/需凭据/受限/别名/无关/需适配；已有V2枚举不够的字段先放诊断 `access_constraint`，不强行污染运行状态。
- 写测试：同域别名不算两个，来源403不中断其余，首轮预算耗尽保存cursor，第二轮不从1重抓全部。

### Task 9.2 采购通知适配
- Create `src/ich/aggregation/adapters/procurement/` 下的source-specific模块，如 `ccgp.ts, cib.ts, public-tenders.ts, ocds.ts, canadabuys-csv.ts, vendor-intake.ts`，依据真正相同结构复用。
- Modify `src/ich/aggregation/adapters/index.ts`注册已测解析器；在 `src/ich/aggregation/adapters/common.ts` 的 `ParsedAggregationItem` 增加可选采购元数据或类型安全的等价传递口，保证parser→normalize→pool不丢字段。类型声明采用type-only导入或共用小型类型文件，避免运行时循环依赖。
- Modify `src/opportunity-v2/pipeline.ts`仅增加采购专用dispatch；API fetch与纯parse分离，使用同一安全网络层。POST/JSON需要扩展时限定已知源origin和实际参数；不暴露任意URL转发给公众。
- 先用保存fixture写失败测试，再实现parser，最后进行实际source请求；不要用fixture PASS代替live PASS。
- notice/lot/version的原始ID和URL保留。详情获取仅补缺失事实或读取变更；缓存按URL+内容hash，超时有退避，禁止卡住全批。

### Task 9.3 归类、金额、阶段和去重
- Create `src/opportunity-v2/procurement.ts`：只管采购方向、阶段、日期派生和公开可行动条件。
- Modify `types.ts`增加可选采购元数据；在normalization中仅对采购source/notice启用。
- 必要的去重函数用procurement项目/标包/notice版本特例；保持所有比赛ID和原分类不变。
- 检查 `readOpportunityV2Pool`、`reconcileOpportunityV2Deadlines`、`mergeOpportunityRecords`、`refreshOpportunityV2DerivedFields`、`filterOpportunityV2Radar` 的全局调用点。采购元数据存在时必须调用采购状态/日期规则，不能先经过比赛规则把已结束的采购复活，或把采购默认归为competition。增加分支是允许的兼容集成；既有比赛分支行为保持不变。
- 现有公共API若直接输出原始status，也必须使用同一采购状态投影，防止卡片隐藏但JSON仍宣称开放。
- 防止默认category回退成competition；反向供货页、新闻菜单不能成为procurement。
- 重复更正不得复活已取消项目；不同包不可吞并；同版本多source保留发现关系。
- 06全部夹具转为实际项目测试；添加本轮实际正文脱敏fixtures。

### Task 9.4 页面复用与AI导出
- 保留原“采购／订单”入口及纸张风格，复用当前卡片/详情/搜索/后台。仅按可选采购字段显示“买什么、买方、地点、关键截止、预算原文、限制、原文按钮”。
- 一个清晰原文深链接，来源名可保留纯文本；没有必要添加聚合首页广告。
- 不在详情反复列10个“待确认”；字段缺失合并一句“资格、费用及响应材料请查看采购原文”。关键截止不明确要单独提示。
- 分类标签建议：文创商品、礼赠定制、设计包装、活动/体验、展陈/艺术、花艺布置；可多选但总列表不重复。
- HTML/API/Markdown必须使用同一公开采购选择函数。先复用既有API `category=procurement_project`；供货/观察范围用明确query。
- 如当前框架没有采购机器导出，只增加 `/ich/procurement.json`、`/ich/procurement.md`，不新建另一数据池、不重新做视觉。
- 公开计数分别为open projects、supplier intake、watch、unknown，不能把所有采购相关条目都写成“正在接单”。
- 默认明晰截止的项目近→远便于响应；长期入库与日期未知另排。赛事备忘录远→近保持不变。

### Task 9.5 72h与后台
- 将已接通source并入现有任务配置；source列表显示采购模块、优先级、访问限制、最后成功、当前贡献和partial/cursor。
- source可暂停启用、新增沿已有后台；新增未知网站只登记/探测，不凭输入URL就承诺可抓成功。
- 初始查询60天只是起始窗，补更早仍开放和长期入口；增量按published/updated水位加7天重叠，追踪更新/成交/取消，cursor独立保存。
- 一来源失败保留上次好数据与stale标记；超过有效期按时间关闭，不能因无新抓取复活。
- 默认同域并发1–2，按源站允许速率与Retry-After调整；明确退避与最大响应大小。预算结束记partial和cursor，不无限重试、不绕验证码。失败后的补跑与正常首页增量分开，避免永远重抓历史页或漏掉最新页。
- 部署后调度接入在后续上线任务做，本轮只在隔离环境验证配置与调用路径。

### Task 9.6 全量接入对账与只读巡检

Create `scripts/verify-ich-procurement.ts`、`scripts/audit-ich-procurement.ts`，可给拟议npm脚本 `verify:ich:procurement`、`audit:ich:procurement`；执行前在package.json实际登记，不能报告不存在的命令通过。

输出固定目录 `audits/ich/procurement/latest/`（本轮标 `environment=development`）：
`manifest.json, sources.json, source-probe.json, coverage.json, opportunities.json, notices.json, filters.json, checks.json, errors.json, screenshots/`。

manifest明确被测commit、实际环境baseURL、数据runID、时间、文件hash、范围和是否部分完成；禁止localhost快照写production=true。
按source记录：matched notices、parsed、current relevant、intake、watch、expired、cancelled、duplicates、unique union contribution、encoding errors、unknown prerequisites、failed fields、complete/cursor。

完整性必须对**源noticeID集合→解析记录→项目/标包去重→公开条目**有ledger；没有source总数时unknown，不推断100%。

## 10. 实际验收标准

### 功能标准

- 177目录项均有处置结果；只有明确反例允许不请求公告，目录项要记录下游发现。
- 能抓的实际接通；受凭据/验证/条款限制者明确BLOCKED原因，不能fake ACTIVE。
- 无乱码标题进入任何公开采购HTML/JSON/MD；健康正常信息不被坏记录覆盖。
- 中标、成交、终止不算当前响应；采购前置截止正确，不依未来截止复活旧项目。
- budget、bond、fee、framework_cap不混；seller_offer采购可见数为0。
- 同项目多源可去重、不同lot保留、版本变更应用；来源列表及日期证据不丢。
- 原文/中文搜索同记录；翻译失败原文继续展示。
- 筛选矩阵记录实际ID，而不是只说HTTP200：文化商品×国内、文化活动×某买方、supplier_intake、watch、截止范围、来源、关键词；空结果可正确通过但需要原因。
- 初始fixture必须覆盖正例、反例和至少一条update；API无key只报未配置，不自动走付费搜索装成功。

### 赛事回归

在**相同时间/同一冻结数据**下验证现有competition记录、ID、金额/日期/译文/源码可观察行为保持；LOEWE一条且两个来源；备忘录HTML/JSON/MD一致；现有乱码和deadline测试全部跑。
新采购入库不应向赛事备忘录添采购公告。跨模块分类没有明确信号就不要让采购自动变competition。

### 测试与运行

先在干净checkout跑 `npm run typecheck`、`npm run verify:all`、已有V2/V1.3/encoding/deadline等实际脚本；再跑新增采购suite；保存每条命令的退出码及日志。
接口和浏览器做桌面/390×844手机检查；调用真实publicsource的结果单独于fixture测试表。
外部站点临时失败不要求fake全部通过；在有限退避/正规替代后如实列待处理，已接通项目继续交付。

## 11. 交付与提交

建议按“schema+测试”“adapter+真实probe”“公开视图+审计”若干可复核commit；不要一个源一个审批轮次。只暂存本任务文件，不混benchmark/headhunter/其他雷达改动。
使用已有 `chanceping-push-deploy` skill的push部分；实时 `git ls-remote` + GitHub API确认，保留TLS/SSH检查，不强推。**不执行deploy。**

最终报告不可只有总数，应包含：
```text
business commits / audit commit / remote HEAD
研究项总数 / 已处置 / 未处置（逐项ID）
运行Source：原有 / 新增 / 复用 / 合并别名 / 暂停 / 待凭据 / 待适配
实际抓取：attempted / successful / failed / partial / raw notices
采购项目：open / prerequisite closed / unknown / expired / cancelled
供货申请 / watch / channel-only（分开）
按国内外及采购对象分类数量（说明来源地与买方地口径）
按source独有贡献 + 跨source并集（不可直接相加）
遗漏/未解析记录及理由；04每个地域/行业当前状态
预算/保证金/费用、日期前置、方向、去重、乱码检查
原有赛事回归 / 实际浏览器 / 中文缓存
截图、机器快照和日志路径（提交到可读取位置，不仅/tmp）
生产部署：NO；DNS：NO；对外报名/报价：NO；新付费购买：NO
```

## 12. 本轮结束定义

“让一个可持续抓取的采购来源网络在开发副本真实运行，展示方向和状态正确的订单线索，并明确尚未接通的地域和平台”。
**不以满100条/80分/来源达到某数作为通过条件，不因一个网站阻断整个项目，不用放宽过滤凑机会。**
当前API/平台足以复用的环节直接用；仅在确需时新增小型适配器。完成后提交推送与预览，生产是否上线由用户后续决定。
