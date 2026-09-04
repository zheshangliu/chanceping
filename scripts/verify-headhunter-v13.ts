import assert from "node:assert/strict";
import { buildDiscoveryQueries } from "../src/headhunter/search/discovery-universe";
import { deduplicateSignalCandidates } from "../src/headhunter/signals/signal-dedup";
import { evaluateTriggerQuality } from "../src/headhunter/pipeline/trigger-quality";

const queries = buildDiscoveryQueries([]);
assert.deepEqual(queries, [], "legacy company-first planner must not be used by V1.3 runner");
const recent = evaluateTriggerQuality({ title: "Company announces new factory expansion September 2026", snippet: "A dated operating expansion", url: "https://company.example/news/2026-09-01", published_at: "2026-09-01" });
assert.equal(recent.valid_for_a_gate, true);
const evergreen = evaluateTriggerQuality({ title: "Careers", snippet: "Explore jobs", url: "https://company.example/careers", published_at: "2026-09-01" });
assert.equal(evergreen.valid_for_a_gate, false);
const first = { signal_id: "s1", company_id: "c1", signal_type: "new_business" as const, event_date: "2026-09-01", first_seen_at: "2026-09-01", last_seen_at: "2026-09-01", title: "Expansion", fact_summary: "new factory", inference_summary: null, impact_level: "high" as const, primary_source_id: "e1", evidence_ids: ["e1"], source_confidence: .9, created_at: "2026-09-01", updated_at: "2026-09-01" };
assert.equal(deduplicateSignalCandidates([first, { ...first, signal_id: "s2", evidence_ids: ["e1", "e2"] }]).length, 1);
console.log("headhunter V1.3 signal-first verification: PASS");
