import fs from "node:fs";
import path from "node:path";
import { getIchSourceRegistryV2, validateIchSourceRegistryV2 } from "../src/ich/source-registry-v2";

const nowRaw = process.argv.includes("--now") ? process.argv[process.argv.indexOf("--now") + 1] : "2026-08-24T16:00:00+08:00";
const now = new Date(nowRaw);
if (Number.isNaN(now.getTime())) throw new Error(`Invalid --now value: ${nowRaw}`);
const ds4 = JSON.parse(fs.readFileSync(path.resolve("docs/ich/DS4-发布候选审计记录_V1.0.json"), "utf8")) as { gate: string; formal_store: { sha256: string; total: number }; counts: { current: number; historical: number }; source_levels: { level12_ratio: number }; errors: string[] };
const ds2 = JSON.parse(fs.readFileSync(path.resolve("docs/ich/DS2-只读发现运行记录_V1.0.json"), "utf8")) as { gate: string; readonly: boolean; formal_store_write: boolean; formal_store_unchanged: boolean; candidate_count: number };
const ds3 = JSON.parse(fs.readFileSync(path.resolve("docs/ich/DS3-候选质量运行记录_V1.0.json"), "utf8")) as { gate: string; formal_store_write: boolean; assessment_count: number; review_required_count: number; rejected_count: number; assessments: unknown[] };
const registry = getIchSourceRegistryV2();
const registryErrors = validateIchSourceRegistryV2(registry);
const scanCounts = Object.fromEntries(["daily", "every_3_days", "weekly"].map((frequency) => [frequency, registry.sources.filter((source) => source.scan_frequency === frequency).length]));
const statusCounts = Object.fromEntries(["planned", "discovery_only", "adapter_ready", "disabled"].map((status) => [status, registry.sources.filter((source) => source.operational_status === status).length]));
const errors = [...registryErrors];
if (ds4.gate !== "pass") errors.push("DS4 gate is not pass");
if (!["pass", "pass_with_followups"].includes(ds2.gate) || !ds2.readonly || ds2.formal_store_write) errors.push("DS2 readonly contract is not satisfied");
if (ds3.gate !== "pass" || ds3.formal_store_write) errors.push("DS3 candidate contract is not satisfied");
const nextRunAt = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString();
const record = {
  schema_version: "1.0",
  stage: "DS5",
  run_id: `ich-ds5-${now.toISOString().replace(/[-:TZ.]/g, "").slice(0, 14)}`,
  ran_at: now.toISOString(),
  gate: errors.length === 0 ? "pass" : "blocked",
  operation_mode: "candidate_discovery_and_review",
  formal_store_write: false,
  promotion_policy: "仅通过 DS1-D 审批包的条目允许受控晋级；发现、审计和质量分层不得写正式库。",
  next_scheduled_run_at: nextRunAt,
  source_registry: { total: registry.sources.length, scan_frequency_counts: scanCounts, operational_status_counts: statusCounts, query_packs: registry.query_packs.length },
  upstream_runs: { ds4_gate: ds4.gate, ds2_gate: ds2.gate, ds2_candidate_count: ds2.candidate_count, ds3_gate: ds3.gate, ds3_assessments: ds3.assessment_count ?? ds3.assessments.length, ds3_review_required: ds3.review_required_count, ds3_rejected: ds3.rejected_count },
  formal_store_snapshot: { sha256: ds4.formal_store.sha256, total: ds4.formal_store.total, current: ds4.counts.current, historical: ds4.counts.historical, level12_ratio: ds4.source_levels.level12_ratio },
  errors,
};
const outputPath = path.resolve("docs/ich/DS5-规模化运营运行记录_V1.0.json");
const reportPath = path.resolve("docs/ich/DS5-规模化运营报告_V1.0.md");
fs.writeFileSync(outputPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
fs.writeFileSync(reportPath, `# DS5 规模化运营报告 V1.0\n\n- 门禁：**${record.gate}**\n- 运行时间：${record.ran_at}\n- 运行模式：候选发现与人工审核，不写正式库\n- 下次建议运行：${record.next_scheduled_run_at}\n- 注册来源：${registry.sources.length} 个；查询包 ${registry.query_packs.length} 个\n- 正式库快照：${ds4.formal_store.total} 条（当前 ${ds4.counts.current}，历史 ${ds4.counts.historical}）\n- DS2：${ds2.candidate_count} 条只读候选；DS3：${record.upstream_runs.ds3_assessments} 条质量评估（待审 ${ds3.review_required_count}，拒绝 ${ds3.rejected_count}）\n- 正式库写入：**false**\n\n## 运行频率\n\n${Object.entries(scanCounts).map(([key, value]) => `- ${key}: ${value}`).join("\n")}\n\n## 持续优化边界\n\n1. 每次先运行来源健康/端点核验，再进入只读发现。\n2. 候选必须经过语义、去重、状态和来源审计。\n3. 只有 DS1-D 审批包通过的条目可以单批受控导入。\n4. 导入后刷新 DS2/DS3 基线并进行 API、SSR、完整回归。\n5. 任何来源失效或字段冲突先降级/撤回，不以数量换取可信度。\n\n## 错误\n\n${errors.length ? errors.map((error) => `- ${error}`).join("\n") : "- 无"}\n\n机器记录：[DS5-规模化运营运行记录_V1.0.json](./DS5-规模化运营运行记录_V1.0.json)。\n`, "utf8");
console.log(JSON.stringify({ gate: record.gate, sources: registry.sources.length, current: ds4.counts.current, historical: ds4.counts.historical, next_scheduled_run_at: nextRunAt, formal_store_write: false }, null, 2));
if (errors.length) process.exitCode = 1;
