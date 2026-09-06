import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { computeIchOpportunityStatus } from "../src/ich/status";
import { validateIchOpportunity } from "../src/ich/validation";
import type { IchOpportunityFile } from "../src/ich/types";

const root = process.cwd();
const now = new Date("2026-09-06T12:00:00+08:00");
const report = JSON.parse(fs.readFileSync(path.join(root, "docs/ich/stage5a-batch2-report.json"), "utf8")) as any;
const bytes = fs.readFileSync(path.join(root, "data/ich-opportunities.json"));
const file = JSON.parse(bytes.toString("utf8")) as IchOpportunityFile;
const hash = crypto.createHash("sha256").update(bytes).digest("hex");
const slugs = [
  "fuzhou-heritage-craft-gift-procurement-2026", "guam-micronesia-island-fair-vendor-2026", "singapore-heritage-grants-2026-cycle",
  "canada-indigenous-heritage-map-2027", "evanston-winter-arts-crafts-expo-2026", "kentucky-guild-fall-art-market-2026",
  "craftforms-2026-wayne-art-center", "leicester-museums-the-open-2026", "uk-national-lottery-heritage-grants-2026-round",
  "handmade-arcade-modern-craft-market-2027",
];
const errors: string[] = [];
const before = 137;
if (report.gate !== "pass") errors.push("batch report gate is not pass");
if (report.candidate_count !== 10 || report.ds3_pass !== 10 || report.ds14_imported !== 10) errors.push("batch counts do not equal 10/10/10");
if (report.before_count !== before || report.after_count !== 147) errors.push(`unexpected Batch2 report counts ${report.before_count}/${report.after_count}`);
if (file.entries.length < 147) errors.push(`store count ${file.entries.length} is below Batch2 after-count 147`);
if (file.entries.length === 147 && hash !== report.after_sha256) errors.push(`store hash ${hash} != Batch2 report hash ${report.after_sha256}`);
const primary = new Map<string, string>();
for (const entry of file.entries) {
  const valid = validateIchOpportunity(entry);
  if (!valid.valid) errors.push(`${entry.slug}: ${valid.errors.join("; ")}`);
  for (const source of entry.sources.filter((item) => item.is_primary)) {
    const normalized = source.url.replace(/#.*$/, "").replace(/\/$/, "");
    const prior = primary.get(normalized);
    if (prior && slugs.includes(entry.slug) && prior !== entry.id) errors.push(`batch primary URL duplicate: ${source.url}`);
    primary.set(normalized, entry.id);
  }
}
const importedMaybe = slugs.map((slug) => file.entries.find((entry) => entry.slug === slug));
if (importedMaybe.some((entry) => !entry)) errors.push("one or more imported slugs are missing");
const imported = importedMaybe.filter((entry): entry is IchOpportunityFile["entries"][number] => Boolean(entry));
for (const entry of imported) {
  const provenance = (entry as any).field_provenance;
  if (!entry.is_published || entry.workflow.state !== "published") errors.push(`${entry.slug}: not published`);
  if (entry.verification.verification_status !== "verified") errors.push(`${entry.slug}: not verified`);
  if (!entry.sources.some((source) => source.is_primary && source.level === "L1" && source.is_accessible)) errors.push(`${entry.slug}: no accessible L1 source`);
  if (!entry.application.application_url) errors.push(`${entry.slug}: no application URL`);
  if (!entry.dates.deadline_text || !entry.dates.date_status || !provenance || Object.keys(provenance).length < 3) errors.push(`${entry.slug}: missing date/provenance`);
  const status = computeIchOpportunityStatus(entry, now);
  if (["expired", "ended", "pending_confirmation"].includes(status)) errors.push(`${entry.slug}: status ${status} is not publishable for Batch2`);
  if (entry.primary_category === "procurement_project" && !(/采购|招标|磋商|供应商|项目/.test(entry.title + entry.description + entry.benefits.benefit_text))) errors.push(`${entry.slug}: procurement action not evidenced`);
  if (entry.primary_category === "channel_collaboration" && !(/合作|招募|入驻|供应|联营|授权/.test(entry.title + entry.description + entry.benefits.benefit_text))) errors.push(`${entry.slug}: channel action not evidenced`);
  if (entry.costs.application_fee_amount === null && entry.costs.cost_status === "confirmed") errors.push(`${entry.slug}: undisclosed fee marked confirmed`);
}
const counts: Record<string, number> = {};
for (const entry of file.entries.filter((item) => item.is_published)) {
  const status = computeIchOpportunityStatus(entry, now);
  counts[status] = (counts[status] ?? 0) + 1;
}
const actionable = ["active", "closing_soon", "long_term"].reduce((sum, status) => sum + (counts[status] ?? 0), 0);
if (file.entries.length === 147) {
  if (actionable !== 33) errors.push(`actionable pool ${actionable} != Batch2 baseline 33`);
  if ((counts.opening_soon ?? 0) !== 3) errors.push(`opening_soon ${counts.opening_soon ?? 0} != Batch2 baseline 3`);
  if ((counts.active ?? 0) !== 20) errors.push(`exact active ${counts.active ?? 0} != Batch2 baseline 20`);
}
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
console.log(JSON.stringify({ pass: true, before_count: before, after_count: file.entries.length, imported: imported.length, status_counts: counts, actionable_pool: actionable, hash }, null, 2));
