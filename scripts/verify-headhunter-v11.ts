import assert from "node:assert/strict";
import { runHeadhunterRadar } from "../src/headhunter/pipeline/radar-pipeline";
import { renderWeeklyMarkdown } from "../src/headhunter/reports/markdown-export";
import { buildWeeklySnapshot } from "../src/headhunter/reports/weekly-report";
import type { Company } from "../src/headhunter/model/company";
import type { CompanySignal } from "../src/headhunter/model/signal";
import type { RawEvidence } from "../src/headhunter/model/evidence";
import type { ContactEntry } from "../src/headhunter/model/contact";
import type { Job } from "../src/headhunter/model/job";
import type { Person } from "../src/headhunter/model/person";

const company: Company = { company_id: "v11-company", canonical_name: "V11 Finance", name_cn: "维优金融", name_en: "V11 Finance", aliases: [], industry: "金融服务", sub_industry: "财富管理", country: "中国", region: "香港", city: "香港", company_type: "operating", website: "https://v11.example/careers", linkedin_company_url: null, official_domains: ["v11.example"], target_segment: "hk_finance", parent_company_id: null, entity_scope: "operating_entity", created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z", last_verified_at: "2026-09-01T00:00:00Z", status: "active" };
const signal: CompanySignal = { signal_id: "v11-signal", company_id: company.company_id, signal_type: "hiring", event_date: "2026-09-02", first_seen_at: "2026-09-02T00:00:00Z", last_seen_at: "2026-09-02T00:00:00Z", title: "New Hong Kong hiring", fact_summary: "Four Hong Kong wealth management roles opened", inference_summary: null, impact_level: "high", primary_source_id: "v11-evidence", evidence_ids: ["v11-evidence"], source_confidence: 1, created_at: "2026-09-02T00:00:00Z", updated_at: "2026-09-02T00:00:00Z" };
const evidence: RawEvidence = { evidence_id: "v11-evidence", source_url: company.website!, source_name: "V11 Careers", source_type: "official", title: "Hong Kong careers", excerpt: "Four roles are open", published_at: "2026-09-02", observed_at: "2026-09-03T00:00:00Z", content_hash: null, immutable: true };
const contact: ContactEntry = { contact_id: "v11-contact", company_id: company.company_id, person_id: null, kind: "corporate_email", value: " TA@V11.EXAMPLE ", label: "Talent Acquisition", source_url: company.website!, public_verified: true, professional: true, verified_at: "2026-09-03T00:00:00Z", notes: null };
const people: Person[] = [
  { person_id: "v11-ta", name: "Jane Chan", linkedin_url: "https://www.linkedin.com/in/jane-chan", current_company_id: company.company_id, current_title: "Talent Acquisition Manager", role_category: "ta", employment_status: "verified_current", employment_verified_at: "2026-09-03T00:00:00Z", source_urls: ["https://www.linkedin.com/in/jane-chan"] },
  { person_id: "v11-business", name: "Alex Wong", linkedin_url: null, current_company_id: company.company_id, current_title: "Country Manager", role_category: "country_manager", employment_status: "verified_current", employment_verified_at: "2026-09-03T00:00:00Z", source_urls: [] },
];
const job: Job = { job_id: "v11-job", company_id: company.company_id, canonical_title: "Wealth Management Relationship Manager", original_titles: ["Wealth Management Relationship Manager"], location: "Hong Kong", role_family: "Wealth", license_requirement: "not_mentioned", ra1_clarity: "not_mentioned", cantonese_clarity: "not_mentioned", employment_type: "full-time", first_seen_at: "2026-09-02T00:00:00Z", last_seen_at: "2026-09-02T00:00:00Z", current_status: "open", source_urls: [company.website!] };

async function main(): Promise<void> {
  const result = await runHeadhunterRadar({ radar_run_id: "v11-run", week_key: "2026-W36", companies: [company], signals: [signal], jobs: [job], people, contacts: [contact], evidences: [evidence], trends: [], now: new Date("2026-09-03T00:00:00Z") });
  const lead = result.leads[0];
  assert.equal(lead.lead_pool, "A_ACTIONABLE");
  assert.equal(lead.evidence_count, 1);
  assert.equal(lead.evidences?.[0]?.source_url, company.website);
  assert.equal(lead.evidences?.[0]?.is_first_party, true);
  assert.equal(lead.contacts?.[0]?.email, "ta@v11.example");
  assert.match(lead.why_now_zh ?? "", /本周/);
  assert.match(lead.talent_need_zh ?? "", /财富管理/);
  assert.ok(lead.service_wedge_zh && lead.bd_action_zh && lead.first_touch_script_zh);
  const markdown = renderWeeklyMarkdown(buildWeeklySnapshot(result));
  assert.match(markdown, /https:\/\/v11\.example\/careers/);
  assert.match(markdown, /为什么现在/);
  assert.match(markdown, /首触话术/);
  assert.match(markdown, /ta@v11\.example/);
  assert.equal(evidence.excerpt, "Four roles are open");
  const noContact = await runHeadhunterRadar({ radar_run_id: "v11-run-2", week_key: "2026-W36", companies: [company], signals: [signal], jobs: [job], people: [], contacts: [], evidences: [evidence], trends: [] });
  assert.equal(noContact.leads[0]?.lead_pool, "B_ENRICHMENT");
  console.log("headhunter V1.1 usability verification: PASS");
}
void main();
