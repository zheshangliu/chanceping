# Q.6-G Search Recall Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve no-card live cases by generating stronger recovery queries and weak-source-to-primary-source searches without relaxing candidate quality gates.

**Architecture:** Keep Q.6 page, judge, and ranking gates intact. Add dynamic recovery variants in the search strategy layer so no-card-prone radar versions search for official entry pages, original sources, and user-executable actions before filtering.

**Tech Stack:** TypeScript, existing `node --run` verification scripts, Serper/DeepSeek opt-in live diagnostics.

---

### Task 1: RED Query Recovery Tests

**Files:**
- Modify: `scripts/verify-q6d-page-type-beneficiary.ts`
- Modify: `src/search/opportunity-strategy.ts`

- [x] Add four profile fixtures or reuse existing ones for go player, headhunter, cross-border ecommerce, and kids coding.
- [x] Assert strategy queries include stronger action/source terms for each no-card case.
- [x] Run `node --run verify:q6d` and confirm the new checks fail.

### Task 2: Implement Dynamic Recovery Variants

**Files:**
- Modify: `src/search/opportunity-strategy.ts`

- [x] Extend `recoveryVariants` with generic no-card-prone intent families:
  - competition/athlete official entry pages.
  - company careers/contact/IPO expansion for headhunter leads.
  - marketplace seller center/campaign registration/supplier portal for cross-border ecommerce.
  - school procurement/after-school service/course cooperation for kids coding institutions.
- [x] Preserve hard caps: at most 3 queries per theme and 5 themes per run.
- [x] Keep variants dynamic regex-based, not Golden industry `if/switch` templates.

### Task 3: Validate Live Selected 10

**Files:**
- Modify: `Q6_D_Selected_10_Live_Diagnostic.md`

- [x] Start Q4 live server with `Q4_DATA_DIR=data/q6g-live`.
- [x] Run `node --run q6:selected-live`.
- [x] Record Selected 10 card count and no-card cases.
- [x] Do not force weak/observational candidates into cards.

### Task 4: Full Verification and Commit

**Files:**
- All Q.6-G modified files.

- [x] Run `node --run typecheck`.
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
- [ ] Commit with message `Q.6-G: improve no-card search recall`.
