import type { Company } from "../model/company";
import type { Job } from "../model/job";
import type { NeedInference } from "../model/lead";
import type { CompanySignal } from "../model/signal";
import { NEED_RULES, type NeedRuleKey } from "./need-mapping-rules";

export function inferNeeds(company: Company, signals: CompanySignal[], jobs: Job[]): NeedInference[] {
  const relevantSignals = signals.filter((signal) => signal.company_id === company.company_id);
  const results: NeedInference[] = [];
  const openJobs = jobs.filter((job) => job.company_id === company.company_id && job.current_status === "open");
  if (openJobs.length > 0) {
    for (const roleFamily of new Set(openJobs.map((job) => job.role_family ?? job.canonical_title))) {
      results.push(makeNeed(company.company_id, `explicit-${roleFamily}`, roleFamily, "explicit_hiring", 1, [], relevantSignals.map((s) => s.signal_id), "Open job evidence explicitly indicates hiring."));
    }
  }
  for (const signal of relevantSignals) {
    const rule = ruleForSignal(company, signal);
    if (!rule) continue;
    const existing = results.some((need) => need.role_family === rule.roles[0]);
    const basis = openJobs.length > 0 ? "explicit_hiring" : "high_confidence_business_inference";
    for (const role of rule.roles) {
      if (existing && basis === "explicit_hiring") continue;
      results.push(makeNeed(company.company_id, `${signal.signal_id}-${role}`, role, basis, basis === "explicit_hiring" ? 1 : 0.85, [], [signal.signal_id], basis === "explicit_hiring" ? "Open job evidence explicitly indicates hiring." : "High-confidence business event mapped to a delivery role; this is an inference, not a claim of active hiring."));
    }
  }
  return results;
}

function ruleForSignal(company: Company, signal: CompanySignal): { roles: readonly string[] } | null {
  if (signal.signal_type === "factory_build" || signal.signal_type === "factory_expand") return { roles: NEED_RULES.factory_build };
  if (signal.signal_type === "regional_hq" || signal.signal_type === "treasury_center") return { roles: NEED_RULES.regional_hq };
  if (signal.signal_type === "new_license" && company.target_segment === "hk_finance") return { roles: NEED_RULES.new_license_finance };
  return null;
}

function makeNeed(companyId: string, id: string, role: string, basis: NeedInference["basis"], confidence: number, factBasisIds: string[], signalIds: string[], summary: string): NeedInference {
  return { need_inference_id: `need-${id}`, company_id: companyId, weekly_lead_snapshot_id: null, need_type: "talent_demand", role_family: role, basis, confidence, fact_basis_ids: factBasisIds, signal_ids: signalIds, reasoning_summary: summary };
}

export { NEED_RULES };
export type { NeedRuleKey };
