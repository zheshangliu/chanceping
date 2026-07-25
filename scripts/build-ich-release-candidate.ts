import fs from "node:fs";
import path from "node:path";
import type { IchOpportunityFile } from "../src/ich/types";

const inputPath = process.argv.includes("--input") ? process.argv[process.argv.indexOf("--input") + 1] : "data/ich/expansion-all.json";
const healthPath = process.argv.includes("--health") ? process.argv[process.argv.indexOf("--health") + 1] : "data/ich/source-health.json";
const outputPath = process.argv.includes("--output") ? process.argv[process.argv.indexOf("--output") + 1] : "data/ich/release-candidate.json";
const file = JSON.parse(fs.readFileSync(path.resolve(inputPath), "utf8")) as IchOpportunityFile;
const health = JSON.parse(fs.readFileSync(path.resolve(healthPath), "utf8")) as { results: Array<{ slug: string; ok: boolean; restricted?: boolean }> };
const healthy = new Set(health.results.filter((item) => item.ok || item.restricted).map((item) => item.slug));
const genericRoots = ["https://www.mct.gov.cn/whzx/ggtz/", "https://www.ihchina.cn/", "https://www.ccgp.gov.cn/", "https://www.ggzy.gov.cn/", "https://www.gov.cn/zhengce/", "https://www.moe.gov.cn/jyb_xxgk/gggs/", "https://www.cnaf.cn/", "https://www.asef.org/", "https://www.cac.gov.cn/"];
const now = new Date("2026-07-25T00:00:00+08:00");
const seenUrls = new Set<string>();
const entries = file.entries.filter((entry) => {
  if (!entry.is_published || entry.status !== "active" || !healthy.has(entry.slug)) return false;
  const url = entry.sources[0]?.url ?? "";
  if (genericRoots.some((root) => url === root || url.endsWith(root.slice(0, -1)))) return false;
  if (!entry.dates.deadline_at) return /长期|ongoing|open-ended/i.test(entry.status_reason ?? "");
  const current = new Date(`${entry.dates.deadline_at}T23:59:59+08:00`) >= now;
  if (!current) return false;
  if (seenUrls.has(url)) return false;
  seenUrls.add(url);
  return true;
});
const output: IchOpportunityFile = { ...file, updated_at: new Date().toISOString(), entries };
fs.writeFileSync(path.resolve(outputPath), `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ input: inputPath, health: healthPath, output: outputPath, entries: entries.length }, null, 2));
