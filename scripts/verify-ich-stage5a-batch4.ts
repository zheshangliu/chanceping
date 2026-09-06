import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { computeIchOpportunityStatus } from "../src/ich/status";
import { validateIchOpportunity } from "../src/ich/validation";
import type { IchOpportunity, IchOpportunityFile } from "../src/ich/types";

const root = process.cwd();
const now = new Date("2026-09-06T12:00:00+08:00");
const docs = path.join(root, "docs/ich");
const report = JSON.parse(fs.readFileSync(path.join(docs, "stage5a-batch4-report.json"), "utf8")) as any;
const bytes = fs.readFileSync(path.join(root, "data/ich-opportunities.json"));
const file = JSON.parse(bytes.toString("utf8")) as IchOpportunityFile;
const hash = crypto.createHash("sha256").update(bytes).digest("hex");
const errors: string[] = [];
const importedSlugs = Array.isArray(report.imported_slugs) ? report.imported_slugs as string[] : [];
if (report.gate !== "pass" || report.mode !== "write") errors.push(`batch report must be pass/write, got ${report.gate}/${report.mode}`);
if (report.candidates_discovered !== importedSlugs.length || report.official_backtrace_success !== importedSlugs.length || report.ds3_pass !== importedSlugs.length || report.ds14_imported !== importedSlugs.length) errors.push("candidate/backtrace/DS3/DS14 counts are inconsistent");
if (importedSlugs.length === 0 || importedSlugs.length > 10) errors.push(`imported batch size ${importedSlugs.length} is outside 1..10`);
if (report.before_sha256 === report.after_sha256) errors.push("write batch did not change store hash");
if (hash !== report.after_sha256) errors.push(`store hash ${hash} != report after hash ${report.after_sha256}`);
if (report.before?.formal_total !== 157 || report.after?.formal_total !== file.entries.length) errors.push(`formal count mismatch before=${report.before?.formal_total} after=${report.after?.formal_total} store=${file.entries.length}`);
const imported = importedSlugs.map((slug) => file.entries.find((entry) => entry.slug === slug));
if (imported.some((entry) => !entry)) errors.push("one or more imported slugs are missing from store");
const entries = imported.filter((entry): entry is IchOpportunity => Boolean(entry));
if (new Set(importedSlugs).size !== importedSlugs.length) errors.push("duplicate imported slug in report");
const sourceUrls = new Set<string>();
for (const entry of entries) {
  const valid = validateIchOpportunity(entry);
  if (!valid.valid) errors.push(`${entry.slug}: ${valid.errors.join("; ")}`);
  if (!entry.is_published || entry.workflow.state !== "published") errors.push(`${entry.slug}: not published`);
  if (entry.verification.verification_status !== "verified") errors.push(`${entry.slug}: not verified`);
  if (!entry.sources.some((source) => source.is_primary && source.level === "L1" && source.is_accessible)) errors.push(`${entry.slug}: missing accessible L1 source`);
  if (!entry.application.application_url || !/^https?:\/\//.test(entry.application.application_url)) errors.push(`${entry.slug}: missing HTTP application URL`);
  const provenance = (entry as IchOpportunity & { field_provenance?: Record<string, unknown> }).field_provenance;
  if (!provenance || Object.keys(provenance).length < 3) errors.push(`${entry.slug}: incomplete field provenance`);
  const status = computeIchOpportunityStatus(entry, now);
  if (["expired", "ended", "pending_confirmation"].includes(status)) errors.push(`${entry.slug}: lifecycle ${status} is not publishable`);
  const extra = entry as IchOpportunity & { opportunity_direction?: string; ich_actionable?: boolean; supplier_channel_eligible?: boolean };
  if (!extra.opportunity_direction) errors.push(`${entry.slug}: missing opportunity_direction`);
  if (entry.primary_category === "procurement_project" && extra.opportunity_direction !== "buyer_to_vendor") errors.push(`${entry.slug}: procurement direction must be buyer_to_vendor`);
  if (extra.supplier_channel_eligible && !["supplier_to_institution", "marketplace_for_supplier"].includes(extra.opportunity_direction ?? "")) errors.push(`${entry.slug}: invalid supplier channel direction`);
  if (extra.opportunity_direction === "institution_to_retailer" || /工作室出租|space available/i.test(`${entry.title} ${entry.description ?? ""}`)) errors.push(`${entry.slug}: reverse wholesale/workspace cannot count as supplier coverage`);
  for (const source of entry.sources.filter((item) => item.is_primary)) {
    const normalized = source.url.replace(/#.*$/, "").replace(/\/$/, "");
    if (sourceUrls.has(normalized)) errors.push(`${entry.slug}: duplicate primary source URL ${normalized}`);
    sourceUrls.add(normalized);
  }
}
const statuses = file.entries.filter((entry) => entry.is_published).map((entry) => computeIchOpportunityStatus(entry, now));
const actionableStatuses = new Set(["active", "closing_soon", "long_term"]);
const actionable = file.entries.filter((entry) => entry.is_published && actionableStatuses.has(computeIchOpportunityStatus(entry, now)));
const directionAware = actionable.filter((entry) => (entry as any).ich_actionable !== false);
const procurement = actionable.filter((entry) => entry.primary_category === "procurement_project");
const channel = actionable.filter((entry) => entry.primary_category === "channel_collaboration");
const supplier = channel.filter((entry) => (entry as any).supplier_channel_eligible === true);
const metrics = {
  formal_total: file.entries.length,
  active: statuses.filter((status) => status === "active").length,
  closing_soon: statuses.filter((status) => status === "closing_soon").length,
  opening_soon: statuses.filter((status) => status === "opening_soon").length,
  long_term: statuses.filter((status) => status === "long_term").length,
  raw_actionable: actionable.length,
  direction_aware_ich_actionable: directionAware.length,
  procurement_actionable: procurement.length,
  channel_actionable: channel.length,
  supplier_channel_coverage: supplier.length,
};
for (const key of Object.keys(metrics) as Array<keyof typeof metrics>) if (report.after?.[key] !== metrics[key]) errors.push(`report after.${key}=${report.after?.[key]} != computed ${metrics[key]}`);
if (metrics.procurement_actionable < 5) errors.push(`procurement actionable ${metrics.procurement_actionable} < 5`);
if (metrics.supplier_channel_coverage < 8) errors.push(`supplier channel coverage ${metrics.supplier_channel_coverage} < 8`);
for (const name of ["run-ich-stage5a-batch4.ts", "opportunity-factory.ts"]) {
  const content = fs.readFileSync(path.join(root, "scripts", name === "run-ich-stage5a-batch4.ts" ? name : `../src/ich/${name}`), "utf8");
  if (/structuredClone\s*\(\s*base\s*\)/.test(content)) errors.push(`${name}: forbidden structuredClone(base)`);
}
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(JSON.stringify({ pass: true, imported: entries.length, metrics, hash }, null, 2));
