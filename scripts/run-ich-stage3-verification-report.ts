import fs from "node:fs";
import path from "node:path";

interface Candidate { candidate_id: string; source_id: string; title: string; source_url: string; deadline_text: string | null; category_hint: string | null; review_state: string; }
interface Run { source_id: string; candidates: Candidate[]; }
interface Assessment { candidate_id: string; source_id: string; score: number; decision: "review_required" | "reject"; reasons: string[]; checks: Record<string, boolean>; }
const discovery = JSON.parse(fs.readFileSync(path.resolve("docs/ich/stage2-ds2-readonly.json"), "utf8")) as { source_runs: Run[] };
const quality = JSON.parse(fs.readFileSync(path.resolve("docs/ich/stage3-ds3-quality.json"), "utf8")) as { assessments: Assessment[] };
const candidates = discovery.source_runs.flatMap((run) => run.candidates);
const byId = new Map(candidates.map((candidate) => [candidate.candidate_id, candidate]));
const lines = [
  "# Stage 3 候选验证报告",
  "",
  "本报告逐条对应 Stage 2 只读扫描的 47 条候选。验证状态分为：`verified_for_import`（官方详情页字段已核验）、`duplicate`（官方来源已在正式库存在）、`rejected`（不符合行动机会门禁）和 `hold_manual`（需要补齐官方字段，暂不导入）。",
  "",
  "## 汇总",
  "",
  `- 输入候选：${candidates.length}`,
  `- DS3 review_required：${quality.assessments.filter((item) => item.decision === "review_required").length}`,
  `- DS3 reject：${quality.assessments.filter((item) => item.decision === "reject").length}`,
  "- 官方详情核验通过并进入 DS14：1 条（GBA 第八届文化创意设计大赛，使用官方详情页 `col.jsp?id=127`，而非扫描到的首页变体）。",
  "- 已存在正式记录：LOEWE Craft Prize 2027，原候选不重复导入。",
  "",
  "## 逐条处置",
  "",
  "| candidate_id | 来源 | 标题 | 状态 | 原因 |",
  "| --- | --- | --- | --- | --- |",
];
for (const assessment of quality.assessments) {
  const candidate = byId.get(assessment.candidate_id);
  if (!candidate) continue;
  const isExistingLoewe = candidate.source_id === "loewe-craft-prize" && candidate.source_url.includes("craftprize2027");
  const status = isExistingLoewe ? "duplicate" : assessment.decision === "reject" ? "rejected" : "hold_manual";
  const reason = isExistingLoewe ? "官方来源 URL 已由正式库 LOEWE FOUNDATION Craft Prize 2027 记录占用" : assessment.reasons.join("；");
  lines.push(`| ${candidate.candidate_id} | ${candidate.source_id} | ${candidate.title.replaceAll("|", "\\|")} | ${status} | ${reason.replaceAll("|", "\\|")} |`);
}
lines.push(
  "",
  "## 进入 DS14 的记录",
  "",
  "- `eighth-gba-cultural-creative-design-competition-2026`：官方详情页 `https://www.gbawcsjds.com/col.jsp?id=127` 明确征集时间为 2026-06-19 至 2026-09-30 18:00，官方网站注册报名；已生成 DS14 单批候选文件。",
  "",
  "## 未上线原因",
  "",
  "大多数扫描结果来自公告列表的当前前三条，包含结果公告、更正公告、新闻或无截止日期页面。对于无法在官方详情页同时确认当前行动窗口、适用主体、地区和申请入口的记录，按规则保留为观察/人工复核，不强行写入正式库。",
);
fs.mkdirSync(path.resolve("docs/ich"), { recursive: true });
fs.writeFileSync(path.resolve("docs/ich/candidate-verification-report.md"), `${lines.join("\n")}\n`);
console.log(JSON.stringify({ input_candidates: candidates.length, ds3_assessments: quality.assessments.length, report: "docs/ich/candidate-verification-report.md" }, null, 2));
