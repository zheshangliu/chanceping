import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createApp } from "../src/api/app";
import { createAppContext } from "../src/api/context";
import { createHeadHunterStores } from "../src/headhunter/stores";
import type { OpportunityRecord } from "../src/headhunter/model/opportunity";
import type { WatchlistCompany } from "../src/headhunter/model/watchlist";
import { Scheduler } from "../src/scheduler/scheduler";
import { HEADHUNTER_SCHEDULE_ID, HEADHUNTER_TIMEZONE, isHeadHunterWeeklySchedule, registerHeadHunterWeeklySchedule } from "../src/scheduler/headhunter-schedule";
import { buildWeeklySnapshot } from "../src/headhunter/reports/weekly-report";
import { publishScheduledSnapshot } from "../src/headhunter/pipeline/weekly-publisher";
import { createTestWeeklyLeadSnapshot } from "../src/headhunter/model/weekly-snapshot";

async function main(): Promise<void> {
  const previousPublicMode = process.env.FINANCE_PUBLIC_MODE;
  process.env.FINANCE_PUBLIC_MODE = "true";
  const app = createApp();
  const dataDir = await mkdtemp(join(tmpdir(), "chanceping-v15-readiness-"));
  try {
    // Public Finance contract: reads work, mutations are protected.
    assert.equal((await app.request("https://finance.chanceping.com/api/finance/auth/session", { headers: { host: "finance.chanceping.com" } })).status, 200);
    assert.equal((await app.request("https://finance.chanceping.com/api/finance/weekly/current", { headers: { host: "finance.chanceping.com" } })).status, 200);
    assert.equal((await app.request("https://finance.chanceping.com/api/finance/watchlist", { method: "POST", headers: { host: "finance.chanceping.com", "content-type": "application/json" }, body: JSON.stringify({ company_id: "probe" }) })).status, 401);

    // Finance host must not expose legacy high-cost mutation paths.
    const blockedPaths = [
      ["/api/radars", { name: "probe", kind: "custom" }],
      ["/api/search", { query: "probe" }],
      ["/api/reports/generate", { opportunities: [] }],
    ] as const;
    for (const [path, body] of blockedPaths) {
      const response = await app.request(`https://finance.chanceping.com${path}`, { method: "POST", headers: { host: "finance.chanceping.com", "content-type": "application/json" }, body: JSON.stringify(body) });
      assert.equal(response.status, 401, `${path} should be blocked in public Finance mode`);
      const json = await response.json() as { error?: { code?: string } };
      assert.equal(json.error?.code, "FINANCE_PUBLIC_READ_ONLY");
    }

    // Persistence contract: a second store instance sees data written by the first.
    const stores = createHeadHunterStores(dataDir);
    const now = new Date().toISOString();
    const opportunity: OpportunityRecord = {
      opportunity_id: "readiness-opportunity", company_id: "readiness-company", weekly_snapshot_id: null,
      signal_ids: [], primary_signal_id: null, signal_type: "hiring", title: "Readiness check", why_now: "test",
      business_driver: "test", talent_need: "test", recommended_contact_id: null, next_action: "test", evidence_ids: [],
      status: "verified", score: 80, contactable: false, human_review_status: "pending", created_at: now, updated_at: now,
    };
    const watchlist: WatchlistCompany = {
      watchlist_id: "readiness-watch", company_id: "readiness-company", status: "watching", priority: "high",
      note: null, last_snapshot_week: "2026-W36", created_at: now, updated_at: now,
    };
    await stores.opportunities.upsert(opportunity);
    await stores.watchlist.upsert(watchlist);
    const reloaded = createHeadHunterStores(dataDir);
    assert.equal((await reloaded.opportunities.get(opportunity.opportunity_id))?.status, "verified");
    assert.equal((await reloaded.watchlist.get(watchlist.watchlist_id))?.last_snapshot_week, "2026-W36");

    // Scheduler contract: public mode registers Monday 07:00 Asia/Shanghai.
    const scheduler = new Scheduler(createAppContext(), { timezone: HEADHUNTER_TIMEZONE });
    const schedule = registerHeadHunterWeeklySchedule(scheduler);
    assert.equal(schedule.id, HEADHUNTER_SCHEDULE_ID);
    assert.equal(isHeadHunterWeeklySchedule(scheduler.getSchedule(HEADHUNTER_SCHEDULE_ID)!), true);
    assert.equal(schedule.period.time, "07:00");
    assert.equal(schedule.period.day_of_week, 1);
    assert.equal(schedule.period.job_params.timezone, HEADHUNTER_TIMEZONE);

    // Failed runs must not replace the current official snapshot.
    const weeklyStore = reloaded.weeklySnapshots;
    const lead = createTestWeeklyLeadSnapshot();
    const current = buildWeeklySnapshot({ radar_run_id: "readiness-success", week_key: "2026-W36", stage_order: [], leads: [lead], trends: [] });
    await publishScheduledSnapshot(current, weeklyStore, { run_status: "success" });
    const failed = buildWeeklySnapshot({ radar_run_id: "readiness-failed", week_key: "2026-W37", stage_order: [], leads: [lead], trends: [] });
    await publishScheduledSnapshot(failed, weeklyStore, { run_status: "failed" });
    assert.equal((await weeklyStore.getPublished("2026-W36"))?.radar_run_id, "readiness-success");
    assert.equal(await weeklyStore.getPublished("2026-W37"), null);

    const remoteBase = process.env.CHANCEPING_DEPLOY_BASE_URL;
    if (remoteBase) {
      const base = remoteBase.replace(/\/$/, "");
      for (const path of ["/health", "/weekly", "/api/finance/weekly/current", "/api/finance/opportunities", "/api/finance/watchlist"]) {
        const response = await fetch(`${base}${path}`);
        assert.equal(response.status, 200, `remote ${path}`);
      }
    }
    console.log(JSON.stringify({ status: "PASS", gates: { public_read_only: "PASS", finance_mutation_boundary: "PASS", persistence_restart: "PASS", weekly_scheduler: "PASS", failed_snapshot_isolated: "PASS", remote_smoke: remoteBase ? "PASS" : "NOT_RUN" } }));
  } finally {
    await rm(dataDir, { recursive: true, force: true });
    if (previousPublicMode === undefined) delete process.env.FINANCE_PUBLIC_MODE;
    else process.env.FINANCE_PUBLIC_MODE = previousPublicMode;
  }
}

void main().catch((error: unknown) => {
  console.error(JSON.stringify({ status: "FAIL", error: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
});

