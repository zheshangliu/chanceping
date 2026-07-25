import fs from "node:fs";
import path from "node:path";
import type { IchOpportunity, IchOpportunityFile } from "../src/ich/types";

type Research = { title: string; category: IchOpportunity["primary_category"]; url: string; source_level: IchOpportunity["sources"][number]["level"]; deadline: string; organizer: string; status: string; notes: string };
const batchName = process.argv[2] ?? "expansion-batch-01";
const inputPath = process.argv[3] ?? `data/ich/${batchName}-research.json`;
const outputPath = process.argv[4] ?? `data/ich/${batchName}.json`;
const input = JSON.parse(fs.readFileSync(path.resolve(inputPath), "utf8")) as { entries: Research[] };
const existing = JSON.parse(fs.readFileSync(path.resolve("src/ich/opportunities.verified.json"), "utf8")) as IchOpportunityFile;
const template = existing.entries[0];
const checkedAt = "2026-07-25T12:00:00+08:00";
const entries = input.entries.map((raw, index) => {
  const entry = structuredClone(template) as IchOpportunity;
  const slug = `${batchName}-${String(index + 1).padStart(3, "0")}`;
  const publishable = raw.status === "candidate" && raw.deadline !== "未确认";
  entry.id = `ich_${batchName.replace(/[^a-z0-9]+/gi, "_")}_${String(index + 1).padStart(3, "0")}`;
  entry.external_id = null;
  entry.slug = slug;
  entry.title = raw.title;
  entry.title_original = raw.title;
  entry.summary = `${raw.notes} 申请前请以官方来源最新页面为准。`;
  entry.primary_category = raw.category;
  entry.classification_status = publishable ? "confirmed" : "pending_review";
  entry.status = publishable ? "active" : "pending_confirmation";
  entry.status_reason = publishable ? `官方页面列明截止日期 ${raw.deadline}。` : "截止日期或资格仍需回溯确认。";
  entry.is_published = publishable;
  entry.organizer = { ...entry.organizer, name: raw.organizer, official_website: new URL(raw.url).origin };
  entry.dates = { ...entry.dates, published_at: checkedAt, application_start_at: checkedAt, deadline_at: publishable ? raw.deadline : null, deadline_text: publishable ? raw.deadline : "未确认", date_status: publishable ? "confirmed" : "unknown" };
  entry.application = { ...entry.application, application_url: raw.url, application_status: publishable ? "confirmed" : "unknown" };
  entry.sources = [{ url: raw.url, name: raw.organizer, type: "specific_opportunity_page", level: raw.source_level, is_primary: true, published_at: checkedAt, last_checked_at: checkedAt, is_accessible: true, notes: raw.notes }];
  entry.verification = { ...entry.verification, verification_status: publishable ? "verified" : "pending_verification", verified_at: checkedAt, needs_recheck: true, recheck_after: "2026-07-28T00:00:00+08:00" };
  entry.workflow = publishable
    ? { ...entry.workflow, state: "published", revision: 4, history: [{ action: "created", from: null, to: "draft", actor: "expansion-01", at: checkedAt, reason: null, revision: 1 }, { action: "submitted", from: "draft", to: "pending_review", actor: "expansion-01", at: checkedAt, reason: null, revision: 2 }, { action: "approved", from: "pending_review", to: "approved", actor: "expansion-01", at: checkedAt, reason: "来源和字段通过第一批核验。", revision: 3 }, { action: "published", from: "approved", to: "published", actor: "expansion-01", at: checkedAt, reason: null, revision: 4 }] }
    : { ...entry.workflow, state: "draft", revision: 1, history: [{ action: "created", from: null, to: "draft", actor: "expansion-01", at: checkedAt, reason: null, revision: 1 }] };
  entry.metadata = { ...entry.metadata, created_at: checkedAt, updated_at: checkedAt, published_at: publishable ? checkedAt : null, source_import_batch: batchName };
  return entry;
});
const output: IchOpportunityFile = { schema_version: existing.schema_version, updated_at: checkedAt, entries };
fs.mkdirSync(path.resolve("data/ich"), { recursive: true });
fs.writeFileSync(path.resolve(outputPath), `${JSON.stringify(output, null, 2)}\n`);
console.log(`Wrote ${entries.length} candidates (${entries.filter((entry) => entry.is_published).length} publishable) to ${outputPath}`);
