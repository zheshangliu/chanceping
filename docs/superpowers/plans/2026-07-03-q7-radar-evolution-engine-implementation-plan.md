# Q.7 Radar Evolution Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a generic radar revision loop where customer corrections and result feedback upgrade `RadarVersionSpec` before the next search, then prove it with an AI competition demo flow.

**Architecture:** Extend the existing `RadarVersionSpec` pipeline with a typed `RadarVersionDiff`, a focused `RadarVersionReviser`, and a stateless `/api/radars/revise` endpoint. Reuse the current strategy card UI and result page; add revision feedback controls without a large chat rebuild.

**Tech Stack:** TypeScript, Hono API routes, existing local JSON stores, existing plain JS frontend, existing DeepSeek commercial live LLM profile, existing Playwright/Puppeteer-style browser smoke scripts.

## Q.7 Execution Amendments

These amendments are mandatory for Q.7-A / Q.7-B:

1. `RadarVersionReviser` may be deterministic in the first round, but it must be a generic revision-pattern engine. The AI competition scenario is a demo and regression sample, not an industry branch.
2. `verify:q7` must assert real `RadarVersionSpec` field changes, including `highValueCriteria`, `exclusionRules`, `prioritySourceArchetypes`, `queryFamilies` or `opportunityIntents`, `defaultAssumptions`, and `confirmation_status.user_confirmed = false`.
3. A revised radar is a draft. The frontend must show `RadarDiff` and wait for user confirmation before search.
4. Result feedback must use `trigger = "result_feedback"` and structured fields (`expectedOpportunityType`, `rejectedReason`, `rejectedCardTitles`, `freeText`) to change radar strategy. It must not only append text to `description`.
5. Q.7 does not implement full version history, but contracts and naming must leave room for `versionHistory`, `diffHistory`, `confirmedVersion`, and `draftVersion`.

---

## File Structure

- `src/schema/radar-version-spec.ts`  
  Add revision trigger, feedback, diff, request, and result contracts.

- `src/agents/radar-version-reviser.ts`  
  New focused module that creates revised specs, radar versions, and diffs from previous version + user feedback.

- `src/agents/radar-version-builder.ts`  
  Add reusable version-number helpers so revision logic does not infer version only from free text.

- `src/api/types.ts`  
  Add `RadarReviseRequest` and `RadarReviseResponseData`.

- `src/api/routes/radars.ts`  
  Add `POST /api/radars/revise` as stateless revision endpoint.

- `web/radar-profile.js`  
  Add revision mode, version diff rendering, and confirm-after-revision behavior.

- `web/watch-result.js`  
  Add result feedback entry points that revise the radar before retrying search.

- `scripts/verify-q7-radar-evolution.ts`  
  New focused contract/API/unit verification for Q.7.

- `scripts/verify-q7-ai-competition-demo.mjs`  
  New browser or API-path smoke for AI competition V1.0 → V1.1 → V1.2.

- `scripts/verify-mvp-ux.ts` and/or `scripts/verify-mvp-browser-smoke.ts`  
  Extend only enough to verify customer-visible revision UI exists and existing main path remains intact.

- `package.json`  
  Add `verify:q7` and keep it outside live-only scripts unless explicitly configured.

## Milestone Split

Q.7 should be implemented in two commits.

- Commit 1: `Q.7-A: add radar revision contract and API`
- Commit 2: `Q.7-B: add radar revision UI and AI competition demo smoke`

Stop after Q.7-B and report results. Do not start Random 20, Golden 20, WeChat source, N/O, or Aliyun in this milestone.

---

### Task 0: Freeze Baseline

**Files:**
- Read only: `Q6_J_No_Card_Funnel_Analysis.md`
- Read only: `package.json`

- [ ] Record the current commit SHA.

Run:

```bash
git rev-parse --short HEAD
```

Expected: current baseline is `98b8e83` or a later Q.6-J commit.

- [ ] Run baseline verification before touching code.

Run:

```bash
PATH=/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin:$PATH node --run typecheck
PATH=/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin:$PATH node --run verify:q6
PATH=/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin:$PATH node --run verify:mvp-browser
```

Expected: all pass. If a baseline test fails, stop and diagnose before Q.7 changes.

---

### Task 1: Add Radar Revision Contracts

**Files:**
- Modify: `src/schema/radar-version-spec.ts`
- Modify: `src/api/types.ts`
- Create: `scripts/verify-q7-radar-evolution.ts`
- Modify: `package.json`

- [ ] Add failing assertions for Q.7 contracts.

Create `scripts/verify-q7-radar-evolution.ts` with these checks:

```ts
import type {
  RadarRevisionRequest,
  RadarRevisionResult,
  RadarVersionDiff,
  RadarVersionSpec,
} from "../src/schema/radar-version-spec";

let pass = 0;
let fail = 0;

function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    pass += 1;
    console.log(`PASS ${name}`);
  } else {
    fail += 1;
    console.error(`FAIL ${name}${detail ? `: ${detail}` : ""}`);
  }
}

const diff: RadarVersionDiff = {
  fromVersion: "V1.0",
  toVersion: "V1.1",
  summary: "降低展会资讯，提高可报名比赛入口。",
  added: ["奖金、云资源、上架展示机会"],
  removed: ["学生专属赛事"],
  upweighted: ["AI Agent 大赛", "开发者挑战赛", "云厂商扶持"],
  downweighted: ["展会资讯", "行业趋势新闻"],
  assumptionChanges: ["默认用户为 OPC 创业者，不是学生参赛者。"],
  queryShifts: ["加入 registration/application/deadline/action route 查询方向。"],
  sourceShifts: ["优先官方赛事页、Devpost、云厂商开发者大赛页。"],
  highValueCriteriaChanges: ["必须能形成报名、申请或官方复核动作。"],
  exclusionChanges: ["排除纯展会新闻、培训广告和已结束资讯。"],
};

const previousVersion: RadarVersionSpec = {
  version: "V1.0",
  oneSentencePositioning: "个人开发者的 AI 比赛机会雷达",
  targetUser: "个人开发者",
  businessContext: "寻找 AI 比赛、Hackathon 和开发者机会。",
  opportunityIntents: ["AI 比赛", "Hackathon"],
  highValueCriteria: ["有报名入口"],
  exclusionRules: ["排除培训广告"],
  prioritySourceArchetypes: ["official_event_site"],
  queryFamilies: [],
  scoringRules: [],
  reportTemplate: [],
  missingConfig: [],
  defaultAssumptions: [],
  revisionNotes: [],
  resultBuckets: ["direct_opportunity", "watch_signal", "reference_case", "rejected"],
};

const request: RadarRevisionRequest = {
  previousSpec: {} as RadarRevisionRequest["previousSpec"],
  previousRadarVersion: previousVersion,
  userMessage: "不要展会资讯，我要能报名的比赛",
  trigger: "strategy_adjustment",
};

const result: RadarRevisionResult = {
  spec: {} as RadarRevisionResult["spec"],
  radarVersion: { ...previousVersion, version: "V1.1", revisionNotes: [{ type: "query_shift", detail: diff.summary }] },
  radarDiff: diff,
  suggestedName: "AI 比赛机会雷达",
  confirmationPrompt: "是否按 V1.1 盯一次？",
  shouldSearchAfterConfirm: true,
};

check("RadarVersionDiff exposes version transition", diff.fromVersion === "V1.0" && diff.toVersion === "V1.1");
check("RadarRevisionRequest preserves previous version", request.previousRadarVersion.version === "V1.0");
check("RadarRevisionResult returns revised version", result.radarVersion.version === "V1.1");
check("RadarRevisionResult returns visible diff", result.radarDiff.queryShifts.length > 0);

if (fail > 0) {
  console.error(`Q.7 radar evolution contract: ${pass} PASS / ${fail} FAIL`);
  process.exit(1);
}

console.log(`Q.7 radar evolution contract: ${pass} PASS / 0 FAIL`);
```

- [ ] Add script to `package.json`.

Add:

```json
"verify:q7": "tsx scripts/verify-q7-radar-evolution.ts"
```

- [ ] Run the new test and confirm it fails because types do not exist yet.

Run:

```bash
PATH=/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin:$PATH node --run verify:q7
```

Expected: TypeScript compile failure for missing `RadarRevisionRequest`, `RadarRevisionResult`, or `RadarVersionDiff`.

- [ ] Add the contracts to `src/schema/radar-version-spec.ts`.

Add:

```ts
export type RadarRevisionTrigger =
  | "requirement_correction"
  | "strategy_adjustment"
  | "result_feedback"
  | "source_feedback";

export interface RadarVersionDiff {
  fromVersion: RadarVersionId;
  toVersion: RadarVersionId;
  summary: string;
  added: string[];
  removed: string[];
  upweighted: string[];
  downweighted: string[];
  assumptionChanges: string[];
  queryShifts: string[];
  sourceShifts: string[];
  highValueCriteriaChanges: string[];
  exclusionChanges: string[];
}

export interface RadarResultFeedback {
  rejectedCardTitles?: string[];
  expectedOpportunityType?: string;
  rejectedReason?: string;
  freeText?: string;
}

export interface RadarRevisionRequest {
  description?: string;
  userMessage: string;
  trigger: RadarRevisionTrigger;
  previousSpec: import("./radar-requirement-spec").RadarRequirementSpec;
  previousRadarVersion: RadarVersionSpec;
  resultFeedback?: RadarResultFeedback;
}

export interface RadarRevisionResult {
  spec: import("./radar-requirement-spec").RadarRequirementSpec;
  radarVersion: RadarVersionSpec;
  radarDiff: RadarVersionDiff;
  suggestedName: string;
  confirmationPrompt: string;
  shouldSearchAfterConfirm: boolean;
}
```

- [ ] Add API request/response aliases to `src/api/types.ts`.

Add imports and interfaces:

```ts
import type { RadarRevisionRequest, RadarRevisionResult } from "../schema/radar-version-spec";

export type RadarReviseRequest = RadarRevisionRequest;

export interface RadarReviseResponseData extends RadarRevisionResult {}
```

- [ ] Run focused verification.

Run:

```bash
PATH=/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin:$PATH node --run verify:q7
PATH=/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin:$PATH node --run typecheck
```

Expected: both pass.

---

### Task 2: Implement RadarVersionReviser

**Files:**
- Create: `src/agents/radar-version-reviser.ts`
- Modify: `scripts/verify-q7-radar-evolution.ts`

- [ ] Extend `verify-q7-radar-evolution.ts` with failing behavior tests.

Append:

```ts
import { reviseRadarVersion, nextRadarVersionId } from "../src/agents/radar-version-reviser";

const minor = nextRadarVersionId("V1.0", "minor");
const major = nextRadarVersionId("V1.2", "major");

check("minor version increments decimal", minor === "V1.1", minor);
check("major version increments major and resets minor", major === "V2.0", major);

const revised = reviseRadarVersion({
  previousSpec: request.previousSpec,
  previousRadarVersion: previousVersion,
  userMessage: "我不是学生，我是 OPC 创业者，优先奖金、云资源、能上架展示的比赛。",
  trigger: "requirement_correction",
});

check("revision returns a higher version", revised.radarVersion.version !== previousVersion.version, revised.radarVersion.version);
check("revision diff mentions target correction", revised.radarDiff.added.join(" ").includes("OPC") || revised.radarDiff.summary.includes("OPC"));
check("revision keeps search confirmation gated", revised.shouldSearchAfterConfirm === true);
check("revision writes revision notes", revised.radarVersion.revisionNotes.length > 0);
check("revision updates high value criteria", JSON.stringify(revised.radarVersion.highValueCriteria).includes("奖金") || JSON.stringify(revised.radarVersion.highValueCriteria).includes("云资源"));
check("revision updates exclusions", JSON.stringify(revised.radarVersion.exclusionRules).includes("学生") || JSON.stringify(revised.radarVersion.exclusionRules).includes("展会"));
check("revision updates source strategy", revised.radarVersion.prioritySourceArchetypes.length >= previousVersion.prioritySourceArchetypes.length);
check("revision updates query strategy", revised.radarVersion.queryFamilies.length > previousVersion.queryFamilies.length || revised.radarVersion.opportunityIntents.length >= previousVersion.opportunityIntents.length);
check("revision records default assumptions", JSON.stringify(revised.radarVersion.defaultAssumptions).includes("创业者") || JSON.stringify(revised.radarVersion.defaultAssumptions).includes("开发者"));
check("revision requires re-confirmation", revised.spec.confirmation_status?.user_confirmed === false);
```

- [ ] Run `verify:q7` and confirm it fails because `radar-version-reviser.ts` does not exist.

- [ ] Create `src/agents/radar-version-reviser.ts`.

Implement the first deterministic generic reviser. The implementation should extract generic revision signals such as identity shift, opportunity-type shift, high-value criteria, exclusions, source preference, action route preference, and result feedback. It must not use an AI competition industry branch.

The reviser should also convert structured `resultFeedback` into radar strategy changes:

- `expectedOpportunityType` → `opportunityIntents`, `highValueCriteria`, and query shifts
- `rejectedReason` → `exclusionRules`, downweighted items, and high-value criteria changes
- `rejectedCardTitles` → revision notes and downweighted examples
- `freeText` → same generic signal extraction as direct user messages

Implementation starter:

```ts
import type {
  RadarRevisionRequest,
  RadarRevisionResult,
  RadarVersionDiff,
  RadarVersionId,
  RadarVersionRevisionNote,
  RadarVersionSpec,
} from "../schema/radar-version-spec";

type VersionBump = "minor" | "major";

function unique(values: Array<string | undefined>, limit = 12): string[] {
  return Array.from(new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))).slice(0, limit);
}

function hasAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

export function nextRadarVersionId(current: RadarVersionId, bump: VersionBump): RadarVersionId {
  const match = /^V(\d+)\.(\d+)$/.exec(current);
  const major = match ? Number(match[1]) : 1;
  const minor = match ? Number(match[2]) : 0;
  if (bump === "major") return `V${major + 1}.0`;
  return `V${major}.${minor + 1}`;
}

function classifyBump(message: string): VersionBump {
  if (hasAny(message, [/不是.*(比赛|客户|线索|申报|招聘|投标)/, /不要.*我要/, /改成.*(客户|代理|投标|申报|招聘)/])) return "major";
  return "minor";
}

function buildDiff(previous: RadarVersionSpec, nextVersion: RadarVersionId, message: string): RadarVersionDiff {
  const wantsRegistrationOnly = hasAny(message, [/不要.*展会/, /不要.*资讯/, /能报名|报名入口|申请入口|registration|application/i]);
  const opc = hasAny(message, [/OPC|创业者|个人开发者|开发者|indie developer/i]);
  return {
    fromVersion: previous.version,
    toVersion: nextVersion,
    summary: wantsRegistrationOnly
      ? "降低展会资讯和泛新闻，提高可报名、可申请、可复核入口。"
      : opc
        ? "将服务对象和高价值标准调整为开发者 / 创业者视角。"
        : "根据用户反馈更新雷达策略。",
    added: unique([
      opc ? "OPC 创业者 / 个人开发者视角" : undefined,
      hasAny(message, [/奖金|云资源|上架|展示/]) ? "奖金、云资源、上架展示机会" : undefined,
      wantsRegistrationOnly ? "可报名 / 可申请 / 有官方入口" : undefined,
    ]),
    removed: unique([
      hasAny(message, [/不是学生|不要学生/]) ? "学生专属赛事优先级" : undefined,
    ]),
    upweighted: unique([
      hasAny(message, [/AI Agent|Agent/i]) ? "AI Agent 赛事" : undefined,
      hasAny(message, [/Hackathon|黑客松/i]) ? "Hackathon / 开发者挑战" : undefined,
      hasAny(message, [/云资源|云厂商/]) ? "云厂商扶持和开发者计划" : undefined,
      wantsRegistrationOnly ? "官方报名页、申请入口、截止信息" : undefined,
    ]),
    downweighted: unique([
      wantsRegistrationOnly ? "展会资讯、行业新闻、趋势文章、赛历但无报名入口页面" : undefined,
      hasAny(message, [/不是学生|不要学生/]) ? "学生专属比赛" : undefined,
    ]),
    assumptionChanges: unique([
      opc ? "默认用户是开发者 / 创业者，不是学生参赛者。" : undefined,
    ]),
    queryShifts: unique([
      wantsRegistrationOnly ? "加入 registration、application、deadline、official challenge 查询方向。" : undefined,
      hasAny(message, [/奖金|云资源|上架|展示/]) ? "加入 prize、cloud credits、showcase、startup program 查询方向。" : undefined,
    ]),
    sourceShifts: unique([
      wantsRegistrationOnly ? "优先官方赛事页、开发者挑战平台、云厂商活动页。" : undefined,
    ]),
    highValueCriteriaChanges: unique([
      wantsRegistrationOnly ? "高价值必须能形成报名、申请、提交或官方复核动作。" : undefined,
    ]),
    exclusionChanges: unique([
      wantsRegistrationOnly ? "排除纯展会新闻、培训广告、行业资讯、无行动入口页面。" : undefined,
      hasAny(message, [/不是学生|不要学生/]) ? "排除仅面向学生身份的机会。" : undefined,
    ]),
  };
}

function diffToRevisionNotes(diff: RadarVersionDiff): RadarVersionRevisionNote[] {
  return [
    ...diff.added.map((detail) => ({ type: "added" as const, detail })),
    ...diff.removed.map((detail) => ({ type: "removed" as const, detail })),
    ...diff.upweighted.map((detail) => ({ type: "upweighted" as const, detail })),
    ...diff.downweighted.map((detail) => ({ type: "downweighted" as const, detail })),
    ...diff.assumptionChanges.map((detail) => ({ type: "assumption_changed" as const, detail })),
    ...diff.queryShifts.map((detail) => ({ type: "query_shift" as const, detail })),
    ...diff.sourceShifts.map((detail) => ({ type: "source_shift" as const, detail })),
  ];
}

export function reviseRadarVersion(input: RadarRevisionRequest): RadarRevisionResult {
  const previous = input.previousRadarVersion;
  const message = `${input.userMessage}\n${input.resultFeedback?.freeText ?? ""}`;
  const nextVersion = nextRadarVersionId(previous.version, classifyBump(message));
  const diff = buildDiff(previous, nextVersion, message);
  const nextRadarVersion: RadarVersionSpec = {
    ...previous,
    version: nextVersion,
    oneSentencePositioning: previous.oneSentencePositioning,
    targetUser: hasAny(message, [/OPC|创业者|个人开发者|开发者/i])
      ? "个人开发者 / OPC 创业者"
      : previous.targetUser,
    highValueCriteria: unique([...diff.highValueCriteriaChanges, ...diff.added, ...(previous.highValueCriteria ?? [])], 12),
    exclusionRules: unique([...diff.exclusionChanges, ...diff.downweighted.map((item) => `降权：${item}`), ...(previous.exclusionRules ?? [])], 12),
    prioritySourceArchetypes: unique([...diff.sourceShifts, ...(previous.prioritySourceArchetypes ?? [])], 12),
    defaultAssumptions: unique([...diff.assumptionChanges, ...(previous.defaultAssumptions ?? [])], 12),
    revisionNotes: diffToRevisionNotes(diff),
  };
  return {
    spec: {
      ...input.previousSpec,
      radar_version: nextRadarVersion,
      confirmation_status: {
        ...(input.previousSpec.confirmation_status ?? {}),
        status: "confirmation_card_generated",
        user_confirmed: false,
        last_user_feedback: input.userMessage,
        revision_count: (input.previousSpec.confirmation_status?.revision_count ?? 0) + 1,
      },
    },
    radarVersion: nextRadarVersion,
    radarDiff: diff,
    suggestedName: nextRadarVersion.oneSentencePositioning || "我的机会雷达",
    confirmationPrompt: `我已把雷达升级为 ${nextVersion}。请确认是否按 ${nextVersion} 盯一次。`,
    shouldSearchAfterConfirm: true,
  };
}
```

Before finalizing Task 2, add a focused result-feedback test:

```ts
const feedbackRevision = reviseRadarVersion({
  previousSpec: revised.spec,
  previousRadarVersion: revised.radarVersion,
  userMessage: "这些结果不对",
  trigger: "result_feedback",
  resultFeedback: {
    expectedOpportunityType: "可报名 AI 比赛",
    rejectedReason: "不要展会资讯和行业新闻",
    rejectedCardTitles: ["某 AI 展会资讯"],
    freeText: "我要能报名、能提交作品的入口。",
  },
});

check("result feedback stays structured", feedbackRevision.spec.confirmation_status?.last_user_feedback?.includes("这些结果不对") === true);
check("result feedback changes exclusions", JSON.stringify(feedbackRevision.radarVersion.exclusionRules).includes("展会"));
check("result feedback changes high value criteria", JSON.stringify(feedbackRevision.radarVersion.highValueCriteria).includes("报名") || JSON.stringify(feedbackRevision.radarVersion.highValueCriteria).includes("提交"));
check("result feedback changes query/source shifts", feedbackRevision.radarDiff.queryShifts.length + feedbackRevision.radarDiff.sourceShifts.length > 0);
```

- [ ] Run focused tests.

Run:

```bash
PATH=/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin:$PATH node --run verify:q7
PATH=/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin:$PATH node --run typecheck
```

Expected: pass.

---

### Task 3: Add Revision API

**Files:**
- Modify: `src/api/routes/radars.ts`
- Modify: `scripts/verify-q7-radar-evolution.ts`

- [ ] Extend `verify-q7-radar-evolution.ts` to call the API.

Add:

```ts
import { createApp } from "../src/api/app";
import { createAppContext } from "../src/api/context";

const app = createApp(createAppContext());
const apiResponse = await app.request("/api/radars/revise", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    previousSpec: request.previousSpec,
    previousRadarVersion: previousVersion,
    userMessage: "不要展会资讯，我要能报名的比赛",
    trigger: "strategy_adjustment",
  }),
});
const apiJson = await apiResponse.json() as { success: boolean; data?: RadarRevisionResult; error?: { code: string; message: string } };

check("POST /api/radars/revise returns 200", apiResponse.status === 200, String(apiResponse.status));
check("POST /api/radars/revise succeeds", apiJson.success === true, JSON.stringify(apiJson.error ?? {}));
check("revision API returns V1.1", apiJson.data?.radarVersion.version === "V1.1", apiJson.data?.radarVersion.version ?? "");
check("revision API returns diff", Boolean(apiJson.data?.radarDiff.summary), JSON.stringify(apiJson.data?.radarDiff ?? {}));
```

- [ ] Run `verify:q7` and confirm the endpoint test fails with 404.

- [ ] Add imports to `src/api/routes/radars.ts`.

Add:

```ts
import type { RadarReviseRequest, RadarReviseResponseData } from "../types";
import { reviseRadarVersion } from "../../agents/radar-version-reviser";
```

- [ ] Add `POST /revise` before `GET /:id`.

Implementation:

```ts
  app.post("/revise", async (c) => {
    const start = Date.now();
    let body: RadarReviseRequest;
    try {
      body = await c.req.json();
    } catch {
      return c.json(errorResponse("BAD_REQUEST", "请求体不是合法 JSON", Date.now() - start, 400), 400);
    }
    if (!body.previousSpec || !body.previousRadarVersion || !body.userMessage || !body.trigger) {
      return c.json(errorResponse("BAD_REQUEST", "previousSpec、previousRadarVersion、userMessage、trigger 必填", Date.now() - start, 400), 400);
    }
    try {
      const result = reviseRadarVersion(body);
      return c.json({
        success: true,
        data: result satisfies RadarReviseResponseData,
        error: null,
        duration_ms: Date.now() - start,
      } satisfies ApiResponse<RadarReviseResponseData>);
    } catch (err) {
      return c.json(
        errorResponse("RADAR_REVISION_FAILED", err instanceof Error ? err.message : String(err), Date.now() - start, 500),
        500,
      );
    }
  });
```

- [ ] Run focused tests.

Run:

```bash
PATH=/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin:$PATH node --run verify:q7
PATH=/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin:$PATH node --run verify:chat-mvp:api
```

Expected: pass.

- [ ] Commit Q.7-A.

Run:

```bash
git add src/schema/radar-version-spec.ts src/api/types.ts src/agents/radar-version-reviser.ts src/api/routes/radars.ts scripts/verify-q7-radar-evolution.ts package.json
git commit -m "Q.7-A: add radar revision contract and API"
```

---

### Task 4: Add Strategy Card Revision UI

**Files:**
- Modify: `web/radar-profile.js`
- Modify: `scripts/verify-mvp-ux.ts`

- [ ] Add failing static UX assertions.

In `scripts/verify-mvp-ux.ts`, add checks that `web/radar-profile.js` contains:

```ts
check("Q7 revision API is called from profile UI", profileJs.includes("/api/radars/revise"));
check("Q7 revision card explains version diff", profileJs.includes("本次版本变化") || profileJs.includes("radarDiff"));
check("Q7 continue modify explains radar upgrade", profileJs.includes("升级雷达") || profileJs.includes("先升级雷达"));
```

- [ ] Run `node --run verify:mvp-ux` and confirm these fail.

- [ ] Add revision state to `web/radar-profile.js`.

Add:

```js
  function renderRadarDiff(diff) {
    if (!diff) return "";
    const rows = [
      ["新增", diff.added],
      ["移除", diff.removed],
      ["提高权重", diff.upweighted],
      ["降低权重", diff.downweighted],
      ["默认假设变化", diff.assumptionChanges],
      ["查询方向变化", diff.queryShifts],
      ["来源方向变化", diff.sourceShifts],
      ["高价值标准变化", diff.highValueCriteriaChanges],
      ["排除规则变化", diff.exclusionChanges],
    ].filter(([, value]) => Array.isArray(value) && value.length > 0);
    if (rows.length === 0) return "";
    return `
      <div class="radar-diff-panel">
        <h4>本次版本变化：${escapeHtml(diff.fromVersion)} → ${escapeHtml(diff.toVersion)}</h4>
        <p>${escapeHtml(diff.summary || "")}</p>
        ${rows.map(([label, values]) => renderProfileField(label, values)).join("")}
      </div>
    `;
  }
```

- [ ] Render diff in `renderProfileCard`.

Add after revision notes:

```js
          ${renderRadarDiff(draft.radarDiff)}
```

- [ ] Replace the current edit button behavior with a revision input card.

Add:

```js
  function renderRevisionInput(draft, trigger) {
    const root = document.getElementById("watch-result-root");
    if (!root) return;
    const version = radarVersionFromDraft(draft);
    root.innerHTML = `
      <section class="radar-profile-card revision-card">
        <div class="watch-result-header">
          <h3>继续修改雷达 ${escapeHtml(version.version)}</h3>
          <p>告诉我哪里不对，我会先升级雷达，再让你确认。</p>
        </div>
        <textarea id="radar-revision-message" rows="5" placeholder="例如：我不是学生，我是 OPC 创业者；不要展会资讯，只要可报名比赛；优先奖金、云资源和展示机会"></textarea>
        <div class="radar-profile-actions">
          <button id="btn-submit-radar-revision" class="btn-primary">生成新版雷达</button>
          <button id="btn-cancel-radar-revision">返回当前版本</button>
        </div>
      </section>
    `;
    document.getElementById("btn-submit-radar-revision")?.addEventListener("click", () => submitRadarRevision(trigger || "strategy_adjustment"));
    document.getElementById("btn-cancel-radar-revision")?.addEventListener("click", () => renderProfileCard(currentDraft));
  }

  async function submitRadarRevision(trigger) {
    if (!currentDraft) return;
    const userMessage = document.getElementById("radar-revision-message")?.value?.trim() || "";
    if (!userMessage) {
      if (window.showToast) showToast("请先告诉我哪里不对", "warning");
      return;
    }
    const gen = await postJson("/api/radars/revise", {
      previousSpec: currentDraft.spec,
      previousRadarVersion: radarVersionFromDraft(currentDraft),
      userMessage,
      trigger,
      description: currentDraft.description,
    });
    currentDraft = {
      ...currentDraft,
      description: `${currentDraft.description}\n\n[雷达修订]\n${userMessage}`,
      spec: gen.data.spec,
      radarVersion: gen.data.radarVersion,
      radarDiff: gen.data.radarDiff,
      suggestedName: gen.data.suggestedName || currentDraft.suggestedName,
    };
    renderProfileCard(currentDraft);
  }
```

- [ ] Update the edit button listener.

Replace old callback with:

```js
    document.getElementById("btn-edit-radar-profile")?.addEventListener("click", () => renderRevisionInput(currentDraft, "strategy_adjustment"));
```

- [ ] Run checks.

Run:

```bash
PATH=/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin:$PATH node --run verify:mvp-ux
PATH=/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin:$PATH node --run verify:q7
```

Expected: pass.

---

### Task 5: Add Result Feedback Revision Entry

**Files:**
- Modify: `web/watch-result.js`
- Modify: `web/radar-profile.js`
- Modify: `scripts/verify-mvp-ux.ts`

- [ ] Add failing UX assertions.

In `scripts/verify-mvp-ux.ts`, add:

```ts
check("Q7 result page has radar feedback entry", watchResultJs.includes("这些结果不对，修改雷达"));
check("Q7 result feedback dispatches radar revision", watchResultJs.includes("openRadarResultFeedback"));
check("Q7 profile UI can receive result feedback", profileJs.includes("showRadarRevisionFromResultFeedback"));
```

- [ ] Run `verify:mvp-ux` and confirm failure.

- [ ] Add a result feedback button in `web/watch-result.js`.

Add inside unsaved and saved action areas:

```html
<button id="btn-result-feedback-revise" class="btn-secondary">这些结果不对，修改雷达</button>
```

- [ ] Add handler:

```js
    document.getElementById("btn-result-feedback-revise")?.addEventListener("click", openRadarResultFeedback);
```

- [ ] Add function:

```js
  function openRadarResultFeedback() {
    if (!currentResult) return;
    if (window.showRadarRevisionFromResultFeedback) {
      window.showRadarRevisionFromResultFeedback({
        ...currentResult,
        resultFeedback: {
          rejectedCardTitles: (currentResult.opportunityCards || []).slice(0, 3).map((card) => card.title).filter(Boolean),
        },
      });
    }
  }
```

- [ ] Add `showRadarRevisionFromResultFeedback` to `web/radar-profile.js`.

Implementation:

```js
  function showRadarRevisionFromResultFeedback(result) {
    if (!result) return;
    switchToResult();
    currentDraft = {
      description: result.description || "",
      spec: result.spec,
      profile: result.profile || profileFromSpec(result.spec),
      radarVersion: result.radarVersion || result.spec?.radar_version,
      suggestedName: result.suggestedName || "我的机会雷达",
      radarId: result.radarId,
      resultFeedback: result.resultFeedback || {},
      clarification: { score: 100, questions: [], shouldAsk: false, needsBackground: false, defaultAssumptions: [] },
      clarificationRounds: 0,
    };
    renderRevisionInput(currentDraft, "result_feedback");
  }
```

Expose:

```js
  window.showRadarRevisionFromResultFeedback = showRadarRevisionFromResultFeedback;
```

- [ ] Update `submitRadarRevision` to include `resultFeedback`.

In request body:

```js
      resultFeedback: currentDraft.resultFeedback || undefined,
```

- [ ] Run checks.

Run:

```bash
PATH=/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin:$PATH node --run verify:mvp-ux
PATH=/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin:$PATH node --run verify:mvp-browser
```

Expected: pass.

---

### Task 6: Add AI Competition Demo Smoke

**Files:**
- Create: `scripts/verify-q7-ai-competition-demo.mjs`
- Modify: `package.json`

- [ ] Create `scripts/verify-q7-ai-competition-demo.mjs`.

Use API-path smoke first, browser smoke only if existing harness makes it cheap:

```js
import { createApp } from "../src/api/app.ts";
import { createAppContext } from "../src/api/context.ts";

let pass = 0;
let fail = 0;
function check(name, condition, detail = "") {
  if (condition) {
    pass += 1;
    console.log(`PASS ${name}`);
  } else {
    fail += 1;
    console.error(`FAIL ${name}${detail ? `: ${detail}` : ""}`);
  }
}

async function post(app, path, body) {
  const response = await app.request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await response.json();
  check(`${path} returns 200`, response.status === 200, String(response.status));
  check(`${path} succeeds`, json.success === true, JSON.stringify(json.error ?? {}));
  return json.data;
}

const app = createApp(createAppContext());

const initial = await post(app, "/api/radars/generate", {
  description: "我是个人开发者，想找 AI 比赛机会，帮我盯一下。",
});
check("initial version is V1.0", initial.radarVersion?.version === "V1.0", initial.radarVersion?.version ?? "");

const v11 = await post(app, "/api/radars/revise", {
  previousSpec: initial.spec,
  previousRadarVersion: initial.radarVersion || initial.spec.radar_version,
  userMessage: "我不是学生，我是 OPC 创业者，优先奖金、云资源、能上架展示的比赛。",
  trigger: "requirement_correction",
});
check("first revision upgrades version", v11.radarVersion.version !== "V1.0", v11.radarVersion.version);
check("first revision has visible diff", v11.radarDiff.summary.length > 0);
check("first revision captures entrepreneur/developer intent", /创业者|开发者|OPC/i.test(JSON.stringify(v11.radarVersion)));

const v12 = await post(app, "/api/radars/revise", {
  previousSpec: v11.spec,
  previousRadarVersion: v11.radarVersion,
  userMessage: "不要展会资讯，我要能报名的比赛。",
  trigger: "strategy_adjustment",
});
check("second revision upgrades version again", v12.radarVersion.version !== v11.radarVersion.version, v12.radarVersion.version);
check("second revision downweights expo/news", /展会|资讯|新闻/.test(JSON.stringify(v12.radarDiff.downweighted)));
check("second revision upweights registration", /报名|申请|入口|registration|application/i.test(JSON.stringify(v12.radarVersion)));

const search = await post(app, "/api/search", {
  spec: {
    ...v12.spec,
    confirmation_status: {
      ...(v12.spec.confirmation_status || {}),
      status: "confirmed",
      user_confirmed: true,
      confirmed_at: new Date().toISOString(),
    },
  },
  query: "AI Agent Hackathon developer challenge cloud credits competition application",
  max_results: 2,
});
check("confirmed revised radar can search", Array.isArray(search.opportunityCards), "missing cards array");
check("search result keeps radar version strategy", search.searchPlan?.opportunityStrategy?.radarVersion === v12.radarVersion.version);

if (fail > 0) {
  console.error(`Q.7 AI competition demo: ${pass} PASS / ${fail} FAIL`);
  process.exit(1);
}
console.log(`Q.7 AI competition demo: ${pass} PASS / 0 FAIL`);
```

- [ ] Add script:

```json
"verify:q7:demo": "tsx scripts/verify-q7-ai-competition-demo.mjs"
```

- [ ] Run:

```bash
PATH=/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin:$PATH node --run verify:q7:demo
```

Expected: pass. If it fails because Node cannot import `.ts` from `.mjs`, rename the file to `.ts` and use `tsx scripts/verify-q7-ai-competition-demo.ts`.

---

### Task 7: Full Verification and Commit Q.7-B

**Files:**
- All files modified in Tasks 4-6.

- [ ] Run full required verification.

Run:

```bash
PATH=/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin:$PATH node --run typecheck
PATH=/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin:$PATH node --run verify:q7
PATH=/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin:$PATH node --run verify:q7:demo
PATH=/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin:$PATH node --run verify:q6
PATH=/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin:$PATH node --run verify:q5
PATH=/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin:$PATH node --run verify:api-env
PATH=/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin:$PATH node --run verify:mvp-ux
PATH=/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin:$PATH node --run verify:mvp-browser
PATH=/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin:$PATH node --run verify:all
git diff --check
```

Optional live checks, only with explicit local env:

```bash
PATH=/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin:$PATH CHANCEPING_LOAD_API_ENV=true CHANCEPING_ENABLE_LOCAL_LIVE_LLM=true CHANCEPING_LLM_PROFILE=commercial LLM_MODE=live node --run verify:live-llm
PATH=/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin:$PATH CHANCEPING_LOAD_API_ENV=true CHANCEPING_ENABLE_LOCAL_LIVE_SEARCH=true node --run verify:live-mvp
```

- [ ] Commit Q.7-B.

Run:

```bash
git add web/radar-profile.js web/watch-result.js scripts/verify-mvp-ux.ts scripts/verify-q7-ai-competition-demo.* package.json
git commit -m "Q.7-B: add radar revision UI and demo smoke"
```

---

## Completion Report

After Q.7-B, stop and output:

- modified file list;
- Radar Evolution Engine design summary;
- Radar Version Diff behavior;
- user confirmation flow;
- result feedback revision behavior;
- AI competition demo result;
- test results;
- known issues;
- whether to enter AI competition demo polish / UI packaging;
- whether Random 20/Golden 20 should run now or after demo polish.

## Self-Review

- Q.7 does not depend on Random 20 or Golden 20.
- Q.7 does not implement WeChat or paid source packs.
- Q.7 does not weaken Q.6 gates.
- Q.7 keeps live APIs opt-in and outside `verify:all`.
- The AI competition demo is a validation scenario, not a hardcoded product branch.
- The plan contains explicit files, commands, and expected outcomes for each implementation task.
