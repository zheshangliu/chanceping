import type { ContactEntry, ContactKind } from "../model/contact";
import type { Person } from "../model/person";
import { ContactSearchBudget, type ContactSearchProvider } from "./contact-search-budget";

export interface DiscoveredContact {
  type: ContactKind;
  value: string;
  source_url: string;
  public_verified: boolean;
  professional?: boolean;
  person_id?: string | null;
  label?: string | null;
}

export interface ContactDiscoveryInput {
  company_id: string;
  person?: Person | null;
  provider: ContactSearchProvider;
  entries: DiscoveredContact[];
}

export function discoverContactEntries(input: ContactDiscoveryInput, budget: ContactSearchBudget): ContactEntry[] {
  if (!budget.consume(input.provider)) return [];
  return input.entries.filter(isSafePublicContact).map((entry, index) => ({
    contact_id: `contact-${input.company_id}-${input.provider}-${index + 1}`,
    company_id: input.company_id,
    person_id: entry.person_id ?? input.person?.person_id ?? null,
    kind: entry.type,
    value: entry.value,
    label: entry.label ?? null,
    source_url: entry.source_url,
    public_verified: entry.public_verified,
    professional: entry.professional ?? true,
    verified_at: entry.public_verified ? new Date().toISOString() : null,
    notes: null,
  }));
}

function isSafePublicContact(entry: DiscoveredContact): boolean {
  if (!entry.public_verified) return true;
  if (["linkedin_profile", "website", "official_website"].includes(entry.type)) return true;
  return !/(wechat|微信|personal|私人|home address|家庭住址)/i.test(entry.value);
}
