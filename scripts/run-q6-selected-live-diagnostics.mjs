import { writeFile } from "node:fs/promises";
import { GOLDEN_CASES } from "./golden-20-browser-baseline.mjs";

const IDS = [1, 2, 3, 4, 7, 8, 9, 12, 15, 17];
const baseUrl = process.env.Q6_BASE_URL || "http://127.0.0.1:3312";

async function post(path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json.success !== true) throw new Error(json.error?.message || `${path} ${response.status}`);
  return json.data;
}

function escapeCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\n+/g, " ").trim();
}

const rows = [];
for (const id of IDS) {
  const item = GOLDEN_CASES.find((entry) => entry.id === id);
  const description = item.answer ? `${item.input}\n用户补充：${item.answer}` : item.input;
  try {
    const generated = await post("/api/radars/generate", { description });
    const search = await post("/api/search", {
      spec: generated.spec,
      query: description,
      search_mode: "live",
      max_results: 2,
      enable_content_fetch: true,
    });
    const raw = Array.isArray(search.rawCandidates) ? search.rawCandidates : [];
    const cards = Array.isArray(search.opportunityCards) ? search.opportunityCards : [];
    const decisions = { accept: 0, downgrade_to_watch_signal: 0, reject: 0, unknown: 0 };
    const reasons = new Map();
    for (const candidate of raw) {
      const decision = candidate.relevanceAssessment?.decision || "unknown";
      decisions[decision] = (decisions[decision] || 0) + 1;
      for (const reason of candidate.relevanceAssessment?.reasonCodes || []) {
        reasons.set(reason, (reasons.get(reason) || 0) + 1);
      }
    }
    rows.push({
      id,
      ok: true,
      raw: raw.length,
      decisions,
      cards: cards.length,
      cardTitles: cards.slice(0, 3).map((card) => card.title),
      topReasons: [...reasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([reason, count]) => `${reason}(${count})`),
      outcome: search.runOutcome?.status || "unknown",
    });
  } catch (error) {
    rows.push({ id, ok: false, error: error instanceof Error ? error.message : String(error) });
  }
  console.log(`Q.6 live diagnostic ${id}/20 complete`);
}

const withCards = rows.filter((row) => row.ok && row.cards > 0).length;
const failed = rows.filter((row) => !row.ok || row.outcome === "failed").length;
const markdown = [
  "# Q.6-A Selected 10 Live Diagnostic",
  "",
  `生成时间：${new Date().toISOString()}`,
  "",
  "## 结论",
  "",
  `- 本轮仅复测上次人工判为部分通过的 10 个案例：${IDS.join("、")}。`,
  `- 有重点机会卡：${withCards}/10。`,
  `- 环境或请求失败：${failed}/10。`,
  "- 每个案例每条 query 最多 2 个结果，仅精读最高优先级 URL；本报告用于判断 Q.6 闸门，不替代完整 Golden 20。",
  "- `accept` 才进入重点机会卡；`downgrade_to_watch_signal` 留在观察层；`reject` 只保留审计。",
  "",
  "## 候选漏斗",
  "",
  "| # | 运行 | raw | accept | downgrade | reject | cards | 前三张卡 | 主要原因 |",
  "|---:|---|---:|---:|---:|---:|---:|---|---|",
  ...rows.map((row) => row.ok
    ? `| ${row.id} | ${escapeCell(row.outcome)} | ${row.raw} | ${row.decisions.accept} | ${row.decisions.downgrade_to_watch_signal} | ${row.decisions.reject} | ${row.cards} | ${escapeCell(row.cardTitles.join("；") || "无")} | ${escapeCell(row.topReasons.join("；"))} |`
    : `| ${row.id} | 失败 | 0 | 0 | 0 | 0 | 0 | 无 | ${escapeCell(row.error)} |`),
  "",
  "## 使用边界",
  "",
  "- 本轮不使用 LLM 对候选做第二次批量裁判，避免把 Q.6-A 扩成 Q.6-B。",
  "- 本轮不做排序和卡片数量上限；这些属于后续 Q.6-C。",
  "- 无卡片不自动等于产品失败：可能是当前小样本没有足够证据，但不得静默回退演示数据。",
].join("\n");

await writeFile("Q6_A_Selected_10_Live_Diagnostic.md", `${markdown}\n`, "utf8");
await writeFile("data/q6-selected-live-diagnostics.json", `${JSON.stringify({ generatedAt: new Date().toISOString(), rows }, null, 2)}\n`, "utf8");
console.log("Q6_A_Selected_10_Live_Diagnostic.md");
