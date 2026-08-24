import fs from "node:fs";
import path from "node:path";

const sourceIds = ["gdmoa", "unesco-ich"];
const registryPath = path.resolve("src/ich/source-registry.v2.json");
const ds1bPath = path.resolve("docs/ich/DS1-B-候选样本运行记录_V1.0.json");
const ds1cPath = path.resolve("docs/ich/DS1-C-候选审计记录_V1.0.json");
const ds2Path = path.resolve("docs/ich/DS2-只读发现运行记录_V1.0.json");
const ds3Path = path.resolve("docs/ich/DS3-候选质量运行记录_V1.0.json");
const outputPath = path.resolve("docs/ich/DS12-来源扩展状态审计_V1.0.json");
const reportPath = path.resolve("docs/ich/DS12-来源扩展状态审计报告_V1.0.md");

const registry = JSON.parse(fs.readFileSync(registryPath, "utf8")) as { sources: Array<Record<string, unknown>> };
const ds1b = JSON.parse(fs.readFileSync(ds1bPath, "utf8")) as { gate: string; formal_store_write: boolean; runs: Array<Record<string, unknown>> };
const ds1c = JSON.parse(fs.readFileSync(ds1cPath, "utf8")) as { gate: string; formal_store_write?: boolean; template_contamination_count: number; duplicate_count: number; items: Array<Record<string, unknown>> };
const ds2 = JSON.parse(fs.readFileSync(ds2Path, "utf8")) as { gate: string; formal_store_write: boolean; readonly: boolean; source_runs: Array<Record<string, unknown>> };
const ds3 = JSON.parse(fs.readFileSync(ds3Path, "utf8")) as { gate: string; formal_store_write: boolean; approved_count: number; assessments: Array<Record<string, unknown>> };

const sources = sourceIds.map((sourceId) => {
  const source = registry.sources.find((item) => item.id === sourceId);
  const adapter = ds1b.runs.find((item) => item.source_id === sourceId);
  const ds2Status = ds2.source_runs.find((item) => item.source_id === sourceId);
  const candidates = ds1c.items.filter((item) => item.source_id === sourceId);
  const assessments = ds3.assessments.filter((item) => item.source_id === sourceId);
  const adapterSampleCount = Array.isArray(adapter?.samples) ? adapter.samples.length : Number(adapter?.samples ?? 0);
  const ds2CandidateCount = Array.isArray(ds2Status?.candidates) ? ds2Status.candidates.length : Number(ds2Status?.candidates ?? 0);
  const promotionEligible = Boolean(source && source.operational_status === "planned" && adapterSampleCount >= 3 && ds2Status?.status === "completed" && ds2CandidateCount >= 3 && candidates.length >= 3 && candidates.every((item) => item.admission === "candidate_review") && assessments.length >= 3 && assessments.every((item) => item.formal_publish_blocked === true));
  return { source_id: sourceId, before_status: source?.operational_status ?? null, adapter_samples: adapterSampleCount, ds1c_candidates: candidates.length, ds1c_blocked: candidates.filter((item) => item.admission !== "candidate_review").length, ds2_status: ds2Status?.status ?? null, ds2_candidates: ds2CandidateCount, ds3_assessments: assessments.length, ds3_approved: assessments.filter((item) => item.decision === "approved").length, ds3_rejected: assessments.filter((item) => item.decision === "reject").length, promotion_eligible: promotionEligible };
});
const eligible = sources.every((item) => item.promotion_eligible) && ds1b.gate === "pass" && ds1b.formal_store_write !== true && ds1c.gate === "pass" && ds1c.formal_store_write !== true && ds1c.template_contamination_count === 0 && ds1c.duplicate_count === 0 && ds2.gate === "pass" && ds2.readonly === true && ds2.formal_store_write === false && ds3.gate === "pass" && ds3.approved_count === 0 && ds3.formal_store_write === false;
const audit = { schema_version: "ich-ds12-source-reconciliation.v1", stage: "DS12", audited_at: new Date().toISOString(), source_ids: sourceIds, readonly: true, formal_store_write: false, upstream_gates: { ds1b: ds1b.gate, ds1c: ds1c.gate, ds2: ds2.gate, ds3: ds3.gate }, global_safety: { ds1b_formal_store_write: ds1b.formal_store_write, ds1c_template_contamination: ds1c.template_contamination_count, ds1c_duplicates: ds1c.duplicate_count, ds2_formal_store_write: ds2.formal_store_write, ds3_approved_count: ds3.approved_count, ds3_formal_store_write: ds3.formal_store_write }, promotion_decision: eligible ? "eligible_for_registry_status_promotion" : "hold", sources, gate: eligible ? "pass_with_followups" : "blocked" };
fs.writeFileSync(outputPath, `${JSON.stringify(audit, null, 2)}\n`);
const sourceLines = sources.map((item) => `- ${item.source_id}：DS1-B ${item.adapter_samples} 样本；DS1-C ${item.ds1c_candidates} 候选；DS2 ${item.ds2_status}；DS3 ${item.ds3_assessments} 评估，批准 ${item.ds3_approved}，${item.promotion_eligible ? "可晋级" : "暂缓"}`).join("\n");
fs.writeFileSync(reportPath, `# DS12 来源扩展状态审计报告 V1.0\n\n- 来源：${sourceIds.join("、")}\n- 只读：**true**\n- 正式库写入：**false**\n- 晋级决定：**${audit.promotion_decision}**\n- 门禁：**${audit.gate}**\n\n${sourceLines}\n\n本审计只证明来源适配器与只读质量链路可运行，不代表候选已获准写入正式机会库；详情页、资格、地区、分类和时效仍须逐条人工确认。\n\n机器记录：[DS12-来源扩展状态审计_V1.0.json](./DS12-来源扩展状态审计_V1.0.json)。\n`, "utf8");
console.log(JSON.stringify({ stage: audit.stage, source_ids: sourceIds, promotion_decision: audit.promotion_decision, gate: audit.gate, formal_store_write: false }, null, 2));
if (audit.gate === "blocked") process.exitCode = 1;
