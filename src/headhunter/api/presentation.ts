import type { HeadHunterApiContext } from "./context";
import type { WeeklyLeadSnapshot } from "../model/lead";
import { buildLeadPresentation } from "../pipeline/lead-presentation";

export async function hydrateLead(lead: WeeklyLeadSnapshot, context: HeadHunterApiContext): Promise<WeeklyLeadSnapshot> {
  const company = await context.stores.companies.get(lead.company_id);
  if (!company) return lead;
  const [signals, jobs, people, contacts, evidences] = await Promise.all([
    context.stores.signals.listByCompany(company.company_id),
    context.stores.jobs.listByCompany(company.company_id),
    context.stores.people.list(),
    context.stores.contacts.listByCompany(company.company_id),
    context.stores.evidence.list(),
  ]);
  const linkedEvidenceIds = new Set(lead.evidence_ids ?? []);
  const presented = buildLeadPresentation({ lead, company, signals, jobs, people: people.filter((person) => person.current_company_id === company.company_id), contacts, evidences: evidences.filter((evidence) => linkedEvidenceIds.has(evidence.evidence_id) || evidence.source_url === company.website) });
  if (presented.lead_pool === "A_ACTIONABLE" && (presented.evidence_gate_status !== "pass" || presented.contact_gate_status !== "pass")) {
    return { ...presented, lead_pool: "B_ENRICHMENT", b_reasons: [...new Set([...(presented.b_reasons ?? []), "evidence_or_contact_gate_fail"])], manual_pool_override: null };
  }
  return presented;
}

export async function hydrateLeads(leads: WeeklyLeadSnapshot[], context: HeadHunterApiContext): Promise<WeeklyLeadSnapshot[]> {
  return Promise.all(leads.map((lead) => hydrateLead(lead, context)));
}
