# Q7X Live Multiversion Custom Radar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 验证盯机会自定义雷达在 10 个全新行业里，能通过 V1.0/V1.1/V1.3/V1.4 多轮澄清后生成有效机会卡，目标至少 9/10 有机会卡。

**Architecture:** 复用 Q7W live harness 的环境加载、动态 import、隔离 store、Serper health check、报告生成逻辑；新增 revisionMessages 场景模型，按用户设定的版本轮次调用 `/api/radars/revise`，只在最终版本确认后运行 live search。脚本是显式 opt-in，不进入 `verify:all`。

**Tech Stack:** Node scripts via `tsx`, ChancePing local Hono app, Qwen contest LLM profile, Serper live provider, local JSON stores.

---

### Task 1: Cloud Readiness RED Gate

**Files:**
- Modify: `scripts/verify-q7-cloud-readiness.ts`

- [x] **Step 1: Add failing checks for Q7X**

Add checks that require:
- `q7x:live-custom-radar-multiversion-10` command exists.
- It is not included in `verify:all`.
- The script loads `api.env` before imports.
- It dynamically imports app/provider after env setup.
- It writes `Q7X_Live_Custom_Radar_Multiversion_10_Report.md`.
- It includes `/api/radars/revise`.
- It includes V1.3 or V1.4 scenarios.
- It stops after 3 consecutive failures.
- It targets `carded >= 9`.

- [x] **Step 2: Run RED**

Run:

```bash
node --run verify:q7:cloud-readiness
```

Expected before implementation: fails on Q7X checks.

### Task 2: Q7X Live Multiversion Harness

**Files:**
- Create: `scripts/run-q7x-live-custom-radar-multiversion-10.ts`
- Modify: `package.json`

- [x] **Step 1: Register explicit live command**

Command:

```json
"q7x:live-custom-radar-multiversion-10": "CHANCEPING_LOAD_API_ENV=true CHANCEPING_ENABLE_LOCAL_LIVE_SEARCH=true CHANCEPING_ENABLE_LOCAL_LIVE_LLM=true CHANCEPING_LLM_PROFILE=contest LLM_MODE=live DATA_MODE=live tsx scripts/run-q7x-live-custom-radar-multiversion-10.ts"
```

- [x] **Step 2: Implement scenario model**

Each scenario contains:
- `input`
- `revisionMessages`
- `expectedFinalVersion`
- `expectedKeywords`
- `negativePatterns`

- [x] **Step 3: Implement live workflow**

For each scenario:
1. Generate radar from initial input.
2. Apply every `revisionMessages[]` item through `/api/radars/revise`.
3. Confirm final spec.
4. Save and activate radar.
5. Run live search.
6. Verify `opportunityCards.length > 0`.
7. Verify opportunity entries are stored by `radar_id`.
8. Generate Markdown report.
9. Stop early if 3 consecutive scenarios fail.

### Task 3: Verification Loop

**Files:**
- Create/update: `Q7X_Live_Custom_Radar_Multiversion_10_Report.md`

- [ ] **Step 1: Run Q7X live**

Run:

```bash
node --run q7x:live-custom-radar-multiversion-10
```

Expected:
- At least 9/10 scenarios have `cardCount > 0`.
- No provider names appear in customer-visible report markdown.
- No 3 consecutive failures.

- [ ] **Step 2: If below target, fix only common mechanisms**

Allowed fixes:
- Generic search recall recovery.
- Generic revision prompt/validation.
- Generic result gate calibration.
- Generic report generation.

Not allowed:
- Per-industry `if/switch` templates.
- Hardcoding the 10 test industries.

### Task 4: Regression

Run:

```bash
node --run typecheck
node --run verify:q7:cloud-readiness
node --run verify:v15:e2e
node --run verify:q6h
node --run verify:all
git diff --check
```

Expected: all pass.

