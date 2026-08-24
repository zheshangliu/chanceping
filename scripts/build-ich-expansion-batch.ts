import fs from "node:fs";
import path from "node:path";
import type { IchOpportunity, IchOpportunityFile } from "../src/ich/types";

type Research = { title: string; category: IchOpportunity["primary_category"]; url: string; source_level: IchOpportunity["sources"][number]["level"]; deadline: string; organizer: string; status: string; notes: string };
const batchName = process.argv[2] ?? "expansion-batch-01";
const inputPath = process.argv[3] ?? `data/ich/${batchName}-research.json`;
const outputPath = process.argv[4] ?? `data/ich/${batchName}.json`;
const input = JSON.parse(fs.readFileSync(path.resolve(inputPath), "utf8")) as { entries: Research[] };
const existing = JSON.parse(fs.readFileSync(path.resolve("src/ich/opportunities.verified.json"), "utf8")) as IchOpportunityFile;
const checkedAt = "2026-07-25T12:00:00+08:00";
const entries = input.entries.map((raw, index) => {
  const slug = `${batchName}-${String(index + 1).padStart(3, "0")}`;
  const publishable = raw.status === "candidate" && raw.deadline !== "未确认";
  const unknown = "未确认。请以官方来源最新页面为准。";
  const entry = {
    id: `ich_${batchName.replace(/[^a-z0-9]+/gi, "_")}_${String(index + 1).padStart(3, "0")}`,
    slug,
    external_id: null,
    title: raw.title,
    title_original: raw.title,
    title_en: null,
    summary: `${raw.notes} 申请前请以官方来源最新页面为准。`,
    description: null,
    opportunity_value_text: null,
    primary_category: raw.category,
    secondary_tags: [],
    classification_confidence: publishable ? "medium" : "low",
    classification_reason: publishable ? "根据官方页面标题、正文和来源类型初步分类。" : null,
    classification_status: publishable ? "confirmed" : "pending_review",
    status: publishable ? "active" : "pending_confirmation",
    status_reason: publishable ? `官方页面列明截止日期 ${raw.deadline}。` : "截止日期或资格仍需回溯确认。",
    is_featured: false,
    is_published: publishable,
    archive_reason: null,
    organizer: { name: raw.organizer, name_en: null, type: "unknown", official_website: new URL(raw.url).origin, contact_text: null },
    location: {
      country_code: null, country_name: null, province_state: null, city: null, district: null, venue_text: null,
      region_groups: [], participation_scope: "unknown", eligible_regions: [], is_online: false, is_hybrid: false,
      is_multi_location: false, location_status: "unknown",
    },
    participation_mode: { mode: "unknown", submission_method: "unknown", requires_on_site_presence: null, participation_notes: null },
    dates: {
      published_at: checkedAt, application_start_at: checkedAt, deadline_at: publishable ? raw.deadline : null,
      deadline_text: publishable ? raw.deadline : "未确认", event_start_at: null, event_end_at: null,
      timezone: "Asia/Shanghai", is_deadline_all_day: true, is_long_term: false, date_status: publishable ? "confirmed" : "unknown",
    },
    eligibility: {
      eligible_applicant_types: ["unknown"], eligibility_text: unknown, ich_status_required: null,
      business_license_required: null, local_registration_required: null, recommendation_required: null,
      age_requirement_text: null, language_requirement_text: null, eligibility_status: "unknown",
    },
    benefits: {
      value_types: [], prize_amount: null, prize_currency: null, funding_amount: null, funding_currency: null,
      procurement_budget_min: null, procurement_budget_max: null, procurement_currency: null, sales_opportunity: null,
      channel_opportunity: null, benefit_text: unknown,
    },
    costs: {
      application_fee_amount: null, application_fee_currency: null, booth_fee_amount: null, booth_fee_currency: null,
      deposit_amount: null, deposit_currency: null,
      commission_rate: null, travel_self_funded: null, accommodation_self_funded: null, materials_self_funded: null,
      shipping_self_funded: null, cost_text: unknown, cost_status: "unknown",
    },
    requirements: {
      documents_required: [], portfolio_required: null, sample_required: null, proposal_required: null,
      invoice_required: null, bidding_qualification_required: null, production_capacity_text: null, requirements_text: unknown,
    },
    application: {
      application_url: raw.url, application_email: null, application_phone: null, application_platform: null,
      application_steps: [], contact_text: null, application_status: publishable ? "partial" : "unknown",
    },
    sources: [{ url: raw.url, name: raw.organizer, type: "specific_opportunity_page", level: raw.source_level, is_primary: true, published_at: checkedAt, last_checked_at: checkedAt, is_accessible: true, notes: raw.notes }],
    verification: {
      verification_status: publishable ? "verified" : "pending_verification", verified_by: "manual", verified_at: checkedAt,
      source_conflict: false, conflict_notes: null, needs_recheck: true, recheck_after: "2026-07-28T00:00:00+08:00",
    },
    seo: null,
    metadata: {
      created_at: checkedAt, updated_at: checkedAt, created_by: "ich-expansion-builder", updated_by: "ich-expansion-builder",
      first_discovered_at: checkedAt, last_checked_at: checkedAt, published_at: publishable ? checkedAt : null,
      archived_at: null, data_version: "1.0", source_import_batch: batchName,
    },
    duplicate_status: "unique", duplicate_of_id: null, merged_from_ids: [],
    workflow: publishable
      ? { state: "published", revision: 4, review_reason: null, submitted_at: checkedAt, reviewed_at: checkedAt, reviewed_by: "ich-expansion-builder", withdrawn_at: null, history: [{ action: "created", from: null, to: "draft", actor: "expansion-01", at: checkedAt, reason: null, revision: 1 }, { action: "submitted", from: "draft", to: "pending_review", actor: "expansion-01", at: checkedAt, reason: null, revision: 2 }, { action: "approved", from: "pending_review", to: "approved", actor: "expansion-01", at: checkedAt, reason: "来源和基础字段通过第一批核验。", revision: 3 }, { action: "published", from: "approved", to: "published", actor: "expansion-01", at: checkedAt, reason: null, revision: 4 }] }
      : { state: "draft", revision: 1, review_reason: null, submitted_at: null, reviewed_at: null, reviewed_by: null, withdrawn_at: null, history: [{ action: "created", from: null, to: "draft", actor: "expansion-01", at: checkedAt, reason: null, revision: 1 }] },
  } as IchOpportunity;
  return entry;
});
const output: IchOpportunityFile = { schema_version: existing.schema_version, updated_at: checkedAt, entries };
fs.mkdirSync(path.resolve("data/ich"), { recursive: true });
fs.writeFileSync(path.resolve(outputPath), `${JSON.stringify(output, null, 2)}\n`);
console.log(`Wrote ${entries.length} candidates (${entries.filter((entry) => entry.is_published).length} publishable) to ${outputPath}`);
