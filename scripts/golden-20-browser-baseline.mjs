import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = new URL("../", import.meta.url);
const RESULT_FILE = new URL("../data/golden-20-results.json", import.meta.url);
const REPORT_FILE = new URL("../Golden_20_User_Simulation_Report.md", import.meta.url);

const REQUIRED_SECTIONS = [
  "搜索到的来源",
  "字段已核验事实",
  "模型判断",
  "待复核项",
  "失败来源",
  "低行动性观察来源",
];

const LOW_ACTION_RE = /视频|集锦|百科|维基|规则介绍|历史介绍|新闻转载|培训广告|培训班|专栏|博客|科普|入门|指南|知乎|新浪|搜狐|网易|YouTube|playlist|wikipedia|baike|rules|history|zhihu|column|blog|guide|explainer|sports\.sina|sohu|163\.com/i;
const KEY_LEAK_RE = /COMMERCIAL_LLM_API_KEY|DEEPSEEK_API_KEY|CONTEST_LLM_API_KEY|DASHSCOPE_API_KEY|sk-[A-Za-z0-9_-]{8,}|Bearer\s+[A-Za-z0-9._-]{12,}/i;
const ACTUAL_MOCK_RE = /演示来源|演示数据，未真实核验|Mock 模式|data_mode.?mock/i;
const OVERCLAIM_RE = /已确认报名资格|已核验报名资格|已确认费用|已核验费用|已确认截止日期|已核验截止日期|已确认联系人|已核验联系人|已确认报名状态|已核验报名状态|已确认版权义务|已核验版权义务/;

export const GOLDEN_CASES = [
  { id: 1, input: "我是围棋选手，帮我盯机会。", clarity: "模糊", answer: "主要盯未来30天内国内外可报名的围棋公开赛、职业定段赛和奖金赛事，排除培训广告。", subjectRe: /围棋选手/, typeRe: /围棋|公开赛|定段赛|奖金赛事|赛事|比赛/ },
  { id: 2, input: "我是乒乓球选手，想盯未来30天内国内外可报名的乒乓球公开赛、WTT赛事、ITTF相关比赛，优先看 WTT、ITTF、中国乒协官网，排除培训广告。", clarity: "清晰", answer: "", subjectRe: /乒乓球选手/, typeRe: /乒乓球|WTT|ITTF|公开赛|比赛|赛事/ },
  { id: 3, input: "我们是一家广州婚庆公司，想找更多高端客户和合作机会。", clarity: "半清晰", answer: "主要找广州及大湾区未来60天的高端婚礼客户线索、酒店会所合作、品牌异业合作和婚礼项目机会，排除招商加盟广告。", subjectRe: /广州婚庆公司|婚庆公司/, typeRe: /客户|合作|婚礼|婚庆|线索|项目/ },
  { id: 4, input: "我们是员工福利和节日礼品供应商，想找未来60天内广东、香港企业福利采购、工会福利项目、节日礼品招标，排除加盟广告和纯招商信息。", clarity: "清晰", answer: "", subjectRe: /员工福利|节日礼品供应商/, typeRe: /福利采购|工会福利|礼品招标|采购|招标/ },
  { id: 5, input: "我们是做研学和文旅活动的公司，想找政府、学校、景区相关合作机会。", clarity: "半清晰", answer: "优先找广东及全国未来60天政府、学校、景区发布的研学文旅采购、合作征集、活动招标和项目合作机会，排除纯旅行社广告。", subjectRe: /研学|文旅活动|文旅/, typeRe: /政府|学校|景区|合作|采购|招标|研学|文旅/ },
  { id: 6, input: "我们帮中小企业做补贴申报，想盯广东省和广州市近期科技、专精特新、高新技术企业、数字化转型相关政策申报机会，同时也想找潜在客户线索。", clarity: "清晰", answer: "", subjectRe: /补贴申报|中小企业/, typeRe: /补贴|政策申报|专精特新|高新技术|数字化转型|客户线索/ },
  { id: 7, input: "我是一个 AI 工具创业者，正在做机会雷达产品，想找未来45天内 AI Agent、AI 应用、Hackathon、云厂商创业扶持、开发者大赛机会。", clarity: "清晰", answer: "", subjectRe: /AI 工具创业者|AI工具创业者|创业者/, typeRe: /AI Agent|AI 应用|Hackathon|创业扶持|开发者大赛|大赛/ },
  { id: 8, input: "我是一名猎头顾问，想找近期在香港、新加坡、广州招聘跨境财务、资金、税务、内控岗位的公司，优先看 IPO、出海扩张和招聘页信号。", clarity: "清晰", answer: "", subjectRe: /猎头顾问/, typeRe: /招聘|岗位|跨境财务|资金|税务|内控|IPO|出海/ },
  { id: 9, input: "我们是一家做岭南押花非遗和文创产品的公司，想找文创赛事、工艺美术赛事、博物馆文创征集、文旅伴手礼采购、非遗展会机会。", clarity: "清晰", answer: "", subjectRe: /岭南押花|非遗|文创产品/, typeRe: /文创|工艺美术|博物馆|伴手礼|非遗展会|征集|采购/ },
  { id: 10, input: "我们做商业活动布置和美陈，希望找一些项目机会。", clarity: "模糊", answer: "主要找广东和大湾区未来60天商业活动布置、美陈搭建、展会活动、品牌快闪、商场装置和项目招标机会，排除招聘和培训广告。", subjectRe: /商业活动布置|美陈/, typeRe: /项目|招标|商业活动|美陈|快闪|展会/ },
  { id: 11, input: "我是一名自由摄影师，想找未来两个月内可以投稿的摄影比赛、品牌征稿、城市影像计划、展览征集机会，优先国内和日本。", clarity: "清晰", answer: "", subjectRe: /自由摄影师/, typeRe: /摄影比赛|品牌征稿|城市影像|展览征集|投稿/ },
  { id: 12, input: "我是做跨境电商的，帮我盯一下机会。", clarity: "模糊", answer: "主要盯未来60天跨境平台招商活动、展会、平台招商政策、出海扶持、供应链合作和平台大促报名机会，优先东南亚、欧美和国内平台，排除培训广告。", subjectRe: /跨境电商/, typeRe: /平台招商|展会|出海|供应链|大促|机会/ },
  { id: 13, input: "我们是宠物用品品牌，想找国内外宠物展会、渠道招商、商超采购、跨境平台活动和宠物行业奖项机会。", clarity: "清晰", answer: "", subjectRe: /宠物用品品牌/, typeRe: /宠物展会|渠道招商|商超采购|跨境平台|行业奖项/ },
  { id: 14, input: "我是独立游戏开发者，想找独立游戏比赛、Game Jam、发行商扶持、游戏平台扶持、游戏节展位申请机会。", clarity: "清晰", answer: "", subjectRe: /独立游戏开发者/, typeRe: /独立游戏|Game Jam|发行商扶持|游戏平台|游戏节|展位申请/ },
  { id: 15, input: "我们是少儿编程培训机构，想找招生和合作机会。", clarity: "半清晰", answer: "主要找广州深圳未来60天少儿编程招生合作、学校社区科创活动合作、竞赛承办、课程采购和渠道合作机会，排除加盟广告。", subjectRe: /少儿编程培训机构/, typeRe: /招生|合作|科创|竞赛|课程采购|渠道/ },
  { id: 16, input: "我们是一个新中式茶饮品牌，想找商场快闪、餐饮展会、加盟展、品牌联名、城市市集和平台招商机会，优先广州深圳。", clarity: "清晰", answer: "", subjectRe: /新中式茶饮品牌|茶饮品牌/, typeRe: /商场快闪|餐饮展会|加盟展|品牌联名|城市市集|平台招商/ },
  { id: 17, input: "我们做工业环保设备，想找环保项目招标、政府采购、园区改造、制造业绿色转型项目机会，重点看广东和长三角。", clarity: "清晰", answer: "", subjectRe: /工业环保设备/, typeRe: /环保项目|招标|政府采购|园区改造|绿色转型/ },
  { id: 18, input: "我是大学生，想找一些提升自己的机会。", clarity: "模糊", answer: "主要找未来60天奖学金、实习、竞赛、训练营、志愿项目、交换项目和科研实践机会，优先国内和线上，排除培训广告。", subjectRe: /大学生/, typeRe: /奖学金|实习|竞赛|训练营|志愿|交换|科研|提升/ },
  { id: 19, input: "我们是一家 B2B SaaS 公司，准备出海东南亚，想找当地展会、创业扶持、渠道合作、政府招商和潜在代理商线索。", clarity: "清晰", answer: "", subjectRe: /B2B SaaS|SaaS/, typeRe: /东南亚|展会|创业扶持|渠道合作|政府招商|代理商|线索/ },
  { id: 20, input: "我们是一个手工饰品工作室，想找能卖货或者曝光的机会。", clarity: "模糊", answer: "主要找未来60天手工市集、买手店合作、展会摊位、电商平台活动、品牌联名和社媒曝光机会，优先国内，排除纯招商加盟广告。", subjectRe: /手工饰品工作室|手工饰品/, typeRe: /卖货|曝光|市集|买手店|展会|电商平台|品牌联名/ },
];

async function ensureDir(url) {
  await mkdir(dirname(fileURLToPath(url)), { recursive: true });
}

export async function loadGoldenResults() {
  try {
    const parsed = JSON.parse(await readFile(RESULT_FILE, "utf-8"));
    return Array.isArray(parsed.results) ? parsed.results : [];
  } catch {
    return [];
  }
}

async function saveGoldenResults(results) {
  await ensureDir(RESULT_FILE);
  await writeFile(RESULT_FILE, JSON.stringify({
    generatedAt: new Date().toISOString(),
    results: [...results].sort((a, b) => a.id - b.id),
  }, null, 2), "utf-8");
}

export class Golden20BrowserRunner {
  constructor({ tab, baseUrl = "http://localhost:3000" }) {
    this.tab = tab;
    this.baseUrl = baseUrl;
  }

  sleep(ms) {
    return this.tab.playwright.waitForTimeout(ms);
  }

  async pageState() {
    return this.tab.playwright.evaluate(() => {
      const profile = Array.from(document.querySelectorAll(".radar-profile-field")).map((el) => ({
        label: el.querySelector("span")?.textContent?.trim() || "",
        value: el.querySelector("strong")?.textContent?.trim() || "",
      }));
      const cards = Array.from(document.querySelectorAll(".watch-opportunity-card")).map((el) => ({
        text: el.textContent?.trim().replace(/\s+/g, " ") || "",
        title: el.querySelector(".card-header a, .card-header span:last-child")?.textContent?.trim() || "",
        href: el.querySelector("a")?.href || "",
      }));
      const markdown = document.querySelector("pre.watch-report-preview")?.textContent || "";
      const question = document.querySelector(".clarification-question span")?.textContent?.replace(/^\s*\d+\.\s*/, "").trim() || "";
      const title = document.querySelector(".watch-result-header h3, main h3")?.textContent?.trim() || "";
      return { text: document.body?.innerText || "", profile, cards, markdown, question, title, url: location.href };
    });
  }

  async waitFor(predicate, timeoutMs, label) {
    const start = Date.now();
    let last = null;
    while (Date.now() - start < timeoutMs) {
      last = await this.pageState();
      if (predicate(last)) return last;
      await this.sleep(1000);
    }
    throw new Error(`等待超时：${label}; last=${String(last?.text || "").slice(0, 260)}`);
  }

  async fillUnique(selector, value, label) {
    const loc = this.tab.playwright.locator(selector, {});
    const count = await loc.count();
    if (count !== 1) throw new Error(`${label || selector} count=${count}`);
    await loc.fill(value, { timeoutMs: 5000 });
  }

  async clickUnique(selector, label, timeoutMs = 5000) {
    const loc = this.tab.playwright.locator(selector, {});
    const count = await loc.count();
    if (count !== 1) throw new Error(`${label || selector} count=${count}`);
    await loc.click({ timeoutMs });
  }

  async api(path, options = {}) {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: options.method || "GET",
      headers: { "Content-Type": "application/json" },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    const json = await res.json().catch(() => ({}));
    if (!json.success) throw new Error(json.error?.message || `API ${path} failed status=${res.status}`);
    return json.data;
  }

  async ensureQuota() {
    const radars = await this.api("/api/radars?scope=mine");
    const active = (Array.isArray(radars) ? radars : []).filter((r) => r.isBuiltin !== true && r.status !== "archived");
    const result = { quotaFull: active.length >= 3, deleted: null, before: active.length, after: active.length, released: false };
    if (!result.quotaFull) return result;
    const target = [...active].sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")))[0];
    if (!target?.id) throw new Error("配额已满但没有可删除雷达");
    await this.api(`/api/radars/${encodeURIComponent(target.id)}`, { method: "DELETE", body: {} });
    const afterRadars = await this.api("/api/radars?scope=mine");
    result.deleted = { id: target.id, name: target.name, createdAt: target.createdAt };
    result.after = (Array.isArray(afterRadars) ? afterRadars : []).filter((r) => r.isBuiltin !== true && r.status !== "archived").length;
    result.released = result.after < result.before;
    return result;
  }

  async latestRadar() {
    const radars = await this.api("/api/radars?scope=mine");
    const active = (Array.isArray(radars) ? radars : []).filter((r) => r.isBuiltin !== true && r.status !== "archived");
    return active.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))[0] || null;
  }

  classify(result) {
    const serious = [];
    const partial = [];
    if (result.keyLeak) serious.push("疑似 API key 泄露");
    if (result.mockFallback) serious.push("live 路径疑似回退演示数据");
    if (result.overclaim) serious.push("报告把搜索发现包装成已核验事实");
    if (!result.saved) serious.push("保存长期雷达失败");
    if (!result.rerunSuccess) serious.push("再次盯机会失败");
    if (!result.secondReport) serious.push("第二份报告未生成");
    if (!result.profileSubjectOk) partial.push("主体识别不稳");
    if (!result.opportunityTypeOk) partial.push("机会类型不够合理");
    if (!result.searchRelevant) partial.push("搜索结果相关性不足");
    if (result.lowActionInCards) partial.push("低行动性页面进入重点机会卡");
    if (!result.cardsActionable) partial.push("机会卡行动价值不足");
    if (!result.reportSectionsOk) partial.push("报告可信度分区不完整");
    if (result.consoleErrorCount > 0) partial.push("控制台出现 error/warn");
    if (serious.length > 0) return { status: "失败", reason: serious.join("；"), suggestions: [...serious, ...partial] };
    if (partial.length > 0) return { status: "部分通过", reason: partial.join("；"), suggestions: partial };
    return { status: "通过", reason: "", suggestions: [] };
  }

  async runCase(id) {
    const c = GOLDEN_CASES.find((item) => item.id === id);
    if (!c) throw new Error(`Missing case ${id}`);
    const startedAt = new Date().toISOString();
    const result = {
      id: c.id,
      input: c.input,
      clarity: c.clarity,
      startedAt,
      triggeredClarification: false,
      question: "",
      profileSummary: "",
      profileSubjectOk: false,
      opportunityTypeOk: false,
      searchRelevant: false,
      lowActionInCards: false,
      cardsActionable: false,
      reportSectionsOk: false,
      saved: false,
      rerunSuccess: false,
      secondReport: false,
      quotaDeletion: null,
      consoleErrorCount: 0,
      consoleWarnings: [],
      cardCount: 0,
      cardTitles: [],
      reportCount: 0,
      failureReason: "",
      recommendations: [],
    };

    try {
      await this.tab.goto(`${this.baseUrl}/?live_search=1&golden_case=${c.id}`);
      await this.tab.playwright.waitForLoadState({ state: "domcontentloaded", timeoutMs: 10000 });
      await this.fillUnique("#home-input", c.input, "home input");
      await this.clickUnique("#home-watch-btn", "home watch button");
      let state = await this.waitFor((s) => s.text.includes("我还需要确认几个关键点") || s.text.includes("我理解你想建立这样的机会雷达") || s.text.includes("生成雷达画像失败"), 120000, `case ${c.id} profile`);
      let rounds = 0;
      while (state.text.includes("我还需要确认几个关键点") && rounds < 2) {
        result.triggeredClarification = true;
        result.question += (result.question ? " / " : "") + (state.question || "未提取到追问");
        if (c.answer) {
          await this.fillUnique("#clarification-answer", c.answer, "clarification answer");
          await this.clickUnique("#btn-submit-clarification", "submit clarification");
        } else {
          await this.clickUnique("#btn-continue-default", "continue default");
        }
        rounds += 1;
        state = await this.waitFor((s) => s.text.includes("我理解你想建立这样的机会雷达") || s.text.includes("我还需要确认几个关键点") || s.text.includes("生成雷达画像失败"), 120000, `case ${c.id} profile after clarification`);
        if (state.text.includes("我理解你想建立这样的机会雷达")) break;
      }
      if (!state.text.includes("我理解你想建立这样的机会雷达")) throw new Error("未进入画像确认卡");
      result.profileSummary = state.profile.map((p) => `${p.label}:${p.value}`).join("；");
      result.profileSubjectOk = c.subjectRe.test(result.profileSummary) || c.subjectRe.test(state.text);
      result.opportunityTypeOk = c.typeRe.test(result.profileSummary) || c.typeRe.test(state.text);

      await this.clickUnique("#btn-confirm-radar-profile", "confirm profile");
      state = await this.waitFor((s) => s.text.includes("机会卡片") || s.text.includes("Live 真实搜索失败") || s.text.includes("盯机会失败") || s.text.includes("本次真实搜索结果不足"), 300000, `case ${c.id} live result`);
      const initial = await this.pageState();
      const initialText = `${initial.text}\n${initial.markdown}`;
      result.cardCount = initial.cards.length;
      result.cardTitles = initial.cards.map((card) => card.title || card.text.slice(0, 60)).slice(0, 3);
      result.searchRelevant = initial.cards.length > 0 && (c.typeRe.test(initialText) || c.subjectRe.test(initialText) || /搜索发现|待复核|官方|采购|招标|赛事|征集|展会|合作|报名|申请|机会|项目|客户|线索/.test(initialText));
      result.lowActionInCards = initial.cards.some((card) => LOW_ACTION_RE.test(card.text));
      result.cardsActionable = initial.cards.some((card) => /建议动作|搜索发现来源|官方来源|截止时间|报名|申请|联系|采购|招标|征集|展会|合作|投稿|入口|待复核/.test(card.text));
      result.reportSectionsOk = REQUIRED_SECTIONS.every((section) => initial.markdown.includes(section));
      result.mockFallback = ACTUAL_MOCK_RE.test(initialText);
      result.overclaim = OVERCLAIM_RE.test(initial.markdown);
      result.keyLeak = KEY_LEAK_RE.test(initialText);
      if (!initial.text.includes("保存为长期雷达")) throw new Error("初始结果没有保存长期雷达按钮");

      result.quotaDeletion = await this.ensureQuota();
      await this.clickUnique("#btn-save-watch-radar", "save radar", 5000);
      state = await this.waitFor((s) => s.text.includes("已保存为长期雷达") || s.text.includes("保存失败") || s.text.includes("RADAR_QUOTA_EXCEEDED"), 300000, `case ${c.id} save`);
      result.saved = state.text.includes("已保存为长期雷达");
      if (!result.saved) throw new Error("保存长期雷达失败");

      const radar = await this.latestRadar();
      result.radarId = radar?.id || "";
      result.radarName = radar?.name || state.title || "";
      await this.clickUnique("#btn-back-to-radar-list", "back to radar list");
      await this.waitFor((s) => s.text.includes("我的雷达") && s.text.includes(result.radarName || "雷达"), 60000, `case ${c.id} my radars`);
      if (!result.radarId) throw new Error("保存后找不到 radarId");
      await this.clickUnique(`.radar-card[data-radar-id="${result.radarId}"] .btn-rerun-radar`, "rerun saved radar");
      state = await this.waitFor((s) => s.text.includes("已生成新报告") || s.text.includes("报告生成失败") || s.text.includes("真实搜索失败") || s.text.includes("结果不足"), 300000, `case ${c.id} rerun`);
      result.rerunSuccess = state.text.includes("已生成新报告") || state.text.includes("查看本次报告");
      const reports = await this.api(`/api/reports?radar_id=${encodeURIComponent(result.radarId)}`);
      result.reportCount = Array.isArray(reports) ? reports.length : 0;
      result.secondReport = result.reportCount >= 2;
      const logItems = await this.tab.dev.logs({ levels: ["error", "warn", "warning"], limit: 100 });
      const since = Date.parse(startedAt);
      const recent = (logItems || []).filter((item) => Date.parse(item.timestamp || "") >= since);
      result.consoleErrorCount = recent.length;
      result.consoleWarnings = recent.map((item) => `${item.level}: ${item.message}`).slice(0, 5);
    } catch (err) {
      result.failureReason = err instanceof Error ? err.message : String(err);
      try {
        const state = await this.pageState();
        const text = `${state.text}\n${state.markdown}`;
        result.keyLeak = KEY_LEAK_RE.test(text);
        result.mockFallback = ACTUAL_MOCK_RE.test(text);
        result.overclaim = OVERCLAIM_RE.test(text);
        result.cardCount = state.cards.length;
        result.cardTitles = state.cards.map((card) => card.title || card.text.slice(0, 60)).slice(0, 3);
      } catch {
        // keep original failure
      }
    }
    const grade = this.classify(result);
    result.status = result.failureReason && grade.status === "通过" ? "失败" : grade.status;
    result.failureReason = result.failureReason || grade.reason;
    result.recommendations = grade.suggestions.length > 0 ? grade.suggestions : ["继续观察 Golden 20 中的共性问题"];

    const existing = await loadGoldenResults();
    await saveGoldenResults(existing.filter((item) => item.id !== result.id).concat(result));
    return result;
  }
}

function countBy(results, status) {
  return results.filter((item) => item.status === status).length;
}

function yesNo(value) {
  return value ? "是" : "否";
}

function escapeCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\n+/g, " ").trim();
}

export function buildGolden20Report(results) {
  const sorted = [...results].sort((a, b) => a.id - b.id);
  const pass = countBy(sorted, "通过");
  const partial = countBy(sorted, "部分通过");
  const failed = countBy(sorted, "失败");
  const passRate = sorted.length ? `${Math.round((pass / sorted.length) * 100)}%` : "0%";
  const severe = sorted.filter((item) => item.status === "失败");
  const partials = sorted.filter((item) => item.status === "部分通过");
  const issueBuckets = [
    ["搜索相关性不足", sorted.filter((item) => /搜索结果相关性不足/.test(item.failureReason)).length],
    ["机会卡行动价值不足", sorted.filter((item) => /机会卡行动价值不足/.test(item.failureReason)).length],
    ["主体识别不稳", sorted.filter((item) => /主体识别不稳/.test(item.failureReason)).length],
    ["机会类型不合理", sorted.filter((item) => /机会类型不够合理/.test(item.failureReason)).length],
    ["低行动性结果进入卡片", sorted.filter((item) => item.lowActionInCards).length],
    ["保存或复跑失败", sorted.filter((item) => !item.saved || !item.rerunSuccess || !item.secondReport).length],
  ];
  const recommendN = pass >= 15 && partial <= 5 && failed <= 2;

  const lines = [
    "# Golden 20 User Simulation Report",
    "",
    `生成时间：${new Date().toISOString()}`,
    "",
    "## 1. 总体通过率",
    "",
    `- 样本数：${sorted.length}/20`,
    `- 强通过：${pass}`,
    `- 部分通过：${partial}`,
    `- 失败：${failed}`,
    `- 强通过率：${passRate}`,
    `- Q 通过标准：15 个以上强通过、部分通过不超过 5 个、严重失败不超过 2 个。`,
    `- 当前结论：${recommendN ? "达到进入 Milestone N/O 的门槛。" : "未达到进入 Milestone N/O 的门槛，应先修复共性问题后复测。"}`,
    "",
    "## 2. 20 个用户逐项记录表",
    "",
    "说明：`本轮释放的旧测试雷达` 只是测试配额满 3 个时，为继续测试而删除的旧测试雷达名称，与当前用户画像无关。",
    "",
    "| # | 原始输入 | 清晰度 | 追问 | 追问内容 | 画像摘要 | 主体正确 | 机会类型合理 | 搜索相关 | 低行动性进卡 | 卡片有行动价值 | 报告分区完整 | 保存成功 | 复跑成功 | 第二报告 | 本轮释放的旧测试雷达 | 控制台 error/warn | 结果 | 失败原因 | 改进建议 |",
    "|---:|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---:|---|---|---|",
    ...sorted.map((item) => [
      item.id,
      escapeCell(item.input),
      item.clarity,
      yesNo(item.triggeredClarification),
      escapeCell(item.question || "无"),
      escapeCell(item.profileSummary || "未记录"),
      yesNo(item.profileSubjectOk),
      yesNo(item.opportunityTypeOk),
      yesNo(item.searchRelevant),
      yesNo(item.lowActionInCards),
      yesNo(item.cardsActionable),
      yesNo(item.reportSectionsOk),
      yesNo(item.saved),
      yesNo(item.rerunSuccess),
      yesNo(item.secondReport),
      item.quotaDeletion?.deleted ? `是：${escapeCell(item.quotaDeletion.deleted.name)}` : "否",
      item.consoleErrorCount ?? 0,
      item.status,
      escapeCell(item.failureReason || "无"),
      escapeCell((item.recommendations || []).join("；")),
    ].join(" | ")).map((row) => `| ${row} |`),
    "",
    "## 3. 严重失败清单",
    "",
    severe.length === 0 ? "- 暂无严重失败。" : severe.map((item) => `- #${item.id}：${item.failureReason}`).join("\n"),
    "",
    "## 4. 部分通过清单",
    "",
    partials.length === 0 ? "- 暂无部分通过。" : partials.map((item) => `- #${item.id}：${item.failureReason}`).join("\n"),
    "",
    "## 5. 共性问题归类",
    "",
    ...issueBuckets.map(([label, count]) => `- ${label}：${count}`),
    "",
    "## 6. 建议修复优先级",
    "",
    "P0：不得出现 API key 泄露、mock 静默回退、搜索发现包装成已核验事实；本轮若出现需立即阻断。",
    "P1：提升非赛事行业 live query 规划和候选质量，尤其是婚庆、员工福利、研学文旅、活动布置、招生合作、手工饰品等 BD/订单类机会。",
    "P2：让机会卡更稳定地输出行动入口、下一步动作和待复核字段，避免只有泛资讯或泛搜索结果。",
    "P3：优化清晰需求的置信度判断，减少清晰样例被额外追问。",
    "",
    "## 7. 是否建议进入 Milestone N/O",
    "",
    recommendN
      ? "- 建议进入 Milestone N/O，同时把 Q 中部分通过问题列为 N/O 的 UX 与错误态收口项。"
      : "- 暂不建议进入 Milestone N/O。应先做一次 Live Search 质量和行业泛化修复，再重新跑 Golden 20。",
    "",
    "## 8. 是否建议进入阿里云测试站",
    "",
    recommendN
      ? "- 可以准备阿里云测试站，但 live LLM/live search 仍应默认关闭，仅给测试环境显式开关。"
      : "- 暂不建议进入阿里云测试站；当前更适合继续本地修复和复测，避免把不稳定 live 体验暴露给外部用户。",
    "",
  ];
  return lines.join("\n");
}

export async function writeGolden20Report(results) {
  const markdown = buildGolden20Report(results);
  await writeFile(REPORT_FILE, markdown, "utf-8");
  return fileURLToPath(REPORT_FILE);
}

export function goldenPaths() {
  return {
    root: fileURLToPath(ROOT),
    resultFile: fileURLToPath(RESULT_FILE),
    reportFile: fileURLToPath(REPORT_FILE),
  };
}
