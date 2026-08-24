import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ICH_DS1B_ADAPTERS } from "../src/ich/source-adapters-v1";
import { getIchSourceRegistryV2 } from "../src/ich/source-registry-v2";

const sourceIds = ["gz-culture", "cnacs", "gdmuseum"];
const registry = getIchSourceRegistryV2();
const ds1b = JSON.parse(fs.readFileSync(path.resolve("docs/ich/DS1-B-候选样本运行记录_V1.0.json"), "utf8")) as { formal_store_write: boolean; gate: string; runs: Array<{ source_id: string; adapter_id: string; samples: unknown[]; error: string | null }> };
const ds1c = JSON.parse(fs.readFileSync(path.resolve("docs/ich/DS1-C-候选审计记录_V1.0.json"), "utf8")) as { formal_store_write?: boolean; gate: string; template_contamination_count: number; duplicate_count: number; items: Array<{ source_id: string; admission: string; formal_publish_blocked: boolean }> };
const ds2 = JSON.parse(fs.readFileSync(path.resolve("docs/ich/DS2-只读发现运行记录_V1.0.json"), "utf8")) as { formal_store_write: boolean; gate: string; source_runs: Array<{ source_id: string; status: string; candidate_count: number }>; formal_store_before_sha256: string };
const ds3 = JSON.parse(fs.readFileSync(path.resolve("docs/ich/DS3-候选质量运行记录_V1.0.json"), "utf8")) as { formal_store_write: boolean; gate: string; approved_count: number; assessments: Array<{ source_id: string; formal_publish_blocked: boolean; decision: string }>; formal_store_before_sha256: string };
const storePath = path.resolve("data/ich-opportunities.json");
const outputPath = path.resolve("docs/ich/DS10-B-来源晋级批次_V1.0.json");
const reportPath = path.resolve("docs/ich/DS10-B-来源晋级批次报告_V1.0.md");

const storeHash = crypto.createHash("sha256").update(fs.readFileSync(storePath)).digest("hex");
const sources = sourceIds.map((sourceId) => {
  const source = registry.sources.find((item) => item.id === sourceId);
  const adapter = ICH_DS1B_ADAPTERS.find((item) => item.source_id === sourceId);
  const sampleRun = ds1b.runs.find((run) => run.source_id === sourceId);
  const discoveryRun = ds2.source_runs.find((run) => run.source_id === sourceId);
  const candidateItems = ds1c.items.filter((item) => item.source_id === sourceId);
  const assessments = ds3.assessments.filter((item) => item.source_id === sourceId);
  const checks = {
    registry_adapter_ready: source?.operational_status === "adapter_ready",
    adapter_registered: Boolean(adapter),
    sample_run_present: Boolean(sampleRun),
    sample_minimum_met: (sampleRun?.samples.length ?? 0) >= 3,
    sample_run_clean: sampleRun?.error === null,
    readonly_discovery_completed: discoveryRun?.status === "completed",
    readonly_candidates_minimum_met: (discoveryRun?.candidate_count ?? 0) >= 3,
    candidate_audit_present: candidateItems.length >= 3,
    candidate_audit_blocked_or_reviewed: candidateItems.every((item) => item.formal_publish_blocked && ["candidate_review", "blocked"].includes(item.admission)),
    ds3_present: assessments.length >= 3,
    ds3_publish_blocked: assessments.every((item) => item.formal_publish_blocked),
  };
  return { source_id: sourceId, adapter_id: adapter?.adapter_id ?? null, operational_status: source?.operational_status ?? null, checks, sample_count: sampleRun?.samples.length ?? 0, readonly_candidate_count: discoveryRun?.candidate_count ?? 0, candidate_review_count: candidateItems.filter((item) => item.admission === "candidate_review").length, candidate_blocked_count: candidateItems.filter((item) => item.admission === "blocked").length, ds3_review_or_rejected_count: assessments.filter((item) => item.decision !== "approved").length };
});
const allChecks = sources.every((source) => Object.values(source.checks).every(Boolean));
const audit = {
  schema_version: "ich-ds10b-source-promotion-audit.v1",
  stage: "DS10-B",
  audited_at: new Date().toISOString(),
  source_count: sources.length,
  source_ids: sourceIds,
  readonly: true,
  formal_store_write: false,
  formal_store_path: path.relative(process.cwd(), storePath),
  formal_store_sha256: storeHash,
  upstream_gates: { ds1b: ds1b.gate, ds1c: ds1c.gate, ds2: ds2.gate, ds3: ds3.gate },
  global_safety_checks: { ds1b_formal_store_write: ds1b.formal_store_write, ds1c_template_contamination: ds1c.template_contamination_count, ds1c_duplicates: ds1c.duplicate_count, ds2_formal_store_write: ds2.formal_store_write, ds3_formal_store_write: ds3.formal_store_write, ds3_approved_count: ds3.approved_count, store_hash_matches_ds2: storeHash === ds2.formal_store_before_sha256, store_hash_matches_ds3: storeHash === ds3.formal_store_before_sha256 },
  sources,
  promotion_decision: allChecks ? "adapter_ready_with_formal_publish_blocked" : "hold",
  gate: allChecks && ds1c.template_contamination_count === 0 && ds1c.duplicate_count === 0 && ds3.approved_count === 0 && storeHash === ds2.formal_store_before_sha256 && storeHash === ds3.formal_store_before_sha256 ? "pass_with_followups" : "blocked",
};
fs.writeFileSync(outputPath, `${JSON.stringify(audit, null, 2)}\n`);
const sourceLines = sources.map((source) => `- \`${source.source_id}\` / \`${source.adapter_id}\`：只读样本 ${source.sample_count} 条，DS2 候选 ${source.readonly_candidate_count} 条，DS3 保持发布阻断。`);
fs.writeFileSync(reportPath, `# DS10-B 来源晋级批次报告 V1.0\n\n- 本批来源：${sources.length} 个\n- 上游门禁：DS1B=${ds1b.gate}，DS1C=${ds1c.gate}，DS2=${ds2.gate}，DS3=${ds3.gate}\n- 晋级决定：**${audit.promotion_decision}**\n- 正式库写入：**false**\n- DS3 批准数：**${ds3.approved_count}**\n- 门禁：**${audit.gate}**\n\n## 来源证据\n\n${sourceLines.join("\n")}\n\n本批只证明来源具备可重复的只读采集能力，不代表候选机会已获正式发布资格。候选仍需人工字段确认和受控入库。\n\n机器记录：[DS10-B-来源晋级批次_V1.0.json](./DS10-B-来源晋级批次_V1.0.json)。\n`, "utf8");
console.log(JSON.stringify({ stage: audit.stage, source_count: audit.source_count, sources: sources.map((source) => ({ source_id: source.source_id, adapter_id: source.adapter_id, sample_count: source.sample_count, readonly_candidate_count: source.readonly_candidate_count })), promotion_decision: audit.promotion_decision, ds3_approved_count: ds3.approved_count, formal_store_write: false, gate: audit.gate }, null, 2));
if (audit.gate === "blocked") process.exitCode = 1;
