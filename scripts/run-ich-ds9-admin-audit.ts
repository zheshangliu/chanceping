import fs from "node:fs";
import path from "node:path";
import { buildIchOperationsDashboard } from "../src/ich/operations-dashboard-v1";

const dashboard = buildIchOperationsDashboard({ now: new Date() });
const errors: string[] = [];
if (dashboard.formal_store.total === 0) errors.push("formal store is empty");
if (dashboard.source_registry.total === 0) errors.push("source registry is empty");
if (dashboard.ds6_schedule.formal_store_write) errors.push("DS6 schedule enables formal store write");
if (dashboard.ds8_lifecycle.duplicate_groups > 0) errors.push("published primary URL duplicates exist");
if (dashboard.ds8_lifecycle.formal_store_write) errors.push("DS8 batch policy enables formal store write");
if (dashboard.ds8_lifecycle.full_recheck.processed !== dashboard.ds8_lifecycle.full_recheck.queue_total) errors.push("DS8 full recheck ledger does not cover its queue");
if (!dashboard.ds8_lifecycle.full_recheck.formal_store_unchanged) errors.push("DS8 full recheck did not prove formal store unchanged");
const audit = {
  schema_version: "ich-ds9-admin-operations-audit.v1",
  stage: "DS9",
  audited_at: dashboard.generated_at,
  gate: errors.length === 0 ? "pass" : "blocked",
  formal_store_write: false,
  dashboard,
  errors,
};
const outputPath = path.resolve("docs/ich/DS9-后台运营审计记录_V1.0.json");
const reportPath = path.resolve("docs/ich/DS9-后台运营审计报告_V1.0.md");
const report = [
  "# DS9 后台运营审计报告 V1.0",
  "",
  `- 门禁：**${audit.gate}**`,
  `- 正式机会库：${dashboard.formal_store.total} 条（动态当前 ${dashboard.formal_store.current} 条，历史 ${dashboard.formal_store.historical} 条）`,
  `- DS5 快照漂移：当前 ${dashboard.ds5_snapshot.snapshot_current ?? "未确认"} → 动态 ${dashboard.ds5_snapshot.dynamic_current}（差值 ${dashboard.ds5_snapshot.current_drift ?? "未确认"}）`,
  `- 待复核队列：${dashboard.formal_store.stale_recheck} 条`,
  `- 来源注册：${dashboard.source_registry.total} 个；DS7 流程 ${dashboard.source_workflows.total} 条`,
  `- DS6：${dashboard.ds6_schedule.interval_days} 天周期，${dashboard.ds6_schedule.run_count} 次账本运行，正式库写入 **false**`,
  `- DS8：${dashboard.ds8_lifecycle.gate}；重复主来源 ${dashboard.ds8_lifecycle.duplicate_groups} 组；正式库写入 **false**`,
  `- DS8-R2：动作账本 ${dashboard.ds8_lifecycle.full_recheck.processed}/${dashboard.ds8_lifecycle.full_recheck.queue_total} 条；可访问 ${dashboard.ds8_lifecycle.full_recheck.accessible}；不可访问 ${dashboard.ds8_lifecycle.full_recheck.inaccessible}；需人工处置 ${dashboard.ds8_lifecycle.full_recheck.pending_actions}`,
  "- 仪表盘正式库写入：**false**",
  "",
  "## 已实现",
  "",
  "- 受保护接口：`GET /api/internal/ich/operations`，必须使用管理凭据 Bearer 认证。",
  "- 后台首页展示正式库状态、来源注册、来源流程、DS6 调度、DS8 生命周期与安全边界。",
  "- 页面仍保持 no-store、noindex、CSP 与 frame 防护；不返回 token、IP、User-Agent 或环境变量值。",
  "",
  "## 需继续处理",
  "",
  "DS8 当前为 `pass_with_followups` 时，面板会显式展示待复核数量；该数量不触发未经审核的批量发布。DS5 快照与动态状态不一致时，面板明确展示差值，不覆盖旧账本。",
  "",
  "机器记录：[DS9-后台运营审计记录_V1.0.json](./DS9-后台运营审计记录_V1.0.json)。",
  "",
].join("\n");
fs.writeFileSync(outputPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
fs.writeFileSync(reportPath, report, "utf8");
console.log(JSON.stringify({ gate: audit.gate, formal_store_total: dashboard.formal_store.total, current: dashboard.formal_store.current, stale_recheck: dashboard.formal_store.stale_recheck, source_count: dashboard.source_registry.total, formal_store_write: false }, null, 2));
if (errors.length > 0) process.exitCode = 1;
