# Q.6-H Primary Source Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent weak social, job-aggregator, and generic procurement documents from becoming key cards, while using at most two bounded queries to recover a named original source.

**Architecture:** Add a pure source-integrity and recovery-query module shared by page classification, ranking, and the live orchestrator. Reserve two slots inside the existing 15-query run cap, execute recovery only for specific named weak candidates, then send recovered results through the existing relevance, page, judge, ranking, evidence, and report gates.

**Tech Stack:** TypeScript, existing SearchOrchestrator and provider registry, Serper/DeepSeek opt-in live diagnostics, `node --run` verification scripts.

---

### Task 1: RED Source Integrity Tests

**Files:**
- Create: `scripts/verify-q6h-primary-source.ts`
- Modify: `package.json`

- [x] Assert Glassdoor/job aggregators cannot become key cards without a company-owned source.
- [x] Assert Douyin/social posts cannot become key cards.
- [x] Assert generic procurement PDFs are observation material, not specific tender cards.
- [x] Assert a specific official procurement notice remains key-card eligible.
- [x] Run `node --run verify:q6h` and confirm failure before production changes.

### Task 2: Source Integrity and Recovery Query Builder

**Files:**
- Create: `src/search/primary-source-recovery.ts`
- Modify: `src/search/candidate-page-type.ts`
- Modify: `src/search/candidate-ranking.ts`

- [x] Classify trusted primary, credible secondary, weak aggregator, weak social, generic document, and unknown sources.
- [x] Downgrade weak aggregator/social and generic documents before the LLM judge can restore them.
- [x] Generate at most two deduplicated official-source queries only when the weak candidate has a specific event, project, organization, or call name.
- [x] Do not generate recovery queries for generic job lists or generic procurement files.
- [x] Keep all judgments explicitly based on search metadata, not verified facts.

### Task 3: Bounded Live Recovery Integration

**Files:**
- Modify: `src/search/orchestrator.ts`
- Modify: `scripts/verify-q6h-primary-source.ts`

- [x] Reserve two recovery slots inside `MAX_SEARCH_QUERIES_PER_RUN=15`.
- [x] Use the first available live provider for primary-source recovery.
- [x] Append recovery query metadata to SearchPlan and SearchExecutionLog.
- [x] Send recovered results through all existing gates.
- [x] Verify a fake provider returns a weak social candidate first, then an official result for the recovery query, with only the official result becoming a card.
- [x] Verify recovery failure or no result does not fall back to mock and does not promote the weak candidate.

### Task 4: Selected 10 Live Diagnostic

**Files:**
- Modify: `Q6_D_Selected_10_Live_Diagnostic.md`

- [x] Run the Selected 10 live diagnostic with Q.6-H enabled.
- [x] Record card count, weak-source downgrades, primary recoveries, and remaining no-card cases.
- [x] Manually inspect the first three cards for obvious aggregators, social posts, and generic documents.
- [x] Do not count weak cards as success merely to reach the numerical gate.

### Task 5: Full Verification and Commit

**Files:**
- All Q.6-H files.

- [x] Run `node --run typecheck`.
- [x] Run `node --run verify:q6h`.
- [x] Run `node --run verify:q6d`.
- [x] Run `node --run verify:q6`.
- [x] Run `node --run verify:q5`.
- [x] Run `node --run verify:api-env`.
- [x] Run `node --run verify:q3`.
- [x] Run `node --run verify:live-provider-health`.
- [x] Run `node --run verify:live-llm`.
- [x] Run `node --run verify:live-mvp`.
- [x] Run `node --run verify:mvp-browser`.
- [x] Run `node --run verify:all`.
- [x] Run `git diff --check`.
- [x] Commit with message `Q.6-H: recover trusted primary sources`.
