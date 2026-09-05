import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { assessIchCandidateQuality, type IchCandidateQualityAssessment } from "../src/ich/candidate-quality-v1";
import { inferIchApplicantFit } from "../src/ich/applicant-fit";
import { getIchSourceRegistryV2 } from "../src/ich/source-registry-v2";
import { computeIchOpportunityStatus } from "../src/ich/status";
import type { IchCandidateSample } from "../src/ich/source-adapters-v1";
import type { IchOpportunity } from "../src/ich/types";

interface Discovery { source_runs: Array<{ source_id: string; candidates: IchCandidateSample[] }> }
interface PreviousQuality { assessments: Array<IchCandidateQualityAssessment> }
const root = process.cwd();
const discovery = JSON.parse(fs.readFileSync(path.resolve(root, "docs/ich/stage2-ds2-readonly.json"), "utf8")) as Discovery;
const previous = JSON.parse(fs.readFileSync(path.resolve(root, "docs/ich/stage3-ds3-quality.json"), "utf8")) as PreviousQuality;
const store = JSON.parse(fs.readFileSync(path.resolve(root, "data/ich-opportunities.json"), "utf8")) as { entries: IchOpportunity[] };
const existingUrls = new Set(store.entries.flatMap((entry) => entry.sources.map((source) => source.url.replace(/#.*$/, "").replace(/\/$/, ""))));
const samples = discovery.source_runs.flatMap((run) => run.candidates);
const next = samples.map((sample) => assessIchCandidateQuality(sample, existingUrls));
const registry = getIchSourceRegistryV2();
const sourceMap = new Map(registry.sources.map((source) => [source.id, source]));
const reasonCounts = new Map<string, number>();
const sourceCounts = new Map<string, { total: number; reject: number; review: number; avg: number }>();
for (const assessment of next) {
  for (const reason of assessment.reasons) reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
  const current = sourceCounts.get(assessment.source_id) ?? { total: 0, reject: 0, review: 0, avg: 0 };
  current.total += 1; current.reject += assessment.decision === "reject" ? 1 : 0; current.review += assessment.decision === "review_required" ? 1 : 0; current.avg += assessment.score; sourceCounts.set(assessment.source_id, current);
}
const negativeCount = samples.filter((sample) => /论文|征文|摄影比赛|普通广告设计|平面设计|学生作业|毕业设计|UI设计|软件设计|程序设计|结果公示|获奖名单|招聘|已结束|closed|past deadline/iu.test(sample.title)).length;
const heritageCount = samples.filter((sample) => /非遗|非物质文化遗产|传统工艺|传统技艺|工艺美术|文创|文化遗产|手工艺|heritage craft|traditional craft|artisan|craftsmanship/iu.test(sample.title)).length;
const auditNow = new Date(process.env.ICH_AUDIT_NOW ?? new Date().toISOString());
const currentCount = store.entries.filter((entry) => entry.is_published && entry.workflow.state === "published" && ["active", "closing_soon", "long_term"].includes(computeIchOpportunityStatus(entry, auditNow)) && entry.sources.some((source) => source.is_accessible === true) && entry.verification.source_conflict !== true).length;
const formalStoreSha256 = crypto.createHash("sha256").update(fs.readFileSync(path.resolve(root, "data/ich-opportunities.json"))).digest("hex");

const failure = ["# Stage 4A 候选失败分析", "", `- 分析候选：${samples.length}`, `- Stage 3 原始结果：${previous.assessments.filter((item) => item.decision === "review_required").length} review_required / ${previous.assessments.filter((item) => item.decision === "reject").length} reject`, `- Stage 4A 新规则结果：${next.filter((item) => item.decision === "review_required").length} review_required / ${next.filter((item) => item.decision === "reject").length} reject`, `- 命中非遗/传统工艺强相关词：${heritageCount}`, `- 命中负向词：${negativeCount}`, "", "## 失败原因统计", "", "| 原因 | 数量 |", "| --- | ---: |", ...[...reasonCounts.entries()].sort((a, b) => b[1] - a[1]).map(([reason, count]) => `| ${reason} | ${count} |`), "", "## 来源质量", "", "| 来源 | 候选 | 拒绝 | 复核 | 平均分 | 来源等级 |", "| --- | ---: | ---: | ---: | ---: | --- |", ...[...sourceCounts.entries()].sort((a, b) => b[1].total - a[1].total).map(([sourceId, stat]) => `| ${sourceId} | ${stat.total} | ${stat.reject} | ${stat.review} | ${(stat.avg / stat.total).toFixed(1)} | ${sourceMap.get(sourceId)?.evidence_level ?? "未确认"} |`), "", "## 结论", "", "主要污染来自：结果/更正/名单类页面、无明确截止时间或地区字段的列表项，以及标题没有非遗/传统工艺强相关信号的泛文化与设计机会。P2 聚合来源不得直接转为正式机会；下一轮应优先使用 V3 强相关查询并将负向词用于降权。"];
const query = ["# Stage 4A Query Pack V3 报告", "", `- Profile Query Pack 数量：${registry.query_packs.length}`, `- 新增强相关 Pack：${registry.query_packs.filter((pack) => pack.id.endsWith("quality-v3")).map((pack) => pack.id).join("、")}`, `- 只读候选基线：${samples.length}`, `- 当前 Active Opportunities：${currentCount}`, "", "## Query Pack V3 关键词", "", ...registry.query_packs.filter((pack) => pack.id.endsWith("quality-v3")).map((pack) => `### ${pack.id}\n- 正向：${pack.terms.join("、")}\n- 负向：${pack.negative_terms.join("、")}`), "", "## 策略变化", "", "1. 强化非遗、传统工艺、手工艺、工艺美术、传承人和 heritage craft 组合。", "2. 增加论文、征文、摄影、学生作业、UI/软件设计等降权词。", "3. 负向词只降低候选分数，不直接删除，以便人工复核边界机会。", "4. P2 聚合来源继续保持 discovery-only，正式发布仍需官方详情页。"];
const rankingRows = samples.map((sample) => {
  const assessment = next.find((item) => item.candidate_id === sample.candidate_id)!;
  const fit = inferIchApplicantFit(`${sample.title} ${sample.organizer ?? ""}`);
  return { sample, assessment, fit };
}).sort((a, b) => b.assessment.score - a.assessment.score);
const ranking = ["# Stage 4A Candidate Ranking 报告", "", "本报告为只读模拟排序，不代表已核验事实，也不写入正式机会库。", "", `- Top 候选数：${Math.min(20, rankingRows.length)}`, `- 当前 Active Opportunities：${currentCount}`, "", "| 排名 | 候选标题 | 来源 | 质量分 | Applicant Fit | 决策 |", "| ---: | --- | --- | ---: | --- | --- |", ...rankingRows.slice(0, 20).map(({ sample, assessment, fit }, index) => `| ${index + 1} | ${sample.title.replaceAll("|", "\\|")} | ${sample.source_id} | ${assessment.score} | ${fit.eligible_profiles.join(", ")} (${fit.score}) | ${assessment.decision} |`), "", "## 新评分权重", "", "- Source Authority：25%", "- Heritage Match：25%", "- Actionability：20%", "- Applicant Match：15%", "- Commercial Value：10%", "- Freshness：5%"];
fs.mkdirSync(path.resolve(root, "docs/ich"), { recursive: true });
fs.writeFileSync(path.resolve(root, "docs/ich/stage4a-failure-analysis.md"), `${failure.join("\n")}\n`);
fs.writeFileSync(path.resolve(root, "docs/ich/stage4a-query-report.md"), `${query.join("\n")}\n`);
fs.writeFileSync(path.resolve(root, "docs/ich/stage4a-ranking-report.md"), `${ranking.join("\n")}\n`);
fs.writeFileSync(path.resolve(root, "docs/ich/stage4a-quality-simulation.json"), `${JSON.stringify({ stage: "4A", readonly: true, formal_store_write: false, formal_store_sha256: formalStoreSha256, audit_now: auditNow.toISOString(), input_count: samples.length, previous: { review_required: previous.assessments.filter((item) => item.decision === "review_required").length, rejected: previous.assessments.filter((item) => item.decision === "reject").length }, optimized: { review_required: next.filter((item) => item.decision === "review_required").length, rejected: next.filter((item) => item.decision === "reject").length, high_band: next.filter((item) => item.band === "high").length, medium_band: next.filter((item) => item.band === "medium").length, low_band: next.filter((item) => item.band === "low").length }, current_active: currentCount }, null, 2)}\n`);
console.log(JSON.stringify({ readonly: true, formal_store_write: false, input_count: samples.length, optimized_review_required: next.filter((item) => item.decision === "review_required").length, optimized_rejected: next.filter((item) => item.decision === "reject").length, current_active: currentCount }, null, 2));
