# Welfare Persistent Data Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the welfare radar ship with a verified Git seed while preserving newer runtime data outside release directories and automatically falling back to the seed when runtime data is unavailable.

**Architecture:** Keep the public, safe opportunity baseline in the existing tracked recorded JSON. Centralize runtime/seed selection in the welfare data module, write production data to `/var/lib/chanceping/welfare` through environment configuration, and initialize persistent storage without overwriting valid newer data. The API and report consume the same snapshot selector.

**Tech Stack:** TypeScript, Node.js filesystem APIs, Hono, systemd, JSON, existing ChancePing verification scripts.

## Global Constraints

- Do not expose raw HTML, local paths, internal radar/run IDs, secrets, or stack traces.
- Runtime data must survive release switches and repeated deployments.
- Empty, missing, or invalid runtime data must fall back to the Git seed.
- A refresh must never replace a non-empty snapshot with an empty result.
- Git seed must satisfy current >= 40, signals >= 20, history >= 20, total >= 80.
- Production schedule remains 08:30 and 16:30 Asia/Shanghai.
- Do not modify `main` or unrelated untracked files.

---

### Task 1: Snapshot selection contract

**Files:**
- Modify: `src/public/welfare-opportunities.ts`
- Modify: `scripts/verify-welfare-contracts.ts`

**Interfaces:**
- Produces: `loadWelfareDataSnapshot(runtimePath?, seedPath?) => WelfareDataSnapshot`
- Produces: `WelfareDataSnapshot` with `records`, `origin`, and optional `runtimeError`

- [ ] Add failing contract cases for missing, empty, invalid and valid runtime snapshots.
- [ ] Run `node_modules/.bin/tsx scripts/verify-welfare-contracts.ts` and confirm the new assertions fail.
- [ ] Implement safe JSON loading and deterministic runtime-to-seed fallback.
- [ ] Make `loadPersistedWelfareOpportunities` remain backward compatible for collectors and existing tests.
- [ ] Run the contract test and typecheck.
- [ ] Commit only the contract and data-selection files.

### Task 2: API/report integration and public origin metadata

**Files:**
- Modify: `src/api/routes/public-welfare-opportunities.ts`
- Modify: `src/public/welfare-opportunities.ts`
- Modify: `scripts/verify-welfare-page.ts`

**Interfaces:**
- Consumes: `loadWelfareDataSnapshot`
- Produces: `stats.dataOrigin: "runtime" | "seed"`

- [ ] Add failing page/API assertions for seed fallback and safe `dataOrigin` metadata.
- [ ] Update the opportunity route and Markdown report to use one selected snapshot.
- [ ] Ensure API output never includes runtime or seed file paths.
- [ ] Run page, contract and typecheck verification.
- [ ] Commit API integration and tests.

### Task 3: Verified Git seed and non-empty write protection

**Files:**
- Modify: `src/demo/welfare-opportunities.recorded.json`
- Modify: `src/public/welfare-opportunities.ts`
- Modify: `scripts/verify-welfare-contracts.ts`

**Interfaces:**
- Seed source: locally verified `data/welfare-opportunities.json`
- Produces: `savePersistedWelfareOpportunities(records, path, options?)` that rejects empty replacement by default

- [ ] Add assertions that the seed meets 40/20/20/80 and every card has official URL/source/retrieval/hash evidence.
- [ ] Add a failing assertion that an empty save preserves an existing non-empty snapshot.
- [ ] Copy the safe public record set into the tracked seed file; exclude runtime summaries and raw evidence.
- [ ] Implement non-empty write protection while permitting explicit test initialization where needed.
- [ ] Run contracts, page verification and typecheck.
- [ ] Commit the seed and write protection.

### Task 4: Persistent production paths and migration script

**Files:**
- Create: `scripts/migrate-welfare-runtime-storage.ts`
- Modify: `docs/deployment/chanceping-welfare-update.service`
- Modify: `docs/deployment/workbench-install.sh`
- Modify: `docs/deployment/aliyun-mvp-runbook.md`
- Modify: `scripts/verify-welfare-scheduler.ts`
- Modify: `package.json`

**Interfaces:**
- Produces command: `npm run welfare:migrate-storage`
- Production paths rooted at `/var/lib/chanceping/welfare`

- [ ] Add failing scheduler/migration contract assertions for persistent paths and non-overwriting initialization.
- [ ] Implement an idempotent migration script that creates the directory and seeds only a missing/invalid/empty runtime snapshot.
- [ ] Add production environment variables to the service/install documentation without printing secrets.
- [ ] Change Cloud Assistant guidance to start the oneshot asynchronously and inspect it separately.
- [ ] Run scheduler, migration, contract and typecheck verification.
- [ ] Commit deployment migration files.

### Task 5: Full regression and production rollout

**Files:**
- Modify only files required by failures discovered in this task.

**Interfaces:**
- Consumes all prior tasks.
- Produces verified production API and persistent runtime storage.

- [ ] Run `npm run typecheck`.
- [ ] Run `npm run verify:welfare`.
- [ ] Run `npm run verify:v15:e2e`, `npm run verify:v15`, `npm run verify:v16`, and `npm run verify:all`.
- [ ] Run `git diff --check` and inspect tracked/untracked scope.
- [ ] Push and deploy with `chanceping-push-deploy`.
- [ ] Run the migration command and restart the welfare timer/service through Cloud Assistant.
- [ ] Verify public totals current >= 40, signals >= 20, history >= 20, total >= 80.
- [ ] Verify main-site and AI Events remote smoke remains green.
- [ ] Record any production-only follow-up without weakening the acceptance gates.
