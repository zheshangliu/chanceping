# ChancePing Next Stage Integrated Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move ChancePing from the current Q.7 demo shell toward a deployable MVP: one chat window per radar, AI Events public navigation UI, contest-profile Qwen live LLM, bilingual backend UI, and Alibaba Cloud readiness.

**Architecture:** Keep the existing MVP chain intact: `RadarVersionSpec` remains the source of truth, `RadarChatWindow` stores one-window-one-radar context, Q.6 gates keep opportunity quality, `/api/public/ai-events` powers the public AI Events page, and `api.env` stays local and untracked. This plan intentionally separates product data, public display, provider switching, i18n, and deployment so each stage can be tested and rolled back independently.

**Tech Stack:** TypeScript, Hono API, JSON stores, vanilla browser JavaScript, existing `src/i18n` utilities, local `api.env`, Serper/Jina/Qwen live providers, Alibaba Cloud deployment later.

---

## Execution Order

1. **Q7X Data Closure:** finish one-window-one-radar data semantics.
2. **Q7S AI Events UI:** execute the existing `1 + 7 hybrid` plan for `/aievents`.
3. **Qwen Contest Profile:** make local live LLM default to contest/Qwen and add a DeepSeek-vs-Qwen comparison harness.
4. **Backend Bilingual UI:** add Chinese/English toggle to the ChancePing backend console.
5. **Alibaba Cloud Readiness:** prepare multi-user defaults, built-in AI Events radar visibility, environment checklist, and deploy scripts.

Do not start Alibaba Cloud deployment until stages 1-4 pass local verification.

## Current Evidence Snapshot

- Branch: `rescue/mvp-codex`.
- Q7X shell exists and has recent tests: `verify:q7:chat-window`, `verify:q7:chat-context`, `verify:q7:generate-context`, `verify:q7:hero-chat`.
- Existing UI design handoff exists: `docs/superpowers/plans/2026-07-07-ai-events-hybrid-source-radar-ui-plan.md`.
- `api.env` exists locally and is gitignored.
- `src/config/live-llm-profile.ts` already supports `commercial` and `contest`.
- `src/i18n` already exists, so backend bilingual work should reuse it instead of inventing another locale layer.

## Stage 1: One Window One Radar Data Closure

**Purpose:** make the Q7X data model a stable foundation before public UI and cloud deployment.

**Files to inspect or modify:**
- `src/agents/radar-chat-store.ts`
- `src/api/routes/radar-chats.ts`
- `web/hero-radar-chat.js`
- `web/home.js`
- `web/radars.js`
- `scripts/verify-q7-chat-window.ts`
- `scripts/verify-q7-chat-reload.ts`
- `scripts/verify-q7-hero-chat.ts`

**Acceptance:**
- Built-in `全球 AI 赛事导航` exists for every user as a protected public/sample radar.
- A user can create up to 3 custom radar chat windows.
- Each custom radar window keeps its own messages, memory summary, draft radar, confirmed radar, latest run, and latest report.
- Deleting a custom radar window removes it from the active list and releases quota.
- The built-in AI Events radar cannot be deleted as a user custom radar.
- Reloading the page restores the active window without leaking another user’s local browser state.

**Commands:**
```bash
node --run typecheck
node --run verify:q7:chat-window
node --run verify:q7:chat-reload
node --run verify:q7:chat-context
node --run verify:q7:generate-context
node --run verify:q7:hero-chat
node --run verify:mvp-browser
```

**Commit suggestion:** `Q7X: close one-window one-radar data semantics`

## Stage 2: AI Events 1 + 7 Hybrid Public UI

**Purpose:** turn `/aievents` into the public-facing AI Events navigation page using the already agreed UI design direction.

**Source plan:** `docs/superpowers/plans/2026-07-07-ai-events-hybrid-source-radar-ui-plan.md`

**Interpretation of “1 + 7”:**
- `1`: Devpost-style decision list for fast scanning.
- `7`: CompeteHub-style source radar for source labels and provenance, but only as UI/data interpretation, not as the final factual source.

**Files to modify:**
- `web/ai-events.html`
- `web/ai-events.js`
- create or update `web/ai-events-hybrid.css`
- `src/api/routes/web-ui.ts`
- `scripts/verify-q7-ai-events-page.ts`

**Non-goals:**
- Do not change `web/hero-radar-chat.js`.
- Do not change opportunity ingestion or sync semantics.
- Do not call live search from the public page.

**Acceptance:**
- `/aievents` reads only `/api/public/ai-events`.
- The page defaults to current active opportunities sorted by deadline.
- History is accessible separately, not mixed into the default feed.
- Cards show available fields: title, official URL, registration URL, source domain, deadline, prize/reward, category, region, organizer, cover image, and source label.
- Unknown fields use humane copy like `截止待查` / `奖金待查`; the public page does not burden users with internal `待复核` language.
- Mobile page supports browsing, filtering, pagination, and opening official links.

**Commands:**
```bash
node --run typecheck
node --run verify:q7:ai-events-page
node --run verify:q7:public-ai-events
node --run verify:q7:ai-events-public-filters
node --run verify:e2e-ai-events
```

**Commit suggestion:** `Q7S: implement AI Events hybrid public UI`

## Stage 3: Qwen Contest Profile And Comparison Harness

**Purpose:** switch local live LLM validation to contest/Qwen while preserving a later comparison path against DeepSeek.

**Files to inspect or modify:**
- `api.env` local only, never commit.
- `package.json`
- `src/config/live-llm-profile.ts`
- `scripts/verify-live-llm.ts`
- create `scripts/compare-live-llm-profiles.ts` if needed.

**Local `api.env` target:**
```env
LLM_MODE=live
LLM_STRATEGY=competition
CHANCEPING_LOAD_API_ENV=true
CHANCEPING_ENABLE_LOCAL_LIVE_LLM=true
CHANCEPING_LLM_PROFILE=contest
CONTEST_LLM_PROVIDER=qwen
CONTEST_LLM_MODEL=qwen-plus
CONTEST_LLM_BASE_URL=<dashscope-compatible-base-url>
```

Use existing `DASHSCOPE_API_KEY`; do not duplicate the key into committed files.

**Acceptance:**
- `resolveLiveLlmProfile()` reports `contest / qwen / qwen-plus` when `api.env` is loaded.
- No key is printed in logs.
- `verify:all` remains mock-safe and does not call live LLM.
- A comparison harness can run the same 3-5 fixed prompts against commercial/DeepSeek and contest/Qwen later, recording profile/provider/model, output shape, latency, and qualitative differences without logging keys.

**Commands:**
```bash
node --run verify:api-env
node --run verify:live-llm
node --run verify:all
```

**Commit suggestion:** commit only code/test harness changes, not `api.env`.

## Stage 4: Backend Console Bilingual UI

**Purpose:** make the ChancePing backend console usable in Chinese and English, matching the public AI Events page direction.

**Files to inspect or modify:**
- `src/i18n/config.ts`
- `src/i18n/locales.ts`
- `src/i18n/types.ts`
- `web/index.html`
- `web/hero-radar-chat.js`
- `web/radars.js`
- `web/radar-detail.js`
- `web/styles.css`
- create focused verification script if existing checks are insufficient.

**Acceptance:**
- Top-level backend console has a Chinese/English toggle.
- Built-in radar names and common actions have bilingual strings.
- No raw i18n keys appear in UI.
- Existing Chinese UX remains default.
- Switching language does not reset active radar window state.

**Commands:**
```bash
node --run typecheck
node --run verify:q7:hero-chat
node --run verify:q7:chat-window
node --run verify:mvp-browser
node --run verify:all
```

**Commit suggestion:** `Q7I18N: add bilingual backend console shell`

## Stage 5: Alibaba Cloud Readiness

**Purpose:** prepare the website for cloud deployment after local behavior is stable.

**Requirements:**
- Production must not load `api.env`.
- Production live search / live LLM must be enabled only through Alibaba Cloud environment variables.
- Every user sees the built-in `全球 AI 赛事导航` radar.
- Each user can create 3 custom radar windows.
- User-owned custom windows must be scoped by user id.
- The built-in public radar data is shared and periodically refreshed.
- The public `/aievents` page reads stored data and does not run live search on page load.

**Files likely involved:**
- deployment docs/scripts
- `src/api/server.ts`
- config/env validation
- radar chat user scoping
- public AI events scheduler

**Acceptance before deployment:**
```bash
node --run typecheck
node --run verify:api-env
node --run verify:q7:chat-window
node --run verify:q7:public-ai-events
node --run verify:mvp-browser
node --run verify:all
git diff --check
```

**Cloud smoke after deployment:**
- Open `/`.
- Open `/aievents`.
- Open built-in `全球 AI 赛事导航`.
- Create 3 custom windows for a test user.
- Confirm 4th custom window is blocked with clear copy.
- Delete one custom window and confirm quota releases.
- Run or replay AI Events demo without exposing keys.

## Open Decision Log

- `Qwen vs DeepSeek` comparison should be measured after the Qwen contest profile is stable, not during UI work.
- `/aievents` visual polish can continue using Product Design later; this plan only requires accurate data display and safe interaction.
- Public AI Events can stay read-only while backend radar/pipeline handles updates every few days.
