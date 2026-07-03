# Milestone Q.5-R Live Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Validate Q.5 against the eight previously weak live cases, ten unseen industries, and only then the full Golden 20 without changing product logic or overwriting the Q4 baseline report.

**Architecture:** Reuse the existing Q4 isolated live server and browser runner for end-to-end cases. Add a focused Q.5-R report helper that records candidate-funnel evidence and a Random 10 validator that starts from raw user input, calls the commercial DeepSeek profile, inspects the generated `RadarVersionSpec`, and runs selected live-search samples. Keep every live command opt-in and outside `verify:all`.

**Tech Stack:** TypeScript, tsx, Hono API, DeepSeek commercial profile, Serper, Codex in-app Browser.

---

### Task 1: Add Q.5-R acceptance scripts

**Files:**
- Create: `scripts/q5-r-validation.ts`
- Create: `scripts/verify-q5-r-random10.ts`
- Modify: `package.json`

- [ ] Add report builders for Golden 8, Random 10, and post-Q.5 Golden 20 using distinct output paths.
- [ ] Add candidate funnel extraction from isolated Q4 run data and raw candidates.
- [ ] Add Random 10 live-LLM strategy generation from raw descriptions.
- [ ] Validate identity retention, industry-specific source archetypes, query families, and preset leakage.
- [ ] Keep the scripts opt-in and out of `verify:all`.

### Task 2: Run the Golden 8 live regression gate

**Files:**
- Create: `Golden_8_Q5_Live_Regression_Report.md`

- [ ] Run provider health checks before any Golden case.
- [ ] Start the isolated Q4 live server with a new Q.5-R data directory.
- [ ] Use the in-app Browser to run cases 3, 4, 8, 9, 11, 13, 19, and 20.
- [ ] Record candidate counts, semantic buckets, rejection reasons, card actionability, report action layer, save, and rerun behavior.
- [ ] Stop before Golden 20 if fewer than six cases provide a credible actionable card or if any trust/safety invariant fails.

### Task 3: Run Random 10 generalization

**Files:**
- Create: `Random_10_Q5_Generalization_Report.md`

- [ ] Generate all ten radar strategies from raw user input with commercial DeepSeek.
- [ ] Verify dynamic source archetypes and query families without Golden 20 preset leakage.
- [ ] Run selected live-search samples representing procurement, partnership, service, platform, and government-project paths.
- [ ] Treat an honest no-result as acceptable; never require a low-quality card to satisfy the test.

### Task 4: Conditionally run Golden 20

**Files:**
- Create only when Tasks 2 and 3 pass: `Golden_20_Post_Q5_Rerun_Report.md`

- [ ] Run all 20 cases through the browser runner.
- [ ] Preserve the original `Golden_20_User_Simulation_Report.md` as the Q4 baseline.
- [ ] Compare strong pass, partial pass, failure, search quality, report value, and trust/safety invariants.

### Task 5: Verify and commit

- [ ] Run `node --run typecheck`.
- [ ] Run `node --run verify:q5`.
- [ ] Run `node --run verify:api-env`.
- [ ] Run `node --run verify:q3`.
- [ ] Run `node --run verify:live-provider-health`.
- [ ] Run `node --run verify:live-llm`.
- [ ] Run `node --run verify:live-mvp`.
- [ ] Run `node --run verify:mvp-browser`.
- [ ] Run `node --run verify:all`.
- [ ] Run `git diff --check`.
- [ ] Commit only Q.5-R scripts and generated validation reports; never commit `api.env`, keys, caches, or isolated runtime data.
