import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { computeIchOpportunityStatus } from "../src/ich/status";
import { IchOpportunityStore } from "../src/ich/store";

const now = new Date(process.argv.includes("--now") ? process.argv[process.argv.indexOf("--now") + 1] : "2026-08-24T16:00:00+08:00");
if (Number.isNaN(now.getTime())) throw new Error("invalid --now");
const storePath = path.resolve("data/ich-opportunities.json");
const raw = fs.readFileSync(storePath);
const entries = new IchOpportunityStore(storePath).list();
const statusCounts: Record<string, number> = {};
const duplicateMap = new Map<string, string[]>();
let staleRecheck = 0;
for (const entry of entries) {
  const status = computeIchOpportunityStatus(entry, now);
  statusCounts[status] = (statusCounts[status] ?? 0) + 1;
  if (entry.verification.needs_recheck || (entry.verification.recheck_after && new Date(entry.verification.recheck_after).getTime() <= now.getTime())) staleRecheck += 1;
  if (!entry.is_published || entry.workflow.state !== "published") continue;
  const primary = entry.sources.find((source) => source.is_primary);
  if (!primary) continue;
  const url = primary.url.replace(/#.*$/, "").replace(/\/$/, "");
  const group = duplicateMap.get(url) ?? []; group.push(entry.slug); duplicateMap.set(url, group);
}
const duplicateGroups = [...duplicateMap.entries()].filter(([, slugs]) => slugs.length > 1).map(([url, slugs]) => ({ url, slugs }));
const errors = duplicateGroups.length ? [`published primary URL duplicate groups=${duplicateGroups.length}`] : [];
const audit = { schema_version: "ich-ds8-lifecycle-audit.v1", stage: "DS8", audited_at: now.toISOString(), gate: errors.length > 0 ? "blocked" : staleRecheck > 0 ? "pass_with_followups" : "pass", formal_store: { sha256: crypto.createHash("sha256").update(raw).digest("hex"), total: entries.length }, status_counts: statusCounts, stale_recheck_count: staleRecheck, published_primary_url_duplicate_groups: duplicateGroups, batch_policy: { max_batch_size: 10, requires_approved_workflow: true, formal_store_write: false }, errors };
const outputPath = path.resolve("docs/ich/DS8-生命周期审计记录_V1.0.json");
const reportPath = path.resolve("docs/ich/DS8-生命周期审计报告_V1.0.md");
fs.writeFileSync(outputPath, `${JSON.stringify(audit, null, 2)}\n`);
fs.writeFileSync(reportPath, `# DS8 生命周期与受控批量发布审计报告 V1.0\n\n- 门禁：**${audit.gate}**\n- 正式库：${entries.length} 条\n- 运行状态：${Object.entries(statusCounts).map(([key, value]) => `${key}=${value}`).join("，")}\n- 待复核记录：${staleRecheck}\n- 已发布主来源重复组：${duplicateGroups.length}\n- 批次上限：10 条\n- 正式库写入：**false**\n\n## 发布安全阀\n\n候选必须是 \`approved\`、未发布、主来源可访问、无重复、未过期且通过语义校验；不满足任一条件即阻断。\n\n机器记录：[DS8-生命周期审计记录_V1.0.json](./DS8-生命周期审计记录_V1.0.json)。\n`, "utf8");
console.log(JSON.stringify({ gate: audit.gate, formal_store_total: entries.length, stale_recheck: staleRecheck, duplicate_groups: duplicateGroups.length, formal_store_write: false }, null, 2));
if (errors.length) process.exitCode = 1;
