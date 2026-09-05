import fs from "node:fs";
import path from "node:path";
import { computeIchOpportunityStatus } from "../src/ich/status";
import { getIchSourceRegistryV2 } from "../src/ich/source-registry-v2";
import type { IchOpportunity } from "../src/ich/types";

const root = process.cwd();
const registry = getIchSourceRegistryV2();
const discoveryPath = path.resolve(root, process.argv[2] ?? "docs/ich/stage2-ds2-readonly.json");
const storePath = path.resolve(root, "data/ich-opportunities.json");
const discovery = JSON.parse(fs.readFileSync(discoveryPath, "utf8")) as { run_id: string; started_at: string; finished_at: string; source_count: number; candidate_count: number; gate: string; source_runs: Array<{ source_id: string; status: string; candidate_count: number; errors: string[]; candidates: Array<{ title: string; source_url: string; organizer: string | null; deadline_text: string | null; category_hint: string | null; review_state: string; raw_snapshot_hash: string }> }> };
const store = JSON.parse(fs.readFileSync(storePath, "utf8")) as { updated_at: string; entries: IchOpportunity[] };
const now = new Date(discovery.finished_at);
const statusCounts = new Map<string, number>();
const categoryCounts = new Map<string, number>();
for (const entry of store.entries) {
  const status = computeIchOpportunityStatus(entry, now);
  statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1);
  if (status !== "expired" && status !== "ended" && status !== "cancelled" && status !== "source_unavailable") categoryCounts.set(entry.primary_category, (categoryCounts.get(entry.primary_category) ?? 0) + 1);
}
const groupedRoles = registry.sources.reduce<Record<string, number>>((acc, source) => { const role = source.role === "primary" ? "P0" : source.role === "secondary" ? "P1" : "P2"; acc[role] = (acc[role] ?? 0) + 1; return acc; }, {});
const allCandidates = discovery.source_runs.flatMap((run) => run.candidates.map((candidate) => ({ ...candidate, source_id: run.source_id })));
const failedRuns = discovery.source_runs.filter((run) => run.status !== "completed");
const lines: string[] = [];
lines.push("# ICH Stage 2 来源数量报告");
lines.push("");
lines.push(`- 生成时间：${new Date().toISOString()}`);
lines.push(`- Registry 来源总数：**${registry.sources.length}**`);
lines.push(`- P0 官方来源：${groupedRoles.P0 ?? 0}；P1 行业来源：${groupedRoles.P1 ?? 0}；P2 发现来源：${groupedRoles.P2 ?? 0}`);
lines.push(`- Query Pack：**${registry.query_packs.length}**`);
lines.push(`- DS7 工作流：已由动态注册表审计脚本生成并校验，目标是每个来源一个保守工作流。`);
lines.push("");
lines.push("## 运行边界");
lines.push("");
lines.push("本阶段新增来源默认处于 `planned`；P2 仅用于发现，不能直接发布。官方详情页、字段证据和 DS3 审核仍是正式入库前置条件。");
fs.mkdirSync(path.resolve(root, "docs/ich"), { recursive: true });
fs.writeFileSync(path.resolve(root, "docs/ich/source-count.md"), `${lines.join("\n")}\n`);

const candidateLines = ["# ICH Stage 2 只读候选报告", "", `- 扫描运行：\`${discovery.run_id}\``, `- 扫描窗口：${discovery.started_at} → ${discovery.finished_at}`, `- 扫描来源：${discovery.source_count}`, `- 候选数：**${discovery.candidate_count}**`, `- 运行门禁：**${discovery.gate}**`, "- 正式库写入：**false**", "", "## 来源运行结果", "", "| source_id | 状态 | 候选数 | 错误数 |", "| --- | --- | ---: | ---: |"];
for (const run of discovery.source_runs) candidateLines.push(`| ${run.source_id} | ${run.status} | ${run.candidate_count} | ${run.errors.length} |`);
candidateLines.push("", "## 候选样本（全部 candidate_only）", "", "| 来源 | 标题 | 官方详情 URL | 截止字段 | 类别提示 |", "| --- | --- | --- | --- | --- |", ...allCandidates.slice(0, 60).map((candidate) => `| ${candidate.source_id} | ${candidate.title.replaceAll("|", "\\|")} | ${candidate.source_url} | ${candidate.deadline_text ?? "未确认"} | ${candidate.category_hint ?? "未确认"} |`));
candidateLines.push("", "## 处置规则", "", "候选不会自动写入正式机会库。缺少截止日期、地区、资格或可执行入口的记录标记为未确认；必须回溯官方详情页并经过 DS3/DS14 后才能发布。", "", `失败或部分成功来源：${failedRuns.length ? failedRuns.map((run) => `\`${run.source_id}\``).join("、") : "无"}。`);
fs.writeFileSync(path.resolve(root, "docs/ich/candidate-report.md"), `${candidateLines.join("\n")}\n`);

const currentStatuses = ["active", "closing_soon", "long_term"];
const currentCount = currentStatuses.reduce((sum, status) => sum + (statusCounts.get(status) ?? 0), 0);
const growthLines = ["# ICH Stage 2 机会增长报告", "", `- 运行时间：${new Date().toISOString()}`, `- 正式库总记录：${store.entries.length}`, `- 当前有效机会（current/closing_soon/long_term）：**${currentCount}**`, `- 只读扫描候选：**${discovery.candidate_count}**`, "- 本阶段正式导入：**0**（符合只读与受控导入边界）", "", "## 当前有效机会按类别", "", "| 类别 | 数量 |", "| --- | ---: |", ...[...categoryCounts.entries()].sort((a, b) => b[1] - a[1]).map(([category, count]) => `| ${category} | ${count} |`), "", "## 差距与下一阶段", "", `当前有效机会距离 80 条目标仍有 **${Math.max(0, 80 - currentCount)}** 条差距。Stage 2 只完成来源扩容与只读发现，不以候选数量替代官方核验；下一阶段应对候选执行 DS3 字段质量门禁、去重和 DS14 分批受控导入。`];
fs.writeFileSync(path.resolve(root, "docs/ich/ich-opportunity-growth-report.md"), `${growthLines.join("\n")}\n`);
console.log(JSON.stringify({ sources: registry.sources.length, query_packs: registry.query_packs.length, candidate_count: discovery.candidate_count, current_count: currentCount, formal_store_write: false }, null, 2));
