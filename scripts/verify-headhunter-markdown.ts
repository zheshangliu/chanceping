import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildWeeklySnapshot } from "../src/headhunter/reports/weekly-report";
import { renderWeeklyMarkdown } from "../src/headhunter/reports/markdown-export";
import { publishScheduledSnapshot, setManualRunAsOfficial } from "../src/headhunter/pipeline/weekly-publisher";
import { JsonWeeklySnapshotStore } from "../src/headhunter/stores";
import { runHeadhunterRadar } from "../src/headhunter/pipeline/radar-pipeline";

async function main(): Promise<void> {
  const dataDir = await mkdtemp(join(tmpdir(), "chanceping-headhunter-report-"));
  try {
    const company = { company_id: "c-report", canonical_name: "Report Co", name_cn: null, name_en: "Report Co", aliases: [], industry: "finance", sub_industry: null, country: "Hong Kong", region: "Hong Kong", city: "Hong Kong", company_type: "operating", website: "https://report.example", linkedin_company_url: null, official_domains: ["report.example"], target_segment: "hk_finance" as const, parent_company_id: null, entity_scope: "operating_entity" as const, created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z", last_verified_at: "2026-09-01T00:00:00Z", status: "active" as const };
    const radar = await runHeadhunterRadar({ radar_run_id: "run-report", week_key: "2026-W36", companies: [company], signals: [], jobs: [], people: [], contacts: [], trends: [] });
    const snapshot = buildWeeklySnapshot(radar);
    const manual = { ...snapshot, leads: snapshot.leads.map((lead) => ({ ...lead, lead_pool: "A_ACTIONABLE" as const, business_score: 80, manual_outreach: "人工审核后的话术" })) };
    const markdown = renderWeeklyMarkdown(manual);
    assert.ok(markdown.includes("人工审核后的话术"));
    for (const heading of ["一、本周必须联系", "二、高价值活动", "三、重要政策 / 市场变化", "四、招聘市场变化", "五、本周 BD Action"]) assert.ok(markdown.includes(heading));
    const store = new JsonWeeklySnapshotStore(dataDir);
    await publishScheduledSnapshot(manual, store, { run_status: "success" });
    assert.equal((await store.getPublished("2026-W36"))?.published, true);
    await publishScheduledSnapshot({ ...manual, week_key: "2026-W37", weekly_snapshot_id: "weekly-2026-W37" }, store, { run_status: "failed" });
    assert.equal(await store.getPublished("2026-W37"), null);
    await publishScheduledSnapshot({ ...manual, week_key: "2026-W37", weekly_snapshot_id: "weekly-2026-W37" }, store, { run_status: "partial", core_provider_available: false, lead_engine_complete: true, persistence_complete: true });
    assert.equal(await store.getPublished("2026-W37"), null);
    const official = await setManualRunAsOfficial("run-report", manual, store);
    assert.equal(official.published, true);
    console.log("headhunter weekly markdown and publisher verification: PASS");
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
}
void main();
