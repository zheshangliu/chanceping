import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { computeIchOpportunityStatus } from "../src/ich/status";
import type { IchOpportunity, IchOpportunityFile } from "../src/ich/types";

const root = process.cwd();
const now = new Date("2026-09-06T12:00:00+08:00");
const storePath = path.join(root, "data/ich-opportunities.json");
const reportPath = path.join(root, "docs/ich/stage5a-batch1-report.json");
const bytes = fs.readFileSync(storePath);
const file = JSON.parse(bytes.toString("utf8")) as IchOpportunityFile;
const report = JSON.parse(fs.readFileSync(reportPath, "utf8")) as {
  before_count: number; after_count: number; imported: number; active_after: number;
  before_sha256: string; after_sha256: string; titles: string[]; gate: string;
};
const errors: string[] = [];
const hash = crypto.createHash("sha256").update(bytes).digest("hex");
const primaryUrls = new Map<string, string>();
const ids = new Set<string>();
const slugs = new Set<string>();
const importedTitles = new Set(report.titles);
const importedIds = new Set(file.entries.filter((entry) => importedTitles.has(entry.title)).map((entry) => entry.id));
for (const entry of file.entries) {
  if (ids.has(entry.id)) errors.push(`duplicate id: ${entry.id}`);
  if (slugs.has(entry.slug)) errors.push(`duplicate slug: ${entry.slug}`);
  ids.add(entry.id); slugs.add(entry.slug);
  for (const source of entry.sources.filter((item) => item.is_primary)) {
    const prior = primaryUrls.get(source.url);
    // Existing pre-Stage5A records contain known historical duplicate URLs. The
    // batch gate only rejects duplicates introduced by this batch or a new entry
    // colliding with an existing primary URL.
    if (prior && prior !== entry.id && (importedIds.has(prior) || importedIds.has(entry.id))) errors.push(`duplicate primary source: ${source.url}`);
    primaryUrls.set(source.url, entry.id);
  }
}
if (report.gate !== "pass") errors.push("batch gate is not pass");
if (report.before_count !== 127) errors.push(`unexpected before count: ${report.before_count}`);
if (report.after_count !== 137) errors.push(`unexpected report after count: ${report.after_count}`);
if (file.entries.length !== report.after_count) errors.push(`store count ${file.entries.length} != report after count ${report.after_count}`);
if (report.imported !== 10) errors.push(`unexpected imported count: ${report.imported}`);
if (hash !== report.after_sha256) errors.push(`store hash ${hash} != report after hash ${report.after_sha256}`);
const imported = file.entries.filter((entry) => report.titles.includes(entry.title));
if (imported.length !== 10) errors.push(`imported title count: ${imported.length}`);
for (const entry of imported) {
  if (!entry.is_published || entry.workflow.state !== "published") errors.push(`not published: ${entry.title}`);
  if (entry.verification.verification_status !== "verified") errors.push(`not verified: ${entry.title}`);
  if (!entry.sources.some((source) => source.is_primary && source.level === "L1" && source.is_accessible)) errors.push(`no accessible L1 primary source: ${entry.title}`);
  if (!entry.application.application_url) errors.push(`no application URL: ${entry.title}`);
  if (!entry.dates.deadline_at) errors.push(`no deadline: ${entry.title}`);
  if (!(entry as IchOpportunity & { radar_tags?: string[] }).radar_tags?.length) errors.push(`no radar_tags: ${entry.title}`);
}
const active = file.entries.filter((entry) => entry.is_published && ["active", "closing_soon", "long_term"].includes(computeIchOpportunityStatus(entry, now))).length;
if (active !== report.active_after) errors.push(`computed active ${active} != report active_after ${report.active_after}`);
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
console.log(JSON.stringify({ pass: true, total: file.entries.length, imported: imported.length, active, primary_urls: primaryUrls.size, hash }, null, 2));
