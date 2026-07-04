# Q.7 Single Hero Radar Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the first AI entrepreneur radar path into a chat-first hero demo without rewriting the existing radar/search/report architecture.

**Architecture:** Add a small frontend hero chat layer that uses existing `/api/radars/generate`, `/api/radars/revise`, `/api/search`, and `/api/reports/generate`. Keep `RadarVersionSpec` as the source of truth, keep Q.5/Q.6 gates intact, and use the existing result/detail surfaces for opportunity cards.

**Tech Stack:** TypeScript, Hono API, plain JavaScript frontend, existing local JSON stores, existing Q.7 LLM reviser, existing mock-safe verification scripts.

---

## Scope Guardrails

- Do not build full multi-radar chat persistence.
- Do not introduce `RadarChatWindowStore`, `RadarMemorySummaryStore`, login, billing, or new database tables.
- Do not remove existing radar/search/report APIs.
- Do not weaken Q.5/Q.6 candidate quality gates.
- Do not make live LLM or live search part of `verify:all`.
- Do not hardcode product logic as `if AI 比赛`. The demo copy can focus on AI entrepreneurs; the underlying reviser remains generic.
- Do not delete old template files unless tests are updated and compatibility is proven. Hide them from the hero path instead.

## File Structure

- Create `web/hero-radar-chat.js`  
  Owns the single hero chat state, message rendering, radar artifact rendering, revision calls, confirmation calls, and report artifact insertion.

- Modify `index.html`  
  Add a hero chat root and load `hero-radar-chat.js`. Keep existing panels for result/detail compatibility.

- Modify `web/home.js`  
  Hide old multi-template primary buttons from the hero path and route the main input into the hero chat flow.

- Modify `web/watch-result.js`  
  Expose a small helper for opening the existing result view from a report artifact, if current globals are not enough.

- Modify `web/styles.css`  
  Add chat layout, message bubbles, radar artifact card, report artifact, and compact responsive rules.

- Create `scripts/verify-q7-hero-chat.ts`  
  Static and API-level verification for the single hero chat path.

- Modify `scripts/verify-mvp-ux.ts`  
  Update expectations so the primary hero path no longer requires old multi-template buttons.

- Modify `scripts/verify-mvp-browser-smoke.ts`  
  Add one browser smoke path for AI entrepreneur chat → V1.0 → V1.1 → V1.2 → confirm → report artifact.

- Modify `package.json`  
  Add `verify:q7:hero-chat`.

## Milestone Split

Implement in four commits:

1. `Q.7-D: add single hero chat state`
2. `Q.7-E: add chat-first hero workspace`
3. `Q.7-F: return report artifact to chat`
4. `Q.7-G: polish AI entrepreneur hero demo`

Stop after each commit, run its focused tests, and keep `verify:all` mock-safe.

---

## Task 0: Baseline Check

**Files:**
- Read: `package.json`
- Read: `docs/superpowers/specs/2026-07-04-q7-single-hero-radar-chat-design.md`

- [ ] Record the current commit SHA.

Run:

```bash
git rev-parse --short HEAD
```

Expected: `072506c` or a later Q.7-C commit.

- [ ] Confirm the working tree is clean.

Run:

```bash
git status --short
```

Expected: no output before implementation begins.

- [ ] Run baseline verification.

Run:

```bash
PATH=/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node --run typecheck
PATH=/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node --run verify:q7
PATH=/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node --run verify:q7:llm-reviser
PATH=/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node --run verify:q6
PATH=/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node --run verify:mvp-browser
```

Expected: all pass. If any fail, stop and diagnose before starting Q.7-D.

---

## Task 1: Q.7-D Hero Chat Contract Test

**Files:**
- Create: `scripts/verify-q7-hero-chat.ts`
- Modify: `package.json`

- [ ] Create `scripts/verify-q7-hero-chat.ts` with failing checks for the intended frontend/API contracts.

Use this script:

```ts
import { readFileSync, existsSync } from "node:fs";
import { createApp } from "../src/api/app";
import { createAppContext } from "../src/api/context";

let pass = 0;
let fail = 0;

function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    pass += 1;
    console.log(`PASS ${name}`);
  } else {
    fail += 1;
    console.error(`FAIL ${name}${detail ? `: ${detail}` : ""}`);
  }
}

function read(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

async function post(app: ReturnType<typeof createApp>, path: string, body: unknown) {
  const response = await app.request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await response.json() as { success: boolean; data?: any; error?: any };
  check(`${path} returns 200`, response.status === 200, String(response.status));
  check(`${path} succeeds`, json.success === true, JSON.stringify(json.error ?? {}));
  return json.data;
}

async function run() {
  const html = read("index.html");
  const heroChatJs = read("web/hero-radar-chat.js");
  const homeJs = read("web/home.js");

  check("hero chat script exists", existsSync("web/hero-radar-chat.js"));
  check("index loads hero chat script", html.includes("/hero-radar-chat.js"));
  check("index has hero chat root", html.includes("hero-radar-chat-root"));
  check("hero chat defines message state", heroChatJs.includes("heroRadarChatState"));
  check("hero chat renders radar artifact", heroChatJs.includes("renderRadarArtifact"));
  check("hero chat calls generate endpoint", heroChatJs.includes("/api/radars/generate"));
  check("hero chat calls revise endpoint", heroChatJs.includes("/api/radars/revise"));
  check("hero chat preserves confirmation gate", heroChatJs.includes("confirmHeroRadar"));
  check("hero chat has report artifact renderer", heroChatJs.includes("renderReportArtifact"));
  check("home routes primary input to hero chat", homeJs.includes("startHeroRadarChat") || heroChatJs.includes("startHeroRadarChat"));
  check("old template buttons are not primary hero requirement", !html.includes("试试看这些例子") || homeJs.includes("hideLegacyTemplatesForHero"));

  const app = createApp(createAppContext());
  const initial = await post(app, "/api/radars/generate", {
    description: "我是个人开发者，想找 AI 比赛机会，帮我盯一下。",
  });
  check("initial API returns Radar V1.0", initial.radarVersion?.version === "V1.0", initial.radarVersion?.version ?? "");

  const revised = await post(app, "/api/radars/revise", {
    previousSpec: initial.spec,
    previousRadarVersion: initial.radarVersion || initial.spec.radar_version,
    userMessage: "我不是学生，我是 OPC 创业者，优先奖金、云资源、能上架展示的比赛。",
    trigger: "requirement_correction",
  });
  check("revision API returns newer radar version", revised.radarVersion?.version !== "V1.0", revised.radarVersion?.version ?? "");
  check("revision API keeps draft unconfirmed", revised.spec?.confirmation_status?.user_confirmed === false);
}

run()
  .then(() => {
    if (fail > 0) {
      console.error(`Q.7 hero chat: ${pass} PASS / ${fail} FAIL`);
      process.exit(1);
    }
    console.log(`Q.7 hero chat: ${pass} PASS / 0 FAIL`);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
```

- [ ] Add the package script.

Modify `package.json`:

```json
"verify:q7:hero-chat": "tsx scripts/verify-q7-hero-chat.ts"
```

- [ ] Run the new test and verify it fails before implementation.

Run:

```bash
PATH=/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node --run verify:q7:hero-chat
```

Expected: FAIL because `web/hero-radar-chat.js` and `hero-radar-chat-root` do not exist yet.

---

## Task 2: Q.7-D Add Single Hero Chat State

**Files:**
- Create: `web/hero-radar-chat.js`
- Modify: `index.html`

- [ ] Create `web/hero-radar-chat.js`.

Add this first implementation:

```js
(function () {
  const state = {
    messages: [],
    currentDraft: null,
    currentResult: null,
    isBusy: false,
  };

  function uid(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  async function postJson(url, body) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error?.message || "请求失败");
    return json.data;
  }

  function addMessage(role, content, artifact) {
    state.messages.push({
      id: uid("msg"),
      role,
      content,
      artifact,
      createdAt: new Date().toISOString(),
    });
    render();
  }

  function radarSummary(radarVersion) {
    return [
      ...(radarVersion?.opportunityIntents || []).slice(0, 2),
      ...(radarVersion?.highValueCriteria || []).slice(0, 1),
    ].filter(Boolean).join(" / ");
  }

  function renderRadarArtifact(artifact) {
    const radar = artifact.payload || {};
    const diff = artifact.diff;
    return `
      <div class="hero-artifact hero-radar-artifact">
        <div class="hero-artifact-top">
          <strong>${escapeHtml(radar.oneSentencePositioning || "AI 创业者机会雷达")}</strong>
          <span>${escapeHtml(radar.version || artifact.version || "V1.0")}</span>
        </div>
        <p>${escapeHtml(radarSummary(radar) || "正在把你的需求整理成可执行雷达。")}</p>
        ${diff ? `<p class="hero-diff-summary">${escapeHtml(diff.summary || "雷达策略已更新。")}</p>` : ""}
        <details>
          <summary>查看雷达画像</summary>
          <div class="hero-radar-detail">
            <p><b>你是</b>：${escapeHtml(radar.targetUser)}</p>
            <p><b>你想盯</b>：${escapeHtml((radar.opportunityIntents || []).join("、"))}</p>
            <p><b>什么算高价值</b>：${escapeHtml((radar.highValueCriteria || []).join("、"))}</p>
            <p><b>排除</b>：${escapeHtml((radar.exclusionRules || []).join("、"))}</p>
            <p><b>优先来源</b>：${escapeHtml((radar.prioritySourceArchetypes || []).join("、"))}</p>
          </div>
        </details>
        <button class="btn-primary hero-confirm-radar" data-version="${escapeHtml(radar.version || "")}">确认，按 ${escapeHtml(radar.version || "这版雷达")} 盯一次</button>
      </div>
    `;
  }

  function renderReportArtifact(artifact) {
    return `
      <div class="hero-artifact hero-report-artifact">
        <strong>本次机会报告</strong>
        <details open>
          <summary>查看 Markdown 摘要</summary>
          <pre>${escapeHtml((artifact.markdown || "").slice(0, 3000))}</pre>
        </details>
        <button class="btn-primary hero-view-cards" data-radar-id="${escapeHtml(artifact.radarId || "")}" data-run-id="${escapeHtml(artifact.runId || "")}">查看本次机会卡</button>
      </div>
    `;
  }

  function renderArtifact(artifact) {
    if (!artifact) return "";
    if (artifact.type === "radar") return renderRadarArtifact(artifact);
    if (artifact.type === "report") return renderReportArtifact(artifact);
    if (artifact.type === "progress") {
      return `<div class="hero-artifact hero-progress-artifact">${(artifact.steps || []).map((step) => `<p>${escapeHtml(step)}</p>`).join("")}</div>`;
    }
    return "";
  }

  function render() {
    const root = document.getElementById("hero-radar-chat-root");
    if (!root) return;
    root.innerHTML = `
      <section class="hero-chat-shell">
        <header class="hero-chat-header">
          <p class="eyebrow">AI 创业者机会雷达</p>
          <h2>把你的 AI 比赛机会雷达聊清楚</h2>
          <p>先和我说你想盯什么，我会生成雷达草稿。你确认后，我再开始盯机会。</p>
        </header>
        <div class="hero-chat-messages" id="hero-chat-messages">
          ${state.messages.map((msg) => `
            <div class="hero-message hero-message-${escapeHtml(msg.role)}">
              <div class="hero-message-bubble">${escapeHtml(msg.content)}</div>
              ${renderArtifact(msg.artifact)}
            </div>
          `).join("")}
        </div>
        <form class="hero-chat-input" id="hero-chat-form">
          <textarea id="hero-chat-text" rows="3" placeholder="例如：我是个人开发者，想找 AI 比赛、Hackathon、云资源和产品展示机会"></textarea>
          <button class="btn-primary" type="submit" ${state.isBusy ? "disabled" : ""}>发送</button>
        </form>
      </section>
    `;
    root.querySelector("#hero-chat-form")?.addEventListener("submit", onSubmit);
    root.querySelectorAll(".hero-confirm-radar").forEach((btn) => btn.addEventListener("click", confirmHeroRadar));
    root.querySelectorAll(".hero-view-cards").forEach((btn) => btn.addEventListener("click", viewHeroCards));
  }

  async function onSubmit(event) {
    event.preventDefault();
    const input = document.getElementById("hero-chat-text");
    const message = input?.value?.trim();
    if (!message || state.isBusy) return;
    input.value = "";
    addMessage("user", message);
    state.isBusy = true;
    render();
    try {
      if (!state.currentDraft) {
        addMessage("assistant", "我先帮你生成一个 AI 创业者机会雷达 V1.0。");
        const data = await postJson("/api/radars/generate", { description: message });
        state.currentDraft = {
          spec: data.spec,
          radarVersion: data.radarVersion || data.spec?.radar_version,
          suggestedName: data.suggestedName || "AI 创业者机会雷达",
        };
      } else {
        addMessage("assistant", "收到，我会按你的反馈升级这版雷达。");
        const data = await postJson("/api/radars/revise", {
          previousSpec: state.currentDraft.spec,
          previousRadarVersion: state.currentDraft.radarVersion || state.currentDraft.spec?.radar_version,
          userMessage: message,
          trigger: "strategy_adjustment",
          revisionMode: "auto",
        });
        state.currentDraft = {
          spec: data.spec,
          radarVersion: data.radarVersion || data.spec?.radar_version,
          radarDiff: data.radarDiff,
          suggestedName: data.suggestedName || state.currentDraft.suggestedName,
        };
      }
      addMessage("assistant", `我把雷达整理成 ${state.currentDraft.radarVersion?.version || "新版"}，你可以先确认画像是否准确。`, {
        type: "radar",
        version: state.currentDraft.radarVersion?.version,
        status: "draft",
        payload: state.currentDraft.radarVersion,
        diff: state.currentDraft.radarDiff,
      });
    } catch (err) {
      addMessage("assistant", `这次雷达生成失败：${err instanceof Error ? err.message : "网络错误"}`);
    } finally {
      state.isBusy = false;
      render();
    }
  }

  function markSpecConfirmed(spec) {
    return {
      ...spec,
      confirmation_status: {
        ...(spec?.confirmation_status || {}),
        status: "confirmed",
        user_confirmed: true,
        confirmed_at: new Date().toISOString(),
      },
    };
  }

  async function confirmHeroRadar() {
    if (!state.currentDraft || state.isBusy) return;
    state.isBusy = true;
    addMessage("assistant", `好的，我开始按 ${state.currentDraft.radarVersion?.version || "这版雷达"} 盯机会。`, {
      type: "progress",
      steps: [
        "正在搜索官方来源……",
        "正在筛选可报名机会……",
        "正在排除展会资讯和弱页面……",
        "正在生成机会卡和 Markdown 报告……",
      ],
    });
    state.isBusy = false;
    render();
  }

  function viewHeroCards() {
    if (window.switchTab) window.switchTab("watch-result");
  }

  window.heroRadarChatState = state;
  window.startHeroRadarChat = function startHeroRadarChat(message) {
    const root = document.getElementById("hero-radar-chat-root");
    if (root) root.scrollIntoView({ behavior: "smooth", block: "start" });
    const input = document.getElementById("hero-chat-text");
    if (input && message) input.value = message;
  };
  window.renderHeroRadarChat = render;

  document.addEventListener("DOMContentLoaded", render);
})();
```

- [ ] Add the root and script to `index.html`.

Add a root near the home panel content:

```html
<div id="hero-radar-chat-root"></div>
```

Add script after existing Q.7 scripts:

```html
<script src="/hero-radar-chat.js"></script>
```

- [ ] Run focused test.

Run:

```bash
PATH=/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node --run verify:q7:hero-chat
```

Expected: PASS for Q.7-D static/API checks, except report artifact search checks are not required yet.

- [ ] Commit Q.7-D.

Run:

```bash
git add web/hero-radar-chat.js index.html scripts/verify-q7-hero-chat.ts package.json
git commit -m "Q.7-D: add single hero chat state"
```

---

## Task 3: Q.7-E Make Hero Chat the Primary Homepage Path

**Files:**
- Modify: `web/home.js`
- Modify: `index.html`
- Modify: `web/styles.css`
- Modify: `scripts/verify-mvp-ux.ts`
- Modify: `scripts/verify-q7-hero-chat.ts`

- [ ] Hide old multi-template examples from the primary hero path.

In `web/home.js`, add:

```js
function hideLegacyTemplatesForHero() {
  const templateRoot = document.getElementById("mvp-template-list");
  const templateSection = templateRoot?.closest(".quick-examples, .template-section, section") || templateRoot;
  if (templateSection) templateSection.style.display = "none";
}
```

Call it during home initialization after template rendering.

- [ ] Route the main home input to the hero chat.

Find the existing handler that starts the watch flow from the homepage input. Replace only the first action with:

```js
if (window.startHeroRadarChat) {
  window.startHeroRadarChat(inputValue);
  if (window.switchTab) window.switchTab("home");
  return;
}
```

Keep the old path available as fallback if `startHeroRadarChat` is not loaded.

- [ ] Add chat styles to `web/styles.css`.

Add:

```css
.hero-chat-shell {
  max-width: 960px;
  margin: 24px auto;
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 12px;
  background: var(--panel-bg, #fff);
  overflow: hidden;
}

.hero-chat-header {
  padding: 24px;
  border-bottom: 1px solid var(--border-color, #e5e7eb);
}

.hero-chat-messages {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 320px;
  padding: 20px;
}

.hero-message {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.hero-message-user {
  align-items: flex-end;
}

.hero-message-assistant,
.hero-message-system_event {
  align-items: flex-start;
}

.hero-message-bubble {
  max-width: min(720px, 100%);
  padding: 12px 14px;
  border-radius: 10px;
  background: #f3f4f6;
  line-height: 1.6;
}

.hero-message-user .hero-message-bubble {
  background: #111827;
  color: #fff;
}

.hero-artifact {
  width: min(720px, 100%);
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 14px;
  background: #fff;
}

.hero-artifact-top {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.hero-diff-summary {
  color: #4b5563;
}

.hero-chat-input {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 12px;
  padding: 16px;
  border-top: 1px solid var(--border-color, #e5e7eb);
}

.hero-chat-input textarea {
  resize: vertical;
  min-height: 64px;
}

@media (max-width: 720px) {
  .hero-chat-input {
    grid-template-columns: 1fr;
  }
}
```

- [ ] Update `scripts/verify-mvp-ux.ts`.

Change the old hard requirement from "template entry must be visible" to "legacy templates may exist but primary hero chat is present". Add checks:

```ts
check("Q7 hero chat root exists", html.includes("hero-radar-chat-root"));
check("Q7 hero chat script is loaded", html.includes("/hero-radar-chat.js"));
check("Q7 hero path can hide legacy templates", homeJs.includes("hideLegacyTemplatesForHero"));
```

Keep existing compatibility checks for `web/mvp-templates.js` only if they are used by old tests.

- [ ] Run tests.

Run:

```bash
PATH=/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node --run verify:q7:hero-chat
PATH=/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node --run verify:mvp-ux
```

Expected: both pass.

- [ ] Commit Q.7-E.

Run:

```bash
git add web/home.js index.html web/styles.css scripts/verify-mvp-ux.ts scripts/verify-q7-hero-chat.ts
git commit -m "Q.7-E: make hero chat the primary workspace"
```

---

## Task 4: Q.7-F Confirm Search and Return Markdown to Chat

**Files:**
- Modify: `web/hero-radar-chat.js`
- Modify: `scripts/verify-q7-hero-chat.ts`

- [ ] Implement real confirm search in `confirmHeroRadar`.

Replace the placeholder body with:

```js
async function confirmHeroRadar() {
  if (!state.currentDraft || state.isBusy) return;
  state.isBusy = true;
  const confirmedSpec = markSpecConfirmed(state.currentDraft.spec);
  confirmedSpec.radar_version = state.currentDraft.radarVersion || confirmedSpec.radar_version;

  addMessage("assistant", `好的，我开始按 ${confirmedSpec.radar_version?.version || "这版雷达"} 盯机会。`, {
    type: "progress",
    steps: [
      "正在搜索官方来源……",
      "正在筛选可报名机会……",
      "正在排除展会资讯和弱页面……",
      "正在生成机会卡和 Markdown 报告……",
    ],
  });

  try {
    const search = await postJson("/api/search", {
      spec: confirmedSpec,
      query: "AI Agent hackathon developer challenge cloud credits application deadline",
      max_results: 5,
    });
    const report = await postJson("/api/reports/generate", {
      opportunities: search.opportunityCards || [],
      spec: confirmedSpec,
      radar_type: "custom",
      profile: confirmedSpec.profile_summary,
      candidateAccounting: search.candidateAccounting,
      executionLog: search.executionLog,
      rawCandidates: search.rawCandidates,
    });

    state.currentResult = {
      runId: search.run?.id,
      markdown: report.markdown || report.data?.markdown,
      opportunityCards: search.opportunityCards || [],
    };
    addMessage("assistant", "本次机会报告已经生成。你可以先看摘要，也可以打开机会卡详情。", {
      type: "report",
      markdown: state.currentResult.markdown || "",
      runId: state.currentResult.runId,
      radarId: state.currentResult.radarId,
    });
  } catch (err) {
    addMessage("assistant", `这次搜索或报告生成失败：${err instanceof Error ? err.message : "网络错误"}。你可以继续修改雷达，或稍后重试。`);
  } finally {
    state.isBusy = false;
    render();
  }
}
```

- [ ] Make `viewHeroCards` reuse existing result surface.

Use:

```js
function viewHeroCards() {
  if (state.currentResult && window.showWatchResult) {
    window.showWatchResult({
      spec: state.currentDraft?.spec,
      radarVersion: state.currentDraft?.radarVersion,
      opportunities: state.currentResult.opportunityCards || [],
      opportunityCards: state.currentResult.opportunityCards || [],
      markdown: state.currentResult.markdown || "",
      profile: state.currentDraft?.spec?.profile_summary,
      suggestedName: state.currentDraft?.suggestedName || "AI 创业者机会雷达",
    });
    return;
  }
  if (window.switchTab) window.switchTab("watch-result");
}
```

- [ ] Extend `scripts/verify-q7-hero-chat.ts`.

Add checks:

```ts
check("hero chat confirm calls search", heroChatJs.includes("/api/search"));
check("hero chat confirm calls report generation", heroChatJs.includes("/api/reports/generate"));
check("hero chat renders view cards button", heroChatJs.includes("查看本次机会卡"));
check("hero chat does not search before confirm", heroChatJs.indexOf("/api/search") > heroChatJs.indexOf("confirmHeroRadar"));
```

- [ ] Run focused tests.

Run:

```bash
PATH=/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node --run verify:q7:hero-chat
PATH=/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node --run verify:q7:demo
```

Expected: both pass.

- [ ] Commit Q.7-F.

Run:

```bash
git add web/hero-radar-chat.js scripts/verify-q7-hero-chat.ts
git commit -m "Q.7-F: return report artifact to hero chat"
```

---

## Task 5: Q.7-G AI Entrepreneur Demo Polish

**Files:**
- Modify: `web/hero-radar-chat.js`
- Modify: `web/styles.css`
- Modify: `scripts/verify-q7-ai-entrepreneur-random.ts`
- Modify: `scripts/verify-q7-hero-chat.ts`

- [ ] Add seeded opening assistant copy.

In `render()`, when `state.messages.length === 0`, render an empty-state prompt:

```html
<div class="hero-chat-empty">
  <h3>先把一个 AI 创业者机会雷达聊准</h3>
  <p>你可以直接说：我是个人开发者，想找 AI 比赛、Hackathon、云资源和产品展示机会。</p>
</div>
```

- [ ] Add demo quick-fill chips that do not run automatically.

Use buttons that only fill the textarea:

```html
<button type="button" class="hero-fill-example" data-example="我是个人开发者，想找 AI 比赛机会，帮我盯一下。">个人开发者找 AI 比赛</button>
<button type="button" class="hero-fill-example" data-example="我不是学生，我是 OPC 创业者，优先奖金、云资源、能上架展示的比赛。">OPC 创业者修订</button>
<button type="button" class="hero-fill-example" data-example="不要展会资讯，我要能报名、能提交作品的比赛。">排除展会资讯</button>
```

They are not multi-industry templates. They are demo cue cards for the one hero flow.

- [ ] Add handler:

```js
root.querySelectorAll(".hero-fill-example").forEach((btn) => {
  btn.addEventListener("click", () => {
    const input = document.getElementById("hero-chat-text");
    if (input) input.value = btn.dataset.example || "";
  });
});
```

- [ ] Improve RadarDiff rendering.

In `renderRadarArtifact`, show:

```js
function renderDiffList(label, values) {
  if (!values || values.length === 0) return "";
  return `<p><b>${escapeHtml(label)}</b>：${values.map(escapeHtml).join("、")}</p>`;
}
```

Then include:

```html
${diff ? `
  <div class="hero-radar-diff">
    ${renderDiffList("新增", diff.added)}
    ${renderDiffList("提高权重", diff.upweighted)}
    ${renderDiffList("降低权重", diff.downweighted)}
    ${renderDiffList("查询变化", diff.queryShifts)}
  </div>
` : ""}
```

- [ ] Extend tests to check no multi-industry demo cards.

In `scripts/verify-q7-hero-chat.ts`, add:

```ts
check("hero demo focuses AI entrepreneur copy", heroChatJs.includes("AI 创业者") && heroChatJs.includes("OPC 创业者"));
check("hero demo does not present multi-industry template labels", !heroChatJs.includes("奥数竞赛") && !heroChatJs.includes("乒乓球赛事") && !heroChatJs.includes("创业比赛申报"));
```

- [ ] Run tests.

Run:

```bash
PATH=/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node --run verify:q7:hero-chat
PATH=/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node --run verify:q7:random-ai
PATH=/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node --run verify:mvp-ux
```

Expected: all pass.

- [ ] Commit Q.7-G.

Run:

```bash
git add web/hero-radar-chat.js web/styles.css scripts/verify-q7-ai-entrepreneur-random.ts scripts/verify-q7-hero-chat.ts
git commit -m "Q.7-G: polish AI entrepreneur hero demo"
```

---

## Task 6: Full Verification and Browser Smoke

**Files:**
- Modify only if tests reveal a real bug.

- [ ] Run full verification.

Run:

```bash
PATH=/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node --run typecheck
PATH=/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node --run verify:q7
PATH=/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node --run verify:q7:llm-reviser
PATH=/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node --run verify:q7:demo
PATH=/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node --run verify:q7:random-ai
PATH=/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node --run verify:q7:hero-chat
PATH=/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node --run verify:q6
PATH=/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node --run verify:q5
PATH=/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node --run verify:api-env
PATH=/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node --run verify:mvp-ux
PATH=/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node --run verify:mvp-browser
PATH=/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node --run verify:all
git diff --check
```

Expected: all pass. `verify:all` must remain mock-safe and must not call live LLM/search.

- [ ] Browser manual path.

Start server:

```bash
PATH=/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node --run dev
```

Open:

```text
http://localhost:3000/
```

Manual acceptance path:

```text
1. 首页只看到 AI 创业者机会雷达主路径，不被 3 个行业模板分散。
2. 输入：我是个人开发者，想找 AI 比赛机会，帮我盯一下。
3. 看到 assistant 消息和 Radar V1.0 artifact。
4. 输入：我不是学生，我是 OPC 创业者，优先奖金、云资源、能上架展示的比赛。
5. 看到 Radar V1.1 artifact 和 RadarDiff。
6. 输入：不要展会资讯，我要能报名、能提交作品的比赛。
7. 看到 Radar V1.2 artifact 和 RadarDiff。
8. 点击：确认，按 V1.2 盯一次。
9. 看到搜索进度消息。
10. 看到 Markdown 报告 artifact。
11. 点击：查看本次机会卡。
12. 进入现有机会卡/结果详情视图。
```

- [ ] Final status.

Run:

```bash
git status --short
git log --oneline -8
```

Expected: clean working tree after final commits.

## Completion Output

After Q.7-G, output:

- modified file list
- commit list
- Chat-first hero path explanation
- tests and results
- manual browser path
- known issues
- whether to proceed to demo recording script

Do not proceed to WeChat source, paid source packs, Random 20, Golden 20, N/O, Aliyun, or multi-radar chat windows until Jason explicitly approves.
