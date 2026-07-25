# 非遗机会雷达数据源扩展与80条机会扩充实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with verification checkpoints.

**Goal:** 建立可审计的数据源网络，将当前有效非遗机会扩充并稳定保持在至少80条。

**Architecture:** 保留现有 `IchOpportunity`、校验、去重、状态和原子写入边界；新增来源注册表、来源发现候选层和配额审计层。自动发现只生成候选，只有来源可访问、字段通过校验且去重成功的记录才允许 `--write` 发布。

**Tech Stack:** TypeScript、tsx、JSON、Hono SSR、现有 `src/ich` 校验/状态/去重模块、现有阶段5脚本。

## Global Constraints

- 当前有效公开机会必须 `>=80` 条。
- 六类最低配额：competition 18、exhibition_market 14、procurement_project 14、channel_collaboration 10、policy_funding 10、international 14。
- L1 不少于48条，L1/L2 合计不少于68条，L3 不超过12条。
- 不复制、改标题、虚构来源、延长截止日期或把历史机会伪装为当前机会。
- 不修改 AI Events、Business Radar、Welfare Radar。
- 不输出密钥，不自动提交、推送或部署；数据发布与代码发布分离。

### Task 1: 建立当前数据与配额审计

**Files:**
- Create: `scripts/audit-ich-80-target.ts`
- Test: `scripts/verify-ich-stage5.ts`（扩展配额断言）

- [ ] 读取 `src/ich/opportunities.verified.json`，按当前状态、六类、地区、来源等级输出 JSON 摘要。
- [ ] 将“当前有效”定义固定为 `is_published=true`、workflow published、状态 active/closing_soon/long_term、来源可访问且无冲突。
- [ ] 输出距离80条、各类缺口、地理缺口、L1/L2/L3缺口。
- [ ] 用现有阶段5夹具运行并确认审计不会写入数据。

### Task 2: 建立来源注册表

**Files:**
- Create: `src/ich/source-registry.json`
- Create: `src/ich/source-registry.ts`
- Test: `scripts/verify-ich-source-registry.ts`

- [ ] 登记至少100个来源入口，字段包含 `source_id`、`official_url`、`source_type`、`covered_categories`、`scan_frequency`、`adapter_type`、`auto_detect_suitability`、`active`。
- [ ] 将任务书中的国家/省市机构、采购平台、博物馆、行业组织、国际组织全部标记为 `UNCONFIRMED`，逐条只在 URL 可访问后提升为 active。
- [ ] 禁止把来源入口等级直接继承给机会记录；机会记录仍按具体页面评定 L1/L2/L3。

### Task 3: 扩展候选发现层

**Files:**
- Modify: `scripts/build-ich-stage5-candidates.ts`
- Create: `scripts/discover-ich-source-candidates.ts`
- Create: `src/ich/source-discovery.ts`

- [ ] 从来源注册表生成待检查来源清单和关键词任务，不绕过 robots、登录或访问限制。
- [ ] 发现结果只写入 `data/ich/source-candidates.json`，不触碰正式机会库。
- [ ] 每条候选保留来源 URL、发现时间、来源注册 ID、原始标题和发现等级。
- [ ] 对搜索结果、转载、结果公告和过期页面先进入 screened-out ledger。

### Task 4: 形成第一批真实机会数据

**Files:**
- Create: `data/ich/expansion-batch-01.json`
- Modify: `src/ich/source-registry.json`

- [ ] 优先补齐六类最低配额中缺口最大的类别。
- [ ] 第一批至少新增20条，所有记录逐条绑定官方来源 URL、截止依据、主办方和状态依据。
- [ ] 运行 dry-run，确认 invalid=0、duplicate=0 或每个重复均有 ledger 解释。
- [ ] 人工抽查至少10条，其中至少2条 L3 线索不得自动发布。

### Task 5: 分批导入并达到80条

**Files:**
- Create: `data/ich/expansion-batch-02.json`
- Create: `data/ich/expansion-batch-03.json`
- Modify: `src/ich/opportunities.verified.json`（仅通过 `--write` 原子导入）

- [ ] 第二批扩充到至少60条当前有效机会。
- [ ] 第三批扩充到至少80条，并将稳定运营目标设为90条。
- [ ] 每批导入前运行审计、dry-run、去重和状态计算；失败时不写入。
- [ ] 导入后生成备份和批次 ledger。

### Task 6: 更新自动化为缺口驱动

**Files:**
- Modify: 自动化 prompt（Codex automation）
- Modify: `scripts/verify-ich-stage5.ts`

- [ ] 每3天先执行审计，再发现候选，再 dry-run，再对合格记录写入。
- [ ] 当前有效少于80条时输出红色缺口报告并按类别列出缺口。
- [ ] 当前有效80—89条输出黄色预警，>=90条输出正常。
- [ ] 自动化不得提交代码、推送、部署或修改环境变量。

### Task 7: SEO、页面和回归验收

**Files:**
- Modify: `scripts/verify-ich-stage4-seo.ts`
- Modify: `scripts/verify-ich-stage2.ts`

- [ ] 验证首页、详情、搜索、六类筛选、分页、history、sitemap 和 robots。
- [ ] 验证机会标题、官方来源和当前状态出现在初始 HTML。
- [ ] 运行 `npm run typecheck`、`npm run verify:all`。
- [ ] 线上只读验收公开数量、分页总数和 sitemap URL 数量。

### Task 8: 发布与回滚

- [ ] 数据文件先通过备份和校验，再单独发布数据批次。
- [ ] 代码变更使用 `rescue/mvp-codex`，不直接修改 main。
- [ ] 任何批次导致当前有效数下降、重复率异常或来源等级不达标，立即恢复上一份正式数据备份。
