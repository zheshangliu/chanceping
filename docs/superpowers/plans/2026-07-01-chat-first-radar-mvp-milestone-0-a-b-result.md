# Chat-First Radar MVP Milestone 0+A+B Result

Date: 2026-07-01
Branch: `rescue/mvp-codex`

## Scope Completed

This batch completed only Milestone 0 + A + B.

- Milestone 0: frozen the current baseline, recorded commit SHA, current product path, and baseline verification.
- Milestone A: added the chat-first radar profile contract and kept `OpportunityAssessment` outside `RadarRequirementSpec`.
- Milestone B: unified clarification behavior to `MAX_CLARIFICATION_ROUNDS = 2`, one natural question per round, with a default-continue escape hatch.

Not executed in this batch:

- Milestone C/D/E/F.
- V1.7 source transparency.
- Feedback tuning.
- Radar marketplace.
- Team collaboration.
- Paid system.
- Live API verification.

## Baseline Freeze

Baseline commit recorded before A+B:

```text
88b404a29179c9ecd908d10de6a646ac56b48c08
```

Baseline documentation commit:

```text
f295ad5 docs: freeze chat MVP baseline
```

Baseline product path recorded:

```text
Home input or template
→ requirement understanding
→ clarification gate when needed
→ profile confirmation
→ run radar
→ opportunity cards
→ Markdown report
→ save as long-term radar
→ My Radars detail can show opportunities and reports
```

## Contract Changes

`RadarRequirementSpec` now stores only long-term profile and strategy fields:

- `primary_subject`
- `profile_version`
- `profile_summary`
- `risk_policy`
- `report_blueprint`
- `scoring_policy`

`OpportunityAssessment` is defined separately in `radar-mvp-contracts.ts` and binds to:

```text
opportunityId + radarId + runId + profileRevisionId
```

`radar-requirement-spec.ts` does not import `OpportunityAssessment`, avoiding a type cycle.

## Interaction Changes

Clarification gate behavior:

- Maximum clarification rounds: 2.
- One visible natural-language question per round.
- Users can always choose `先按默认理解继续`.
- When the limit is reached, the app generates the profile and records remaining uncertainty as assumptions.
- Backend `questions_to_confirm` / `requirementConfidence` are reused first.
- Frontend fallback questions are used only when backend questions are missing.

Template path:

- Templates can skip clarification.
- Users can still adjust the generated profile.

## Custom Radar Fixes

Custom radar no longer falls back to `ai_competition`.

Implemented safeguards:

- `custom` is a first-class `RadarType` for local and Meilisearch stores.
- `kindToRadarType(custom)` returns `custom`.
- Scheduled custom radar runs stay `custom`.
- Mock search supports generic opportunity, lead, order, customer, procurement, hiring, and collaboration semantics.
- Legacy partial custom specs are tolerated so old saved radars can still run.
- Study-tour / BD lead generation keeps `研学文旅 / 国企 / 企业 / 客户线索 / 订单` semantics and does not output AI competition wording.

## Quota

Free users can own 3 custom long-term radars during MVP.

Updated and verified:

- Quota checker.
- Frontend/static verification text.
- V1.5 quota test.

## Verification Results

Commands run:

```bash
npm run typecheck
npm run verify:chat-mvp:contract
npm run verify:v15:api
npm run verify:v15:e2e
npm run verify:mvp-ux
npm run verify:mvp-browser
npm run verify:v16:radar-ids
npm run verify:all
```

Results:

```text
npm run typecheck: PASS
npm run verify:chat-mvp:contract: 17 PASS / 0 FAIL
npm run verify:v15:api: 48 PASS / 0 FAIL
npm run verify:v15:e2e: PASS
  - V1.5 E2E: 40 PASS / 0 FAIL
  - V1.3 E2E: 43 PASS / 0 FAIL
  - Task038: 75 PASS / 0 FAIL
  - Task022: 73 PASS / 0 FAIL
  - Task028: 119 PASS / 0 FAIL
npm run verify:mvp-ux: 47 PASS / 0 FAIL
npm run verify:mvp-browser: PASS, exit code 0
npm run verify:v16:radar-ids: 27 PASS / 0 FAIL
npm run verify:all: PASS
```

`verify:all` does not include live API tests.

## Browser Acceptance Path

Run locally:

```bash
npm run dev
```

Open:

```text
http://localhost:3000/
```

Path 1: ambiguous input should trigger clarification.

```text
1. On home, enter: 我想盯乒乓球比赛
2. Click: 盯机会
3. Expected: show "我还需要确认几个关键点"
4. Expected: only one natural-language question is visible
5. Answer with role / region / time window
6. Click: 回答后生成雷达画像
7. Expected: show profile confirmation card
8. Click: 确认，开始盯机会
9. Expected: opportunity cards and Markdown report summary appear
```

Path 2: complete input should skip clarification.

```text
1. Enter: 我是乒乓球选手，想盯未来30天内国内外可报名的乒乓球比赛，优先看 ITTF、WTT、中国乒协官网，排除培训广告
2. Click: 盯机会
3. Expected: go directly to "我理解你想建立这样的机会雷达"
4. Click: 确认，开始盯机会
5. Expected: opportunity cards include table-tennis competition semantics
6. Expand full Markdown report
7. Click: 保存为长期雷达，之后持续盯
8. Expected: saved radar can be found in My Radars
```

Path 3: custom business-lead semantics.

```text
1. Enter: 我们是研学文旅公司，想找有研学需求的国企单位和企业，看看能否接到研学订单，优先广东和大湾区，排除纯招聘信息
2. Click: 盯机会
3. Expected: generated profile keeps study-tour / BD lead semantics
4. Expected: profile does not mention AI赛事 or ai_competition
```

## Notes For Jason Review

- This batch intentionally stops before Milestone C.
- `SearchExecutionLog`, `CandidateAccounting`, and full anti-hallucination evidence-status enforcement are still planned for later milestones.
- Source Hints remain MVP-light.
- `api.env` is local-only and was not loaded into production defaults.
- The current worktree contains earlier MVP UX Rescue changes; this document describes the first batch result on top of that working state.

