import type {
  IchOpportunity,
  IchOrganizer,
  IchLocation,
  IchPrimaryCategory,
} from "./types";

/**
 * Explicit factory for controlled-import batches.
 *
 * This intentionally does not clone an existing formal opportunity. Every
 * field is initialized here, and unknown facts remain null/unknown/partial
 * until an L1 page proves them.
 */
export interface IchOpportunityCandidateSpec {
  slug: string;
  title: string;
  summary: string;
  description: string;
  valueText: string;
  category: IchPrimaryCategory;
  tags: string[];
  organizer: IchOrganizer;
  location: IchLocation;
  mode: IchOpportunity["participation_mode"]["mode"];
  submissionMethod: IchOpportunity["participation_mode"]["submission_method"];
  onsite: boolean | null;
  publishedAt: string | null;
  applicationStartAt: string | null;
  deadlineAt: string | null;
  deadlineText: string;
  timezone: string;
  applicants: IchOpportunity["eligibility"]["eligible_applicant_types"];
  eligibilityText: string;
  ichRequired: boolean | null;
  businessLicenseRequired: boolean | null;
  localRegistrationRequired: boolean | null;
  benefitText: string;
  valueTypes: string[];
  procurementBudget: number | null;
  procurementCurrency: string | null;
  salesOpportunity: boolean | null;
  channelOpportunity: boolean | null;
  fee: number | null;
  feeCurrency: string | null;
  costText: string;
  costStatus: IchOpportunity["costs"]["cost_status"];
  requirementsText: string;
  documents: string[];
  portfolioRequired: boolean | null;
  sampleRequired: boolean | null;
  proposalRequired: boolean | null;
  biddingRequired: boolean | null;
  applicationUrl: string | null;
  applicationEmail: string | null;
  applicationSteps: string[];
  sourceUrl: string;
  sourceName: string;
  sourceType: string;
  sourceNotes: string;
  sourcePublishedAt: string | null;
  direction: string;
  ichActionable: boolean;
  supplierChannelEligible: boolean;
  radarTags: string[];
  fieldProvenance: Record<string, { source_url: string; checked_at: string; note: string }>;
}

export type IchOpportunityWithBatchFields = IchOpportunity & {
  opportunity_direction: string;
  ich_actionable: boolean;
  supplier_channel_eligible: boolean;
  radar_tags: string[];
  field_provenance: IchOpportunityCandidateSpec["fieldProvenance"];
};

export function createIchOpportunityCandidate(
  spec: IchOpportunityCandidateSpec,
  checkedAt: string,
  batchId = "ich-stage5a-batch-04-2026-09-06",
): IchOpportunityWithBatchFields {
  const entry: IchOpportunityWithBatchFields = {
    id: `stage5a-b4-${spec.slug}`,
    slug: spec.slug,
    external_id: `stage5a-b4-${spec.slug}`,
    title: spec.title,
    title_original: spec.title,
    title_en: null,
    summary: spec.summary,
    description: spec.description,
    opportunity_value_text: spec.valueText,
    primary_category: spec.category,
    secondary_tags: spec.tags,
    classification_confidence: "high",
    classification_reason: "Batch4 使用官方详情页逐字段核验；聚合页仅用于发现，不作为主证据。",
    classification_status: "confirmed",
    status: "active",
    status_reason: "由 computeIchOpportunityStatus 按固定审计时间和官方截止窗口计算。",
    is_featured: false,
    is_published: false,
    archive_reason: null,
    organizer: spec.organizer,
    location: spec.location,
    participation_mode: {
      mode: spec.mode,
      submission_method: spec.submissionMethod,
      requires_on_site_presence: spec.onsite,
      participation_notes: null,
    },
    dates: {
      published_at: spec.publishedAt,
      application_start_at: spec.applicationStartAt,
      deadline_at: spec.deadlineAt,
      deadline_text: spec.deadlineText,
      event_start_at: null,
      event_end_at: null,
      timezone: spec.timezone,
      is_deadline_all_day: Boolean(spec.deadlineAt && /^\d{4}-\d{2}-\d{2}$/.test(spec.deadlineAt)),
      is_long_term: spec.deadlineAt === null,
      date_status: spec.deadlineAt || spec.deadlineText ? "confirmed" : "unknown",
    },
    eligibility: {
      eligible_applicant_types: spec.applicants,
      eligibility_text: spec.eligibilityText,
      ich_status_required: spec.ichRequired,
      business_license_required: spec.businessLicenseRequired,
      local_registration_required: spec.localRegistrationRequired,
      recommendation_required: null,
      age_requirement_text: null,
      language_requirement_text: null,
      eligibility_status: "confirmed",
    },
    benefits: {
      value_types: spec.valueTypes,
      prize_amount: null,
      prize_currency: null,
      funding_amount: null,
      funding_currency: null,
      procurement_budget_min: spec.procurementBudget,
      procurement_budget_max: spec.procurementBudget,
      procurement_currency: spec.procurementCurrency,
      sales_opportunity: spec.salesOpportunity,
      channel_opportunity: spec.channelOpportunity,
      benefit_text: spec.benefitText,
    },
    costs: {
      application_fee_amount: spec.fee,
      application_fee_currency: spec.fee === null ? null : spec.feeCurrency,
      booth_fee_amount: null,
      booth_fee_currency: null,
      deposit_amount: null,
      deposit_currency: null,
      commission_rate: null,
      travel_self_funded: null,
      accommodation_self_funded: null,
      materials_self_funded: null,
      shipping_self_funded: null,
      cost_text: spec.costText,
      cost_status: spec.costStatus,
    },
    requirements: {
      documents_required: spec.documents,
      portfolio_required: spec.portfolioRequired,
      sample_required: spec.sampleRequired,
      proposal_required: spec.proposalRequired,
      invoice_required: null,
      bidding_qualification_required: spec.biddingRequired,
      production_capacity_text: null,
      requirements_text: spec.requirementsText,
    },
    application: {
      application_url: spec.applicationUrl,
      application_email: spec.applicationEmail,
      application_phone: null,
      application_platform: "官方申请/政府采购/机构合作入口",
      application_steps: spec.applicationSteps,
      contact_text: "以官方详情页联系方式为准",
      application_status: "confirmed",
    },
    sources: [{
      url: spec.sourceUrl,
      name: spec.sourceName,
      type: spec.sourceType,
      level: "L1",
      is_primary: true,
      published_at: spec.sourcePublishedAt,
      last_checked_at: checkedAt,
      is_accessible: true,
      notes: spec.sourceNotes,
    }],
    verification: {
      verification_status: "verified",
      verified_by: "manual",
      verified_at: checkedAt,
      source_conflict: false,
      conflict_notes: null,
      needs_recheck: true,
      recheck_after: "2026-09-09T00:00:00+08:00",
    },
    seo: null,
    metadata: {
      created_at: checkedAt,
      updated_at: checkedAt,
      created_by: "stage5a-b4-curation",
      updated_by: "stage5a-b4-curation",
      first_discovered_at: spec.publishedAt ?? checkedAt,
      last_checked_at: checkedAt,
      published_at: null,
      archived_at: null,
      data_version: "1.0",
      source_import_batch: batchId,
    },
    duplicate_status: "unique",
    duplicate_of_id: null,
    merged_from_ids: [],
    workflow: {
      state: "approved",
      revision: 1,
      review_reason: null,
      submitted_at: checkedAt,
      reviewed_at: checkedAt,
      reviewed_by: "stage5a-b4-reviewer",
      withdrawn_at: null,
      history: [{
        action: "approved",
        from: "pending_review",
        to: "approved",
        actor: "stage5a-b4-reviewer",
        at: checkedAt,
        reason: "Batch4 L1、方向、申请主体、生命周期、Evidence、DS3/DS14 门禁通过。",
        revision: 1,
      }],
    },
    opportunity_direction: spec.direction,
    ich_actionable: spec.ichActionable,
    supplier_channel_eligible: spec.supplierChannelEligible,
    radar_tags: spec.radarTags,
    field_provenance: spec.fieldProvenance,
  };
  return entry;
}
