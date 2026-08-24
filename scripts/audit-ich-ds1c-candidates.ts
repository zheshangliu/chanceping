import fs from "node:fs";
import path from "node:path";
import { getIchSourceRegistryV2 } from "../src/ich/source-registry-v2";
import type { IchCandidateSample } from "../src/ich/source-adapters-v1";

interface SampleRunFile { runs: Array<{ samples: IchCandidateSample[] }> }
type Admission = "candidate_review" | "blocked";

interface AuditItem {
  candidate_id: string;
  source_id: string;
  source_level: "L1" | "L2" | "L3" | "unknown";
  source_role: "primary" | "secondary" | "discovery" | "unknown";
  source_url: string;
  source_is_detail_page: boolean;
  template_contamination: boolean;
  duplicate_of_candidate_id: string | null;
  status_hint: "active" | "closing_soon" | "expired" | "pending_confirmation";
  admission: Admission;
  formal_publish_blocked: true;
  flags: string[];
}

interface AuditReport {
  schema_version: "ich-ds1c-candidate-audit.v1";
  audited_at: string;
  readonly: true;
  input: string;
  total_candidates: number;
  candidate_review_count: number;
  blocked_count: number;
  template_contamination_count: number;
  duplicate_count: number;
  missing_deadline_count: number;
  unconfirmed_geography_count: number;
  unconfirmed_category_count: number;
  gate: "pass" | "fail";
  items: AuditItem[];
}

const inputPath = path.resolve(process.argv.includes("--input") ? process.argv[process.argv.indexOf("--input") + 1] : "docs/ich/DS1-B-候选样本运行记录_V1.0.json");
const outputPath = path.resolve(process.argv.includes("--output") ? process.argv[process.argv.indexOf("--output") + 1] : "docs/ich/DS1-C-候选审计记录_V1.0.json");
const sampleFile = JSON.parse(fs.readFileSync(inputPath, "utf8")) as SampleRunFile;
const samples = sampleFile.runs.flatMap((run) => run.samples);
const registry = getIchSourceRegistryV2();

function normalize(value: string): string { return value.normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, ""); }
function isDetailUrl(url: string, discoveryUrl: string): boolean {
  try {
    const source = new URL(url); const discovery = new URL(discoveryUrl);
    return source.pathname !== discovery.pathname && /(?:post_|t\d+_\d+|content\/|\/(?:guide_detail|work_notice_detail|normal_detail|fund_work_detail|policy_detail|newslncb_detail|single_detail)\/\d+\.html$)/u.test(source.pathname);
  } catch { return false; }
}
function dateFromText(value: string | null): Date | null {
  if (!value) return null;
  const match = value.match(/(20\d{2})年(\d{1,2})月(\d{1,2})日(?:\s*(\d{1,2})[时:]\s*(\d{0,2})?分?)?/u);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4] ?? 23), Number(match[5] ?? 59)));
  return Number.isNaN(date.getTime()) ? null : date;
}
function statusHint(deadlineText: string | null): AuditItem["status_hint"] {
  const deadline = dateFromText(deadlineText);
  if (!deadline) return "pending_confirmation";
  const now = Date.now(); const day = 86_400_000;
  if (deadline.getTime() < now) return "expired";
  if (deadline.getTime() - now <= 14 * day) return "closing_soon";
  return "active";
}

const seenByUrl = new Map<string, string>();
const seenByTitle = new Map<string, string>();
const items: AuditItem[] = [];
for (const sample of samples) {
  const source = registry.sources.find((entry) => entry.id === sample.source_id);
  const flags: string[] = [];
  const detail = isDetailUrl(sample.source_url, sample.discovery_url);
  if (!detail) flags.push("source_url_not_detail_page");
  if (!sample.title.trim()) flags.push("title_missing");
  if (!sample.raw_snapshot_hash || sample.raw_snapshot_hash.length !== 64) flags.push("raw_snapshot_hash_missing");
  if (sample.review_state !== "candidate_only") flags.push("workflow_state_not_candidate_only");
  if (sample.field_provenance.geography.confirmed === false) flags.push("geography_unconfirmed");
  if (sample.field_provenance.category_hint.confirmed === false) flags.push("category_unconfirmed");
  if (!sample.deadline_text) flags.push("deadline_unconfirmed");
  if (Object.values(sample.field_provenance).some((field) => field.value === "第十一届广东省非遗创意设计大赛" || field.value === "gdsfycyds@qq.com")) flags.push("template_marker_detected");
  const normalizedUrl = sample.source_url.replace(/#.*$/, "").replace(/\/$/, "");
  const normalizedTitle = normalize(sample.title);
  const priorUrl = seenByUrl.get(normalizedUrl);
  const priorTitle = seenByTitle.get(normalizedTitle);
  const duplicateOf = priorUrl ?? priorTitle ?? null;
  if (duplicateOf) flags.push("duplicate_candidate");
  seenByUrl.set(normalizedUrl, sample.candidate_id);
  seenByTitle.set(normalizedTitle, sample.candidate_id);
  const template = flags.includes("template_marker_detected");
  const admission: Admission = template || !detail || flags.includes("raw_snapshot_hash_missing") ? "blocked" : "candidate_review";
  items.push({
    candidate_id: sample.candidate_id,
    source_id: sample.source_id,
    source_level: source?.evidence_level ?? "unknown",
    source_role: source?.role ?? "unknown",
    source_url: sample.source_url,
    source_is_detail_page: detail,
    template_contamination: template,
    duplicate_of_candidate_id: duplicateOf,
    status_hint: statusHint(sample.deadline_text),
    admission,
    formal_publish_blocked: true,
    flags,
  });
}

const report: AuditReport = {
  schema_version: "ich-ds1c-candidate-audit.v1",
  audited_at: new Date().toISOString(),
  readonly: true,
  input: path.relative(process.cwd(), inputPath),
  total_candidates: items.length,
  candidate_review_count: items.filter((item) => item.admission === "candidate_review").length,
  blocked_count: items.filter((item) => item.admission === "blocked").length,
  template_contamination_count: items.filter((item) => item.template_contamination).length,
  duplicate_count: items.filter((item) => Boolean(item.duplicate_of_candidate_id)).length,
  missing_deadline_count: items.filter((item) => item.flags.includes("deadline_unconfirmed")).length,
  unconfirmed_geography_count: items.filter((item) => item.flags.includes("geography_unconfirmed")).length,
  unconfirmed_category_count: items.filter((item) => item.flags.includes("category_unconfirmed")).length,
  gate: items.length > 0 && items.every((item) => item.formal_publish_blocked && !item.template_contamination && !item.duplicate_of_candidate_id) ? "pass" : "fail",
  items,
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ output: path.relative(process.cwd(), outputPath), total: report.total_candidates, candidate_review: report.candidate_review_count, blocked: report.blocked_count, template_contamination: report.template_contamination_count, duplicates: report.duplicate_count, missing_deadline: report.missing_deadline_count, gate: report.gate }, null, 2));
if (report.gate === "fail") process.exitCode = 1;
