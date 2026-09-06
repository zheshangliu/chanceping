import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { computeIchOpportunityStatus } from "../src/ich/status";
import type { IchOpportunityFile } from "../src/ich/types";

const root = process.cwd();
const now = new Date("2026-09-06T12:00:00+08:00");
const storePath = path.join(root, "data/ich-opportunities.json");
const summary = JSON.parse(fs.readFileSync(path.join(root, "docs/ich/stage5a2-direction-summary.json"), "utf8")) as any;
const batch4Path = path.join(root, "docs/ich/stage5a-batch4-report.json");
const batch4 = fs.existsSync(batch4Path) ? JSON.parse(fs.readFileSync(batch4Path, "utf8")) as any : null;
const postBatch4 = batch4?.mode === "write";
const bytes = fs.readFileSync(storePath);
const file = JSON.parse(bytes.toString("utf8")) as IchOpportunityFile;
const hash = crypto.createHash("sha256").update(bytes).digest("hex");
const errors: string[] = [];
const allowed = new Set(["supplier_to_institution", "institution_to_supplier", "institution_to_retailer", "marketplace_for_supplier", "marketplace_for_institution", "grant_to_applicant", "buyer_to_vendor", "open_call_to_creator", "unknown"]);
const batch3 = [
  ["nmaahc-museum-store-vendor-artisan-application", "supplier_to_institution", "KEEP"],
  ["museumshops-uk-sell-with-us-partnership", "marketplace_for_institution", "RECLASSIFY"],
  ["national-museum-australia-museum-shop-wholesale-registration", "institution_to_retailer", "UNIVERSAL_POOL_ONLY"],
  ["met-store-wholesale-retail-institution-inquiry", "institution_to_retailer", "UNIVERSAL_POOL_ONLY"],
  ["van-gogh-museum-shop-new-retailer-wholesale", "institution_to_retailer", "UNIVERSAL_POOL_ONLY"],
  ["sunshine-makers-market-vendor-application-september-2026", "marketplace_for_supplier", "KEEP"],
  ["west-coast-craft-fort-mason-night-market-2026", "marketplace_for_supplier", "KEEP"],
  ["lattin-farms-crafters-fair-vendor-2026", "marketplace_for_supplier", "KEEP"],
  ["yuanmingyuan-national-day-ich-event-procurement-2026", "buyer_to_vendor", "KEEP"],
  ["xian-museum-collection-resources-partner-call-2026", "supplier_to_institution", "KEEP"],
] as const;
for (const [slug, direction, decision] of batch3) {
  const entry = file.entries.find((candidate) => candidate.slug === slug) as (IchOpportunityFile["entries"][number] & { opportunity_direction?: string; ich_actionable?: boolean; supplier_channel_eligible?: boolean }) | undefined;
  if (!entry) { errors.push(`${slug}: missing`); continue; }
  if (entry.opportunity_direction !== direction) errors.push(`${slug}: direction ${entry.opportunity_direction} != ${direction}`);
  if (decision === "UNIVERSAL_POOL_ONLY" && entry.ich_actionable !== false) errors.push(`${slug}: reverse wholesale must be ich_actionable=false`);
  if (direction === "marketplace_for_institution") {
    if (entry.eligibility.eligible_applicant_types.some((type) => ["individual", "enterprise", "studio"].includes(type))) errors.push(`${slug}: restricted marketplace still allows ordinary commercial applicants`);
    if (!/博物馆|历史建筑|图书馆|美术馆|科学中心/.test(entry.eligibility.eligibility_text)) errors.push(`${slug}: institution restriction missing`);
  }
}
for (const entry of file.entries.filter((candidate) => candidate.primary_category === "channel_collaboration")) {
  const extra = entry as IchOpportunityFile["entries"][number] & { opportunity_direction?: string; supplier_channel_eligible?: boolean };
  if (!extra.opportunity_direction || !allowed.has(extra.opportunity_direction)) errors.push(`${entry.slug}: missing/invalid opportunity_direction`);
  if (extra.opportunity_direction === "institution_to_retailer" && extra.supplier_channel_eligible === true) errors.push(`${entry.slug}: reverse wholesale counted in supplier channel`);
}
const reverse = file.entries.filter((entry) => (entry as any).opportunity_direction === "institution_to_retailer");
if (reverse.length !== 3) errors.push(`reverse wholesale count ${reverse.length} != 3`);
const statuses = file.entries.filter((entry) => entry.is_published).map((entry) => computeIchOpportunityStatus(entry, now));
const rawActionable = statuses.filter((status) => ["active", "closing_soon", "long_term"].includes(status)).length;
const directionActionable = file.entries.filter((entry) => entry.is_published && (entry as any).ich_actionable !== false && ["active", "closing_soon", "long_term"].includes(computeIchOpportunityStatus(entry, now))).length;
const channelActionable = file.entries.filter((entry) => entry.is_published && entry.primary_category === "channel_collaboration" && ["active", "closing_soon", "long_term"].includes(computeIchOpportunityStatus(entry, now))).length;
const procurementActionable = file.entries.filter((entry) => entry.is_published && entry.primary_category === "procurement_project" && ["active", "closing_soon", "long_term"].includes(computeIchOpportunityStatus(entry, now))).length;
const supplierCoverage = file.entries.filter((entry) => entry.is_published && entry.primary_category === "channel_collaboration" && (entry as any).supplier_channel_eligible === true && ["active", "closing_soon", "long_term"].includes(computeIchOpportunityStatus(entry, now))).length;
const expected = postBatch4 ? batch4.after : { formal_total: 157, raw_actionable: 43, direction_aware_ich_actionable: 40, channel_actionable: 8, procurement_actionable: 2, supplier_channel_coverage: 4 };
if (file.entries.length !== expected.formal_total) errors.push(`formal_total ${file.entries.length} != ${expected.formal_total}`);
if (rawActionable !== expected.raw_actionable) errors.push(`raw actionable ${rawActionable} != ${expected.raw_actionable}`);
if (directionActionable !== expected.direction_aware_ich_actionable) errors.push(`direction-aware actionable ${directionActionable} != ${expected.direction_aware_ich_actionable}`);
if (channelActionable !== expected.channel_actionable) errors.push(`channel actionable ${channelActionable} != ${expected.channel_actionable}`);
if (procurementActionable !== expected.procurement_actionable) errors.push(`procurement actionable ${procurementActionable} != ${expected.procurement_actionable}`);
if (supplierCoverage !== expected.supplier_channel_coverage) errors.push(`supplier channel coverage ${supplierCoverage} != ${expected.supplier_channel_coverage}`);
const expectedHash = postBatch4 ? batch4.after_sha256 : summary.after_sha256;
if (hash !== expectedHash) errors.push(`expected hash ${expectedHash} != store hash ${hash}`);
const batch4Scripts = ["run-ich-stage5a-batch4.ts"];
for (const name of batch4Scripts) {
  const content = fs.readFileSync(path.join(root, "scripts", name), "utf8");
  if (/structuredClone\s*\(\s*base\s*\)/.test(content)) errors.push(`${name}: Batch4 must not use structuredClone(base)`);
}
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
console.log(JSON.stringify({ pass: true, formal_total: file.entries.length, raw_actionable: rawActionable, direction_aware_actionable: directionActionable, channel_actionable: channelActionable, supplier_channel_coverage: supplierCoverage, procurement_actionable: procurementActionable, reverse_wholesale: reverse.map((entry) => entry.slug), batch4_factory_gate: "pass", hash }, null, 2));
