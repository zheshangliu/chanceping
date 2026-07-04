import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

process.env.DATA_MODE = process.env.DATA_MODE ?? "mock";
process.env.LLM_MODE = process.env.LLM_MODE ?? "mock";
process.env.PORT = process.env.PORT ?? "3107";

const port = Number(process.env.PORT);
const baseUrl = `http://127.0.0.1:${port}`;
const outDir = path.resolve(process.cwd(), "reports", "ui-audit", "screenshots", "q7-ai-event-radar");
let server: ReturnType<typeof spawn> | null = null;

async function waitForServer(): Promise<void> {
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

async function main(): Promise<void> {
  let puppeteer: any;
  try {
    puppeteer = (await import("puppeteer")).default;
  } catch {
    console.log("SKIP puppeteer not installed; screenshots not captured");
    return;
  }

  fs.mkdirSync(outDir, { recursive: true });
  server = spawn("./node_modules/.bin/tsx", ["src/api/server.ts"], {
    env: {
      ...process.env,
      PORT: String(port),
      DATA_MODE: "mock",
      LLM_MODE: "mock",
      STORE_TYPE: "meili",
      MEILI_MOCK: "true",
    },
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
