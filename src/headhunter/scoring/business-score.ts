import type { NeedBasis } from "../model/lead";

export const BUSINESS_SCORE_WEIGHTS = {
  hr_need: 20,
  hr_contact: 20,
  business_decision_maker: 15,
  public_contact_entry: 15,
  priority_segment: 10,
  recent_trigger: 10,
  deliverable_role: 5,
  reliable_evidence: 5,
} as const;

export interface LeadScoringContext {
  hr_need_basis: NeedBasis | null;
  has_hr_contact: boolean;
  has_business_decision_maker: boolean;
  has_public_contact_entry: boolean;
  priority_segment: boolean;
  recent_trigger: boolean;
  deliverable_role: boolean;
  reliable_evidence: boolean;
}

export interface ScoreBreakdown {
  business_score: number;
  components: Record<keyof typeof BUSINESS_SCORE_WEIGHTS, number>;
}

export function calculateBusinessScore(context: LeadScoringContext): ScoreBreakdown {
  const components = {
    hr_need: context.hr_need_basis === "explicit_hiring" ? 20 : context.hr_need_basis === "high_confidence_business_inference" ? 12 : context.hr_need_basis === "general_business_inference" ? 6 : 0,
    hr_contact: context.has_hr_contact ? BUSINESS_SCORE_WEIGHTS.hr_contact : 0,
    business_decision_maker: context.has_business_decision_maker ? BUSINESS_SCORE_WEIGHTS.business_decision_maker : 0,
    public_contact_entry: context.has_public_contact_entry ? BUSINESS_SCORE_WEIGHTS.public_contact_entry : 0,
    priority_segment: context.priority_segment ? BUSINESS_SCORE_WEIGHTS.priority_segment : 0,
    recent_trigger: context.recent_trigger ? BUSINESS_SCORE_WEIGHTS.recent_trigger : 0,
    deliverable_role: context.deliverable_role ? BUSINESS_SCORE_WEIGHTS.deliverable_role : 0,
    reliable_evidence: context.reliable_evidence ? BUSINESS_SCORE_WEIGHTS.reliable_evidence : 0,
  };
  return { business_score: Object.values(components).reduce((sum, value) => sum + value, 0), components };
}
