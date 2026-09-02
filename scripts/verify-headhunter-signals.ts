import assert from "node:assert/strict";
import type { RawEvidence } from "../src/headhunter/model/evidence";
import type { CompanySignal } from "../src/headhunter/model/signal";
import { applyHumanEvidenceOverride, evaluateEvidenceGate, getDisplaySummary, selectPrimaryTrigger } from "../src/headhunter/signals/primary-trigger";
import { deduplicateSignalCandidates } from "../src/headhunter/signals/signal-dedup";

const evidence = (overrides: Partial<RawEvidence>): RawEvidence => ({ evidence_id: "e", source_url: "https://example.com/a", source_name: "Example", source_type: "reliable_media", title: "Title", excerpt: "Original", published_at: null, observed_at: "2026-09-02T00:00:00Z", content_hash: null, immutable: true, ...overrides });
assert.equal(evaluateEvidenceGate([evidence({ source_type: "official" })]).passed, true);
assert.equal(evaluateEvidenceGate([evidence({ source_url: "https://repost-a.example/a", source_group: "wire" }), evidence({ evidence_id: "e2", source_url: "https://repost-b.example/a", source_group: "wire" })]).passed, false);
assert.equal(evaluateEvidenceGate([evidence({ source_url: "https://media-a.example/a" }), evidence({ evidence_id: "e2", source_url: "https://media-b.example/a" })]).passed, true);
const raw = evidence({});
const overridden = applyHumanEvidenceOverride(raw, { corrected_summary: "Corrected display", edited_at: "2026-09-02T00:00:00Z" });
assert.equal(raw.excerpt, "Original");
assert.equal(getDisplaySummary(overridden), "Corrected display");

const signal = (overrides: Partial<CompanySignal>): CompanySignal => ({ signal_id: "s", company_id: "c", signal_type: "hiring", event_date: "2026-09-01", first_seen_at: "2026-09-01T00:00:00Z", last_seen_at: "2026-09-02T00:00:00Z", title: "Hiring", fact_summary: "Fact", inference_summary: null, impact_level: "high", primary_source_id: "e", evidence_ids: ["e"], source_confidence: 0.9, created_at: "2026-09-02T00:00:00Z", updated_at: "2026-09-02T00:00:00Z", ...overrides });
const deduped = deduplicateSignalCandidates([{ ...signal({ signal_id: "s1" }), semantic_event_fingerprint: "same" }, { ...signal({ signal_id: "s2", evidence_ids: ["e", "e2"] }), semantic_event_fingerprint: "same" }]);
assert.equal(deduped.length, 1);
assert.equal(deduped[0]?.signal_id, "s2");
assert.equal(selectPrimaryTrigger([{ signal: signal({ impact_level: "medium" }), gbs_relevance: 10 }, { signal: signal({ signal_id: "s2", impact_level: "high" }), gbs_relevance: 1 }])?.signal_id, "s2");
console.log("headhunter evidence and signal verification: PASS");
