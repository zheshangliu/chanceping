# 盯非遗｜综合机会工作台 V1.2 Real Coverage 交付报告

状态：SHIPPED_WITH_BACKLOG（本分支尚未部署生产）

## S0 基线与承接

- branch: codex/opportunity-v12-real-coverage
- commit: b3fcda3cdd5113ba7388dfd37c5cdc853eda8b0f
- base: origin/main（本轮 clean worktree）
- Procurement Phase 1：复用 main 上已验证 control plane，未重跑旧 33→38 rollout
- 赛事 Radar / Memo：复用 V1.1 选择性移植的 OpportunityV2 身份、来源、去重、截止日期和旧 UI 路径
- production: NOT_DEPLOYED

## S1 分类与安全边界

综合机会工作台只接受有正文行动证据的六类机会；比赛、LOGO/VI/IP/设计方案征集、结果/新闻/holiday、导航页和 seller-offer 不进入六类 coverage。没有为达成数量目标放宽 Current，也没有新增评分或官方核验门槛。

- Opportunity Pool: 2255
- public Radar: 253
- public competition: 192
- Memo: 537（含真实、未过期 competition，故可大于首页 Radar）
- Memo known/unknown deadline: 405/132
- coverage assessments: 159
- lanes: {"current":84,"research":36,"review":39}

六类 coverage（可多标签重叠）：
- grant_funding: 16
- exhibition_showcase: 87
- market_channel: 51
- residency_learning: 16
- partnership_commission: 6
- recognition_incubation: 0

分类样本：
1. 2026中国美术家协会第二届插画艺术展览征稿通知｜grant_funding、exhibition_showcase、market_channel｜设计竞赛网｜2026-11-18T23:59:00.000Z｜https://www.shejijingsai.com/2026/08/1618190.html
2. 中国美术家协会2026中轴线文化青年数字艺术展览征稿通知｜exhibition_showcase、market_channel｜设计竞赛网｜2026-10-08T23:59:00.000Z｜https://www.shejijingsai.com/2026/08/1623347.html
3. Open call for residencies 2027: What is real?｜exhibition_showcase｜OpenCall Radar｜Craft｜截止待确认｜https://opencallradar.com/open-calls/open-call-for-residencies-2027-what-is-real-platform-dal-fbd996bd
4. Exhibitions｜grant_funding、exhibition_showcase、market_channel｜OpenCall Radar｜Craft｜截止待确认｜https://opencallradar.com/open-calls/type/exhibitions
5. Project Open Call: Made of Fife Made of Fife: A Call for Material Makers, Researchers and Practitioners｜exhibition_showcase、market_channel｜Craft Scotland｜2026-10-12T23:59:00.000Z｜https://www.craftscotland.org/community/opportunity/open-call-made-of-fife-2340
6. Full details &rarr; Exhibit & Sell Applications Open for Alchemy: Goldsmiths Scotland Alchemy: Goldsmiths Scotland is a new fair of contemporary jewellery and silver in Scotland. Closing date: 5 Oct 2026｜exhibition_showcase、market_channel｜Craft Scotland｜2026-10-05T23:59:00.000Z｜https://www.craftscotland.org/community/opportunity/alchemy-goldsmiths-scotland-2334
7. AURA: Open Call Open Call for artists and writers to submit their work to a feminist online zine based on...｜exhibition_showcase｜CuratorSpace Opportunities｜截止待确认｜https://www.curatorspace.com/opportunities/detail/aura-open-call/6198
8. Fairs/Festivals Kensington Art Fair 2027 Milford, Michigan Application fee: $30｜exhibition_showcase、market_channel｜CaFÉ CallForEntry｜截止待确认｜https://opportunities.wearecreativewest.org/opportunity/14740/ZAPP

## S2 Generic Source Onboarding Framework

实现了 profile → transport（HTML/RSS/JSON）→ include/exclude → deadline evidence → shared normalizer/pool 的最小框架。Profile 只是发现配置，不绕过统一编码、证据、去重、截止日期和公开门禁；无法安全解析的来源保留登记并记录 blocker。

## S3 来源与真实运行

- persisted source registry: 44
- effective source registry: 44
- fetched sources: 31
- successful sources: 27
- source listing items: 1518
- raw_items from latest run result: 1623

重点来源：
- shejijingsai-list｜设计竞赛网｜legacy/dedicated｜ACTIVE｜HTTP 200 / 358 条
- chuangsaiyun-competition-list｜创赛云｜legacy/dedicated｜ACTIVE｜HTTP 200 / 102 条
- contest-watchers-open｜Contest Watchers｜legacy/dedicated｜ACTIVE｜HTTP 200 / 10 条
- crafts-council-opportunities｜Crafts Council｜legacy/dedicated｜FAILED｜BLOCKED/EMPTY：HTTP 403
- artconnect-opportunities｜ArtConnect｜ArtConnect｜ACTIVE｜HTTP 200 / 11 条
- competitions-archi｜Competitions.archi｜legacy/dedicated｜ACTIVE｜HTTP 200 / 12 条
- loewe-craft-prize｜LOEWE FOUNDATION Craft Prize｜legacy/dedicated｜ACTIVE｜HTTP 200 / 1 条
- opencall-radar-craft｜OpenCall Radar｜Craft｜legacy/dedicated｜ACTIVE｜HTTP 200 / 5 条
- opencalls-ai｜opencalls.ai｜legacy/dedicated｜FAILED｜BLOCKED/EMPTY：connect ECONNREFUSED 172.67.212.137:443
- american-craft-council-opportunities｜American Craft Council Opportunities Board｜legacy/dedicated｜ACTIVE｜HTTP 200 / 35 条
- craft-scotland-opportunities｜Craft Scotland｜Craft Scotland｜ACTIVE｜HTTP 200 / 9 条
- kcdf-opportunities｜KCDF 한국공예·디자인문화진흥원｜legacy/dedicated｜ACTIVE｜HTTP 200 / 11 条
- heritage-crafts-opportunities｜Heritage Crafts｜legacy/dedicated｜ACTIVE｜HTTP 200 / 11 条
- homo-faber-calls｜Homo Faber Calls｜legacy/dedicated｜ACTIVE｜HTTP 200 / 2 条
- asef-culture360-opportunities｜ASEF culture360 Opportunities｜ASEF Culture360｜ACTIVE｜HTTP 200 / 9 条
- on-the-move-open-calls｜On the Move Open Calls｜On the Move｜ACTIVE｜HTTP 200 / 23 条
- curatorspace-opportunities｜CuratorSpace Opportunities｜CuratorSpace｜ACTIVE｜HTTP 200 / 10 条
- cafe-call-for-entry｜CaFÉ CallForEntry｜legacy/dedicated｜ACTIVE｜HTTP 200 / 21 条
- artshub-craft-opportunities｜ArtsHub Craft Opportunities｜legacy/dedicated｜FAILED｜BLOCKED/EMPTY：HTTP 403
- craft-council-bc-calls｜Craft Council of British Columbia Calls｜legacy/dedicated｜ACTIVE｜HTTP 200 / 9 条
- craft-council-nl-opportunities｜Craft Council of Newfoundland and Labrador Opportunities｜legacy/dedicated｜NEEDS_ADAPTER｜BLOCKED/EMPTY：No RSS or HTML listing items recognized
- cfw-cultural-ip｜CFW设计大赛｜文创IP｜legacy/dedicated｜ACTIVE｜HTTP 200 / 6 条
- whaleideas-competition｜文创赛网｜鲸创意｜legacy/dedicated｜ACTIVE｜HTTP 200 / 15 条
- 1zj-cultural-competition｜第一征集网｜全球征集网｜legacy/dedicated｜ACTIVE｜HTTP 200 / 2 条
- chuangyisai-cultural｜创意赛网｜legacy/dedicated｜NEEDS_ADAPTER｜BLOCKED/EMPTY：No RSS or HTML listing items recognized
- zcool-challenges｜站酷挑战赛 ZCOOL｜legacy/dedicated｜ACTIVE｜HTTP 200 / 11 条
- zjmtcn-product-competition｜征集码头｜legacy/dedicated｜NEEDS_ADAPTER｜BLOCKED/EMPTY：No RSS or HTML listing items recognized
- iuben-cultural-competition｜优本视觉｜legacy/dedicated｜ACTIVE｜HTTP 200 / 15 条
- everyart-competition｜EveryArt｜legacy/dedicated｜ACTIVE｜HTTP 200 / 11 条
- gtn9-competition｜古田路9号｜legacy/dedicated｜FAILED｜BLOCKED/EMPTY：HTTP 521
- cnyisai-competition｜艺赛中国｜legacy/dedicated｜ACTIVE｜HTTP 200 / 111 条
- proc-uk-fts｜英国 Find a Tender（OCDS）｜legacy/dedicated｜ACTIVE｜HTTP 200 / 81 条
- proc-ca-canadabuys｜CanadaBuys Open Tenders CSV｜legacy/dedicated｜ACTIVE｜HTTP 200 / 621 条
- proc-cn-ccgp｜中国政府采购网｜legacy/dedicated｜PENDING｜尚无本次运行证据
- proc-cn-cib｜兴业银行集中采购管理平台｜legacy/dedicated｜PENDING｜尚无本次运行证据
- proc-global-ocp｜Open Contracting Data Registry｜Wales Sell2Wales｜legacy/dedicated｜PENDING｜尚无本次运行证据
- proc-eu-ted｜TED 欧盟招标公告｜legacy/dedicated｜PENDING｜尚无本次运行证据
- proc-wb｜World Bank Procurement Notice｜legacy/dedicated｜PENDING｜尚无本次运行证据
- proc-cn-gzsun｜广州阳光采购服务平台｜legacy/dedicated｜PENDING｜尚无本次运行证据
- proc-cn-csg｜南方电网供应链统一服务平台｜legacy/dedicated｜PENDING｜尚无本次运行证据
- proc-cn-gz-wglj｜广州市文化广电旅游局招标采购｜legacy/dedicated｜PENDING｜尚无本次运行证据
- proc-uk-contracts-finder｜UK Contracts Finder｜legacy/dedicated｜PENDING｜尚无本次运行证据
- cnaf-guides｜国家艺术基金申报指南｜CNAF｜ACTIVE｜HTTP 200 / 6 条
- een-partnering｜EEN合作机会｜legacy/dedicated｜PENDING｜尚无本次运行证据

本次有效接入重点：On the Move、ArtConnect、CuratorSpace、ASEF culture360、CNAF、Craft Scotland，以及 American Craft 观察到的 craft 来源家族；各来源仍分别经过共享 parser 与公共门禁。EEN/其他 procurement source 保留在 registry，但本轮未将无目标行业内容伪装为公开机会。

## S4 交付、证据与发布边界

Checks：
- competition_leakage_in_coverage: 0
- expired_current_public: 0
- result_or_editorial_current_public: 0
- seller_offer_public: 0
- procurement_leakage_public: 0
- missing_source_evidence_public: 0
- encoding_errors_pool: 0
- encoding_errors_public: 0
- unsafe_deadline_internal: 30
- unsafe_deadline_public_exact: 0
- duplicate_pool_ids: 0
- memo_greater_than_radar: true
- memo_known_deadlines: 405
- memo_unknown_deadlines: 132
- source_profiles_valid: true
- scheduler_interval_hours: 72
- scheduler_next_run_at: 2026-09-20T06:12:37.968Z

已生成机器可读审计：

- audits/ich/v12/latest/manifest.json
- audits/ich/v12/latest/baseline.json
- audits/ich/v12/latest/source-activation.json
- audits/ich/v12/latest/coverage.json
- audits/ich/v12/latest/checks.json
- audits/ich/v12/latest/production-readiness.json

本轮先在 feature branch 验证；按用户授权，只有所有 fixture、回归、UI/业务 Smoke 和 CI Gate 均通过后才创建 PR、合并和生产发布。外部来源单点受阻会留在来源状态中，不阻塞已可交付部分，也不伪造 live success。

## 待办

- 对仍无稳定正文适配器的来源继续保持 BLOCKED/NEEDS_ADAPTER 诚实状态
- 生产发布需要受控备份、PR/CI、release 和真实生产验收；本报告生成时尚未部署

## Final Delivery（按模板）

### Final Status

`SHIPPED_WITH_BACKLOG`

### Git

- base main: origin/main / clean worktree
- feature branch: codex/opportunity-v12-real-coverage
- PR: 待创建（本地 Gate 完成后进入受控发布流程）
- merged main: 未合并
- release tag: 未创建
- production commit: 未部署

### Production

- URL: https://ich.chanceping.com/ich
- deployed: NO（本轮审计仍在 feature branch）
- deployment workflow/run: 待 PR/CI 与发布审批
- rollback required: NO

### Non-Competition Coverage

| Type | Current | Early | Research | Source families | Example current opportunity |
|---|---:|---:|---:|---|---|
| grant_funding | 13 | 0 | 3 | legacy/dedicated, ArtConnect, On the Move | 2026中国美术家协会第二届插画艺术展览征稿通知 |
| exhibition_showcase | 77 | 0 | 10 | legacy/dedicated, ArtConnect, Craft Scotland, CuratorSpace | 2026中国美术家协会第二届插画艺术展览征稿通知 |
| market_channel | 43 | 0 | 8 | legacy/dedicated, ArtConnect, Craft Scotland, CuratorSpace | 2026中国美术家协会第二届插画艺术展览征稿通知 |
| residency_learning | 11 | 0 | 5 | CuratorSpace, legacy/dedicated, ArtConnect | OPEN CALL FOR ARTIST RESIDENCY We are seeking a multimedia artist to be a resident for at least three months on our art zine to... |
| partnership_commission | 3 | 0 | 3 | legacy/dedicated, ArtConnect, On the Move | 8.7法国巴黎国际艺术城｜Citéinternationaledesarts✨艺术驻留OPENCALL📍地点：法国巴黎⏰📅驻留时长：2‑12个月🔥项目亮点▪️全球顶级艺术驻留，坐落巴黎市中心，坐拥专业独立工作室与住宿空间￼￼￼▪️汇聚世界各地艺术家，庞大国际艺术家社群，大量沙龙、展览、交流活动资源▪️多学科开放：视觉艺术、表演艺术、音乐、写作、影像、策展、建筑设计均可申报￼￼￼▪️部分渠道可申请全额资助，支持项目创作落地，提供公共展厅可举办个人作品展📝申请资格▪️18周岁以上，不接受在校学生申请，需要具备至少5年专业艺术从业经历￼￼￼▪️全球艺术家、策展人、艺术研究者均可投递▪️过去2年内没有参与过本艺术城驻留项目￼￼￼💡适合人群想要赴欧洲做创作、拓展国际艺术人脉、落地海外展览项目的职业艺术创作者📮申请方式前往Citéinternationaledesarts官方网站下载申报材料，提交作品集、创作计划、个人简历进行线上申报⚠️提示：该驻留有不同合作子项目，资助条件各有差异，投递前仔细核对对应项目细则#艺术驻留#法国艺术驻留#巴黎艺术#海外艺术家驻地#Citéinternationaledesarts#国际opencall#艺术征集#艺术家机会 |
| recognition_incubation | 0 | 0 | 0 | — | — |

### Diversity

- source families producing current/early: 5
- view types with current/early: 5
- actionable current/early count: 84
- max Top-list concentration by family: legacy/dedicated = 61

### Quality Gates

- competition_leakage_noncompetition: 0
- expired_in_current: 0
- result_only_current: 0
- seller_offer_as_demand: 0
- fake_deadline_time: 0
- encoding_errors: 0
- duplicate identities: 0

### Top Actionable Opportunities

1. **2026中国美术家协会第二届插画艺术展览征稿通知**｜grant_funding、exhibition_showcase、market_channel｜legacy/dedicated｜来源：[设计竞赛网](https://www.shejijingsai.com/2026/08/1618190.html)｜截止：2026-11-18T23:59:00.000Z｜费用/资助：基金｜资格：NEEDS_REVIEW｜打开来源原文，核验资格、材料、费用与截止日期后再决定申请
2. **中国美术家协会2026中轴线文化青年数字艺术展览征稿通知**｜exhibition_showcase、market_channel｜legacy/dedicated｜来源：[设计竞赛网](https://www.shejijingsai.com/2026/08/1623347.html)｜截止：2026-10-08T23:59:00.000Z｜费用/资助：未明确｜资格：NEEDS_REVIEW｜打开来源原文，核验资格、材料、费用与截止日期后再决定申请
3. **Open call for residencies 2027: What is real?**｜exhibition_showcase｜legacy/dedicated｜来源：[OpenCall Radar｜Craft](https://opencallradar.com/open-calls/open-call-for-residencies-2027-what-is-real-platform-dal-fbd996bd)｜截止：待确认｜费用/资助：未明确｜资格：NOT_ASSESSED｜打开来源原文，核验资格、材料、费用与截止日期后再决定申请
4. **Exhibitions**｜grant_funding、exhibition_showcase、market_channel｜legacy/dedicated｜来源：[OpenCall Radar｜Craft](https://opencallradar.com/open-calls/type/exhibitions)｜截止：待确认｜费用/资助：fund｜资格：NEEDS_REVIEW｜打开来源原文，核验资格、材料、费用与截止日期后再决定申请
5. **Project Open Call: Made of Fife Made of Fife: A Call for Material Makers, Researchers and Practitioners**｜exhibition_showcase、market_channel｜Craft Scotland｜来源：[Craft Scotland](https://www.craftscotland.org/community/opportunity/open-call-made-of-fife-2340)｜截止：2026-10-12T23:59:00.000Z｜费用/资助：未明确｜资格：NEEDS_REVIEW｜打开来源原文，核验资格、材料、费用与截止日期后再决定申请
6. **Full details &rarr; Exhibit & Sell Applications Open for Alchemy: Goldsmiths Scotland Alchemy: Goldsmiths Scotland is a new fair of contemporary jewellery and silver in Scotland. Closing date: 5 Oct 2026**｜exhibition_showcase、market_channel｜Craft Scotland｜来源：[Craft Scotland](https://www.craftscotland.org/community/opportunity/alchemy-goldsmiths-scotland-2334)｜截止：2026-10-05T23:59:00.000Z｜费用/资助：未明确｜资格：NEEDS_REVIEW｜打开来源原文，核验资格、材料、费用与截止日期后再决定申请
7. **AURA: Open Call Open Call for artists and writers to submit their work to a feminist online zine based on...**｜exhibition_showcase｜CuratorSpace｜来源：[CuratorSpace Opportunities](https://www.curatorspace.com/opportunities/detail/aura-open-call/6198)｜截止：待确认｜费用/资助：未明确｜资格：NOT_ASSESSED｜打开来源原文，核验资格、材料、费用与截止日期后再决定申请
8. **Fairs/Festivals Kensington Art Fair 2027 Milford, Michigan Application fee: $30**｜exhibition_showcase、market_channel｜legacy/dedicated｜来源：[CaFÉ CallForEntry](https://opportunities.wearecreativewest.org/opportunity/14740/ZAPP)｜截止：待确认｜费用/资助：Application fee: $30 来源页面未提供更详细摘要｜资格：NEEDS_REVIEW｜打开来源原文，核验资格、材料、费用与截止日期后再决定申请
9. **Exhibition Draw the Line Chico, California Application fee: $15**｜exhibition_showcase、market_channel｜legacy/dedicated｜来源：[CaFÉ CallForEntry](https://opportunities.wearecreativewest.org/opportunity/18149/CAFE)｜截止：待确认｜费用/资助：Application fee: $15 来源页面未提供更详细摘要｜资格：NEEDS_REVIEW｜打开来源原文，核验资格、材料、费用与截止日期后再决定申请
10. **Fairs/Festivals Ridgway Rendezvous Arts & Craft Festival 2027, 42nd Annual Ridgway, Colorado Application fee: $35**｜exhibition_showcase、market_channel｜legacy/dedicated｜来源：[CaFÉ CallForEntry](https://opportunities.wearecreativewest.org/opportunity/14882/ZAPP)｜截止：待确认｜费用/资助：Application fee: $35 来源页面未提供更详细摘要｜资格：NEEDS_REVIEW｜打开来源原文，核验资格、材料、费用与截止日期后再决定申请

### Source Activation

| Source family | Integration | Live HTTP | Parsed | Current/Early | Final state | Notes |
|---|---|---:|---:|---:|---|---|
| legacy/dedicated | 设计竞赛网 | 200 | 358 | 2 | PIPELINE_VERIFIED |  |
| legacy/dedicated | 创赛云 | 200 | 102 | 0 | PIPELINE_VERIFIED |  |
| legacy/dedicated | Contest Watchers | 200 | 10 | 0 | PIPELINE_VERIFIED |  |
| legacy/dedicated | Crafts Council | 403 | 0 | 0 | BLOCKED_OR_EMPTY | HTTP 403 |
| ArtConnect | ArtConnect | 200 | 11 | 5 | PIPELINE_VERIFIED |  |
| legacy/dedicated | Competitions.archi | 200 | 12 | 0 | PIPELINE_VERIFIED |  |
| legacy/dedicated | LOEWE FOUNDATION Craft Prize | 200 | 1 | 0 | PIPELINE_VERIFIED |  |
| legacy/dedicated | OpenCall Radar｜Craft | 200 | 5 | 4 | PIPELINE_VERIFIED |  |
| legacy/dedicated | opencalls.ai | — | 0 | 0 | BLOCKED_OR_EMPTY | connect ECONNREFUSED 172.67.212.137:443 |
| legacy/dedicated | American Craft Council Opportunities Board | 200 | 35 | 6 | PIPELINE_VERIFIED |  |
| Craft Scotland | Craft Scotland | 200 | 9 | 4 | PIPELINE_VERIFIED |  |
| legacy/dedicated | KCDF 한국공예·디자인문화진흥원 | 200 | 11 | 0 | PIPELINE_VERIFIED |  |
| legacy/dedicated | Heritage Crafts | 200 | 11 | 0 | PIPELINE_VERIFIED |  |
| legacy/dedicated | Homo Faber Calls | 200 | 2 | 0 | PIPELINE_VERIFIED |  |
| ASEF Culture360 | ASEF culture360 Opportunities | 200 | 9 | 0 | PIPELINE_VERIFIED |  |
| On the Move | On the Move Open Calls | 200 | 23 | 2 | PIPELINE_VERIFIED |  |
| CuratorSpace | CuratorSpace Opportunities | 200 | 10 | 12 | PIPELINE_VERIFIED |  |
| legacy/dedicated | CaFÉ CallForEntry | 200 | 21 | 36 | PIPELINE_VERIFIED |  |
| legacy/dedicated | ArtsHub Craft Opportunities | 403 | 0 | 0 | BLOCKED_OR_EMPTY | HTTP 403 |
| legacy/dedicated | Craft Council of British Columbia Calls | 200 | 9 | 0 | PIPELINE_VERIFIED |  |
| legacy/dedicated | Craft Council of Newfoundland and Labrador Opportunities | 200 | 0 | 0 | BLOCKED_OR_EMPTY | No RSS or HTML listing items recognized |
| legacy/dedicated | CFW设计大赛｜文创IP | 200 | 6 | 3 | PIPELINE_VERIFIED | Partial pagination; next page 15 |
| legacy/dedicated | 文创赛网｜鲸创意 | 200 | 15 | 2 | PIPELINE_VERIFIED | Partial pagination; next page 15 |
| legacy/dedicated | 第一征集网｜全球征集网 | 200 | 2 | 1 | PIPELINE_VERIFIED |  |
| legacy/dedicated | 创意赛网 | 200 | 0 | 0 | BLOCKED_OR_EMPTY | No RSS or HTML listing items recognized |
| legacy/dedicated | 站酷挑战赛 ZCOOL | 200 | 11 | 1 | PIPELINE_VERIFIED |  |
| legacy/dedicated | 征集码头 | 200 | 0 | 0 | BLOCKED_OR_EMPTY | No RSS or HTML listing items recognized |
| legacy/dedicated | 优本视觉 | 200 | 15 | 0 | PIPELINE_VERIFIED |  |
| legacy/dedicated | EveryArt | 200 | 11 | 5 | PIPELINE_VERIFIED |  |
| legacy/dedicated | 古田路9号 | 521 | 0 | 0 | BLOCKED_OR_EMPTY | HTTP 521 |
| legacy/dedicated | 艺赛中国 | 200 | 111 | 1 | PIPELINE_VERIFIED |  |
| legacy/dedicated | 英国 Find a Tender（OCDS） | 200 | 81 | 0 | PIPELINE_VERIFIED |  |
| legacy/dedicated | CanadaBuys Open Tenders CSV | 200 | 621 | 0 | PIPELINE_VERIFIED |  |
| legacy/dedicated | 中国政府采购网 | — | 0 | 0 | REGISTERED_NO_RUN_EVIDENCE |  |
| legacy/dedicated | 兴业银行集中采购管理平台 | — | 0 | 0 | REGISTERED_NO_RUN_EVIDENCE |  |
| legacy/dedicated | Open Contracting Data Registry｜Wales Sell2Wales | — | 0 | 0 | REGISTERED_NO_RUN_EVIDENCE |  |
| legacy/dedicated | TED 欧盟招标公告 | — | 0 | 0 | REGISTERED_NO_RUN_EVIDENCE |  |
| legacy/dedicated | World Bank Procurement Notice | — | 0 | 0 | REGISTERED_NO_RUN_EVIDENCE |  |
| legacy/dedicated | 广州阳光采购服务平台 | — | 0 | 0 | REGISTERED_NO_RUN_EVIDENCE |  |
| legacy/dedicated | 南方电网供应链统一服务平台 | — | 0 | 0 | REGISTERED_NO_RUN_EVIDENCE |  |
| legacy/dedicated | 广州市文化广电旅游局招标采购 | — | 0 | 0 | REGISTERED_NO_RUN_EVIDENCE |  |
| legacy/dedicated | UK Contracts Finder | — | 0 | 0 | REGISTERED_NO_RUN_EVIDENCE |  |
| CNAF | 国家艺术基金申报指南 | 200 | 6 | 0 | PIPELINE_VERIFIED |  |
| legacy/dedicated | EEN合作机会 | — | 0 | 0 | REGISTERED_NO_RUN_EVIDENCE |  |

### Procurement Regression

- READY_CORE registered: 11
- READY_CORE enabled: 2
- READY_CORE healthy/ACTIVE: 2
- procurement public: 0
- procurement hard gate failures: 0

### Existing Product Regression

- Competition unexplained loss: 未在本 V1.2 run 中伪造重算；历史证据保留 BASELINE_UNRECOVERABLE/UNKNOWN=26
- Memo parity: 通过（由 UI smoke 固化；当前 Memo 537 条）
- LOEWE preserved: 2
- source membership loss: 0（选择性移植未覆盖 main 的 Procurement control-plane）

### Generic Source Framework

- profile/interfaces: OpportunitySourceProfile（HTML/RSS/JSON + include/exclude + deadline evidence）
- source families proved via profile: On the Move, ArtConnect, CuratorSpace, ASEF Culture360, CNAF, Craft Scotland
- sources still needing dedicated adapter: crafts-council-opportunities, opencalls-ai, artshub-craft-opportunities, craft-council-nl-opportunities, chuangyisai-cultural, zjmtcn-product-competition, gtn9-competition, proc-cn-ccgp, proc-cn-cib, proc-global-ocp, proc-eu-ted, proc-wb, proc-cn-gzsun, proc-cn-csg, proc-cn-gz-wglj, proc-uk-contracts-finder

### Backlog

- crafts-council-opportunities：BLOCKED_OR_EMPTY；HTTP 403
- opencalls-ai：BLOCKED_OR_EMPTY；connect ECONNREFUSED 172.67.212.137:443
- artshub-craft-opportunities：BLOCKED_OR_EMPTY；HTTP 403
- craft-council-nl-opportunities：BLOCKED_OR_EMPTY；No RSS or HTML listing items recognized
- chuangyisai-cultural：BLOCKED_OR_EMPTY；No RSS or HTML listing items recognized
- zjmtcn-product-competition：BLOCKED_OR_EMPTY；No RSS or HTML listing items recognized
- gtn9-competition：BLOCKED_OR_EMPTY；HTTP 521
- proc-cn-ccgp：REGISTERED_NO_RUN_EVIDENCE；尚无本次运行证据
- proc-cn-cib：REGISTERED_NO_RUN_EVIDENCE；尚无本次运行证据
- proc-global-ocp：REGISTERED_NO_RUN_EVIDENCE；尚无本次运行证据
- proc-eu-ted：REGISTERED_NO_RUN_EVIDENCE；尚无本次运行证据
- proc-wb：REGISTERED_NO_RUN_EVIDENCE；尚无本次运行证据
- proc-cn-gzsun：REGISTERED_NO_RUN_EVIDENCE；尚无本次运行证据
- proc-cn-csg：REGISTERED_NO_RUN_EVIDENCE；尚无本次运行证据
- proc-cn-gz-wglj：REGISTERED_NO_RUN_EVIDENCE；尚无本次运行证据
- proc-uk-contracts-finder：REGISTERED_NO_RUN_EVIDENCE；尚无本次运行证据

### Business Conclusion

1. 现在真实能找到哪几类非比赛机会？六类 coverage（资助、展览、渠道、驻留研修、合作委托、认定孵化）均由同一工作台评估；空类型不补假数据。
2. 哪些来源贡献最大？以本次快照的来源运行与来源家族计数为准，详见上方 Source Activation 和 coverage.json。
3. 当前最值得用户研究的机会有哪些？以上 Top Actionable Opportunities 仅列 Current/Early，并保留原始来源链接、截止日期和待核验动作。
4. 哪些类型仍薄弱？没有稳定正文或行动证据的来源继续进入 backlog，不降级公共门禁换数量。
5. 下一轮最值得投入的是扩源、排序、提醒还是商业化？优先为已验证高价值来源补正文适配与持续证据，再考虑提醒；当前不以商业化或伪造覆盖数替代数据质量。
