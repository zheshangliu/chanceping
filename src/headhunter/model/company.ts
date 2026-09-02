export type TargetSegment = "hk_finance" | "gba_company" | "outbound_manufacturing" | "other";

export type EntityScope = "legal_entity" | "operating_entity" | "group" | "subsidiary";

export type CompanyResolutionStatus = "MATCHED" | "NEEDS_REVIEW" | "NEW_COMPANY" | "CONFLICT";

export type CompanyStatus = "active" | "inactive" | "unknown";

export interface Company {
  company_id: string;
  canonical_name: string;
  name_cn: string | null;
  name_en: string | null;
  aliases: string[];
  industry: string | null;
  sub_industry: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  company_type: string | null;
  website: string | null;
  linkedin_company_url: string | null;
  official_domains: string[];
  target_segment: TargetSegment;
  parent_company_id: string | null;
  entity_scope: EntityScope;
  created_at: string;
  updated_at: string;
  last_verified_at: string | null;
  status: CompanyStatus;
}

export interface CompanyResolution {
  company_id: string | null;
  input_name: string;
  matched_name: string | null;
  status: CompanyResolutionStatus;
  name_match: boolean;
  industry_match: boolean | null;
  region_match: boolean | null;
  official_website_match: boolean | null;
  reviewed_at: string;
  notes: string[];
}

export function isCompanyResolutionStatus(value: string): value is CompanyResolutionStatus {
  return ["MATCHED", "NEEDS_REVIEW", "NEW_COMPANY", "CONFLICT"].includes(value);
}
