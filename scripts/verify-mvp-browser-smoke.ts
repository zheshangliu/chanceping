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

async function clickButtonByText(page: any, text: string): Promise<boolean> {
  return await page.evaluate((label: string) => {
    const doc = (globalThis as any).document;
    const buttons = Array.from(doc.querySelectorAll("button")) as any[];
    const button = buttons.find((item) => (item.textContent || "").includes(label));
    if (!button) return false;
    button.click();
    return true;
  }, text);
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
    page.on("pageerror", (err: Error) => fail(`console pageerror: ${err.message}`));
    page.on("console", (msg: any) => {
      if (msg.type() === "error" && !msg.text().includes("Failed to load resource")) {
        fail(`console error: ${msg.text()}`);
      }
    });

    await page.goto(baseUrl, { waitUntil: "networkidle0" });
    await page.waitForSelector("#hero-radar-chat-root", { timeout: 5_000 });
    const titleText = await page.$eval(".home-title", (el: any) => el.textContent || "");
    if (!titleText.includes("AI 创业者机会雷达")) fail("home should focus the AI entrepreneur hero demo");
    const examplesHidden = await page.$eval(".home-examples-block", (el: any) => Boolean(el.hidden));
    if (!examplesHidden) fail("legacy multi-template examples should be hidden on hero path");
    const bodyText = await page.$eval("body", (el: any) => el.textContent || "");
    if (bodyText.includes("需求确认 搜索 机会库 报告 编辑器") || bodyText.includes("DSL 规则编辑器")) {
      fail("customer home text is polluted by hidden legacy modules");
    }

    await page.type("#home-input", "我是个人开发者，想找 AI 比赛机会，帮我盯一下。");
    await page.click("#home-watch-btn");
    await page.waitForSelector('[data-hero-radar-version="V1.0"]', { timeout: 10_000 });
    let heroText = await page.$eval("#hero-radar-chat-root", (el: any) => el.textContent || "");
    if (!heroText.includes("Radar Artifact") || !heroText.includes("V1.0")) fail("chat should show Radar V1.0 artifact");

    await page.type("#hero-radar-chat-input", "我不是学生，我是 OPC 创业者，优先奖金、云资源、能上架展示的比赛。");
    await page.click("#hero-radar-chat-send");
    await page.waitForSelector('[data-hero-radar-version="V1.1"]', { timeout: 10_000 });
    heroText = await page.$eval("#hero-radar-chat-root", (el: any) => el.textContent || "");
    if (!heroText.includes("OPC") || !heroText.includes("本次版本变化")) fail("chat should show V1.1 diff with OPC correction");

    await page.type("#hero-radar-chat-input", "不要展会资讯，我要能报名、能提交作品的比赛。");
    await page.click("#hero-radar-chat-send");
    await page.waitForSelector('[data-hero-radar-version="V1.2"]', { timeout: 10_000 });
    heroText = await page.$eval("#hero-radar-chat-root", (el: any) => el.textContent || "");
    if (!heroText.includes("展会") || !heroText.includes("报名")) fail("chat should show V1.2 diff for expo exclusion and registration focus");

    await page.evaluate(() => {
      const doc = (globalThis as any).document;
      const buttons = Array.from(doc.querySelectorAll(".hero-confirm-radar-btn")) as any[];
      buttons[buttons.length - 1]?.click();
    });
    await page.waitForSelector(".hero-report-artifact", { timeout: 20_000 });
    const reportText = await page.$eval(".hero-report-artifact", (el: any) => el.textContent || "");
    if (!reportText.includes("查看本次机会卡")) fail("chat report artifact missing view-cards action");
    if (!reportText.includes("Markdown") && !reportText.includes("机会雷达报告")) fail("chat report artifact missing markdown report text");

    const clickedCards = await clickButtonByText(page, "查看本次机会卡");
    if (!clickedCards) fail("view cards button not clickable");
    await page.waitForSelector("#panel-watch-result.active", { timeout: 10_000 });
    await page.waitForSelector(".watch-opportunity-card", { timeout: 10_000 });
    const cards = await page.$$eval(".watch-opportunity-card", (items: any[]) => items.length);
    if (cards < 1) fail(`expected at least one opportunity card: ${cards}`);
    const resultText = await page.$eval("#panel-watch-result", (el: any) => el.textContent || "");
    if (!resultText.includes("保存为长期雷达，之后持续盯")) fail("result page missing save-as-long-term-radar action");
    if (!resultText.includes("报告摘要")) fail("result page missing report summary");

    await page.click("#btn-save-watch-radar");
    await page.waitForSelector("#btn-back-to-radar-list", { timeout: 15_000 });
    const savedResultText = await page.$eval("#panel-watch-result", (el: any) => el.textContent || "");
    if (!savedResultText.includes("查看本次雷达详情") || !savedResultText.includes("返回我的雷达列表")) {
      fail("save success should offer detail and list choices");
    }
    await page.click("#btn-back-to-radar-list");
    await page.waitForSelector("#panel-radars.active", { timeout: 10_000 });
    await page.waitForFunction(() => {
      const doc = (globalThis as any).document;
      const text = doc.querySelector("#panel-radars")?.textContent || "";
      return text.includes("查看机会和报告") || text.includes("再次盯机会");
    }, { timeout: 10_000 });
    const radarPanelText = await page.$eval("#panel-radars", (el: any) => el.textContent || "");
    if (!radarPanelText.includes("再次盯机会")) fail("saved hero radar missing rerun action");
    if (radarPanelText.includes("AI 赛事雷达") || radarPanelText.includes("OPC 政策雷达") || radarPanelText.includes("文创非遗雷达")) {
      fail("my radar list exposes builtin templates");
    }
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
