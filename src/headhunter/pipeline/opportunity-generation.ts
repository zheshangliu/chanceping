import type { Company } from "../model/company";
import type { CompanySignal } from "../model/signal";
import type { ContactEntry } from "../model/contact";
import type { EventCandidate } from "./signal-first-discovery";

export type OpportunityType = "hiring_signal" | "expansion_signal" | "leadership_signal" | "investment_signal" | "regulatory_signal";

export interface OpportunityCandidate {
  opportunity_id: string;
  opportunity_type: OpportunityType;
  title: string;
  summary: string;
  company_id: string | null;
  company_name: string | null;
  event_id: string;
  event_date: string | null;
  source_url: string;
  status: "candidate" | "eligible" | "rejected";
  rejection_reason: string | null;
  score: number;
  score_breakdown: { signal_strength: number; time: number; hiring_likelihood: number; company_value: number; contact_executability: number };
  next_action: string | null;
  evidence_ids: string[];
}

export function generateOpportunityCandidates(events: EventCandidate[], companies: Company[], signals: CompanySignal[], contacts: ContactEntry[], now = new Date()): OpportunityCandidate[] {
  const companyMap = new Map(companies.map((company) => [company.company_id, company]));
  const signalMap = new Map(signals.map((signal) => [signal.primary_source_id ?? "", signal]));
  return events.map((event) => {
    const company = event.company_id ? companyMap.get(event.company_id) ?? null : null;
    const signal = event.evidence_id ? signalMap.get(event.evidence_id) : undefined;
    const text = `${event.title} ${event.snippet}`;
    const type = classifyOpportunityType(text);
    const signalStrength = event.status === "valid_recent_trigger" ? 90 : ACTION.test(text) ? 55 : 20;
    const time = freshnessScore(event.event_date, now);
    const hiringLikelihood = /hire|hiring|recruit|招聘|人才|岗位|team|manager|director/i.test(text) ? 90 : 35;
    const companyValue = company ? companyValueScore(company) : 10;
    const contactExecutability = company && contacts.some((contact) => contact.company_id === company.company_id && contact.public_verified && contact.professional) ? 90 : 15;
    const score = Math.round(signalStrength * .30 + time * .20 + hiringLikelihood * .20 + companyValue * .15 + contactExecutability * .15);
    const eligible = event.status === "valid_recent_trigger" && Boolean(company) && Boolean(signal || event.evidence_id);
    const status: OpportunityCandidate["status"] = eligible ? "eligible" : event.status === "valid_recent_trigger" ? "candidate" : "rejected";
    return { opportunity_id: `opportunity-${event.event_id}`, opportunity_type: type, title: event.title, summary: event.snippet || event.title, company_id: event.company_id, company_name: company?.canonical_name ?? null, event_id: event.event_id, event_date: event.event_date, source_url: event.url, status, rejection_reason: eligible ? null : event.reasons[0] ?? "event/company gate not complete", score, score_breakdown: { signal_strength: signalStrength, time, hiring_likelihood: hiringLikelihood, company_value: companyValue, contact_executability: contactExecutability }, next_action: eligible ? (contactExecutability >= 50 ? "复核联系人并准备首触" : "先补充公开联系入口") : null, evidence_ids: [event.evidence_id, signal?.primary_source_id].filter((value): value is string => Boolean(value)) };
  }).sort((a, b) => b.score - a.score);
}

export function opportunityMetrics(opportunities: OpportunityCandidate[]): { candidate_count: number; eligible_count: number; rejected_count: number; contactable_count: number; human_review_target: number } { return { candidate_count: opportunities.filter((item) => item.status !== "rejected").length, eligible_count: opportunities.filter((item) => item.status === "eligible").length, rejected_count: opportunities.filter((item) => item.status === "rejected").length, contactable_count: opportunities.filter((item) => item.status === "eligible" && item.next_action?.includes("首触")).length, human_review_target: Math.min(10, opportunities.filter((item) => item.status === "eligible").length) }; }

const ACTION = /announce|launch|open|expand|establish|build|invest|hire|recruit|appoint|fund|acqui|merge|license|relocat|restructur|layoff|order|招聘|招募|扩张|宣布|设立|建设|投资|融资|并购|牌照|重组|订单|投产|扩产/i;
function classifyOpportunityType(text: string): OpportunityType { if (/hire|hiring|recruit|招聘|岗位|人才/i.test(text)) return "hiring_signal"; if (/appoint|appointment|CEO|director|负责人|任命/i.test(text)) return "leadership_signal"; if (/license|牌照|资格/i.test(text)) return "regulatory_signal"; if (/fund|funding|融资|investment|投资|project|项目/i.test(text)) return "investment_signal"; return "expansion_signal"; }
function freshnessScore(eventDate: string | null, now: Date): number { if (!eventDate) return 5; const age = Math.max(0, (now.getTime() - Date.parse(eventDate)) / 86400000); return Math.max(0, Math.round(100 - Math.min(age, 120) / 120 * 100)); }
function companyValueScore(company: Company): number { return company.target_segment === "hk_finance" ? 85 : company.target_segment === "outbound_manufacturing" ? 80 : 70; }
