# Public AI Events Radar Demo Replay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the AI events hero radar into a pre-existing public radar demo that replays the latest stored opportunity feed instead of triggering expensive live search for every visitor.

**Architecture:** Keep the real radar generation, revision, search, and report APIs intact. Add a narrow front-end replay branch for the built-in `AI_EVENT_SAMPLE_ROOM` radar: after the user confirms a radar version, show a bounded progress animation, fetch `/api/public/ai-events`, map stored public event cards into the existing watch-result shape, and render a concise Markdown/report artifact.

**Tech Stack:** Plain browser JavaScript in `web/hero-radar-chat.js`, existing public AI events API, existing watch-result renderer, TypeScript static verification scripts.

---

### Task 1: Add Static Regression For Demo Replay Contract

**Files:**
- Modify: `scripts/verify-q7-hero-chat.ts`

- [ ] **Step 1: Add checks that the hero demo has a replay branch**

Add assertions that `web/hero-radar-chat.js` contains a `shouldUseHeroDemoReplay` gate, fetches `/api/public/ai-events`, exposes replay-friendly progress copy, and still keeps `/api/search` available for non-demo radars.

- [ ] **Step 2: Run the test and verify it fails**

Run: `node --run verify:q7:hero-chat`

Expected: FAIL because replay branch helpers are not implemented yet.

### Task 2: Implement Public AI Events Demo Replay

**Files:**
- Modify: `web/hero-radar-chat.js`

- [ ] **Step 1: Add replay helpers**

Add helpers to:
- detect the built-in AI events radar;
- fetch latest public AI event cards from `/api/public/ai-events?status=current&page=1&page_size=60`;
- convert public cards into opportunity-card-like objects for `showWatchResult`;
- generate demo Markdown from stored cards;
- keep result metadata marked as `demo_replay`, not `live`.

- [ ] **Step 2: Route confirm flow through replay branch**

At the start of `confirmHeroRadar`, after creating the progress artifact, branch to the replay helper when the radar is the built-in `AI_EVENT_SAMPLE_ROOM`. Keep the existing `/api/search` + `/api/reports/generate` flow for non-demo radars.

- [ ] **Step 3: Make progress honest**

Use copy such as “正在读取 AI 赛事雷达最近一次入库结果” and “正在整理已保存机会卡”, not “实时搜索全网”.

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `node --run verify:q7:hero-chat`

Expected: PASS.

### Task 3: Browser QA And Regression

**Files:**
- No planned code changes unless QA finds an issue.

- [ ] **Step 1: Run focused and required tests**

Run:
- `node --run typecheck`
- `node --run verify:q7:hero-chat`
- `node --run verify:q7:ai-events-page`
- `node --run verify:q7:public-ai-events`
- `node --run verify:mvp-browser`
- `node --run verify:v15:e2e`
- `node --run verify:v15`
- `node --run verify:v16`
- `node --run verify:all`
- `git diff --check`

- [ ] **Step 2: Browser simulate novice users**

Open `/` and verify:
- clicking left “AI 赛事雷达” enters the chat window;
- prompt is prefilled but not auto-sent;
- clicking send generates radar V1.0;
- clicking confirm shows replay progress;
- after a short wait, report artifact appears;
- clicking “查看本次机会卡” opens cards sourced from stored AI events.

Also run mobile viewport and several random harmless actions.

- [ ] **Step 3: Commit**

Stage only intentional files and commit:

```bash
git add docs/superpowers/plans/2026-07-07-public-ai-events-radar-demo-replay.md scripts/verify-q7-hero-chat.ts web/hero-radar-chat.js
git commit -m "Q7V: replay public AI events radar demo"
```
