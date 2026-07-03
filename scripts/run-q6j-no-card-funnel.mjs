import { writeFile } from "node:fs/promises";
import { GOLDEN_CASES } from "./golden-20-browser-baseline.mjs";

const IDS = [1, 2, 3, 4, 7, 8, 9, 12, 15, 17];
const NO_CARD_FOCUS_IDS = new Set([1, 3, 4, 7, 8, 9, 12, 15, 17]);
const baseUrl = process.env.Q6_BASE_URL || "http://127.0.0.1:3312";
const KEY_TYPES = new Set(["direct_opportunity", "business_lead", "channel_partner_lead", "customer_lead"]);

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

function countBy(items, selector) {
  const map = new Map();
  for (const item of items) {
    const key = selector(item) || "unknown";
    map.set(key, (map.get(key) || 0) + 1);
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

function summary(entries, limit = 4) {
  return entries.slice(0, limit).map(([key, count]) => `${key}(${count})`);
}

function isSemanticKey(candidate) {
  return KEY_TYPES.has(candidate.semanticType || "");
}

function isFinalKey(candidate) {
  return KEY_TYPES.has(candidate.finalSemanticType || candidate.semanticType || "");
}

function lastDropReason(candidate) {
  const relevance = candidate.relevanceAssessment;
  if (!isSemanticKey(candidate)) return "semantic_bucket_not_key";
  if (relevance?.decision === "reject") return "q6a_relevance_reject";
  if (relevance?.decision === "downgrade_to_watch_signal") return "q6a_relevance_downgrade";
  const page = candidate.pageTypeAssessment;
  if (page?.keyCardEligibility === "reject") return "page_type_reject";
  if (page?.keyCardEligibility === "downgrade") return "page_type_downgrade";
  const judge = candidate.candidateJudgeAssessment;
  if (judge?.decision === "reject") return "llm_judge_reject";
  if (judge?.decision === "downgrade_to_watch_signal") return "llm_judge_downgrade";
  const ownership = candidate.ownershipAssessment;
  if (ownership?.ownershipDecision === "reject") return "ownership_reject";
  if (ownership?.ownershipDecision === "downgrade_to_watch_signal") return "ownership_downgrade";
  const ranking = candidate.candidateRankingAssessment;
  if (ranking?.capStatus === "excluded_by_cap") {
    if ((ranking.reasonCodes || []).includes("stale_candidate_excluded_from_key_card")) return "ranking_stale_excluded";
    if ((ranking.reasonCodes || []).includes("weak_authority_downgraded_by_primary_candidate")) return "ranking_weak_authority_excluded";
    if ((ranking.reasonCodes || []).includes("near_duplicate_key_candidate")) return "ranking_duplicate_excluded";
    return "ranking_card_cap_excluded";
  }
  if (ranking?.capStatus === "not_key_candidate") return isFinalKey(candidate) ? "ranking_not_included" : "final_semantic_not_key";
  if (ranking?.capStatus === "included") return "included";
  return "unknown";
}

function causeFor(row) {
  if (!row.ok) return "environment_or_request_failed";
  if (row.cards > 0) return "has_key_cards";
  if (row.semanticKeyCandidateCount <= 1) return "search_recall_insufficient";
  if (row.q6aAcceptCount === 0) return "semantic_bucket_or_q6a_too_strict";
  if (row.pageTypeEligibleCount === 0) return "page_type_too_strict_or_no_entry";
  if (row.llmJudgeAcceptCount === 0) return "llm_judge_too_strict_or_no_actionable_result";
  if (row.ownershipAcceptCount === 0) return "ownership_gate_too_strict_or_actor_mismatch";
  if (row.rankingIncludedCount === 0) return "ranking_or_card_cap_issue";
  return "genuinely_no_actionable_result";
}

function recommendationFor(row) {
  if (row.cards > 0) return "作为成功对照样本，关注前三卡是否仍有错配。";
  switch (row.primaryCause) {
    case "search_recall_insufficient":
      return "优先补 query family/source archetype 召回；不要放宽 gate 硬造卡。";
    case "semantic_bucket_or_q6a_too_strict":
      return "检查 relevant 结果是否被打成 watch/reference/rejected；必要时校准语义分桶或 Q6A。";
    case "page_type_too_strict_or_no_entry":
      return "只校准带具体入口的栏目/平台页；首页、趋势文章、模板页仍不得进重点卡。";
    case "llm_judge_too_strict_or_no_actionable_result":
      return "检查 judge 是否误把入口集合降级；若只有新闻/历史/过期内容，应保留无卡解释。";
    case "ownership_gate_too_strict_or_actor_mismatch":
      return "只针对可外联线索或当前用户可执行动作校准 ownership；不要放过受益人错配。";
    case "ranking_or_card_cap_issue":
      return "检查是否因时效、弱来源或 cap 被排除；可考虑入口集合/低优先线索，但必须待复核。";
    default:
      return "保持诚实无卡，并在报告中说明观察线索和下一轮搜索方向。";
  }
}

function compactCandidate(candidate) {
  const ranking = candidate.candidateRankingAssessment || {};
  const ownership = candidate.ownershipAssessment || {};
  const page = candidate.pageTypeAssessment || {};
  const judge = candidate.candidateJudgeAssessment || {};
  return {
    title: candidate.title,
    url: candidate.url,
    semanticType: candidate.semanticType,
    finalSemanticType: candidate.finalSemanticType,
    pageType: page.pageType,
    pageEligibility: page.keyCardEligibility,
    judge: judge.decision,
    ownership: ownership.ownershipDecision,
    action: ownership.currentUserActionMode,
    role: ownership.opportunityRoleForUser,
    cap: ranking.capStatus,
    authority: ranking.authorityTier,
    score: ranking.totalScore,
    lastDrop: lastDropReason(candidate),
    reasons: [
      ...(candidate.relevanceAssessment?.reasonCodes || []),
      ...(page.reasonCodes || []),
      ...(judge.reason ? [judge.reason] : []),
      ...(ownership.reasonCodes || []),
      ...(ranking.reasonCodes || []),
    ].slice(0, 8),
  };
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
    const uniqueUrls = new Set(raw.map((candidate) => candidate.url).filter(Boolean));
    const row = {
      id,
      ok: true,
      input: item.input,
      outcome: search.runOutcome?.status || "unknown",
      rawCandidateCount: raw.length,
      dedupCandidateCount: search.candidateAccounting?.deduplicatedCount ?? uniqueUrls.size,
      semanticKeyCandidateCount: raw.filter(isSemanticKey).length,
      q6aAcceptCount: raw.filter((candidate) => candidate.relevanceAssessment?.decision === "accept").length,
      pageTypeEligibleCount: raw.filter((candidate) => candidate.pageTypeAssessment?.keyCardEligibility === "eligible").length,
      llmJudgeAcceptCount: raw.filter((candidate) => candidate.candidateJudgeAssessment?.decision === "accept").length,
      primarySourceRecoveredCount: raw.filter((candidate) => candidate.queryFamily === "primary source recovery" || candidate.themeName === "可信主来源反查").length,
      ownershipAcceptCount: raw.filter((candidate) => candidate.ownershipAssessment?.ownershipDecision === "accept").length,
      rankingIncludedCount: raw.filter((candidate) => candidate.candidateRankingAssessment?.capStatus === "included").length,
      cards: cards.length,
      cardTitles: cards.slice(0, 5).map((card) => card.title),
      pageTypes: summary(countBy(raw, (candidate) => candidate.pageTypeAssessment?.pageType), 6),
      lastDropReasons: summary(countBy(raw, lastDropReason), 6),
      topRelevanceReasons: summary(countBy(raw.flatMap((candidate) => candidate.relevanceAssessment?.reasonCodes || []), (reason) => reason), 6),
      topRankingReasons: summary(countBy(raw.flatMap((candidate) => candidate.candidateRankingAssessment?.reasonCodes || []), (reason) => reason), 6),
      topCandidates: raw
        .slice()
        .sort((a, b) => (b.candidateRankingAssessment?.totalScore ?? 0) - (a.candidateRankingAssessment?.totalScore ?? 0))
        .slice(0, 8)
        .map(compactCandidate),
    };
    row.primaryCause = causeFor(row);
    row.recommendation = recommendationFor(row);
    rows.push(row);
  } catch (error) {
    rows.push({
      id,
      ok: false,
      input: item?.input || "",
      outcome: "failed",
      error: error instanceof Error ? error.message : String(error),
      primaryCause: "environment_or_request_failed",
      recommendation: "先修 live harness/provider，不把环境失败计为产品失败。",
    });
  }
  console.log(`Q.6-J no-card funnel ${id}/20 complete`);
}

const withCards = rows.filter((row) => row.ok && row.cards > 0).length;
const noCards = rows.filter((row) => row.ok && row.cards === 0).length;
const focusNoCards = rows.filter((row) => row.ok && row.cards === 0 && NO_CARD_FOCUS_IDS.has(row.id)).length;
const markdown = [
  "# Q.6-J No-Card Funnel Analysis",
  "",
  `生成时间：${new Date().toISOString()}`,
  "",
  "## 结论",
  "",
  `- 本轮复测 Selected 10：${IDS.join("、")}。`,
  `- 有重点机会卡：${withCards}/10。`,
  `- 无卡样本：${noCards}/10。`,
  `- 重点诊断集无卡：${focusNoCards}/${NO_CARD_FOCUS_IDS.size}。`,
  "- 本报告只分析漏斗和最小校准点，不把搜索发现包装成已核验事实。",
  "",
  "## 漏斗总表",
  "",
  "| # | outcome | raw | dedup | semantic key | Q6A accept | page eligible | judge accept | primary recovery | ownership accept | ranking included | cards | primary cause | recommendation |",
  "|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|",
  ...rows.map((row) => row.ok
    ? `| ${row.id} | ${escapeCell(row.outcome)} | ${row.rawCandidateCount} | ${row.dedupCandidateCount} | ${row.semanticKeyCandidateCount} | ${row.q6aAcceptCount} | ${row.pageTypeEligibleCount} | ${row.llmJudgeAcceptCount} | ${row.primarySourceRecoveredCount} | ${row.ownershipAcceptCount} | ${row.rankingIncludedCount} | ${row.cards} | ${escapeCell(row.primaryCause)} | ${escapeCell(row.recommendation)} |`
    : `| ${row.id} | failed | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | environment_or_request_failed | ${escapeCell(row.error)} |`),
  "",
  "## 重点样本主因归类",
  "",
  "| # | 输入 | 主因 | last drop top | page type top | relevance reasons | ranking reasons |",
  "|---:|---|---|---|---|---|---|",
  ...rows.filter((row) => NO_CARD_FOCUS_IDS.has(row.id)).map((row) =>
    `| ${row.id} | ${escapeCell(row.input)} | ${escapeCell(row.primaryCause)} | ${escapeCell((row.lastDropReasons || []).join("；"))} | ${escapeCell((row.pageTypes || []).join("；"))} | ${escapeCell((row.topRelevanceReasons || []).join("；"))} | ${escapeCell((row.topRankingReasons || []).join("；"))} |`
  ),
  "",
  "## Top Candidates",
  "",
  "| # | top candidates audit |",
  "|---:|---|",
  ...rows.map((row) => row.ok
    ? `| ${row.id} | ${escapeCell(row.topCandidates.map((item) => `${item.title} [${item.semanticType}->${item.finalSemanticType || "?"}/${item.pageType}:${item.pageEligibility}/judge:${item.judge}/own:${item.ownership}:${item.action}:${item.role}/cap:${item.cap}/${item.authority}/${item.score}/drop:${item.lastDrop}]`).join("；"))} |`
    : `| ${row.id} | ${escapeCell(row.error)} |`),
  "",
  "## Gate Calibration Notes",
  "",
  "- 校准只允许修误杀：入口集合、低优先业务线索、可外联线索、当前用户可执行动作。",
  "- 不允许把趋势文章、首页、关于我们、XLS、模板页重新放进重点卡。",
  "- 不允许把观察信号包装成已确认机会；线索类必须继续标注待复核。",
  "- 若某个样本确实没有 actionable card，报告必须解释无卡原因、观察线索和下一轮 query/source 建议。",
].join("\n");

await writeFile("Q6_J_No_Card_Funnel_Analysis.md", `${markdown}\n`, "utf8");
await writeFile("data/q6j-no-card-funnel.json", `${JSON.stringify({ generatedAt: new Date().toISOString(), rows }, null, 2)}\n`, "utf8");
console.log("Q6_J_No_Card_Funnel_Analysis.md");
