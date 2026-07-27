import type { BusinessOpportunity } from "../opportunity";
import type { BusinessProfile, EligibilityResult } from "./types";

const hasAny = (values: string[], terms: string[]) => values.some((value) => terms.some((term) => value.toLowerCase().includes(term.toLowerCase())));

export function evaluateEligibility(item: BusinessOpportunity, profile: BusinessProfile): EligibilityResult {
  const reasons: string[] = [];
  const unknowns: string[] = [];
  if (!item.editions.some((edition) => profile.regions.includes(edition))) return { status: "FAIL", reasons: ["机会地区与企业画像不匹配"], unknowns };
  if (profile.categories.length && !profile.categories.includes(item.category)) return { status: "FAIL", reasons: ["机会类型不在企业画像的优先范围"], unknowns };
  if (profile.targetAudience.length && item.targetAudience.length && !hasAny(item.targetAudience, profile.targetAudience)) return { status: "FAIL", reasons: ["目标对象与企业画像不匹配"], unknowns };
  if (!item.eligibilitySummary || !item.eligibilityRequirements.length) unknowns.push("官方资格条件尚未完整结构化");
  if (!item.deadline && item.deadlineType !== "rolling") unknowns.push("截止时间未公开或待确认");
  if (unknowns.length) return { status: "UNKNOWN", reasons: ["基础方向匹配，但仍需确认关键资格字段"], unknowns };
  reasons.push("地区、类型和目标对象与画像匹配");
  return { status: "PASS", reasons, unknowns };
}
