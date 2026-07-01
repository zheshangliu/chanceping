import type { RadarRequirementSpec, QuestionToConfirm } from "../schema/radar-requirement-spec";
import type { RadarProfileSummary } from "../schema/radar-profile-summary";

function list(values: unknown): string[] {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : typeof values === "string" ? [values] : [])
        .map((value) => String(value ?? "").trim())
        .filter(Boolean),
    ),
  );
}

function firstNonEmpty(...values: Array<unknown>): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (Array.isArray(value) && value.length > 0) return value.map(String).join("、");
  }
  return "未明确";
}

export function buildRadarProfileSummary(spec: RadarRequirementSpec): RadarProfileSummary {
  const cp = spec.client_profile;
  const goals = spec.core_goals;
  const scope = spec.opportunity_scope;
  const region = spec.region_scope;
  const filter = spec.filter_rules;
  const sourceStrategy = spec.source_strategy;
  const sourceHints = [
    ...(sourceStrategy?.user_supplied_sources ?? []).map((source) => source.source_url || source.source_name),
    ...(sourceStrategy?.manual_sources ?? []),
    ...(sourceStrategy?.official_sites ?? []),
    ...(sourceStrategy?.platforms ?? []),
  ];
  const assumptions: string[] = [];
  if (!cp.business_type && !cp.client_type) assumptions.push("默认以用户本人或其代表的组织作为雷达主体");
  if ((region.primary_regions ?? []).length === 0) assumptions.push("默认优先看中国范围，允许线上和海外高价值机会");
  if (!goals.success_definition) assumptions.push("默认优先看未来30天内可行动机会");
  if ((filter.must_exclude ?? []).length === 0 && (scope.excluded_opportunity_types ?? []).length === 0) {
    assumptions.push("默认排除广告、旧新闻和已截止机会");
  }

  return {
    identity: firstNonEmpty(cp.business_type, cp.client_type, cp.industry),
    target: firstNonEmpty(scope.primary_opportunity_types, goals.primary_goal),
    priorities: list([...(goals.priority_order ?? []), ...(scope.must_have_conditions ?? []), ...(scope.nice_to_have_conditions ?? [])]),
    regionsAndTime: `${firstNonEmpty(region.primary_regions, cp.regions)}；${firstNonEmpty(goals.success_definition)}`,
    exclusions: list([...(scope.excluded_opportunity_types ?? []), ...(filter.must_exclude ?? []), ...(region.excluded_regions ?? [])]),
    sourceHints: list(sourceHints),
    assumptions,
  };
}

export function questionsToConfirmPayload(
  questions: QuestionToConfirm[],
): Array<{ id: string; question: string; priority: number }> {
  const priority: Record<string, number> = { high: 3, medium: 2, low: 1 };
  return questions
    .map((item, index) => ({
      id: item.related_field || `question_${index + 1}`,
      question: item.question,
      priority: priority[item.priority] ?? 1,
    }))
    .filter((item) => item.question.trim())
    .sort((a, b) => b.priority - a.priority);
}
