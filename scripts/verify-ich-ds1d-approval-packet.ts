import fs from "node:fs";
import path from "node:path";
import { IchOpportunityStore } from "../src/ich/store";
import { findIchSemanticIssues } from "../src/ich/semantic-validation";
import { validateIchOpportunity } from "../src/ich/validation";
import type { IchOpportunity } from "../src/ich/types";

interface DraftFile { candidate: IchOpportunity }
interface ApprovalReport {
  schema_version: "ich-ds1d-approval-check.v1";
  checked_at: string;
  readonly: true;
  production_store_write: false;
  official_url: string;
  http_status: number | null;
  final_url: string | null;
  official_title_match: boolean;
  official_deadline_match: boolean;
  official_application_email_present: boolean;
  deadline_at: string;
  deadline_in_future: boolean;
  draft_validation: "pass" | "fail";
  semantic_issue_count: number;
  already_in_store: boolean;
  template_marker_detected: boolean;
  gate: "pass" | "fail";
  errors: string[];
}

const draftPath = path.resolve("docs/ich/DS1-D-待批准机会草稿_V1.0.json");
const outputPath = path.resolve("docs/ich/DS1-D-批准前复核_V1.0.json");
const draft = (JSON.parse(fs.readFileSync(draftPath, "utf8")) as DraftFile).candidate;

async function main(): Promise<void> {
const source = draft.sources[0];
if (!source) throw new Error("draft primary source is missing");
const now = new Date("2026-08-24T16:00:00+08:00");
const errors: string[] = [];
const validation = validateIchOpportunity(draft);
const semanticIssues = findIchSemanticIssues(draft, []);
const store = new IchOpportunityStore(path.resolve("data/ich-opportunities.json"));
const alreadyInStore = store.list().some((entry) => entry.id === draft.id || entry.slug === draft.slug);
if (!validation.valid) errors.push(`draft validation: ${validation.errors.join("; ")}`);
if (semanticIssues.length) errors.push(`semantic issues: ${semanticIssues.length}`);
if (alreadyInStore) errors.push("draft already exists in formal store");

let httpStatus: number | null = null;
let finalUrl: string | null = null;
let titleMatch = false;
let deadlineMatch = false;
let emailPresent = false;
let body = "";
try {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(source.url, { redirect: "follow", signal: controller.signal, headers: { "user-agent": "ChancePing-DS1D-approval-check/1.0" } });
    httpStatus = response.status;
    finalUrl = response.url;
    body = (await response.text()).replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&").replace(/(20)\s*(\d)\s*(\d)\s*年/gu, "$1$2$3年").replace(/(20\d{2})年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/gu, "$1年$2月$3日").replace(/\s+/g, " ").trim();
  } finally { clearTimeout(timer); }
} catch (error) { errors.push(`official source fetch: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`); }

titleMatch = body.includes("关于征选2026年广东金秋文旅消费惠民补贴发放平台企业的公告");
deadlineMatch = /(?:提交方式与截止时间|截止时间)[^。；]{0,220}2026年\s*8月\s*26日\s*17[:：]00/u.test(body);
emailPresent = body.includes("wl_gdwltcyfzc@gd.gov.cn");
if (httpStatus !== 200) errors.push(`official source HTTP ${String(httpStatus)}`);
if (!titleMatch) errors.push("official title not found");
if (!deadlineMatch) errors.push("official deadline evidence not found");
if (!emailPresent) errors.push("official application email evidence not found");
if (finalUrl !== source.url) errors.push("official final URL differs from draft source URL");
const deadlineInFuture = Date.parse(draft.dates.deadline_at ?? "") > now.getTime();
if (!deadlineInFuture) errors.push("draft deadline is not in the future");
const templateMarkerDetected = ["第十一届广东省非遗创意设计大赛", "gdsfycyds@qq.com"].some((marker) => JSON.stringify(draft).includes(marker));
if (templateMarkerDetected) errors.push("known DS0 template marker detected");
if (draft.is_published || draft.workflow.state !== "draft") errors.push("draft is not safely unpublished");

const report: ApprovalReport = { schema_version: "ich-ds1d-approval-check.v1", checked_at: now.toISOString(), readonly: true, production_store_write: false, official_url: source.url, http_status: httpStatus, final_url: finalUrl, official_title_match: titleMatch, official_deadline_match: deadlineMatch, official_application_email_present: emailPresent, deadline_at: draft.dates.deadline_at ?? "", deadline_in_future: deadlineInFuture, draft_validation: validation.valid ? "pass" : "fail", semantic_issue_count: semanticIssues.length, already_in_store: alreadyInStore, template_marker_detected: templateMarkerDetected, gate: errors.length === 0 ? "pass" : "fail", errors };
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ output: path.relative(process.cwd(), outputPath), http_status: report.http_status, official_title_match: report.official_title_match, official_deadline_match: report.official_deadline_match, email_present: report.official_application_email_present, deadline_in_future: report.deadline_in_future, draft_validation: report.draft_validation, semantic_issue_count: report.semantic_issue_count, already_in_store: report.already_in_store, production_store_write: report.production_store_write, gate: report.gate, errors: report.errors }, null, 2));
if (report.gate === "fail") process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
