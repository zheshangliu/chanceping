import type { Company } from "../model/company";
import type { CompanySignal } from "../model/signal";
import type { Job } from "../model/job";
import type { ContactEntry } from "../model/contact";
import type { RawEvidence, EvidenceRecord } from "../model/evidence";
import type { Person } from "../model/person";
import type { TrendIntelligence } from "../model/trend";
import type { WeeklyLeadSnapshot } from "../model/lead";
import { inferNeeds } from "../need/need-inference";
import { calculateBusinessScore } from "../scoring/business-score";
import { calculateFreshnessScore, calculateFinalRankScore } from "../scoring/freshness-score";
import { evaluateLeadGate } from "../scoring/lead-gate";
import { rankWeeklyCandidates } from "../scoring/lead-ranking";
import { isContactGateEligible } from "../model/contact";
import { generateBdAction } from "../actions/bd-action-generator";
import { generateOutreach } from "../actions/outreach-generator";
import { buildLeadPresentation } from "./lead-presentation";
import { evaluateEvidenceGate } from "../signals/primary-trigger";

export const RADAR_PIPELINE_STAGES = ["Target/Discovery Universe", "Search", "Evidence", "Company Resolver", "Signal", "Job", "Contact", "Need", "Score", "Gate", "Ranking", "A/B", "Trend"] as const;

export interface HeadhunterRadarInput {
  radar_run_id: string;
  week_key: string;
  companies: Company[];
  signals: CompanySignal[];
  jobs: Job[];
  people: Person[];
  contacts: ContactEntry[];
  evidences?: Array<RawEvidence | EvidenceRecord>;
  trends: TrendIntelligence[];
  now?: Date;
}

export interface HeadHunterRadarResult {
  radar_run_id: string;
  week_key: string;
  stage_order: readonly string[];
  leads: WeeklyLeadSnapshot[];
  trends: TrendIntelligence[];
  funnel_metrics?: {
    candidate_url_count: number;
    company_candidate_count: number;
    company_resolved_count: number;
    signal_count: number;
    job_count: number;
    person_candidate_count: number;
    contact_count: number;
    need_count: number;
    a_count: number;
    b_count: number;
    blocking_reasons?: Record<string, number>;
  };
}

export async function runHeadhunterRadar(input: HeadhunterRadarInput): Promise<HeadHunterRadarResult> {
  const now = input.now ?? new Date();
  const candidates = input.companies.map((company) => {
    const signals = input.signals.filter((signal) => signal.company_id === company.company_id);
    const jobs = input.jobs.filter((job) => job.company_id === company.company_id);
    const people = input.people.filter((person) => person.current_company_id === company.company_id);
    const contacts = input.contacts.filter((contact) => contact.company_id === company.company_id);
    const needs = inferNeeds(company, signals, jobs);
    const hrNeed = needs[0]?.basis ?? null;
    const score = calculateBusinessScore({ hr_need_basis: hrNeed, has_hr_contact: people.some((person) => ["ta", "recruiter", "hrbp", "hrd"].includes(person.role_category) && person.employment_status === "verified_current"), has_business_decision_maker: people.some((person) => ["business_leader", "ceo", "coo", "country_manager"].includes(person.role_category)), has_public_contact_entry: contacts.some(isContactGateEligible), priority_segment: company.target_segment !== "other", recent_trigger: signals.length > 0, deliverable_role: needs.length > 0, reliable_evidence: signals.some((signal) => signal.evidence_ids.length > 0) });
    const jobSourceUrls = new Set(jobs.flatMap((job) => job.source_urls));
    const evidenceForCompany = (input.evidences ?? []).filter((evidence) => signals.some((signal) => signal.evidence_ids.includes(evidence.evidence_id)) || evidence.source_url === company.website || jobSourceUrls.has(evidence.source_url));
    const evidencePass = evidenceForCompany.length > 0 && evaluateEvidenceGate(evidenceForCompany).passed;
    const contactPass = contacts.some(isContactGateEligible);
    const gate = evaluateLeadGate({ company_gate: company.status === "active", trigger_gate: signals.length > 0, need_gate: needs.length > 0, evidence_gate: evidencePass, contact_gate: contactPass, action_gate: true, business_score: score.business_score });
    const latest = signals.map((signal) => signal.last_seen_at).sort().at(-1) ?? null;
    const freshness = calculateFreshnessScore(latest, now);
    const roleCategory = people[0]?.role_category ?? (contacts.length > 0 ? "official_entry" : "other");
    const actionContext = { company_name: company.canonical_name, role_category: roleCategory, trigger_summary: signals[0]?.fact_summary ?? "近期经营变化", need_basis: hrNeed, contact_label: contacts[0]?.label };
    const generatedAction = generateBdAction(actionContext);
    const generatedOutreach = generateOutreach({ ...actionContext, recipient_name: people[0]?.name ?? null, capability_hint: needs[0]?.role_family ?? "相关岗位与团队搭建" });
    const baseLead = { id: `lead-${company.company_id}-${input.week_key}`, company_id: company.company_id, week_key: input.week_key, radar_run_id: input.radar_run_id, source: "auto" as const, business_review_status: "machine_candidate" as const, primary_trigger_id: signals[0]?.signal_id ?? null, supporting_signal_ids: signals.slice(1).map((signal) => signal.signal_id), need_inference_ids: needs.map((need) => need.need_inference_id), contact_gate_status: contactPass ? "pass" as const : "fail" as const, evidence_gate_status: evidencePass ? "pass" as const : "fail" as const, business_score: score.business_score, freshness_score: freshness, final_rank_score: calculateFinalRankScore(score.business_score, freshness), lead_pool: gate.passed ? "A_ACTIONABLE" as const : "B_ENRICHMENT" as const, b_reasons: gate.passed ? [] : gate.reasons.map((reason) => reason === "contact_gate=fail" ? "missing_contact" : reason), generated_action: generatedAction.next_step, manual_action: null, generated_outreach: generatedOutreach.body, manual_outreach: null, action_manually_edited: false, outreach_manually_edited: false, manual_edit: false, manual_pool_override: null, created_at: now.toISOString(), updated_at: now.toISOString(), hard_gate_passed: gate.passed };
    return { ...buildLeadPresentation({ lead: baseLead, company, signals, jobs, people, contacts, evidences: evidenceForCompany, needs }), hard_gate_passed: gate.passed };
  });
  const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const ranked = rankWeeklyCandidates(candidates.map(({ lead_pool: _pool, ...candidate }) => candidate)).map(({ hard_gate_passed: _ignored, ...lead }) => ({ ...candidateById.get(lead.id), ...lead }) as unknown as WeeklyLeadSnapshot);
  return { radar_run_id: input.radar_run_id, week_key: input.week_key, stage_order: RADAR_PIPELINE_STAGES, leads: ranked, trends: input.trends.slice(0, 3) };
}
