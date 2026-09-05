import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { assessIchCandidateQuality } from "../src/ich/candidate-quality-v1";
import { inferIchApplicantFit } from "../src/ich/applicant-fit";
import { scoreIchCandidateActionability } from "../src/ich/opportunity-intelligence";
import { getIchSourceRegistryV2 } from "../src/ich/source-registry-v2";
import type { IchCandidateSample } from "../src/ich/source-adapters-v1";

interface DiscoveryRun {
  readonly: true;
  formal_store_write: false;
  source_runs: Array<{ source_id: string; candidates: IchCandidateSample[] }>;
}

const root = process.cwd();
const discovery = JSON.parse(fs.readFileSync(path.resolve("docs/ich/stage4b-ds2-readonly.json"), "utf8")) as DiscoveryRun;
const storePath = path.resolve("data/ich-opportunities.json");
const store = JSON.parse(fs.readFileSync(storePath, "utf8")) as { entries: Array<{ sources: Array<{ url: string }> }> };
const registry = getIchSourceRegistryV2();
const sourceMap = new Map(registry.sources.map((source) => [source.id, source]));
const existingUrls = new Set(store.entries.flatMap((entry) => entry.sources.map((source) => source.url.replace(/#.*$/, "").replace(/\/$/, ""))));
const candidates = discovery.source_runs.flatMap((run) => run.candidates);
const rows = candidates.map((candidate) => {
  const source = sourceMap.get(candidate.source_id);
  const fit = inferIchApplicantFit(`${candidate.title} ${candidate.organizer ?? ""}`);
  const assessment = assessIchCandidateQuality(candidate, existingUrls);
  const intelligence = scoreIchCandidateActionability(candidate, source, fit);
  return { candidate, source, assessment, intelligence };
});
const rankedRows = [...rows].sort((a, b) => b.intelligence.actionability_score - a.intelligence.actionability_score || b.assessment.score - a.assessment.score);
const rankMap = new Map(rankedRows.map((row, index) => [row.candidate.candidate_id, index + 1]));
const sourceStats = new Map<string, { total: number; qualified: number; high: number; oldRole: string; newRole: string; status: string }>();
for (const row of rows) {
  const current = sourceStats.get(row.candidate.source_id) ?? { total: 0, qualified: 0, high: 0, oldRole: row.source?.role ?? "未确认", newRole: row.source?.source_role ?? "未确认", status: row.source?.operational_status ?? "未确认" };
  current.total += 1;
  current.qualified += Number(row.intelligence.qualified_candidate);
  current.high += Number(row.intelligence.high_quality_candidate);
  sourceStats.set(row.candidate.source_id, current);
}
const formalStoreSha256 = crypto.createHash("sha256").update(fs.readFileSync(storePath)).digest("hex");
const summary = {
  stage: "4C-A",
  readonly: true,
  formal_store_write: false,
  formal_store_sha256: formalStoreSha256,
  input_candidate_count: candidates.length,
  reclassified_count: rows.length,
  qualified_count: rows.filter((row) => row.intelligence.qualified_candidate).length,
  high_quality_count: rows.filter((row) => row.intelligence.high_quality_candidate).length,
  conversion_rate: rows.length ? Number((rows.filter((row) => row.intelligence.qualified_candidate).length / rows.length).toFixed(4)) : 0,
  target_qualified_count: 20,
  target_high_quality_count: 10,
  meets_qualified_target: rows.filter((row) => row.intelligence.qualified_candidate).length >= 20,
  meets_high_quality_target: rows.filter((row) => row.intelligence.high_quality_candidate).length >= 10,
};
const reclassificationReport = [
  "# Stage 4C-A 候选重分类报告",
  "",
  "本报告只读重分类 193 条 Stage4B 候选；不改变正式机会库，不代表任何记录已发布。",
  "",
  `- 输入候选：${summary.input_candidate_count}`,
  `- Qualified Candidate：${summary.qualified_count} / 目标 ${summary.target_qualified_count}`,
  `- High Quality：${summary.high_quality_count} / 目标 ${summary.target_high_quality_count}`,
  `- 转化率：${(summary.conversion_rate * 100).toFixed(1)}%`,
  "",
  "| candidate_id | old_type | new_opportunity_stage | source_role | actionability_score | new_rank | decision |",
  "| --- | --- | --- | --- | ---: | ---: | --- |",
  ...rankedRows.map(({ candidate, source, assessment, intelligence }) => `| ${candidate.candidate_id} | ${candidate.category_hint ?? "未确认"} | ${intelligence.opportunity_stage} | ${source?.source_role ?? "未确认"} | ${intelligence.actionability_score} | ${rankMap.get(candidate.candidate_id)} | ${intelligence.qualified_candidate ? "qualified_candidate" : assessment.decision} |`),
  "",
  "## 规则结论",
  "",
  summary.meets_qualified_target && summary.meets_high_quality_target
    ? "本轮达到 Stage4C-A 两项数量门槛，但仍需官方字段复核后才能进入 DS14。"
    : `本轮未达到全部质量门槛：Qualified 缺口 ${Math.max(0, summary.target_qualified_count - summary.qualified_count)}，High Quality 缺口 ${Math.max(0, summary.target_high_quality_count - summary.high_quality_count)}。不得通过重复候选或降低证据要求补齐。`,
].join("\n");
const roleReport = [
  "# Stage 4C-A 来源角色审计报告",
  "",
  "source_role 说明：opportunity_source 可进入候选质量门；information_source 仅辅助，不直接进入正式机会；discovery_source 必须回溯官方主来源。",
  "",
  "| source | old_role | new_role | status | candidate_count | qualified_count | recommendation |",
  "| --- | --- | --- | --- | ---: | ---: | --- |",
  ...[...sourceStats.entries()].sort((a, b) => b[1].total - a[1].total).map(([sourceId, stat]) => {
    const recommendation = stat.newRole === "discovery_source" ? "只发现，必须回溯官方详情" : stat.qualified > 0 ? "保留并增加行动字段抽取" : stat.newRole === "information_source" ? "仅作背景证据，不直接发布" : "补强机会语义过滤与详情适配器";
    return `| ${sourceId} | ${stat.oldRole} | ${stat.newRole} | ${stat.status} | ${stat.total} | ${stat.qualified} | ${recommendation} |`;
  }),
].join("\n");
fs.mkdirSync(path.resolve(root, "docs/ich"), { recursive: true });
fs.writeFileSync(path.resolve(root, "docs/ich/stage4c-reclassification-report.md"), `${reclassificationReport}\n`);
fs.writeFileSync(path.resolve(root, "docs/ich/source-role-audit-report.md"), `${roleReport}\n`);
fs.writeFileSync(path.resolve(root, "docs/ich/stage4c-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
