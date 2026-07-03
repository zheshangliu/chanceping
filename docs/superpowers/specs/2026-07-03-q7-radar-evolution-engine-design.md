# Milestone Q.7 Radar Evolution Engine Design

## Product Decision

Q.6 ends at Q.6-J. Q.7 starts the product core: every customer message should improve the radar version instead of creating a disconnected new profile. The MVP should prove that ChancePing is not just an AI search tool, but a living opportunity radar that can be corrected, confirmed, run, and corrected again.

Q.7 first round does not require Random 20, Golden 20, login, paid plans, source-marketplace, WeChat source, large UI rebuild, V1.7 source transparency, or further Q.6 industry-specific filtering. Random 20 and Golden 20 move after Q.7, where they test whether radar revision improves unfamiliar industries.

## Execution Guardrails

Q.7-A / Q.7-B must follow these guardrails:

1. The revision engine can start deterministic, but it must be implemented as generic radar revision patterns. The AI competition path is a demo scenario, not an `if AI competition` product branch.
2. Tests must verify structured `RadarVersionSpec` changes, not only diff copy. A valid revision must update relevant fields such as `highValueCriteria`, `exclusionRules`, `prioritySourceArchetypes`, `queryFamilies` or `opportunityIntents`, `defaultAssumptions`, and `confirmation_status.user_confirmed = false`.
3. User confirmation gates execution. A revised radar version must show its diff first; search must not run until the user confirms that draft version.
4. Result feedback must be stored as structured revision input. It cannot be only appended to `description`; it must enter the revision flow as `trigger = "result_feedback"` and influence exclusions, high-value criteria, query shifts, and source shifts.
5. Q.7 first round does not add full version history, but names and contracts should leave room for `versionHistory`, `diffHistory`, `confirmedVersion`, and `draftVersion`.

## Goal

Build a generic Radar Revision Loop and use the AI competition radar as the first polished demo scenario.

The target path is:

```text
User describes need
→ Radar V1.0 strategy card
→ User corrects or narrows need
→ Radar V1.1 / V1.2 with visible diff
→ User confirms radar version
→ Search runs from confirmed version
→ User says result is wrong
→ Radar version is revised from result feedback
→ Search runs again from the revised version
```

## Non-Goals

- Do not build a full ChatGPT-style chat app.
- Do not add account login, sharing, payments, marketplace, team collaboration, or deployment.
- Do not implement WeChat / X / Facebook / YouTube sources yet.
- Do not hardcode the AI competition demo as an `if AI competition then ...` product path.
- Do not make Random 20 or Golden 20 a prerequisite for Q.7.
- Do not weaken Q.6 gates: weak pages, observation signals, and beneficiary mismatches must not re-enter key opportunity cards.

## Core Concepts

### Radar Version

`RadarVersionSpec` remains the executable radar definition. It is the source of truth for search themes, query families, high-value criteria, exclusions, source archetypes, scoring, and report blueprint.

Q.7 does not introduce a separate editable profile model. It extends the existing radar version flow.

### Radar Diff

Every revision returns a customer-visible diff:

- `fromVersion`
- `toVersion`
- `summary`
- `added`
- `removed`
- `upweighted`
- `downweighted`
- `assumptionChanges`
- `queryShifts`
- `sourceShifts`
- `highValueCriteriaChanges`
- `exclusionChanges`

The diff is not a verified fact. It is an explanation of how the radar strategy changed.

### Version Numbering

- `V1.0` is the first strategy card.
- Minor revisions use `V1.1`, `V1.2`, `V1.3` when the target user and main opportunity category remain stable.
- Major revisions use `V2.0`, `V3.0` when the user changes the core intent, target customer, opportunity type, or action model.

Examples:

- "I am not a student; I am an OPC entrepreneur" → minor or major depending on current target user. If V1.0 was student-oriented, upgrade to `V2.0`; if V1.0 already said developer/entrepreneur, upgrade to `V1.1`.
- "Do not show exhibition news; only show competitions with registration entry" → minor revision.
- "I do not want competitions; I want customer leads" → major revision.

### Confirmation Rule

Revision is draft-first. The system must not mutate a saved radar or run search until the user confirms the new radar version.

For an unsaved radar:

```text
previous draft + user correction
→ revised draft
→ user confirms
→ search
```

For a saved radar:

```text
saved radar V1.2 + user correction
→ revised draft V1.3
→ user confirms
→ PUT /api/radars/:id with new spec
→ rerun search
```

## Data Design

### New Types

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

export interface RadarRevisionRequest {
  description?: string;
  userMessage: string;
  trigger: RadarRevisionTrigger;
  previousSpec: RadarRequirementSpec;
  previousRadarVersion: RadarVersionSpec;
  resultFeedback?: {
    rejectedCardTitles?: string[];
    expectedOpportunityType?: string;
    rejectedReason?: string;
    freeText?: string;
  };
}

export interface RadarRevisionResult {
  spec: RadarRequirementSpec;
  radarVersion: RadarVersionSpec;
  radarDiff: RadarVersionDiff;
  suggestedName: string;
  confirmationPrompt: string;
  shouldSearchAfterConfirm: boolean;
}
```

### Persistence

Q.7 first round does not add full version history storage. The current spec stores the current `radar_version`. The latest diff is returned to the frontend and is also folded into `radar_version.revisionNotes`.

Full version history can be added later as a separate milestone. Q.7 should avoid names that block future `versionHistory`, `diffHistory`, `confirmedVersion`, or `draftVersion` storage.

## API Design

### `POST /api/radars/revise`

Stateless draft revision for the unsaved main path.

Request:

```json
{
  "previousSpec": {},
  "previousRadarVersion": {},
  "userMessage": "不要展会资讯，我要能报名的比赛",
  "trigger": "strategy_adjustment",
  "resultFeedback": {
    "rejectedCardTitles": ["某 AI 展会资讯"],
    "expectedOpportunityType": "可报名 AI 比赛"
  }
}
```

Response:

```json
{
  "success": true,
  "data": {
    "spec": {},
    "radarVersion": {},
    "radarDiff": {},
    "suggestedName": "AI 比赛机会雷达",
    "confirmationPrompt": "我已把展会资讯降权，只保留可报名比赛入口。是否按 V1.2 盯一次？",
    "shouldSearchAfterConfirm": true
  }
}
```

### `POST /api/radars/:id/revise`

Saved radar draft revision. It does not persist automatically unless `confirmPersist=true` is explicitly passed in a later implementation step. Q.7 first round can use the stateless endpoint for UI and call existing `PUT /api/radars/:id` after user confirmation.

## Revision Engine

Create a focused `RadarVersionReviser` that:

1. Receives previous spec/version and user feedback.
2. Classifies whether the change is minor or major.
3. Produces a revised `RadarVersionSpec`.
4. Produces a `RadarVersionDiff`.
5. Preserves Q.6 anti-hallucination and evidence rules.

The reviser may use live LLM when explicitly enabled. Mock mode must remain deterministic and testable.

### Generic Revision Rules

Do:

- Preserve the original target identity unless the user explicitly changes it.
- Translate negative feedback into exclusion rules and downweighted source/query families.
- Translate positive clarification into high-value criteria, source archetypes, query families, and scoring rules.
- Keep result feedback as structured radar strategy feedback, not as facts about sources.
- Keep search caps unchanged.

Do not:

- Add facts the user did not say.
- Claim registration, fees, eligibility, deadlines, contacts, purchase intent, or hiring intent without evidence.
- Hardcode one-off industry patches.
- Remove Q.6 safety gates.

## Frontend Design

No large chat UI rebuild in Q.7 first round. Reuse the existing customer path:

- `web/radar-profile.js` keeps the strategy card, but adds revision mode.
- `web/watch-result.js` adds result feedback entry points.
- `web/home.js` remains the landing input.

### Radar Strategy Card

The card title becomes version-aware:

```text
雷达 V1.1 策略卡
```

It shows:

- this version watches
- this version excludes
- source priorities
- high-value criteria
- search themes
- missing config
- default assumptions
- version diff

Buttons:

- `确认，按 V1.1 盯一次`
- `继续修改雷达`

### Continue Modify Radar

Clicking `继续修改雷达` opens a short feedback box:

```text
告诉我哪里不对，我会先升级雷达，再让你确认。
```

The user can say:

- "我不是学生，我是 OPC 创业者"
- "不要展会资讯，只要可报名比赛"
- "优先奖金、云资源和展示机会"

The system calls `/api/radars/revise`, then displays the new version card and diff.

### Result Feedback

After search results:

- `这些结果不对，修改雷达`
- Optional quick chips:
  - `不是我要的机会类型`
  - `太多资讯 / 展会`
  - `受益人不对`
  - `来源不对`
  - `我要更可行动的结果`

The next step is revision, not blind re-search.

Result feedback must carry structured fields where possible:

- `expectedOpportunityType`
- `rejectedReason`
- `rejectedCardTitles`
- `freeText`

These fields should become strategy changes such as exclusion rules, downweighted result types, high-value criteria changes, query shifts, and source shifts.

## AI Competition Demo

The first polished demo uses:

```text
我是个人开发者，想找 AI 比赛机会，帮我盯一下。
```

Expected path:

```text
Radar V1.0:
AI 比赛 / Hackathon / 开发者挑战 / 云厂商扶持机会雷达

User correction:
我不是学生，我是 OPC 创业者，优先奖金、云资源、能上架展示的比赛。

Radar V1.1 diff:
upweighted: AI Agent, developer challenge, cloud startup support, prize/resource/showcase
downweighted: student-only contests
added exclusions: training ads, exhibition-only news

User correction:
不要展会资讯，我要能报名的比赛。

Radar V1.2 diff:
upweighted: registration page, official event site, application portal, deadline/action route
downweighted: news, trend, exhibition recap, calendar-only pages

Confirm and run:
Search from V1.2 and report separates searched sources, verified facts, model judgment, pending review, failed sources, unchecked sources.
```

This demo must be implemented through the generic revision engine. The test data can use this scenario, but product code must not branch on an AI competition industry template.

## Testing Strategy

Q.7 adds tests but keeps existing Q.6 regressions.

New focused tests:

- contract test for `RadarVersionDiff`
- API test for `/api/radars/revise`
- frontend static UX test for version diff and feedback entry points
- browser smoke for the AI competition V1.0 → V1.1 → V1.2 flow

Required regression commands after implementation:

```bash
node --run typecheck
node --run verify:q7
node --run verify:q6
node --run verify:q5
node --run verify:api-env
node --run verify:live-llm
node --run verify:live-mvp
node --run verify:mvp-browser
node --run verify:all
git diff --check
```

`verify:all` must remain mock-safe. Live LLM and live search remain opt-in only.

## Acceptance Criteria

Q.7 first round is acceptable when:

1. An initial user input generates Radar V1.0.
2. A user correction generates V1.1 or V2.0 with a visible diff.
3. Search does not run until the user confirms the revised version.
4. Result feedback generates another radar revision instead of blind re-search.
5. AI competition demo can show V1.0 → V1.1 → V1.2.
6. Q.6 safety gates remain intact.
7. No API key is printed or committed.
8. `api.env` remains local-only.

## Later Milestones

After Q.7:

1. AI competition demo polish and contest video script.
2. Random 20/30 growth simulation: test revision ability, not one-shot industry success.
3. Golden 20 regression.
4. N/O RC packaging.
5. Aliyun internal test site.
6. Signal Source Premium milestones: WeChat public account search, X, Facebook, YouTube, industry source packs.
