# Chat-First Radar MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the approved chat-first radar design into a staged MVP where users describe a need in chat, confirm one reusable radar profile, run a real radar pass, receive ranked opportunity cards and Markdown, then save and rerun the long-term radar.

**Architecture:** Keep the existing Hono API, plain JavaScript frontend, JSON stores, `RadarRequirementSpec`, `RadarRun`, `OpportunityStore`, and `ReportStore`. Add thin contract and orchestration layers around the current code: profile summary generation, chat-first state handling, run audit metadata, assessment fields, and stronger browser/API verification. Do not create a new app shell or a full source-management backend in this MVP.

**Tech Stack:** TypeScript, Hono, plain browser JavaScript, local JSON stores, existing search providers, existing LLM adapters, `tsx`, `tsc`, Puppeteer smoke test.

---

## Scope Guard

This plan implements the approved MVP core loop only:

```text
chat input or file text
→ natural clarification when needed
→ radar profile summary
→ user confirmation
→ search run
→ raw/run audit metadata
→ ranked opportunity cards
→ Markdown report
→ save as long-term radar
→ rerun from My Radar
```

Do not implement in this plan:

- V1.7 source transparency management UI.
- V1.7 feedback tuning.
- Radar market.
- Team collaboration.
- Paid system.
- Production Aliyun changes.
- Full source admin, source health dashboard, RSS subscription, scheduler expansion.
- CRM, outreach automation, auto signup, captcha/login automation.
- A large UI redesign beyond the chat-first MVP surfaces.
- `verify-live-mvp` or live API tests inside `verify:all`.

Local secrets rule:

- `api.env` stays local only.
- Do not commit `api.env`.
- Do not load `api.env` by default in production.
- Do not print API keys in logs, reports, screenshots, or test output.

Branch rule:

- Work on `rescue/mvp-codex` or a `codex/...` child branch.
- Do not modify `main` directly.

## Files Overview

- Create: `src/schema/radar-mvp-contracts.ts`  
  Shared MVP-only logical contracts for profile summary, profile revision metadata, project readiness snapshot, run audit, source coverage status, opportunity assessment, and report artifact references.
- Modify: `src/schema/radar-requirement-spec.ts`  
  Add optional profile metadata fields in a backward-compatible way: `primary_subject`, `profile_version`, `risk_policy`, `report_blueprint`, and `scoring_policy`.
- Create: `src/agents/radar-profile-summary.ts`  
  Convert a `RadarRequirementSpec` into the customer-visible profile summary.
- Modify: `src/agents/radar-generator.ts`  
  Return `requirementConfidence`, `questionsToConfirm`, and `profileSummary` alongside the existing spec and suggested name.
- Modify: `src/api/types.ts`  
  Extend `RadarGenerateResponseData`, `RadarRunResult`, and report input typing without removing existing fields.
- Modify: `src/api/routes/radars.ts`  
  Return the expanded generation payload; stop treating `custom` as `ai_competition` for logical kind where possible; attach run audit metadata to manual runs.
- Modify: `src/search/orchestrator.ts`  
  Return real query execution metadata, source coverage statuses, and raw candidate counts using existing provider calls and source hints.
- Modify: `src/search/types.ts`  
  Add optional raw candidate and run audit fields that do not break existing search providers.
- Modify: `src/search/opportunity-scorer.ts`  
  Add MVP assessment metadata: opportunity kind, evidence status, action status, score basis, and grade thresholds.
- Modify: `src/search/opportunity-card-mapper.ts`  
  Map assessment metadata into optional `OpportunityCard` fields for display and reporting.
- Modify: `src/schema/opportunity-card.ts`  
  Add optional fields only: `opportunity_kind`, `evidence_status`, `action_status`, `assessment`, `profileRevisionId`, and `runId`.
- Modify: `src/agents/opportunity-store.ts`  
  Preserve optional `runId` / `profileRevisionId` card metadata during add/update.
- Modify: `src/agents/radar-report-generator.ts`  
  Update the Markdown generator to use the approved public skeleton plus vertical modules and source coverage summary.
- Modify: `src/api/routes/reports.ts`  
  Preserve report artifact metadata and keep `radar_id + run_id` validation strict.
- Modify: `web/index.html`  
  Promote chat-first input; keep advanced pages hidden.
- Modify: `web/home.js`  
  Turn the homepage into the chat entry, including file text handoff if present.
- Modify: `web/radar-profile.js`  
  Replace the frontend keyword-heavy clarification gate with backend-first profile summary and a natural one-question-at-a-time experience.
- Modify: `web/watch-result.js`  
  Render run progress, ranked cards, report summary, save/rerun states, source coverage, and empty-result guidance.
- Modify: `web/radars.js`  
  Make My Radar show saved profile summary, last run, rerun action, and report status.
- Modify: `web/radar-detail.js`  
  Show the current radar profile, current opportunities, run history, and bound reports without exposing provider/debug fields by default.
- Create: `scripts/verify-chat-mvp-contract.ts`  
  Contract-level verification for generation response, profile summary, optional schema fields, and no technical leakage in profile summary.
- Create: `scripts/verify-chat-mvp-api.ts`  
  API-level end-to-end verification for chat/profile/run/report/save/rerun persistence.
- Modify: `scripts/verify-mvp-ux.ts`  
  Keep static UX checks, but assert they are not the only browser acceptance.
- Modify: `scripts/verify-mvp-browser-smoke.ts`  
  Add the chat-first path and My Radar rerun path.
- Modify: `package.json`  
  Add `verify:chat-mvp:contract` and `verify:chat-mvp:api`; include safe mock-mode checks in `verify:all`. Keep live checks out.

## Milestone A: Chat and Radar Profile Contract

This milestone makes the backend response match the approved design and gives the frontend a stable customer-visible summary.

### Task A0: Baseline Safety Check

**Files:**
- Read: `AGENTS.md`
- Read: `package.json`
- Read: `docs/superpowers/specs/2026-07-01-ai-radar-profile-mvp-design.md`
- Modify only if needed: `.gitignore`

- [ ] **Step 1: Confirm branch**

Run:

```bash
git branch --show-current
```

Expected:

```text
rescue/mvp-codex
```

If the output is `main`, stop and create/switch to `rescue/mvp-codex` before editing.

- [ ] **Step 2: Confirm `api.env` is ignored**

Run:

```bash
git check-ignore -q api.env && echo ignored
```

Expected:

```text
ignored
```

If this fails, patch `.gitignore`:

```diff
+api.env
```

- [ ] **Step 3: Record baseline verification**

Run:

```bash
npm run typecheck
npm run verify:v15:e2e
```

Expected:

```text
typecheck exits 0
verify:v15:e2e exits 0
```

If `npm` is unavailable in a Codex runtime, expose the bundled workspace dependency runtime first, then still run the project scripts or equivalent `npx` commands. Do not write machine-specific absolute paths into this plan or into package scripts.

```bash
npm run typecheck
npm run verify:v15:e2e
```

Do not continue if either command fails for a new reason. If the known nested `verify-task034` child-output flake appears, run:

```bash
npx tsx scripts/verify-task034.ts
npm run verify:v15:e2e
```

and continue only if the rerun passes.

### Task A1: Add MVP Logical Contracts

**Files:**
- Create: `src/schema/radar-mvp-contracts.ts`
- Modify: `src/schema/radar-requirement-spec.ts`

- [ ] **Step 1: Write contract file**

Create `src/schema/radar-mvp-contracts.ts`:

```ts
import type { RadarRequirementSpec } from "./radar-requirement-spec";

export type SourceCheckStatus =
  | "checked_with_results"
  | "checked_no_results"
  | "failed"
  | "not_checked";

export type OpportunityKind =
  | "direct_opportunity"
  | "business_lead"
  | "reference_case"
  | "watch_signal"
  | "rejected";

export type EvidenceStatus =
  | "confirmed"
  | "partially_verified"
  | "needs_review"
  | "unverified";

export type ActionStatus = "act_now" | "prepare" | "monitor" | "drop";

export type ScoreBasis = "fact" | "model" | "mixed";

export interface RadarProfileSummary {
  identity: string;
  target: string;
  priorities: string[];
  regionsAndTime: string;
  exclusions: string[];
  sourceHints: string[];
  assumptions: string[];
}

export interface RadarProfileRevisionMeta {
  id: string;
  radarId?: string;
  version: number;
  changedFields: string[];
  changeSummary: string;
  confirmedAt: string;
}

export interface ProjectReadinessSnapshot {
  id: string;
  radarId?: string;
  runId?: string;
  availableAssets: string[];
  qualifications: string[];
  materialGaps: string[];
  timeBudget?: string;
  moneyBudget?: string;
  packagingOptions: string[];
  assumptions: string[];
}

export interface RadarSearchPlan {
  id: string;
  radarId?: string;
  runId?: string;
  profileRevisionId?: string;
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

export interface SearchExecutionLog {
  runId?: string;
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

export interface SourceCoverageItem {
  sourceName: string;
  sourceUrl?: string;
  status: SourceCheckStatus;
  resultCount: number;
  error?: string;
}

export interface OpportunityAssessment {
  opportunityId: string;
  radarId?: string;
  runId?: string;
  profileRevisionId?: string;
  kind: OpportunityKind;
  evidenceStatus: EvidenceStatus;
  actionStatus: ActionStatus;
  score: number;
  grade?: "S" | "A" | "B" | "C";
  scoringPolicyVersion: string;
  scoreItems: Array<{
    key: string;
    label: string;
    score: number;
    weight: number;
    basis: ScoreBasis;
    evidenceIds: string[];
    reason: string;
  }>;
  assessedAt: string;
  supersedes?: string;
}

export interface RadarGenerateProfilePayload {
  spec: RadarRequirementSpec;
  suggestedName: string;
  completeness: number;
  requirementConfidence: number;
  questionsToConfirm: Array<{ id: string; question: string; priority: number }>;
  profileSummary: RadarProfileSummary;
}
```

- [ ] **Step 2: Add optional fields to `RadarRequirementSpec`**

In `src/schema/radar-requirement-spec.ts`, import the new contract types:

```ts
import type { OpportunityAssessment, RadarProfileSummary } from "./radar-mvp-contracts";
```

Then extend `RadarRequirementSpec` with optional fields at the end of the interface:

```ts
  /** MVP chat-first profile: one radar must have one primary subject. Optional for backward compatibility. */
  primary_subject?: string;
  /** MVP chat-first profile version. Optional so old saved radars remain readable. */
  profile_version?: number;
  /** MVP chat-first customer-visible summary generated from the structured spec. */
  profile_summary?: RadarProfileSummary;
  /** MVP-light risk policy: fields the run must verify for this vertical. */
  risk_policy?: {
    required_fields: string[];
    manual_review_fields: string[];
    disqualifying_signals: string[];
  };
  /** MVP report blueprint: public skeleton plus vertical sections. */
  report_blueprint?: {
    common_sections: string[];
    vertical_sections: string[];
  };
  /** MVP scoring policy: vertical dimensions while keeping S/A/B/C thresholds unified. */
  scoring_policy?: {
    version: string;
    dimensions: Array<{ key: string; label: string; weight: number }>;
    thresholds: { S: number; A: number; B: number; C: number };
  };
  /** Optional latest assessment preview. Full assessment history may live in run/report metadata later. */
  latest_assessment_preview?: OpportunityAssessment[];
```

Expected: existing TypeScript code still compiles because all new fields are optional.

- [ ] **Step 3: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected:

```text
exit 0
```

- [ ] **Step 4: Commit**

Run:

```bash
git add src/schema/radar-mvp-contracts.ts src/schema/radar-requirement-spec.ts
git commit -m "feat: add chat radar MVP contracts"
```

### Task A2: Generate Customer-Visible Profile Summary

**Files:**
- Create: `src/agents/radar-profile-summary.ts`
- Modify: `src/agents/radar-generator.ts`
- Modify: `src/api/types.ts`
- Modify: `src/api/routes/radars.ts`
- Create: `scripts/verify-chat-mvp-contract.ts`
- Modify: `package.json`

- [ ] **Step 1: Create summary builder**

Create `src/agents/radar-profile-summary.ts`:

```ts
import type { RadarRequirementSpec, QuestionToConfirm } from "../schema/radar-requirement-spec";
import type { RadarProfileSummary } from "../schema/radar-mvp-contracts";

function list(values: unknown): string[] {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : typeof values === "string" ? [values] : [])
        .map((value) => String(value ?? "").trim())
        .filter(Boolean),
    ),
  );
}

function firstNonEmpty(...values: Array<unknown>): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (Array.isArray(value) && value.length > 0) return value.map(String).join("、");
  }
  return "未明确";
}

export function buildRadarProfileSummary(spec: RadarRequirementSpec): RadarProfileSummary {
  const cp = spec.client_profile;
  const goals = spec.core_goals;
  const scope = spec.opportunity_scope;
  const region = spec.region_scope;
  const filter = spec.filter_rules;
  const sourceStrategy = spec.source_strategy;
  const sourceHints = [
    ...(sourceStrategy?.user_supplied_sources ?? []).map((source) => source.source_url || source.source_name),
    ...(sourceStrategy?.manual_sources ?? []),
    ...(sourceStrategy?.official_sites ?? []),
    ...(sourceStrategy?.platforms ?? []),
  ];
  const assumptions: string[] = [];
  if (!cp.business_type && !cp.client_type) assumptions.push("默认以用户本人或其代表的组织作为雷达主体");
  if ((region.primary_regions ?? []).length === 0) assumptions.push("默认优先看中国范围，允许线上和海外高价值机会");
  if (!goals.success_definition) assumptions.push("默认优先看未来30天内可行动机会");
  if ((filter.must_exclude ?? []).length === 0 && (scope.excluded_opportunity_types ?? []).length === 0) {
    assumptions.push("默认排除广告、旧新闻和已截止机会");
  }

  return {
    identity: firstNonEmpty(cp.business_type, cp.client_type, cp.industry),
    target: firstNonEmpty(scope.primary_opportunity_types, goals.primary_goal),
    priorities: list([...(goals.priority_order ?? []), ...(scope.must_have_conditions ?? []), ...(scope.nice_to_have_conditions ?? [])]),
    regionsAndTime: `${firstNonEmpty(region.primary_regions, cp.regions)}；${firstNonEmpty(goals.success_definition)}`,
    exclusions: list([...(scope.excluded_opportunity_types ?? []), ...(filter.must_exclude ?? []), ...(region.excluded_regions ?? [])]),
    sourceHints: list(sourceHints),
    assumptions,
  };
}

export function questionsToConfirmPayload(
  questions: QuestionToConfirm[],
): Array<{ id: string; question: string; priority: number }> {
  const priority: Record<string, number> = { high: 3, medium: 2, low: 1 };
  return questions
    .map((item, index) => ({
      id: item.related_field || `question_${index + 1}`,
      question: item.question,
      priority: priority[item.priority] ?? 1,
    }))
    .filter((item) => item.question.trim())
    .sort((a, b) => b.priority - a.priority);
}
```

- [ ] **Step 2: Extend generator return type**

In `src/agents/radar-generator.ts`, import:

```ts
import type { RadarProfileSummary } from "../schema/radar-mvp-contracts";
import { buildRadarProfileSummary, questionsToConfirmPayload } from "./radar-profile-summary";
```

Extend `RadarGenerateResult`:

```ts
  /** MVP chat-first: customer-visible profile summary */
  profileSummary: RadarProfileSummary;
  /** MVP chat-first: backend confidence copied from spec.requirement_confidence.total */
  requirementConfidence: number;
  /** MVP chat-first: normalized questions for frontend clarification */
  questionsToConfirm: Array<{ id: string; question: string; priority: number }>;
```

After compiling `spec`, add:

```ts
    const profileSummary = buildRadarProfileSummary(spec);
    spec.primary_subject = profileSummary.identity;
    spec.profile_version = spec.profile_version ?? 1;
    spec.profile_summary = profileSummary;
```

Return:

```ts
      profileSummary,
      requirementConfidence: spec.requirement_confidence.total,
      questionsToConfirm: questionsToConfirmPayload(spec.questions_to_confirm),
```

- [ ] **Step 3: Extend API response type**

In `src/api/types.ts`, import:

```ts
import type { RadarProfileSummary } from "../schema/radar-mvp-contracts";
```

Extend `RadarGenerateResponseData`:

```ts
  /** MVP chat-first: internal confidence, not shown as a raw score to users */
  requirementConfidence?: number;
  /** MVP chat-first: normalized high-priority questions */
  questionsToConfirm?: Array<{ id: string; question: string; priority: number }>;
  /** MVP chat-first: customer-visible profile summary */
  profileSummary?: RadarProfileSummary;
```

- [ ] **Step 4: Return expanded payload in `/api/radars/generate`**

In `src/api/routes/radars.ts`, change the `data` object in `app.post("/generate")` to:

```ts
      const data: RadarGenerateResponseData = {
        spec: result.spec,
        suggestedName: result.suggestedName,
        completeness: result.completeness,
        requirementConfidence: result.requirementConfidence,
        questionsToConfirm: result.questionsToConfirm,
        profileSummary: result.profileSummary,
      };
```

- [ ] **Step 5: Add contract verification**

Create `scripts/verify-chat-mvp-contract.ts`:

```ts
import { createApp } from "../src/api/app";
import { createAppContext } from "../src/api/context";
import type { ApiResponse, RadarGenerateResponseData } from "../src/api/types";

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail = ""): void {
  if (condition) {
    passed++;
    console.log(`PASS ${name}`);
  } else {
    failed++;
    console.log(`FAIL ${name}${detail ? ` -> ${detail}` : ""}`);
  }
}

async function main(): Promise<void> {
  process.env.DATA_MODE = "mock";
  process.env.LLM_MODE = "mock";
  const app = createApp(createAppContext());
  const res = await app.request("/api/radars/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      description: "我是乒乓球选手，想盯未来30天内国内外可报名的乒乓球比赛，优先 ITTF、WTT、中国乒协官网，排除培训广告",
    }),
  });
  const json = await res.json() as ApiResponse<RadarGenerateResponseData>;
  const data = json.data;
  check("generate returns 200", res.status === 200, `status=${res.status}`);
  check("generate success", json.success === true);
  check("profileSummary exists", !!data?.profileSummary);
  check("profileSummary has identity", !!data?.profileSummary?.identity && data.profileSummary.identity !== "未明确");
  check("profileSummary has target", !!data?.profileSummary?.target && data.profileSummary.target !== "未明确");
  check("profileSummary contains source hints", (data?.profileSummary?.sourceHints ?? []).some((item) => /ITTF|WTT|ittf|worldtabletennis|中国乒协/i.test(item)));
  check("requirementConfidence is numeric", typeof data?.requirementConfidence === "number");
  check("questionsToConfirm is array", Array.isArray(data?.questionsToConfirm));
  const summaryText = JSON.stringify(data?.profileSummary ?? {});
  check("profile summary does not leak provider", !/provider|source_strategy|scoring_rules|requirement_confidence/i.test(summaryText), summaryText);
  check("spec keeps profile version", data?.spec.profile_version === 1, `profile_version=${data?.spec.profile_version}`);
  console.log(`chat MVP contract: ${passed} PASS / ${failed} FAIL`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 6: Add package script**

Patch `package.json` scripts:

```json
"verify:chat-mvp:contract": "tsx scripts/verify-chat-mvp-contract.ts"
```

Do not add any live API script to `verify:all`.

- [ ] **Step 7: Verify**

Run:

```bash
npm run typecheck
npm run verify:chat-mvp:contract
npm run verify:v15:e2e
```

Expected:

```text
all exit 0
```

- [ ] **Step 8: Commit**

Run:

```bash
git add src/agents/radar-profile-summary.ts src/agents/radar-generator.ts src/api/types.ts src/api/routes/radars.ts scripts/verify-chat-mvp-contract.ts package.json
git commit -m "feat: return chat radar profile summary"
```

## Milestone B: Natural Chat Clarification and Confirmation

This milestone removes the feeling of a mechanical question form. It keeps the existing frontend simple, but the source of truth becomes backend profile generation and summary data.

### Task B1: Replace Frontend-Only Clarity With Backend-First Gate

**Files:**
- Modify: `web/radar-profile.js`
- Modify: `scripts/verify-mvp-ux.ts`
- Modify: `scripts/verify-mvp-browser-smoke.ts`

- [ ] **Step 1: Use backend response fields**

In `web/radar-profile.js`, change `createRadarProfileDraft` so `currentDraft.profile` comes from `gen.data.profileSummary` first:

```js
    currentDraft = {
      description,
      spec,
      profile: profileFromBackendSummary(gen.data.profileSummary) || profileFromSpec(spec),
      suggestedName: gen.data.suggestedName || "我的机会雷达",
      questions: gen.data.questionsToConfirm || spec.questions_to_confirm || [],
      clarification,
    };
```

Add helper:

```js
  function profileFromBackendSummary(summary) {
    if (!summary || typeof summary !== "object") return null;
    return {
      用户身份: summary.identity || "未明确",
      关注机会: summary.target ? [summary.target] : [],
      地域范围: summary.regionsAndTime || "未明确",
      时间范围: summary.regionsAndTime || "近期可行动机会",
      指定信号源: summary.sourceHints || [],
      排除内容: summary.exclusions || [],
      排序偏好: summary.priorities || [],
      默认假设: summary.assumptions || [],
    };
  }
```

- [ ] **Step 2: Normalize question selection**

Update `assessRequirementClarity` so backend confidence participates directly:

```js
    const backendConfidence = Number(generatedData?.requirementConfidence || generatedData?.spec?.requirement_confidence?.total || 0);
    const backendQuestions = normalizeBackendQuestions(generatedData?.questionsToConfirm || generatedData?.spec?.questions_to_confirm);
```

Keep fallback questions only when backend returns no useful question and the frontend score is below threshold.

- [ ] **Step 3: Render one natural question at a time**

Change `renderClarificationGate` to show at most one visible question, while keeping the answer box free-form:

```js
    const questions = (draft.clarification?.questions || []).slice(0, 1);
```

Keep the copy:

```text
我还需要确认几个关键点
这样可以让机会雷达盯得更准
回答后生成雷达画像
先按默认理解继续
```

Rationale: the product may internally track up to 3 missing fields, but the approved UX says AI-style conversation, not a mechanical mini-form.

- [ ] **Step 4: Preserve one-round MVP fallback**

Keep `submitClarificationAnswer` and `continueWithDefaultUnderstanding` behavior:

```text
原始需求 + 用户补充回答
→ POST /api/radars/generate
→ render profile card
```

Do not introduce infinite clarification loops in this task.

- [ ] **Step 5: Update static UX check**

In `scripts/verify-mvp-ux.ts`, replace the "最多展示 3 个问题" check with:

```ts
check("澄清闸门客户侧一次只展示 1 个自然追问", profileJs.includes("slice(0, 1)") || profileJs.includes("MAX_VISIBLE_CLARIFICATION_QUESTIONS"));
```

Keep a separate check that the system still caps internal question arrays at 3:

```ts
check("澄清闸门内部最多保留 3 个候选问题", profileJs.includes("MAX_CLARIFICATION_QUESTIONS"));
```

- [ ] **Step 6: Update browser smoke**

In `scripts/verify-mvp-browser-smoke.ts`, change the assertion for question count:

```ts
    if (questionCount !== 1) fail(`clarification should show one natural question: ${questionCount}`);
```

- [ ] **Step 7: Verify**

Run:

```bash
npm run typecheck
npm run verify:mvp-ux
npm run verify:mvp-browser
npm run verify:v15:e2e
```

Expected:

```text
all exit 0
```

- [ ] **Step 8: Commit**

Run:

```bash
git add web/radar-profile.js scripts/verify-mvp-ux.ts scripts/verify-mvp-browser-smoke.ts
git commit -m "feat: make clarification gate conversational"
```

## Milestone C: Search Run Audit and Raw Candidate Accounting

This milestone records what actually happened during a run. It does not build the V1.7 source transparency product.

### Task C1: Return Search Plan and Execution Log

**Files:**
- Modify: `src/search/orchestrator.ts`
- Modify: `src/search/types.ts`
- Modify: `src/api/types.ts`
- Modify: `src/api/routes/radars.ts`
- Create: `scripts/verify-chat-mvp-api.ts`

- [ ] **Step 1: Add optional search result fields**

In `src/search/types.ts`, add or export optional interfaces if no equivalent exists:

```ts
export interface RawCandidateAudit {
  id: string;
  query: string;
  title: string;
  url: string;
  snippet?: string;
  sourceDomain: string;
  sourceType: string;
  status: "raw" | "merged" | "assessed" | "rejected";
}
```

In `SearchResult` usage, do not force every provider to return audit fields.

- [ ] **Step 2: Build run audit in orchestrator**

In `src/search/orchestrator.ts`, import:

```ts
import type { RadarSearchPlan, SearchExecutionLog, SourceCoverageItem } from "../schema/radar-mvp-contracts";
```

Extend `SearchOrchestratorResult`:

```ts
  searchPlan?: RadarSearchPlan;
  executionLog?: SearchExecutionLog;
  sourceCoverage?: SourceCoverageItem[];
  rawCandidates?: Array<{
    id: string;
    query: string;
    title: string;
    url: string;
    snippet?: string;
    sourceDomain: string;
    sourceType: string;
    status: "raw" | "merged" | "assessed" | "rejected";
  }>;
```

At the start of `search`, initialize:

```ts
    const queryExecutions: SearchExecutionLog["queryExecutions"] = [];
    const openedUrls: SearchExecutionLog["openedUrls"] = [];
```

When each provider search starts, capture `startedAt`; on success push:

```ts
queryExecutions.push({
  query: searchQuery,
  provider: provider.name,
  startedAt,
  status: "succeeded",
  rawResultCount: results.length,
});
```

On provider failure push:

```ts
queryExecutions.push({
  query: searchQuery,
  provider: provider.name,
  startedAt,
  status: "failed",
  rawResultCount: 0,
  error: errMsg,
});
```

Map `sourceHintChecks` to `SourceCoverageItem`:

```ts
function mapSourceCoverage(checks: SourceHintCheck[]): SourceCoverageItem[] {
  return checks.map((check) => ({
    sourceName: check.sourceName,
    sourceUrl: check.sourceUrl || undefined,
    status: check.status === "checked"
      ? "checked_with_results"
      : check.status === "no_results"
        ? "checked_no_results"
        : check.status === "failed" || check.status === "invalid_url"
          ? "failed"
          : "not_checked",
    resultCount: check.resultCount,
    ...(check.error ? { error: check.error } : {}),
  }));
}
```

Before each return, include:

```ts
searchPlan: {
  id: `plan_${Date.now().toString(36)}`,
  themes: spec.opportunity_scope.primary_opportunity_types,
  queries: [{ query: searchQuery, language: /[a-z]/i.test(searchQuery) ? "mixed" : "zh" }],
  configuredSources: [
    ...(spec.source_strategy?.manual_sources ?? []),
    ...(spec.source_strategy?.user_supplied_sources ?? []).map((source) => source.source_url),
  ],
  exclusions: spec.filter_rules.must_exclude ?? [],
  maxCandidates: this.maxResultsPerProvider,
},
executionLog: { queryExecutions, openedUrls },
sourceCoverage: mapSourceCoverage(sourceHintChecks),
rawCandidates: rawResults.map((result, index) => ({
  id: `raw_${index + 1}`,
  query: searchQuery,
  title: result.title,
  url: result.url,
  snippet: result.snippet,
  sourceDomain: new URL(result.url).hostname.replace(/^www\./, ""),
  sourceType: result.source_type ?? "search_snippet",
  status: "raw",
})),
```

Wrap `new URL` in a helper so invalid URLs do not crash:

```ts
function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
```

- [ ] **Step 3: Pass run audit through API types**

In `src/api/types.ts`, import:

```ts
import type { RadarSearchPlan, SearchExecutionLog, SourceCoverageItem } from "../schema/radar-mvp-contracts";
```

Extend `RadarRunResult`:

```ts
  searchPlan?: RadarSearchPlan;
  executionLog?: SearchExecutionLog;
  sourceCoverage?: SourceCoverageItem[];
  rawCandidates?: Array<{ id: string; query: string; title: string; url: string; status: string }>;
```

- [ ] **Step 4: Return audit fields from manual radar run**

In `src/api/routes/radars.ts`, when building `RadarRunResult`, add:

```ts
        searchPlan: searchResult.searchPlan,
        executionLog: searchResult.executionLog,
        sourceCoverage: searchResult.sourceCoverage,
        rawCandidates: searchResult.rawCandidates,
```

Also include these fields in early empty-result returns from search route if relevant.

- [ ] **Step 5: Add API verification script**

Create `scripts/verify-chat-mvp-api.ts`:

```ts
import fs from "fs";
import path from "path";
import { createApp } from "../src/api/app";
import type { AppContext } from "../src/api/context";
import { ModelRouter } from "../src/agents/model-router";
import { LocalFileStore } from "../src/agents/opportunity-store";
import { StarManager } from "../src/agents/star-manager";
import { LocalWatchStore } from "../src/watch/watch-store";
import { JsonRadarStore, JsonRadarRunStore } from "../src/agents/radar-store";
import { RadarRegistry } from "../src/agents/radar-registry";
import { JsonReportStore } from "../src/agents/report-store";
import type { ApiResponse } from "../src/api/types";
import type { OpportunityCard } from "../src/schema/opportunity-card";

let passed = 0;
let failed = 0;

const files = {
  radars: "data/radars-chat-mvp-test.json",
  runs: "data/radar-runs-chat-mvp-test.json",
  opps: "data/opportunity-store-chat-mvp-test.json",
  watch: "data/watch-rules-chat-mvp-test.txt",
  reports: "data/report-index-chat-mvp-test.json",
};

function check(name: string, condition: boolean, detail = ""): void {
  if (condition) {
    passed++;
    console.log(`PASS ${name}`);
  } else {
    failed++;
    console.log(`FAIL ${name}${detail ? ` -> ${detail}` : ""}`);
  }
}

function cleanup(): void {
  for (const file of Object.values(files)) {
    const abs = path.resolve(process.cwd(), file);
    if (fs.existsSync(abs)) fs.unlinkSync(abs);
  }
}

function context(): AppContext {
  cleanup();
  const store = new LocalFileStore({ file_path: files.opps });
  store.load();
  const radarStore = new JsonRadarStore({ file_path: files.radars });
  const radarRunStore = new JsonRadarRunStore({ file_path: files.runs });
  const radarRegistry = new RadarRegistry(radarStore);
  radarRegistry.initialize();
  return {
    llmAdapter: new ModelRouter(),
    store,
    starManager: new StarManager(store),
    watchStore: new LocalWatchStore({ file_path: files.watch }),
    conversations: new Map(),
    radarStore,
    radarRunStore,
    radarRegistry,
    reportStore: new JsonReportStore({ file_path: files.reports }),
  };
}

async function post(app: ReturnType<typeof createApp>, url: string, body: unknown): Promise<{ res: Response; json: ApiResponse }> {
  const res = await app.request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { res, json: await res.json() as ApiResponse };
}

async function get(app: ReturnType<typeof createApp>, url: string): Promise<{ res: Response; json: ApiResponse }> {
  const res = await app.request(url);
  return { res, json: await res.json() as ApiResponse };
}

async function main(): Promise<void> {
  process.env.DATA_MODE = "mock";
  process.env.LLM_MODE = "mock";
  const ctx = context();
  const app = createApp(ctx);

  const generated = await post(app, "/api/radars/generate", {
    description: "我是乒乓球选手，想盯未来30天内国内外可报名的乒乓球比赛，优先 ITTF、WTT、中国乒协官网，排除培训广告",
  });
  const genData = generated.json.data as { spec?: unknown; suggestedName?: string; profileSummary?: unknown } | null;
  check("generate profile summary", !!genData?.profileSummary);

  const created = await post(app, "/api/radars", {
    name: genData?.suggestedName || "乒乓球比赛雷达",
    kind: "custom",
    spec: genData?.spec,
  });
  const radar = created.json.data as { id?: string } | null;
  const radarId = radar?.id || "";
  check("create custom radar", created.res.status === 200 && radarId.length > 0);

  await post(app, `/api/radars/${radarId}/activate`, {});
  const runResp = await post(app, `/api/radars/${radarId}/run`, {});
  const runData = runResp.json.data as {
    run?: { id?: string; status?: string };
    opportunityCards?: OpportunityCard[];
    rawCandidates?: unknown[];
    searchPlan?: unknown;
    executionLog?: { queryExecutions?: unknown[] };
    sourceCoverage?: unknown[];
  } | null;
  const runId = runData?.run?.id || "";
  const cards = runData?.opportunityCards || [];
  check("run succeeded", runResp.res.status === 200 && runData?.run?.status === "succeeded");
  check("run has opportunity cards", cards.length > 0, `cards=${cards.length}`);
  check("run has search plan", !!runData?.searchPlan);
  check("run has execution log", (runData?.executionLog?.queryExecutions ?? []).length > 0);
  check("run has raw candidates", (runData?.rawCandidates ?? []).length > 0);

  const opps = await get(app, `/api/opportunities?radar_id=${encodeURIComponent(radarId)}`);
  const oppData = opps.json.data as { entries?: Array<{ card?: OpportunityCard; radarId?: string; radarIds?: string[] }> } | null;
  const entries = oppData?.entries || [];
  check("opportunities persisted", entries.length > 0);
  check("opportunities bound to radar", entries.every((entry) => entry.radarId === radarId || (entry.radarIds ?? []).includes(radarId)));

  const report = await post(app, "/api/reports/generate", {
    radar_id: radarId,
    run_id: runId,
    radar_type: "ai_competition",
    spec: genData?.spec,
    opportunities: cards,
    profile: genData?.profileSummary,
    sourceHintChecks: runData?.sourceCoverage,
  });
  const reportData = report.json.data as { reportId?: string; markdown?: string } | null;
  check("report generated", report.res.status === 200 && !!reportData?.reportId);
  check("report includes opportunity title", !!cards[0]?.title && !!reportData?.markdown?.includes(cards[0].title));
  check("run reportId written back", ctx.radarRunStore.get(runId)?.reportId === reportData?.reportId);

  const reloadedStore = new LocalFileStore({ file_path: files.opps });
  reloadedStore.load();
  check("reload keeps opportunities", reloadedStore.list({ radarId }).entries.length > 0);
  check("reload keeps report meta", new JsonReportStore({ file_path: files.reports }).listByRadarId(radarId).length > 0);

  cleanup();
  console.log(`chat MVP API: ${passed} PASS / ${failed} FAIL`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  cleanup();
  process.exit(1);
});
```

- [ ] **Step 6: Add package script**

Patch `package.json`:

```json
"verify:chat-mvp:api": "tsx scripts/verify-chat-mvp-api.ts"
```

Add both safe chat checks to `verify:all`:

```json
"verify:all": "npm run typecheck && npm run verify:v15 && npm run verify:v15:e2e && npm run verify:v16 && npm run verify:mvp-ux && npm run verify:source-hints && npm run verify:report-template && npm run verify:chat-mvp:contract && npm run verify:chat-mvp:api"
```

Do not add live search verification to `verify:all`.

- [ ] **Step 7: Verify**

Run:

```bash
npm run typecheck
npm run verify:chat-mvp:api
npm run verify:v15:e2e
npm run verify:v16
```

Expected:

```text
all exit 0
```

- [ ] **Step 8: Commit**

Run:

```bash
git add src/search/orchestrator.ts src/search/types.ts src/api/types.ts src/api/routes/radars.ts scripts/verify-chat-mvp-api.ts package.json
git commit -m "feat: record chat radar run audit"
```

## Milestone D: Opportunity Assessment and Customer Report

This milestone makes the result more like the GPT radar reports while keeping ChancePing more verifiable.

### Task D1: Add Four-Dimensional Assessment Metadata

**Files:**
- Modify: `src/schema/opportunity-card.ts`
- Modify: `src/search/opportunity-scorer.ts`
- Modify: `src/search/opportunity-card-mapper.ts`
- Modify: `src/agents/opportunity-store.ts`
- Modify: `scripts/verify-chat-mvp-api.ts`

- [ ] **Step 1: Add optional card fields**

In `src/schema/opportunity-card.ts`, import:

```ts
import type { ActionStatus, EvidenceStatus, OpportunityAssessment, OpportunityKind } from "./radar-mvp-contracts";
```

Extend `OpportunityCard`:

```ts
  /** MVP chat-first: what kind of result this is. */
  opportunity_kind?: OpportunityKind;
  /** MVP chat-first: how well key fields are verified. */
  evidence_status?: EvidenceStatus;
  /** MVP chat-first: what the user should do now. */
  action_status?: ActionStatus;
  /** MVP chat-first: replayable assessment metadata for this run. */
  assessment?: OpportunityAssessment;
  /** MVP chat-first: profile revision used for this card. */
  profileRevisionId?: string;
  /** MVP chat-first: run that produced this card. */
  runId?: string;
```

- [ ] **Step 2: Classify assessment from existing score**

In `src/search/opportunity-scorer.ts`, add helper:

```ts
export function gradeFromScore(score: number): "S" | "A" | "B" | "C" | undefined {
  if (score >= 90) return "S";
  if (score >= 80) return "A";
  if (score >= 65) return "B";
  if (score >= 50) return "C";
  return undefined;
}
```

When constructing a scored opportunity, attach optional metadata if the local type permits extension:

```ts
const grade = gradeFromScore(score.total_score);
return {
  ...existingScoredOpportunity,
  opportunity_kind: grade ? "direct_opportunity" : "rejected",
  evidence_status: score.credibility >= 70 ? "confirmed" : "needs_review",
  action_status: grade === "S" || grade === "A" ? "act_now" : grade ? "prepare" : "drop",
  score_basis: "mixed",
};
```

If `ScoredOpportunity` is strict, extend it in `src/search/types.ts` with optional fields instead of using casts.

- [ ] **Step 3: Map assessment to card**

In `src/search/opportunity-card-mapper.ts`, while building `OpportunityCard`, add:

```ts
const assessment = {
  opportunityId: card.guid || card.official_source_url,
  kind: scored.opportunity_kind ?? "direct_opportunity",
  evidenceStatus: scored.evidence_status ?? "needs_review",
  actionStatus: scored.action_status ?? "prepare",
  score: card.backend_score,
  grade: card.visible_level === "hidden" || card.visible_level === "D" ? undefined : card.visible_level,
  scoringPolicyVersion: "mvp-2026-07-01",
  scoreItems: [
    {
      key: "match",
      label: "与雷达画像匹配",
      score: card.backend_score,
      weight: 100,
      basis: "mixed",
      evidenceIds: card.evidenceIds ?? [],
      reason: card.match_reason,
    },
  ],
  assessedAt: new Date().toISOString(),
};
```

Then set:

```ts
opportunity_kind: assessment.kind,
evidence_status: assessment.evidenceStatus,
action_status: assessment.actionStatus,
assessment,
```

- [ ] **Step 4: Preserve metadata in store**

`src/agents/opportunity-store.ts` already stores full card objects. Add a regression check in `scripts/verify-chat-mvp-api.ts`:

```ts
check("card keeps opportunity kind", entries.some((entry) => !!entry.card?.opportunity_kind));
check("card keeps evidence status", entries.some((entry) => !!entry.card?.evidence_status));
check("card keeps action status", entries.some((entry) => !!entry.card?.action_status));
```

- [ ] **Step 5: Verify**

Run:

```bash
npm run typecheck
npm run verify:chat-mvp:api
npm run verify:v15:e2e
```

Expected:

```text
all exit 0
```

- [ ] **Step 6: Commit**

Run:

```bash
git add src/schema/opportunity-card.ts src/search/opportunity-scorer.ts src/search/types.ts src/search/opportunity-card-mapper.ts src/agents/opportunity-store.ts scripts/verify-chat-mvp-api.ts
git commit -m "feat: add MVP opportunity assessment metadata"
```

### Task D2: Update Markdown Report Skeleton

**Files:**
- Modify: `src/agents/radar-report-generator.ts`
- Modify: `scripts/verify-report-template.ts`
- Modify: `scripts/verify-chat-mvp-api.ts`

- [ ] **Step 1: Ensure report contains the approved public skeleton**

In `src/agents/radar-report-generator.ts`, ensure generated Markdown includes these top-level sections:

```text
# ChancePing｜本周机会雷达报告
## 1. 雷达画像
## 2. 本周一句话判断
## 3. S / A / B 级机会总览
## 4. 机会详情卡片
## 5. 本周建议行动
## 6. 不建议投入或需复核的机会
## 7. 来源与检查回执
## 8. 下周继续追踪
```

Keep existing V0.4 sections that downstream tests rely on, but rename/add wrapper headings so the MVP report reads like the GPT weekly radar reports.

- [ ] **Step 2: Add assessment metadata to card details**

For each opportunity card, include:

```text
- 级别：S/A/B/C
- 机会类型：direct_opportunity/business_lead/reference_case/watch_signal
- 证据状态：confirmed/partially_verified/needs_review/unverified
- 行动状态：act_now/prepare/monitor/drop
- 为什么适合你：
- 截止时间：
- 建议动作：
- 官方来源：
- 风险提醒：
```

Do not expose backend score unless hidden behind a concise phrase such as `内部匹配判断：高` if needed.

- [ ] **Step 3: Add empty-result report**

When `opportunities.length === 0`, report must include:

```text
本轮没有发现足够匹配、可行动的机会。

建议：
- 放宽地区
- 减少排除条件
- 增加指定信号源
- 保存为长期雷达继续监控
```

Also include source coverage:

```text
| 来源 | 状态 | 结果数 | 说明 |
```

- [ ] **Step 4: Update report template verification**

In `scripts/verify-report-template.ts`, assert:

```ts
check("报告包含来源与检查回执", markdown.includes("## 7. 来源与检查回执"));
check("报告包含机会类型", markdown.includes("机会类型"));
check("报告包含证据状态", markdown.includes("证据状态"));
check("报告包含行动状态", markdown.includes("行动状态"));
check("空报告包含可行动建议", emptyMarkdown.includes("放宽地区") && emptyMarkdown.includes("保存为长期雷达继续监控"));
```

- [ ] **Step 5: Update API verification**

In `scripts/verify-chat-mvp-api.ts`, after generating report:

```ts
check("report includes source coverage", !!reportData?.markdown?.includes("来源与检查回执"));
check("report includes evidence status", !!reportData?.markdown?.includes("证据状态"));
check("report includes action status", !!reportData?.markdown?.includes("行动状态"));
```

- [ ] **Step 6: Verify**

Run:

```bash
npm run typecheck
npm run verify:report-template
npm run verify:chat-mvp:api
npm run verify:v15:e2e
```

Expected:

```text
all exit 0
```

- [ ] **Step 7: Commit**

Run:

```bash
git add src/agents/radar-report-generator.ts scripts/verify-report-template.ts scripts/verify-chat-mvp-api.ts
git commit -m "feat: align radar report with chat MVP"
```

## Milestone E: Frontend Chat-First MVP Surface

This milestone polishes the customer path after backend contracts are stable.

### Task E1: Make Homepage Feel Like Chat Is the Product

**Files:**
- Modify: `web/index.html`
- Modify: `web/home.js`
- Modify: `web/styles.css`
- Modify: `scripts/verify-mvp-ux.ts`
- Modify: `scripts/verify-mvp-browser-smoke.ts`

- [ ] **Step 1: Update first screen copy**

In `web/index.html`, keep:

```html
<h2 class="home-title">告诉我你想盯什么机会</h2>
<p class="home-subtitle">AI 会帮你找出本周值得行动的机会</p>
```

Add a chat-like helper near the input:

```html
<p class="home-helper">你可以直接说一段话，也可以补充官网、排除条件或项目材料。先看结果，觉得有用再保存为长期雷达。</p>
```

Keep examples under:

```html
<p class="examples-label">试试看这些例子</p>
```

Do not label examples as categories or required radar types.

- [ ] **Step 2: Make attach button non-confusing**

If upload is not fully wired in this sprint, make the button communicate local limitation:

```js
document.getElementById("home-attach-btn")?.addEventListener("click", () => {
  showToast("文件会作为画像补充材料使用，不会直接当作机会结果。", "warning");
});
```

If existing upload flow is wired, pass `uploaded_text` into `/api/radars/generate`; otherwise do not pretend files are uploaded.

- [ ] **Step 3: Render profile assumptions**

In `web/radar-profile.js`, add a visible profile field:

```js
${renderProfileField("默认假设", profile.默认假设)}
```

Only show it when non-empty:

```js
${(profile.默认假设 || []).length ? renderProfileField("默认假设", profile.默认假设) : ""}
```

- [ ] **Step 4: Update static verification**

In `scripts/verify-mvp-ux.ts`, assert:

```ts
check("首页说明可以直接说一段话", html.includes("你可以直接说一段话"));
check("画像确认展示默认假设", profileJs.includes("默认假设"));
```

- [ ] **Step 5: Verify**

Run:

```bash
npm run typecheck
npm run verify:mvp-ux
npm run verify:mvp-browser
```

Expected:

```text
all exit 0
```

- [ ] **Step 6: Commit**

Run:

```bash
git add web/index.html web/home.js web/styles.css web/radar-profile.js scripts/verify-mvp-ux.ts scripts/verify-mvp-browser-smoke.ts
git commit -m "feat: polish chat-first radar entry"
```

### Task E2: Improve Result Cards, Source Coverage, and Save State

**Files:**
- Modify: `web/watch-result.js`
- Modify: `web/styles.css`
- Modify: `web/radars.js`
- Modify: `web/radar-detail.js`
- Modify: `scripts/verify-mvp-browser-smoke.ts`

- [ ] **Step 1: Show four-dimensional result labels**

In `web/watch-result.js`, update `renderCard(card)` to include:

```html
<div class="watch-card-meta">
  <span>${escapeHtml(card.opportunity_kind || "direct_opportunity")}</span>
  <span>${escapeHtml(card.evidence_status || "needs_review")}</span>
  <span>${escapeHtml(card.action_status || "prepare")}</span>
</div>
```

Keep the customer order:

```text
标题
为什么适合你
截止时间
建议动作
官方来源
```

- [ ] **Step 2: Render source coverage statuses**

Change `renderSourceHintCheck` status map to include both old and new statuses:

```js
const label = {
  checked: "已检查",
  no_results: "未发现结果",
  failed: "检查失败",
  invalid_url: "无效网址",
  name_only: "来源名称，待转成可检查网址",
  checked_with_results: "已检查，有结果",
  checked_no_results: "已检查，暂无结果",
  not_checked: "本轮未检查",
}[item.status] || item.status || "未知";
```

- [ ] **Step 3: Save button must reflect completed binding**

After `saveCurrentRadar()` succeeds, render a post-save state instead of only switching tabs:

```js
currentResult.savedMessage = "已保存为长期雷达。本次机会和报告已经绑定到我的雷达。";
```

In `renderResult`, if `result.savedMessage` exists, show:

```html
<p class="save-success">${escapeHtml(result.savedMessage)}</p>
```

Then switch to My Radar after a short delay or provide `查看我的雷达`.

- [ ] **Step 4: My Radar shows run/report readiness**

In `web/radars.js`, for each custom radar card show:

```text
画像摘要
上次运行时间
上次运行状态
查看机会和报告
再次盯机会
```

Do not show provider routing, raw spec, or debug IDs unless an advanced panel is explicitly opened.

- [ ] **Step 5: Radar detail binds opportunities and reports**

In `web/radar-detail.js`, ensure the detail load sequence is:

```text
GET /api/radars/:id
GET /api/opportunities?radar_id=:id
GET /api/radars/:id/runs
GET /api/reports?radar_id=:id
```

The UI must show:

```text
current profile summary
opportunity cards
run history with reportId
Markdown reports
```

- [ ] **Step 6: Update browser smoke**

In `scripts/verify-mvp-browser-smoke.ts`, after saving:

```ts
await page.waitForSelector("#panel-radars.active", { timeout: 15_000 });
const radarPanelText = await page.$eval("#panel-radars", (el: any) => el.textContent || "");
if (!radarPanelText.includes("再次盯机会") && !radarPanelText.includes("查看机会和报告")) {
  fail("my radar does not expose rerun/report actions");
}
```

Open the first custom radar and assert:

```ts
if (!detailText.includes("机会") || !detailText.includes("报告")) fail("radar detail missing opportunities or reports");
```

- [ ] **Step 7: Verify**

Run:

```bash
npm run typecheck
npm run verify:mvp-ux
npm run verify:mvp-browser
npm run verify:chat-mvp:api
npm run verify:v15:e2e
```

Expected:

```text
all exit 0
```

- [ ] **Step 8: Commit**

Run:

```bash
git add web/watch-result.js web/styles.css web/radars.js web/radar-detail.js scripts/verify-mvp-browser-smoke.ts
git commit -m "feat: complete chat MVP result and saved radar UX"
```

## Milestone F: Full Safe Verification and Review Handoff

This milestone proves the MVP path without live API side effects.

### Task F1: Safe Verification Suite

**Files:**
- Modify: `package.json`
- Modify if needed: `scripts/verify-mvp-ux.ts`
- Modify if needed: `scripts/verify-mvp-browser-smoke.ts`

- [ ] **Step 1: Confirm safe scripts**

`package.json` must include:

```json
"verify:chat-mvp:contract": "tsx scripts/verify-chat-mvp-contract.ts",
"verify:chat-mvp:api": "tsx scripts/verify-chat-mvp-api.ts",
"verify:mvp-browser": "tsx scripts/verify-mvp-browser-smoke.ts"
```

`verify:all` may include mock-safe checks:

```json
"verify:all": "npm run typecheck && npm run verify:v15 && npm run verify:v15:e2e && npm run verify:v16 && npm run verify:mvp-ux && npm run verify:source-hints && npm run verify:report-template && npm run verify:chat-mvp:contract && npm run verify:chat-mvp:api"
```

`verify:all` must not include live provider checks.

- [ ] **Step 2: Run required checks**

Run:

```bash
npm run typecheck
npm run verify:v15:e2e
npm run verify:v15
npm run verify:v16
npm run verify:mvp-ux
npm run verify:chat-mvp:contract
npm run verify:chat-mvp:api
npm run verify:mvp-browser
npm run verify:all
```

Expected:

```text
all exit 0
```

If `verify:mvp-browser` skips because Puppeteer is not installed, run the manual browser path below and record the skip honestly.

- [ ] **Step 3: Manual browser acceptance**

Start local server:

```bash
DATA_MODE=mock LLM_MODE=mock npm run dev
```

Open:

```text
http://localhost:3000/
```

Manual path 1, vague input:

```text
首页
→ 输入：我想盯乒乓球比赛
→ 点击：盯机会
→ 看到：自然追问，不是机械问卷
→ 输入：我是乒乓球选手，想看未来30天内国内外可报名比赛，优先 ITTF、WTT、中国乒协官网，排除培训广告
→ 看到：我理解你想建立这样的机会雷达
→ 点击：确认，开始盯机会
→ 看到：机会卡片、报告摘要、完整 Markdown 可展开
→ 点击：保存为长期雷达，之后持续盯
→ 看到：我的雷达里有本雷达
→ 打开详情：看到本次机会和绑定报告
→ 点击：再次盯机会
→ 看到：新 run 生成，报告绑定新的 runId
```

Manual path 2, complete input:

```text
首页
→ 输入：我是乒乓球选手，想盯未来30天内国内外可报名的乒乓球比赛，优先看 ITTF、WTT、中国乒协官网，排除培训广告
→ 点击：盯机会
→ 预期：直接生成画像确认卡，不先追问
```

Manual path 3, study-tour lead:

```text
首页
→ 输入：我们是研学文旅公司，想找有研学需求的国企单位和企业，看看能否接到研学订单，优先广东和大湾区，排除纯招聘信息
→ 点击：盯机会
→ 预期：生成研学获客/业务线索画像；结果卡片不把客服电话直接包装成已确认 BD 联系人；报告中区分 business_lead 和 needs_review
```

- [ ] **Step 4: Final diff review**

Run:

```bash
git diff --check
git status --short
```

Expected:

```text
git diff --check has no output
status only contains intended files for the last task or is clean after commit
```

- [ ] **Step 5: Handoff summary**

Prepare final handoff with:

```text
修改文件列表
git diff 摘要
测试命令和结果
真实网页验收步骤
仍未解决的问题
是否建议合并 main
```

Recommended unresolved items to mention if still true:

```text
真实搜索 Provider 质量仍需 Jason 单独授权 live 验证
Source Hints 仍是 MVP-light，不是完整来源后台
文件上传只作为画像补充，不是通用知识库
聊天多轮持久化仍可后续增强为数据库会话
```

## Execution Order Recommendation

Do not run all milestones in one unchecked batch.

Recommended Jason review gates:

1. After Milestone A: confirm backend profile summary contract.
2. After Milestone B: confirm clarification feels like AI conversation.
3. After Milestone C: confirm run audit and persistence.
4. After Milestone D: confirm card/report semantics match GPT radar reports.
5. After Milestone E: confirm browser UX.
6. After Milestone F: decide whether to merge or open PR.

## Self-Review

Spec coverage:

- Chat-first entry: Milestone B and E.
- Radar profile as long-term memory: Milestone A, B, E.
- Information sufficiency and natural clarification: Milestone B.
- Confirmation before search: Milestone B and E.
- Search plan and actual execution log: Milestone C.
- Source Hints MVP-light: Milestone C and E.
- Raw candidate accounting: Milestone C.
- Matching, scoring, S/A/B/C, opportunity/evidence/action dimensions: Milestone D.
- Markdown report like GPT radar but verifiable: Milestone D.
- Save as long-term radar and rerun from My Radar: Milestone E and F.
- Free custom radar count remains 3: protected by existing quota tests and `verify:mvp-ux`.
- `api.env` local-only and live checks excluded from `verify:all`: Task A0 and F1.

Placeholder scan:

- No task contains `TBD`, `TODO`, or "implement later".
- Every new file has concrete responsibility and verification.
- Live provider work is explicitly excluded unless Jason separately authorizes it.

Type consistency:

- `profileSummary`, `requirementConfidence`, and `questionsToConfirm` use camelCase API payload fields.
- Existing `spec.questions_to_confirm` and `spec.requirement_confidence.total` remain backward compatible.
- `runId` is always read from `search.data?.run?.id`, never from `search.data.runId`.
- Report generation continues binding `radar_id + run_id` and relies on existing strict validation.
