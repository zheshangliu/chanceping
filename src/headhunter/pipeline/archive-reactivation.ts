import type { CompanySignal } from "../model/signal";
import type { WeeklyLeadSnapshot } from "../model/lead";

export interface ArchiveResult { archived_ids: string[]; leads: WeeklyLeadSnapshot[]; }

export function archiveStaleBLeads(leads: WeeklyLeadSnapshot[], currentWeek: string): ArchiveResult {
  const archived_ids: string[] = [];
  const next = leads.map((lead) => {
    if (lead.lead_pool !== "B_ENRICHMENT") return lead;
    const weeks = weekDistance(lead.week_key, currentWeek);
    if (weeks < 8) return lead;
    archived_ids.push(lead.id);
    return { ...lead, lead_pool: "ARCHIVED" as const, updated_at: new Date().toISOString() };
  });
  return { archived_ids, leads: next };
}

export function reactivateCompanyOnMeaningfulSignal(companyId: string, signal: CompanySignal, leads: WeeklyLeadSnapshot[]): WeeklyLeadSnapshot[] {
  if (signal.company_id !== companyId) return leads;
  return leads.map((lead) => lead.company_id === companyId && lead.lead_pool === "ARCHIVED" ? { ...lead, lead_pool: "B_ENRICHMENT", b_reasons: ["waiting_for_new_signal"], updated_at: new Date().toISOString() } : lead);
}

function weekDistance(from: string, to: string): number {
  const parse = (value: string): number => { const match = /^(\d{4})-W(\d{2})$/.exec(value); return match ? Number(match[1]) * 53 + Number(match[2]) : 0; };
  return Math.max(0, parse(to) - parse(from));
}
