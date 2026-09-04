import assert from "node:assert/strict";
import { buildDiscoveryQueries } from "../src/headhunter/search/discovery-universe";
import { deduplicateSignalCandidates } from "../src/headhunter/signals/signal-dedup";
import { evaluateTriggerQuality } from "../src/headhunter/pipeline/trigger-quality";
import { generateOpportunityCandidates, opportunityMetrics } from "../src/headhunter/pipeline/opportunity-generation";
import type { EventCandidate } from "../src/headhunter/pipeline/signal-first-discovery";

const queries = buildDiscoveryQueries([]);
assert.deepEqual(queries, [], "legacy company-first planner must not be used by V1.3 runner");
const recent = evaluateTriggerQuality({ title: "Company announces new factory expansion September 2026", snippet: "A dated operating expansion", url: "https://company.example/news/2026-09-01", published_at: "2026-09-01" });
assert.equal(recent.valid_for_a_gate, true);
const evergreen = evaluateTriggerQuality({ title: "Careers", snippet: "Explore jobs", url: "https://company.example/careers", published_at: "2026-09-01" });
assert.equal(evergreen.valid_for_a_gate, false);
const first = { signal_id: "s1", company_id: "c1", signal_type: "new_business" as const, event_date: "2026-09-01", first_seen_at: "2026-09-01", last_seen_at: "2026-09-01", title: "Expansion", fact_summary: "new factory", inference_summary: null, impact_level: "high" as const, primary_source_id: "e1", evidence_ids: ["e1"], source_confidence: .9, created_at: "2026-09-01", updated_at: "2026-09-01" };
assert.equal(deduplicateSignalCandidates([first, { ...first, signal_id: "s2", evidence_ids: ["e1", "e2"] }]).length, 1);
const opportunityEvents: EventCandidate[] = [
  { event_id: "e-hiring", query: "", title: "Company hiring Talent Acquisition Director", snippet: "New role announced", url: "https://company.example/news/hiring", source: "serper", published_at: "2026-09-01", discovered_at: "2026-09-02", target_segment: "hk_finance", status: "valid_recent_trigger", event_date: "2026-09-01", company_id: "c1", evidence_id: "evidence-hiring", reasons: [] },
  { event_id: "e-expansion", query: "", title: "Company opens new overseas factory", snippet: "Expansion project", url: "https://company.example/news/expansion", source: "serper", published_at: "2026-09-01", discovered_at: "2026-09-02", target_segment: "outbound_manufacturing", status: "valid_recent_trigger", event_date: "2026-09-01", company_id: "c1", evidence_id: "evidence-expansion", reasons: [] },
  { event_id: "e-evergreen", query: "", title: "Careers and company history", snippet: "Evergreen reference page", url: "https://company.example/careers", source: "serper", published_at: null, discovered_at: "2026-09-02", target_segment: "gba_company", status: "evergreen_reference", event_date: null, company_id: null, evidence_id: null, reasons: ["evergreen reference"] },
];
const generated = generateOpportunityCandidates(opportunityEvents, [], [], []);
assert.equal(generated.length, 3);
assert.ok(generated.every((item) => typeof item.score_breakdown.signal_strength === "number"));
assert.equal(generated.find((item) => item.event_id === "e-hiring")?.opportunity_type, "hiring_signal");
assert.equal(opportunityMetrics(generated).eligible_count, 0, "without verified company, opportunity must not pass eligibility");
assert.equal(generated.find((item) => item.event_id === "e-evergreen")?.status, "rejected");
console.log("headhunter V1.3.1 opportunity generation verification: PASS");
