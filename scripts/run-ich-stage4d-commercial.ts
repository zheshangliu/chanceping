import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { assessIchCandidateQuality } from "../src/ich/candidate-quality-v1";
import { inferIchApplicantFit } from "../src/ich/applicant-fit";
import { inferIchOpportunityValueTypes, scoreIchCandidateActionability } from "../src/ich/opportunity-intelligence";
import { getIchSourceRegistryV2 } from "../src/ich/source-registry-v2";
import type { IchCandidateSample } from "../src/ich/source-adapters-v1";

interface DiscoveryRun { readonly: true; formal_store_write: false; source_runs: Array<{ source_id: string; candidates: IchCandidateSample[] }>; }
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
  const text = `${candidate.title} ${candidate.organizer ?? ""} ${candidate.eligibility_text ?? ""}`;
  const fit = inferIchApplicantFit(text);
  const assessment = assessIchCandidateQuality(candidate, existingUrls);
  const intelligence = scoreIchCandidateActionability(candidate, source, fit);
  const valueTypes = inferIchOpportunityValueTypes(text, source);
  const commercialSignal = valueTypes.includes("revenue") || valueTypes.includes("exposure") || valueTypes.includes("award") || valueTypes.includes("funding");
  const qualified = Boolean(source && source.source_role === "opportunity_source" && commercialSignal && intelligence.actionability_score >= 70 && ["open_application", "open_call", "project_invitation", "policy_program"].includes(intelligence.opportunity_stage) && assessment.decision !== "reject");
  const high = qualified && source?.evidence_level !== "L3" && /非遗|非物质文化遗产|传统工艺|传统技艺|手工艺|工艺美术|heritage craft|traditional craft|artisan|craftsmanship/i.test(text);
  return { candidate, source, assessment, intelligence, valueTypes, qualified, high };
});
const rankedRows = [...rows].sort((a, b) => Number(b.high) - Number(a.high) || Number(b.qualified) - Number(a.qualified) || b.intelligence.actionability_score - a.intelligence.actionability_score || b.assessment.score - a.assessment.score);
const sourceStats = new Map<string, { total: number; qualified: number; high: number; role: string; orientations: string[]; name: string; }>();
for (const row of rows) {
  const source = row.source;
  const stat = sourceStats.get(row.candidate.source_id) ?? { total: 0, qualified: 0, high: 0, role: source?.source_role ?? "未确认", orientations: source?.value_orientation ?? [], name: source?.name ?? "未确认" };
  stat.total += 1; stat.qualified += Number(row.qualified); stat.high += Number(row.high); sourceStats.set(row.candidate.source_id, stat);
}
const formalStoreSha256 = crypto.createHash("sha256").update(fs.readFileSync(storePath)).digest("hex");
const summary = {
  stage: "4D-A", readonly: true, formal_store_write: false, formal_store_sha256: formalStoreSha256,
  registered_source_count: registry.sources.length, new_sources_added: 0, input_candidate_count: candidates.length,
  qualified_count: rows.filter((row) => row.qualified).length, high_quality_count: rows.filter((row) => row.high).length,
  actionability_gte_70_count: rows.filter((row) => row.intelligence.actionability_score >= 70).length,
  target_candidate_count: 300, target_qualified_count: 40, target_high_quality_count: 10, target_actionability_gte_70_count: 0,
  meets_candidate_target: candidates.length >= 300,
  meets_qualified_target: rows.filter((row) => row.qualified).length >= 40,
  meets_high_quality_target: rows.filter((row) => row.high).length >= 10,
  shortfalls: { candidates: Math.max(0, 300 - candidates.length), qualified: Math.max(0, 40 - rows.filter((row) => row.qualified).length), high_quality: Math.max(0, 10 - rows.filter((row) => row.high).length) },
};
const sourceReport = ["# Stage 4D-A 商业机会源扩展报告", "", "本轮使用已注册来源与 Stage4B 只读扫描结果；未伪造来源，未写入正式库。", "", `- 已注册来源：${summary.registered_source_count}`, `- 本轮新增来源：${summary.new_sources_added}`, `- 候选：${summary.input_candidate_count}`, `- Qualified：${summary.qualified_count}`, `- High Quality：${summary.high_quality_count}`, "", "| source | name | role | value_orientation | candidate_count | qualified_count | recommendation |", "| --- | --- | --- | --- | ---: | ---: | --- |", ...[...sourceStats.entries()].sort((a,b)=>b[1].total-a[1].total).map(([id, s]) => `| ${id} | ${s.name} | ${s.role} | ${s.orientations.join(", ")} | ${s.total} | ${s.qualified} | ${s.qualified ? "保留并补齐详情字段" : s.role === "information_source" ? "仅辅助证据，不直接发布" : "增加商业详情页适配"} |`), ""].join("\n");
const candidateReport = ["# Stage 4D-A 商业候选报告", "", "仅为只读评分，不代表正式机会；value_type 是模型信号，不能替代官方页面核验。", "", `- 候选：${summary.input_candidate_count} / 目标 ${summary.target_candidate_count}`, `- Qualified：${summary.qualified_count} / 目标 ${summary.target_qualified_count}`, `- High Quality：${summary.high_quality_count} / 目标 ${summary.target_high_quality_count}`, "", "| candidate_id | title | source | value_type | actionability | decision |", "| --- | --- | --- | --- | ---: | --- |", ...rankedRows.map((row) => `| ${row.candidate.candidate_id} | ${row.candidate.title.replace(/\|/g, "／")} | ${row.source?.name ?? row.candidate.source_id} | ${row.valueTypes.join(", ") || "未确认"} | ${row.intelligence.actionability_score} | ${row.high ? "high_quality_candidate" : row.qualified ? "qualified_candidate" : row.assessment.decision} |`), "", summary.meets_qualified_target && summary.meets_high_quality_target ? "本轮达到 Qualified 与 High Quality 门槛，仍须逐条官方详情复核。" : `本轮未达目标：候选缺口 ${summary.shortfalls.candidates}，Qualified 缺口 ${summary.shortfalls.qualified}，High Quality 缺口 ${summary.shortfalls.high_quality}。不得通过降低证据要求补齐。`].join("\n");
fs.mkdirSync(path.resolve(root, "docs/ich"), { recursive: true });
fs.writeFileSync(path.resolve(root, "docs/ich/stage4d-source-expansion-report.md"), `${sourceReport}\n`);
fs.writeFileSync(path.resolve(root, "docs/ich/stage4d-commercial-candidate-report.md"), `${candidateReport}\n`);
fs.writeFileSync(path.resolve(root, "docs/ich/stage4d-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
