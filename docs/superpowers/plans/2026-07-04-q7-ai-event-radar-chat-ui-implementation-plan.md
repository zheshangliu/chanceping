# Q.7 AI 赛事雷达 Chat UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the current hero radar page into a GPT-style Chat-First AI 赛事雷达 workspace while preserving the existing radar/search/report backend.

**Architecture:** Keep `RadarVersionSpec`, `RadarDiff`, `/api/radars/generate`, `/api/radars/revise`, `/api/search`, `/api/reports/generate`, Q.5, and Q.6 untouched. Rework the frontend shell around `web/hero-radar-chat.js`: one centered homepage composer, left radar sidebar, chat timeline, compact radar/report artifacts, centered modals, and an edit entry from `我的雷达`.

**Tech Stack:** Existing no-build frontend (`web/index.html`, `web/*.js`, `web/styles.css`), TypeScript verification scripts under `scripts/`, Hono API app, existing optional Puppeteer browser smoke.

---

## Reference Spec

Implement from:

- `docs/superpowers/specs/2026-07-04-q7-single-hero-radar-chat-design.md`

Current product decisions:

- Hero demo name: `AI 赛事雷达`
- Homepage prompt: `今天你想找什么机会？`
- Main shape: GPT-like sidebar + chat workspace
- Radar details: centered modal
- Markdown report: centered modal
- Full UI-QA tooling is not part of this implementation. Only lightweight screenshot hooks are added after the first UI pass.

## File Structure

Modify these files:

- `web/index.html`
  - Rename homepage hero copy to `AI 赛事雷达`.
  - Keep only one primary composer.
  - Add lightweight semantic hooks for the chat workspace.

- `web/home.js`
  - Keep `window.startHeroRadarChat` as the primary route.
  - Hide legacy template/examples on the hero path.
  - Update hero prompt wiring to AI 赛事雷达 wording.

- `web/hero-radar-chat.js`
  - Render GPT-style sidebar + chat timeline.
  - Rename customer-facing copy to AI 赛事雷达.
  - Replace inline radar/report details with centered modal artifacts.
  - Keep generate/revise/search/report API calls unchanged.
  - Add concise report summary counts.

- `web/radars.js`
  - Show latest radar version on each custom radar card.
  - Add `编辑雷达` button that returns to the hero chat workspace with the radar context entry point.
  - Do not add full multi-radar chat persistence.

- `web/styles.css`
  - Add Chat-First layout styles.
  - Add centered modal styles.
  - Add message bubble styles.
  - Keep existing legacy styles intact where tests still depend on them.

- `scripts/verify-q7-hero-chat.ts`
  - Update static/API checks to AI 赛事雷达 naming.
  - Add checks for one composer, sidebar, centered modal controls, concise report artifact, and my-radars edit entry.

- `scripts/verify-mvp-ux.ts`
  - Update copy checks to `AI 赛事雷达` and `今天你想找什么机会？`.

- `scripts/verify-mvp-browser-smoke.ts`
  - Update browser path assertions to the new chat UI.
  - Check centered modal flow.

- `scripts/capture-q7-ui-screenshots.ts`
  - New lightweight screenshot capture script for the AI 赛事雷达 UI.

- `package.json`
  - Add `ui:q7:screenshots`.
  - Do not add this script to `verify:all`.

Do not modify:

- `src/search/*`
- `src/agents/radar-version-*.ts`
- `src/api/routes/radars.ts`
- `src/api/routes/search.ts`
- `src/api/routes/reports.ts`
- live API / provider behavior
- `api.env`

## Task 1: RED Tests For AI 赛事雷达 Chat UI

**Files:**
- Modify: `scripts/verify-q7-hero-chat.ts`
- Modify: `scripts/verify-mvp-ux.ts`
- Modify: `scripts/verify-mvp-browser-smoke.ts`

- [ ] **Step 1: Update static Q.7 checks to the new product name**

In `scripts/verify-q7-hero-chat.ts`, replace the old AI entrepreneur checks with checks that require AI 赛事雷达:

```ts
check("home copy uses AI event radar hero demo", html.includes("AI 赛事雷达"));
check("homepage primary prompt is direct", html.includes("今天你想找什么机会？"));
check("home does not expose old multi-industry template buttons", !html.includes('data-template-id="ai_events"') && !html.includes('data-template-id="policy"') && !html.includes('data-template-id="heritage"'));
check("hero chat script renders GPT-like sidebar", heroChatJs.includes("hero-radar-sidebar") && heroChatJs.includes("AI 赛事雷达"));
check("hero chat uses separate user and assistant bubbles", heroChatJs.includes("hero-chat-message user") && heroChatJs.includes("hero-chat-message assistant"));
check("radar artifact uses centered modal trigger", heroChatJs.includes("data-action=\"open-radar-modal\"") && heroChatJs.includes("hero-artifact-modal"));
check("report artifact uses centered modal trigger", heroChatJs.includes("data-action=\"open-report-modal\"") && heroChatJs.includes("hero-report-summary"));
check("report artifact keeps cards button", heroChatJs.includes("查看本次机会卡"));
```

Also update the current `home copy focuses AI entrepreneur hero demo` check so it no longer requires `AI 创业者机会雷达`.

- [ ] **Step 2: Add one-composer checks**

In `scripts/verify-q7-hero-chat.ts`, add checks that force the homepage to keep a single primary input:

```ts
const homeInputCount = (html.match(/id="home-input"/g) || []).length;
check("homepage has exactly one primary home input", homeInputCount === 1, String(homeInputCount));
check("homepage old chat confirmation input is not part of customer primary path", html.includes('class="advanced-tab"') && html.includes("hidden>需求确认</button>"));
check("home watch button says AI radar action", html.includes("开始画雷达") || html.includes("开始盯机会"));
```

- [ ] **Step 3: Add my-radars edit-entry checks**

In `scripts/verify-q7-hero-chat.ts`, read `web/radars.js` and add:

```ts
const radarsJs = read("web/radars.js");
check("my radars renders latest radar version", radarsJs.includes("getRadarVersionLabel") && radarsJs.includes("radar-version-badge"));
check("my radars has edit radar entry", radarsJs.includes("btn-edit-radar") && radarsJs.includes("editRadarFromCard"));
check("edit radar returns to chat home", radarsJs.includes("window.openHeroRadarEditor") || radarsJs.includes("window.switchTab(\"home\")"));
```

- [ ] **Step 4: Update `verify-mvp-ux` copy checks**

In `scripts/verify-mvp-ux.ts`, replace checks that require `AI 创业者机会雷达` with:

```ts
check("首页聚焦 AI 赛事雷达", html.includes("AI 赛事雷达"));
check("首页主提示词直白", html.includes("今天你想找什么机会？"));
```

Keep existing checks that protect no hidden legacy-module pollution.

- [ ] **Step 5: Update browser smoke expectations**

In `scripts/verify-mvp-browser-smoke.ts`, change the title assertion:

```ts
if (!titleText.includes("AI 赛事雷达")) fail("home should focus the AI event radar demo");
```

Add browser checks after Radar V1.0 appears:

```ts
const modalButtonVisible = await page.$$eval("[data-action='open-radar-modal']", (items: any[]) => items.length);
if (modalButtonVisible < 1) fail("radar artifact should expose centered modal button");
await page.click("[data-action='open-radar-modal']");
await page.waitForSelector(".hero-artifact-modal[open]", { timeout: 5_000 });
await page.keyboard.press("Escape");
```

Add checks after report generation:

```ts
const summaryText = await page.$eval(".hero-report-summary", (el: any) => el.textContent || "");
if (!summaryText.includes("有效机会") && !summaryText.includes("本次搜索")) fail("report artifact should show concise summary");
const reportModalButtons = await page.$$eval("[data-action='open-report-modal']", (items: any[]) => items.length);
if (reportModalButtons < 1) fail("report artifact should expose centered markdown modal button");
```

- [ ] **Step 6: Run RED verification**

Run:

```bash
node --run verify:q7:hero-chat
node --run verify:mvp-ux
node --run verify:mvp-browser
```

Expected:

- `verify:q7:hero-chat` fails on missing AI 赛事雷达 copy, sidebar hooks, modal hooks, and edit entry.
- `verify:mvp-ux` fails on homepage prompt/name.
- `verify:mvp-browser` fails on modal/summary selectors.

- [ ] **Step 7: Commit RED tests**

```bash
git add scripts/verify-q7-hero-chat.ts scripts/verify-mvp-ux.ts scripts/verify-mvp-browser-smoke.ts
git commit -m "test: capture AI event radar chat UI expectations"
```

## Task 2: Homepage Copy And Single Composer

**Files:**
- Modify: `web/index.html`
- Modify: `web/home.js`
- Modify: `web/styles.css`

- [ ] **Step 1: Update homepage hero copy**

In `web/index.html`, replace the home hero block copy with:

```html
<h2 class="home-title">AI 赛事雷达</h2>
<p class="home-subtitle">像聊天一样说清楚你想找的 AI 比赛、Hackathon、云资源和产品展示机会</p>
```

Replace the home textarea placeholder:

```html
<textarea id="home-input" placeholder="今天你想找什么机会？" rows="2"></textarea>
```

Replace the primary button text with:

```html
<button id="home-watch-btn" class="primary-btn">开始画雷达</button>
```

Replace helper copy with:

```html
<p class="home-helper">先把 AI 赛事雷达聊准。你确认雷达后，系统才会开始搜索并把报告发回聊天窗口。</p>
```

- [ ] **Step 2: Remove visible demo prompt chips from the first viewport**

In `web/index.html`, keep the `hero-demo-prompts` element for legacy script compatibility, but hide it by default:

```html
<div class="hero-demo-prompts" aria-label="AI 赛事雷达演示路径" hidden>
```

Update the internal prompt values to AI 赛事雷达 wording:

```html
<button class="hero-demo-prompt" data-hero-prompt="我是个人开发者，想找 AI 比赛机会，帮我盯一下。">个人开发者找 AI 比赛</button>
<button class="hero-demo-prompt" data-hero-prompt="我不是学生，我是 OPC 创业者，优先奖金、云资源、能上架展示的比赛。">升级为 OPC 创业者</button>
<button class="hero-demo-prompt" data-hero-prompt="不要展会资讯，我要能报名、能提交作品的比赛。">排除展会，只要报名入口</button>
```

- [ ] **Step 3: Hide legacy examples without leaving blank space**

In `web/home.js`, keep `hideLegacyTemplatesForHero()` and extend it:

```js
function hideLegacyTemplatesForHero() {
  [".home-examples-block", ".hero-demo-prompts"].forEach((selector) => {
    const block = document.querySelector(selector);
    if (block) block.hidden = true;
  });
}
```

- [ ] **Step 4: Adjust homepage spacing**

In `web/styles.css`, first add the light/dark card token if it is missing:

```css
:root[data-theme="dark"] {
  --bg-card: #202036;
}

:root[data-theme="light"] {
  --bg-card: #ffffff;
}
```

Then add or update these home styles:

```css
.home-container {
  max-width: 960px;
  margin: 0 auto;
}

.home-hero {
  min-height: 34vh;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  align-items: center;
  gap: 10px;
  padding: 48px 16px 20px;
  text-align: center;
}

.home-title {
  font-size: 28px;
  font-weight: 650;
  letter-spacing: 0;
}

.home-subtitle {
  color: var(--text-secondary);
  max-width: 620px;
}

.home-input-area {
  max-width: 760px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 40px 1fr auto;
  align-items: center;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 24px;
  background: var(--bg-card, #fff);
}

.home-input-area textarea {
  min-height: 44px;
  max-height: 140px;
  border: 0;
  outline: none;
  resize: vertical;
  background: transparent;
  font-family: inherit;
}
```

- [ ] **Step 5: Run checks**

```bash
node --run verify:q7:hero-chat
node --run verify:mvp-ux
```

Expected:

- Homepage copy checks pass.
- Modal/sidebar/edit checks still fail until later tasks.

- [ ] **Step 6: Commit homepage changes**

```bash
git add web/index.html web/home.js web/styles.css
git commit -m "feat: focus home on AI event radar composer"
```

## Task 3: GPT-Style Sidebar And Chat Shell

**Files:**
- Modify: `web/hero-radar-chat.js`
- Modify: `web/styles.css`

- [ ] **Step 1: Add sidebar renderer**

In `web/hero-radar-chat.js`, add this helper before `renderHeroRadarChat()`:

```js
function renderHeroSidebar() {
  const version = heroRadarChatState.currentDraft?.radarVersion?.version || "V1.0";
  const activeName = heroRadarChatState.currentDraft?.suggestedName || "AI 赛事雷达";
  return `
    <aside class="hero-radar-sidebar" aria-label="雷达列表">
      <div class="hero-sidebar-brand">
        <strong>ChancePing</strong>
        <span>盯机会</span>
      </div>
      <button class="hero-new-radar-btn" type="button" data-action="new-hero-radar">新雷达</button>
      <div class="hero-sidebar-section">
        <span class="hero-sidebar-label">我的雷达</span>
        <button class="hero-sidebar-radar active" type="button" data-action="focus-hero-radar">
          <span>${escapeHtml(activeName)}</span>
          <small>${escapeHtml(version)}</small>
        </button>
      </div>
    </aside>
  `;
}
```

- [ ] **Step 2: Render chat shell with sidebar**

In `renderHeroRadarChat()`, replace the section wrapper with:

```js
root.innerHTML = `
  <section class="hero-chat-workspace">
    ${renderHeroSidebar()}
    <div class="hero-chat-main">
      <div class="hero-chat-header">
        <div>
          <span>AI 赛事雷达</span>
          <strong>一个聊天窗口，一个正在成长的雷达</strong>
        </div>
        <button id="hero-chat-reset" class="hero-chat-reset" type="button">重新开始</button>
      </div>
      <div class="hero-chat-messages">
        ${messages.map(renderMessage).join("")}
      </div>
      ${chatStarted ? `<div class="hero-chat-input-row">
        <textarea id="hero-radar-chat-input" rows="2" placeholder="继续告诉我：你是谁、不要什么、什么结果才算有用"></textarea>
        <button id="hero-radar-chat-send" class="primary-btn" ${heroRadarChatState.isBusy ? "disabled" : ""}>发送</button>
      </div>` : ""}
    </div>
  </section>
`;
```

Remove the visible `hero-chat-guide` from the chat after this replacement. The chat itself should teach the flow through messages and artifacts.

- [ ] **Step 3: Wire sidebar buttons**

After existing reset listener binding, add:

```js
root.querySelector("[data-action='new-hero-radar']")?.addEventListener("click", resetHeroRadarChat);
root.querySelector("[data-action='focus-hero-radar']")?.addEventListener("click", () => {
  root.querySelector("#hero-radar-chat-input")?.focus();
});
```

- [ ] **Step 4: Rename fallback display strings**

In `web/hero-radar-chat.js`, replace customer-facing fallback names:

```js
"AI 创业者机会雷达"
```

with:

```js
"AI 赛事雷达"
```

Keep user identity text such as `OPC 创业者` in prompts and examples.

- [ ] **Step 5: Add workspace CSS**

In `web/styles.css`, add:

```css
.hero-chat-workspace {
  width: min(1180px, calc(100vw - 32px));
  min-height: 620px;
  margin: 24px auto;
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
  border: 1px solid var(--border);
  border-radius: 20px;
  overflow: hidden;
  background: var(--bg-secondary);
}

.hero-radar-sidebar {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
  border-right: 1px solid var(--border);
  background: color-mix(in srgb, var(--bg-secondary) 92%, #fff 8%);
}

.hero-sidebar-brand {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-height: 36px;
}

.hero-new-radar-btn,
.hero-sidebar-radar {
  width: 100%;
  min-height: 40px;
  text-align: left;
  border-radius: 10px;
}

.hero-sidebar-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.hero-sidebar-label {
  color: var(--text-muted);
  font-size: 12px;
}

.hero-sidebar-radar.active {
  border-color: var(--accent);
  background: var(--highlight-bg);
}

.hero-sidebar-radar span,
.hero-sidebar-radar small {
  display: block;
}

.hero-chat-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  min-height: 620px;
}

.hero-chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 24px clamp(16px, 4vw, 64px);
}

@media (max-width: 760px) {
  .hero-chat-workspace {
    width: calc(100vw - 16px);
    grid-template-columns: 1fr;
  }

  .hero-radar-sidebar {
    border-right: 0;
    border-bottom: 1px solid var(--border);
  }
}
```

- [ ] **Step 6: Run checks**

```bash
node --run verify:q7:hero-chat
node --run verify:mvp-ux
```

Expected:

- Sidebar and naming checks pass.
- Modal/report-summary/edit-entry checks still fail until later tasks.

- [ ] **Step 7: Commit sidebar shell**

```bash
git add web/hero-radar-chat.js web/styles.css
git commit -m "feat: add AI event radar chat shell"
```

## Task 4: Centered Modal Artifacts

**Files:**
- Modify: `web/hero-radar-chat.js`
- Modify: `web/styles.css`

- [ ] **Step 1: Add modal state**

Extend `heroRadarChatState`:

```js
modal: null,
```

The modal values are:

```js
{ type: "radar", version: string }
{ type: "report", messageId: string }
```

- [ ] **Step 2: Add modal open/close helpers**

Add these helpers before `renderHeroRadarChat()`:

```js
function openHeroModal(modal) {
  heroRadarChatState.modal = modal;
  saveState();
  renderHeroRadarChat();
}

function closeHeroModal() {
  heroRadarChatState.modal = null;
  saveState();
  renderHeroRadarChat();
}
```

- [ ] **Step 3: Change radar artifact to compact card**

In `renderRadarArtifact(message)`, remove inline `<details class="hero-radar-details">` and collapsed diff details from the default chat card.

Keep a concise card:

```js
<div class="hero-artifact-summary-grid">
  ${renderList("你是", payload.targetUser)}
  ${renderList("这版雷达会盯", payload.opportunityIntents)}
  ${renderList("不盯什么", payload.exclusionRules)}
</div>
<div class="hero-artifact-actions">
  <button class="secondary-btn" data-action="open-radar-modal" data-version="${escapeHtml(version)}">查看雷达画像</button>
  ${isLatestDraft ? `<button class="btn-primary hero-confirm-radar-btn" data-action="confirm-hero-radar">确认，按 ${escapeHtml(version)} 盯一次</button>` : ""}
  <span>不准的话，直接在聊天框继续说，我会先升级雷达。</span>
</div>
```

Keep replaced-draft compact behavior.

- [ ] **Step 4: Add radar modal renderer**

Add:

```js
function findRadarArtifactByVersion(version) {
  return heroRadarChatState.messages
    .map((message) => message.artifact)
    .find((artifact) => artifact?.type === "radar" && (artifact.version || artifact.payload?.version) === version);
}

function renderRadarModal(version) {
  const artifact = findRadarArtifactByVersion(version);
  if (!artifact) return "";
  const payload = artifact.payload || {};
  const diff = artifact.diff || {};
  return `
    <dialog class="hero-artifact-modal" open aria-label="雷达画像">
      <div class="hero-modal-card">
        <button class="hero-modal-close" type="button" data-action="close-hero-modal">关闭</button>
        <div class="hero-artifact-topline">
          <span class="hero-artifact-kicker">AI 赛事雷达</span>
          <span class="hero-version-pill">${escapeHtml(version)}</span>
        </div>
        <h3>${escapeHtml(payload.oneSentencePositioning || payload.name || "AI 赛事雷达")}</h3>
        <div class="hero-artifact-grid">
          ${renderList("你是", payload.targetUser)}
          ${renderList("这版雷达会盯", payload.opportunityIntents)}
          ${renderList("什么算高价值", payload.highValueCriteria)}
          ${renderList("不盯什么", payload.exclusionRules)}
          ${renderList("优先看哪些来源", payload.prioritySourceArchetypes)}
          ${renderList("会用哪些查询方向", payload.queryFamilies)}
          ${renderList("默认假设", payload.defaultAssumptions)}
          ${renderList("还缺哪些信息", payload.missingConfig)}
        </div>
        ${diff && Object.keys(diff).length > 0 ? `
          <div class="hero-radar-diff-body">
            <h4>本次主要修改</h4>
            ${renderDiffList("新增", diff.added)}
            ${renderDiffList("移除", diff.removed)}
            ${renderDiffList("提高权重", diff.upweighted)}
            ${renderDiffList("降低权重", diff.downweighted)}
            ${renderDiffList("查询变化", diff.queryShifts)}
            ${renderDiffList("来源变化", diff.sourceShifts)}
            ${renderDiffList("高价值标准变化", diff.highValueCriteriaChanges)}
            ${renderDiffList("排除规则变化", diff.exclusionChanges)}
          </div>
        ` : ""}
      </div>
    </dialog>
  `;
}
```

- [ ] **Step 5: Render modal from chat root**

In `renderHeroRadarChat()`, append before closing `</section>`:

```js
${heroRadarChatState.modal?.type === "radar" ? renderRadarModal(heroRadarChatState.modal.version) : ""}
${heroRadarChatState.modal?.type === "report" ? renderReportModal(heroRadarChatState.modal.messageId) : ""}
```

- [ ] **Step 6: Wire modal events**

In `renderHeroRadarChat()`, add:

```js
root.querySelectorAll("[data-action='open-radar-modal']").forEach((button) => {
  button.addEventListener("click", () => openHeroModal({ type: "radar", version: button.dataset.version || "" }));
});
root.querySelectorAll("[data-action='close-hero-modal']").forEach((button) => {
  button.addEventListener("click", closeHeroModal);
});
root.querySelector(".hero-artifact-modal")?.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeHeroModal();
});
```

- [ ] **Step 7: Add modal CSS**

In `web/styles.css`, add:

```css
.hero-artifact-modal {
  width: min(760px, calc(100vw - 32px));
  max-height: min(760px, calc(100vh - 48px));
  padding: 0;
  border: 0;
  border-radius: 16px;
  background: transparent;
  color: var(--text-primary);
}

.hero-artifact-modal::backdrop {
  background: rgba(0, 0, 0, 0.42);
}

.hero-modal-card {
  position: relative;
  max-height: min(760px, calc(100vh - 48px));
  overflow: auto;
  padding: 24px;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: var(--bg-primary);
}

.hero-modal-close {
  position: absolute;
  top: 14px;
  right: 14px;
  min-width: 44px;
  min-height: 36px;
}
```

- [ ] **Step 8: Run checks**

```bash
node --run verify:q7:hero-chat
node --run verify:mvp-browser
```

Expected:

- Radar modal checks pass.
- Report modal checks still fail until Task 5.

- [ ] **Step 9: Commit modal radar artifact**

```bash
git add web/hero-radar-chat.js web/styles.css
git commit -m "feat: show radar artifact in centered modal"
```

## Task 5: Concise Report Artifact And Markdown Modal

**Files:**
- Modify: `web/hero-radar-chat.js`
- Modify: `web/styles.css`

- [ ] **Step 1: Add report summary helper**

In `web/hero-radar-chat.js`, add:

```js
function summarizeOpportunityCards(cards) {
  const list = Array.isArray(cards) ? cards : [];
  const levelCounts = list.reduce((acc, card) => {
    const level = card.visible_level || card.level || "待复核";
    acc[level] = (acc[level] || 0) + 1;
    return acc;
  }, {});
  const levelText = ["S", "A", "B", "C"]
    .map((level) => `${level} 级 ${levelCounts[level] || 0} 条`)
    .join("，");
  return {
    total: list.length,
    levelText,
    topTitle: list[0]?.title || "",
  };
}
```

- [ ] **Step 2: Store cards in report artifact**

In `confirmHeroRadar()`, change the report artifact message to include cards:

```js
const summary = summarizeOpportunityCards(cards);
addMessage("assistant", `本次搜索完成：找到 ${summary.total} 条有效机会，${summary.levelText}。${summary.topTitle ? `我建议先看：${summary.topTitle}` : "我没有把观察信号冒充为重点机会。"}`, {
  type: "report",
  markdown: report.markdown,
  runId: search.run?.id,
  reportId: report.reportId,
  cards,
});
```

- [ ] **Step 3: Render compact report artifact**

Replace `renderReportArtifact(message)` with a compact version:

```js
function renderReportArtifact(message) {
  const artifact = message.artifact || {};
  const summary = summarizeOpportunityCards(artifact.cards || heroRadarChatState.currentResult?.opportunityCards || []);
  return `
    <article class="hero-report-artifact">
      <div class="hero-artifact-topline">
        <span class="hero-artifact-kicker">Markdown Report</span>
        ${artifact.runId ? `<span class="hero-version-pill">${escapeHtml(artifact.runId)}</span>` : ""}
      </div>
      <div class="hero-report-summary">
        <strong>本次搜索出 ${escapeHtml(summary.total)} 条有效机会</strong>
        <span>${escapeHtml(summary.levelText)}</span>
        ${summary.topTitle ? `<p>优先查看：${escapeHtml(summary.topTitle)}</p>` : `<p>本轮没有把观察信号冒充为重点机会。</p>`}
      </div>
      <div class="hero-artifact-actions">
        <button class="secondary-btn" data-action="open-report-modal" data-message-id="${escapeHtml(message.id)}">查看完整 Markdown 报告</button>
        <button class="btn-primary" data-action="view-hero-cards">查看本次机会卡</button>
      </div>
    </article>
  `;
}
```

- [ ] **Step 4: Add report modal renderer**

Add:

```js
function findMessageById(messageId) {
  return heroRadarChatState.messages.find((message) => message.id === messageId);
}

function renderReportModal(messageId) {
  const message = findMessageById(messageId);
  const markdown = message?.artifact?.markdown || "本次报告暂未生成。";
  return `
    <dialog class="hero-artifact-modal" open aria-label="Markdown 报告">
      <div class="hero-modal-card hero-report-modal-card">
        <button class="hero-modal-close" type="button" data-action="close-hero-modal">关闭</button>
        <div class="hero-artifact-topline">
          <span class="hero-artifact-kicker">Markdown Report</span>
        </div>
        <pre class="hero-report-markdown">${escapeHtml(markdown)}</pre>
      </div>
    </dialog>
  `;
}
```

- [ ] **Step 5: Wire report modal button**

In `renderHeroRadarChat()`, add:

```js
root.querySelectorAll("[data-action='open-report-modal']").forEach((button) => {
  button.addEventListener("click", () => openHeroModal({ type: "report", messageId: button.dataset.messageId || "" }));
});
```

- [ ] **Step 6: Add report CSS**

In `web/styles.css`, add:

```css
.hero-report-summary {
  display: grid;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg-secondary);
}

.hero-report-summary span {
  color: var(--text-secondary);
}

.hero-report-markdown {
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 68vh;
  overflow: auto;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 13px;
  line-height: 1.6;
}
```

- [ ] **Step 7: Run checks**

```bash
node --run verify:q7:hero-chat
node --run verify:mvp-browser
```

Expected:

- Q.7 static checks pass except my-radars edit entry if not yet implemented.
- Browser report summary and modal checks pass.

- [ ] **Step 8: Commit report artifact**

```bash
git add web/hero-radar-chat.js web/styles.css
git commit -m "feat: show report summary with markdown modal"
```

## Task 6: My Radars Version Badge And Edit Entry

**Files:**
- Modify: `web/radars.js`
- Modify: `web/hero-radar-chat.js`
- Modify: `web/styles.css`

- [ ] **Step 1: Add version label helper**

In `web/radars.js`, add near other helpers:

```js
function getRadarVersionLabel(radar) {
  const version = radar?.spec?.radar_version?.version
    || radar?.spec?.radarVersion?.version
    || radar?.spec?.version
    || radar?.currentVersion
    || "V1.0";
  return String(version);
}
```

- [ ] **Step 2: Render version badge and edit button**

In `buildRadarCard(radar)`, add after `radar-status-text`:

```js
<span class="radar-version-badge">${escapeHtml(getRadarVersionLabel(radar))}</span>
```

Add an edit button before `查看机会和报告`:

```html
<button class="btn-edit-radar" data-radar-id="${escapeAttr(radar.id)}">编辑雷达</button>
```

- [ ] **Step 3: Wire edit button**

In `buildRadarCard(radar)`, bind:

```js
const editBtn = card.querySelector(".btn-edit-radar");
if (editBtn) {
  editBtn.addEventListener("click", () => editRadarFromCard(radar));
}
```

Add:

```js
function editRadarFromCard(radar) {
  if (window.openHeroRadarEditor) {
    window.openHeroRadarEditor(radar);
    return;
  }
  if (window.switchTab) window.switchTab("home");
  document.getElementById("home-input")?.focus();
}
```

- [ ] **Step 4: Add hero editor entry function**

In `web/hero-radar-chat.js`, add:

```js
function openHeroRadarEditor(radar) {
  if (window.switchTab) window.switchTab("home");
  const name = radar?.name || "AI 赛事雷达";
  addMessage("assistant", `已打开「${name}」的雷达窗口。你可以直接告诉我哪里要改，我会先生成新版雷达给你确认。`);
  const input = document.getElementById("hero-radar-chat-input") || document.getElementById("home-input");
  input?.focus();
}
```

Expose it:

```js
window.openHeroRadarEditor = openHeroRadarEditor;
```

This is a bridge only. It does not add real multi-radar chat persistence.

- [ ] **Step 5: Add styles**

In `web/styles.css`, add:

```css
.radar-version-badge {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  min-height: 24px;
  padding: 2px 8px;
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--text-secondary);
  font-size: 12px;
}

.btn-edit-radar {
  border-color: var(--accent);
  color: var(--accent);
  background: transparent;
}
```

- [ ] **Step 6: Run checks**

```bash
node --run verify:q7:hero-chat
node --run verify:mvp-ux
```

Expected:

- My-radars edit and version static checks pass.

- [ ] **Step 7: Commit my-radars edit entry**

```bash
git add web/radars.js web/hero-radar-chat.js web/styles.css
git commit -m "feat: add edit entry for AI event radar"
```

## Task 7: Lightweight UI Screenshots

**Files:**
- Create: `scripts/capture-q7-ui-screenshots.ts`
- Modify: `package.json`

- [ ] **Step 1: Create screenshot capture script**

Create `scripts/capture-q7-ui-screenshots.ts`:

```ts
import { spawn } from "child_process";
import fs from "fs";
import path from "path";

process.env.DATA_MODE = process.env.DATA_MODE ?? "mock";
process.env.LLM_MODE = process.env.LLM_MODE ?? "mock";
process.env.PORT = process.env.PORT ?? "3107";

const port = Number(process.env.PORT);
const baseUrl = `http://127.0.0.1:${port}`;
const outDir = path.resolve(process.cwd(), "reports", "ui-audit", "screenshots", "q7-ai-event-radar");
let server: ReturnType<typeof spawn> | null = null;

async function waitForServer() {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(baseUrl);
      if (res.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`server not ready at ${baseUrl}`);
}

async function main() {
  let puppeteer: any;
  try {
    puppeteer = (await import("puppeteer")).default;
  } catch {
    console.log("SKIP puppeteer not installed; screenshots not captured");
    return;
  }

  fs.mkdirSync(outDir, { recursive: true });
  server = spawn("./node_modules/.bin/tsx", ["src/api/server.ts"], {
    env: { ...process.env, PORT: String(port), DATA_MODE: "mock", LLM_MODE: "mock", STORE_TYPE: "meili", MEILI_MOCK: "true" },
    stdio: "ignore",
  });
  await waitForServer();

  const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const browser = await puppeteer.launch({
    headless: "new",
    ...(fs.existsSync(chromePath) ? { executablePath: chromePath } : {}),
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
    await page.goto(baseUrl, { waitUntil: "networkidle0" });
    await page.screenshot({ path: path.join(outDir, "01-home.png"), fullPage: true });
    await page.type("#home-input", "我是个人开发者，想找 AI 比赛机会，帮我盯一下。");
    await page.click("#home-watch-btn");
    await page.waitForSelector("[data-hero-radar-version='V1.0']", { timeout: 10_000 });
    await page.screenshot({ path: path.join(outDir, "02-chat-radar-card.png"), fullPage: true });
    await page.click("[data-action='open-radar-modal']");
    await page.waitForSelector(".hero-artifact-modal[open]", { timeout: 5_000 });
    await page.screenshot({ path: path.join(outDir, "03-radar-modal.png"), fullPage: true });
    console.log(`Q7 UI screenshots saved to ${outDir}`);
  } finally {
    await browser.close();
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    if (server) server.kill();
  });
```

- [ ] **Step 2: Add package script**

In `package.json`, add:

```json
"ui:q7:screenshots": "tsx scripts/capture-q7-ui-screenshots.ts"
```

Do not add it to `verify:all`.

- [ ] **Step 3: Run screenshot script**

```bash
node --run ui:q7:screenshots
```

Expected:

- If Puppeteer is installed, screenshots are written under `reports/ui-audit/screenshots/q7-ai-event-radar/`.
- If Puppeteer is missing, the script prints `SKIP puppeteer not installed; screenshots not captured` and exits 0.

- [ ] **Step 4: Commit screenshot hook**

```bash
git add scripts/capture-q7-ui-screenshots.ts package.json reports/.gitkeep
git commit -m "chore: add Q7 UI screenshot capture"
```

## Task 8: Final Regression And Manual Browser Pass

**Files:**
- No source changes unless a verification failure identifies a concrete issue.

- [ ] **Step 1: Run required static and regression checks**

```bash
node --run typecheck
node --run verify:q7:hero-chat
node --run verify:mvp-ux
node --run verify:mvp-browser
node --run verify:v15:e2e
node --run verify:v15
node --run verify:v16
node --run verify:all
git diff --check
```

Expected:

- All commands exit 0.
- `verify:all` remains mock-safe and does not call live LLM or live search.

- [ ] **Step 2: Run local manual path**

Start dev server:

```bash
node --run dev
```

Open:

```text
http://localhost:3000/
```

Manual path:

```text
首页看到：AI 赛事雷达
首页只有一个输入框，placeholder 是：今天你想找什么机会？
输入：我是个人开发者，想找 AI 比赛机会，帮我盯一下。
点击：开始画雷达
看到右侧聊天窗口生成 V1.0 雷达卡
点击：查看雷达画像
看到居中弹窗
关闭弹窗
输入：我不是学生，我是 OPC 创业者，优先奖金、云资源、能上架展示的比赛。
看到 V1.1 和本次修改摘要
输入：不要展会资讯，我要能报名、能提交作品的比赛。
看到 V1.2
点击：确认，按 V1.2 盯一次
看到搜索进度消息
看到报告摘要
点击：查看完整 Markdown 报告
看到居中弹窗
点击：查看本次机会卡
进入现有机会卡结果页
保存长期雷达后进入 我的雷达
看到版本号和 编辑雷达
点击 编辑雷达 后回到聊天窗口
```

- [ ] **Step 3: Check browser console**

Expected:

- No app `pageerror`.
- No app console error except external browser-extension/tooling noise.
- No API key or secret value appears in page text or console logs.

- [ ] **Step 4: Commit any verification-only fixes**

If Step 1 or Step 2 exposed a concrete issue and it was fixed:

```bash
git add <changed-files>
git commit -m "fix: stabilize AI event radar chat UI"
```

If no fixes were needed, do not create an empty commit.

## Implementation Stop Point

Stop after Task 8.

Do not proceed to:

- full UI-QA Lighthouse/axe installation
- assistant-ui / shadcn/ui / react-markdown migration
- Random 20 / Golden 20
- WeChat source
- login
- payment
- radar marketplace
- team collaboration
- Aliyun deployment

## Final Report Format

When implementation finishes, report:

1. Modified file list
2. Commit list
3. UI changes
4. Test command results
5. Manual browser path result
6. Screenshots path if generated
7. Known issues
8. Whether to enter AI 赛事雷达 demo polish

## Self-Review

Spec coverage:

- AI 赛事雷达 naming: Task 1, Task 2, Task 3
- Single homepage composer: Task 1, Task 2
- GPT-style sidebar: Task 1, Task 3
- Different user/assistant message backgrounds: Task 3 CSS
- Radar centered modal: Task 4
- Report centered modal and concise summary: Task 5
- Search progress copy: existing flow preserved, browser checked in Task 8
- My Radars version/edit entry: Task 6
- UI-QA timing: Task 7 lightweight screenshots only, full tooling deferred
- Existing backend preserved: tasks only touch frontend and verification scripts

Placeholder scan:

- This plan contains no open-ended implementation slots.
- Every implementation task has files, code snippets, run commands, and commit commands.

Type consistency:

- `heroRadarChatState.modal`, `openHeroModal`, `closeHeroModal`, `renderRadarModal`, and `renderReportModal` are introduced before use.
- `getRadarVersionLabel`, `editRadarFromCard`, and `openHeroRadarEditor` are introduced before verification checks require them.
