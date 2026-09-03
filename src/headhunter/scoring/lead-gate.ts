import type { LeadPool, WeeklyLeadSnapshot } from "../model/lead";

export interface LeadGateContext {
  company_gate: boolean;
  trigger_gate: boolean;
  need_gate: boolean;
  evidence_gate: boolean;
  contact_gate: boolean;
  action_gate: boolean;
  business_score: number;
}

export interface LeadGateResult {
  passed: boolean;
  reasons: string[];
}

export function evaluateLeadGate(context: LeadGateContext): LeadGateResult {
  const reasons: string[] = [];
  for (const [name, passed] of Object.entries(context).filter(([key]) => key.endsWith("_gate"))) if (!passed) reasons.push(`${name}=fail`);
  if (context.business_score < 70) reasons.push("business_score_below_70");
  return { passed: reasons.length === 0, reasons };
}

export function applyManualPoolOverride(snapshot: WeeklyLeadSnapshot, pool: LeadPool): WeeklyLeadSnapshot {
  return {
    ...snapshot,
    lead_pool: pool,
    manual_pool_override: pool,
    business_review_status: pool === "A_ACTIONABLE" ? "human_approved" : "human_downgraded",
    manual_edit: true,
    updated_at: new Date().toISOString(),
  };
}
