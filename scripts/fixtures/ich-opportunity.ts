import type { IchOpportunity } from "../../src/ich/types";

export function createIchFixture(overrides: Partial<IchOpportunity> = {}): IchOpportunity {
  const value = {
    id: "fixture-id", slug: "guangzhou-ich-market", external_id: null,
    title: "广州非遗市集招募", title_original: "广州非物质文化遗产市集招募通知", title_en: null,
    summary: "面向全国非遗传承人与工作室开放。", description: "官方市集机会。",
    opportunity_value_text: "获得展销机会。", primary_category: "exhibition_market",
    secondary_tags: ["广彩", "市集"], classification_confidence: "high",
    classification_reason: "申请摊位并现场销售。", classification_status: "pending_review",
    status: "active", status_reason: null, is_featured: true, is_published: false, archive_reason: null,
    organizer: { name: "广州市非遗保护中心", name_en: null, type: "public_cultural_institution", official_website: "https://example.gov.cn", contact_text: null },
    location: { country_code: "CN", country_name: "中国", province_state: "广东省", city: "广州市", district: null, venue_text: "广州", region_groups: ["guangzhou", "guangdong", "greater_bay_area"], participation_scope: "nationwide", eligible_regions: ["全国"], is_online: false, is_hybrid: false, is_multi_location: false, location_status: "confirmed" },
    participation_mode: { mode: "offline", submission_method: "official_platform", requires_on_site_presence: true, participation_notes: null },
    dates: { published_at: "2026-07-01T00:00:00+08:00", application_start_at: "2026-07-01T00:00:00+08:00", deadline_at: "2026-08-20T23:59:59+08:00", deadline_text: "2026年8月20日", event_start_at: null, event_end_at: null, timezone: "Asia/Shanghai", is_deadline_all_day: true, is_long_term: false, date_status: "confirmed" },
    eligibility: { eligible_applicant_types: ["inheritor"], eligibility_text: "非遗传承人", ich_status_required: true, business_license_required: null, local_registration_required: false, recommendation_required: false, age_requirement_text: null, language_requirement_text: null, eligibility_status: "confirmed" },
    benefits: { value_types: ["sales"], prize_amount: null, prize_currency: null, funding_amount: null, funding_currency: null, procurement_budget_min: null, procurement_budget_max: null, procurement_currency: null, sales_opportunity: true, channel_opportunity: false, benefit_text: "展销" },
    costs: { application_fee_amount: null, application_fee_currency: null, booth_fee_amount: null, booth_fee_currency: null, deposit_amount: null, deposit_currency: null, commission_rate: null, travel_self_funded: null, accommodation_self_funded: null, materials_self_funded: null, shipping_self_funded: null, cost_text: "未披露", cost_status: "not_disclosed" },
    requirements: { documents_required: [], portfolio_required: null, sample_required: null, proposal_required: null, invoice_required: null, bidding_qualification_required: null, production_capacity_text: null, requirements_text: "以官方公告为准" },
    application: { application_url: "https://example.gov.cn/apply", application_email: null, application_phone: null, application_platform: "官网", application_steps: ["查看公告"], contact_text: null, application_status: "confirmed" },
    sources: [{ url: "https://example.gov.cn/notice", name: "官方公告", type: "government", level: "L1", is_primary: true, published_at: "2026-07-01T00:00:00+08:00", last_checked_at: "2026-07-20T00:00:00+08:00", is_accessible: true, notes: "内部来源备注" }],
    verification: { verification_status: "verified", verified_by: "manual", verified_at: "2026-07-20T00:00:00+08:00", source_conflict: false, conflict_notes: null, needs_recheck: false, recheck_after: null },
    seo: null,
    metadata: { created_at: "2026-07-01T00:00:00+08:00", updated_at: "2026-07-20T00:00:00+08:00", created_by: "fixture", updated_by: "fixture", first_discovered_at: "2026-07-01T00:00:00+08:00", last_checked_at: "2026-07-20T00:00:00+08:00", published_at: null, archived_at: null, data_version: "1.0", source_import_batch: null },
    duplicate_status: "unique", duplicate_of_id: null, merged_from_ids: [],
    workflow: { state: "draft", revision: 1, review_reason: null, submitted_at: null, reviewed_at: null, reviewed_by: null, withdrawn_at: null, history: [] },
  } as IchOpportunity;
  return { ...value, ...overrides };
}
