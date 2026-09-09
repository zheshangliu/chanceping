import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer";

const baseUrl = process.env.ICH_UI_BASE_URL ?? "http://127.0.0.1:8787";
const outputDir = path.resolve("audits/ich/ui/latest");

type Capture = { name: string; path: string; width: number; height: number };

const captures: Capture[] = [
  { name: "home-desktop", path: "/ich", width: 1440, height: 1200 },
  { name: "home-mobile", path: "/ich", width: 390, height: 844 },
  { name: "overseas-desktop", path: "/ich?region=GLOBAL", width: 1440, height: 1200 },
  { name: "procurement-desktop", path: "/ich?category=procurement_project", width: 1440, height: 900 },
  { name: "procurement-mobile", path: "/ich?category=procurement_project", width: 390, height: 844 },
  { name: "memo-desktop", path: "/ich/memo", width: 1440, height: 1200 },
  { name: "memo-mobile", path: "/ich/memo", width: 390, height: 844 },
  { name: "source-manager", path: "/opportunity-v2/admin/sources", width: 1440, height: 1200 },
];

async function main(): Promise<void> {
  fs.mkdirSync(outputDir, { recursive: true });
  const radar = await fetch(`${baseUrl}/api/opportunity-v2/radar?category=competition`).then((response) => response.json()) as { opportunities: Array<{ id: string }> };
  const detailId = radar.opportunities[0]?.id;
  if (!detailId) throw new Error("No current competition found for detail screenshot");
  captures.push({ name: "competition-detail", path: `/ich/opportunities/${encodeURIComponent(detailId)}`, width: 1440, height: 1200 });
  const browser = await puppeteer.launch({ headless: true, executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", pipe: false, args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", "--disable-dev-shm-usage"] });
  const overflow: Record<string, boolean> = {};
  try {
    for (const capture of captures) {
      const page = await browser.newPage();
      await page.setViewport({ width: capture.width, height: capture.height, deviceScaleFactor: 1 });
      const response = await page.goto(`${baseUrl}${capture.path}`, { waitUntil: "networkidle0", timeout: 30000 });
      const status = response ? (response as unknown as { status(): number }).status() : null;
      if (!response || (status !== null && status >= 400)) throw new Error(`${capture.path} returned ${status ?? "no response"}`);
      await page.waitForSelector("main", { timeout: 10000 });
      overflow[capture.name] = await page.evaluate(() => {
        const runtime = globalThis as unknown as { document: { documentElement: { scrollWidth: number } }; window: { innerWidth: number } };
        return runtime.document.documentElement.scrollWidth > runtime.window.innerWidth + 1;
      });
      await page.screenshot({ path: path.join(outputDir, `${capture.name}.png`), fullPage: true });
      await page.close();
    }
  } finally {
    await browser.close();
  }
  const visualPath = path.join(outputDir, "visual-checks.json");
  const visual = JSON.parse(fs.readFileSync(visualPath, "utf8")) as Record<string, unknown>;
  visual.horizontal_overflow = overflow;
  visual.captured_at = new Date().toISOString();
  fs.writeFileSync(visualPath, `${JSON.stringify(visual, null, 2)}\n`);
  const manifestPath = path.join(outputDir, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
  manifest.screenshot_status = "captured-and-inspected";
  manifest.screenshots = captures.map((capture) => `audits/ich/ui/latest/${capture.name}.png`);
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const reportPath = path.resolve("reports/ich/v21/ui-audit.json");
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8")) as Record<string, unknown>;
  report.visualChecks = visual;
  report.manifest = manifest;
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ captured: captures.map((capture) => capture.name), horizontal_overflow: overflow }, null, 2));
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
