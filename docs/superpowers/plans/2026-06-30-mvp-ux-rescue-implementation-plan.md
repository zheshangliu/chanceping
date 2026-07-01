# ChancePing MVP UX Rescue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the MVP customer path around `盯一下`: template/custom input → reusable radar profile + customer source hints → confirmed long-running radar → opportunities → Markdown report.

**Architecture:** Keep the existing Hono API, RadarStore, OpportunityStore, SourceStrategy schema, search orchestrator, and report generator. Recompose the frontend into three customer-facing surfaces: Home, Watch Result, My Radars. Store customer-provided URLs in `spec.source_strategy.user_supplied_sources`, store source names in `spec.source_strategy.manual_sources`, and let search/reporting consume them as lightweight source hints.

**Tech Stack:** TypeScript, Hono, plain JavaScript frontend, local JSON stores, existing verify scripts, `tsx`/`tsc`.

---

## Scope

This plan implements the UX and MVP orchestration layer, including lightweight customer source hints. It does not build payments, login, radar marketplace, team collaboration, full V1.7 source transparency, source health monitoring, RSS subscription, or a crawler scheduling platform.

## Files Overview

- Modify: `.gitignore`  
  Keep `api.env` out of Git.
- Create: `scripts/verify-mvp-ux.ts`  
  Static/API acceptance checks for the new MVP customer path. This does not replace browser validation.
- Create: `scripts/verify-mvp-browser-smoke.ts`  
  Playwright smoke test for the Milestone 1 browser path.
- Modify: `package.json`  
  Add `verify:mvp-ux` and include it in `verify:all`.
- Modify: `web/index.html`  
  Reduce visible navigation and add the result panel.
- Modify: `web/styles.css`  
  Add result page styles and simplified radar layout.
- Modify: `web/home.js`  
  Replace radar selection with templates + `盯一下`.
- Create: `web/mvp-templates.js`  
  Centralize example templates and preset radar profiles.
- Create: `web/radar-profile.js`  
  Convert free-form input into a reusable radar profile confirmation card.
- Create: `web/source-hints.js`  
  Parse customer-entered URLs/source names into `source_strategy`.
- Create: `web/watch-result.js`  
  Orchestrate confirmed-profile search, report generation, and save-as-radar.
- Create: `src/search/source-hints.ts`  
  Normalize source hints, extract domains, and build site-filter searches.
- Modify: `src/search/orchestrator.ts`  
  Run additional site-filter searches for user-supplied URL sources in live mode and return source hint checks.
- Modify: `src/agents/radar-report-generator.ts`  
  Standardize Markdown output around the MVP report template, including source hints.
- Create: `scripts/verify-report-template.ts`  
  Ensure generated reports include radar profile, opportunity table, actions, and source index.
- Create: `scripts/verify-source-hints.ts`  
  Verify URL/name source parsing and site-filter query construction.
- Modify: `web/radars.js`  
  Simplify customer-facing radar list.
- Modify: `web/radar-detail.js`  
  Keep recent opportunities/reports, hide technical fields by default.
- Modify: `src/demo/*.json`  
  Replace fake `example.com` links with reachable public pages or local demo links.
- Create: `scripts/verify-mock-links.ts`  
  Ensure mock opportunities do not use unreachable fake domains.
- Create: `src/config/local-env.ts`  
  Safely load `api.env` for local live testing without printing secrets.
- Modify: `src/api/server.ts`  
  Load local env before app context creation.

---

### Task 0: Protect Local API Credentials

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Verify `api.env` is ignored**

Run:

```bash
git check-ignore -q api.env && echo ignored
```

Expected:

```text
ignored
```

- [ ] **Step 2: If missing, add `api.env` to `.gitignore`**

Patch:

```diff
 # Environment（含真实 API Key，禁止提交）
 .env
 .env.local
 .env.*.local
+api.env
```

- [ ] **Step 3: Confirm no secret value appears in Git status**

Run:

```bash
git status --short
```

Expected:

```text
api.env 不出现在未跟踪文件列表中
```

---

### Task 1: Add MVP UX Acceptance Test

**Files:**
- Create: `scripts/verify-mvp-ux.ts`
- Modify: `package.json`

- [ ] **Step 1: Write failing test for the new customer IA**

Create `scripts/verify-mvp-ux.ts`:

```ts
import fs from "fs";
import path from "path";

let passed = 0;
let failed = 0;

function read(rel: string): string {
  const abs = path.resolve(process.cwd(), rel);
  return fs.existsSync(abs) ? fs.readFileSync(abs, "utf-8") : "";
}

function check(name: string, condition: boolean, detail = ""): void {
  if (condition) {
    passed++;
    console.log(`PASS ${name}`);
  } else {
    failed++;
    console.log(`FAIL ${name}${detail ? ` -> ${detail}` : ""}`);
  }
}

const html = read("web/index.html");
const homeJs = read("web/home.js");
const templatesJs = read("web/mvp-templates.js");
const profileJs = read("web/radar-profile.js");
const sourceHintsJs = read("web/source-hints.js");
const watchResultJs = read("web/watch-result.js");
const styles = read("web/styles.css");
const radarsJs = read("web/radars.js");
const radarDetailJs = read("web/radar-detail.js");
const reportGenerator = read("src/agents/radar-report-generator.ts");

check("首页含主按钮文案 盯一下", html.includes("盯一下") || homeJs.includes("盯一下"));
check("首页不再显示选择雷达文案", !html.includes("选择雷达："));
check("可见主导航不超过三个客户入口", /data-tab="home"/.test(html) && /data-tab="watch-result"/.test(html) && /data-tab="radars"/.test(html));
check("结果页 panel 存在", html.includes('id="panel-watch-result"'));
check("watch-result.js 被引入", html.includes("/watch-result.js"));
check("模板文件被引入", html.includes("/mvp-templates.js"));
check("画像确认脚本被引入", html.includes("/radar-profile.js"));
check("source hints 脚本被引入", html.includes("/source-hints.js"));
check("自由输入走画像确认", homeJs.includes("createRadarProfileDraft") || profileJs.includes("createRadarProfileDraft"));
check("模板含预置画像", templatesJs.includes("profile") && templatesJs.includes("用户身份"));
check("画像确认支持指定信号源", profileJs.includes("source-hints-input") || sourceHintsJs.includes("applySourceHintsToSpec"));
check("结果页按画像运行", watchResultJs.includes("profile") && watchResultJs.includes("spec"));
check("报告模板包含雷达画像", reportGenerator.includes("## 1. 雷达画像"));
check("报告模板包含指定信号源", reportGenerator.includes("指定信号源"));
check("结果页样式存在", styles.includes(".watch-result"));
check("我的雷达隐藏 provider 技术字段", !radarsJs.includes("radar-providers") || radarsJs.includes("advanced"));
check("详情页支持历史报告", radarDetailJs.includes("loadReportHistory"));

console.log(`MVP UX: ${passed} PASS / ${failed} FAIL`);
process.exit(failed > 0 ? 1 : 0);
```

- [ ] **Step 2: Run test and verify RED**

Run:

```bash
npx tsx scripts/verify-mvp-ux.ts
```

Expected:

```text
FAIL 首页含主按钮文案 盯一下
FAIL 结果页 panel 存在
```

- [ ] **Step 3: Add package scripts**

Patch `package.json`:

```json
"verify:mvp-ux": "tsx scripts/verify-mvp-ux.ts"
```

Update `verify:all` to include:

```json
"verify:all": "npm run typecheck && npm run verify:v15 && npm run verify:v15:e2e && npm run verify:v16 && npm run verify:mvp-ux"
```

- [ ] **Step 4: Re-run RED test**

Run the same `npx tsx scripts/verify-mvp-ux.ts` command.

Expected: still fails for missing UI behavior.

---

### Task 2: Simplify Visible Navigation

**Files:**
- Modify: `web/index.html`
- Modify: `web/styles.css`

- [ ] **Step 1: Update visible nav to three customer tabs**

Change visible navigation to:

```html
<button class="tab-btn active" data-tab="home">首页</button>
<button class="tab-btn" data-tab="watch-result">盯机会结果</button>
<button class="tab-btn" data-tab="radars">我的雷达</button>
```

Keep advanced panels in the DOM with an advanced class:

```html
<button class="tab-btn advanced-tab" data-tab="chat" hidden>需求确认</button>
<button class="tab-btn advanced-tab" data-tab="search" hidden>搜索</button>
<button class="tab-btn advanced-tab" data-tab="opportunities" hidden>机会库</button>
<button class="tab-btn advanced-tab" data-tab="reports" hidden>报告</button>
<button class="tab-btn advanced-tab" data-tab="editor" hidden>编辑器</button>
```

- [ ] **Step 2: Add result panel shell**

Add:

```html
<section id="panel-watch-result" class="tab-panel">
  <div class="watch-result" id="watch-result-root">
    <p class="placeholder">输入需求后点击“盯一下”，这里会显示机会和报告。</p>
  </div>
</section>
```

- [ ] **Step 3: Hide advanced tabs by default**

Add CSS:

```css
.advanced-tab[hidden] {
  display: none;
}
```

- [ ] **Step 4: Run MVP UX test**

Run:

```bash
npx tsx scripts/verify-mvp-ux.ts
```

Expected: navigation and result panel checks pass; flow checks still fail.

---

### Task 3: Convert Home Into `盯一下` Entry

**Files:**
- Create: `web/mvp-templates.js`
- Modify: `web/index.html`
- Modify: `web/home.js`

- [ ] **Step 1: Add template definitions**

Create `web/mvp-templates.js`:

```js
(function () {
  "use strict";

  window.CHANCEPING_MVP_TEMPLATES = [
    {
      id: "ai_events",
      label: "AI 赛事",
      description: "我想追踪近期 AI 创作比赛、AI 游戏比赛、模型厂商黑客松、带奖金或曝光价值的 AI 赛事。",
      profile: {
        用户身份: "AI 创作者 / AI 产品团队",
        关注机会: ["AI 创作比赛", "AI 游戏比赛", "模型厂商黑客松"],
        地域范围: ["中国", "海外线上赛事"],
        时间范围: "未来 30 天内仍可报名",
        指定信号源: ["Kaggle Competitions", "阿里云天池", "Hugging Face"],
        排除内容: ["纯广告", "已截止", "无官方来源"],
        排序偏好: ["报名截止近", "奖金或曝光高", "主办方权威"],
      },
    },
    {
      id: "startup_competitions",
      label: "创业比赛申报",
      description: "我是帮客户申请项目的财税公司，需要追踪创业比赛、创新创业大赛、项目申报和政府补贴机会。",
      profile: {
        用户身份: "帮客户申报项目的财税 / 咨询公司",
        关注机会: ["创业比赛", "创新创业大赛", "政府补贴", "项目申报"],
        地域范围: ["中国"],
        时间范围: "本月和未来 30 天",
        指定信号源: ["中国创新创业大赛官网", "地方科技局官网", "地方工信局官网"],
        排除内容: ["已截止", "非官方通知", "报名条件明显不匹配"],
        排序偏好: ["客户适配度", "申报截止时间", "政策权威性"],
      },
    },
    {
      id: "math_olympiad",
      label: "奥数竞赛",
      description: "我想追踪国内外数学竞赛、奥数比赛、报名时间、年龄组和赛区通知。",
      profile: {
        用户身份: "奥数竞赛学生 / 家长",
        关注机会: ["数学竞赛", "奥数比赛", "报名通知", "赛区通知"],
        地域范围: ["中国", "海外线上竞赛"],
        时间范围: "未来 90 天",
        指定信号源: ["AMC 官网", "各地数学会官网", "学校竞赛通知"],
        排除内容: ["培训广告", "非竞赛资讯", "年龄组不匹配"],
        排序偏好: ["报名窗口", "含金量", "年龄组适配"],
      },
    },
    {
      id: "table_tennis",
      label: "乒乓球赛事",
      description: "我是乒乓球选手，想了解国内外乒乓球比赛、WTT、ITTF、公开赛和报名窗口。",
      profile: {
        用户身份: "乒乓球选手",
        关注机会: ["乒乓球比赛", "公开赛", "WTT", "ITTF", "报名窗口"],
        地域范围: ["中国", "国际"],
        时间范围: "未来 30 天内可报名或即将举办",
        指定信号源: ["https://www.ittf.com/", "https://worldtabletennis.com/", "中国乒协官网"],
        排除内容: ["培训广告", "旧新闻", "已截止报名"],
        排序偏好: ["可报名", "权威来源", "参赛门槛匹配"],
      },
    },
  ];
})();
```

- [ ] **Step 2: Include template and result scripts**

In `web/index.html`, load before `home.js`:

```html
<script src="/mvp-templates.js"></script>
<script src="/source-hints.js"></script>
<script src="/radar-profile.js"></script>
<script src="/watch-result.js"></script>
```

- [ ] **Step 3: Replace radar selector with template buttons**

Home markup should show:

```html
<div class="home-examples" id="mvp-template-list"></div>
<textarea id="home-input" placeholder="例如：我是乒乓球选手，想盯国内外比赛报名机会"></textarea>
<button id="home-watch-btn" class="primary-btn">盯一下</button>
```

- [ ] **Step 4: Update `home.js` interactions**

Add behavior:

```js
function renderMvpTemplates() {
  const root = document.getElementById("mvp-template-list");
  if (!root) return;
  const templates = window.CHANCEPING_MVP_TEMPLATES || [];
  root.innerHTML = templates.map((tpl) =>
    `<button class="example-btn mvp-template-btn" data-template-id="${tpl.id}">${tpl.label}</button>`
  ).join("");
}

function bindWatchNow() {
  const input = document.getElementById("home-input");
  const button = document.getElementById("home-watch-btn");
  let selectedTemplate = null;

  document.querySelectorAll(".mvp-template-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tpl = (window.CHANCEPING_MVP_TEMPLATES || []).find((item) => item.id === btn.dataset.templateId);
      selectedTemplate = tpl || null;
      if (tpl && input) input.value = tpl.description;
    });
  });

  input?.addEventListener("input", () => {
    selectedTemplate = null;
  });

  if (button) {
    button.addEventListener("click", () => {
      const description = (input?.value || "").trim();
      if (!description) {
        if (window.showToast) showToast("请先告诉我你想盯什么机会", "warning");
        return;
      }
      if (selectedTemplate?.profile && window.runTemplateWatch) {
        window.runTemplateWatch({
          ...selectedTemplate,
          description,
        });
        return;
      }
      if (window.createRadarProfileDraft) window.createRadarProfileDraft({ description });
    });
  }
}
```

- [ ] **Step 5: Run MVP UX test**

Expected: home entry checks pass.

---

### Task 3.5: Add Radar Profile Confirmation

**Files:**
- Create: `web/radar-profile.js`
- Create: `web/source-hints.js`
- Modify: `web/index.html`
- Modify: `web/styles.css`

This task prevents free-form input from becoming a one-off search. Free-form input must become a reusable radar profile first.

- [ ] **Step 1: Add profile confirmation shell**

Inside `panel-watch-result`, keep a target element that can show either profile confirmation or final result:

```html
<div class="watch-result" id="watch-result-root">
  <p class="placeholder">输入需求后点击“盯一下”，这里会先生成雷达画像，再显示机会和报告。</p>
</div>
```

- [ ] **Step 2: Create `web/radar-profile.js`**

The module should expose:

```js
window.createRadarProfileDraft = createRadarProfileDraft;
window.confirmRadarProfile = confirmRadarProfile;
window.runTemplateWatch = runTemplateWatch;
```

Required behavior:

```text
createRadarProfileDraft({ description })
→ switch to watch-result tab
→ POST /api/radars/generate
→ render profile confirmation card
→ user can add source hints
→ user confirms
→ applySourceHintsToSpec(spec, sourceHintText)
→ POST /api/radars
→ POST /api/radars/:id/activate
→ window.runWatchNow({ radarId, description, spec, profile, suggestedName })
```

Template path:

```text
runTemplateWatch(template)
→ use template.profile for display
→ POST /api/radars/generate with template.description if template.spec is missing
→ window.runWatchNow({ description, spec, profile, presetId, suggestedName })
```

The confirmation card must show:

```text
我理解你想建立这样的雷达：
- 用户身份
- 关注机会
- 地域范围
- 时间范围
- 指定信号源
- 排除内容
- 排序偏好
```

It must include:

```text
确认并创建雷达
继续修改
```

It must include a source hint textarea:

```html
<label for="source-hints-input">指定信号源（可选）</label>
<textarea
  id="source-hints-input"
  placeholder="每行一个官网、网址或平台名称&#10;https://www.ittf.com/&#10;https://worldtabletennis.com/&#10;中国乒协官网"
></textarea>
```

- [ ] **Step 3: Keep clarification lightweight**

If `/api/radars/generate` returns `questions_to_confirm`, show at most 3 questions. Do not create a long questionnaire.

Rules:

```text
能推断就不问
只问影响搜索质量的关键字段
用户确认后，该画像固定为这个雷达的长期搜索模型
再次运行同一个雷达，不重新询问需求
```

- [ ] **Step 4: Add profile styles**

Add compact styles:

```css
.radar-profile-card {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
  background: var(--surface);
}

.radar-profile-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

@media (max-width: 760px) {
  .radar-profile-grid {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 5: Run MVP UX test**

Expected:

```text
画像确认脚本被引入
自由输入走画像确认
模板含预置画像
画像确认支持指定信号源
```

---

### Task 3.6: Add Customer Source Hints

**Files:**
- Create: `web/source-hints.js`
- Create: `src/search/source-hints.ts`
- Create: `scripts/verify-source-hints.ts`
- Modify: `web/radar-profile.js`
- Modify: `web/watch-result.js`
- Modify: `src/search/orchestrator.ts`
- Modify: `src/api/types.ts`
- Modify: `package.json`

This task implements lightweight customer source hints. It is not a full source management backend.

- [ ] **Step 1: Write failing source hint verification**

Create `scripts/verify-source-hints.ts`:

```ts
import {
  buildSourceHintSearches,
  extractSourceDomain,
  getManualSourceNames,
  getUserSuppliedUrlSources,
} from "../src/search/source-hints";
import type { RadarRequirementSpec } from "../src/schema/radar-requirement-spec";

const spec = {
  source_strategy: {
    official_sites: [],
    platforms: [],
    search_engines: [],
    social_media: [],
    rss_sources: [],
    manual_sources: ["中国乒协官网"],
    source_priority: [],
    sources_used_in_report: [],
    user_supplied_sources: [
      {
        source_name: "ITTF",
        source_url: "https://www.ittf.com/",
        added_at: "2026-06-30T00:00:00.000Z",
        contributed_by: "user",
      },
      {
        source_name: "WTT",
        source_url: "https://worldtabletennis.com/",
        added_at: "2026-06-30T00:00:00.000Z",
        contributed_by: "user",
      },
    ],
    source_transparency_enabled: true,
  },
} as RadarRequirementSpec;

let failed = 0;

function check(name: string, condition: boolean, detail = ""): void {
  if (condition) {
    console.log(`PASS ${name}`);
  } else {
    failed++;
    console.log(`FAIL ${name}${detail ? ` -> ${detail}` : ""}`);
  }
}

check("extractSourceDomain removes www", extractSourceDomain("https://www.ittf.com/") === "ittf.com");

const urlSources = getUserSuppliedUrlSources(spec);
check("reads url sources", urlSources.length === 2, `len=${urlSources.length}`);

const manualNames = getManualSourceNames(spec);
check("reads manual source names", manualNames.includes("中国乒协官网"));

const searches = buildSourceHintSearches(spec, "乒乓球 比赛 报名");
check("builds one site search per URL source", searches.length === 2, `len=${searches.length}`);
check("sets site filter", searches[0]?.siteFilter === "ittf.com", `site=${searches[0]?.siteFilter}`);
check("keeps base query", searches[0]?.query.includes("乒乓球 比赛 报名") === true);

process.exit(failed > 0 ? 1 : 0);
```

- [ ] **Step 2: Verify RED**

Run:

```bash
npx tsx scripts/verify-source-hints.ts
```

Expected:

```text
Cannot find module '../src/search/source-hints'
```

- [ ] **Step 3: Create backend source hint utilities**

Create `src/search/source-hints.ts`:

```ts
import type {
  RadarRequirementSpec,
  SourceStrategy,
  UserSuppliedSource,
} from "../schema/radar-requirement-spec";

export interface SourceHintSearch {
  sourceName: string;
  sourceUrl: string;
  domain: string;
  query: string;
  siteFilter: string;
}

export interface SourceHintCheck {
  sourceName: string;
  sourceUrl: string;
  status: "checked" | "no_results" | "failed" | "invalid_url" | "name_only";
  resultCount: number;
  error?: string;
}

function sourceStrategy(spec: RadarRequirementSpec): SourceStrategy | undefined {
  return spec.source_strategy;
}

export function extractSourceDomain(sourceUrl: string): string {
  try {
    const parsed = new URL(sourceUrl);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function getUserSuppliedUrlSources(spec: RadarRequirementSpec): UserSuppliedSource[] {
  const sources = sourceStrategy(spec)?.user_supplied_sources ?? [];
  return sources.filter((source) => extractSourceDomain(source.source_url) !== "");
}

export function getManualSourceNames(spec: RadarRequirementSpec): string[] {
  return Array.from(new Set((sourceStrategy(spec)?.manual_sources ?? []).map((name) => name.trim()).filter(Boolean)));
}

export function buildSourceHintSearches(
  spec: RadarRequirementSpec,
  baseQuery: string,
  maxSources = 5,
): SourceHintSearch[] {
  return getUserSuppliedUrlSources(spec)
    .slice(0, maxSources)
    .map((source) => {
      const domain = extractSourceDomain(source.source_url);
      const sourceName = source.source_name || domain;
      return {
        sourceName,
        sourceUrl: source.source_url,
        domain,
        query: `${baseQuery} ${sourceName}`.trim(),
        siteFilter: domain,
      };
    });
}

export function buildNameOnlySourceChecks(spec: RadarRequirementSpec): SourceHintCheck[] {
  return getManualSourceNames(spec).map((sourceName) => ({
    sourceName,
    sourceUrl: "",
    status: "name_only",
    resultCount: 0,
  }));
}
```

- [ ] **Step 4: Create frontend source hint parser**

Create `web/source-hints.js`:

```js
(function () {
  "use strict";

  function ensureSourceStrategy(spec) {
    const next = JSON.parse(JSON.stringify(spec || {}));
    next.source_strategy = {
      official_sites: [],
      platforms: [],
      search_engines: [],
      social_media: [],
      rss_sources: [],
      manual_sources: [],
      source_priority: [],
      sources_used_in_report: [],
      user_supplied_sources: [],
      source_transparency_enabled: true,
      ...(next.source_strategy || {}),
    };
    return next;
  }

  function parseSourceHintLines(text) {
    return String(text || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        if (/^https?:\/\//i.test(line)) {
          let sourceName = line;
          try {
            sourceName = new URL(line).hostname.replace(/^www\./, "");
          } catch {}
          return { type: "url", sourceName, sourceUrl: line };
        }
        return { type: "name", sourceName: line, sourceUrl: "" };
      });
  }

  function applySourceHintsToSpec(spec, text) {
    const next = ensureSourceStrategy(spec);
    const parsed = parseSourceHintLines(text);
    const now = new Date().toISOString();
    const urlSources = parsed.filter((item) => item.type === "url");
    const nameSources = parsed.filter((item) => item.type === "name");

    next.source_strategy.user_supplied_sources = [
      ...(next.source_strategy.user_supplied_sources || []),
      ...urlSources.map((item) => ({
        source_name: item.sourceName,
        source_url: item.sourceUrl,
        added_at: now,
        contributed_by: "user",
      })),
    ];

    next.source_strategy.manual_sources = Array.from(new Set([
      ...(next.source_strategy.manual_sources || []),
      ...nameSources.map((item) => item.sourceName),
    ]));

    next.source_strategy.source_priority = Array.from(new Set([
      ...(next.source_strategy.source_priority || []),
      ...urlSources.map((item) => item.sourceName),
      ...nameSources.map((item) => item.sourceName),
    ]));

    return next;
  }

  window.ChancePingSourceHints = {
    parseSourceHintLines,
    applySourceHintsToSpec,
  };
  window.applySourceHintsToSpec = applySourceHintsToSpec;
})();
```

- [ ] **Step 5: Apply hints during profile confirmation**

In `web/radar-profile.js`, when user confirms:

```js
const sourceHintText = document.getElementById("source-hints-input")?.value || "";
const specWithSources = window.applySourceHintsToSpec
  ? window.applySourceHintsToSpec(draft.spec, sourceHintText)
  : draft.spec;

const created = await postJson("/api/radars", {
  name: draft.suggestedName || "我的机会雷达",
  kind: "custom",
  spec: specWithSources,
});

await postJson(`/api/radars/${created.data.id}/activate`, {});
await window.runWatchNow({
  radarId: created.data.id,
  description: draft.description,
  spec: specWithSources,
  profile: draft.profile,
  suggestedName: draft.suggestedName,
});
```

- [ ] **Step 6: Add source hint fields to API types**

In `src/api/types.ts`, extend search/report response typing with optional checks:

```ts
export interface SourceHintCheckResponse {
  sourceName: string;
  sourceUrl: string;
  status: "checked" | "no_results" | "failed" | "invalid_url" | "name_only";
  resultCount: number;
  error?: string;
}

export interface SearchResponseData {
  total_raw: number;
  total_rule_passed: number;
  total_ai_passed: number;
  total_scored: number;
  opportunities: ScoredOpportunity[];
  errors: string[];
  duration_ms: number;
  opportunityCards?: OpportunityCard[];
  sourceCandidates?: SourceCandidate[];
  sourceHintChecks?: SourceHintCheckResponse[];
}
```

Then extend existing request/response contracts:

```ts
export interface ReportGenerateRequest {
  opportunities?: unknown[];
  spec?: unknown;
  radar_type?: "ai_competition" | "opc_policy" | "cultural_heritage";
  period_start?: string;
  period_end?: string;
  radar_id?: string;
  run_id?: string;
  profile?: unknown;
  sourceHintChecks?: SourceHintCheckResponse[];
}

export interface RadarRunResult {
  run: RadarRun;
  opportunityCards?: OpportunityCard[];
  sourceCandidates?: SourceCandidate[];
  sourceHintChecks?: SourceHintCheckResponse[];
  opportunities: ScoredOpportunity[];
  watch_rules_before?: number;
  watch_rules_after?: number;
  watch_rules_filtered_out?: number;
  ai_filter_skipped?: number;
  ai_filter_executed?: number;
  providerDegradation?: {
    fallbackUsed: boolean;
    primaryErrors: Record<string, string>;
    fallbackErrors: Record<string, string>;
    fallbackProviders: string[];
  };
}
```

- [ ] **Step 7: Run source-hint site searches in live mode**

In `src/search/orchestrator.ts`, import utilities:

```ts
import {
  buildNameOnlySourceChecks,
  buildSourceHintSearches,
  type SourceHintCheck,
} from "./source-hints";
```

Extend `SearchOrchestratorResult`:

```ts
sourceHintChecks?: SourceHintCheck[];
```

After primary/fallback results are merged in live mode, run source-hint searches:

```ts
const sourceHintChecks: SourceHintCheck[] = buildNameOnlySourceChecks(spec);
const sourceHintSearches = buildSourceHintSearches(spec, searchQuery);

if (sourceHintSearches.length > 0 && primaryProviders.length > 0) {
  const sourceHintResults = await Promise.all(
    sourceHintSearches.map(async (hint) => {
      const provider = primaryProviders[0];
      try {
        const results = await provider.search(hint.query, {
          max_results: Math.min(this.maxResultsPerProvider, 5),
          site_filter: hint.siteFilter,
        });
        return { hint, results, error: "" };
      } catch (err) {
        return {
          hint,
          results: [] as SearchResult[],
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }),
  );

  for (const item of sourceHintResults) {
    if (item.error) {
      sourceHintChecks.push({
        sourceName: item.hint.sourceName,
        sourceUrl: item.hint.sourceUrl,
        status: "failed",
        resultCount: 0,
        error: item.error,
      });
    } else {
      sourceHintChecks.push({
        sourceName: item.hint.sourceName,
        sourceUrl: item.hint.sourceUrl,
        status: item.results.length > 0 ? "checked" : "no_results",
        resultCount: item.results.length,
      });
    }
  }

  allResults = deduplicateByUrL([
    ...allResults,
    ...sourceHintResults.flatMap((item) => item.results),
  ]);
}
```

When returning from `search()`, include:

```ts
sourceHintChecks,
```

For mock/recorded mode, return deterministic checks before the early return:

```ts
const sourceHintChecks: SourceHintCheck[] = [
  ...buildNameOnlySourceChecks(spec),
  ...buildSourceHintSearches(spec, query && query.trim() ? query.trim() : buildQueryFromSpec(spec)).map((hint) => ({
    sourceName: hint.sourceName,
    sourceUrl: hint.sourceUrl,
    status: "no_results" as const,
    resultCount: 0,
  })),
];
```

Include that array in every mock/recorded `SearchOrchestratorResult`.

- [ ] **Step 8: Pass source hint checks to result page and reports**

In `web/watch-result.js`, read checks from search response:

```js
const sourceHintChecks = search.data.sourceHintChecks || [];
```

Include them in report generation:

```js
const report = await postJson("/api/reports/generate", {
  spec,
  radar_type: "ai_competition",
  opportunities: cards,
  sourceHintChecks,
  ...(radarId ? { radar_id: radarId, run_id: search.data?.run?.id } : {}),
  profile,
});
```

Render a compact result section:

```html
<section>
  <h4>本轮重点检查来源</h4>
  ${sourceHintChecks.length === 0
    ? '<p class="placeholder">本轮未指定额外信号源。</p>'
    : sourceHintChecks.map(renderSourceHintCheck).join("")}
</section>
```

- [ ] **Step 9: Add package script**

Patch `package.json`:

```json
"verify:source-hints": "tsx scripts/verify-source-hints.ts"
```

Update `verify:all` to include:

```json
"npm run verify:source-hints"
```

- [ ] **Step 10: Verify GREEN**

Run:

```bash
npx tsx scripts/verify-source-hints.ts
```

Expected:

```text
PASS extractSourceDomain removes www
PASS reads url sources
PASS reads manual source names
PASS builds one site search per URL source
PASS sets site filter
PASS keeps base query
```

---

### Task 4: Build Unified Watch Result Page

**Files:**
- Create: `web/watch-result.js`
- Modify: `web/styles.css`

`watch-result.js` receives a confirmed profile/spec. It must not turn arbitrary free-form input directly into a search.

- [ ] **Step 1: Create result state and renderer**

Create `web/watch-result.js`:

```js
(function () {
  "use strict";

  let currentResult = null;

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function switchToResult() {
    if (window.switchTab) window.switchTab("watch-result");
  }

  function renderLoading(description) {
    const root = document.getElementById("watch-result-root");
    if (!root) return;
    root.innerHTML = `
      <div class="watch-result-header">
        <h3>正在盯机会</h3>
        <p>${escapeHtml(description)}</p>
      </div>
      <p class="placeholder">正在生成雷达规格、搜索机会并生成报告...</p>
    `;
  }

  function renderResult(result) {
    const root = document.getElementById("watch-result-root");
    if (!root) return;
    const cards = result.opportunityCards || [];
    const markdown = result.markdown || "";
    const sourceHintChecks = result.sourceHintChecks || [];
    root.innerHTML = `
      <div class="watch-result-header">
        <h3>${escapeHtml(result.suggestedName || "本次盯机会结果")}</h3>
        <p>${escapeHtml(result.description)}</p>
      </div>
      <div class="watch-result-actions">
        <button id="btn-save-watch-radar" class="btn-primary">保存为长期雷达</button>
      </div>
      <div class="watch-result-grid">
        <section>
          <h4>本轮重点检查来源</h4>
          ${sourceHintChecks.length === 0 ? '<p class="placeholder">本轮未指定额外信号源。</p>' : sourceHintChecks.map(renderSourceHintCheck).join("")}
        </section>
        <section>
          <h4>机会卡片</h4>
          ${cards.length === 0 ? '<p class="placeholder">这次没有找到足够匹配的机会。</p>' : cards.map(renderCard).join("")}
        </section>
        <section>
          <h4>Markdown 报告</h4>
          <pre class="watch-report-preview">${escapeHtml(markdown)}</pre>
        </section>
      </div>
    `;
    document.getElementById("btn-save-watch-radar")?.addEventListener("click", saveCurrentRadar);
  }

  function renderSourceHintCheck(item) {
    const label = {
      checked: "已检查",
      no_results: "未发现结果",
      failed: "待复核",
      invalid_url: "无效网址",
      name_only: "来源名称",
    }[item.status] || item.status || "未知";
    const target = item.sourceUrl
      ? `<a href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noopener">${escapeHtml(item.sourceName || item.sourceUrl)}</a>`
      : `<span>${escapeHtml(item.sourceName || "未命名来源")}</span>`;
    return `
      <div class="source-hint-check">
        ${target}
        <span>${escapeHtml(label)}</span>
        <small>${escapeHtml(item.resultCount || 0)} 条结果</small>
      </div>
    `;
  }

  function renderCard(card) {
    return `
      <article class="watch-opportunity-card">
        <div class="card-header">
          <span class="level-badge level-${escapeHtml((card.visible_level || "C").toLowerCase())}">${escapeHtml(card.visible_level || "C")}</span>
          <a href="${escapeHtml(card.official_source_url || "#")}" target="_blank" rel="noopener">${escapeHtml(card.title || "未知机会")}</a>
        </div>
        <p>${escapeHtml(card.match_reason || card.ai_analysis || "")}</p>
      </article>
    `;
  }

  async function runWatchNow({ radarId, description, spec, profile, suggestedName, presetId }) {
    if (!spec) {
      throw new Error("缺少已确认的雷达规格");
    }
    switchToResult();
    renderLoading(description);
    try {
      const search = radarId
        ? await postJson(`/api/radars/${radarId}/run`, {})
        : await postJson("/api/search", { spec, query: description });
      const cards = search.data.opportunityCards || [];
      const sourceHintChecks = search.data.sourceHintChecks || [];
      const runId = search.data?.run?.id;
      const report = await postJson("/api/reports/generate", {
        spec,
        radar_type: "ai_competition",
        opportunities: cards,
        sourceHintChecks,
        ...(radarId ? { radar_id: radarId, run_id: runId } : {}),
        profile,
      });
      currentResult = {
        radarId,
        description,
        spec,
        profile,
        presetId,
        suggestedName: suggestedName || "本次盯机会结果",
        opportunityCards: cards,
        sourceHintChecks,
        markdown: report.data.markdown,
      };
      renderResult(currentResult);
    } catch (err) {
      const root = document.getElementById("watch-result-root");
      if (root) root.innerHTML = `<p class="placeholder">盯机会失败：${escapeHtml(err.message)}</p>`;
    }
  }

  async function saveCurrentRadar() {
    if (!currentResult) return;
    const name = currentResult.suggestedName || "我的机会雷达";
    const created = await postJson("/api/radars", {
      name,
      kind: "custom",
      spec: currentResult.spec,
    });
    const radarId = created.data.id;
    await postJson(`/api/radars/${radarId}/activate`, {});

    // 保存后立即运行新雷达，并生成绑定 radar_id + run_id 的报告，确保“我的雷达”能看到本次机会和报告。
    const run = await postJson(`/api/radars/${radarId}/run`, {});
    const runId = run.data?.run?.id;
    const cards = run.data?.opportunityCards || [];
    const sourceHintChecks = run.data?.sourceHintChecks || [];
    const report = await postJson("/api/reports/generate", {
      spec: currentResult.spec,
      radar_type: "ai_competition",
      opportunities: cards,
      sourceHintChecks,
      radar_id: radarId,
      run_id: runId,
      profile: currentResult.profile,
    });
    currentResult = {
      ...currentResult,
      radarId,
      opportunityCards: cards,
      sourceHintChecks,
      markdown: report.data.markdown,
    };
    if (window.showToast) showToast("已保存为长期雷达", "success");
    if (window.switchTab) switchTab("radars");
    if (window.loadRadarList) loadRadarList();
  }

  async function postJson(url, body) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error?.message || "请求失败");
    return json;
  }

  window.runWatchNow = runWatchNow;
})();
```

- [ ] **Step 2: Add result styles**

Add to `web/styles.css`:

```css
.watch-result {
  max-width: 1120px;
  margin: 0 auto;
}

.watch-result-header {
  margin-bottom: 16px;
}

.watch-result-actions {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 16px;
}

.watch-result-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(320px, 0.8fr);
  gap: 16px;
}

.watch-opportunity-card {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 12px;
}

.source-hint-check {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 8px;
  align-items: center;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 8px;
}

.watch-report-preview {
  white-space: pre-wrap;
  max-height: 560px;
  overflow: auto;
}

@media (max-width: 860px) {
  .watch-result-grid {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 3: Run browser smoke test**

Manual path:

```text
首页 → 点乒乓球赛事模板 → 盯一下 → 盯机会结果页 → 看到本轮重点检查来源、机会卡片和 Markdown 报告
```

Expected:

```text
至少 1 条 opportunity card
本轮重点检查来源区域存在
报告包含机会标题
```

---

### Task 4.5: Standardize Markdown Report Template

**Files:**
- Modify: `src/agents/radar-report-generator.ts`
- Modify: `src/api/routes/reports.ts`
- Create: `scripts/verify-report-template.ts`
- Create: `scripts/verify-mvp-browser-smoke.ts`
- Modify: `package.json`

The report must read like a radar judgment report, not a raw search dump.

- [ ] **Step 1: Add report template verification**

Create `scripts/verify-report-template.ts`:

```ts
import { generateRadarReport } from "../src/agents/radar-report-generator";

const spec: any = {
  product_name: "ChancePing",
  product_category: "机会雷达",
  client_profile: {
    client_name: "测试客户",
    client_type: "个人",
    industry: "体育",
    business_type: "乒乓球选手",
    products_or_projects: ["个人参赛"],
    target_users: ["自己"],
    core_capabilities: ["乒乓球"],
    current_assets: [],
    regions: ["中国", "国际"],
    notes: "",
  },
  core_goals: {
    primary_goal: "寻找可报名乒乓球赛事",
    secondary_goals: [],
    success_definition: "找到可报名且来源真实的比赛",
    action_intent: ["报名比赛"],
    priority_order: ["可报名", "权威来源"],
  },
  opportunity_scope: {
    primary_opportunity_types: ["乒乓球比赛"],
    secondary_opportunity_types: ["公开赛"],
    excluded_opportunity_types: ["培训广告"],
    must_have_conditions: ["可报名"],
    nice_to_have_conditions: [],
  },
  region_scope: {
    primary_regions: ["中国"],
    secondary_regions: ["国际"],
    excluded_regions: [],
    global_allowed: true,
    overseas_allowed: true,
  },
  keyword_strategy: {
    core_keywords_zh: ["乒乓球", "比赛", "报名"],
    core_keywords_en: ["table tennis", "entry"],
    expanded_keywords_zh: [],
    expanded_keywords_en: [],
    negative_keywords: ["培训广告"],
  },
  source_strategy: {
    official_sites: [],
    platforms: [],
    search_engines: [],
    social_media: [],
    rss_sources: [],
    manual_sources: ["中国乒协官网"],
    source_priority: ["ITTF", "中国乒协官网"],
    sources_used_in_report: [],
    user_supplied_sources: [
      {
        source_name: "ITTF",
        source_url: "https://www.ittf.com/",
        added_at: "2026-06-30T00:00:00.000Z",
        contributed_by: "user",
      },
    ],
    source_transparency_enabled: true,
  },
  filter_rules: {
    must_include: ["报名"],
    must_exclude: ["广告"],
    low_priority_signals: [],
    high_priority_signals: ["官方"],
    requires_manual_review: [],
  },
  scoring_rules: {
    backend_score_enabled: true,
    visible_level_enabled: true,
    weights: { match_score: 30, business_value: 25, timeliness: 20, credibility: 15, actionability: 10, risk_penalty: -20 },
    visible_level_mapping: { S: "90-100", A: "80-89", B: "65-79", C: "50-64", D: "0-49", hidden: "不展示" },
    level_definitions: { S: "强烈推荐", A: "高价值", B: "可关注", C: "低优先级", D: "不推荐", hidden: "不展示" },
  },
  report_requirements: {
    report_format: "markdown",
    report_title_prefix: "机会雷达报告",
    report_frequency: "weekly",
    max_items_per_report: 10,
    min_items_per_report: 1,
    must_include_sections: [],
    opportunity_card_required_fields: [],
    link_required: true,
    contact_required_if_available: false,
    deadline_required_if_available: true,
  },
  requirement_confidence: {
    total: 100,
    client_identity: { score: 100, weight: 15, reason: "" },
    business_goal: { score: 100, weight: 20, reason: "" },
    opportunity_type: { score: 100, weight: 20, reason: "" },
    region_scope: { score: 100, weight: 10, reason: "" },
    exclusion_rules: { score: 100, weight: 10, reason: "" },
    action_scenario: { score: 100, weight: 15, reason: "" },
    report_format: { score: 100, weight: 10, reason: "" },
  },
  questions_to_confirm: [],
  confirmation_status: { status: "confirmed", user_confirmed: true, confirmed_at: "2026-06-30", last_user_feedback: "", revision_count: 0 },
};

const result = generateRadarReport({
  spec,
  radar_type: "ai_competition",
  period_start: "2026-06-24",
  period_end: "2026-06-30",
  sourceHintChecks: [
    {
      sourceName: "ITTF",
      sourceUrl: "https://www.ittf.com/",
      status: "checked",
      resultCount: 1,
    },
    {
      sourceName: "中国乒协官网",
      sourceUrl: "",
      status: "name_only",
      resultCount: 0,
    },
  ] as any,
  opportunities: [
    {
      id: "opp-test",
      title: "测试乒乓球公开赛",
      type: "乒乓球比赛",
      deadline: "2026-07-15",
      visible_level: "A",
      status: "new",
      match_reason: "报名窗口仍开放，适合个人选手。",
      official_source_url: "https://www.ittf.com/",
    } as any,
  ],
});

const md = result.markdown || "";
const required = [
  "# 机会雷达报告",
  "## 0. 本轮总判断",
  "## 1. 雷达画像",
  "指定信号源",
  "## 2. 本轮机会总表",
  "## 3. 重点机会详解",
  "## 5. 本周行动清单",
  "## 7. 来源索引",
  "本轮重点检查来源",
  "中国乒协官网",
  "测试乒乓球公开赛",
  "https://www.ittf.com/",
];

let failed = 0;
for (const token of required) {
  if (!md.includes(token)) {
    failed++;
    console.log(`FAIL missing ${token}`);
  }
}
if (failed === 0) console.log("PASS report template matches MVP structure");
process.exit(failed > 0 ? 1 : 0);
```

- [ ] **Step 2: Verify RED**

Run:

```bash
npx tsx scripts/verify-report-template.ts
```

Expected: current generator fails at least the new template heading checks.

- [ ] **Step 3: Update generator structure**

Update `src/agents/radar-report-generator.ts` so generated Markdown uses:

```md
# 机会雷达报告｜{雷达名称}｜{日期}

## 0. 本轮总判断
## 1. 雷达画像
## 2. 本轮机会总表
## 3. 重点机会详解
## 4. 暂不推荐 / 观察池
## 5. 本周行动清单
## 6. 下一轮继续监控重点
## 7. 来源索引
```

`## 1. 雷达画像` must include `指定信号源`. `## 7. 来源索引` must include `本轮重点检查来源` and `待复核来源` when source hint checks contain failed or no-result entries.

The existing scoring/grouping logic can be reused. Only the customer-facing section structure and labels need to change for MVP.

- [ ] **Step 4: Pass profile and source hints through report route**

Update `src/api/routes/reports.ts` and relevant request types so `/api/reports/generate` can accept optional `profile` and `sourceHintChecks` objects. If `profile` is present, use it for the `## 1. 雷达画像` display. If absent, derive the profile display from `spec`. Use `sourceHintChecks` plus `spec.source_strategy` for the `## 7. 来源索引` display.

- [ ] **Step 5: Add package script**

```json
"verify:report-template": "tsx scripts/verify-report-template.ts"
```

Include it in `verify:all`.

- [ ] **Step 6: Verify GREEN**

Run:

```bash
npx tsx scripts/verify-report-template.ts
```

Expected:

```text
PASS report template matches MVP structure
```

- [ ] **Step 7: Add browser smoke verification**

The static `verify-mvp-ux.ts` test does not replace browser validation. Add a browser smoke script using the project's existing optional `puppeteer` dependency rather than adding Playwright. The automated smoke uses the table-tennis template path so it does not create a custom radar or consume local quota.

Create `scripts/verify-mvp-browser-smoke.ts`:

```ts
import { spawn } from "child_process";
import fs from "fs";

process.env.DATA_MODE = process.env.DATA_MODE ?? "mock";
process.env.LLM_MODE = process.env.LLM_MODE ?? "mock";
process.env.PORT = process.env.PORT ?? "3100";

const port = Number(process.env.PORT);
const baseUrl = `http://127.0.0.1:${port}`;

let failed = 0;
let server: ReturnType<typeof spawn> | null = null;

function fail(message: string): void {
  failed++;
  console.log(`FAIL ${message}`);
}

async function waitForServer(): Promise<void> {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(baseUrl);
      if (res.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`server not ready at ${baseUrl}`);
}

async function main(): Promise<void> {
  let puppeteer: any;
  try {
    puppeteer = (await import("puppeteer")).default;
  } catch {
    console.log("SKIP puppeteer not installed; run manual browser path instead");
    return;
  }

  server = spawn("./node_modules/.bin/tsx", ["src/api/server.ts"], {
    env: { ...process.env, PORT: String(port), DATA_MODE: "mock", LLM_MODE: "mock" },
    stdio: "ignore",
  });

  await waitForServer();

  const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const browser = await puppeteer.launch({
    headless: "new",
    ...(fs.existsSync(chromePath) ? { executablePath: chromePath } : {}),
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();
  await page.goto(baseUrl, { waitUntil: "networkidle0" });

  await page.waitForSelector("#home-watch-btn", { timeout: 5000 });
  await page.waitForSelector('[data-template-id="table_tennis"]', { timeout: 5000 });
  await page.click('[data-template-id="table_tennis"]');
  await page.click("#home-watch-btn");
  await page.waitForSelector(".source-hint-check", { timeout: 15000 });
  await page.waitForSelector(".watch-opportunity-card", { timeout: 15000 });
  const reportText = await page.$eval(".watch-report-preview", (el: Element) => el.textContent || "");
  if (!reportText.includes("## 1. 雷达画像")) fail("report missing radar profile section");
  if (!reportText.includes("指定信号源")) fail("report missing source hints");
  await browser.close();
}

main()
  .catch((err) => fail(err instanceof Error ? err.message : String(err)))
  .finally(() => {
    if (server) server.kill();
    process.exit(failed > 0 ? 1 : 0);
  });
```

Add package script:

```json
"verify:mvp-browser": "tsx scripts/verify-mvp-browser-smoke.ts"
```

Run after Task 4.5:

```bash
npx tsx scripts/verify-mvp-browser-smoke.ts
```

Manual browser path for Jason review:

```text
首页
→ 输入“我是乒乓球选手，想了解国内外乒乓球比赛”
→ 点击 盯一下
→ 在画像确认卡添加 https://www.ittf.com/ 和 https://worldtabletennis.com/
→ 确认并创建雷达
→ 看到本轮重点检查来源
→ 看到机会卡片
→ 看到 Markdown 报告
```

---

### Task 5: Simplify My Radars

**Files:**
- Modify: `web/radars.js`
- Modify: `web/radar-detail.js`
- Modify: `web/styles.css`

- [ ] **Step 1: Simplify radar cards**

In `web/radars.js`, change card content to customer fields:

```js
card.innerHTML = `
  ${builtinTag}
  <div class="radar-card-header">
    <span class="radar-kind-badge kind-${escapeHtml(radar.kind || "custom")}">${escapeHtml(kindLabel)}</span>
    <span class="radar-status-text">${escapeHtml(statusLabel)}</span>
  </div>
  <h4 class="radar-name">${escapeHtml(radar.name || "未命名雷达")}</h4>
  <div class="radar-last-run">最近一次：${escapeHtml(lastRun)}${escapeHtml(lastRunStatus)}</div>
  <div class="radar-actions-row">
    <button class="btn-detail" data-radar-id="${escapeAttr(radar.id)}">查看</button>
  </div>
`;
```

- [ ] **Step 2: Hide provider/spec details behind advanced class**

In `web/radar-detail.js`, wrap spec/provider debug sections:

```html
<div class="radar-detail-section advanced-only" hidden>
  ...
</div>
```

- [ ] **Step 3: Keep recent opportunity and report sections visible**

Ensure visible sections are:

```text
需求摘要
已入库机会
运行历史
历史报告
```

- [ ] **Step 4: Run tests**

Run:

```bash
npx tsx scripts/verify-task-v1.5-04-ui.ts
npx tsx scripts/verify-mvp-ux.ts
```

Expected:

```text
0 FAIL
```

---

### Task 6: Remove Fake Mock Links

**Files:**
- Modify: `src/demo/ai-events.mock.json`
- Modify: `src/demo/opc-events.mock.json`
- Modify: `src/demo/cultural-events.mock.json`
- Create: `scripts/verify-mock-links.ts`
- Modify: `package.json`

- [ ] **Step 1: Add static fake-link test**

Create `scripts/verify-mock-links.ts`:

```ts
import fs from "fs";
import path from "path";

const files = [
  "src/demo/ai-events.mock.json",
  "src/demo/opc-events.mock.json",
  "src/demo/cultural-events.mock.json",
];

const banned = ["example.com", "competition.example.com"];
let failed = 0;

for (const file of files) {
  const text = fs.readFileSync(path.resolve(process.cwd(), file), "utf-8");
  for (const domain of banned) {
    if (text.includes(domain)) {
      failed++;
      console.log(`FAIL ${file} contains ${domain}`);
    }
  }
}

if (failed === 0) console.log("PASS mock links do not use fake domains");
process.exit(failed > 0 ? 1 : 0);
```

- [ ] **Step 2: Verify RED**

Run:

```bash
npx tsx scripts/verify-mock-links.ts
```

Expected:

```text
FAIL ... contains example.com
```

- [ ] **Step 3: Replace fake links**

Use stable reachable public pages for demo links. Examples:

```json
"url": "https://www.kaggle.com/competitions"
```

```json
"url": "https://www.gov.cn/zhengce/"
```

```json
"url": "https://www.ihchina.cn/"
```

- [ ] **Step 4: Add script**

Patch `package.json`:

```json
"verify:mock-links": "tsx scripts/verify-mock-links.ts"
```

Update `verify:all` to include:

```json
"npm run verify:mock-links"
```

- [ ] **Step 5: Verify GREEN**

Run:

```bash
npx tsx scripts/verify-mock-links.ts
```

Expected:

```text
PASS mock links do not use fake domains
```

---

### Task 7: Load `api.env` for Local Live Testing

**Files:**
- Create: `src/config/local-env.ts`
- Modify: `src/api/server.ts`
- Create: `scripts/verify-local-env.ts`
- Modify: `package.json`

- [ ] **Step 1: Add no-output env loader**

Create `src/config/local-env.ts`:

```ts
import fs from "fs";
import path from "path";

export function loadLocalEnv(filename = "api.env"): string[] {
  const envPath = path.resolve(process.cwd(), filename);
  if (!fs.existsSync(envPath)) return [];
  const loaded: string[] = [];
  const lines = fs.readFileSync(envPath, "utf-8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
    if (!match) continue;
    const key = match[1];
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
      loaded.push(key);
    }
  }
  return loaded;
}
```

- [ ] **Step 2: Load before app context creation**

Patch `src/api/server.ts` near the top:

```ts
import { loadLocalEnv } from "../config/local-env";

loadLocalEnv();
```

- [ ] **Step 3: Add safe verification script**

Create `scripts/verify-local-env.ts`:

```ts
import { loadLocalEnv } from "../src/config/local-env";

const loaded = loadLocalEnv();
const required = ["DATA_MODE", "LLM_MODE", "SERPER_API_KEY"];
const present = required.filter((key) => process.env[key] !== undefined);

console.log(`Loaded env names: ${loaded.sort().join(",")}`);
console.log(`Present required names: ${present.sort().join(",")}`);

if (present.length === 0) {
  console.log("No live env names present; this is allowed in mock-only environments.");
}
```

This script must never print values.

- [ ] **Step 4: Add script**

Patch `package.json`:

```json
"verify:local-env": "tsx scripts/verify-local-env.ts"
```

- [ ] **Step 5: Run safe verification**

Run:

```bash
npx tsx scripts/verify-local-env.ts
```

Expected:

```text
Only env names appear; no API key values appear.
```

---

### Task 8: Live API MVP Trial

**Files:**
- Create: `scripts/verify-live-mvp.ts`
- Modify: `package.json`

- [ ] **Step 1: Add live trial script**

Create `scripts/verify-live-mvp.ts`:

```ts
import { createApp } from "../src/api/app";
import { loadLocalEnv } from "../src/config/local-env";

loadLocalEnv();

process.env.DATA_MODE = process.env.DATA_MODE ?? "live";
process.env.LLM_MODE = process.env.LLM_MODE ?? "live";

const scenarios = [
  {
    description: "我想追踪近期 AI 创作比赛、AI 游戏比赛、模型厂商黑客松、带奖金或曝光价值的 AI 赛事。",
    sources: [],
  },
  {
    description: "我是乒乓球选手，想了解国内外乒乓球比赛、WTT、ITTF、公开赛和报名窗口。",
    sources: [
      { source_name: "ITTF", source_url: "https://www.ittf.com/" },
      { source_name: "WTT", source_url: "https://worldtabletennis.com/" },
    ],
    manual_sources: ["中国乒协官网"],
  },
  {
    description: "我是帮客户申请项目的财税公司，需要追踪创业比赛、创新创业大赛、项目申报和政府补贴机会。",
    sources: [],
  },
];

const app = createApp();
let failed = 0;

async function post(url: string, body: unknown) {
  const res = await app.request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  return { status: res.status, json };
}

function withSources(spec: any, scenario: any) {
  const now = new Date().toISOString();
  return {
    ...spec,
    source_strategy: {
      official_sites: [],
      platforms: [],
      search_engines: [],
      social_media: [],
      rss_sources: [],
      manual_sources: scenario.manual_sources ?? [],
      source_priority: [],
      sources_used_in_report: [],
      user_supplied_sources: (scenario.sources ?? []).map((source: any) => ({
        source_name: source.source_name,
        source_url: source.source_url,
        added_at: now,
        contributed_by: "user",
      })),
      source_transparency_enabled: true,
      ...(spec.source_strategy ?? {}),
    },
  };
}

for (const scenario of scenarios) {
  const description = scenario.description;
  const gen = await post("/api/radars/generate", { description });
  if (gen.status !== 200 || !gen.json.success) {
    console.log(`FAIL generate: ${description}`);
    failed++;
    continue;
  }
  const spec = withSources(gen.json.data.spec, scenario);
  const search = await post("/api/search", { spec, query: description });
  const cards = search.json.data?.opportunityCards ?? [];
  const sourceHintChecks = search.json.data?.sourceHintChecks ?? [];
  if (cards.length === 0) {
    console.log(`FAIL no opportunityCards: ${description}`);
    failed++;
    continue;
  }
  if ((scenario.sources?.length ?? 0) > 0 && sourceHintChecks.length === 0) {
    console.log(`FAIL no sourceHintChecks: ${description}`);
    failed++;
    continue;
  }
  const report = await post("/api/reports/generate", {
    spec,
    radar_type: "ai_competition",
    opportunities: cards,
    sourceHintChecks,
  });
  const firstTitle = cards[0]?.title ?? "";
  if (!report.json.data?.markdown?.includes(firstTitle)) {
    console.log(`FAIL report missing opportunity title: ${description}`);
    failed++;
    continue;
  }
  console.log(`PASS ${description.slice(0, 20)}... cards=${cards.length}`);
}

process.exit(failed > 0 ? 1 : 0);
```

- [ ] **Step 2: Add script**

Patch `package.json`:

```json
"verify:live-mvp": "tsx scripts/verify-live-mvp.ts"
```

Do not add `verify:live-mvp` to `verify:all`. It may consume live API quota and must only run after Jason explicitly approves live API use.

- [ ] **Step 3: Run only after confirming live API use**

Run:

```bash
npx tsx scripts/verify-live-mvp.ts
```

Expected:

```text
PASS ... cards=N
```

If live API quota, network proxy, or provider auth fails, record provider-level errors without printing secrets.

---

### Task 9: Final Verification

**Files:**
- All touched files

- [ ] **Step 1: Typecheck**

Run:

```bash
npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 2: Run MVP rescue tests**

Run:

```bash
npx tsx scripts/verify-v1.5-e2e.ts
npx tsx scripts/verify-task-v1.5-04-ui.ts
npx tsx scripts/verify-mvp-ux.ts
npx tsx scripts/verify-source-hints.ts
npx tsx scripts/verify-report-template.ts
npx tsx scripts/verify-mock-links.ts
```

Expected: all exit 0.

- [ ] **Step 3: Browser acceptance**

Manual path:

```text
首页
→ 输入“我是乒乓球选手，想了解国内外乒乓球比赛”
→ 点击 盯一下
→ 在画像确认卡添加 https://www.ittf.com/ 和 https://worldtabletennis.com/
→ 确认并创建雷达
→ 看到本轮重点检查来源
→ 看到机会卡片
→ 看到 Markdown 报告
→ 我的雷达
→ 重新盯一下
→ 生成报告
→ 刷新页面
→ 机会和报告仍存在
```

Expected:

```text
客户不需要进入搜索页、机会库页、报告页、编辑器页即可完成 MVP。
```

---

## Recommended Execution Order

1. Task 0
2. Task 1
3. Task 2
4. Task 3
5. Task 3.5
6. Task 3.6
7. Task 4
8. Task 4.5
9. Task 5
10. Task 6
11. Task 7
12. Task 8
13. Task 9

## Review Notes

- `api.env` must remain local and ignored.
- Live API tests must not print secret values.
- Customer source hints are MVP-light: URL and source-name input only, no source management backend.
- The first implementation milestone should stop after Task 4.5 if UI/report/source-hint direction needs Jason review.
- The second milestone should finish Task 5 and Task 6.
- The third milestone should finish Task 7 and Task 8.
