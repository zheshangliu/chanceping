import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const docs = path.join(root, "docs/ich");
const matrixPath = path.join(docs, "stage5a-batch4-source-coverage-matrix.md");
const healthPath = path.join(docs, "stage5a-batch4-source-health.json");
const seeds = [
  "https://www.shejijingsai.com/",
  "https://www.cnyisai.com/",
  "http://www.yishujs.com/h-col-104.html",
  "http://www.yishujs.com/sys-nd/5398.html",
  "https://ich.unesco.org/en/home",
  "http://www.unescogov.com/",
  "https://www.ihchina.cn/",
  "https://competition.design/",
  "https://bhuntr.com/tw",
  "https://www.ncda.org.cn/",
  "https://www.ichaward.com/competition-front/home",
] as const;
const allowedStatuses = new Set(["FULLY_INTEGRATED", "DISCOVERY_ONLY", "NEEDS_INTEGRATION", "BROKEN", "LOW_VALUE", "NOT_SUITABLE"]);
const errors: string[] = [];
if (!fs.existsSync(matrixPath)) errors.push("source coverage matrix is missing");
if (!fs.existsSync(healthPath)) errors.push("source health JSON is missing");
const matrix = fs.existsSync(matrixPath) ? fs.readFileSync(matrixPath, "utf8") : "";
for (const seed of seeds) if (!matrix.includes(seed)) errors.push(`seed source missing from matrix: ${seed}`);
const health = fs.existsSync(healthPath) ? JSON.parse(fs.readFileSync(healthPath, "utf8")) as { sources?: Array<{ source?: string; status?: string }> } : {};
if (!Array.isArray(health.sources) || health.sources.length !== seeds.length) errors.push(`source health rows ${health.sources?.length ?? 0} != ${seeds.length}`);
const healthSources = new Set((health.sources ?? []).map((row) => row.source));
for (const seed of seeds) if (!healthSources.has(seed)) errors.push(`seed source missing from health JSON: ${seed}`);
for (const row of health.sources ?? []) if (!row.status || !allowedStatuses.has(row.status)) errors.push(`invalid source status for ${row.source ?? "unknown"}: ${row.status ?? "missing"}`);
if (!matrix.includes("Candidate Yield") || !matrix.includes("Official Backtrace")) errors.push("matrix is missing required audit columns");
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
const statusCounts = (health.sources ?? []).reduce<Record<string, number>>((acc, row) => {
  acc[row.status ?? "unknown"] = (acc[row.status ?? "unknown"] ?? 0) + 1;
  return acc;
}, {});
console.log(JSON.stringify({ pass: true, seed_sources: seeds.length, status_counts: statusCounts }, null, 2));
