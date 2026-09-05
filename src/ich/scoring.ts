import type { EvidenceItem } from "../schema/evidence-item";
import type { ScoredOpportunity } from "../search/types";
import { scoreToLevel, type VisibleLevel } from "../schema/scoring-rules";
import type { IchSourcePolicyResult } from "./source-policy";

export const ICH_SCORING_WEIGHTS = {
  heritage_relevance: 25,
  evidence_authority: 25,
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

export function scoreIchSearchOpportunity(opportunity: ScoredOpportunity, evidenceItems: EvidenceItem[], policy: IchSourcePolicyResult): IchSearchScore {
  const coverage = evidenceCoverage(evidenceItems);
  const dimensions = {
    heritage_relevance: clamp(opportunity.relevance_score),
    evidence_authority: clamp((policy.evidenceLevel === "L1" ? 95 : policy.evidenceLevel === "L2" ? 75 : policy.evidenceLevel === "L3" ? 45 : 20) * 0.6 + coverage * 0.4),
    timeliness: clamp(opportunity.chance_score.urgency),
    eligibility_fit: clamp(opportunity.chance_score.fit),
    actionability: clamp(opportunity.chance_score.intent * 0.5 + (100 - opportunity.chance_score.effort_cost) * 0.5),
    source_risk: policy.decision === "blocked" ? 100 : policy.decision === "discovery_only" ? 60 : policy.decision === "candidate_secondary" ? 25 : 5,
  };
  const weighted = (dimensions.heritage_relevance * ICH_SCORING_WEIGHTS.heritage_relevance + dimensions.evidence_authority * ICH_SCORING_WEIGHTS.evidence_authority + dimensions.timeliness * ICH_SCORING_WEIGHTS.timeliness + dimensions.eligibility_fit * ICH_SCORING_WEIGHTS.eligibility_fit + dimensions.actionability * ICH_SCORING_WEIGHTS.actionability - dimensions.source_risk * ICH_SCORING_WEIGHTS.source_risk) / 100;
  const total = clamp(weighted);
  const formal_publish_eligible = policy.decision === "publishable_primary" && coverage >= 50;
  const reasons = [
    `evidence coverage ${coverage}%`,
    `source policy ${policy.decision}`,
    formal_publish_eligible ? "critical evidence threshold met" : "candidate remains behind source/evidence gate",
  ];
  return { total, level: scoreToLevel(total), dimensions, evidence_coverage: coverage, formal_publish_eligible, reasons };
}
