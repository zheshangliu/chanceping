export const ICH_SCHEMA_VERSION = "1.0" as const;

export const ICH_PRIMARY_CATEGORIES = [
  "competition",
  "exhibition_market",
  "procurement_project",
  "channel_collaboration",
  "policy_funding",
  "international",
] as const;

export type IchPrimaryCategory = typeof ICH_PRIMARY_CATEGORIES[number];
export type IchTagCode = string;

export const ICH_OPPORTUNITY_STATUSES = [
  "opening_soon",
  "active",
  "closing_soon",
  "long_term",
  "expired",
  "ended",
  "cancelled",
  "pending_confirmation",
  "source_unavailable",
] as const;

export type IchOpportunityStatus = typeof ICH_OPPORTUNITY_STATUSES[number];
export type IchArchiveReason =
  | "deadline_passed"
  | "event_ended"
  | "cancelled"
  | "source_removed"
  | "duplicate"
  | "invalid"
  | "manual_archive";
export type IchDuplicateStatus = "unique" | "possible_duplicate" | "duplicate" | "merged";

export interface IchOrganizer {
  name: string;
  name_en: string | null;
  type:
    | "government"
    | "public_cultural_institution"
    | "museum"
    | "school"
    | "association"
    | "enterprise"
    | "brand"
    | "mall"
    | "hotel"
    | "scenic_area"
    | "media"
    | "international_organization"
    | "nonprofit"
    | "event_organizer"
    | "unknown";
  official_website: string | null;
  contact_text: string | null;
}

export interface IchLocation {
  country_code: string | null;
  country_name: string | null;
  province_state: string | null;
  city: string | null;
  district: string | null;
  venue_text: string | null;
  region_groups: string[];
  participation_scope:
    | "local_only"
    | "province_only"
    | "regional"
    | "nationwide"
    | "hong_kong_macao_taiwan"
    | "global"
    | "unrestricted"
    | "unknown";
  eligible_regions: string[];
  is_online: boolean;
  is_hybrid: boolean;
  is_multi_location: boolean;
  location_status: "confirmed" | "partially_confirmed" | "unknown";
}

export interface IchParticipationMode {
  mode: "online" | "offline" | "hybrid" | "unknown";
  submission_method:
    | "online_form"
    | "email"
    | "official_platform"
    | "wechat"
    | "phone"
    | "postal_mail"
    | "in_person"
    | "procurement_platform"
    | "contact_organizer"
    | "unknown";
  requires_on_site_presence: boolean | null;
  participation_notes: string | null;
}

export interface IchDates {
  published_at: string | null;
  application_start_at: string | null;
  deadline_at: string | null;
  deadline_text: string;
  event_start_at: string | null;
  event_end_at: string | null;
  timezone: string;
  is_deadline_all_day: boolean;
  is_long_term: boolean;
  date_status: "confirmed" | "partial" | "unknown" | "conflicting";
}

export interface IchEligibility {
  eligible_applicant_types: Array<
    "individual" | "inheritor" | "studio" | "enterprise" | "organization" |
    "school" | "designer" | "student" | "team" | "unrestricted" | "unknown"
  >;
  eligibility_text: string;
  ich_status_required: boolean | null;
  business_license_required: boolean | null;
  local_registration_required: boolean | null;
  recommendation_required: boolean | null;
  age_requirement_text: string | null;
  language_requirement_text: string | null;
  eligibility_status: "confirmed" | "partial" | "unknown" | "conflicting";
}

export interface IchBenefits {
  value_types: string[];
  prize_amount: number | null;
  prize_currency: string | null;
  funding_amount: number | null;
  funding_currency: string | null;
  procurement_budget_min: number | null;
  procurement_budget_max: number | null;
  procurement_currency: string | null;
  sales_opportunity: boolean | null;
  channel_opportunity: boolean | null;
  benefit_text: string;
}

export interface IchCosts {
  application_fee_amount: number | null;
  application_fee_currency: string | null;
  booth_fee_amount: number | null;
  booth_fee_currency: string | null;
  deposit_amount: number | null;
  deposit_currency: string | null;
  commission_rate: number | null;
  travel_self_funded: boolean | null;
  accommodation_self_funded: boolean | null;
  materials_self_funded: boolean | null;
  shipping_self_funded: boolean | null;
  cost_text: string;
  cost_status: "confirmed" | "partial" | "not_disclosed" | "unknown";
}

export interface IchRequirements {
  documents_required: string[];
  portfolio_required: boolean | null;
  sample_required: boolean | null;
  proposal_required: boolean | null;
  invoice_required: boolean | null;
  bidding_qualification_required: boolean | null;
  production_capacity_text: string | null;
  requirements_text: string;
}

export interface IchApplication {
  application_url: string | null;
  application_email: string | null;
  application_phone: string | null;
  application_platform: string | null;
  application_steps: string[];
  contact_text: string | null;
  application_status: "confirmed" | "partial" | "unknown" | "closed";
}

export interface IchSource {
  url: string;
  name: string;
  type: string;
  level: "L1" | "L2" | "L3" | "L4" | "L5";
  is_primary: boolean;
  published_at: string | null;
  last_checked_at: string;
  is_accessible: boolean;
  notes: string | null;
}

export interface IchVerification {
  verification_status: "verified" | "partially_verified" | "pending_verification" | "conflicting" | "rejected";
  verified_by: "manual" | "ai_assisted" | "system" | "unknown";
  verified_at: string | null;
  source_conflict: boolean;
  conflict_notes: string | null;
  needs_recheck: boolean;
  recheck_after: string | null;
}

export interface IchSeo {
  meta_title: string | null;
  meta_description: string | null;
  canonical_url: string | null;
  og_title: string | null;
  og_description: string | null;
  og_image: string | null;
  noindex: boolean;
}

export interface IchMetadata {
  created_at: string;
  updated_at: string;
  created_by: string;
  updated_by: string;
  first_discovered_at: string;
  last_checked_at: string;
  published_at: string | null;
  archived_at: string | null;
  data_version: string;
  source_import_batch: string | null;
}

export interface IchOpportunity {
  id: string;
  slug: string;
  external_id: string | null;
  title: string;
  title_original: string | null;
  title_en: string | null;
  summary: string;
  description: string | null;
  opportunity_value_text: string | null;
  primary_category: IchPrimaryCategory;
  secondary_tags: IchTagCode[];
  classification_confidence: "high" | "medium" | "low";
  classification_reason: string | null;
  classification_status: "confirmed" | "pending_review" | "rejected";
  status: IchOpportunityStatus;
  status_reason: string | null;
  is_featured: boolean;
  is_published: boolean;
  archive_reason: IchArchiveReason | null;
  organizer: IchOrganizer;
  location: IchLocation;
  participation_mode: IchParticipationMode;
  dates: IchDates;
  eligibility: IchEligibility;
  benefits: IchBenefits;
  costs: IchCosts;
  requirements: IchRequirements;
  application: IchApplication;
  sources: IchSource[];
  verification: IchVerification;
  seo: IchSeo | null;
  metadata: IchMetadata;
  duplicate_status: IchDuplicateStatus;
  duplicate_of_id: string | null;
  merged_from_ids: string[];
}

export interface IchOpportunityFile {
  schema_version: typeof ICH_SCHEMA_VERSION;
  updated_at: string;
  entries: IchOpportunity[];
}
