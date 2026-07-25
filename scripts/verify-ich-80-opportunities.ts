import fs from "node:fs";
import path from "node:path";
import type { IchOpportunity, IchOpportunityFile } from "../src/ich/types";

const inputPath = process.argv.includes("--input") ? process.argv[process.argv.indexOf("--input") + 1] : "data/ich/expansion-all.json";
const file = JSON.parse(fs.readFileSync(path.resolve(inputPath), "utf8")) as IchOpportunityFile;
const now = new Date(process.env.ICH_AUDIT_NOW ?? "2026-07-25T00:00:00+08:00");
const categories = ["competition", "exhibition_market", "procurement_project", "channel_collaboration", "policy_funding", "international"] as const;
const minimums: Record<(typeof categories)[number], number> = {
  competition: 18,
  exhibition_market: 14,
  procurement_project: 14,
  channel_collaboration: 10,
  policy_funding: 10,
  international: 14,
};

const genericSourceRoots = [
  "https://www.mct.gov.cn/whzx/ggtz/",
  "https://www.ihchina.cn/",
  "https://www.ccgp.gov.cn/",
  "https://www.ggzy.gov.cn/",
  "https://www.gov.cn/zhengce/",
  "https://www.moe.gov.cn/jyb_xxgk/gggs/",
  "https://www.cnaf.cn/",
  "https://www.asef.org/",
  "https://www.cac.gov.cn/",
];
const isGenericSource = (entry: IchOpportunity) => genericSourceRoots.some((root) => entry.sources[0]?.url === root || entry.sources[0]?.url?.endsWith(root.replace(/\/$/, "")));
const current = file.entries.filter((entry) => {
  if (!entry.is_published || entry.status !== "active") return false;
  if (isGenericSource(entry)) return false;
  if (!entry.dates.deadline_at) return /长期|ongoing|open-ended/i.test(entry.status_reason ?? "");
  return new Date(`${entry.dates.deadline_at}T23:59:59+08:00`) >= now;
});
const counts = Object.fromEntries(categories.map((category) => [category, current.filter((entry) => entry.primary_category === category).length]));
const l1 = current.filter((entry) => entry.sources[0]?.level === "L1").length;
const l12 = current.filter((entry) => ["L1", "L2"].includes(entry.sources[0]?.level ?? "")).length;
const duplicateUrls = current.map((entry) => entry.sources[0]?.url).filter((url, i, all) => Boolean(url) && all.indexOf(url) !== i);
const genericUrls = file.entries.filter((entry) => isGenericSource(entry)).map((entry) => entry.slug);
const errors: string[] = [];
if (current.length < 80) errors.push(`current_total ${current.length} < 80`);
for (const category of categories) if (counts[category] < minimums[category]) errors.push(`${category} ${counts[category]} < ${minimums[category]}`);
if (l1 < 48) errors.push(`L1 ${l1} < 48`);
if (l12 < 68) errors.push(`L1+L2 ${l12} < 68`);
if (duplicateUrls.length) errors.push(`duplicate primary URLs ${duplicateUrls.length}`);
for (const entry of current) {
  if (entry.sources.length !== 1 || !entry.sources[0]?.is_primary) errors.push(`${entry.slug}: primary source cardinality invalid`);
  if (!/^https:\/\//.test(entry.sources[0]?.url ?? "")) errors.push(`${entry.slug}: primary URL is not HTTPS`);
  if (entry.verification.verification_status !== "verified") errors.push(`${entry.slug}: not verified`);
}
const result = { input: inputPath, audited_at: new Date().toISOString(), current_total: current.length, historical_total: file.entries.filter((entry) => entry.status === "ended" || entry.status === "cancelled").length, categories: counts, source_levels: { L1: l1, L1_L2: l12 }, duplicate_primary_urls: duplicateUrls.length, generic_source_roots: genericUrls.length, errors };
console.log(JSON.stringify(result, null, 2));
if (errors.length) process.exitCode = 1;
