import fs from "fs";
import path from "path";

let passCount = 0;
let failCount = 0;

function read(relativePath: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), relativePath), "utf8");
}

function check(name: string, condition: boolean, detail = ""): void {
  if (condition) {
    passCount++;
    console.log(`[PASS] ${name}`);
  } else {
    failCount++;
    console.error(`[FAIL] ${name}${detail ? `: ${detail}` : ""}`);
  }
}

const html = read("web/ai-events.html");
const js = read("web/ai-events.js");
const css = read("web/styles.css");
const hybridCssPath = path.resolve(process.cwd(), "web/ai-events-hybrid.css");
const hybridCss = fs.existsSync(hybridCssPath) ? read("web/ai-events-hybrid.css") : "";
const webRoutes = read("src/api/routes/web-ui.ts");

console.log("\n[Q7 AI Events Page] Static contract checks\n");

check("page title uses independent AI events name", html.includes("盯比赛｜全球 AI 赛事导航"));
check("canonical /aievents route is registered", webRoutes.includes('app.get("/aievents"') && webRoutes.includes('serveFile("ai-events.html"'));
check("page exposes Chinese sample-room title", html.includes("全球 AI 赛事导航"));
check("page exposes English product name", js.includes("AI Contest Navigator"));
check("page explains ChancePing AI Opportunity Radar", js.includes("ChancePing AI Opportunity Radar"));
check("page has bilingual buttons", html.includes('data-language="zh"') && html.includes('data-language="en"'));
check("page uses independent logo asset", html.includes("/assets/chanceping-logo.png") && !html.includes("ai-events-brand-mark"));
check("page topbar does not expose backend navigation", !html.includes("ai-events-nav") && !html.includes("主控台") && !html.includes("我的雷达"));
check("page removes sample-room wording", !html.includes("样板间") && !js.includes("样板间"));
check("page proof copy attributes system to ChancePing", js.includes("本网页基于 盯机会 ChancePing 系统") && js.includes("公开机会导航"));
check("page has public source network section", html.includes("ai-events-source-map") && html.includes("Devpost") && html.includes("DoraHacks"));
check("source network initial list includes latest source batch", html.includes("Major League Hacking") && html.includes("TapNow") && html.includes("Kling AI") && html.includes("火山引擎") && html.includes("腾讯云开发者"));
check("source network renders full backend source list", js.includes(".map((source)") && !js.includes(".slice(0, 16)"));
check("page keeps CTA back to console", html.includes('href="/?live_search=1"') && html.includes("创建我的 AI 赛事雷达"));
check("page loads public API with pagination params", js.includes("/api/public/ai-events?") && js.includes("page_size"));
check("page still renders opportunity cards", js.includes("renderItem") && html.includes("ai-events-grid"));
check("supporting source/about modules are below opportunity cards", html.indexOf("ai-events-panel") < html.indexOf("ai-events-source-map") && html.indexOf("ai-events-panel") < html.indexOf("ai-events-about"));
check("page footer exposes contact email", html.includes("sunny251610056@gmail.com") && html.includes("ai-events-footer"));
check("page has source suggestion form", html.includes("ai-events-feedback") && html.includes("ai-events-feedback-form") && html.includes("ai-events-source-url"));
check("source suggestion form is customer-facing and email based", js.includes("handleFeedbackSubmit") && js.includes("mailto:sunny251610056@gmail.com") && js.includes("feedbackSuccess"));
check("source suggestion form does not pretend backend persistence", !js.includes("/api/public/ai-events/feedback") && !html.includes("data-feedback-api"));
check("filtered empty state explains filter mismatch", js.includes("emptyFiltered") && js.includes("emptyMessage"));
check("page has current/history filters", html.includes("ai-events-filter-current") && html.includes("ai-events-filter-historical"));
check("history entry uses contest wording", html.includes("历史赛事") && js.includes("historicalTab: \"历史赛事\""), html.slice(html.indexOf("ai-events-filter-historical") - 80, html.indexOf("ai-events-filter-historical") + 160));
check("page has category filter container", html.includes("ai-events-category-filter") && js.includes("currentCategory"));
check("page requests category param", js.includes("category: currentCategory") && js.includes("data-ai-events-category"));
check("page has region/reward/deadline filter containers", html.includes("ai-events-region-filter") && html.includes("ai-events-reward-filter") && html.includes("ai-events-deadline-filter"));
check("page requests region/reward/deadline params", js.includes("region: currentRegion") && js.includes("reward: currentReward") && js.includes("deadline_window: currentDeadlineWindow"));
check("page restores filter state from URL params", js.includes("hydrateStateFromUrl") && js.includes("searchParams.get(\"status\")") && js.includes("deadline_window"));
check("page renders region/reward/deadline facet controls", js.includes("regionFacets") && js.includes("rewardFacets") && js.includes("deadlineWindowFacets"));
check("facet buttons expose accessible count labels", js.includes("facetButtonAria") && js.includes("aria-label") && js.includes("entries"));
check("page renders AI contest category labels", js.includes("AI Agent / 智能体") && js.includes("Vibe Coding / AI 编程") && js.includes("AIGC 内容 / 自媒体"));
check("card category label follows active category filter", js.includes("displayCategoryForItem") && js.includes("currentCategory !== \"all\""));
check("page renders rich event field labels", js.includes("eventModeLabel") && js.includes("participantTypeLabel") && js.includes("rewardTypeLabel") && js.includes("organizerTypeLabel"));
check("page renders event cover images", js.includes("coverImageUrl") && js.includes("imageAlt") && js.includes("ai-event-cover"));
check("page handles image metadata without exposing internals", js.includes("imageStatus") && !/imageStatus.*待复核/.test(js));
check("page exposes customer-facing metadata labels", js.includes("形式") && js.includes("适合") && js.includes("奖励") && js.includes("主办方"));
check("page has pagination controls", html.includes("ai-events-prev") && html.includes("ai-events-next") && html.includes("ai-events-page-info"));
check("mobile page prioritizes event list before supporting sections", css.includes(".ai-events-panel {\n    order: 2;") && css.includes(".ai-events-source-map {\n    order: 3;"));
check("mobile filters use compact horizontal scrolling", css.includes("overflow-x: auto") && css.includes("scrollbar-width: none"));
check("public page does not show needs-review wording", !/待复核|Needs review|needs review|review required/i.test(html + js));
check("blue tech tokens exist", css.includes("--ai-blue: #2563eb") && css.includes("--ai-cyan: #06b6d4"));
check("old public title removed from HTML", !html.includes("AI 赛事情报雷达"));
check("main blue UI does not use old accent button on /ai-events", !css.includes(".ai-events-start {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  min-height: 42px;\n  padding: 0 18px;\n  border-radius: 999px;\n  background: var(--accent);"));
check("does not expose env keys", !/API_KEY|SERPER_API_KEY|COMMERCIAL_LLM_API_KEY|CONTEST_LLM_API_KEY/i.test(html + js));
check("does not mention mock as successful source", !/mock\s+success|demo\s+source/i.test(html + js));
check("hybrid CSS file is linked only from AI events page", html.includes('href="/ai-events-hybrid.css"'));
check("hybrid CSS static route is registered", webRoutes.includes('"/ai-events-hybrid.css"') && webRoutes.includes('serveFile("ai-events-hybrid.css"'));
check("hybrid page has operator metrics mount", html.includes("ai-events-radar-metrics"));
check("hybrid page exposes latest collection freshness metric", js.includes("metricLastCollected") && js.includes("collectionFreshnessMeta") && js.includes("约每 3 天更新"));
check("hybrid page has list controls mount", html.includes("ai-events-list-controls"));
check("hybrid page has verification panel mount", html.includes("ai-events-verification-panel"));
check("hybrid JS keeps public feed endpoint", js.includes("/api/public/ai-events?") && !js.includes("/api/radar-chats"));
check("hybrid JS does not run public sync from UI", !js.includes("/api/public/ai-events/sync") && !js.includes("/api/public/ai-events/hydrate-images"));
check("hybrid JS exposes decision-list renderer", js.includes("renderDecisionList") && js.includes("renderDecisionRow"));
check("hybrid JS exposes source verification panel", js.includes("renderVerificationPanel") && js.includes("sourceChain"));
check("hybrid JS exposes source trust labels", js.includes("verificationMeta") && js.includes("聚合线索") && js.includes("官方已核验"));
check("hybrid JS exposes deadline countdown labels", js.includes("deadlineCountdownMeta") && js.includes("截止待查"));
check("hybrid CSS is scoped to ai events page", hybridCss.includes(".ai-events-page") && !hybridCss.includes(".hero-radar-chat-root"));
check("hybrid CSS supports mobile compact list", hybridCss.includes("@media (max-width: 760px)") && hybridCss.includes("grid-template-columns: 1fr"));
check("hybrid page remains isolated from total console scripts", !html.includes("hero-radar-chat.js") && !html.includes("radars.js") && !html.includes("radar-detail.js"));

console.log(`\nQ7 AI events page checks: ${passCount} PASS / ${failCount} FAIL`);

if (failCount > 0) {
  process.exit(1);
}
