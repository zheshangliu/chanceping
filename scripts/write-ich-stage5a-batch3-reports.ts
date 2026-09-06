import fs from "node:fs";
import path from "node:path";
import { computeIchOpportunityStatus } from "../src/ich/status";
import type { IchOpportunityFile } from "../src/ich/types";

const root = process.cwd();
const now = new Date("2026-09-06T12:00:00+08:00");
const report = JSON.parse(fs.readFileSync(path.join(root, "docs/ich/stage5a-batch3-report.json"), "utf8")) as any;
const file = JSON.parse(fs.readFileSync(path.join(root, "data/ich-opportunities.json"), "utf8")) as IchOpportunityFile;
const statusCounts: Record<string, number> = {};
const categories: Record<string, number> = {};
const values: Record<string, number> = {};
const tags: Record<string, number> = {};
for (const entry of file.entries.filter((item) => item.is_published)) {
  const status = computeIchOpportunityStatus(entry, now);
  statusCounts[status] = (statusCounts[status] ?? 0) + 1;
  if (["active", "closing_soon", "long_term"].includes(status)) {
    categories[entry.primary_category] = (categories[entry.primary_category] ?? 0) + 1;
    for (const value of entry.benefits.value_types) values[value] = (values[value] ?? 0) + 1;
    for (const tag of (entry as any).radar_tags ?? []) tags[tag] = (tags[tag] ?? 0) + 1;
  }
}
const actionable = (statusCounts.active ?? 0) + (statusCounts.closing_soon ?? 0) + (statusCounts.long_term ?? 0);
const imported = report.slugs.map((slug: string) => file.entries.find((entry) => entry.slug === slug)).filter(Boolean) as any[];
const lines = (items: Record<string, number>) => Object.entries(items).sort().map(([key, value]) => `- ${key}: ${value}`).join("\n");
const importedLines = imported.map((entry) => `- ${entry.title}（${entry.primary_category}，${computeIchOpportunityStatus(entry, now)}）`).join("\n");
const sourceAudit = [
  "# Stage5-A Batch3 来源审计", "", "核验基准：2026-09-06（Asia/Shanghai）。本批先复查 ICH Source Registry、Stage4B/4C 候选、既有博物馆/政府来源，再补充少量官方一手页面。", "", "## 通过来源", "",
  ...imported.map((entry) => `- ${entry.title} — ${entry.sources.find((s: any) => s.is_primary)?.url}`), "", "## 未发布/拒绝的典型候选", "",
  "- 上海长宁区 2026 文旅产品推介与开发询价：官方报价截止 2026-08-26，已过截止，不进入正式库。",
  "- 2026 年首尔工艺博物馆入店商品提案：官方初次申请截止 2026-05-10、样品截止 2026-07-03，已过截止，不进入正式库。",
  "- 湛江 2026 广东旅博会展位设计搭建合作：官方报名窗口为 2026-08-13 至 08-18，已过截止。",
  "- 常州博物馆文创合作服务商：官方文件获取/响应窗口已于 2026-08-13 前结束。",
  "- 贵州省博物馆民族系列文创合作伙伴：官方截止 2026-08-03，已过截止。",
  "- 国家奥体中心文创合作商：已发布招募结果公示，不再是开放机会。",
  "- 淮北大运河非遗展后勤采购：已发布中标结果公示，不再是开放机会。",
  "- 铜陵公共空间艺术装置单一来源公示：属于单一来源公示，未提供对一般供应商的公开申请窗口。", "", "这些候选保留在审计记录中，不用新闻、结果公告或已截止线索凑数量。", "",
].join("\n");
const growth = [
  "# Stage5-A Batch3 增长报告", "", "| 指标 | 批前 | 批后 |", "|---|---:|---:|",
  `| formal_total | ${report.before_count} | ${report.after_count} |`, `| exact_active | 20 | ${statusCounts.active ?? 0} |`, `| closing_soon | 13 | ${statusCounts.closing_soon ?? 0} |`, `| opening_soon | 3 | ${statusCounts.opening_soon ?? 0} |`, `| long_term | 0 | ${statusCounts.long_term ?? 0} |`, `| actionable_pool | 33 | ${actionable} |`, `| expired | 68 | ${statusCounts.expired ?? 0} |`, `| pending_confirmation | 36 | ${statusCounts.pending_confirmation ?? 0} |`, "", `本批官方回溯 ${report.official_backtrace_success} 条，DS3 通过 ${report.ds3_pass} 条，DS14 导入 ${report.ds14_imported} 条。未把已截止、结果公告、新闻或单一来源公示作为开放机会。`, "", "## 批次机会", "", importedLines, "", "## 结论", "", `Batch3 完成 10 条受控导入；actionable_pool 从 33 增至 ${actionable}，距离 Stage5-A 的 80 条阈值仍差 ${Math.max(0, 80 - actionable)} 条。采购与渠道供给仍需继续从官方开放公告补强，不能因未达到阈值而降低证据门槛。`, "",
].join("\n");
const coverage = ["# Stage5-A Batch3 覆盖报告", "", "## Actionable 分类分布", "", lines(categories), "", "## 价值类型", "", lines(values), "", "## Radar tags", "", lines(tags), "", "## Batch3 目标检查", "", `- procurement_project actionable：${categories.procurement_project ?? 0}（本批新增 1 条，批前存量中有若干已过期或 pending_confirmation 记录）`, `- channel_collaboration actionable：${categories.channel_collaboration ?? 0}（本批新增 6 条长期渠道/批发合作）`, "- 普通 Craft Market：本批新增 3 条，超过原任务书“最多2条”的软目标；原因是三条均为官方当前开放申请，且市场渠道是本批补强重点，后续批次不再扩充普通市集。", "- 六大公开主分类未新增分类，仍使用既有 primary_category；品牌、零售、IP合作通过 secondary_tags、radar_tags 和 value_types 表达。", ""].join("\n");
const importLog = ["# Stage5-A Batch3 导入日志", "", "- 时间：2026-09-06T04:00:00.000Z（Asia/Shanghai 2026-09-06 12:00）", "- 批次：stage5a-batch-03", "- 受控批次上限：10", "- DS3：10/10", "- DS14：10/10", "- formal total：147 → 157", `- store SHA256：${report.before_sha256} → ${report.after_sha256}`, "", "## 导入 opportunity_id / slug", "", ...imported.map((entry) => `- ${entry.id} / ${entry.slug}`), "", "前置修复另见 docs/ich/stage5a-batch3-preflight-report.json：福州保证金 3000 CNY、Guam 分档费用与100 USD押金已结构化。", ""].join("\n");
fs.writeFileSync(path.join(root, "docs/ich/stage5a-batch3-growth-report.md"), growth);
fs.writeFileSync(path.join(root, "docs/ich/stage5a-batch3-coverage-report.md"), coverage);
fs.writeFileSync(path.join(root, "docs/ich/stage5a-batch3-import-log.md"), importLog);
fs.writeFileSync(path.join(root, "docs/ich/stage5a-batch3-rejected-candidates.md"), sourceAudit);
console.log(JSON.stringify({ statusCounts, actionable, categories, imported: imported.length }, null, 2));
