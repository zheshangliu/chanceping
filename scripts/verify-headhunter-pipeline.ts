import assert from "node:assert/strict";
import { archiveStaleBLeads, reactivateCompanyOnMeaningfulSignal } from "../src/headhunter/pipeline/archive-reactivation";
import { RADAR_PIPELINE_STAGES, runHeadhunterRadar } from "../src/headhunter/pipeline/radar-pipeline";
import { createTestWeeklyLeadSnapshot } from "../src/headhunter/model";
import type { CompanySignal } from "../src/headhunter/model/signal";

assert.deepEqual(RADAR_PIPELINE_STAGES.slice(0, 4), ["Target/Discovery Universe", "Search", "Evidence", "Company Resolver"]);
const lead = createTestWeeklyLeadSnapshot();
const history = [
  { ...lead, id: "w1", week_key: "2026-W30", lead_pool: "B_ENRICHMENT" as const },
  { ...lead, id: "w2", week_key: "2026-W31", lead_pool: "B_ENRICHMENT" as const },
  { ...lead, id: "w3", week_key: "2026-W32", lead_pool: "A_ACTIONABLE" as const },
];
assert.equal(history.length, 3);
const archived = archiveStaleBLeads([{ ...lead, id: "old", week_key: "2026-W28", lead_pool: "B_ENRICHMENT" as const }], "2026-W36");
assert.deepEqual(archived.archived_ids, ["old"]);
const signal: CompanySignal = { signal_id: "s-new", company_id: lead.company_id, signal_type: "hiring", event_date: "2026-09-01", first_seen_at: "2026-09-01T00:00:00Z", last_seen_at: "2026-09-01T00:00:00Z", title: "New hiring", fact_summary: "Hiring", inference_summary: null, impact_level: "high", primary_source_id: "e", evidence_ids: ["e"], source_confidence: 1, created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z" };
const reactivated = reactivateCompanyOnMeaningfulSignal(lead.company_id, signal, archived.leads);
assert.equal(reactivated[0]?.lead_pool, "B_ENRICHMENT");
async function main(): Promise<void> {
  const company = { company_id: "c-pipeline", canonical_name: "Pipeline Co", name_cn: null, name_en: "Pipeline Co", aliases: [], industry: "finance", sub_industry: null, country: "Hong Kong", region: "Hong Kong", city: "Hong Kong", company_type: "operating", website: "https://pipeline.example", linkedin_company_url: null, official_domains: ["pipeline.example"], target_segment: "hk_finance" as const, parent_company_id: null, entity_scope: "operating_entity" as const, created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z", last_verified_at: "2026-09-01T00:00:00Z", status: "active" as const };
  const result = await runHeadhunterRadar({ radar_run_id: "run-1", week_key: "2026-W36", companies: [company], signals: [signal], jobs: [], people: [], contacts: [], trends: [] });
  assert.equal(result.leads.length, 1);
  assert.deepEqual(result.stage_order, RADAR_PIPELINE_STAGES);
  console.log("headhunter radar pipeline verification: PASS");
}
void main();
