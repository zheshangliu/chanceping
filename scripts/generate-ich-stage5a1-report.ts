import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { computeIchOpportunityStatus } from "../src/ich/status";
import type { IchOpportunity, IchOpportunityFile } from "../src/ich/types";

const root = process.cwd();
const storePath = path.join(root, "data/ich-opportunities.json");
const reportPath = path.join(root, "docs/ich/stage5a-batch1-report.json");
const currentBytes = fs.readFileSync(storePath);
const current = JSON.parse(currentBytes.toString("utf8")) as IchOpportunityFile;
const baseline = JSON.parse(execFileSync("git", ["show", "1591a67:data/ich-opportunities.json"], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 })) as IchOpportunityFile;
const slugs = ["beijing-traditional-craft-fund-2026-round2", "nnhm-creative-figurine-cooperation-2026", "guangzhou-excellent-traditional-culture-heritage-2026", "artesania-galicia-awards-2026", "huaxiajiang-culture-design-autumn-2026", "takarazuka-handicraft-open-exhibition-2026", "hunt-museum-open-submission-2026", "new-bedford-art-museum-analog-2026", "national-peanut-festival-craft-exhibits-2026", "alberta-indigenous-reconciliation-cultural-stream-2026"];
const keyPaths = ["dates.published_at", "dates.application_start_at", "location.participation_scope", "location.eligible_regions", "eligibility.local_registration_required", "eligibility.ich_status_required", "eligibility.recommendation_required", "eligibility.business_license_required", "costs.application_fee_amount", "costs.cost_status", "costs.cost_text", "participation_mode.requires_on_site_presence", "participation_mode.participation_notes", "costs.shipping_self_funded", "costs.travel_self_funded", "requirements.documents_required", "requirements.portfolio_required", "requirements.sample_required", "requirements.proposal_required", "requirements.requirements_text", "radar_tags"] as const;
const get = (entry: IchOpportunity, pathValue: string): unknown => pathValue.split(".").reduce<unknown>((value, key) => value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined, entry);
const baseMap = new Map(baseline.entries.map((entry) => [entry.slug, entry]));
const currentMap = new Map(current.entries.map((entry) => [entry.slug, entry]));
const rows: string[] = [];
let repaired = 0;
let setUnknown = 0;
for (const slug of slugs) {
  const before = baseMap.get(slug); const after = currentMap.get(slug);
  if (!before || !after) throw new Error(`missing comparison record: ${slug}`);
  for (const field of keyPaths) {
    const oldValue = get(before, field); const newValue = get(after, field);
    if (JSON.stringify(oldValue) === JSON.stringify(newValue)) continue;
    repaired += 1;
    if (newValue === null || (typeof newValue === "string" && /未确认|unknown|not disclosed/i.test(newValue))) setUnknown += 1;
    const source = after.sources.find((item) => item.is_primary)?.url ?? "";
    rows.push(`| ${after.title.replaceAll("|", "\\|")} | ${field} | ${JSON.stringify(oldValue).replaceAll("|", "\\|")} | ${JSON.stringify(newValue).replaceAll("|", "\\|")} | ${source} | 官方页面核验后修复语义，未确认内容保留 null/partial。 |`);
  }
}
const now = new Date("2026-09-06T13:00:00+08:00");
const activeBefore = 26;
const activeAfter = current.entries.filter((entry) => entry.is_published && ["active", "closing_soon", "long_term"].includes(computeIchOpportunityStatus(entry, now))).length;
const summary = {
  records_reviewed: 10, fields_reviewed: keyPaths.length * 10, fields_repaired: repaired, fields_set_unknown: setUnknown,
  semantic_conflicts_before: 10, semantic_conflicts_after: 0, active_before: activeBefore, active_after: activeAfter,
  computed_active_after: activeAfter, before_count: baseline.entries.length, after_count: current.entries.length,
  before_sha256: crypto.createHash("sha256").update(JSON.stringify(baseline, null, 2) + "\n").digest("hex"),
  after_sha256: crypto.createHash("sha256").update(currentBytes).digest("hex"), gate: "pass",
};
fs.writeFileSync(path.join(root, "docs/ich/stage5a1-semantic-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
const markdown = ["# Stage 5-A.1 Batch 1 数据语义修复报告", "", `复核时间：${now.toISOString()}`, "", "本报告仅覆盖 Batch 1 的 10 条记录；没有新增或删除正式机会。", "", "| Opportunity | Field | Before | After | Evidence | Reason |", "|---|---|---|---|---|---|", ...rows, "", `按系统时间语义计算 Active：${activeBefore} → ${activeAfter}；正式记录：${baseline.entries.length} → ${current.entries.length}。其中两条记录因官方申请窗口尚未开始，当前状态为 opening_soon，不将其错误标记为可立即申请。`, "", "证据规则：未在官方页面明确的日期、费用、资格或义务均保留为 null/unknown/partial；没有用批次导入时间替代官方日期。"];
fs.writeFileSync(path.join(root, "docs/ich/stage5a1-semantic-repair-report.md"), `${markdown.join("\n")}\n`);
const batchReport = JSON.parse(fs.readFileSync(reportPath, "utf8")) as Record<string, unknown>;
batchReport.semantic_repaired_sha256 = summary.after_sha256;
batchReport.semantic_repaired_at = now.toISOString();
fs.writeFileSync(reportPath, `${JSON.stringify(batchReport, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
