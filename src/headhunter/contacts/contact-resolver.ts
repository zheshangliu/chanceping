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
  /** Optional semantic role from official-contact-extractor. */
  contact_role?: "recruitment" | "business" | "general";
  context?: string;
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
    notes: entry.contact_role ? `official contact role: ${entry.contact_role}` : null,
  }));
}

function isSafePublicContact(entry: DiscoveredContact): boolean {
  if (/(wechat|微信|private|personal|私人|home address|家庭住址)/i.test(entry.value)) return false;
  if (/(privacy|webmaster|technical support|media|press|新闻媒体)/i.test(`${entry.label ?? ""} ${entry.context ?? ""}`) && !entry.contact_role) return false;
  if (["linkedin_profile", "website", "official_website"].includes(entry.type)) return true;
  if (!entry.public_verified) return false;
  if (entry.professional === false) return false;
  if (entry.type.includes("email") || entry.type === "email") {
    const local = entry.value.split("@", 1)[0] ?? "";
    if (/^(?:privacy|webmaster|support|no-?reply|noreply|donotreply|media|press|abuse|security)(?:[+._-].*)?$/i.test(local)) return false;
    if (!/^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(entry.value.trim())) return false;
  }
  if (entry.type.includes("phone") || entry.type === "phone") {
    if (entry.value.replace(/\D/g, "").length < 8) return false;
  }
  return true;
}

export function isPrecisionSafePublicContact(entry: DiscoveredContact): boolean { return isSafePublicContact(entry); }
