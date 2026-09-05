import type { EvidenceItem } from "../schema/evidence-item";
import type { ScoredOpportunity } from "../search/types";
import { scoreToLevel, type VisibleLevel } from "../schema/scoring-rules";
import type { IchSourcePolicyResult } from "./source-policy";
import type { IchApplicantFit } from "./applicant-fit";

export const ICH_SCORING_WEIGHTS = {
  evidence_authority: 20,
  heritage_relevance: 25,
  actionability: 25,
  applicant_fit: 0,
  commercial_value: 20,
  freshness: 10,
} as const;

/** Legacy aliases remain outside the weighted total for report compatibility. */
export const ICH_SCORING_LEGACY_DIMENSIONS = {
  timeliness: 15,
  eligibility_fit: 15,
  actionability: 15,
  source_risk: 5,
} as const;

export interface IchSearchScore {
  total: number;
  level: VisibleLevel;
  dimensions: Record<keyof typeof ICH_SCORING_WEIGHTS, number>;
  evidence_coverage: number;
  formal_publish_eligible: boolean;
  reasons: string[];
}

function clamp(value: number): number { return Math.max(0, Math.min(100, Math.round(value))); }

function evidenceCoverage(items: EvidenceItem[]): number {
  const required = new Set(["title", "deadline", "organizer", "region", "eligibility", "application_url"]);
  const covered = new Set(items.filter((item) => !item.needsReview && item.evidenceText.trim()).map((item) => item.field));
  return Math.round((Array.from(required).filter((field) => covered.has(field as EvidenceItem["field"])).length / required.size) * 100);
}

export function scoreIchSearchOpportunity(opportunity: ScoredOpportunity, evidenceItems: EvidenceItem[], policy: IchSourcePolicyResult, applicantFit?: IchApplicantFit): IchSearchScore {
  const coverage = evidenceCoverage(evidenceItems);
  const text = `${opportunity.search_result.title} ${opportunity.search_result.snippet}`;
  const commercialSignal = /采购|招标|供应商|合作|联名|入驻|展销|commission|supplier|partnership|collaboration|market/i.test(text);
  const heritageSignal = /非遗|非物质文化遗产|传统工艺|传统技艺|手工艺|工艺美术|文化遗产|heritage craft|traditional craft|artisan|craftsmanship/i.test(text);
  const dimensions = {
    evidence_authority: clamp((policy.evidenceLevel === "L1" ? 95 : policy.evidenceLevel === "L2" ? 75 : policy.evidenceLevel === "L3" ? 45 : 20) * 0.6 + coverage * 0.4),
    heritage_relevance: clamp(opportunity.relevance_score + (heritageSignal ? 15 : -10)),
    actionability: clamp(opportunity.chance_score.intent * 0.6 + (100 - opportunity.chance_score.effort_cost) * 0.4),
    applicant_fit: clamp(applicantFit?.score ?? opportunity.chance_score.fit),
    commercial_value: commercialSignal ? 85 : 35,
    freshness: clamp(opportunity.chance_score.urgency),
  };
  const weighted = (dimensions.evidence_authority * ICH_SCORING_WEIGHTS.evidence_authority + dimensions.heritage_relevance * ICH_SCORING_WEIGHTS.heritage_relevance + dimensions.actionability * ICH_SCORING_WEIGHTS.actionability + dimensions.applicant_fit * ICH_SCORING_WEIGHTS.applicant_fit + dimensions.commercial_value * ICH_SCORING_WEIGHTS.commercial_value + dimensions.freshness * ICH_SCORING_WEIGHTS.freshness) / 100;
  const total = clamp(weighted);
  const formal_publish_eligible = policy.decision === "publishable_primary" && coverage >= 50;
  const reasons = [
    `evidence coverage ${coverage}%`,
    `source policy ${policy.decision}`,
    formal_publish_eligible ? "critical evidence threshold met" : "candidate remains behind source/evidence gate",
  ];
  return { total, level: scoreToLevel(total), dimensions, evidence_coverage: coverage, formal_publish_eligible, reasons };
}
