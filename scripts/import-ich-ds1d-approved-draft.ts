import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { IchPublicationService } from "../src/ich/publication-service";
import { IchOpportunityStore } from "../src/ich/store";
import { findIchSemanticIssues } from "../src/ich/semantic-validation";
import { validateIchOpportunity } from "../src/ich/validation";
import type { IchOpportunity } from "../src/ich/types";

interface DraftFile { candidate: IchOpportunity }
interface ImportAudit {
  schema_version: "ich-ds1d-controlled-import.v1";
  imported_at: string;
  authorized_by: "user_granted_stage_gate_authority";
  input_draft_id: string;
  published_id: string | null;
  slug: string;
  source_url: string;
  mode: "dry-run" | "write";
  formal_store_path: string;
  formal_store_before_sha256: string;
  formal_store_after_sha256: string | null;
  before_count: number;
  after_count: number | null;
  count_delta: number | null;
  workflow_revisions: number[];
  final_state: string | null;
  final_is_published: boolean;
  validation: "pass" | "fail";
  semantic_issue_count: number;
  rollback_backup_expected: boolean;
  errors: string[];
  gate: "pass" | "fail";
}

const write = process.argv.includes("--write");
const nowRaw = process.argv.includes("--now") ? process.argv[process.argv.indexOf("--now") + 1] : "2026-08-24T16:00:00+08:00";
const now = new Date(nowRaw);
if (Number.isNaN(now.getTime())) throw new Error(`invalid --now: ${nowRaw}`);
const draftPath = path.resolve("docs/ich/DS1-D-待批准机会草稿_V1.0.json");
const storePath = path.resolve("data/ich-opportunities.json");
const auditPath = path.resolve("docs/ich/DS1-D-正式导入验收_V1.0.json");
const draft = (JSON.parse(fs.readFileSync(draftPath, "utf8")) as DraftFile).candidate;
const beforeBytes = fs.readFileSync(storePath);
const beforeHash = crypto.createHash("sha256").update(beforeBytes).digest("hex");
const store = new IchOpportunityStore(storePath);
const beforeEntries = store.list();
const errors: string[] = [];
const validation = validateIchOpportunity(draft);
const semanticIssues = findIchSemanticIssues(draft, beforeEntries);
if (!validation.valid) errors.push(`draft validation: ${validation.errors.join("; ")}`);
if (semanticIssues.length > 0) errors.push(`semantic issues: ${semanticIssues.map((issue) => `${issue.field}: ${issue.reason}`).join("; ")}`);
if (draft.is_published || draft.workflow.state !== "draft") errors.push("draft is not unpublished draft");
if (beforeEntries.some((entry) => entry.slug === draft.slug || entry.external_id === draft.external_id || entry.sources.some((source) => source.url === draft.sources[0]?.url))) errors.push("draft conflicts with formal store");
if (!draft.sources[0] || draft.sources[0].level !== "L1" || !draft.sources[0].is_accessible) errors.push("primary source must be accessible L1");
if (!draft.dates.deadline_at || Date.parse(draft.dates.deadline_at) <= now.getTime()) errors.push("deadline is not future at import time");

let published: IchOpportunity | null = null;
const revisions: number[] = [];
if (errors.length === 0 && write) {
  const service = new IchPublicationService(store);
  const created = service.create(draft, { actor: "ich-ds1d-editor", now });
  revisions.push(created.workflow.revision);
  const submitted = service.transition(created.id, "pending_review", "submitted", { actor: "ich-ds1d-editor", now, expectedRevision: created.workflow.revision, reason: "DS1-D 受控导入：官方来源、字段、语义和去重门禁通过。" });
  revisions.push(submitted.workflow.revision);
  const approved = service.transition(created.id, "approved", "approved", { actor: "ich-ds1d-reviewer", now, expectedRevision: submitted.workflow.revision, reason: "审核通过：单条导入范围已授权，未确认字段保持原样。" });
  revisions.push(approved.workflow.revision);
  published = service.transition(created.id, "published", "published", { actor: "ich-ds1d-reviewer", now, expectedRevision: approved.workflow.revision });
  revisions.push(published.workflow.revision);
}

const afterBytes = write && errors.length === 0 ? fs.readFileSync(storePath) : null;
const afterEntries = write && errors.length === 0 ? store.list() : beforeEntries;
const afterHash = afterBytes ? crypto.createHash("sha256").update(afterBytes).digest("hex") : null;
const finalEntry = published ?? null;
if (write && errors.length === 0) {
  if (afterEntries.length !== beforeEntries.length + 1) errors.push("formal store count delta is not +1");
  if (!finalEntry || !finalEntry.is_published || finalEntry.workflow.state !== "published") errors.push("published workflow did not reach published state");
  if (finalEntry && findIchSemanticIssues(finalEntry, afterEntries.filter((entry) => entry.id !== finalEntry.id)).length > 0) errors.push("published entry semantic recheck failed");
}
const audit: ImportAudit = { schema_version: "ich-ds1d-controlled-import.v1", imported_at: now.toISOString(), authorized_by: "user_granted_stage_gate_authority", input_draft_id: draft.id, published_id: finalEntry?.id ?? null, slug: draft.slug, source_url: draft.sources[0]?.url ?? "", mode: write ? "write" : "dry-run", formal_store_path: path.relative(process.cwd(), storePath), formal_store_before_sha256: beforeHash, formal_store_after_sha256: afterHash, before_count: beforeEntries.length, after_count: write && errors.length === 0 ? afterEntries.length : null, count_delta: write && errors.length === 0 ? afterEntries.length - beforeEntries.length : null, workflow_revisions: revisions, final_state: finalEntry?.workflow.state ?? null, final_is_published: finalEntry?.is_published ?? false, validation: validation.valid ? "pass" : "fail", semantic_issue_count: semanticIssues.length, rollback_backup_expected: write && errors.length === 0, errors, gate: errors.length === 0 ? (write ? "pass" : "fail") : "fail" };
fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`);
console.log(JSON.stringify({ output: path.relative(process.cwd(), auditPath), mode: audit.mode, before_count: audit.before_count, after_count: audit.after_count, count_delta: audit.count_delta, published_id: audit.published_id, final_state: audit.final_state, final_is_published: audit.final_is_published, validation: audit.validation, semantic_issue_count: audit.semantic_issue_count, formal_store_write: write && errors.length === 0, gate: audit.gate, errors }, null, 2));
if (audit.gate === "fail") process.exitCode = 1;
