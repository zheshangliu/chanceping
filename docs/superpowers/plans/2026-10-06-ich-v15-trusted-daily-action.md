# 盯非遗 V1.5 Trusted Daily Action Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不新增来源、不搭建账号系统的前提下，将盯非遗现有 V2 变成可验证的生产日常工作台：可信身份边界、单一受保护 Fetch→Translate→Audit cycle、当前机会中文优先、每周最多10条有证据的公开行动建议。

**Architecture:** 延用 Opportunity V2 pool、translation sidecar、DeepSeek provider、既有 `chanceping-opportunity-v2.timer` 与 SWAS Cloud Assistant。把现有 run 入口收敛为一个跨进程互斥的 server-local cycle：快照 runtime、抓取、对新鲜公开机会执行有界 DeepSeek 翻译、运行质量审计、写不含秘密的完成清单；GitHub 手动 workflow 只在服务器本机启动同一 systemd service。公开 weekly 页面复用 `buildWeeklyOpportunityActions()`，不新增评分；没有可信 session resolver 时私有 follow-up/inbox 继续 401。

**Tech Stack:** TypeScript、Node.js、Hono、Opportunity V2 JSON runtime、DeepSeek adapter、systemd oneshot/timer、GitHub Actions、SWAS Cloud Assistant。

**Spec:** `/Users/1sunflower/Downloads/ChancePing_ICH_V1_5_Trusted_Daily_Action_20261006.zip` 内 `MASTER_TASKBOOK.md`、`AUDIT_FINDINGS.md`、`fixtures/ACCEPTANCE_CASES.md`；用户签发任务书 `/Users/1sunflower/Downloads/盯非遗_V1.5_可信运营与每日行动闭环_目标任务书_20261006.md`。

## Global Constraints

- 不新增数据源；ArtConnect 固定为 `COMPLIANCE_HOLD`，未取得书面许可前不自动抓取或复制正文。
- 不接受客户端 header/query/body 中的 owner 身份；不临时建立账号、OAuth 或用户数据库。
- 无可信 server-side session resolver 时，私有 follow-up/inbox 必须 fail-closed；这不得阻塞 public weekly actions 或 production refresh。
- 生产周期只能由 server-local runner 访问 runtime 和 DeepSeek；不得经公网传 `CHANCEPING_ICH_ADMIN_TOKEN`，不得将 secret 写入 stdout、manifest 或 artifacts。
- 延用现有72小时 Opportunity V2 timer，不创建第二个 fetch timer；并发周期不得同时写 runtime。
- 翻译只使用 DeepSeek；优先当前、临近开放/截止、可行动采购与 weekly shortlist；不清空成功缓存，不把中文原生标题纳入外文分母，不隐藏英文机会伪造覆盖率。
- 无法安全验证的 deadline、资格、金额、许可状态必须明确待核；过期、取消、卖方供货、结果页及不合规来源不能进入 weekly actions。
- G4 仅从 reconciliation 后的 `main` / immutable release 发布；任何硬 Gate 不通过时停止在发布前，不以通用 smoke 替代真实业务验收。

## Review Focus

- 客户端伪造 header、query、body 不能触发私有 store 读取或写入；测试实际 Hono app 路由及存储副作用。
- 同一 cycle 的 systemd 与手动触发不得重叠；进程异常留下 lock 时只能在确认 owner 已退出后恢复。
- Fetch 部分成功后翻译失败应保留安全抓取的数据并生成 `DEGRADED` 清单；灾难性失败不得覆盖有效 pool。
- Weekly 必须先应用 hard blockers；冲突日期不能参与精确排期，隐藏金额不得以0展示，聚合来源须标官方条件待核。
- 翻译预算遍历整个待处理集合并先处理 P0；缓存可复用项不得产生模型调用，失败项必须有稳定分类/冷却状态。

---

### Task 1: G0 主线谱系与身份安全

**Files:**
- Create: `audits/ich/v15/lineage.json`
- Modify: `src/api/app.ts`, `src/api/routes/procurement-workbench.ts` only if actual app-path tests expose an identity gap
- Test: `scripts/verify-ich-v15-identity.ts`
- Modify: `package.json` (register focused verifier)

**Interfaces:**
- Consumes: live `origin/main`, PR #13 head, production release evidence/runtime path record.
- Produces: complete lineage snapshot and a real-app assertion that all private reads/writes require a server-resolved identity; public weekly route remains unauthenticated.

- [x] Record exact main/candidate/production SHAs, merge-base, production-only/candidate-only commit/file sets, runtime paths, and four selectively preserved V1.3 production fixes.
- [x] Add integration fixture covering anonymous, forged `x-business-user`, query owner, body owner, no resolver, and unchanged private-store hash.
- [x] Run the fixture against production commit `0174f78`: RED (forged header private GET returned 200); run against candidate: GREEN (private reads/writes 401, store unchanged, public weekly 200). Candidate's V1.4 fix required no additional business-code change.
- [x] Run `npm run typecheck`, `npm run verify:ich:v15:identity`, and existing `scripts/verify-procurement-workbench.ts` regression.
- [ ] Commit the G0 audit/security unit.

### Task 2: G1 protected production cycle

**Files:**
- Modify: `src/opportunity-v2/file-lock.ts`, `scripts/run-opportunity-v2.ts`, `scripts/run-opportunity-v2-display.ts`, `src/opportunity-v2/translation-targets.ts`, `src/opportunity-v2/translation-queue.ts`
- Create: `scripts/run-ich-production-cycle.ts`, `scripts/verify-ich-v15-cycle.ts`, `.github/workflows/run-ich-production-cycle.yml`
- Modify/reuse: `scripts/invoke-aliyun-swas-deploy.cjs` for a fixed allowlisted cycle operation; existing systemd service/timer only if read-only inspection proves the service entry must change. Never create a second timer.
- Add or update: `docs/deployment/chanceping-opportunity-v2.service` only if it matches the installed unit contract.
- Modify: `package.json`

**Interfaces:**
- Consumes: `runOpportunityV2()` fetch pipeline, translation target/queue/provider APIs, persistent runtime path resolvers, existing SWAS secrets and `chanceping-opportunity-v2.timer`.
- Produces: one `runIchProductionCycle()` result with run ID, fetch counts, translation counts/provider, quality gate, timestamps and release commit; sanitized persistent manifest; local service invocation without HTTP admin token.

- [ ] Write fixtures for async lock exclusion, full-fetch → bounded-DeepSeek → audit order, no secret in output, partial-fetch/degraded translation, and catastrophic-failure pool preservation; observe expected RED.
- [ ] Implement the smallest shared runner; snapshot configured runtime files before writes and retain only a bounded number of snapshots/manifests.
- [ ] Keep data after a successful/partial fetch if translation fails; report `DEGRADED` rather than restoring safe fetched records.
- [ ] Bind the existing 72h service to the combined runner and make manual SWAS workflow start that exact service. Do not expose token through the public API.
- [ ] Verify two concurrent invocations never overlap, next run is explainable, >78h without success is `STALE`, and last completed run has a sanitized manifest.
- [ ] Run cycle unit/integration tests and typecheck; commit G1.

### Task 3: G2 trusted content and current-first Chinese

**Files:**
- Modify: `src/opportunity-v2/translation-targets.ts`, `src/opportunity-v2/translation-queue.ts`, `scripts/run-opportunity-v2-display.ts`, `src/opportunity-v2/source-governance.ts`, `src/opportunity-v2/source-overview.ts`
- Create: `scripts/run-ich-v15-quality-audit.ts`, `scripts/verify-ich-v15-translation-slo.ts`
- Create/update: `audits/ich/v15/source-governance.json` or a compact latest summary generated from reviewed evidence
- Modify: `package.json`

**Interfaces:**
- Consumes: public opportunity pool, source-health/runtime evidence, reusable translation cache, weekly action IDs.
- Produces: P0/P1/P2 queue and counters; failure categories (`PROVIDER_UNAVAILABLE`, `QUALITY_REJECTED`, `SOURCE_TEXT_BROKEN`, `INSUFFICIENT_EVIDENCE`, `COOLING`, `NON_RETRYABLE`); source freshness/governance labels and canonical evidence state.

- [ ] Add tests for current/closing/opening/actionable/weekly P0 ordering, historical P2, reusable translation=0 calls, translation title success with empty summary, and stable failure disposition; observe RED.
- [ ] Implement priority before provider selection so queue traversal does not starve the tail; cap existing budgets and DeepSeek-only provider selection.
- [ ] Test source health `STALE` at 78h+, `NEVER_SUCCEEDED`, ArtConnect hold, and `NOT_REVIEWED` metadata-only output.
- [ ] Compute Chinese SLO separately by public surface and foreign-title denominator; report explicit unresolved failures without hiding English rows.
- [ ] Preserve original discovery source vs canonical evidence and label aggregator-only conditions as pending verification.
- [ ] Run translation, source-governance, encoding, deadline, memo-parity and procurement regression; commit G2.

### Task 4: G3 public weekly actions

**Files:**
- Modify: `src/opportunity-v2/procurement-workbench.ts`, `src/api/routes/procurement-workbench-pages.ts`, `src/api/app.ts`
- Create: `scripts/verify-ich-v15-weekly-actions.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `buildWeeklyOpportunityActions()` and public-safe item/source/evidence/translation/freshness data.
- Produces: `/ich/weekly` plus a visible homepage/workbench entry; no more than 10 deterministic public actions and no private-profile fields.

- [ ] Add fixture assertions for expired, cancelled, explicit ineligible, unsafe deadline, seller offer, result-only, ArtConnect-only evidence, four-item lists, >10 lists, unknown money, aggregation-only evidence, and official-detail canonical evidence; observe RED.
- [ ] Add only publicly evidenced `fee/prize/funding`, eligibility status, risk/gap, source/evidence and freshness; preserve “待核” labels where unknown.
- [ ] Add localized title display and action route; verify zero-to-ten actual results without padding or score changes.
- [ ] Run browser/API interaction check, desktop/mobile screenshot and width/click tests; commit G3.

### Task 5: G4 PR reconciliation, release and production acceptance

**Files:**
- Prune: duplicate `audits/ich/v14/20261005T*` snapshots and redundant screenshots, preserving `audits/ich/v14/latest/` or a complete compact summary and necessary screenshot index.
- Create/update: `audits/ich/v15/lineage.json`, `audits/ich/v15/latest/`, `audits/ich/ui/latest/`, `reports/ich/v15/FINAL_DELIVERY.md`
- Update existing PR #13; do not create another candidate PR.

- [ ] Run focused G0–G3 suite and merge gates: `npm run typecheck`, `npm run verify:all`, `npm run verify:v15:e2e`, `npm run verify:v16`, plus protected-cycle/identity/weekly/SLO/source/memo/procurement tests.
- [ ] Re-run main/candidate diff and confirm procurement release control, current production fixes, V1.4 security/governance and V1.5 behavior are all retained; keep PR slim.
- [ ] Promote the existing PR through normal branch protection; never bypass required approval/status checks.
- [ ] Deploy only the reconciled `main` immutable commit via the governed production workflow; record backup, release, rollback target.
- [ ] Run one real server-local Fetch → DeepSeek Translate → Audit cycle and verify the same 72h service, public smoke, Chinese SLO, source freshness, weekly actions, procurement, competitions, Memo, LOEWE, encoding, deadline safety, and forged-identity 401.
- [ ] If any core safety/business release gate fails, use the governed rollback and report the exact failing evidence; do not roll back merely because private auth remains unavailable.
- [ ] Save audit artifacts and final report. Report actual production flow, not only static tests or readiness.
