import type { EmploymentStatus, Person, RoleCategory } from "../model";

export interface PersonCandidate {
  person_id?: string;
  name: string;
  linkedin_url?: string | null;
  current_company_id?: string | null;
  current_company_name?: string | null;
  current_title?: string | null;
  role_category?: RoleCategory;
  source_urls?: string[];
}

export function resolvePersonCandidate(candidate: PersonCandidate, targetCompanyId: string): Person {
  const employment_status: EmploymentStatus = candidate.current_company_id === targetCompanyId
    ? "verified_current"
    : candidate.current_company_id ? "stale" : "unknown";
  return {
    person_id: candidate.person_id ?? `person-${slug(candidate.name)}-${targetCompanyId}`,
    name: candidate.name,
    linkedin_url: candidate.linkedin_url ?? null,
    current_company_id: candidate.current_company_id ?? null,
    current_title: candidate.current_title ?? null,
    role_category: candidate.role_category ?? "other",
    employment_status,
    employment_verified_at: employment_status === "verified_current" ? new Date().toISOString() : null,
    source_urls: candidate.source_urls ?? (candidate.linkedin_url ? [candidate.linkedin_url] : []),
  };
}

function slug(value: string): string { return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unknown"; }
