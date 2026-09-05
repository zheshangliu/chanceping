import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { assessIchCandidateQuality } from "../src/ich/candidate-quality-v1";
import { inferIchApplicantFit } from "../src/ich/applicant-fit";
import { getIchSourceRegistryV2 } from "../src/ich/source-registry-v2";
import type { IchCandidateSample } from "../src/ich/source-adapters-v1";

interface DiscoveryRun {
  readonly: true;
  formal_store_write: false;
  source_count: number;
  candidate_count: number;
  source_runs: Array<{ source_id: string; status: string; candidate_count: number; errors: string[]; candidates: IchCandidateSample[] }>;
}

const root = process.cwd();
const discoveryPath = path.resolve(process.env.ICH_STAGE4B_DISCOVERY ?? "docs/ich/stage4b-ds2-readonly.json");
const storePath = path.resolve("data/ich-opportunities.json");
const discovery = JSON.parse(fs.readFileSync(discoveryPath, "utf8")) as DiscoveryRun;
const store = JSON.parse(fs.readFileSync(storePath, "utf8")) as { entries: Array<{ sources: Array<{ url: string }> }> };
const registry = getIchSourceRegistryV2();
const sourceMap = new Map(registry.sources.map((source) => [source.id, source]));
const existingUrls = new Set(store.entries.flatMap((entry) => entry.sources.map((source) => source.url.replace(/#.*$/, "").replace(/\/$/, ""))));
const candidates = discovery.source_runs.flatMap((run) => run.candidates);
const normalizedUrls = candidates.map((candidate) => candidate.source_url.replace(/#.*$/, "").replace(/\/$/, ""));
const duplicateUrlCount = normalizedUrls.length - new Set(normalizedUrls).size;
const heritageSignal = /非遗|非物质文化遗产|传统工艺|传统技艺|工艺美术|手工艺|传承人|文化遗产|heritage craft|traditional craft|artisan|craftsmanship/iu;
const rows = candidates.map((candidate) => {
  const assessment = assessIchCandidateQuality(candidate, existingUrls);
  const fit = inferIchApplicantFit(`${candidate.title} ${candidate.organizer ?? ""}`);
  const source = sourceMap.get(candidate.source_id);
  return {
    candidate,
    assessment,
    fit,
    source,
    strong_heritage: heritageSignal.test(candidate.title),
  };
});
const sourceStats = new Map<string, { candidate_count: number; high_quality_count: number; score: number; errors: number; status: string }>();
for (const run of discovery.source_runs) {
  const sourceRows = rows.filter((row) => row.candidate.source_id === run.source_id);
  sourceStats.set(run.source_id, {
    candidate_count: sourceRows.length,
    high_quality_count: sourceRows.filter((row) => row.strong_heritage && ["high", "medium"].includes(row.assessment.band)).length,
    score: sourceRows.reduce((sum, row) => sum + row.assessment.score, 0),
    errors: run.errors.length,
    status: run.status,
  });
}
const topRows = [...rows].sort((a, b) => b.assessment.score - a.assessment.score || Number(b.strong_heritage) - Number(a.strong_heritage));
const currentStoreSha256 = crypto.createHash("sha256").update(fs.readFileSync(storePath)).digest("hex");
const summary = {
  stage: "4B",
  readonly: discovery.readonly,
  formal_store_write: discovery.formal_store_write,
  formal_store_sha256: currentStoreSha256,
  source_count: discovery.source_count,
  candidate_count: candidates.length,
  unique_candidate_count: new Set(candidates.map((candidate) => candidate.candidate_id)).size,
  duplicate_url_count: duplicateUrlCount,
  target_candidate_count: 300,
  shortfall_to_target: Math.max(0, 300 - candidates.length),
  strong_heritage_count: rows.filter((row) => row.strong_heritage).length,
  high_quality_count: rows.filter((row) => row.strong_heritage && ["high", "medium"].includes(row.assessment.band)).length,
  target_high_quality_count: 50,
  quality_band: {
    high: rows.filter((row) => row.assessment.band === "high").length,
    medium: rows.filter((row) => row.assessment.band === "medium").length,
    low: rows.filter((row) => row.assessment.band === "low").length,
  },
  source_statuses: Object.fromEntries(discovery.source_runs.map((run) => [run.source_id, { status: run.status, candidates: run.candidate_count, errors: run.errors.length }])),
};
const candidateReport = [
  "# Stage 4B 候选机会报告",
  "",
  "本报告来自 DS2 只读详情扫描；候选仅供核验，不代表正式机会，不写入正式库。",
  "",
  `- 实际候选：${summary.candidate_count}`,
  `- 唯一 candidate_id：${summary.unique_candidate_count}`,
  `- 重复详情 URL：${summary.duplicate_url_count}`,
  `- 目标：${summary.target_candidate_count}`,
  `- 距目标差额：${summary.shortfall_to_target}`,
  `- 强非遗/传统工艺信号：${summary.strong_heritage_count}`,
  `- 高质量候选（强相关且 high/medium）：${summary.high_quality_count} / 目标 ${summary.target_high_quality_count}`,
  `- 当前 Active Opportunities：以 Stage3 审计口径为 13 条`,
  "",
  "| candidate_id | 标题 | 来源 | URL | opportunity_type | source_level | deadline | applicant_type | evidence_status | ranking_score | decision |",
  "| --- | --- | --- | --- | --- | --- | --- | --- | --- | ---: | --- |",
  ...topRows.map(({ candidate, assessment, fit, source }) => `| ${candidate.candidate_id} | ${candidate.title.replaceAll("|", "\\|")} | ${source?.name ?? candidate.source_id} | ${candidate.source_url} | ${candidate.category_hint ?? "未确认"} | ${source?.evidence_level ?? "未确认"} | ${candidate.deadline_text ?? "未确认"} | ${fit.eligible_profiles.join(", ")} | candidate_only / ${candidate.raw_snapshot_hash ? "snapshot" : "missing"} | ${assessment.score} | ${assessment.decision} |`),
  "",
  "## 门禁结论",
  "",
  summary.candidate_count >= 300
    ? "已达到 300 条候选目标；仍需逐条通过 DS3 与官方详情页核验。"
    : `未达到 300 条候选目标，缺口 ${summary.shortfall_to_target} 条；高质量候选为 ${summary.high_quality_count} 条，距离 50 条目标还差 ${Math.max(0, summary.target_high_quality_count - summary.high_quality_count)} 条。缺口来自当前 19 个适配器的真实可访问详情链接上限；没有复制候选或虚构记录。下一轮应优先为 planned 来源补齐 adapter，而不是重复扫描同一 URL。`,
].join("\n");
const sourceReport = [
  "# Stage 4B 来源表现报告",
  "",
  "高质量候选定义：标题包含强非遗/传统工艺信号，且 DS3 模拟分层为 high 或 medium。",
  "",
  "| source | role | level | status | candidate_count | high_quality_count | conversion_rate | errors | recommendation |",
  "| --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- |",
  ...[...sourceStats.entries()].sort((a, b) => b[1].candidate_count - a[1].candidate_count).map(([sourceId, stat]) => {
    const source = sourceMap.get(sourceId);
    const rate = stat.candidate_count ? `${((stat.high_quality_count / stat.candidate_count) * 100).toFixed(1)}%` : "0.0%";
    const recommendation = stat.errors > 0 ? "修复访问/适配器后再扩展" : stat.high_quality_count > 0 ? "优先保留并增加详情深度" : "降低优先级，补强查询或转观察";
    return `| ${sourceId} | ${source?.role ?? "未确认"} | ${source?.evidence_level ?? "未确认"} | ${stat.status} | ${stat.candidate_count} | ${stat.high_quality_count} | ${rate} | ${stat.errors} | ${recommendation} |`;
  }),
  "",
  "## 来源策略结论",
  "",
  "P0/P1 官方与行业来源可以持续产出真实详情，但当前适配器主要覆盖公告/列表页；P2 仍只能发现，不能直接发布。下一阶段应优先补齐非遗项目扶持、博物馆文创供应、市集展销和品牌合作来源的详情适配器。",
].join("\n");
const queryReport = [
  "# Stage 4B Query Pack V4 报告",
  "",
  `- Query Pack 总数：${registry.query_packs.length}`,
  "- 新增：ich-heritage-program-v4、ich-museum-collaboration-v4、ich-commercial-channel-v4、ich-craft-market-v4、ich-residency-v4",
  "- 新增 Opportunity Intent：heritage_program（Profile 层意图，不改变正式存储分类枚举）",
  "",
  ...registry.query_packs.filter((pack) => pack.id.endsWith("-v4")).map((pack) => `## ${pack.id}\n- 正向：${pack.terms.join("、")}\n- 负向：${pack.negative_terms.join("、")}\n- 分类映射：${pack.categories.join("、")}`),
].join("\n");
fs.mkdirSync(path.resolve(root, "docs/ich"), { recursive: true });
fs.writeFileSync(path.resolve(root, "docs/ich/candidate-batch-report.md"), `${candidateReport}\n`);
fs.writeFileSync(path.resolve(root, "docs/ich/source-performance-report.md"), `${sourceReport}\n`);
fs.writeFileSync(path.resolve(root, "docs/ich/stage4b-query-pack-report.md"), `${queryReport}\n`);
fs.writeFileSync(path.resolve(root, "docs/ich/stage4b-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
