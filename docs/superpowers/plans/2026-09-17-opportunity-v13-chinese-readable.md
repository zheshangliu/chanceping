# ChancePing V1.3 Chinese Readable Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 让现有 ChancePing 机会列表在生产刷新后默认可用中文快速阅读，同时保留原文、结构化事实与既有页面功能。

**Architecture:** 复用现有 OpportunityV2 display projection、DeepSeek provider、translation cache 和 Hono 页面路由。新增的清洗与紧凑显示规则放在共享 display/文本工具中，由 /ich、海外筛选、/ich/opportunities、Memo 和详情统一消费；不改原始 OpportunityV2 字段，也不新增来源、类别、评分或发布框架。

**Tech Stack:** TypeScript、Node.js、Hono、现有 DeepSeek adapter、现有 JSON cache、Puppeteer UI smoke。

**Spec:** /tmp/chanceping-v13-package.VoqyLz/ChancePing_V1_3_Chinese_Readable_20260917/MASTER_TASKBOOK.md、UI_SPEC.md、TRANSLATION_SPEC.md、ACCEPTANCE.md。

## Global Constraints

- 不新增数据源、机会类别、CRM、推荐或并行翻译系统。
- 不改 canonical title、ID、deadline、金额、币种、资格和原始证据。
- 不把英文原文、机构简介、导航、浏览量、广告或 HTML entity 当作项目摘要。
- 标题翻译成功即可显示中文；摘要没有可靠项目正文时省略。
- deadline/status/金额/资格由程序结构化投影，翻译不能决定这些字段；冲突显示待核。
- 只使用现有 DeepSeek provider 与持久化翻译缓存；严格有界批次，不执行 --all 历史翻译。
- 生产发布只能使用既有 GitHub Actions/SWAS 流程；先备份、再有界刷新、再真实 HTTP/UI/数据验收。

### Task 1: Baseline and shared display contract

**Files:**
- Inspect: src/opportunity-v2/display.ts, src/opportunity-v2/translation-provider.ts, scripts/run-opportunity-v2-display.ts, src/api/routes/ich-pages.ts, src/api/routes/opportunity-v2.ts.
- Create: scripts/verify-opportunity-v13-display.ts.
- Modify: package.json.

**Interfaces:**
- Tests exercise shared buildOpportunityV2Display, text cleaning, foreign-language detection, cache key reuse, and provider configuration without contacting a live model.
- The display projection must expose a usable title independently of summary availability and a nullable summary for card rendering.

- [ ] Step 1: Add failing fixture assertions for T01/T02/T03/T05/T06/T07/T08/T09/T10/T18/T21/T24/T25/T30/T31.
- [ ] Step 2: Run npm run verify:opportunity:v13:display and confirm failure is caused by the current title+summary coupling and noisy summary fallback.
- [ ] Step 3: Implement only the shared display contract and test-only fixture loader; do not call DeepSeek.
- [ ] Step 4: Re-run the focused command and confirm all focused assertions pass.

### Task 2: Clean project text and translation/cache behavior

**Files:**
- Modify: src/opportunity-v2/display.ts.
- Modify: src/opportunity-v2/translation-provider.ts.
- Modify: scripts/run-opportunity-v2-display.ts.
- Test: scripts/verify-opportunity-v13-display.ts.

**Interfaces:**
- cleanOpportunityDisplayText(value: string): string removes decoded navigation/statistics/entity noise while preserving project facts.
- buildOpportunityV2Display returns a translated title when title_zh is valid even if summary_zh is empty; summary is empty when evidence is insufficient.
- Translation input uses cleaned project text; cache matching continues to use stable opportunity identity plus source-content hash, language, strategy and model/provider version.

- [ ] Step 1: Add red assertions for source-page boilerplate, entities, organization bio, empty-summary template, negative conditions, and mixed-language titles.
- [ ] Step 2: Run the focused test and record the expected failures.
- [ ] Step 3: Add bounded cleaning and independent title/summary validation; keep original text only for details.
- [ ] Step 4: Update the DeepSeek prompt to cover all current opportunity categories without allowing it to edit structured facts.
- [ ] Step 5: Make the display runner select current/early records from main, overseas, combined and Memo-visible sets, deduplicate by ID, reuse valid cache entries, and report pending/failed/reused counts.
- [ ] Step 6: Run focused tests, typecheck and the existing translation regression.

### Task 3: Compact shared card rendering

**Files:**
- Modify: src/api/routes/ich-pages.ts.
- Modify: any existing shared public serializer only if required to carry display-only fields without changing canonical fields.
- Test: scripts/verify-opportunity-v13-display.ts and existing page/UI verifiers.

**Interfaces:**
- Main /ich, /ich?region=overseas, /ich/opportunities, Memo and detail pages consume the same display projection.
- Card title is escaped and visually clamped to two lines; summary is omitted when empty/noisy and otherwise clamped to one line; detail retains original title/summary and source URL.
- Deadline conflict/unsafe projection remains “截止时间待核实”; no translated text can change date/status.

- [ ] Step 1: Add page assertions for no navigation markers, view counts, raw HTML entities, boilerplate fallback sentence, and at most one compact summary block per card.
- [ ] Step 2: Run focused page assertions against the pre-change renderer and confirm red failures from the screenshot-shaped fixture.
- [ ] Step 3: Render the compact card using shared display fields, safe escaping, concise Chinese labels, and optional summary.
- [ ] Step 4: Preserve search, filters, pagination, details, follow-up actions, source links and keyboard-visible focus.
- [ ] Step 5: Verify the same item’s detail contains full source-linked evidence while the card remains compact.

### Task 4: Local refresh, audit and visual evidence

**Files:**
- Modify: scripts/run-opportunity-v2-display.ts only for the bounded runner behavior from Task 2.
- Create/refresh: audits/ich/v13/latest/ and reports/ich/v13/.
- Create/refresh: desktop/mobile before/after screenshots outside tracked business data if the existing screenshot harness supports it.

**Interfaces:**
- The run report separates environment, runtime paths, source registry counts, fetch run ID, translation provider/model status, cache reuse, failures and unprocessed items.
- Synthetic fixtures never count as live opportunities; local runtime results never count as production results.

- [ ] Step 1: Run a 10-item mixed canary with the configured DeepSeek provider only if local configuration is available; otherwise record credential/provider blocker without substituting another provider.
- [ ] Step 2: Run the allowed bounded display refresh and persist only the shared translation cache path.
- [ ] Step 3: Capture /ich, overseas, /ich/opportunities and Memo at 1440×900, 390×844 and 375×812; inspect 320px overflow and keyboard focus.
- [ ] Step 4: Generate production-readiness and display audit artifacts with real timestamps and counts.
- [ ] Step 5: Run npm run typecheck, npm run verify:all and all V1.3 focused/page/translation checks.

### Task 5: Controlled release and production refresh

**Files:**
- Inspect only: .github/workflows/deploy-production.yml, scripts/deploy-release.sh, scripts/verify-deploy-release.sh, docs/deployment/aliyun-mvp-runbook.md.

**Interfaces:**
- Publish the reviewed feature branch through the existing PR/CI flow; do not change DNS, source registry, procurement rollout or deployment architecture.
- Production refresh is one bounded run using the existing runtime paths and lock; DeepSeek translation is incremental and cache-aware.

- [ ] Step 1: Verify clean tracked worktree, exact branch, changed-file allowlist, required regression gates and release helper integrity.
- [ ] Step 2: Push the reviewed branch, open/reuse a PR against main, and wait for CI.
- [ ] Step 3: After CI passes, deploy through the existing production workflow with backup and rollback release recorded.
- [ ] Step 4: Execute one bounded production V2 refresh for already enabled/verified sources; do not copy the local pool over production.
- [ ] Step 5: Run incremental DeepSeek display translation with provider/model, request, cache reuse, failed and pending counts recorded without printing secrets.
- [ ] Step 6: Verify production HTTP, page/UI behavior, cache path, source health and existing competition/procurement/Memo regressions.
- [ ] Step 7: If a hard safety or availability gate fails, stop and use the existing release rollback; otherwise keep the release and report remaining backlog honestly.

## Verification checklist

- [ ] V1.3 focused synthetic display/cleaning/cache tests pass.
- [ ] npm run typecheck passes.
- [ ] npm run verify:all passes.
- [ ] Existing V1.5/V1.6, Competition, Memo, Procurement and unsafe-deadline regressions pass.
- [ ] Production pages are read-only at request time and do not call DeepSeek synchronously.
- [ ] Production refresh and translation evidence are separated from local fixture/run evidence.
- [ ] Final report follows templates/FINAL_DELIVERY.md and includes online URL, screenshots, real refresh counts, Chinese coverage, provider/cache usage, failures and backlog.
