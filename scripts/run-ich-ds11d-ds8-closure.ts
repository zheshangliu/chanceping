import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ledgerPath = path.resolve("docs/ich/DS8-全量复核动作账本_V1.0.json");
const confirmationPath = path.resolve("docs/ich/DS11-A-DS8首批人工处置确认_V1.0.json");
const fieldReviewPath = path.resolve("docs/ich/DS11-B-DS8字段复核首批_V1.0.json");
const outputPath = path.resolve("docs/ich/DS11-D-DS8人工队列闭环_V1.0.json");
const reportPath = path.resolve("docs/ich/DS11-D-DS8人工队列闭环报告_V1.0.md");
const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8")) as { results: Array<Record<string, any>>; formal_store_before_sha256: string; formal_store_after_sha256: string; formal_publish_blocked_count: number };
const confirmation = JSON.parse(fs.readFileSync(confirmationPath, "utf8")) as { resolutions: Array<Record<string, any>>; formal_store_write: boolean; formal_store_unchanged: boolean; publish_count: number };
const fieldReview = JSON.parse(fs.readFileSync(fieldReviewPath, "utf8")) as { reviews: Array<Record<string, any>>; formal_store_write: boolean; formal_store_unchanged: boolean; publish_count: number };
const results = ledger.results;
const reviewedIds = new Set([...confirmation.resolutions, ...fieldReview.reviews].map((item) => item.id));
const duplicateGroups = new Map<string, Set<string>>();
for (const item of results.filter((item) => item.disposition === "duplicate_review")) {
  const ids = [item.id, ...(item.duplicate_slugs ?? [])].sort();
  const key = String(item.queue_primary_url ?? ids.join("|"));
  const prior = duplicateGroups.get(key) ?? new Set<string>();
  for (const id of ids) prior.add(id);
  duplicateGroups.set(key, prior);
}
const counts = Object.fromEntries([...new Set(results.map((item) => item.disposition))].map((disposition) => [disposition, results.filter((item) => item.disposition === disposition).length]));
const actions = {
  ready_for_manual_confirmation: { records: confirmation.resolutions, action: "confirmed_existing_record_no_change", write: false },
  manual_field_review: { reviewed: fieldReview.reviews, reviewed_count: fieldReview.reviews.length, remaining_count: results.filter((item) => item.disposition === "manual_field_review" && !reviewedIds.has(item.id)).length, action: "field_reviewed_or_held_for_patch", write: false },
  duplicate_review: { groups: [...duplicateGroups.entries()].map(([pair, ids]) => ({ pair, ids: [...ids], decision: "hold_duplicate_pair_no_write", reason: "两条正式记录共用同一主来源；未获单独撤回授权，不自动删除或撤回任何一条。" })), action: "hold_duplicate_pair_no_write", write: false },
  archive_review: { count: counts.archive_review ?? 0, action: "archive_candidate_hold_no_write", reason: "已过期或历史记录保留在历史集合，未覆盖正式库状态。", write: false },
  source_unavailable: { count: counts.source_unavailable ?? 0, action: "source_recovery_retry_hold_no_write", reason: "主来源不可访问或返回非 2xx，未用二手页面替代，暂不发布或撤回。", write: false },
};
const formalStoreUnchanged = ledger.formal_store_before_sha256 === ledger.formal_store_after_sha256 && confirmation.formal_store_write === false && confirmation.formal_store_unchanged === true && confirmation.publish_count === 0 && fieldReview.formal_store_write === false && fieldReview.formal_store_unchanged === true && fieldReview.publish_count === 0;
const artifact = {
  schema_version: "ich-ds11d-ds8-closure.v1",
  stage: "DS11-D",
  audited_at: new Date().toISOString(),
  readonly: true,
  queue_total: results.length,
  disposition_counts: counts,
  duplicate_group_count: duplicateGroups.size,
  reviewed_count: reviewedIds.size,
  actions,
  formal_store_path: "data/ich-opportunities.json",
  formal_store_write: false,
  formal_store_before_sha256: ledger.formal_store_before_sha256,
  formal_store_after_sha256: ledger.formal_store_after_sha256,
  formal_store_unchanged: formalStoreUnchanged,
  publish_count: 0,
  all_records_have_action: results.every((item) => Object.prototype.hasOwnProperty.call(actions, item.disposition)),
  gate: formalStoreUnchanged && results.length === 114 ? "pass_with_followups" : "blocked",
};
fs.writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);
fs.writeFileSync(reportPath, `# DS11-D DS8 人工队列闭环报告 V1.0\n\n- 队列总数：**${artifact.queue_total}**\n- 已逐条分派动作：**${artifact.all_records_have_action ? "是" : "否"}**\n- 已直接复核记录：**${artifact.reviewed_count}**（DS11-A 4 条、DS11-B 5 条，可能有重叠）\n- 重复来源组：**${artifact.duplicate_group_count}**，全部保持成对挂起，不自动删除/撤回\n- 正式库写入：**false**；发布：**0**\n- 正式库哈希不变：**${artifact.formal_store_unchanged}**\n- 门禁：**${artifact.gate}**\n\n## 队列处置\n\n- ready_for_manual_confirmation：4 条已实时复核，均为已有正式记录，确认后不重复写入。\n- manual_field_review：5 条已复核；其中 1 条确认无变化，2 条形成字段补丁但保持写入冻结，2 条因来源冲突/仅主页而挂起；剩余记录保留字段复核队列。\n- duplicate_review：8 条组成 4 组，因两条记录均存在且撤回属于正式库变更，全部保留为待授权动作。\n- archive_review：${counts.archive_review ?? 0} 条归为历史/过期候选，保留在历史审查队列，不覆盖当前集合。\n- source_unavailable：${counts.source_unavailable ?? 0} 条进入来源恢复重试队列，不以不可核验页面替代。\n\n本阶段完成的是“人工动作分派、证据确认与安全冻结”，不是未经审核的批量清理或发布。DS13 只处理已形成证据的字段补丁；DS14 才能在单独批次审计通过后写入正式库。\n\n机器记录：[DS11-D-DS8人工队列闭环_V1.0.json](./DS11-D-DS8人工队列闭环_V1.0.json)。\n`, "utf8");
console.log(JSON.stringify({ stage: artifact.stage, queue_total: artifact.queue_total, reviewed_count: artifact.reviewed_count, duplicate_group_count: artifact.duplicate_group_count, formal_store_write: false, formal_store_unchanged: artifact.formal_store_unchanged, gate: artifact.gate }, null, 2));
if (artifact.gate === "blocked") process.exitCode = 1;
