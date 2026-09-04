import assert from "node:assert/strict";
import { buildEligibilityCollections } from "../src/headhunter/pipeline/eligibility";
import { fetchFirstPartyPage } from "../src/headhunter/pipeline/official-page-fetcher";
import { extractOfficialContacts } from "../src/headhunter/pipeline/official-contact-extractor";
import { calculateFreshnessScore } from "../src/headhunter/scoring/freshness-score";
import type { Company } from "../src/headhunter/model/company";
import type { RawEvidence } from "../src/headhunter/model/evidence";
import type { CompanySignal } from "../src/headhunter/model/signal";
import type { Job } from "../src/headhunter/model/job";
import type { Person } from "../src/headhunter/model/person";
import type { ContactEntry } from "../src/headhunter/model/contact";

const now = new Date("2026-09-04T12:00:00Z");
const company: Company = { company_id: "hsbc", canonical_name: "HSBC Hong Kong", name_cn: "汇丰香港", name_en: "HSBC Hong Kong", aliases: ["HSBC"], industry: "banking", sub_industry: null, country: "Hong Kong", region: "Hong Kong", city: "Hong Kong", company_type: null, website: "https://www.hsbc.com.hk", linkedin_company_url: null, official_domains: ["www.hsbc.com.hk"], target_segment: "hk_finance", parent_company_id: null, entity_scope: "operating_entity", created_at: now.toISOString(), updated_at: now.toISOString(), last_verified_at: now.toISOString(), status: "active" };
const evidence = (id: string, url: string, title: string, excerpt: string): RawEvidence => ({ evidence_id: id, source_url: url, source_name: "fixture", source_type: "official", title, excerpt, raw_title: title, raw_excerpt: excerpt, published_at: "2026-09-03", first_seen_at: now.toISOString(), fetched_at: now.toISOString(), observed_at: now.toISOString(), content_hash: id, immutable: true });
const validEvidence = evidence("ev-valid", "https://www.hsbc.com.hk/news/hiring", "HSBC Hong Kong hiring expansion", "HSBC Hong Kong announced a hiring expansion on 2026-09-03.");
const validSignal: CompanySignal = { signal_id: "sig-valid", company_id: company.company_id, signal_type: "hiring", event_date: "2026-09-03", first_seen_at: now.toISOString(), last_seen_at: now.toISOString(), title: validEvidence.title, fact_summary: validEvidence.excerpt, inference_summary: null, impact_level: "high", primary_source_id: validEvidence.evidence_id, evidence_ids: [validEvidence.evidence_id], source_confidence: 1, created_at: now.toISOString(), updated_at: now.toISOString() };
const staleSignal = { ...validSignal, signal_id: "sig-stale", event_date: "2020-01-01", primary_source_id: "ev-stale", evidence_ids: ["ev-stale"] };
const nullSignal = { ...validSignal, signal_id: "sig-null", event_date: null, primary_source_id: "ev-null", evidence_ids: ["ev-null"] };
const pollutedSignal = { ...validSignal, signal_id: "sig-polluted", title: "HK Express hiring expansion", fact_summary: "HK Express announced hiring in Hong Kong", primary_source_id: "ev-polluted", evidence_ids: ["ev-polluted"] };
const validJob: Job = { job_id: "job-valid", company_id: company.company_id, canonical_title: "HSBC Hong Kong HR Director", original_titles: [], location: "Hong Kong", role_family: "HRD", license_requirement: "not_mentioned", ra1_clarity: "not_mentioned", cantonese_clarity: "not_mentioned", employment_type: null, first_seen_at: now.toISOString(), last_seen_at: now.toISOString(), current_status: "open", source_urls: ["https://www.hsbc.com.hk/careers/hr-director"] };
const pollutedJob = { ...validJob, job_id: "job-india", canonical_title: "HSBC India HR Director", location: "India", source_urls: ["https://www.hsbc.com.hk/careers/india"] };
const validPerson: Person = { person_id: "person-valid", name: "Hong Kong Recruiter", linkedin_url: "https://www.linkedin.com/in/hk-recruiter", current_company_id: company.company_id, current_title: "Talent Acquisition Lead", role_category: "ta", employment_status: "verified_current", employment_verified_at: now.toISOString(), source_urls: ["https://www.linkedin.com/in/hk-recruiter"] };
const stalePerson = { ...validPerson, person_id: "person-stale", employment_status: "stale" as const };
const validContact: ContactEntry = { contact_id: "contact-valid", company_id: company.company_id, person_id: validPerson.person_id, kind: "linkedin_profile", value: validPerson.linkedin_url!, label: validPerson.current_title, source_url: validPerson.source_urls[0], public_verified: true, professional: true, verified_at: now.toISOString(), notes: null };
const badContact = { ...validContact, contact_id: "contact-bad", person_id: stalePerson.person_id };

async function main(): Promise<void> {
const collections = buildEligibilityCollections({
  signals: [validSignal, staleSignal, nullSignal, pollutedSignal],
  jobs: [validJob, pollutedJob],
  people: [validPerson, stalePerson],
  contacts: [validContact, badContact],
  companies: [company],
  evidences: [validEvidence, evidence("ev-stale", validEvidence.source_url, validEvidence.title, validEvidence.excerpt), evidence("ev-null", validEvidence.source_url, validEvidence.title, validEvidence.excerpt), evidence("ev-polluted", "https://www.hkexpress.com/careers", pollutedSignal.title, pollutedSignal.fact_summary)],
  now,
});
assert.equal(collections.allSignals.length, 4);
assert.equal(collections.eligibleSignals.length, 1);
assert.equal(collections.allJobs.length, 2);
assert.equal(collections.eligibleJobs.length, 1);
assert.equal(collections.eligiblePeople.length, 1);
assert.equal(collections.eligibleContacts.length, 1);
assert.ok(collections.ineligibleByReason.stale >= 2);
assert.ok(collections.ineligibleByReason.employer_mismatch + collections.ineligibleByReason.entity_mismatch >= 1);
console.log("PASS eligibility: raw history retained, polluted records excluded");

assert.equal(calculateFreshnessScore("2020-01-01", now), 0);
assert.equal(calculateFreshnessScore(null, now), 0);
assert.equal(calculateFreshnessScore("2026-09-03", now), 100);
console.log("PASS freshness: event_date only; old/null/yesterday golden cases");

const fetched = await fetchFirstPartyPage("https://www.hkib.org/careers", { fetchImpl: (async () => new Response("<html><body>Recruitment enquiries: recruit@hkib.org</body></html>", { status: 200, headers: { "content-type": "text/html" } })) as typeof fetch });
assert.match(fetched.content ?? "", /recruit@hkib\.org/);
const hkib = extractOfficialContacts({ company: { website: "https://www.hkib.org", official_domains: [] }, source_url: "https://www.hkib.org/careers", inline_content: fetched.content });
assert.ok(hkib.entries.some((entry) => entry.value === "recruit@hkib.org"));
console.log("PASS first-party fetch and HKIB recruitment extraction");
console.log(JSON.stringify({ status: "PASS", all_signals: collections.allSignals.length, eligible_signals: collections.eligibleSignals.length, all_jobs: collections.allJobs.length, eligible_jobs: collections.eligibleJobs.length, all_people: collections.allPeople.length, eligible_people: collections.eligiblePeople.length, all_contacts: collections.allContacts.length, eligible_contacts: collections.eligibleContacts.length, filtered_pollution: Object.values(collections.ineligibleByReason).reduce((sum, value) => sum + value, 0) }));
}

void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
