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
const webRoutes = read("src/api/routes/web-ui.ts");

console.log("\n[Q7 AI Events Page] Static contract checks\n");

check("page title uses new sample-room name", html.includes("盯比赛 · 全球 AI 赛事导航｜ChancePing"));
check("canonical /aievents route is registered", webRoutes.includes('app.get("/aievents"') && webRoutes.includes('serveFile("ai-events.html"'));
check("page exposes Chinese sample-room title", html.includes("全球 AI 赛事导航"));
check("page exposes English product name", js.includes("AI Contest Navigator"));
check("page explains ChancePing AI Opportunity Radar", js.includes("ChancePing AI Opportunity Radar"));
check("page has bilingual buttons", html.includes('data-language="zh"') && html.includes('data-language="en"'));
check("page has public source network section", html.includes("ai-events-source-map") && html.includes("Devpost") && html.includes("DoraHacks"));
check("page keeps CTA back to console", html.includes('href="/?live_search=1"') && html.includes("创建我的 AI 赛事雷达"));
check("page loads public API with pagination params", js.includes("/api/public/ai-events?status=") && js.includes("page_size"));
check("page still renders opportunity cards", js.includes("renderItem") && html.includes("ai-events-grid"));
check("page has current/history filters", html.includes("ai-events-filter-current") && html.includes("ai-events-filter-historical"));
check("page has category filter container", html.includes("ai-events-category-filter") && js.includes("currentCategory"));
check("page requests category param", js.includes("category=") && js.includes("data-ai-events-category"));
check("page renders AI contest category labels", js.includes("AI Agent / 智能体") && js.includes("Vibe Coding / AI 编程") && js.includes("AIGC 内容 / 自媒体"));
check("page renders rich event field labels", js.includes("eventModeLabel") && js.includes("participantTypeLabel") && js.includes("rewardTypeLabel") && js.includes("organizerTypeLabel"));
check("page renders event cover images", js.includes("coverImageUrl") && js.includes("imageAlt") && js.includes("ai-event-cover"));
check("page handles image metadata without exposing internals", js.includes("imageStatus") && !/imageStatus.*待复核/.test(js));
check("page exposes customer-facing metadata labels", js.includes("形式") && js.includes("适合") && js.includes("奖励") && js.includes("主办方"));
check("page has pagination controls", html.includes("ai-events-prev") && html.includes("ai-events-next") && html.includes("ai-events-page-info"));
check("public page does not show needs-review wording", !/待复核|Needs review|needs review|review required/i.test(html + js));
check("blue tech tokens exist", css.includes("--ai-blue: #2563eb") && css.includes("--ai-cyan: #06b6d4"));
check("old public title removed from HTML", !html.includes("AI 赛事情报雷达"));
check("main blue UI does not use old accent button on /ai-events", !css.includes(".ai-events-start {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  min-height: 42px;\n  padding: 0 18px;\n  border-radius: 999px;\n  background: var(--accent);"));
check("does not expose env keys", !/API_KEY|SERPER_API_KEY|COMMERCIAL_LLM_API_KEY|CONTEST_LLM_API_KEY/i.test(html + js));
check("does not mention mock as successful source", !/mock\s+success|demo\s+source/i.test(html + js));

console.log(`\nQ7 AI events page checks: ${passCount} PASS / ${failCount} FAIL`);

if (failCount > 0) {
  process.exit(1);
}
