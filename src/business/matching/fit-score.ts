import type { BusinessOpportunity } from "../opportunity";
import type { BusinessProfile, EligibilityResult, FitResult, LocalRelevanceResult } from "./types";

export function calculateFitScore(item: BusinessOpportunity, profile: BusinessProfile, gate: EligibilityResult, relevance: LocalRelevanceResult): FitResult {
  const text = `${item.title} ${item.summary} ${item.keywords.join(" ")} ${item.industries.join(" ")}`.toLowerCase();
  const terms = [...profile.keywords, ...profile.industries].filter(Boolean);
  const hits = terms.filter((term) => text.includes(term.toLowerCase())).length;
  const reasons = [...gate.reasons];
  const preparationCost = ["打开官方原文确认资格、材料和截止时间", "按公告要求准备企业基础证明材料"];
  let score = 42 + Math.min(30, hits * 6) + (relevance.status === "DIRECT" ? 18 : relevance.status === "PROVINCE" ? 10 : 0);
  if (item.recommendationLevel === "high") score += 8;
  if (gate.status === "UNKNOWN") { score -= 12; reasons.push(...gate.unknowns); preparationCost.push("补齐待确认字段后再决定是否投入"); }
  if (gate.status === "FAIL") score = Math.min(score, 20);
  if (relevance.status === "WEAK") { score = Math.min(score, 45); reasons.push(relevance.reason); }
  score = Math.max(0, Math.min(100, score));
  const label = gate.status === "FAIL" ? "不适合" : gate.status === "UNKNOWN" ? "待确认" : score >= 80 ? "高度适合" : "可能适合";
  return { score, label, reasons: reasons.length ? reasons : ["与企业画像存在关键词和地区关联"], preparationCost };
}
