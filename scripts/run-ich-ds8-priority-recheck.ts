import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { IchOpportunityStore } from "../src/ich/store";

const queue = JSON.parse(fs.readFileSync(path.resolve("docs/ich/DS8-待复核优先级队列_V1.0.json"), "utf8")) as { items: Array<{ id: string; slug: string; primary_url: string | null; priority: number; queue: string }> };
const entries = new IchOpportunityStore(path.resolve("data/ich-opportunities.json")).list();
const selected = queue.items.slice(0, 10);
const primaryUrls = new Map<string, string[]>();
for (const entry of entries) {
  const source = entry.sources.find((item) => item.is_primary);
  if (!source) continue;
  const normalized = source.url.replace(/#.*$/, "").replace(/\/$/, "");
  primaryUrls.set(normalized, [...(primaryUrls.get(normalized) ?? []), entry.slug]);
}

async function checkUrl(url: string | null): Promise<{ status: number | null; final_url: string | null; accessible: boolean; error: string | null }> {
  if (!url) return { status: null, final_url: null, accessible: false, error: "missing primary URL" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, { redirect: "follow", signal: controller.signal, headers: { "user-agent": "ChancePing-ICH-DS8-recheck/1.0" } });
    return { status: response.status, final_url: response.url, accessible: response.status >= 200 && response.status < 400, error: null };
  } catch (error) {
    return { status: null, final_url: null, accessible: false, error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) };
  } finally { clearTimeout(timer); }
}

async function main(): Promise<void> {
  const results = [];
  for (const item of selected) {
    const entry = entries.find((candidate) => candidate.id === item.id);
    if (!entry) continue;
    const source = entry.sources.find((candidate) => candidate.is_primary);
    const missingFields = [
      entry.dates.deadline_at ? null : "deadline_at",
      entry.location.location_status === "confirmed" ? null : "location",
      entry.eligibility.eligibility_status === "confirmed" ? null : "eligibility",
      entry.application.application_status === "confirmed" ? null : "application",
    ].filter((field): field is string => Boolean(field));
    const urlCheck = await checkUrl(source?.url ?? null);
    const normalized = source?.url.replace(/#.*$/, "").replace(/\/$/, "") ?? null;
    results.push({ id: entry.id, slug: entry.slug, title: entry.title, queue: item.queue, priority: item.priority, primary_url: source?.url ?? null, primary_level: source?.level ?? null, url_check: urlCheck, duplicate_slugs: normalized ? (primaryUrls.get(normalized) ?? []).filter((slug) => slug !== entry.slug) : [], missing_fields: missingFields, formal_store_write: false });
  }
  const audit = { schema_version: "ich-ds8-priority-recheck.v1", stage: "DS8-R1", audited_at: new Date().toISOString(), formal_store_write: false, formal_store_sha256: crypto.createHash("sha256").update(fs.readFileSync(path.resolve("data/ich-opportunities.json"))).digest("hex"), selected_count: results.length, accessible_count: results.filter((item) => item.url_check.accessible).length, duplicate_count: results.filter((item) => item.duplicate_slugs.length > 0).length, results };
  fs.writeFileSync(path.resolve("docs/ich/DS8-首批优先记录复核_V1.0.json"), `${JSON.stringify(audit, null, 2)}\n`);
  fs.writeFileSync(path.resolve("docs/ich/DS8-首批优先记录复核报告_V1.0.md"), `# DS8 首批优先记录复核报告 V1.0\n\n- 阶段：**DS8-R1**\n- 抽查记录：${results.length}\n- 主来源可访问：${audit.accessible_count}\n- 重复主来源：${audit.duplicate_count}\n- 正式库写入：**false**\n\n## 处置原则\n\n可访问不等于内容已确认；字段缺失仍保留未知。重复、过期和冲突记录不得直接发布，须进入人工处置。\n\n机器记录：[DS8-首批优先记录复核_V1.0.json](./DS8-首批优先记录复核_V1.0.json)。\n`);
  console.log(JSON.stringify({ stage: "DS8-R1", gate: audit.duplicate_count === 0 ? "pass_with_followups" : "blocked", selected_count: audit.selected_count, accessible_count: audit.accessible_count, duplicate_count: audit.duplicate_count, formal_store_write: false }, null, 2));
}
main().catch((error) => { console.error(error); process.exit(1); });
