import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const storePath = path.resolve("data/ich-opportunities.json");
const ds3Path = path.resolve("docs/ich/DS3-候选质量运行记录_V1.0.json");
const outputPath = path.resolve("docs/ich/DS14-受控导入门禁审计_V1.0.json");
const raw = fs.readFileSync(storePath, "utf8");
const ds3 = JSON.parse(fs.readFileSync(ds3Path, "utf8")) as { assessment_count: number; approved_count: number; formal_store_write: boolean; gate: string };
const storeHash = crypto.createHash("sha256").update(raw).digest("hex");
const approved = ds3.approved_count;
const audit = {
  schema_version: "ich-ds14-controlled-import.v1",
  stage: "DS14",
  audited_at: new Date().toISOString(),
  batch_limit: 10,
  candidate_assessment_count: ds3.assessment_count,
  approved_candidate_count: approved,
  import_decision: approved > 0 ? "requires_explicit_batch_review" : "hold_no_approved_candidates",
  selected_count: 0,
  formal_store_path: "data/ich-opportunities.json",
  formal_store_write: false,
  formal_store_before_sha256: storeHash,
  formal_store_after_sha256: storeHash,
  formal_store_unchanged: true,
  rollback_backup: null,
  publish_count: 0,
  release_boundary: "仅 DS3 approved + DS1-D 审批包 + 单批不超过10条 + 主来源可访问 + 去重/语义/时效门禁全部通过后才可写入；当前没有批准候选，因此不写入。",
  gate: ds3.gate === "pass" && ds3.formal_store_write === false && approved === 0 ? "pass_with_followups" : "blocked",
};
fs.writeFileSync(outputPath, `${JSON.stringify(audit, null, 2)}\n`);
console.log(JSON.stringify({ stage: audit.stage, import_decision: audit.import_decision, approved_candidate_count: approved, formal_store_write: false, formal_store_unchanged: true, gate: audit.gate }, null, 2));
if (audit.gate === "blocked") process.exitCode = 1;
