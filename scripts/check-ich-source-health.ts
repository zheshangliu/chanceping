import fs from "node:fs";
import path from "node:path";
import type { IchOpportunityFile } from "../src/ich/types";

const inputPath = process.argv.includes("--input") ? process.argv[process.argv.indexOf("--input") + 1] : "data/ich/audit-merged.json";
const outputPath = process.argv.includes("--output") ? process.argv[process.argv.indexOf("--output") + 1] : "data/ich/source-health.json";
const file = JSON.parse(fs.readFileSync(path.resolve(inputPath), "utf8")) as IchOpportunityFile;
const timeoutMs = 8000;
const results = [] as Array<{ slug: string; url: string; status: number | null; ok: boolean; restricted?: boolean; error?: string }>;
async function main() {
const check = async (entry: (typeof file.entries)[number]) => {
  const url = entry.sources[0]?.url;
  if (!url) return;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response = await fetch(url, { method: "HEAD", redirect: "follow", signal: controller.signal, headers: { "user-agent": "ChancePing-ICH-SourceHealth/1.0" } });
    if ([403, 405, 500].includes(response.status)) {
      response = await fetch(url, { method: "GET", redirect: "follow", signal: controller.signal, headers: { "user-agent": "ChancePing-ICH-SourceHealth/1.0" } });
    }
    results.push({ slug: entry.slug, url, status: response.status, ok: response.status >= 200 && response.status < 400, restricted: response.status === 401 || response.status === 403 });
  } catch (error) {
    results.push({ slug: entry.slug, url, status: null, ok: false, error: error instanceof Error ? error.message : String(error) });
  } finally {
    clearTimeout(timeout);
  }
};
for (let i = 0; i < file.entries.length; i += 8) await Promise.all(file.entries.slice(i, i + 8).map(check));
const failed = results.filter((result) => !result.ok && !result.restricted);
const restricted = results.filter((result) => result.restricted);
const report = { input: inputPath, checked_at: new Date().toISOString(), total: results.length, accessible: results.length - failed.length, restricted: restricted.length, failed: failed.length, results };
fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
fs.writeFileSync(path.resolve(outputPath), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ input: inputPath, total: report.total, accessible: report.accessible, restricted: report.restricted, failed: report.failed, output: outputPath }, null, 2));
if (failed.length) process.exitCode = 1;
}
main();
