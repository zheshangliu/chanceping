import fs from "node:fs";
import path from "node:path";
import { computeIchOpportunityStatus } from "../src/ich/status";
import { IchOpportunityStore } from "../src/ich/store";

const now = new Date(process.argv.includes("--now") ? process.argv[process.argv.indexOf("--now") + 1] : "2026-08-24T16:00:00+08:00");
if (Number.isNaN(now.getTime())) throw new Error("invalid --now");
const storePath = path.resolve("data/ich-opportunities.json");
const entries = new IchOpportunityStore(storePath).list();
const historyStatuses = new Set(["expired", "ended", "cancelled", "source_unavailable"]);
const dayMs = 24 * 60 * 60 * 1000;
const stale = entries.filter((entry) => entry.verification.needs_recheck || (entry.verification.recheck_after && new Date(entry.verification.recheck_after).getTime() <= now.getTime()));

function daysToDeadline(value: string | null): number | null {
  if (!value) return null;
  const parsed = new Date(value.includes("T") ? value : `${value}T23:59:59+08:00`);
  return Number.isNaN(parsed.getTime()) ? null : Math.ceil((parsed.getTime() - now.getTime()) / dayMs);
}

function classify(entry: typeof entries[number]) {
  const status = computeIchOpportunityStatus(entry, now);
  const days = daysToDeadline(entry.dates.deadline_at);
  const level = entry.sources.find((source) => source.is_primary)?.level ?? "unknown";
  let priority = 20;
  let queue = "archive_or_recheck";
  let action = "确认官方页面是否仍有效；若已结束则转历史或撤回";
  if (status === "closing_soon" || (status === "pending_confirmation" && days !== null && days <= 14)) {
    priority = 100; queue = "urgent_deadline"; action = "立即回到主来源复核截止日期、资格和行动方式";
  } else if (status === "active" || (status === "pending_confirmation" && days !== null && days <= 30)) {
    priority = 80; queue = "current_recheck"; action = "复核主来源可访问性、日期、地区和分类字段";
  } else if (status === "pending_confirmation") {
    priority = 55; queue = "field_confirmation"; action = "补齐未知或冲突字段；未确认内容保持未知";
  } else if (historyStatuses.has(status)) {
    priority = 25; queue = "history_cleanup"; action = "确认结束/取消证据并移入历史集合或保留线索标记";
  }
  if (level === "L1") priority += 10;
  else if (level === "L2") priority += 5;
  return { id: entry.id, slug: entry.slug, title: entry.title, status, primary_level: level, deadline_at: entry.dates.deadline_at, days_to_deadline: days, queue, priority, action, primary_url: entry.sources.find((source) => source.is_primary)?.url ?? null };
}

const queue = stale.map(classify).sort((a, b) => b.priority - a.priority || (a.days_to_deadline ?? 9999) - (b.days_to_deadline ?? 9999) || a.slug.localeCompare(b.slug));
const counts = Object.fromEntries([...new Set(queue.map((item) => item.queue))].map((key) => [key, queue.filter((item) => item.queue === key).length]));
const audit = { schema_version: "ich-ds8-recheck-queue.v1", stage: "DS8-R0", generated_at: now.toISOString(), formal_store_write: false, formal_store_sha256: require("node:crypto").createHash("sha256").update(fs.readFileSync(storePath)).digest("hex"), input_total: entries.length, stale_recheck_count: queue.length, queue_counts: counts, items: queue };
const outputPath = path.resolve("docs/ich/DS8-待复核优先级队列_V1.0.json");
const reportPath = path.resolve("docs/ich/DS8-待复核优先级队列报告_V1.0.md");
fs.writeFileSync(outputPath, `${JSON.stringify(audit, null, 2)}\n`);
fs.writeFileSync(reportPath, `# DS8 待复核优先级队列 V1.0\n\n- 阶段：**DS8-R0**\n- 正式库总量：${entries.length}\n- 待复核记录：${queue.length}\n- 正式库写入：**false**\n- 复核时间：${audit.generated_at}\n\n## 队列分层\n\n${Object.entries(counts).map(([key, value]) => `- ${key}: ${value}`).join("\n")}\n\n## 放行规则\n\n1. urgent_deadline 优先复核截止日期、资格和行动方式。\n2. current_recheck 复核来源可访问性、地区、分类和截止日期。\n3. field_confirmation 只补证据，不把未知字段猜成已确认。\n4. history_cleanup 需有结束/取消证据，才转历史或撤回。\n5. 本队列只读生成，不自动修改正式机会库。\n\n机器记录：[DS8-待复核优先级队列_V1.0.json](./DS8-待复核优先级队列_V1.0.json)。\n`);
console.log(JSON.stringify({ stage: "DS8-R0", gate: queue.length > 0 ? "pass_with_followups" : "pass", input_total: entries.length, stale_recheck_count: queue.length, queue_counts: counts, formal_store_write: false }, null, 2));
