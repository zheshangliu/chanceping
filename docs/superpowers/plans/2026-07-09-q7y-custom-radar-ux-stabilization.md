# Q7Y Custom Radar UX Stabilization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make custom radar runs feel reliable during long live searches by extending visible wait tolerance, hiding provider names from customer-facing UI, routing result feedback back to the radar chat window, and validating another random 10-industry run.

**Architecture:** Keep the existing one-window-one-radar data model and Q.6 gates. Add a small Q7Y static verifier for the UX contract, then make narrow changes in the frontend request/progress/result-feedback path and the live evidence read timeout. Live quality is validated by a second random 10-industry diagnostic after the UX contract passes.

**Tech Stack:** Vanilla JS frontend under `web/`, Hono API under `src/api`, TypeScript verification scripts under `scripts/`, local live profile via Qwen contest mode and Serper.

---

### Task 1: Add Q7Y UX Contract Gate

**Files:**
- Create: `/Users/1sunflower/Documents/chanceping/scripts/verify-q7y-custom-radar-ux.ts`
- Modify: `/Users/1sunflower/Documents/chanceping/package.json`

- [ ] **Step 1: Write the failing verifier**

Create a verifier that checks the customer-visible custom radar path:

```ts
import { existsSync, readFileSync } from "node:fs";

let pass = 0;
let fail = 0;

function read(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

function check(name: string, condition: boolean, detail = ""): void {
  if (condition) {
    pass += 1;
    console.log(`PASS ${name}`);
  } else {
    fail += 1;
    console.error(`FAIL ${name}${detail ? `: ${detail}` : ""}`);
  }
}

const packageJson = JSON.parse(read("package.json") || "{}") as { scripts?: Record<string, string> };
const scripts = packageJson.scripts ?? {};
const heroChat = read("web/hero-radar-chat.js");
const watchResult = read("web/watch-result.js");
const aliyunSmoke = read("scripts/verify-q7-aliyun-smoke.ts");
const aliyunRemoteSmoke = read("scripts/verify-q7-aliyun-remote-smoke.ts");
const orchestrator = read("src/search/orchestrator.ts");

check("Q7Y verifier is registered", scripts["verify:q7y:custom-radar-ux"] === "tsx scripts/verify-q7y-custom-radar-ux.ts");
check("hero chat defines ten minute long operation timeout", /LONG_OPERATION_TIMEOUT_MS\s*=\s*10\s*\*\s*60\s*\*\s*1000/.test(heroChat));
check("hero chat postJson uses request timeout support", /async function postJson\(url, body, options = \{\}\)/.test(heroChat) && /fetchWithTimeout/.test(heroChat));
check("hero chat non-json errors mention gateway long wait", /线上网关等待时间|10 分钟|十分钟/.test(heroChat));
check("hero progress exposes one current line", /currentProgressLine/.test(heroChat) && /hero-progress-current/.test(heroChat));
check("hero progress hides provider executor names", !/Qwen\s*正在|DeepSeek\s*正在|Serper\s*正在|LLM\s*正在/i.test(heroChat));
check("watch result uses safe JSON parser", /parseJsonResponse/.test(watchResult) && /NON_JSON_RESPONSE/.test(watchResult));
check("watch result adjust button only routes back to chat", /openRadarChatFromResultFeedback\(\)/.test(watchResult) && !/showRadarRevisionFromResultFeedback/.test(watchResult));
check("watch result live failure copy encourages waiting and retry", /雷达已保留/.test(watchResult) && /不用重新描述/.test(watchResult));
check("Aliyun local smoke expects ChancePing wording", /盯机会正在理解并生成雷达/.test(aliyunSmoke) && !/Qwen 正在|Serper 正在/.test(aliyunSmoke));
check("Aliyun remote smoke expects ChancePing wording", /盯机会正在理解并生成雷达/.test(aliyunRemoteSmoke) && !/Qwen 正在|Serper 正在/.test(aliyunRemoteSmoke));
check("live evidence read timeout is env configurable", /CHANCEPING_LIVE_EVIDENCE_TIMEOUT_MS/.test(orchestrator) && !/timeoutMs:\s*8000/.test(orchestrator));

console.log(`\nQ7Y custom radar UX verification: ${pass} PASS, ${fail} FAIL`);
if (fail > 0) process.exit(1);
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --run verify:q7y:custom-radar-ux`

Expected: FAIL because the script is not registered and the production code has not yet implemented the contract.

- [ ] **Step 3: Register the script**

Add to `package.json`:

```json
"verify:q7y:custom-radar-ux": "tsx scripts/verify-q7y-custom-radar-ux.ts"
```

- [ ] **Step 4: Run again**

Run: `node --run verify:q7y:custom-radar-ux`

Expected: FAIL with production-code contract failures.

### Task 2: Long Wait and Generic Progress

**Files:**
- Modify: `/Users/1sunflower/Documents/chanceping/web/hero-radar-chat.js`
- Modify: `/Users/1sunflower/Documents/chanceping/src/search/orchestrator.ts`

- [ ] **Step 1: Add frontend long-operation timeout helpers**

Add a 10-minute timeout constant and a `fetchWithTimeout` helper used by `postJson`, `getJson`, `patchJson`, `putJson`, and `deleteJson`.

- [ ] **Step 2: Improve non-JSON/gateway copy**

Make non-JSON and 504 errors say that the radar is kept, the user can retry, and the long live task may still require the server gateway to allow 10-minute requests.

- [ ] **Step 3: Keep progress as one rotating customer-visible line**

Keep `currentProgressLine`, use only `盯机会` as the actor, and do not mention Qwen, DeepSeek, Serper, LLM, or provider names in execution-status UI.

- [ ] **Step 4: Make live evidence read timeout configurable**

Replace the 8-second hard timeout in `src/search/orchestrator.ts` with `CHANCEPING_LIVE_EVIDENCE_TIMEOUT_MS`, defaulting to `30000`.

- [ ] **Step 5: Run Q7Y verifier**

Run: `node --run verify:q7y:custom-radar-ux`

Expected: still FAIL until Task 3 and Task 4 are complete.

### Task 3: Result Feedback Returns to Chat Window

**Files:**
- Modify: `/Users/1sunflower/Documents/chanceping/web/watch-result.js`
- Modify: `/Users/1sunflower/Documents/chanceping/scripts/verify-q7-aliyun-smoke.ts`
- Modify: `/Users/1sunflower/Documents/chanceping/scripts/verify-q7-aliyun-remote-smoke.ts`

- [ ] **Step 1: Remove legacy result-feedback fallback**

Change the “调整雷达画像” click handler so it only calls `openRadarChatFromResultFeedback`. If that function is unavailable, switch to home and show a toast telling the user to open the radar window and continue in chat. Do not call `showRadarRevisionFromResultFeedback`.

- [ ] **Step 2: Add a safe JSON parser to result page requests**

Mirror the safer parser from hero chat so result page reruns and saves do not crash on HTML error pages.

- [ ] **Step 3: Update Aliyun smoke wording gates**

Replace Qwen/Serper expected phrases with customer-visible `盯机会` phrases.

- [ ] **Step 4: Run Q7Y verifier**

Run: `node --run verify:q7y:custom-radar-ux`

Expected: PASS.

### Task 4: Verification and Browser Smoke

**Files:**
- No production files unless a verified issue appears.

- [ ] **Step 1: Run static and baseline checks**

Run:

```bash
node --run typecheck
node --run verify:q7y:custom-radar-ux
node --run verify:q7:cloud-readiness
node --run verify:v15:e2e
node --run verify:all
git diff --check
```

- [ ] **Step 2: Browser smoke**

Open local backend and test:

1. Create a custom radar from a non-AI industry.
2. Confirm V1.0 or revise to V1.1.
3. Run once.
4. Observe rotating one-line progress.
5. Click “调整雷达画像” from results and verify it returns to the radar chat window with feedback in the input.

### Task 5: Second Random 10 Live Diagnostic

**Files:**
- Create: `/Users/1sunflower/Documents/chanceping/scripts/run-q7y-live-custom-radar-ux-10.ts`
- Modify: `/Users/1sunflower/Documents/chanceping/package.json`
- Create: `/Users/1sunflower/Documents/chanceping/Q7Y_Live_Custom_Radar_UX_10_Report.md`

- [ ] **Step 1: Add 10 new industries**

Use industries not covered by Q7X, with mixed familiarity and version depth. Include V1.0, V1.1, V1.3, and V1.4 paths.

- [ ] **Step 2: Add early-stop logic**

Stop after 3 consecutive failed industries, write the partial report, and fix the cause before rerunning.

- [ ] **Step 3: Run diagnostic**

Run: `node --run q7y:live-custom-radar-ux-10`

Pass target: at least 9 of 10 produce useful opportunity cards/reports. If not, diagnose and iterate on generic mechanisms only.

### Task 6: Commit and Handoff

**Files:**
- All files changed above.

- [ ] **Step 1: Check status**

Run: `git status --short --branch`

- [ ] **Step 2: Commit scoped changes**

Commit message:

```bash
git add package.json scripts/verify-q7y-custom-radar-ux.ts scripts/run-q7y-live-custom-radar-ux-10.ts Q7Y_Live_Custom_Radar_UX_10_Report.md docs/superpowers/plans/2026-07-09-q7y-custom-radar-ux-stabilization.md web/hero-radar-chat.js web/watch-result.js scripts/verify-q7-aliyun-smoke.ts scripts/verify-q7-aliyun-remote-smoke.ts src/search/orchestrator.ts
git commit -m "Q7Y: stabilize custom radar live UX"
```

- [ ] **Step 3: Report deploy command**

Output the SWAS Workbench command:

```bash
cd /opt/chanceping && \
git fetch origin rescue/mvp-codex && \
git pull --ff-only origin rescue/mvp-codex && \
git archive --format=tar HEAD | tar -x -C /opt/chanceping/current && \
systemctl restart chanceping && \
systemctl status chanceping --no-pager -l
```
