# AI Event Sample Room Total Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the remaining TRAE official-source gap, freeze the AI event radar as the first sample room, polish the main console UI, and prepare `/ai-events` as the first public intelligence page.

**Architecture:** Keep the existing Hono + plain web UI architecture. Treat backend lifecycle/status fields as internal implementation details, while the customer-facing UI speaks in opportunity/result language. Reuse the same opportunity-card and report-result surface across first-run results, saved radar results, radar detail, and the later `/ai-events` page.

**Tech Stack:** TypeScript, Hono API routes, plain JavaScript files under `web/`, JSON-backed radar/report/opportunity stores, existing `node --run` verification scripts.

---

## Current Judgment

No blocking product uncertainty remains. Start work without another product confirmation.

Use these non-blocking boundary decisions:

- `TRAE 官方报名专区 / 官方活动页` is the only remaining backend quality gate before the sample room is frozen.
- `删除雷达` is the user-facing label. Keep the backend soft-delete/archive semantics first because quota release, historical reports, and stored opportunities already depend on `archived` / `deletedAt`.
- Do not expose lifecycle words such as `激活`, `暂停`, `停止`, `运行中`, `归档`, `succeeded`, `failed` in the customer UI. Backend statuses can stay internal.
- Keep day mode only. The previous sun/moon theme switch is removed from the UI. A real `中文 / English` switch requires full frontend i18n and is not part of this first execution pass.
- Do not continue polishing Markdown weekly report format. Once Q.7-G5 passes, move to sample room and UI.

## Execution Order

1. Q.7-G5: stabilize TRAE official source for the AI event radar.
2. Phase 1: freeze `AI 赛事雷达` as the first read-only sample room.
3. Phase 2A: polish global shell, header/banner, collapsible sidebar, and wider chat workspace.
4. Phase 2B: unify result pages and opportunity-card layout.
5. Phase 2C: simplify `我的雷达` list and radar detail/history UI.
6. Phase 3: add `/ai-events` public page using cleaned opportunity-card data.
7. Defer Phase 4: one radar = one chat, long-term chat context, Radar/Reader Memory Summary.

## Runtime Commands

Use normal commands first:

```bash
node --run typecheck
node --run verify:q7:demo
node --run verify:v15:e2e
node --run verify:v15
node --run verify:v16
node --run verify:all
git diff --check
```

If `node` is not on `PATH` in the current environment, run the same commands with:

```bash
PATH=/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node --run typecheck
PATH=/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node --run verify:q7:demo
PATH=/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node --run verify:v15:e2e
PATH=/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node --run verify:v15
PATH=/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node --run verify:v16
PATH=/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node --run verify:all
git diff --check
```

Expected final result: all listed commands exit 0. If `verify:v16` or `verify:all` is missing in `package.json`, add the script before continuing.

## File Map

Backend search quality:

- Modify: `src/search/opportunity-strategy.ts`
- Modify: `src/search/primary-source-recovery.ts`
- Modify: `src/search/evidence-read-priority.ts`
- Modify: `src/search/candidate-page-type.ts`
- Modify: `src/search/candidate-ranking.ts`
- Modify: `src/search/opportunity-card-mapper.ts`
- Test: `scripts/verify-q7-ai-competition-demo.ts`
- Regression: `scripts/verify-q6h-primary-source.ts`

Sample room and main console UI:

- Modify: `web/index.html`
- Modify: `web/home.js`
- Modify: `web/hero-radar-chat.js`
- Modify: `web/watch-result.js`
- Modify: `web/radars.js`
- Modify: `web/radar-detail.js`
- Modify: `web/styles.css`
- Test: `scripts/verify-q7-hero-chat.ts`
- Test: `scripts/verify-task025.ts`

API and public page:

- Modify: `src/api/routes/web-ui.ts`
- Create: `web/ai-events.html`
- Create: `web/ai-events.js`
- Modify or create: `src/api/routes/public-ai-events.ts`
- Modify: `src/api/app.ts`
- Test: `scripts/verify-e2e-ai-events.ts`

Planning/spec reference:

- Reference: `docs/superpowers/specs/2026-07-05-ai-event-sample-room-roadmap.md`

---

### Task 0: Safety Baseline

**Files:**
- Read: `AGENTS.md`
- Read: `package.json`
- Read: `docs/superpowers/specs/2026-07-05-ai-event-sample-room-roadmap.md`

- [ ] **Step 1: Confirm branch**

Run:

```bash
git branch --show-current
git status --short
```

Expected:

```text
rescue/mvp-codex
```

There may already be modified Q.6/Q.7 files. Do not revert unrelated work.

- [ ] **Step 2: Confirm available scripts**

Run:

```bash
node -e "const p=require('./package.json'); console.log(p.scripts)"
```

Expected: the output includes `typecheck`, `verify:v15:e2e`, `verify:v15`, `verify:v16`, `verify:all`, and `verify:q7:demo`.

- [ ] **Step 3: Run baseline verification before editing**

Run:

```bash
node --run typecheck
node --run verify:q7:demo
node --run verify:v15:e2e
```

Expected: current baseline is known. If Q.7 fails because of TRAE official-source assertions added in Task 1, continue with Task 1.

---

### Task 1: Q.7-G5 TRAE Official Source

**Files:**
- Modify: `scripts/verify-q7-ai-competition-demo.ts`
- Modify: `src/search/opportunity-strategy.ts`
- Modify: `src/search/primary-source-recovery.ts`
- Modify: `src/search/evidence-read-priority.ts`
- Modify: `src/search/candidate-page-type.ts`
- Modify: `src/search/candidate-ranking.ts`
- Modify: `src/search/opportunity-card-mapper.ts`

- [ ] **Step 1: Add failing TRAE official-source assertions**

In `scripts/verify-q7-ai-competition-demo.ts`, add checks near the existing AI event strategy / primary-source checks:

```ts
const traeQueries = buildPrimarySourceRecoveryQueries({
  title: "TRAE AI 创造力大赛媒体报道",
  url: "https://example-media.com/trae-ai-contest-news",
  snippet: "TRAE AI 创造力大赛 报名 官方 活动页",
} as any);
const traeQueryText = traeQueries.map((item) => item.query).join("\n");
check("TRAE recovery includes official/forum scoped query", /site:forum\.trae\.cn|TRAE[\s\S]{0,30}(官方|报名|活动页|创造力大赛)/i.test(traeQueryText), traeQueryText);

const traeCards = sortOpportunityCardsForDisplay([
  mapToCard({
    title: "TRAE AI 创造力大赛官方报名专区",
    url: "https://forum.trae.cn/activity/ai-contest",
    snippet: "官方报名入口，提交作品，活动规则",
    source_type: "web",
  } as any, { dataMode: "live" } as any),
  mapToCard({
    title: "媒体报道 TRAE AI 创造力大赛",
    url: "https://news.example.com/trae-report",
    snippet: "新闻转载，介绍活动信息",
    source_type: "web",
  } as any, { dataMode: "live" } as any),
].filter(Boolean) as any[]);
check("TRAE official card outranks media report", /forum\.trae\.cn|trae/i.test(traeCards[0]?.official_source_url || traeCards[0]?.source_url || ""), JSON.stringify(traeCards));
```

Run:

```bash
node --run verify:q7:demo
```

Expected before implementation: the new TRAE checks fail or expose the current unstable behavior.

- [ ] **Step 2: Strengthen TRAE query planning**

In `src/search/opportunity-strategy.ts`, keep AI-event-specific TRAE query families scoped to official/action intent. The generated query text must include these meanings:

```text
site:forum.trae.cn TRAE AI 创造力大赛 报名
TRAE AI 创造力大赛 官方 报名 规则
TRAE AI IDE Vibe Coding challenge application
```

Do not add TRAE queries to non-AI radars. Preserve the existing non-AI pollution assertion in `scripts/verify-q7-ai-competition-demo.ts`.

- [ ] **Step 3: Strengthen TRAE primary-source recovery**

In `src/search/primary-source-recovery.ts`, make TRAE recovery recognize official/forum domains and action pages. The recovery output must prefer:

```text
forum.trae.cn
trae.ai
trae.cn
official activity page
registration/application/rules page
```

Media-only URLs should remain evidence or background, not the top action card.

- [ ] **Step 4: Strengthen evidence and ranking**

In `src/search/evidence-read-priority.ts`, `src/search/candidate-page-type.ts`, and `src/search/candidate-ranking.ts`, make official TRAE registration/activity pages higher priority than news reposts. The ranking rules must treat these signals as positive:

```text
official domain
registration/application keyword
rules/submission keyword
event landing page
```

The ranking rules must treat these signals as weaker:

```text
news repost
article-only page
no application path
no organizer/official domain signal
```

- [ ] **Step 5: Map official TRAE source into the opportunity card**

In `src/search/opportunity-card-mapper.ts`, ensure a TRAE official card exposes customer-safe fields:

```text
title
official_source_url
evidence_status
action_status
source_disclaimer
recommendedActions
```

Expected behavior:

```text
official TRAE source -> direct opportunity / prepare
media-only TRAE source -> needs_review / trace official source
```

- [ ] **Step 6: Verify Q.7-G5**

Run:

```bash
node --run typecheck
node --run verify:q7:demo
node --run verify:v15:e2e
git diff --check
```

Expected: all commands exit 0. After this, stop Markdown report-format polishing and continue to Task 2.

---

### Task 2: Freeze `AI 赛事雷达` As Sample Room

**Files:**
- Modify: `web/index.html`
- Modify: `web/home.js`
- Modify: `web/hero-radar-chat.js`
- Modify: `web/watch-result.js`
- Modify: `web/styles.css`
- Test: `scripts/verify-q7-hero-chat.ts`

- [ ] **Step 1: Add sample-room assertions**

In `scripts/verify-q7-hero-chat.ts`, add checks that make the sample-room contract explicit:

```ts
check("AI event sample room is the first sidebar radar", /AI 赛事雷达[\s\S]{0,240}我的雷达/.test(heroChatJs + html));
check("sample room prompt is fixed", heroChatJs.includes("HERO_DEMO_PROMPT") && heroChatJs.includes("未来 30-60 天内仍可报名"));
check("sample room original is read-only", heroChatJs.includes("复制为我的雷达") || heroChatJs.includes("样板间"));
check("sample room can run fixed prompt through V1.0 confirmation", heroChatJs.includes("确认，按") && heroChatJs.includes("/api/search") && heroChatJs.includes("/api/reports/generate"));
```

Run:

```bash
node --run verify:q7:hero-chat
```

Expected before implementation: any missing sample-room checks fail.

- [ ] **Step 2: Keep the fixed prompt as the only primary Hero Demo prompt**

In `web/hero-radar-chat.js`, keep one fixed prompt constant for AI events. The customer should not need to write a custom prompt to experience the demo.

Required UI flow:

```text
AI 赛事雷达 -> 发送固定提示词 -> AI 赛事雷达 V1.0 -> 确认，按 V1.0 盯一次 -> 查看机会卡 / 报告
```

- [ ] **Step 3: Make the sample room read-only**

In `web/hero-radar-chat.js`, distinguish the original sample room from user-owned radars:

```text
Original sample room: view and run demo only
User copy: editable radar
```

Customer-facing action labels:

```text
发送固定提示词
确认，按 V1.0 盯一次
查看本次机会卡
复制为我的雷达
```

- [ ] **Step 4: Verify sample room**

Run:

```bash
node --run verify:q7:hero-chat
node --run verify:v15:e2e
```

Expected: all sample-room checks pass and the V1.5 main path still passes.

---

### Task 3: Global Shell, Banner, Sidebar, Wider Chat

**Files:**
- Modify: `web/index.html`
- Modify: `web/home.js`
- Modify: `web/hero-radar-chat.js`
- Modify: `web/watch-rules-editor.js`
- Modify: `web/styles.css`
- Test: `scripts/verify-task025.ts`
- Test: `scripts/verify-q7-hero-chat.ts`

- [ ] **Step 1: Assert fixed day mode and no theme toggle**

In `scripts/verify-task025.ts`, keep or add these checks:

```ts
check(html.includes('data-theme="light"'), "6.1 HTML 固定浅色主题");
check(css.includes(":root") && css.includes('[data-theme="light"]'), "6.2 CSS 定义浅色变量");
check(!html.includes("theme-toggle") && !js.includes("theme-toggle"), "6.3 不再提供明暗主题切换按钮");
```

Run:

```bash
node --run verify:all
```

Expected: the old dark-theme expectation does not exist.

- [ ] **Step 2: Keep the global banner visible inside Hero Demo**

In `web/styles.css`, remove rules that fully hide the global banner/header in hero-chat mode. The banner can be compressed but must keep:

```text
ChancePing / 盯机会
Live Search 本地试跑 or environment/status label
首页 / 机会结果 / 我的雷达 navigation
online status indicator
```

Do not let `body.hero-chat-active .top-bar` and `body.hero-chat-active .tab-nav` disappear completely. If those selectors exist, change them to compact styling instead of `display: none`.

- [ ] **Step 3: Add collapsible GPT-like sidebar**

In `web/hero-radar-chat.js` and `web/styles.css`, implement:

```text
expanded width: 250-280px
collapsed width: 52-64px
top collapse button
AI 赛事雷达 first item
我的雷达 below sample room
collapsed state still exposes AI 赛事雷达 via icon/title
```

Persist the collapsed state in `localStorage` under:

```text
chanceping-sidebar-collapsed
```

- [ ] **Step 4: Widen the chat workspace**

In `web/styles.css`, make the desktop chat workspace feel like the ChatGPT reference:

```text
main chat column width: 820-960px
input row: long horizontal bar
messages: centered, not narrow backend cards
mobile: sidebar becomes drawer or stacked top rail
```

No decorative landing hero is needed.

- [ ] **Step 5: Verify shell UI**

Run:

```bash
node --run verify:web-ui
node --run verify:q7:hero-chat
node --run verify:v15:e2e
```

Expected: fixed light mode, visible banner, collapsible sidebar checks, and Hero Demo flow all pass.

---

### Task 4: Unified Result Page And Opportunity Card Grid

**Files:**
- Modify: `web/watch-result.js`
- Modify: `web/radars.js`
- Modify: `web/radar-detail.js`
- Modify: `web/styles.css`
- Test: `scripts/verify-q7-hero-chat.ts`
- Test: `node --run verify:v15:e2e` through the existing V1.5 E2E script

- [ ] **Step 1: Add result-layout assertions**

Add checks to `scripts/verify-q7-hero-chat.ts` or a new focused script called from `verify:all`:

```ts
const watchResultJs = read("web/watch-result.js");
check("result page exposes reusable opportunity card renderer", watchResultJs.includes("renderOpportunityCardGrid") || watchResultJs.includes("watch-opportunity-grid"));
check("result page puts report summary below cards", watchResultJs.indexOf("watch-opportunity") > -1 && watchResultJs.indexOf("report-summary") > watchResultJs.indexOf("watch-opportunity"));
check("my radar view enters same result surface", radarsJs.includes("查看机会和报告") && (radarsJs.includes("showRadarResult") || radarsJs.includes("window.showWatchResult")));
check("duplicate modify buttons are removed", !watchResultJs.includes("这些结果不对，修改雷达") || watchResultJs.includes("调整雷达画像"));
```

Run:

```bash
node --run verify:q7:hero-chat
```

Expected before implementation: checks fail where the old left/right split or duplicate buttons still exist.

- [ ] **Step 2: Build one reusable result renderer**

In `web/watch-result.js`, make one public function render both first-run and saved-radar results:

```js
window.showWatchResult = function showWatchResult(result) {
  currentResult = result || {};
  if (window.switchTab) window.switchTab("watch-result");
  renderResult(currentResult);
};
```

The result object must accept:

```text
radarId
runId
radarName
description
opportunityCards
markdown
reportId
runOutcome
```

- [ ] **Step 3: Change opportunity layout to grid-first**

In `web/watch-result.js`, render this order:

```text
雷达标题 / 说明
操作按钮
机会卡网格
报告摘要
完整 Markdown
```

Desktop card grid:

```css
.watch-opportunity-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 14px;
}
```

Use container max width so wide desktop shows 3-4 cards per row, normal desktop shows 2-3, mobile shows 1.

- [ ] **Step 4: Remove duplicate modify actions**

In `web/watch-result.js`, keep only:

```text
保存为长期雷达，之后持续盯
调整雷达画像
```

Remove or merge:

```text
调整画像
这些结果不对，修改雷达
```

Both should route to the same radar revision flow.

- [ ] **Step 5: Route saved-radar "查看机会和报告" to the same result surface**

In `web/radars.js`, change the `查看机会和报告` button so it does not open a separate detail-only page when the user expects cards and report. It should load the latest radar data and call `window.showWatchResult(...)`.

If latest report markdown is unavailable, still show stored opportunity cards and the latest report list below.

- [ ] **Step 6: Verify result-page unification**

Run:

```bash
node --run verify:q7:hero-chat
node --run verify:v15:e2e
node --run verify:all
```

Expected: first-run `查看机会卡` and saved-radar `查看机会和报告` land on the same result component.

---

### Task 5: Simplify `我的雷达` List And Radar Detail

**Files:**
- Modify: `web/radars.js`
- Modify: `web/radar-detail.js`
- Modify: `web/styles.css`
- Test: `scripts/verify-q7-hero-chat.ts`
- Test: existing V1.5/V1.6 scripts

- [ ] **Step 1: Add customer-language assertions**

Add checks:

```ts
const detailJs = read("web/radar-detail.js");
check("my radar cards hide raw last run status", !radarsJs.includes("上次运行状态"));
check("my radar cards keep three actions", radarsJs.includes("编辑雷达") && radarsJs.includes("查看机会和报告") && radarsJs.includes("删除雷达") && !radarsJs.includes(">再次盯机会</button>"));
check("detail page does not show activation action", !detailJs.includes(">激活</button>"));
check("detail archive label becomes delete radar", detailJs.includes("删除雷达") && !detailJs.includes(">归档</button>"));
check("delete radar has second confirmation", detailJs.includes("确认删除") && detailJs.includes("DELETE"));
check("detail page removes run history table", !detailJs.includes("<h4>运行历史</h4>"));
check("detail page removes generate markdown report button", !detailJs.includes("生成 Markdown 报告"));
```

Run:

```bash
node --run verify:q7:hero-chat
```

Expected before implementation: checks fail on old wording.

- [ ] **Step 2: Simplify radar cards**

In `web/radars.js`, remove customer-visible:

```text
上次运行状态 succeeded / failed
运行中 / 已暂停 / 已归档 lifecycle status
再次盯机会 button
```

Keep:

```text
雷达名称
版本
画像摘要
上次运行时间 as weak meta
编辑雷达
查看机会和报告
删除雷达
```

- [ ] **Step 3: Rename detail-page actions**

In `web/radar-detail.js`, replace:

```text
编辑 -> 编辑雷达
归档 -> 删除雷达
```

Remove customer-visible:

```text
激活
暂停
停止
恢复
succeeded
failed
运行中
已归档
```

Keep `再次盯机会` only in radar detail or result page primary action area.

- [ ] **Step 4: Keep backend delete as soft delete**

In `web/radar-detail.js` and `web/radars.js`, the UI label is `删除雷达`, but the request remains:

```js
fetch(`/api/radars/${encodeURIComponent(radarId)}`, { method: "DELETE" })
```

Use this confirmation text:

```text
确认删除这个雷达？删除后它会从“我的雷达”列表移除，历史机会和报告仍会保留。
```

Success toast:

```text
雷达已删除
```

- [ ] **Step 5: Show stored opportunities as cards**

In `web/radar-detail.js`, replace the debug-style stored-opportunity card with the same opportunity-card component used by `web/watch-result.js`.

Do not show:

```text
radarId
radarIds
入库 Key
report id
succeeded
ChanceScore as raw field
```

Show:

```text
title
推荐度 / 值得关注
为什么值得看
截止时间
建议动作
官方入口 / 待复核来源
首次发现 / 最近发现
```

Deduplicate by stable key:

```text
entry.key || card.official_source_url || card.search_result.url || card.title
```

- [ ] **Step 6: Keep only history reports**

In `web/radar-detail.js`, remove the separate `运行历史` module. Keep `历史报告` after opportunity cards. The report list shows:

```text
标题
创建时间
机会数
查看 / 下载
```

Remove `生成 Markdown 报告`. New report generation happens through `再次盯机会`.

- [ ] **Step 7: Verify customer-language detail**

Run:

```bash
node --run verify:q7:hero-chat
node --run verify:v15:e2e
node --run verify:v16
node --run verify:all
git diff --check
```

Expected: UI wording checks pass and V1.5/V1.6 storage/report behavior remains intact.

---

### Task 6: `/ai-events` Public Intelligence Page

**Files:**
- Create: `web/ai-events.html`
- Create: `web/ai-events.js`
- Modify: `web/styles.css`
- Modify: `src/api/routes/web-ui.ts`
- Create: `src/api/routes/public-ai-events.ts`
- Modify: `src/api/app.ts`
- Modify: `scripts/verify-e2e-ai-events.ts`

- [ ] **Step 1: Add route assertions**

In `scripts/verify-e2e-ai-events.ts`, ensure the script checks:

```ts
const app = createApp(createAppContext());
const page = await app.request("/ai-events");
check(page.status === 200, "GET /ai-events returns 200");
const html = await page.text();
check(html.includes("AI 赛事情报雷达"), "page has public title");
check(html.includes("/ai-events.js"), "page loads public page script");

const api = await app.request("/api/public/ai-events");
const json = await api.json() as any;
check(api.status === 200, "GET /api/public/ai-events returns 200");
check(json.success === true, "public API succeeds");
check(Array.isArray(json.data?.items), "public API returns items array");
check(!JSON.stringify(json.data).includes("radarId"), "public API hides internal radarId");
check(!JSON.stringify(json.data).includes("run_id"), "public API hides internal run_id");
```

Run:

```bash
node --run verify:e2e-ai-events
```

Expected before implementation: route checks fail.

- [ ] **Step 2: Serve `/ai-events`**

In `src/api/routes/web-ui.ts`, add:

```ts
app.get("/ai-events", serveFile("ai-events.html", "text/html; charset=utf-8"));
app.get("/ai-events.js", serveFile("ai-events.js", "application/javascript; charset=utf-8"));
```

- [ ] **Step 3: Add public cleaned data API**

Create `src/api/routes/public-ai-events.ts` with one route:

```ts
import { Hono } from "hono";
import type { AppContext } from "../context";
import type { ApiResponse } from "../types";

export function publicAiEventsRoutes(ctx: AppContext): Hono {
  const app = new Hono();

  app.get("/ai-events", (c) => {
    const start = Date.now();
    const entries = ctx.opportunityStore.list({ radar_type: "custom" } as any).entries ?? [];
    const items = entries
      .map((entry: any) => entry.card ?? entry)
      .filter((card: any) => /AI|Agent|Hackathon|黑客松|赛事|TRAE|Qwen|Devpost|DoraHacks|Lablab/i.test(`${card.title ?? ""} ${card.opportunity_kind ?? ""}`))
      .slice(0, 60)
      .map((card: any) => ({
        title: card.title ?? card.search_result?.title ?? "未命名赛事",
        platform: card.source_name ?? card.search_result?.source_provider ?? "待识别",
        statusLabel: card.deadline ? "开放报名" : "待复核",
        tags: [card.opportunity_kind, card.action_status, card.evidence_status].filter(Boolean).slice(0, 4),
        deadline: card.deadline ?? card.date_or_deadline ?? "",
        reward: card.reward_or_value ?? "",
        reason: card.match_reason ?? card.relevance_reason ?? "",
        officialUrl: card.official_source_url ?? card.search_result?.url ?? "",
      }));

    return c.json({
      success: true,
      data: { items },
      error: null,
      duration_ms: Date.now() - start,
    } satisfies ApiResponse);
  });

  return app;
}
```

If the store API shape differs, adapt the call while keeping the returned public fields exactly cleaned and internal-field-free.

- [ ] **Step 4: Register public API**

In `src/api/app.ts`, import and route:

```ts
import { publicAiEventsRoutes } from "./routes/public-ai-events";
app.route("/api/public", publicAiEventsRoutes(ctx));
```

- [ ] **Step 5: Build first public page with cards only**

In `web/ai-events.html` and `web/ai-events.js`, render a simple public page:

```text
AI 赛事情报雷达
机会卡网格
状态标签：开放报名 / 即将截止 / 官方入口 / 新增收录 / 待复核
官方入口 button
```

Do not show:

```text
S/A/B/C levels
internal score
radarId
runId
raw evidence log
debug fields
```

- [ ] **Step 6: Verify `/ai-events`**

Run:

```bash
node --run verify:e2e-ai-events
node --run typecheck
node --run verify:v15:e2e
node --run verify:all
git diff --check
```

Expected: `/ai-events` works locally and can later be extracted to `https://aievents.chanceping.com`.

---

### Task 7: Final Browser Acceptance

**Files:**
- No code file required unless acceptance reveals a defect.

- [ ] **Step 1: Start local mock server**

Run:

```bash
PORT=62960 node --run dev:mock
```

Expected:

```text
Web UI: http://localhost:62960/
Health: http://localhost:62960/health
```

- [ ] **Step 2: Product path acceptance**

Open `http://localhost:62960/` and verify:

```text
1. Homepage shows global banner/header.
2. AI 赛事雷达 is visible as the first sample room entry.
3. Enter Hero Demo; banner stays visible or compact, not gone.
4. Send fixed prompt.
5. System generates AI 赛事雷达 V1.0.
6. Confirm V1.0 and run once.
7. Result page shows opportunity cards in a grid first.
8. Report summary appears below opportunity cards.
9. Duplicate modify buttons are not present.
10. My Radar list hides raw succeeded/failed status.
11. My Radar list only shows 编辑雷达 / 查看机会和报告 / 删除雷达.
12. 查看机会和报告 opens the same result surface as 查看机会卡.
13. Radar detail shows stored opportunities as cards.
14. Radar detail only has 历史报告, not separate 运行历史.
15. 删除雷达 asks for second confirmation.
16. Top-right sun/moon theme button is gone.
17. /ai-events loads and shows public cards without S/A/B/C levels.
```

- [ ] **Step 3: Final verification**

Run:

```bash
node --run typecheck
node --run verify:q7:demo
node --run verify:q7:hero-chat
node --run verify:v15:e2e
node --run verify:v15
node --run verify:v16
node --run verify:all
git diff --check
```

Expected: all commands exit 0.

## Explicitly Deferred

Do not implement these in this plan:

- One window = one radar long-term chat architecture.
- Long-term chat memory.
- Radar Memory Summary / Reader Memory Summary.
- Radar market.
- Team collaboration.
- Payment.
- Aliyun production deployment.
- Full Chinese/English frontend i18n.
- Public page ranking by S/A/B/C.
- More Markdown weekly report formatting polish.

## Final Output Required From Total Console

When work is complete, output:

1. Modified file list.
2. Git diff summary.
3. Test commands and results.
4. Real webpage acceptance steps and result.
5. Remaining unresolved issues.
6. Whether merging into `main` is recommended.

Do not merge to `main` and do not modify Aliyun production from this plan.
