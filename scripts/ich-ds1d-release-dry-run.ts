import fs from "node:fs";
import path from "node:path";

interface CandidateAudit { formal_publish_blocked: true; admission: string; template_contamination: boolean; duplicate_of_candidate_id: string | null; }
interface AuditFile { items: CandidateAudit[] }
interface ReleaseDryRun {
  schema_version: "ich-ds1d-release-dry-run.v1";
  ran_at: string;
  readonly: true;
  formal_store_write: false;
  input: string;
  input_candidates: number;
  eligible_for_formal_publish: number;
  would_add: number;
  would_update: number;
  would_withdraw: number;
  blocked_reasons: string[];
  gate: "no_write_safe" | "not_ready";
}

const inputPath = path.resolve(process.argv.includes("--input") ? process.argv[process.argv.indexOf("--input") + 1] : "docs/ich/DS1-C-候选审计记录_V1.0.json");
const outputPath = path.resolve(process.argv.includes("--output") ? process.argv[process.argv.indexOf("--output") + 1] : "docs/ich/DS1-D-受控发布预演_V1.0.json");
const audit = JSON.parse(fs.readFileSync(inputPath, "utf8")) as AuditFile;
const blockedReasons = new Set<string>();
for (const item of audit.items) {
  if (item.formal_publish_blocked) blockedReasons.add("候选审计明确阻断正式发布");
  if (item.admission !== "approved_for_publish") blockedReasons.add("候选尚未完成人工审核批准");
  if (item.template_contamination) blockedReasons.add("模板污染");
  if (item.duplicate_of_candidate_id) blockedReasons.add("重复候选");
}
const report: ReleaseDryRun = {
  schema_version: "ich-ds1d-release-dry-run.v1",
  ran_at: new Date().toISOString(),
  readonly: true,
  formal_store_write: false,
  input: path.relative(process.cwd(), inputPath),
  input_candidates: audit.items.length,
  eligible_for_formal_publish: 0,
  would_add: 0,
  would_update: 0,
  would_withdraw: 0,
  blocked_reasons: [...blockedReasons],
  gate: blockedReasons.size > 0 ? "not_ready" : "no_write_safe",
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ output: path.relative(process.cwd(), outputPath), input_candidates: report.input_candidates, eligible_for_formal_publish: report.eligible_for_formal_publish, formal_store_write: report.formal_store_write, gate: report.gate, blocked_reasons: report.blocked_reasons }, null, 2));
