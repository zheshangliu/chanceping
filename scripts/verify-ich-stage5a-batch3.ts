import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { computeIchOpportunityStatus } from "../src/ich/status";
import { validateIchOpportunity } from "../src/ich/validation";
import type { IchOpportunity, IchOpportunityFile } from "../src/ich/types";

const root = process.cwd();
const now = new Date("2026-09-06T12:00:00+08:00");
const report = JSON.parse(fs.readFileSync(path.join(root, "docs/ich/stage5a-batch3-report.json"), "utf8")) as any;
const directionSummaryPath = path.join(root, "docs/ich/stage5a2-direction-summary.json");
const directionSummary = fs.existsSync(directionSummaryPath) ? JSON.parse(fs.readFileSync(directionSummaryPath, "utf8")) as { after_sha256?: string } : null;
const bytes = fs.readFileSync(path.join(root, "data/ich-opportunities.json"));
const file = JSON.parse(bytes.toString("utf8")) as IchOpportunityFile;
const hash = crypto.createHash("sha256").update(bytes).digest("hex");
const slugs = [
  "nmaahc-museum-store-vendor-artisan-application", "museumshops-uk-sell-with-us-partnership", "national-museum-australia-museum-shop-wholesale-registration",
  "met-store-wholesale-retail-institution-inquiry", "van-gogh-museum-shop-new-retailer-wholesale", "sunshine-makers-market-vendor-application-september-2026",
  "west-coast-craft-fort-mason-night-market-2026", "lattin-farms-crafters-fair-vendor-2026", "yuanmingyuan-national-day-ich-event-procurement-2026",
  "xian-museum-collection-resources-partner-call-2026",
];
const errors: string[] = [];
if (report.gate !== "pass") errors.push("batch report gate is not pass");
if (report.candidate_count !== 10 || report.official_backtrace_success !== 10 || report.ds3_pass !== 10 || report.ds14_imported !== 10) errors.push("batch counts do not equal 10/10/10/10");
if (report.before_count !== 147 || report.after_count !== 157) errors.push(`unexpected counts ${report.before_count}/${report.after_count}`);
if (file.entries.length !== 157) errors.push(`store count ${file.entries.length} != 157`);
if (hash !== report.after_sha256 && hash !== directionSummary?.after_sha256) errors.push(`store hash ${hash} != Batch3 report hash ${report.after_sha256} or Stage5-A.2 hash ${directionSummary?.after_sha256 ?? "missing"}`);

const imported = slugs.map((slug) => file.entries.find((entry) => entry.slug === slug));
if (imported.some((entry) => !entry)) errors.push("one or more imported slugs are missing");
const newEntries = imported.filter((entry): entry is IchOpportunity => Boolean(entry));
const primaryUrls = new Map<string, string>();
for (const entry of file.entries) {
  for (const source of entry.sources.filter((item) => item.is_primary)) {
    const normalized = source.url.replace(/#.*$/, "").replace(/\/$/, "");
    const prior = primaryUrls.get(normalized);
    if (prior && newEntries.some((candidate) => candidate.id === entry.id || candidate.id === prior)) errors.push(`new primary URL duplicate: ${source.url}`);
    primaryUrls.set(normalized, entry.id);
  }
}

for (const entry of newEntries) {
  const valid = validateIchOpportunity(entry);
  if (!valid.valid) errors.push(`${entry.slug}: ${valid.errors.join("; ")}`);
  if (!entry.is_published || entry.workflow.state !== "published") errors.push(`${entry.slug}: not published`);
  if (entry.verification.verification_status !== "verified") errors.push(`${entry.slug}: not verified`);
  if (!entry.sources.some((source) => source.is_primary && source.level === "L1" && source.is_accessible)) errors.push(`${entry.slug}: no accessible L1 source`);
  if (!entry.application.application_url) errors.push(`${entry.slug}: no application URL`);
  const provenance = (entry as IchOpportunity & { field_provenance?: Record<string, unknown> }).field_provenance;
  if (!entry.dates.deadline_text || !provenance || Object.keys(provenance).length < 3) errors.push(`${entry.slug}: missing date/provenance`);
  const status = computeIchOpportunityStatus(entry, now);
  if (["expired", "ended", "pending_confirmation"].includes(status)) errors.push(`${entry.slug}: status ${status} is not publishable`);
  const text = `${entry.title} ${entry.description ?? ""} ${entry.benefits.benefit_text} ${entry.requirements.requirements_text} ${entry.application.application_steps.join(" ")}`;
  if (entry.primary_category === "procurement_project" && !/采购|招标|磋商|供应商|项目/.test(text)) errors.push(`${entry.slug}: procurement action not evidenced`);
  if (entry.primary_category === "channel_collaboration" && !/合作|申请|提交|供应|入驻|批发|retail|vendor|partner/i.test(text)) errors.push(`${entry.slug}: channel action not evidenced`);
  if (entry.costs.application_fee_amount === null && entry.costs.cost_status === "confirmed") errors.push(`${entry.slug}: undisclosed fee marked confirmed`);
  if (/保证金|押金|deposit/i.test(entry.costs.cost_text) && /\d/.test(entry.costs.cost_text) && (entry.costs.deposit_amount === null || !entry.costs.deposit_currency)) errors.push(`${entry.slug}: explicit deposit is not structured`);
  if (/类别|tier|分档|commercial/i.test(entry.costs.cost_text) && entry.costs.application_fee_amount !== null && entry.costs.cost_status !== "confirmed") errors.push(`${entry.slug}: tiered fee selected as a single fee`);
}

const fuzhou = file.entries.find((entry) => entry.slug === "fuzhou-heritage-craft-gift-procurement-2026");
if (!fuzhou || fuzhou.costs.deposit_amount !== 3000 || fuzhou.costs.deposit_currency !== "CNY") errors.push("Fuzhou deposit preflight repair missing");
const guam = file.entries.find((entry) => entry.slug === "guam-micronesia-island-fair-vendor-2026");
if (!guam || guam.costs.application_fee_amount !== null || guam.costs.cost_status !== "partial" || guam.costs.deposit_amount !== 100 || guam.costs.deposit_currency !== "USD") errors.push("Guam tiered-fee preflight repair missing");

const counts: Record<string, number> = {};
const categoryCounts: Record<string, number> = {};
for (const entry of file.entries.filter((item) => item.is_published)) {
  const status = computeIchOpportunityStatus(entry, now);
  counts[status] = (counts[status] ?? 0) + 1;
  if (["active", "closing_soon", "long_term"].includes(status)) categoryCounts[entry.primary_category] = (categoryCounts[entry.primary_category] ?? 0) + 1;
}
const actionable = (counts.active ?? 0) + (counts.closing_soon ?? 0) + (counts.long_term ?? 0);
if ((counts.active ?? 0) !== 23 || (counts.closing_soon ?? 0) !== 14 || (counts.long_term ?? 0) !== 6 || actionable !== 43) errors.push(`unexpected lifecycle counts active=${counts.active ?? 0}, closing=${counts.closing_soon ?? 0}, long_term=${counts.long_term ?? 0}, actionable=${actionable}`);
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
console.log(JSON.stringify({ pass: true, imported: newEntries.length, status_counts: counts, actionable_pool: actionable, actionable_category_counts: categoryCounts, hash }, null, 2));
