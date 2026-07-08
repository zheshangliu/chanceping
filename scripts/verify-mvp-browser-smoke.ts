import { spawn } from "child_process";
import fs from "fs";

process.env.DATA_MODE = process.env.DATA_MODE ?? "mock";
process.env.LLM_MODE = process.env.LLM_MODE ?? "mock";
process.env.PORT = process.env.PORT ?? "3100";

const port = Number(process.env.PORT);
const baseUrl = `http://127.0.0.1:${port}`;
let failed = 0;
let server: ReturnType<typeof spawn> | null = null;
let currentStage = "startup";

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

async function clearCustomRadarChats(): Promise<void> {
  const res = await fetch(`${baseUrl}/api/radar-chats?user_id=demo_user&include_archived=true`);
  const json = await res.json() as { success?: boolean; data?: Array<{ id: string; radarId?: string; status?: string }> };
  if (!json.success || !Array.isArray(json.data)) return;
  for (const chatWindow of json.data) {
    if (!chatWindow.id || chatWindow.status === "archived") continue;
    if (chatWindow.id === "ai-event-sample-room" || chatWindow.radarId === "ai-event-sample-room") continue;
    await fetch(`${baseUrl}/api/radar-chats/${chatWindow.id}`, { method: "DELETE" });
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

  currentStage = "wait for server";
  await waitForServer();
  currentStage = "clear custom radars";
  await clearCustomRadars();
  currentStage = "clear custom radar chats";
  await clearCustomRadarChats();

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

    currentStage = "open home";
    await page.goto(baseUrl, { waitUntil: "networkidle0" });
    currentStage = "wait hero root";
    await page.waitForSelector("#hero-radar-chat-root", { timeout: 5_000 });
    const titleText = await page.$eval(".home-title", (el: any) => el.textContent || "");
    if (!titleText.includes("AI 赛事雷达")) fail("home should focus the AI event radar demo");
    const examplesHidden = await page.$eval(".home-examples-block", (el: any) => Boolean(el.hidden));
    if (!examplesHidden) fail("legacy multi-template examples should be hidden on hero path");
    const bodyText = await page.$eval("body", (el: any) => el.textContent || "");
    if (bodyText.includes("需求确认 搜索 机会库 报告 编辑器") || bodyText.includes("DSL 规则编辑器")) {
      fail("customer home text is polluted by hidden legacy modules");
    }

    currentStage = "type home prompt";
    await page.type("#home-input", "我是个人开发者，想找 AI 比赛机会，帮我盯一下。");
    currentStage = "click start drawing radar";
    await page.click("#home-watch-btn");
    currentStage = "wait chat input after home start";
    await page.waitForSelector("#hero-radar-chat-input", { timeout: 5_000 });
    currentStage = "manual send first prompt";
    await page.click("#hero-radar-chat-send");
    currentStage = "wait first radar artifact";
    await page.waitForSelector(".hero-radar-artifact[data-hero-radar-version]", { timeout: 10_000 });
    let heroText = await page.$eval("#hero-radar-chat-root", (el: any) => el.textContent || "");
    const firstVersions = await page.$$eval(".hero-radar-artifact[data-hero-radar-version]", (items: any[]) => items.map((item) => item.getAttribute("data-hero-radar-version") || ""));
    const firstVersion = firstVersions[firstVersions.length - 1] || "";
    if (!heroText.includes("机会雷达") || !/^V\d+\.\d+$/.test(firstVersion)) fail(`chat should show a radar version artifact: ${firstVersion}`);
    if (heroText.includes("[object Object]")) fail("radar artifact should not expose raw object text");
    const modalButtonVisible = await page.$$eval("[data-action='open-radar-modal']", (items: any[]) => items.length);
    if (modalButtonVisible < 1) fail("radar artifact should expose centered modal button");
    currentStage = "open radar modal";
    await page.click("[data-action='open-radar-modal']");
    currentStage = "wait radar modal";
    await page.waitForSelector(".hero-artifact-modal[open]", { timeout: 5_000 });
    const modalBox = await page.$eval(".hero-artifact-modal[open]", (el: any) => {
      const rect = el.getBoundingClientRect();
      const viewport = globalThis as any;
      return {
        centerOffsetX: Math.abs(rect.left + rect.width / 2 - viewport.innerWidth / 2),
        centerOffsetY: Math.abs(rect.top + rect.height / 2 - viewport.innerHeight / 2),
      };
    });
    if (modalBox.centerOffsetX > 12 || modalBox.centerOffsetY > 12) fail("radar modal should be centered in viewport");
    currentStage = "close radar modal";
    await page.click("[data-action='close-hero-modal']");
    currentStage = "wait radar modal closed";
    await page.waitForSelector(".hero-artifact-modal[open]", { hidden: true, timeout: 5_000 });

    currentStage = "type OPC correction";
    await page.type("#hero-radar-chat-input", "我不是学生，我是 OPC 创业者，优先奖金、云资源、能上架展示的比赛。");
    currentStage = "send OPC correction";
    await page.click("#hero-radar-chat-send");
    currentStage = "wait OPC revision";
    await page.waitForFunction((previousVersion: string) => {
      const doc = (globalThis as any).document;
      const versions = Array.from(doc.querySelectorAll(".hero-radar-artifact[data-hero-radar-version]")).map((item: any) => item.getAttribute("data-hero-radar-version") || "");
      const latestVersion = versions[versions.length - 1] || "";
      const text = doc.querySelector("#hero-radar-chat-root")?.textContent || "";
      return latestVersion !== "" && latestVersion !== previousVersion && text.includes("OPC");
    }, { timeout: 10_000 }, firstVersion);
    heroText = await page.$eval("#hero-radar-chat-root", (el: any) => el.textContent || "");
    if (!heroText.includes("OPC") || !heroText.includes("本次主要修改")) fail("chat should show a revised diff with OPC correction");
    const opcVersions = await page.$$eval(".hero-radar-artifact[data-hero-radar-version]", (items: any[]) => items.map((item) => item.getAttribute("data-hero-radar-version") || ""));
    const opcVersion = opcVersions[opcVersions.length - 1] || "";

    currentStage = "type registration correction";
    await page.type("#hero-radar-chat-input", "不要展会资讯，我要能报名、能提交作品的比赛。");
    currentStage = "send registration correction";
    await page.click("#hero-radar-chat-send");
    currentStage = "wait registration revision";
    await page.waitForFunction((previousVersion: string) => {
      const doc = (globalThis as any).document;
      const versions = Array.from(doc.querySelectorAll(".hero-radar-artifact[data-hero-radar-version]")).map((item: any) => item.getAttribute("data-hero-radar-version") || "");
      const latestVersion = versions[versions.length - 1] || "";
      const text = doc.querySelector("#hero-radar-chat-root")?.textContent || "";
      return latestVersion !== "" && latestVersion !== previousVersion && text.includes("展会") && text.includes("报名");
    }, { timeout: 10_000 }, opcVersion);
    heroText = await page.$eval("#hero-radar-chat-root", (el: any) => el.textContent || "");
    if (!heroText.includes("展会") || !heroText.includes("报名")) fail("chat should show a revised diff for expo exclusion and registration focus");
    const confirmButtonCount = await page.$$eval(".hero-confirm-radar-btn", (items: any[]) => items.length);
    if (confirmButtonCount !== 1) fail(`only latest radar version should be confirmable: ${confirmButtonCount}`);

    currentStage = "confirm latest radar";
    const clickedConfirm = await clickButtonByText(page, "确认，按");
    if (!clickedConfirm) fail("latest confirm button not clickable");
    currentStage = "wait progress or report artifact";
    await page.waitForFunction(() => {
      const doc = (globalThis as any).document;
      return Boolean(doc.querySelector(".hero-progress-artifact") || doc.querySelector(".hero-report-artifact"));
    }, { timeout: 15_000 });
    currentStage = "wait progress ticker or report";
    await page.waitForFunction(() => {
      const doc = (globalThis as any).document;
      const text = doc.querySelector(".hero-progress-artifact")?.textContent || "";
      return Boolean(doc.querySelector(".hero-report-artifact")) || text.includes("Serper") || text.includes("搜索计划") || text.includes("网页读取") || text.includes("Qwen");
    }, { timeout: 15_000 });
    currentStage = "wait report artifact";
    await page.waitForSelector(".hero-report-artifact", { timeout: 20_000 });
    const reportText = await page.$eval(".hero-report-artifact", (el: any) => el.textContent || "");
    if (!reportText.includes("查看本次机会卡")) fail("chat report artifact missing view-cards action");
    if (!reportText.includes("Markdown") && !reportText.includes("机会雷达报告")) fail("chat report artifact missing markdown report text");
    const summaryText = await page.$eval(".hero-report-summary", (el: any) => el.textContent || "");
    if (!summaryText.includes("有效机会") && !summaryText.includes("本次搜索")) fail("report artifact should show concise summary");
    const reportModalButtons = await page.$$eval("[data-action='open-report-modal']", (items: any[]) => items.length);
    if (reportModalButtons < 1) fail("report artifact should expose centered markdown modal button");

    currentStage = "click view cards";
    const clickedCards = await clickButtonByText(page, "查看本次机会卡");
    if (!clickedCards) fail("view cards button not clickable");
    currentStage = "wait watch result panel";
    await page.waitForSelector("#panel-watch-result.active", { timeout: 10_000 });
    currentStage = "wait opportunity cards";
    await page.waitForSelector(".watch-opportunity-card", { timeout: 10_000 });
    const cards = await page.$$eval(".watch-opportunity-card", (items: any[]) => items.length);
    if (cards < 1) fail(`expected at least one opportunity card: ${cards}`);
    const resultText = await page.$eval("#panel-watch-result", (el: any) => el.textContent || "");
    if (!resultText.includes("保存为长期雷达，之后持续盯")) fail("result page missing save-as-long-term-radar action");
    if (!resultText.includes("报告摘要")) fail("result page missing report summary");
    if (!resultText.includes("机会管道看板") || !resultText.includes("立即行动") || !resultText.includes("复核资格")) {
      fail("result page should present opportunity pipeline board");
    }

    currentStage = "save long-term radar";
    await page.click("#btn-save-watch-radar");
    currentStage = "wait save success actions";
    await page.waitForSelector("#btn-back-to-radar-list", { timeout: 15_000 });
    const savedResultText = await page.$eval("#panel-watch-result", (el: any) => el.textContent || "");
    if (!savedResultText.includes("查看本次雷达详情") || !savedResultText.includes("返回我的雷达列表")) {
      fail("save success should offer detail and list choices");
    }
    currentStage = "back to radar list";
    await page.click("#btn-back-to-radar-list");
    currentStage = "wait radar list";
    await page.waitForSelector("#panel-radars.active", { timeout: 10_000 });
    await page.waitForSelector("#radars-list-view .radar-command-card", { visible: true, timeout: 10_000 });
    await page.waitForSelector("#radars-list-view .radar-command-card .btn-edit-radar", { visible: true, timeout: 10_000 });
    await page.waitForSelector("#radars-list-view .radar-command-card .btn-view-radar-detail", { visible: true, timeout: 10_000 });
    const radarPanelText = await page.$eval("#radars-list-view", (el: any) => el.innerText || el.textContent || "");
    if (!radarPanelText.includes("编辑雷达") || !radarPanelText.includes("查看机会和报告")) {
      fail("saved hero radar missing customer-facing edit/result actions");
    }
    const rerunButtonCount = await page.$$eval("#radars-list-view .radar-command-card .btn-rerun-radar", (items: any[]) => items.length);
    if (rerunButtonCount < 1 && !radarPanelText.includes("全球 AI 赛事导航")) {
      fail("my radar page should show either a custom rerunnable radar or the public AI events navigator bridge");
    }
    if (!radarPanelText.includes("情报流指挥台") || !radarPanelText.includes("版本") || !radarPanelText.includes("本次新增")) {
      fail("my radar page should present intelligence command center summary");
    }
    if (radarPanelText.includes("OPC 政策雷达") || radarPanelText.includes("文创非遗雷达")) {
      fail("my radar list exposes builtin templates");
    }
  } finally {
    await browser.close();
  }
}

main()
  .catch((err) => fail(`${currentStage}: ${err instanceof Error ? err.message : String(err)}`))
  .finally(() => {
    if (server) server.kill();
    process.exit(failed > 0 ? 1 : 0);
  });
