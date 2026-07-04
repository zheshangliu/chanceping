# Localhost Live DeepSeek Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the normal local `npm run dev` experience use the commercial DeepSeek profile for requirement interpretation and radar revision while keeping live search opt-in, production protected, and automated verification mock-safe.

**Architecture:** Keep the existing `loadLocalApiEnv` and `ModelRouter` boundaries. Change only the local development command so environment configuration is present before `src/api/server.ts` dynamically imports the application context; add a focused static safety verifier, then restart and exercise the real browser flow.

**Tech Stack:** Node.js package scripts, TypeScript, tsx, Hono, existing DeepSeek-compatible ModelRouter, Codex in-app Browser.

---

## File Map

- Modify `package.json`: make `dev` explicitly enable local `api.env`, commercial live LLM, and preserve a named mock development command.
- Create `scripts/verify-local-live-dev.ts`: verify local live-LLM startup boundaries without making a paid API call.
- Modify `package.json`: register `verify:local-live-dev` without adding it to `verify:all`.

### Task 1: Lock Local Development Startup Boundaries

**Files:**
- Create: `scripts/verify-local-live-dev.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing verifier**

Create `scripts/verify-local-live-dev.ts` that reads `package.json` and asserts:

```ts
import { readFileSync } from "fs";

const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
  scripts?: Record<string, string>;
};
const scripts = packageJson.scripts ?? {};
let passed = 0;
let failed = 0;

function check(label: string, condition: boolean): void {
  if (condition) {
    passed += 1;
    console.log(`PASS ${label}`);
  } else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}

const dev = scripts.dev ?? "";
const start = scripts.start ?? "";
const verifyAll = scripts["verify:all"] ?? "";

check("dev explicitly loads local api.env", dev.includes("CHANCEPING_LOAD_API_ENV=true"));
check("dev enables local live LLM", dev.includes("CHANCEPING_ENABLE_LOCAL_LIVE_LLM=true"));
check("dev selects commercial profile", dev.includes("CHANCEPING_LLM_PROFILE=commercial"));
check("dev selects live LLM mode", dev.includes("LLM_MODE=live"));
check("dev does not enable live search", !dev.includes("CHANCEPING_ENABLE_LOCAL_LIVE_SEARCH=true"));
check("start does not implicitly enable local live LLM", !start.includes("CHANCEPING_ENABLE_LOCAL_LIVE_LLM=true"));
check("mock development command remains available", scripts["dev:mock"] === "DATA_MODE=mock LLM_MODE=mock tsx src/api/server.ts");
check("local live verifier is not part of verify:all", !verifyAll.includes("verify:local-live-dev"));

console.log(`local live dev verification: ${passed} PASS / ${failed} FAIL`);
if (failed > 0) process.exit(1);
```

- [ ] **Step 2: Run the verifier and confirm RED**

Run:

```bash
npx tsx scripts/verify-local-live-dev.ts
```

Expected: FAIL because the current `dev` command does not enable the live LLM flags and `dev:mock` does not exist.

- [ ] **Step 3: Make the minimal package-script change**

Set these scripts in `package.json`:

```json
{
  "dev": "CHANCEPING_LOAD_API_ENV=true CHANCEPING_ENABLE_LOCAL_LIVE_LLM=true CHANCEPING_LLM_PROFILE=commercial LLM_MODE=live tsx src/api/server.ts",
  "dev:mock": "DATA_MODE=mock LLM_MODE=mock tsx src/api/server.ts",
  "dev:local": "CHANCEPING_LOAD_API_ENV=true tsx src/api/server.ts",
  "verify:local-live-dev": "tsx scripts/verify-local-live-dev.ts"
}
```

Do not add `CHANCEPING_ENABLE_LOCAL_LIVE_SEARCH` and do not add the verifier to `verify:all`.

- [ ] **Step 4: Run the focused verifier and confirm GREEN**

Run:

```bash
npx tsx scripts/verify-local-live-dev.ts
```

Expected: `8 PASS / 0 FAIL`.

- [ ] **Step 5: Run local-env security verification**

Run:

```bash
node --run verify:api-env
```

Expected: all checks pass, including git-ignore and production-disabled behavior.

- [ ] **Step 6: Commit the startup change**

```bash
git add package.json scripts/verify-local-live-dev.ts
git commit -m "dev: enable DeepSeek on localhost"
```

### Task 2: Restart and Verify the Real Customer Flow

**Files:**
- No source files expected.

- [ ] **Step 1: Stop the existing localhost server**

Terminate only the existing ChancePing `src/api/server.ts` process bound to port 3000. Do not stop unrelated processes.

- [ ] **Step 2: Start the normal development command**

Run `npm run dev` (or the workspace Node runtime equivalent) from the repository root and keep the process running.

Expected startup behavior:

```text
api.env loaded with values hidden
port 3000
no API key printed
no live-search enablement
```

- [ ] **Step 3: Run the explicit live-LLM provider verification**

Run:

```bash
node --run verify:live-llm
```

Expected: commercial / DeepSeek profile succeeds without printing credentials.

- [ ] **Step 4: Exercise the in-app browser flow**

Use `http://localhost:3000/`, reset the existing demo conversation, and submit:

```text
我是一个 OPC 创业者，正在开发 AI 工具。我想寻找未来 45 天内可以报名、有奖金或云资源支持、适合个人开发者参加的 AI Agent 比赛和 Hackathon，不要展会资讯和学生专属赛事。
```

Expected:

- a radar draft is returned;
- the identity remains OPC entrepreneur / individual developer;
- high-value criteria include registration and resource value;
- exclusions include expo information and student-only events;
- no search starts before confirmation;
- the browser console has no relevant error or warning;
- no credential appears in page content or logs.

- [ ] **Step 5: Run regression verification**

Run:

```bash
node --run typecheck
node --run verify:v15:e2e
node --run verify:v15
node --run verify:v16
node --run verify:all
git diff --check
```

Expected: all commands pass. `verify:all` remains mock-safe and makes no live LLM or live search call.

### Task 3: Final State Check

**Files:**
- No source files expected.

- [ ] **Step 1: Confirm the server remains available**

Run:

```bash
curl -fsS http://localhost:3000/health
```

Expected: JSON with `success: true` and `status: ok`.

- [ ] **Step 2: Confirm repository safety**

Run:

```bash
git status --short
git check-ignore -q api.env
git diff --check
```

Expected: `api.env` remains ignored; no secret or generated live data is staged.
