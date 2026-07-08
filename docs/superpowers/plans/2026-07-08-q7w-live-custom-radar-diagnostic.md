# Q7W Live Custom Radar Diagnostic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real-live diagnostic runner for 10 random custom-radar industries that proves whether V1.0 can generate, search, store opportunities, and produce Markdown reports without provider names leaking to users.

**Architecture:** Reuse the Q7V mock-safe custom radar runner as the contract baseline, but load `api.env` before dynamic imports so live Serper/Qwen providers initialize correctly. The runner writes a Markdown diagnostic report and stops early after 3 consecutive failures.

**Tech Stack:** TypeScript scripts via `tsx`, Hono `app.request`, ChancePing local app context, Qwen contest LLM profile, Serper live search, existing radar/report/opportunity stores.

---

### Task 1: Add Q7W Live Diagnostic Runner

**Files:**
- Create: `scripts/run-q7w-live-custom-radar-10-diagnostic.ts`
- Modify: `package.json`

- [ ] **Step 1: Create the live runner by cloning Q7V behavior**

The runner must:
- call `loadLocalApiEnv({ enabled: true })` before importing `createApp`, `createAppContext`, or `providerRegistry`;
- set `CHANCEPING_ENABLE_LOCAL_LIVE_SEARCH=true`, `CHANCEPING_ENABLE_LOCAL_LIVE_LLM=true`, `CHANCEPING_LLM_PROFILE=contest`, `LLM_MODE=live`, `DATA_MODE=live`;
- verify Serper is not mock mode;
- run 10 non-AI industries with unique `X-ChancePing-User-Id`;
- stop after 3 consecutive failures;
- write `Q7W_Live_Custom_Radar_10_Diagnostic.md`;
- never print API keys.

- [ ] **Step 2: Add package script**

Add:

```json
"q7w:live-custom-radar-10": "CHANCEPING_LOAD_API_ENV=true CHANCEPING_ENABLE_LOCAL_LIVE_SEARCH=true CHANCEPING_ENABLE_LOCAL_LIVE_LLM=true CHANCEPING_LLM_PROFILE=contest LLM_MODE=live DATA_MODE=live tsx scripts/run-q7w-live-custom-radar-10-diagnostic.ts"
```

### Task 2: Verify Script Contract

**Files:**
- Modify: `scripts/verify-q7-cloud-readiness.ts`

- [ ] **Step 1: Add static checks**

Check that:
- package script exists;
- runner imports `loadLocalApiEnv`;
- runner uses dynamic imports after env load;
- runner writes the Q7W report;
- runner includes stop-on-3-failures logic;
- runner does not contain DeepSeek/Qwen/Serper in customer-facing failure phrases.

- [ ] **Step 2: Run mock-safe verification**

Run:

```bash
node --run typecheck
node --run verify:q7:cloud-readiness
node --run verify:q7:hero-chat
node --run verify:all
git diff --check
```

### Task 3: Run Live Diagnostics

**Files:**
- Generated: `Q7W_Live_Custom_Radar_10_Diagnostic.md`

- [ ] **Step 1: Run provider health**

Run:

```bash
node --run verify:live-provider-health
node --run verify:live-llm
```

- [ ] **Step 2: Run 10-industry live diagnostic**

Run:

```bash
node --run q7w:live-custom-radar-10
```

Expected:
- stop early if 3 consecutive failures;
- success only if at least 9/10 are pass or near_pass;
- report lists each industry, generated radar name, cards, stored entries, report status, first card titles, and failure reason.

### Task 4: Triage and Fix Common Failures

**Files:**
- To be determined by live failure category.

- [ ] **Step 1: Classify failures**

Group failures into:
- `radar_generation_mismatch`
- `live_search_failed`
- `html_or_timeout_response`
- `no_cards`
- `not_stored`
- `report_missing_card_title`
- `provider_name_leak`

- [ ] **Step 2: Fix only common product defects**

Fix common bugs found by at least 2 scenarios. Do not add per-industry templates.

### Task 5: Final Report

**Files:**
- Update: `Q7W_Live_Custom_Radar_10_Diagnostic.md`

- [ ] **Step 1: Summarize outcome**

Include:
- pass / near_pass / fail counts;
- whether 9/10 target is met;
- whether 3-consecutive-failure stop was triggered;
- top failure classes;
- whether custom radar V1.0 is ready for broader beta;
- exact SWAS Workbench deploy command if code changed.
