# Q.6-F Accepted Candidate Card Materialization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure an LLM-accepted candidate that still carries an original key semantic bucket can become a key opportunity card, while keeping aggregators and weak pages out of top cards.

**Architecture:** Fix the narrow handoff between relevance/page gates, candidate judge, and ranking. The judge should restore a key semantic bucket only when it explicitly accepts a candidate and the page type is eligible; ranking should keep aggregators downgraded unless they are the only acceptable evidence.

**Tech Stack:** TypeScript, existing `node --run` verification scripts, local live-search diagnostics.

---

### Task 1: RED Test for Restoring Accepted Key Semantics

**Files:**
- Modify: `scripts/verify-q6d-page-type-beneficiary.ts`
- Modify: `src/search/candidate-llm-judge.ts`

- [ ] Add a fixture where relevance downgraded a direct opportunity to `watch_signal`, but `original_semantic_type` remains `direct_opportunity`, page type is `registration_page`, and the judge accepts it.
- [ ] Run `node --run verify:q6d` and confirm the new test fails because ranking leaves `capStatus=not_key_candidate`.
- [ ] Update `applyCandidateJudgeGate` so an accepted candidate restores `original_semantic_type` when it is one of `direct_opportunity`, `business_lead`, `channel_partner_lead`, or `customer_lead`.
- [ ] Run `node --run verify:q6d` and confirm the new test passes.

### Task 2: Aggregator/Weak Source Ranking Guard

**Files:**
- Modify: `scripts/verify-q6c-candidate-ranking.ts`
- Modify: `src/search/candidate-ranking.ts`

- [ ] Add a fixture with one credible primary/source candidate and one high-scoring aggregator candidate.
- [ ] Run `node --run verify:q6` and confirm the aggregator still risks becoming a key card.
- [ ] Update ranking so `aggregator` authority candidates are downgraded to watch when at least one non-aggregator accepted key candidate exists.
- [ ] Run `node --run verify:q6` and confirm the primary/source candidate remains in key cards while the aggregator is excluded.

### Task 3: Live Selected 10 Verification

**Files:**
- Modify: `Q6_D_Selected_10_Live_Diagnostic.md`

- [ ] Start the Q4 live server with a fresh `data/q6f-live` directory.
- [ ] Run `node --run q6:selected-live`.
- [ ] Confirm Selected 10 has at least 8/10 cases with cards or document if live sources make this impossible without relaxing quality.

### Task 4: Full Verification and Commit

**Files:**
- All modified Q.6-F files.

- [ ] Run `node --run typecheck`.
- [ ] Run `node --run verify:q6d`.
- [ ] Run `node --run verify:q6`.
- [ ] Run `node --run verify:q5`.
- [ ] Run `node --run verify:api-env`.
- [ ] Run `node --run verify:q3`.
- [ ] Run `node --run verify:live-provider-health`.
- [ ] Run `node --run verify:live-llm`.
- [ ] Run `node --run verify:live-mvp`.
- [ ] Run `node --run verify:mvp-browser`.
- [ ] Run `node --run verify:all`.
- [ ] Run `git diff --check`.
- [ ] Commit with message `Q.6-F: materialize accepted candidates into cards`.
