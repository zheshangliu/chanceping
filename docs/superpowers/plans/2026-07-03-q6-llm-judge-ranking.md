# Q.6-B/C Candidate Judge And Ranking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve live candidate quality by adding a limited LLM candidate judge, then source authority ranking and card caps before rerunning Golden/Random validation.

**Architecture:** Q.6-B inserts a bounded candidate judge after the deterministic Q.6-A relevance gate and before `ruleFilter`. It never upgrades hard-rule rejects and only uses existing search/evidence fields. Q.6-C adds deterministic source authority/ranking and caps the key card candidate set before scoring/cards.

**Tech Stack:** TypeScript, existing `LLMAdapter`, `SearchOrchestrator`, `SearchResult`, `RadarRequirementSpec`, Node scripts with `tsx`, Serper/DeepSeek only in explicit live validation.

---

### Task 1: Q.6-B Offline Contract

**Files:**
- Create: `src/search/candidate-llm-judge.ts`
- Modify: `src/search/types.ts`
- Create: `scripts/verify-q6b-candidate-judge.ts`
- Modify: `package.json`

- [ ] **Step 1: Write failing tests for candidate judge decisions**

Create `scripts/verify-q6b-candidate-judge.ts` with fixture cases for:
- 少儿编程机构 vs 大学生程序赛 => reject
- 工业环保设备 vs 办公室装修招标 => reject
- 员工福利供应商 vs 福利礼品采购 => accept
- 猎头顾问 vs 聚合招聘页 => downgrade
- 围棋选手 vs 围棋赛事报名 => accept

Expected before implementation: import failure for `judgeCandidateBatch`.

- [ ] **Step 2: Run red test**

Run: `node --run verify:q6b`

Expected: FAIL because `verify:q6b` or `candidate-llm-judge.ts` does not exist.

- [ ] **Step 3: Implement minimal judge**

Create `candidate-llm-judge.ts` exporting:
- `CandidateJudgeType`
- `CandidateJudgeFit`
- `CandidateJudgeDecision`
- `CandidateJudgeAssessment`
- `judgeCandidateBatch(results, spec, llmAdapter, options)`

Behavior:
- In mock mode or if the adapter returns unusable JSON, use a deterministic fallback.
- In live mode, make one batch call for at most `maxCandidates` candidates.
- Never send API keys or env values to LLM.
- Do not judge hard Q.6-A rejects unless explicitly passed by tests.
- Output only structured assessment fields, never new facts.

- [ ] **Step 4: Verify green**

Run: `node --run verify:q6b`

Expected: PASS with all fixture decisions correct.

### Task 2: Q.6-B Orchestrator Integration

**Files:**
- Modify: `src/search/orchestrator.ts`
- Modify: `src/search/types.ts`
- Modify: `scripts/run-q6-selected-live-diagnostics.mjs`

- [ ] **Step 1: Write integration checks**

Extend `verify-q6b-candidate-judge.ts` to call `applyCandidateJudgeGate()` on mixed candidates and verify:
- accepted candidates keep key semantic types
- downgraded key leads become `watch_signal`
- rejected candidates become `rejected`
- existing Q.6-A reject is not upgraded by the LLM judge

- [ ] **Step 2: Run red integration test**

Run: `node --run verify:q6b`

Expected: FAIL because the gate helper is missing or not integrated.

- [ ] **Step 3: Integrate after Q.6-A**

In `SearchOrchestrator.search()`:
- after `applyCandidateRelevanceGate`, collect only accepted candidates and selected downgraded/borderline candidates
- call `judgeCandidateBatch` in live + providerRouting + radar_version path
- set `candidate_judge_assessment` on audited results
- candidateResults should use judge accepted candidates only
- judge downgrade/reject remains visible in `rawCandidates`

- [ ] **Step 4: Verify Q.6-B**

Run:
- `node --run typecheck`
- `node --run verify:q6b`
- `node --run verify:q6`
- `node --run verify:q5`

Expected: all pass.

- [ ] **Step 5: Commit Q.6-B**

Commit message: `Q.6-B: add limited LLM candidate judge`

### Task 3: Q.6-C Source Authority Ranking And Card Caps

**Files:**
- Create: `src/search/candidate-ranking.ts`
- Modify: `src/search/orchestrator.ts`
- Create: `scripts/verify-q6c-ranking.ts`
- Modify: `package.json`

- [ ] **Step 1: Write failing ranking tests**

Create `verify-q6c-ranking.ts` covering:
- official/government/company source outranks aggregator/news
- stale mixed-year result is capped below current official source
- key card candidate count capped at 5 by default
- business/channel/customer leads remain allowed but not over direct official opportunities

- [ ] **Step 2: Run red test**

Run: `node --run verify:q6c`

Expected: FAIL before `candidate-ranking.ts` exists.

- [ ] **Step 3: Implement ranking**

Create `rankCandidateResults(results, spec, options)` returning:
- sorted candidates
- authority score
- cap reason for dropped key candidates

Default cap: 5 key candidates.

- [ ] **Step 4: Integrate before live evidence fetch**

Apply ranking after Q.6-B judge and before `fetchLiveEvidence`, `ruleFilter`, scoring, and card mapping.

- [ ] **Step 5: Verify Q.6-C**

Run:
- `node --run typecheck`
- `node --run verify:q6c`
- `node --run verify:q6b`
- `node --run verify:q6`
- `node --run verify:q5`

Expected: all pass.

- [ ] **Step 6: Commit Q.6-C**

Commit message: `Q.6-C: add source ranking and card caps`

### Task 4: Live Regression Reports

**Files:**
- Modify: `scripts/run-q6-selected-live-diagnostics.mjs`
- Create: `Q6_BC_Selected_10_Live_Diagnostic.md`
- Optionally create/update: `Golden_8_Q6_Live_Regression_Report.md`, `Random_10_Q6_Generalization_Report.md`, `Golden_20_Post_Q6_Rerun_Report.md`

- [ ] **Step 1: Run required mock-safe tests**

Run:
- `node --run typecheck`
- `node --run verify:q6c`
- `node --run verify:q6b`
- `node --run verify:q6`
- `node --run verify:q5`
- `node --run verify:api-env`
- `node --run verify:q3`
- `node --run verify:live-provider-health`
- `node --run verify:live-llm`
- `node --run verify:live-mvp`
- `node --run verify:mvp-browser`
- `node --run verify:all`
- `git diff --check`

- [ ] **Step 2: Run selected live diagnostic**

Start Q4 live server with explicit local live flags and run selected 10. Record:
- cards per case
- obvious mismatch in top 3
- LLM judge accept/downgrade/reject counts
- ranking/cap results

- [ ] **Step 3: Decide gate**

If selected 10 reaches at least 7/10 strong or near-strong and no obvious top-3 mismatch, proceed to Golden 8, Random 10, Golden 20 rerun. Otherwise stop and recommend targeted Q.6-D before full rerun.
