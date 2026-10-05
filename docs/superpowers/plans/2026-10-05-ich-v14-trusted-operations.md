# 盯非遗 V1.4 Trusted Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不替换现有雷达、来源池、翻译和发布系统的前提下，建立可审计的中文增量运行、来源许可/事实可信边界及受保护的跟进行动闭环，并以真实生产证据验收。

**Architecture:** 以执行时 `origin/main` 为集成基线，先选择性带入生产已验证的 V1.3 中文/移动修复；延用 V2 runtime、翻译 sidecar、72h scheduler、workbench 和受保护发布通道。生产作业必须使用已授权的服务器运行身份；没有合法入口时，生产操作保持 ACCESS_BLOCKED，继续完成可离线验证的代码和影子流程，不创建旁路权限。

**Tech Stack:** 现有 TypeScript、Node.js、Hono、文件型 runtime、DeepSeek provider、GitHub Actions / Alibaba Cloud SWAS 受保护部署流程。

**Spec:** `/Users/1sunflower/Downloads/ChancePing_V1_4_Trusted_Operations_20261005/MASTER_TASKBOOK.md`，并遵守同包 `OPERATING_LIMITS.md`、`evidence/QUALITY_REVIEW.md` 和 `tests/acceptance_cases.json`。

## Global Constraints

- 连续执行 M0→M1→M2→M3→M4；生产接口或身份未获授权时，不绕过认证，不伪称生产完成。
- 保留现有 V1.3 中文/缓存/失败分类、OpportunityV2、72h 调度、采购工作台、公开 Memo、来源配置和视觉成果。
- 翻译仅使用 DeepSeek；预算最多200条唯一记录、250次请求（含重试）、并发不超过2、每项最多2次、单次超时30秒。
- ArtConnect 未发现书面自动化/系统提取/再发布许可前，状态按 COMPLIANCE_HOLD 处理；保留 source identity 和历史，不新增复制。
- 公开机会与私有备注、关注和跟进严格隔离；不以客户端提供的 user ID/header 作为认证，不把服务密钥写入浏览器。
- 不新增机会类别/来源家族，除非任务书规定的合规替代且不超过2个官方/获授权来源家族；不改 DNS，不自动报名、投标、付款或外联。
- 发布必须经保护分支和现有生产流程；不直接改 `main`，不整体合并旧 `rescue`，不强推。
- 仅以真实业务 ID、真实生产路径、实际截图和分阶段运行记录作为生产交付证据；通用 smoke 或影子结果不可替代。

## Review Focus

- 译文排队先截断导致缓存占位、队尾永久饿死；测试缓存前200条与队尾待译记录。
- 并发 provider 重试越过累计请求预算；测试原子额度预占及失败释放/计费语义。
- 旧 hash/失败/空结果覆盖成功译文；测试源正文变化、人工校订和迟到响应。
- ArtConnect 技术可读但授权未知；测试许可状态与抓取/公开复制隔离，且不删除历史。
- 私有跟进可用客户端 header 冒充身份；测试匿名、伪造身份、授权读取/写入与公开导出脱敏。

---

### Task 1: M0 基线与生产修复承接

**Files:**
- Create: `audits/ich/v14/<run_id>/baseline.json`
- Create: `audits/ich/v14/<run_id>/capability-inventory.json`
- Create: `audits/ich/v14/<run_id>/runtime-contract.json`
- Create: `audits/ich/v14/<run_id>/permissions-readiness.json`
- Create: `audits/ich/v14/<run_id>/translation-failures.json`
- Modify/carry selectively: V1.3 production-only translation, display and mobile fixes from the verified `7a4fd7f` / `0174f78` lineage; never transplant unrelated branches wholesale.
- Test: existing V1.3 translation/display/mobile verification scripts.

**Interfaces:**
- Consumes: production read-only API results; runtime paths from deployed source; GitHub production release SHA and `origin/main` SHA.
- Produces: exact baseline timestamp, source/pool/page IDs, translation coverage counts, production-vs-main commit/diff inventory, and an explicit `ACCESS_BLOCKED` or verified authorized run path.

- [ ] Capture read-only production version, overview, all-page visible ID sets, memo parity, known translation states and next scheduled time; never write production.
- [ ] Record the 403 response code and separately test/document unconfigured-token behavior in local fixture; do not infer configuration from 403.
- [ ] Inspect the deployed CLI/runtime path and locate an authorized server-side run entry; if none exists, record one consolidated blocker and keep production work disabled.
- [ ] Selectively transplant only verified production Chinese/mobile fixes to the clean feature branch and run their focused checks.
- [ ] Record whether the historical 477-ID translation baseline is recoverable; do not invent IDs.
- [ ] Run `npm run typecheck`, `npm run verify:opportunity:v13:display`, `npm run verify:opportunity:v13:closeout`, and `npm run verify:opportunity:v13:artconnect-mobile` where present.
- [ ] Commit the M0 baseline and compatibility fixes.

### Task 2: M1 Bounded incremental Chinese operation

**Files:**
- Modify: `scripts/run-opportunity-v2-display.ts`, `src/opportunity-v2/display.ts`, translation provider/recovery modules as required.
- Create/modify: focused `scripts/verify-*` fixture for queue fairness, budget, stale hashes, manual edits, failure classes, summary independence, amount/currency and untrusted source text.
- Create: `audits/ich/v14/<run_id>/translation-run.json` and `reports/ich/v14/OPERATIONS_RUNBOOK.md`.

**Interfaces:**
- Consumes: M0 production baseline and authorized path status; existing translation sidecar and provider contracts.
- Produces: dry-run queue selection before provider calls; bounded run summary with unique IDs, attempts, cache/revalidation outcomes, failures, provider, token/cost evidence where actually available, and exact runtime path/hash.

- [ ] Add a failing fixture with 200 cached records ahead of a translatable queue-tail item and assert the tail is selected without re-calling cached rows.
- [ ] Add tests for request-budget reservation across concurrent calls/retries and maximum two attempts per record.
- [ ] Add tests proving stale-hash completions, failed/empty results and low-quality output cannot overwrite current or human-edited translations.
- [ ] Add quality fixtures for proper nouns, untranslated English with appended Chinese, title-success/summary-failure, ambiguous `$`, staged fees, and malicious source instructions.
- [ ] Implement the smallest changes in existing queue/cache/provider modules; keep DeepSeek as the only provider and the task limits unchanged.
- [ ] Run focused fixtures and V1.3 display verification; record whether production translation remains blocked or was genuinely performed.
- [ ] Commit M1 independently.

### Task 3: M2 Source permissions, freshness and evidence trust

**Files:**
- Modify: existing OpportunityV2 source types/registry, source overview, evidence/deadline presentation, source status helpers, and audit scripts only where required.
- Create/modify: focused source permission, empty-result, stale-age, deadline-kind, official-evidence and canonical-group fixtures.
- Create: `audits/ich/v14/<run_id>/source-governance.json`, `source-contribution-matrix.json`, `evidence-quality.json`.

**Interfaces:**
- Consumes: M0 source identities and real per-source last-success/item counts.
- Produces: separate permission state, last fetch success, last verified content, partial/cursor state, publishable contribution and `STALE` after 72h+6h without successful read; no guessed global eligibility or exact timezone.

- [ ] Add failing tests distinguishing zero-result success from parser failure and scheduler-active from source-fresh.
- [ ] Audit each registered source family by opportunity type using distinct IDs; avoid summing multi-tag groups as unique counts.
- [ ] Check written ArtConnect authorization evidence without copying sensitive terms; absent proof must be represented as `COMPLIANCE_HOLD`, not technical failure.
- [ ] Add fail-closed effective-source handling for unlicensed automated collection/public copying while retaining source identity, historical records and follow-up links.
- [ ] Verify official evidence and application deadline semantics; conflicts become date-unknown and never feed precise reminder/sort outputs.
- [ ] Run existing source, deadline, encoding, procurement and coverage regressions; commit M2.

### Task 4: M3 Protected follow-up and semantic changes

**Files:**
- Modify: `src/api/routes/procurement-workbench.ts`, associated page route/renderers, `src/opportunity-v2/procurement-followup-store.ts`, `procurement-change-feed.ts`, and existing follow-up/coverage verification scripts.
- Create: focused authorization, persistence, idempotency, notification-to-do and export privacy fixtures.
- Create: `audits/ich/v14/<run_id>/workflow-acceptance.json` and user-flow screenshots.

**Interfaces:**
- Consumes: M0 inventory of actual application authentication and existing workbench/storage.
- Produces: follow-up records keyed only by authenticated server-side identity; idempotent semantic change events with old/new values and evidence; internal due-task and important-change summary; public exports with no private fields.

- [ ] Add red tests showing anonymous and forged `x-business-user` cannot list/read/write notes or exports; identity cannot come from query/body/header supplied by an untrusted client.
- [ ] Add red tests preserving status/note/date when title/hash/canonical grouping changes.
- [ ] Add red tests that `last_seen`, translation wording or reordering alone creates no change event, while one verified deadline correction creates exactly one sourced event across repeated processing.
- [ ] Implement only against an existing verified server identity. If the codebase has no such identity, fail closed and record the smallest required auth blocker; do not create a client-token workaround or expose a shared token in browser JS.
- [ ] Provide at most ten deterministic current/early tasks; allow fewer and preserve qualification/deadline conflict gates.
- [ ] Exercise discovery→evidence review→follow-up→refresh→change/task flow with isolated synthetic records, clearly labeled synthetic.
- [ ] Commit M3 independently.

### Task 5: M4 End-to-end business acceptance and controlled release

**Files:**
- Create: `reports/ich/v14/FINAL_DELIVERY.md`, `reports/ich/v14/BACKLOG.md`, `audits/ich/v14/<run_id>/manifest.json`, business checks, desktop/mobile screenshots.
- Modify only when required: existing protected release workflow/runbook, with no parallel deployment system.

**Interfaces:**
- Consumes: completed M0–M3 artifacts and the exact protected production commit/ref.
- Produces: production business checks for all specified routes/IDs, same-data parity, authenticated follow-up flow, cost/request ledger, release/rollback evidence and observation close conditions.

- [ ] Run `npm run typecheck`, `npm run verify:v15:e2e`, `npm run verify:all`, and available V1.3/Procurement/Memo/encoding/deadline tests; record each command/result.
- [ ] Capture actual 360/390/430px and 200% zoom screenshots; inspect visible Hero/card clipping, not only document overflow.
- [ ] Verify live competition, overseas, procurement, aggregate opportunities, detail, Memo/API/export and protected follow-up routes with real IDs and redaction checks.
- [ ] Re-check exact current `origin/main`, PR status and protected deployment eligibility. Never deploy a feature SHA that bypasses protected main.
- [ ] If authorized runtime execution, PR approval, protected merge or production approval is missing, stop only that external action and report the consolidated permission request; do not call shadow output production success.
- [ ] If production release is authorized and all business gates pass, publish through the established protected workflow, back up touched runtime files first, verify rollback integrity, and set status `DELIVERED_OBSERVING` until seven days/two real scheduled runs are evidenced.
- [ ] Complete final report and whole-branch review; commit and push only the scoped branch/artifacts. No direct main write or force push.
