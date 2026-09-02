import assert from "node:assert/strict";
import { createAuthRoutes } from "../src/headhunter/api/auth-routes";
import { hashPassword } from "../src/headhunter/auth/admin-auth";
import { createTestWeeklyLeadSnapshot, type WeeklyLeadSnapshot } from "../src/headhunter/model";
import { classifyCantoneseClarity, classifyRa1Clarity } from "../src/headhunter/jobs/literal-requirements";
import { applyManualPoolOverride, evaluateLeadGate } from "../src/headhunter/scoring/lead-gate";
import { rankWeeklyCandidates } from "../src/headhunter/scoring/lead-ranking";
import { archiveStaleBLeads, reactivateCompanyOnMeaningfulSignal } from "../src/headhunter/pipeline/archive-reactivation";
import { buildWeeklySnapshot } from "../src/headhunter/reports/weekly-report";
import { renderWeeklyMarkdown } from "../src/headhunter/reports/markdown-export";
import { publishScheduledSnapshot } from "../src/headhunter/pipeline/weekly-publisher";
import { JsonWeeklySnapshotStore } from "../src/headhunter/stores";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function main(): Promise<void> {
  const auth = createAuthRoutes({ config: { username: "admin", password_hash: hashPassword("secret"), session_secret: "secret" }, secureCookies: true });
  assert.equal((await auth.request("http://localhost/session")).status, 401);
  const login = await auth.request("http://localhost/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "admin", password: "secret" }) });
  assert.equal(login.status, 200);

  const contactFail = evaluateLeadGate({ company_gate: true, trigger_gate: true, need_gate: true, evidence_gate: true, contact_gate: false, action_gate: true, business_score: 88 });
  assert.equal(contactFail.passed, false);
  assert.equal(evaluateLeadGate({ company_gate: true, trigger_gate: true, need_gate: true, evidence_gate: true, contact_gate: true, action_gate: true, business_score: 78 }).passed, true);
  assert.equal(classifyRa1Clarity("securities experience required"), "not_mentioned");
  assert.equal(classifyCantoneseClarity("Hong Kong based role"), "not_mentioned");

  const ranked = rankWeeklyCandidates(Array.from({ length: 10 }, (_, index) => ({ id: `a-${index}`, business_score: 80, freshness_score: 90, hard_gate_passed: true })));
  assert.equal(ranked.filter((lead) => lead.lead_pool === "A_ACTIONABLE").length, 8);
  assert.ok(ranked.slice(8).every((lead) => lead.b_reasons.includes("outside_top8")));
  const four = rankWeeklyCandidates(ranked.slice(0, 4).map((lead) => ({ id: lead.id, business_score: 80, freshness_score: 90, hard_gate_passed: true })));
  assert.equal(four.filter((lead) => lead.lead_pool === "A_ACTIONABLE").length, 4);

  const template = createTestWeeklyLeadSnapshot();
  const history: WeeklyLeadSnapshot[] = [
    { ...template, id: "w1", week_key: "2026-W30", lead_pool: "B_ENRICHMENT" },
    { ...template, id: "w2", week_key: "2026-W31", lead_pool: "B_ENRICHMENT" },
    { ...template, id: "w3", week_key: "2026-W32", lead_pool: "A_ACTIONABLE" },
  ];
  assert.equal(new Set(history.map((lead) => lead.week_key)).size, 3);
  const archived = archiveStaleBLeads([{ ...template, id: "stale", week_key: "2026-W28", lead_pool: "B_ENRICHMENT" }], "2026-W36");
  assert.equal(archived.leads[0]?.lead_pool, "ARCHIVED");
  const reactivated = reactivateCompanyOnMeaningfulSignal(template.company_id, { signal_id: "new", company_id: template.company_id, signal_type: "hiring", event_date: "2026-09-01", first_seen_at: "2026-09-01T00:00:00Z", last_seen_at: "2026-09-01T00:00:00Z", title: "New job", fact_summary: "New job", inference_summary: null, impact_level: "high", primary_source_id: "e", evidence_ids: ["e"], source_confidence: 1, created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z" }, archived.leads);
  assert.equal(reactivated[0]?.lead_pool, "B_ENRICHMENT");
  assert.equal(applyManualPoolOverride({ ...template, lead_pool: "B_ENRICHMENT" }, "A_ACTIONABLE").manual_pool_override, "A_ACTIONABLE");

  const dataDir = await mkdtemp(join(tmpdir(), "chanceping-headhunter-golden-"));
  try {
    const snapshot = buildWeeklySnapshot({ radar_run_id: "golden-run", week_key: "2026-W36", stage_order: [], leads: [{ ...template, lead_pool: "A_ACTIONABLE", manual_outreach: "golden manual" }], trends: [] });
    const store = new JsonWeeklySnapshotStore(dataDir);
    await publishScheduledSnapshot(snapshot, store, { run_status: "success" });
    const published = await store.getPublished("2026-W36");
    assert.equal(published?.markdown, renderWeeklyMarkdown(published!));
    await publishScheduledSnapshot({ ...snapshot, week_key: "2026-W37", weekly_snapshot_id: "weekly-2026-W37" }, store, { run_status: "failed" });
    assert.equal(await store.getPublished("2026-W37"), null);
  } finally { await rm(dataDir, { recursive: true, force: true }); }
  console.log("headhunter golden acceptance: PASS (8 gates + ranking/archive/markdown invariants)");
}
void main();
