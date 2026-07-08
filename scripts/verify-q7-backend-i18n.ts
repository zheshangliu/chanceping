import { existsSync, readFileSync } from "node:fs";

let pass = 0;
let fail = 0;

function read(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

function check(name: string, condition: boolean, detail = ""): void {
  if (condition) {
    pass += 1;
    console.log(`PASS ${name}`);
  } else {
    fail += 1;
    console.error(`FAIL ${name}${detail ? `: ${detail}` : ""}`);
  }
}

const html = read("web/index.html");
const styles = read("web/styles.css");
const backendI18n = read("web/backend-i18n.js");
const webUiRoute = read("src/api/routes/web-ui.ts");
const webVisibleFiles = [
  "web/index.html",
  "web/home.js",
  "web/hero-radar-chat.js",
  "web/radar-profile.js",
  "web/radars.js",
  "web/radar-detail.js",
  "web/watch-result.js",
  "web/search.js",
].map((file) => ({ file, content: read(file) }));

function visibleFile(file: string): string {
  return webVisibleFiles.find((item) => item.file === file)?.content ?? "";
}

check("backend i18n script exists", existsSync("web/backend-i18n.js"));
check("index loads backend i18n before app scripts", html.includes("/backend-i18n.js"));
check("web UI serves backend i18n script", webUiRoute.includes("/backend-i18n.js") && webUiRoute.includes('serveFile("backend-i18n.js"'));
check("top banner has backend language switcher", html.includes("backend-language") && html.includes('data-backend-language="zh"') && html.includes('data-backend-language="en"'));
check("backend language switcher styled", styles.includes(".backend-language") && styles.includes(".backend-language button.is-active"));
check("brand title uses isolated i18n span", html.includes('class="brand-title" data-backend-i18n="brandTitle"') && html.includes('class="demo-badge"'));
check("top nav has i18n hooks", ["topNavHome", "topNavResult", "topNavRadars"].every((key) => html.includes(`data-backend-i18n="${key}"`)));
check("home shell has i18n hooks", ["sidebarNewRadar", "sidebarRecent", "homeTitle", "homeSubtitle", "homeInputPlaceholder", "homeStartButton"].every((key) => html.includes(key)));
check("backend i18n has zh/en dictionaries", backendI18n.includes("const BACKEND_I18N") && backendI18n.includes("zh:") && backendI18n.includes("en:"));
check("backend i18n persists language", backendI18n.includes("chanceping_backend_language") && backendI18n.includes("localStorage"));
check("backend i18n translates text and placeholders", backendI18n.includes("data-backend-i18n") && backendI18n.includes("data-backend-i18n-placeholder"));
check("backend i18n exposes apply function for dynamic screens", backendI18n.includes("applyChancePingBackendLanguage") && backendI18n.includes("change"));
check("backend i18n only toggles language buttons", backendI18n.includes('querySelectorAll("button[data-backend-language]")'));
check("backend i18n does not special-case nested brand text", !backendI18n.includes("classList?.contains(\"brand\")") && !backendI18n.includes("insertBefore(document.createTextNode"));
check("backend i18n includes AI events navigator English copy", backendI18n.includes("Global AI Events Navigator"));
[
  "myRadarsTitle",
  "createRadar",
  "quotaCustomRadars",
  "oneChatOneRadar",
  "chatInputPlaceholder",
  "resultBoard",
  "adjustRadarProfile",
  "fullMarkdownReport",
].forEach((key) => {
  check(`backend i18n includes dynamic key ${key}`, backendI18n.includes(key));
});
check("radar list reloads on backend language change", visibleFile("web/radars.js").includes("chanceping-backend-language-change") && visibleFile("web/radars.js").includes("loadRadarList"));
check("hero chat rerenders on backend language change", visibleFile("web/hero-radar-chat.js").includes("chanceping-backend-language-change") && visibleFile("web/hero-radar-chat.js").includes("renderHeroRadarChat"));
check("watch result uses backend i18n helper", visibleFile("web/watch-result.js").includes("backendText(") && visibleFile("web/watch-result.js").includes("currentBackendLanguage"));
check("radar list uses backend i18n helper", visibleFile("web/radars.js").includes("backendText(") && visibleFile("web/radars.js").includes("currentBackendLanguage"));
check("hero chat uses backend i18n helper", visibleFile("web/hero-radar-chat.js").includes("backendText(") && visibleFile("web/hero-radar-chat.js").includes("currentBackendLanguage"));
const backendChancePingWording = webVisibleFiles.map(({ content }) => content).join("\n");
const visibleProviderExecutorHits = webVisibleFiles
  .filter(({ content }) => /Serper\s*正在|Serper：|Qwen\s*正在|Qwen：|LLM\s*正在|provider\s*正在/i.test(content))
  .map(({ file }) => file);
check("backend visible loading uses ChancePing wording", visibleProviderExecutorHits.length === 0, visibleProviderExecutorHits.join(", "));
[
  "盯机会正在理解并生成雷达",
  "盯机会正在画雷达",
  "盯机会正在搜索机会并整理证据",
  "盯机会正在生成机会报告",
  "盯机会正在生成报告",
].forEach((phrase) => {
  check(`backend visible wording includes ${phrase}`, backendChancePingWording.includes(phrase));
});

const deepSeekVisibleHits = webVisibleFiles
  .filter(({ content }) => /DeepSeek/i.test(content))
  .map(({ file }) => file);
check("backend visible files do not mention DeepSeek", deepSeekVisibleHits.length === 0, deepSeekVisibleHits.join(", "));
check("profile page says ChancePing is understanding and generating radar", visibleFile("web/radar-profile.js").includes("盯机会正在理解并生成雷达"));
check("profile page says ChancePing is re-understanding supplements", visibleFile("web/radar-profile.js").includes("盯机会正在重新理解你的补充"));
check("radar list page says ChancePing is drawing radar", visibleFile("web/radars.js").includes("盯机会正在画雷达规格"));
check("watch result page says ChancePing searches and organizes evidence", visibleFile("web/watch-result.js").includes("盯机会正在搜索机会并整理证据"));
check("watch result page says ChancePing generates opportunity report", visibleFile("web/watch-result.js").includes("盯机会正在生成机会报告"));
check("radar detail rerun page uses ChancePing wording", visibleFile("web/radar-detail.js").includes("盯机会正在重新盯机会"));
check("radar detail report generation uses ChancePing wording", visibleFile("web/radar-detail.js").includes("盯机会正在生成报告"));
check("legacy search page uses ChancePing wording", visibleFile("web/search.js").includes("盯机会正在搜索"));
check("hero chat says ChancePing interprets and draws radar", visibleFile("web/hero-radar-chat.js").includes("盯机会正在理解并生成雷达") && visibleFile("web/hero-radar-chat.js").includes("盯机会正在画雷达"));

console.log(`Q7 backend i18n: ${pass} PASS / ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
