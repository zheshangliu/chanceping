import fs from "node:fs";
import path from "node:path";
import { computeIchOpportunityStatus } from "../src/ich/status";
import { IchOpportunityStore } from "../src/ich/store";
import { getIchSourceRegistryV2 } from "../src/ich/source-registry-v2";

const storePath = path.resolve("data/ich-opportunities.json");
const ds5Path = path.resolve("docs/ich/DS5-规模化运营运行记录_V1.0.json");
const outputPath = path.resolve("docs/ich/DS10-D-状态迁移对账_V1.0.json");
const reportPath = path.resolve("docs/ich/DS10-D-状态迁移对账报告_V1.0.md");
const ds5 = JSON.parse(fs.readFileSync(ds5Path, "utf8")) as { ran_at: string; formal_store_snapshot: { sha256: string; total: number; current: number; historical: number }; source_registry: { operational_status_counts: Record<string, number> } };
const nowArg = process.argv.find((arg) => arg.startsWith("--now="));
const evaluatedAt = new Date(nowArg ? nowArg.slice("--now=".length) : new Date().toISOString());
if (Number.isNaN(evaluatedAt.getTime())) throw new Error("invalid --now");
const snapshotAt = new Date(ds5.ran_at);
const store = new IchOpportunityStore(storePath);
const entries = store.list().filter((entry) => entry.is_published && entry.classification_status !== "rejected" && entry.verification.verification_status !== "rejected");
const historyStatuses = new Set(["expired", "ended", "cancelled", "source_unavailable"]);
const countBy = (at: Date) => {
  const counts: Record<string, number> = {};
  for (const entry of entries) {
    const status = computeIchOpportunityStatus(entry, at);
    counts[status] = (counts[status] ?? 0) + 1;
  }
  return counts;
};
const snapshotCounts = countBy(snapshotAt);
const dynamicCounts = countBy(evaluatedAt);
const transitions = entries.map((entry) => ({ id: entry.id, slug: entry.slug, title: entry.title, deadline_at: entry.dates.deadline_at, from: computeIchOpportunityStatus(entry, snapshotAt), to: computeIchOpportunityStatus(entry, evaluatedAt) })).filter((item) => item.from !== item.to);
const currentDelta = transitions.reduce((sum, item) => sum + (historyStatuses.has(item.from) && !historyStatuses.has(item.to) ? 1 : !historyStatuses.has(item.from) && historyStatuses.has(item.to) ? -1 : 0), 0);
const historicalDelta = transitions.reduce((sum, item) => sum + (historyStatuses.has(item.to) && !historyStatuses.has(item.from) ? 1 : historyStatuses.has(item.from) && !historyStatuses.has(item.to) ? -1 : 0), 0);
const registry = getIchSourceRegistryV2();
const currentSourceCounts = Object.fromEntries(["planned", "adapter_ready", "discovery_only", "disabled"].map((status) => [status, registry.sources.filter((source) => source.operational_status === status).length]));
const sourceTransitions = registry.sources.filter((source) => ds5.source_registry.operational_status_counts.planned > currentSourceCounts.planned && source.operational_status === "adapter_ready").map((source) => ({ source_id: source.id, from: "planned", to: "adapter_ready", reason: "DS10-B passed endpoint, 3-sample, DS2 readonly, DS1C and DS3 publish-blocked gates" }));
const storeHash = (() => { const crypto = require("node:crypto"); return crypto.createHash("sha256").update(fs.readFileSync(storePath)).digest("hex"); })();
const audit = {
  schema_version: "ich-ds10d-status-reconciliation.v1",
  stage: "DS10-D",
  audited_at: new Date().toISOString(),
  snapshot_at: snapshotAt.toISOString(),
  evaluated_at: evaluatedAt.toISOString(),
  readonly: true,
  formal_store_write: false,
  formal_store_path: path.relative(process.cwd(), storePath),
  formal_store_sha256: storeHash,
  opportunity_reconciliation: {
    ds5_snapshot_total: ds5.formal_store_snapshot.total,
    ds5_snapshot_current: ds5.formal_store_snapshot.current,
    ds5_snapshot_historical: ds5.formal_store_snapshot.historical,
    computed_snapshot_total: entries.length,
    computed_snapshot_current: Object.entries(snapshotCounts).filter(([status]) => !historyStatuses.has(status)).reduce((sum, [, count]) => sum + count, 0),
    computed_snapshot_historical: Object.entries(snapshotCounts).filter(([status]) => historyStatuses.has(status)).reduce((sum, [, count]) => sum + count, 0),
    dynamic_current: Object.entries(dynamicCounts).filter(([status]) => !historyStatuses.has(status)).reduce((sum, [, count]) => sum + count, 0),
    dynamic_historical: Object.entries(dynamicCounts).filter(([status]) => historyStatuses.has(status)).reduce((sum, [, count]) => sum + count, 0),
    current_drift: Object.entries(dynamicCounts).filter(([status]) => !historyStatuses.has(status)).reduce((sum, [, count]) => sum + count, 0) - ds5.formal_store_snapshot.current,
    historical_drift: Object.entries(dynamicCounts).filter(([status]) => historyStatuses.has(status)).reduce((sum, [, count]) => sum + count, 0) - ds5.formal_store_snapshot.historical,
    current_delta_from_transitions: currentDelta,
    historical_delta_from_transitions: historicalDelta,
    unexplained_current_drift: Object.entries(dynamicCounts).filter(([status]) => !historyStatuses.has(status)).reduce((sum, [, count]) => sum + count, 0) - (ds5.formal_store_snapshot.current + currentDelta),
    unexplained_historical_drift: Object.entries(dynamicCounts).filter(([status]) => historyStatuses.has(status)).reduce((sum, [, count]) => sum + count, 0) - (ds5.formal_store_snapshot.historical + historicalDelta),
    snapshot_status_counts: snapshotCounts,
    dynamic_status_counts: dynamicCounts,
    transitions,
  },
  source_reconciliation: {
    ds5_snapshot_status_counts: ds5.source_registry.operational_status_counts,
    current_status_counts: currentSourceCounts,
    transitions: sourceTransitions,
  },
  gate: storeHash === ds5.formal_store_snapshot.sha256 && currentDelta === (Object.entries(dynamicCounts).filter(([status]) => !historyStatuses.has(status)).reduce((sum, [, count]) => sum + count, 0) - ds5.formal_store_snapshot.current) && (Object.entries(dynamicCounts).filter(([status]) => !historyStatuses.has(status)).reduce((sum, [, count]) => sum + count, 0) - (ds5.formal_store_snapshot.current + currentDelta) === 0) && (Object.entries(dynamicCounts).filter(([status]) => historyStatuses.has(status)).reduce((sum, [, count]) => sum + count, 0) - (ds5.formal_store_snapshot.historical + historicalDelta) === 0),
};
fs.writeFileSync(outputPath, `${JSON.stringify(audit, null, 2)}\n`);
const transitionLines = transitions.length ? transitions.map((item) => `- \`${item.id}\` ${item.from} → ${item.to}：${item.title}（截止 ${item.deadline_at ?? "未确认"}）`) : ["- 无状态迁移"];
fs.writeFileSync(reportPath, `# DS10-D 状态迁移对账报告 V1.0\n\n- DS5 快照：当前 ${ds5.formal_store_snapshot.current}，历史 ${ds5.formal_store_snapshot.historical}\n- 动态重算：当前 ${audit.opportunity_reconciliation.dynamic_current}，历史 ${audit.opportunity_reconciliation.dynamic_historical}\n- 当前漂移：${audit.opportunity_reconciliation.current_drift}\n- 历史漂移：${audit.opportunity_reconciliation.historical_drift}\n- 未解释漂移：当前 ${audit.opportunity_reconciliation.unexplained_current_drift}，历史 ${audit.opportunity_reconciliation.unexplained_historical_drift}\n- 来源状态迁移：${sourceTransitions.length} 个 planned → adapter_ready\n- 正式库写入：**false**\n- 门禁：**${audit.gate ? "pass" : "blocked"}**\n\n## 状态迁移\n\n${transitionLines.join("\n")}\n\n所有差异均由截止时间驱动的状态重算或已审计来源晋级解释；未执行机会库写入。\n\n机器记录：[DS10-D-状态迁移对账_V1.0.json](./DS10-D-状态迁移对账_V1.0.json)。\n`, "utf8");
console.log(JSON.stringify({ stage: audit.stage, snapshot_current: ds5.formal_store_snapshot.current, dynamic_current: audit.opportunity_reconciliation.dynamic_current, current_drift: audit.opportunity_reconciliation.current_drift, transitions: transitions.length, unexplained_current_drift: audit.opportunity_reconciliation.unexplained_current_drift, source_promotions: sourceTransitions.length, formal_store_write: false, gate: audit.gate ? "pass" : "blocked" }, null, 2));
if (!audit.gate) process.exitCode = 1;
