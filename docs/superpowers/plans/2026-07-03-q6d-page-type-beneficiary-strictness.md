# Q.6-D Page-Type And Beneficiary Strictness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tighten key opportunity card admission by classifying page type, checking beneficiary/action-entry fit, deduplicating near-identical cards, and improving no-card query recovery for AI startup and cross-border e-commerce cases.

**Architecture:** Add a focused page-type classifier used by Q.6-A/Q.6-B/Q.6-C without turning Golden 20 into hard templates. The classifier labels weak page surfaces, the judge fallback/prompt enforces beneficiary plus action-entry fit, ranking/dedupe keeps only diverse high-quality key cards, and query recovery expands action/source query families dynamically from radar version intent terms.

**Tech Stack:** TypeScript, existing `SearchResult` audit fields, Node `tsx` verification scripts, existing Q4 live harness for selected live diagnostics.

---

### Task 1: Q.6-D Offline Contract

**Files:**
- Create: `src/search/candidate-page-type.ts`
- Modify: `src/search/types.ts`
- Create: `scripts/verify-q6d-page-type-beneficiary.ts`
- Modify: `package.json`

- [ ] **Step 1: Write failing tests**

Create `scripts/verify-q6d-page-type-beneficiary.ts` with fixtures proving:
- `department_index`, `xls_summary`, `template_page`, `trend_article`, `policy_plan`, and generic `aggregator_page` are not key-card eligible by default.
- `registration_page`, `tender_notice`, `open_call`, `supplier_onboarding`, `partner_program`, and `company_careers_page` are key-card eligible when beneficiary/action fit matches.
- `directory_page` is downgraded by default, but can remain a lead resource for BD/headhunter/channel scenarios when it contains a contactable list.
- 少儿编程机构 rejects university-student-only programming contests.
- 工业环保设备 rejects renovation/greening pages unless equipment or environmental treatment procurement is explicit.
- 婚庆 company downgrades trend/news/city branding pages lacking hotel/venue/brand/supplier cooperation entry.
- 非遗文创 rejects XLS summary and generic procurement column pages.

- [ ] **Step 2: Run red test**

Run: `node --run verify:q6d`

Expected: FAIL because the script or `candidate-page-type.ts` is missing.

- [ ] **Step 3: Add page-type assessment types**

Add `CandidatePageType`, `CandidatePageTypeAssessment`, and optional `page_type_assessment` to `SearchResult` and `RawCandidateAudit`.

- [ ] **Step 4: Implement page classifier**

Create `candidate-page-type.ts` exporting:
- `assessCandidatePageType(result, spec, options)`
- `isKeyPageEligible(assessment)`
- `applyPageTypeGate(results, spec, options)`

The classifier should use title/snippet/url/source archetype only. It must not claim field-level verification.

- [ ] **Step 5: Verify green**

Run: `node --run verify:q6d`

Expected: PASS for offline page-type, beneficiary, and duplicate contract checks.

### Task 2: Integrate Page-Type And Beneficiary Strictness

**Files:**
- Modify: `src/search/candidate-relevance.ts`
- Modify: `src/search/candidate-llm-judge.ts`
- Modify: `src/search/candidate-ranking.ts`
- Modify: `src/search/orchestrator.ts`

- [ ] **Step 1: Make relevance gate page-aware**

Use page-type assessment to downgrade or reject weak page surfaces before they can become key cards:
- homepage/category/department index: downgrade
- XLS/template: reject or downgrade
- trend/news/policy/calendar/FAQ: downgrade to watch/reference
- generic procurement column: downgrade unless action entry is explicit
- aggregator: downgrade unless no official alternative and action entry is explicit

- [ ] **Step 2: Make judge fallback stricter**

Strengthen fallback and LLM prompt with:
- `beneficiary_fit`: whether the current user benefits.
- `action_owner_fit`: whether the current user can do the action.
- `action_entry_fit`: whether the page has an action entry.
- `page_intent_fit`: whether the page is an opportunity entry instead of navigation/info/template.

- [ ] **Step 3: Keep directory nuance**

Do not hard reject directories. Association/member/company directories can be `business_lead`, `channel_partner_lead`, or `customer_lead` with pending review/contact confirmation if the radar is looking for lead/contact lists.

- [ ] **Step 4: Verify integration**

Run:
- `node --run typecheck`
- `node --run verify:q6d`
- `node --run verify:q6`
- `node --run verify:q5`

Expected: all pass.

### Task 3: Near-Duplicate Dedupe And Query Recovery

**Files:**
- Modify: `src/search/candidate-ranking.ts`
- Modify: `src/search/opportunity-strategy.ts` or existing planner file if query families live elsewhere
- Modify: `scripts/verify-q6d-page-type-beneficiary.ts`

- [ ] **Step 1: Add failing duplicate tests**

Extend `verify:q6d` so same normalized title or same domain/theme duplicate leaves only one key card. The duplicate must remain in audit as watch/overflow, not vanish.

- [ ] **Step 2: Add dedupe in ranking**

Normalize title by removing punctuation, whitespace, repeated years, source suffixes, and common news boilerplate. Enforce:
- same normalized title: one key card
- same domain plus same normalized topic: one key card
- duplicate items become `watch_signal` with ranking reason `near_duplicate_key_candidate`

- [ ] **Step 3: Add query recovery tests**

Extend `verify:q6d` to check AI startup and cross-border e-commerce radar versions generate action/source query hints without hardcoding industry `if/switch` blocks.

- [ ] **Step 4: Implement dynamic recovery**

Use radar version `opportunityIntents`, `sourceArchetypes`, and `queryFamilies` to add action/source variants such as startup program, developer challenge, seller program, marketplace partner, fulfillment partner, and platform campaign application when the radar already implies those intents.

- [ ] **Step 5: Verify**

Run:
- `node --run typecheck`
- `node --run verify:q6d`
- `node --run verify:q6`
- `node --run verify:q5`

Expected: all pass.

### Task 4: Selected 10 Live Diagnostic

**Files:**
- Modify: `scripts/run-q6-selected-live-diagnostics.mjs`
- Create: `Q6_D_Selected_10_Live_Diagnostic.md`

- [ ] **Step 1: Run required checks**

Run:
- `node --run typecheck`
- `node --run verify:q6d`
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

- [ ] **Step 2: Run Selected 10 only**

Start Q4 live server and run `node --run q6:selected-live`. Do not run Golden 8, Random 10, or Golden 20 yet.

- [ ] **Step 3: Gate decision**

Proceed to Golden 8/Random 10/Golden 20 only if:
- at least 8/10 have key cards
- at least 7/10 are manually strong or near-strong
- obvious mismatch in top 3 is 0
- homepage/category/XLS/template/trend/policy pages in top 3 is 0
- duplicate key card titles is 0
- #7 and #12 each have at least one actionable key card or a clear no-card explanation

- [ ] **Step 4: Commit**

Commit message: `Q.6-D: tighten page type and beneficiary gates`
