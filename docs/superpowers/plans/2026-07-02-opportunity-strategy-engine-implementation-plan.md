# Opportunity Strategy Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Derive and execute an auditable opportunity strategy from every Radar Version, then verify the improvement with Golden 20.

**Architecture:** Extend the existing Q.1 planner with a typed `OpportunityStrategy` rather than introducing another search pipeline. Preserve strategy metadata through provider execution, semantic classification, cards, raw candidates, and reports; keep legacy radars compatible through normalization.

**Tech Stack:** TypeScript, Hono, local JSON stores, existing search providers, DeepSeek commercial profile, Puppeteer browser smoke tests.

---

### Task 1: Strategy Contract and Planner

**Files:**
- Create: `src/search/opportunity-strategy.ts`
- Modify: `src/schema/radar-mvp-contracts.ts`
- Modify: `src/schema/radar-version-spec.ts`
- Modify: `src/search/search-intent-planner.ts`
- Test: `scripts/verify-chat-mvp-contract.ts`

- [x] Add failing assertions that V1.1 preserves channel, customer, and association intent types, controlled source archetypes, explicit query variants, priorities, and the 5 x 3 cap.
- [x] Run `node --run verify:chat-mvp:contract` and confirm the new assertions fail because current intent normalization collapses lead subtypes.
- [x] Add `OpportunityStrategy`, controlled source archetype ids, explicit query variant types, source normalization, and strategy derivation from `RadarVersionSpec`.
- [x] Run the contract verification and confirm all assertions pass.

### Task 2: Semantic Result Buckets

**Files:**
- Modify: `src/schema/radar-mvp-contracts.ts`
- Modify: `src/search/types.ts`
- Modify: `src/search/orchestrator.ts`
- Modify: `src/search/opportunity-scorer.ts`
- Test: `scripts/verify-chat-mvp-api.ts`

- [x] Add failing provider-path assertions for `channel_partner_lead`, `customer_lead`, and `association_directory` classification and card eligibility.
- [x] Run `node --run verify:chat-mvp:api` and confirm the assertions fail on the current five-bucket contract.
- [x] Preserve the expanded semantic type through results, raw candidates, assessments, cards, disclaimers, quality filtering, and URL priority.
- [x] Run API verification and confirm direct and lead cards are actionable while directories, watch signals, reference cases, and rejected results remain outside key cards unless a directory has a concrete action route.

### Task 3: Report Action Layer

**Files:**
- Modify: `src/agents/radar-report-generator.ts`
- Test: `scripts/verify-report-template.ts`

- [x] Add failing report assertions for channel partner, customer, and association-directory actions and honest evidence labels.
- [x] Run `node --run verify:report-template` and confirm the report lacks subtype-specific actions.
- [x] Extend the existing action layer with subtype-specific angles, preparation gaps, contact-confirmation actions, risks, and monitoring keywords.
- [x] Run report verification and confirm all action-layer assertions pass.

### Task 4: Limited Retry

**Files:**
- Modify: `src/agents/deepseek-adapter.ts`
- Test: `scripts/verify-live-llm.ts`
- Test: `scripts/verify-chat-mvp-api.ts`

- [x] Add failing assertions that a first DeepSeek HTTP 500 and a first provider fetch failure retry exactly once, while HTTP 400 does not retry.
- [x] Run focused verifications and confirm DeepSeek 500 currently fails without retry.
- [x] Add one retry for network errors, HTTP 429, and HTTP 5xx while preserving explicit final failures and redacted logs.
- [x] Run focused verifications and confirm retry behavior passes without mock fallback.

### Task 5: Full Verification and Browser Acceptance

**Files:**
- Modify if required by observed regressions: `scripts/verify-mvp-browser-smoke.ts`

- [x] Run all required type, API, UX, browser, live search, live LLM, V1.5/V1.6, and mock-safe aggregate commands.
- [x] Use the in-app browser to run the B2B SaaS V1.0 to retail V1.1 flow and inspect the resulting cards and report.
- [x] Fix only reproduced Q.2 regressions with a failing test first, then rerun the affected and aggregate checks.
- [x] Commit Q.2 as `Milestone Q.2: add opportunity strategy engine`.

### Task 6: Golden 20 Rerun

**Files:**
- Modify: `Golden_20_User_Simulation_Report.md`
- Modify if report-only support is required: `scripts/golden-20-browser-baseline.mjs`

- [ ] Run Golden 20 with commercial DeepSeek and local live search enabled, without changing product logic during the run.
- [ ] Record all 20 flows, quota releases, second reports, console errors, semantic result quality, and action-layer quality.
- [ ] Compare strong/partial/fail counts with the previous 8/11/1 baseline and state whether Q.2 met the 15/5/2 target.
- [ ] Commit the immutable rerun report as `Milestone Q.2: rerun Golden 20`.

## Self-Review

- Every Q.2 requirement maps to one task.
- The strategy contract uses `customer_lead`, not the retail-specific legacy name.
- Query limits are consistently two or three per theme and fifteen per run.
- Live tests remain outside `verify:all`.
- No step enables production live mode or commits `api.env`.
