import fs from "fs";
import os from "os";
import path from "path";
import {
  ICH_PRIMARY_CATEGORIES,
  IchOpportunityStore,
  compareIchOpportunities,
  computeIchOpportunityStatus,
  validateIchOpportunity,
  type IchOpportunity,
} from "../src/ich";

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail = ""): void {
  if (condition) {
    passed += 1;
    console.log(`[PASS] ${name}`);
  } else {
    failed += 1;
    console.error(`[FAIL] ${name}${detail ? `: ${detail}` : ""}`);
  }
}

function fixture(overrides: Partial<IchOpportunity> = {}): IchOpportunity {
  const opportunity: IchOpportunity = {
    id: "ich_2026_001",
    slug: "2026-guangzhou-ich-market",
    external_id: "GZ-ICH-2026-001",
    title: "2026广州非遗市集摊主招募",
    title_original: "关于招募2026年广州非遗主题市集摊主的通知",
    title_en: null,
    summary: "面向非遗传承人和工作室的市集摊位招募。",
    description: null,
    opportunity_value_text: "提供现场展销机会。",
    primary_category: "exhibition_market",
    secondary_tags: ["studio_eligible", "sales_allowed"],
    classification_confidence: "high",
    classification_reason: "申请摊位并现场销售。",
    classification_status: "confirmed",
    status: "active",
    status_reason: null,
    is_featured: false,
    is_published: true,
    archive_reason: null,
    organizer: {
      name: "广州市非遗保护中心",
      name_en: null,
      type: "public_cultural_institution",
      official_website: "https://ich.example.gov.cn",
      contact_text: null,
    },
    location: {
      country_code: "CN",
      country_name: "中国内地",
      province_state: "广东省",
      city: "广州市",
      district: null,
      venue_text: null,
      region_groups: ["guangzhou", "guangdong", "greater_bay_area"],
      participation_scope: "nationwide",
      eligible_regions: ["CN"],
      is_online: false,
      is_hybrid: false,
      is_multi_location: false,
      location_status: "confirmed",
    },
    participation_mode: {
      mode: "offline",
      submission_method: "online_form",
      requires_on_site_presence: true,
      participation_notes: null,
    },
    dates: {
      published_at: "2026-07-01T00:00:00+08:00",
      application_start_at: "2026-07-01T00:00:00+08:00",
      deadline_at: "2026-08-15T23:59:59+08:00",
      deadline_text: "2026年8月15日",
      event_start_at: "2026-09-01T09:00:00+08:00",
      event_end_at: "2026-09-03T18:00:00+08:00",
      timezone: "Asia/Shanghai",
      is_deadline_all_day: true,
      is_long_term: false,
      date_status: "confirmed",
    },
    eligibility: {
      eligible_applicant_types: ["inheritor", "studio"],
      eligibility_text: "非遗传承人或相关工作室可申请。",
      ich_status_required: null,
      business_license_required: null,
      local_registration_required: false,
      recommendation_required: false,
      age_requirement_text: null,
      language_requirement_text: null,
      eligibility_status: "confirmed",
    },
    benefits: {
      value_types: ["sales_opportunity", "exhibition_opportunity"],
      prize_amount: null,
      prize_currency: null,
      funding_amount: null,
      funding_currency: null,
      procurement_budget_min: null,
      procurement_budget_max: null,
      procurement_currency: null,
      sales_opportunity: true,
      channel_opportunity: false,
      benefit_text: "提供现场展示与销售机会。",
    },
    costs: {
      application_fee_amount: null,
      application_fee_currency: null,
      booth_fee_amount: null,
      booth_fee_currency: null,
      deposit_amount: null,
      deposit_currency: null,
      commission_rate: null,
      travel_self_funded: null,
      accommodation_self_funded: null,
      materials_self_funded: null,
      shipping_self_funded: null,
      cost_text: "费用未公开，需向主办方确认。",
      cost_status: "not_disclosed",
    },
    requirements: {
      documents_required: [],
      portfolio_required: null,
      sample_required: null,
      proposal_required: null,
      invoice_required: null,
      bidding_qualification_required: null,
      production_capacity_text: null,
      requirements_text: "以官方申请页面要求为准。",
    },
    application: {
      application_url: "https://ich.example.gov.cn/apply/2026-market",
      application_email: null,
      application_phone: null,
      application_platform: "官方报名系统",
      application_steps: ["阅读公告", "提交申请"],
      contact_text: null,
      application_status: "confirmed",
    },
    sources: [{
      url: "https://ich.example.gov.cn/notices/2026-market",
      name: "官方公告",
      type: "government_announcement",
      level: "L1",
      is_primary: true,
      published_at: "2026-07-01T00:00:00+08:00",
      last_checked_at: "2026-07-20T00:00:00+08:00",
      is_accessible: true,
      notes: null,
    }],
    verification: {
      verification_status: "verified",
      verified_by: "manual",
      verified_at: "2026-07-20T00:00:00+08:00",
      source_conflict: false,
      conflict_notes: null,
      needs_recheck: false,
      recheck_after: null,
    },
    seo: null,
    metadata: {
      created_at: "2026-07-20T00:00:00+08:00",
      updated_at: "2026-07-20T00:00:00+08:00",
      created_by: "manual_operator",
      updated_by: "manual_operator",
      first_discovered_at: "2026-07-01T00:00:00+08:00",
      last_checked_at: "2026-07-20T00:00:00+08:00",
      published_at: "2026-07-20T00:00:00+08:00",
      archived_at: null,
      data_version: "1.0",
      source_import_batch: null,
    },
    duplicate_status: "unique",
    duplicate_of_id: null,
    merged_from_ids: [],
    workflow: {
      state: "published",
      revision: 1,
      review_reason: null,
      submitted_at: "2026-07-19T00:00:00+08:00",
      reviewed_at: "2026-07-20T00:00:00+08:00",
      reviewed_by: "manual_operator",
      withdrawn_at: null,
      history: [{
        action: "published",
        from: "approved",
        to: "published",
        actor: "manual_operator",
        at: "2026-07-20T00:00:00+08:00",
        reason: null,
        revision: 1,
      }],
    },
  };
  return { ...opportunity, ...overrides };
}

console.log("\n[ICH Stage 1] Contracts, status, dedup and store\n");

check("six primary categories are frozen", ICH_PRIMARY_CATEGORIES.length === 6);
check("valid opportunity passes hard validation", validateIchOpportunity(fixture()).valid);
check("unreviewed opportunity cannot be published", !validateIchOpportunity(fixture({
  classification_status: "pending_review",
})).valid);
check("at least one source is required", !validateIchOpportunity(fixture({ sources: [] })).valid);
check("exactly one primary source is required", !validateIchOpportunity(fixture({
  sources: fixture().sources.map((source) => ({ ...source, is_primary: false })),
})).valid);
check("unknown money remains null", fixture().benefits.prize_amount === null && fixture().costs.application_fee_amount === null);
check("unknown booleans remain null", fixture().eligibility.ich_status_required === null);

const now = new Date("2026-08-01T00:00:00+08:00");
check("15 days before deadline is active", computeIchOpportunityStatus(fixture({
  dates: { ...fixture().dates, deadline_at: "2026-08-16T00:00:00+08:00" },
}), now) === "active");
check("14 days before deadline is closing soon", computeIchOpportunityStatus(fixture({
  dates: { ...fixture().dates, deadline_at: "2026-08-15T00:00:00+08:00" },
}), now) === "closing_soon");
check("one minute after deadline is expired", computeIchOpportunityStatus(fixture({
  dates: { ...fixture().dates, deadline_at: "2026-07-31T23:59:00+08:00" },
}), now) === "expired");
check("explicit long-term without deadline is long term", computeIchOpportunityStatus(fixture({
  dates: { ...fixture().dates, deadline_at: null, is_long_term: true },
}), now) === "long_term");
check("missing deadline without long-term evidence needs confirmation", computeIchOpportunityStatus(fixture({
  dates: { ...fixture().dates, deadline_at: null, is_long_term: false },
}), now) === "pending_confirmation");
check("official cancellation has highest priority", computeIchOpportunityStatus(fixture({
  status: "cancelled",
}), now) === "cancelled");
check("inaccessible primary source requiring recheck is unavailable", computeIchOpportunityStatus(fixture({
  sources: fixture().sources.map((source) => ({ ...source, is_accessible: false })),
  verification: { ...fixture().verification, needs_recheck: true },
}), now) === "source_unavailable");
check("event end precedes deadline state", computeIchOpportunityStatus(fixture({
  dates: { ...fixture().dates, event_end_at: "2026-07-31T23:00:00+08:00" },
}), now) === "ended");
check("date-only deadline respects local date boundary", computeIchOpportunityStatus(fixture({
  dates: { ...fixture().dates, deadline_at: "2026-08-01", timezone: "Asia/Shanghai" },
}), new Date("2026-08-01T23:59:00+08:00")) === "closing_soon");

const sameOfficialUrl = fixture({
  id: "ich_2026_002",
  external_id: null,
  sources: fixture().sources.map((source) => ({ ...source, url: `${source.url}?utm_source=test#top` })),
});
check("same official URL is duplicate", compareIchOpportunities(fixture(), sameOfficialUrl).decision === "duplicate");
check("same title in different years is not duplicate", compareIchOpportunities(
  fixture(),
  fixture({ id: "ich_2027_001", title: "2027广州非遗市集摊主招募", external_id: null }),
).decision === "not_duplicate");
check("same event in independent cities is not duplicate", compareIchOpportunities(
  fixture({ external_id: null }),
  fixture({
    id: "ich_2026_003",
    external_id: null,
    title: fixture().title,
    location: { ...fixture().location, city: "深圳市" },
    application: { ...fixture().application, application_url: "https://ich.example.gov.cn/apply/shenzhen" },
    sources: fixture().sources.map((source) => ({ ...source, url: "https://ich.example.gov.cn/notices/shenzhen" })),
  }),
).decision === "not_duplicate");
check("weak organizer and deadline match only flags possible duplicate", compareIchOpportunities(
  fixture({ external_id: null }),
  fixture({
    id: "ich_2026_004",
    external_id: null,
    title: "非遗主题展销活动招募",
    application: { ...fixture().application, application_url: "https://ich.example.gov.cn/apply/other" },
    sources: fixture().sources.map((source) => ({ ...source, url: "https://ich.example.gov.cn/notices/other" })),
  }),
).decision === "possible_duplicate");

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "chanceping-ich-stage1-"));
const storePath = path.join(tempDirectory, "ich-opportunities.json");
try {
  const store = new IchOpportunityStore(storePath);
  check("missing store reads empty without creating a file", store.list().length === 0 && !fs.existsSync(storePath));
  store.replaceAll([fixture()], "2026-07-21T00:00:00.000Z");
  check("atomic store write creates schema file", fs.existsSync(storePath));
  check("store reads entry by id", store.getById("ich_2026_001")?.slug === "2026-guangzhou-ich-market");
  check("store reads entry by slug", store.getBySlug("2026-guangzhou-ich-market")?.id === "ich_2026_001");
  fs.writeFileSync(storePath, JSON.stringify({
    schema_version: "1.0",
    updated_at: "2026-07-21T00:00:00Z",
    entries: [fixture(), fixture({ slug: "duplicate-id" }), fixture({ id: "other-id" })],
  }));
  const duplicateLoad = store.load();
  check("store isolates duplicate ids and slugs on load", duplicateLoad.entries.length === 1 && duplicateLoad.invalidEntries.length === 2);
  store.replaceAll([fixture()], "2026-07-21T00:00:00.000Z");
  check("store rejects duplicate ids", (() => {
    try {
      store.replaceAll([fixture(), fixture({ slug: "other-slug" })]);
      return false;
    } catch {
      return true;
    }
  })());
  check("unsupported major schema is rejected", (() => {
    fs.writeFileSync(storePath, JSON.stringify({ schema_version: "2.0", updated_at: "2026-07-21T00:00:00Z", entries: [] }));
    try {
      store.load();
      return false;
    } catch {
      return true;
    }
  })());
} finally {
  fs.rmSync(tempDirectory, { recursive: true, force: true });
}

console.log(`\nICH Stage 1 checks: ${passed} PASS / ${failed} FAIL`);
if (failed > 0) process.exit(1);
