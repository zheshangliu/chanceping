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
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(baseUrl);
      if (res.ok) return;
    } catch {
      // wait and retry
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`server not ready at ${baseUrl}`);
}

async function clearCustomRadars(): Promise<void> {
  const res = await fetch(`${baseUrl}/api/radars`);
  const json = await res.json() as { success?: boolean; data?: Array<{ id: string; kind?: string; isBuiltin?: boolean }> };
  if (!json.success || !Array.isArray(json.data)) return;
  for (const radar of json.data) {
    if (radar.id && radar.kind === "custom" && radar.isBuiltin !== true) {
      await fetch(`${baseUrl}/api/radars/${radar.id}`, { method: "DELETE" });
    }
  }
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
    env: { ...process.env, PORT: String(port), DATA_MODE: "mock", LLM_MODE: "mock", STORE_TYPE: "meili", MEILI_MOCK: "true" },
    stdio: "ignore",
  });

  await waitForServer();
  await clearCustomRadars();

  const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const browser = await puppeteer.launch({
    headless: "new",
    ...(fs.existsSync(chromePath) ? { executablePath: chromePath } : {}),
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  try {
    const page = await browser.newPage();
    await page.goto(baseUrl, { waitUntil: "networkidle0" });
    await page.waitForSelector("#home-watch-btn", { timeout: 5_000 });
    const titleText = await page.$eval(".home-title", (el: any) => el.textContent || "");
    if (!titleText.includes("告诉我你想盯什么机会")) fail("home title not polished");

    // 1. 新角色短需求：保留身份并进入自然澄清。
    await page.type("#home-input", "我是围棋选手");
    await page.click("#home-watch-btn");
    await page.waitForSelector("#btn-submit-clarification", { timeout: 10_000 });
    const clarificationText = await page.$eval(".clarification-card", (el: any) => el.textContent || "");
    if (!clarificationText.includes("我还需要确认几个关键点")) fail("clarification gate title missing");
    const questionCount = await page.$$eval(".clarification-question", (items: any[]) => items.length);
    if (questionCount !== 1) fail(`clarification should show one natural question: ${questionCount}`);
    if (!clarificationText.includes("你主要想盯哪些围棋机会") || !clarificationText.includes("职业定段赛")) {
      fail("go player did not receive the expected natural opportunity question");
    }
    await page.type("#clarification-answer", "我想盯未来30天内国内外可报名的围棋公开赛、职业定段赛和奖金赛事，优先看中国围棋协会官网，排除培训广告");
    await page.click("#btn-submit-clarification");
    await page.waitForSelector("#btn-confirm-radar-profile", { timeout: 10_000 });
    const profileText = await page.$eval(".radar-profile-card", (el: any) => el.textContent || "");
    if (!profileText.includes("我理解你想建立这样的机会雷达")) fail("profile card title missing");
    if (!profileText.includes("围棋选手")) fail("clarified profile missing go player identity");
    if (!profileText.includes("围棋公开赛") && !profileText.includes("围棋比赛")) fail("clarified profile missing go opportunities");
    if (profileText.includes("RPA") || profileText.includes("AI 赛事")) fail("go profile fell back to a fixed vertical");
    if (profileText.includes("provider") || profileText.includes("source_strategy")) fail("profile card leaks technical fields");
    await page.click("#btn-confirm-radar-profile");
    await page.waitForSelector(".watch-opportunity-card", { timeout: 15_000 });
    await page.waitForSelector(".report-summary", { timeout: 5_000 });
    await page.waitForSelector(".markdown-details", { timeout: 5_000 });
    const saveText = await page.$eval("#btn-save-watch-radar", (el: any) => el.textContent || "");
    if (!saveText.includes("保存为长期雷达，之后持续盯")) fail("save button copy missing");
    await page.click(".markdown-details summary");
    const reportText = await page.$eval(".watch-report-preview", (el: any) => el.textContent || "");
    if (!reportText.includes("## 1. 雷达画像")) fail("report missing radar profile section");
    if (!reportText.includes("指定信号源")) fail("report missing source hints");
    if (!reportText.includes("## 7. 来源与检查回执") && !reportText.includes("## 7. 来源索引")) {
      fail("report missing source coverage section");
    }
    await page.click("#btn-save-watch-radar");
    await page.waitForSelector("#panel-radars.active", { timeout: 15_000 });
    await page.waitForFunction(() => {
      const doc = (globalThis as any).document;
      const text = doc.querySelector("#panel-radars")?.textContent || "";
      return text.includes("查看机会和报告") || text.includes("再次盯机会");
    }, { timeout: 10_000 });
    const radarPanelText = await page.$eval("#panel-radars", (el: any) => el.textContent || "");
    if (!radarPanelText.includes("查看机会和报告")) fail("my radar list missing detail entry copy");
    if (!radarPanelText.includes("再次盯机会")) fail("my radar list missing rerun copy");
    if (radarPanelText.includes("AI 赛事雷达") || radarPanelText.includes("OPC 政策雷达") || radarPanelText.includes("文创非遗雷达")) {
      fail("my radar list exposes builtin templates");
    }
    const userRadarCount = await page.$$eval('.radar-card[data-kind="custom"]', (items: any[]) => items.length);
    if (userRadarCount !== 1) fail(`my radar list should contain one saved custom radar: ${userRadarCount}`);
    const detailButton = await page.$('.radar-card[data-kind="custom"] .btn-view-radar-detail, .radar-card[data-kind="custom"] .btn-detail');
    if (!detailButton) {
      fail("my radar list missing detail button");
    } else {
      await detailButton.click();
      await page.waitForSelector("#radar-detail-view", { timeout: 10_000 });
      await page.waitForFunction(async () => {
        const browserGlobal = globalThis as any;
        await new Promise((resolve) => browserGlobal.requestAnimationFrame(() => browserGlobal.requestAnimationFrame(resolve)));
        const opportunityCount = browserGlobal.document.querySelectorAll("#radar-stored-opportunity-list .opp-card").length;
        const reportCount = browserGlobal.document.querySelectorAll("#radar-report-history-list tbody tr").length;
        return opportunityCount > 0 && reportCount > 0;
      }, { timeout: 10_000 });
      const detailCounts = await page.evaluate(() => ({
        opportunities: (globalThis as any).document.querySelectorAll("#radar-stored-opportunity-list .opp-card").length,
        reports: (globalThis as any).document.querySelectorAll("#radar-report-history-list tbody tr").length,
      }));
      if (detailCounts.opportunities < 1) fail("radar detail missing stored opportunities");
      if (detailCounts.reports < 1) fail("radar detail missing report history");
    }

    // 2. 清楚需求：直接生成画像确认卡。
    await page.goto(baseUrl, { waitUntil: "networkidle0" });
    await page.type("#home-input", "我是乒乓球选手，想盯未来30天内国内外可报名的乒乓球比赛，优先看 ITTF、WTT、中国乒协官网，排除培训广告");
    await page.click("#home-watch-btn");
    await page.waitForSelector("#btn-confirm-radar-profile", { timeout: 10_000 });
    const directHasClarification = await page.$(".clarification-card");
    if (directHasClarification) fail("clear requirement should not show clarification gate");

    // 3. 模板路径：直接出结果，并允许调整画像。
    await page.goto(baseUrl, { waitUntil: "networkidle0" });
    await page.waitForSelector('[data-template-id="ai_events"]', { timeout: 5_000 });
    await page.click('[data-template-id="ai_events"]');
    await page.click("#home-watch-btn");
    await page.waitForSelector(".watch-opportunity-card", { timeout: 15_000 });
    await page.waitForSelector("#btn-adjust-watch-profile", { timeout: 5_000 });
    await page.click("#btn-adjust-watch-profile");
    await page.waitForSelector("#btn-confirm-radar-profile", { timeout: 10_000 });

    // 4. 我的雷达卡片软删除并释放配额。
    await page.goto(baseUrl, { waitUntil: "networkidle0" });
    await page.click('[data-tab="radars"]');
    await page.waitForSelector(".btn-delete-radar", { timeout: 10_000 });
    page.once("dialog", async (dialog: any) => dialog.accept());
    await page.click(".btn-delete-radar");
    await page.waitForSelector(".radar-empty-state", { timeout: 10_000 });
    const emptyText = await page.$eval(".radar-empty-state", (el: any) => el.textContent || "");
    if (!emptyText.includes("还没有保存长期雷达") || !emptyText.includes("回首页建立雷达")) {
      fail("my radar empty state is missing guidance");
    }
    await page.waitForFunction(
      () => (((globalThis as any).document.querySelector("#radar-quota-bar")?.textContent || "").includes("0/3")),
      { timeout: 10_000 },
    );
  } finally {
    await browser.close();
  }
}

main()
  .catch((err) => fail(err instanceof Error ? err.message : String(err)))
  .finally(() => {
    if (server) server.kill();
    process.exit(failed > 0 ? 1 : 0);
  });
