import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { productionCycleFreshness, runIchProductionCycle, runIchProductionCycleAudit, type IchProductionCycleAudit, type IchProductionCycleFetchSummary, type IchProductionCyclePaths } from "../src/opportunity-v2/production-cycle";
import type { OpportunityV2TranslationRunSummary } from "../src/opportunity-v2/translation-runner";
import type { OpportunityV2 } from "../src/opportunity-v2/types";

const NOW = new Date("2026-10-06T07:00:00.000Z");
const SECRET = "v15-cycle-test-secret-never-log";

function makePaths(): { dir: string; paths: IchProductionCyclePaths; initial: Map<string, string> } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "chanceping-v15-cycle-"));
  const paths: IchProductionCyclePaths = {
    runtimeRoot: dir,
    sources: path.join(dir, "sources.json"),
    pool: path.join(dir, "opportunities.json"),
    health: path.join(dir, "source-health.json"),
    translations: path.join(dir, "translations.json"),
    scheduler: path.join(dir, "scheduler.json"),
    changeFeed: path.join(dir, "procurement-change-feed.json"),
    lock: path.join(dir, "cycle.lock"),
    backupRoot: path.join(dir, "backups"),
    manifest: path.join(dir, "cycle-latest.json"),
    runManifests: path.join(dir, "runs"),
  };
  const initial = new Map<string, string>();
  for (const [index, file] of [paths.sources, paths.pool, paths.health, paths.translations, paths.scheduler, paths.changeFeed].entries()) {
    const value = JSON.stringify({ fixture: index, keep: true });
    fs.writeFileSync(file, value);
    initial.set(file, value);
  }
  return { dir, paths, initial };
}

function fetchSummary(now: Date, overrides: Partial<IchProductionCycleFetchSummary> = {}): IchProductionCycleFetchSummary {
  const at = now.toISOString();
  return { run_id: "fixture-fetch-run", started_at: at, finished_at: new Date(now.getTime() + 60 * 60 * 1000).toISOString(), fetched_sources: 2, successful_sources: 2, raw_items: 3, pool_items: 4, radar_items: 2, ...overrides };
}

function translationSummary(overrides: Partial<OpportunityV2TranslationRunSummary> = {}): OpportunityV2TranslationRunSummary {
  return {
    status: "COMPLETED", provider: "deepseek", provider_configured: true, source_count: 2, pool_count: 4, visible_target_count: 3, foreign_count: 2,
    cache_reused: 1, cooling: 0, skipped_not_retryable: 0, eligible_pending: 1, selected_unique_ids: ["opp-1"], selected_surfaces: { "opp-1": ["main"] },
    actual_requests: 1, attempted_records: 1, translated_records: 1, failed_records: 0, failure_counts: {},
    p0_title_repair_attempted: 0, p0_title_repair_succeeded: 0, p0_title_repair_failed: 0, quality_rejection_clusters: {},
    write_result: { written_count: 1, skipped_stale_count: 0, preserved_success_count: 0 },
    budget_after: { max_requests: 250, actual_requests: 1, reserved_requests: 0 }, visible_with_chinese: 2, unattempted_selected: 0, ...overrides,
  };
}

const passAudit: IchProductionCycleAudit = {
  status: "PASS", source_count: 2, successful_sources: 2, pool_items: 4, radar_items: 2, memo_items: 3, weekly_items: 2,
  translation: {
    foreign_public_titles: 0, translated_titles: 4, failed_titles: 0, pending_titles: 0,
    p0: { foreign_titles: 0, chinese_titles: 0, coverage_percent: 100, meets_98_percent: true },
    p1: { foreign_titles: 0, chinese_titles: 0, coverage_percent: 100, meets_80_percent: true, meets_95_percent: true },
    quality_rejection_clusters: {}, p0_title_repair_attempted: 0, p0_title_repair_succeeded: 0, p0_title_repair_failed: 0,
    unresolved: {
      PROVIDER_UNAVAILABLE: { count: 0, opportunity_ids: [], by_source: {} },
      QUALITY_REJECTED: { count: 0, opportunity_ids: [], by_source: {} },
      SOURCE_TEXT_BROKEN: { count: 0, opportunity_ids: [], by_source: {} },
      INSUFFICIENT_EVIDENCE: { count: 0, opportunity_ids: [], by_source: {} },
      COOLING: { count: 0, opportunity_ids: [], by_source: {} },
      NON_RETRYABLE: { count: 0, opportunity_ids: [], by_source: {} },
      BUDGET_DEFERRED: { count: 0, opportunity_ids: [], by_source: {} },
    },
    all_untranslated_p0_p1_dispositioned: true,
  },
  public_encoding_errors: 0, public_encoding_error_items: [], pool_encoding_errors: 0, pool_encoding_error_items: [], public_unsafe_exact_deadlines: 0, artconnect_collection_allowed: false, weekly_limit_pass: true,
  source_governance: { reviewed_ok_count: 0, reviewed_metadata_only_count: 0, official_open_data_count: 0, not_reviewed_count: 2, compliance_hold_count: 0, weekly_contributing_source_ids: [], weekly_contributing_sources: [], top_public_contributors: [] },
  source_health: { fresh: 2, stale: 0, never_succeeded: 0, unknown: 0, failed: 0, sources: [] },
};

async function main(): Promise<void> {
  const first = makePaths();
  try {
    const order: string[] = [];
    const fetchedPool = "pool-after-fetch";
    fs.writeFileSync(first.paths.pool, fetchedPool);
    const completed = await runIchProductionCycle({
      now: NOW,
      paths: first.paths,
      fetch: async (now) => { order.push("fetch"); return fetchSummary(now); },
      translate: async () => { order.push("translate"); return translationSummary(); },
      audit: () => { order.push("audit"); return passAudit; },
      releaseManifestPath: path.join(first.dir, "missing-release.json"),
    });
    assert.deepEqual(order, ["fetch", "translate", "audit"], "the protected cycle order is fetch → translate → audit");
    assert.equal(completed.status, "COMPLETED");
    assert.equal(completed.next_run_at, new Date(Date.parse(NOW.toISOString()) + 72 * 60 * 60 * 1000).toISOString(), "runtime next run follows systemd OnUnitActiveSec from cycle/service start, not the later fetch finish");
    assert.equal(JSON.parse(fs.readFileSync(first.paths.scheduler, "utf8")).interval_hours, 72);
    assert.equal(fs.readFileSync(first.paths.pool, "utf8"), fetchedPool, "successful fetch data is retained");
    assert.equal(completed.freshness, "FRESH");

    const timing = makePaths();
    try {
      let fetchFinishedAt = 0;
      let auditAt = 0;
      const timed = await runIchProductionCycle({
        paths: timing.paths,
        fetch: async (stageNow) => { fetchFinishedAt = stageNow.getTime(); return fetchSummary(stageNow); },
        translate: async () => translationSummary(),
        audit: (stageNow) => { auditAt = stageNow.getTime(); return passAudit; },
        releaseManifestPath: path.join(timing.dir, "missing-release.json"),
      });
      assert.ok(auditAt >= fetchFinishedAt, "production audit uses its actual stage time after the live fetch finishes");
      assert.equal(timed.freshness, "FRESH");
    } finally {
      fs.rmSync(timing.dir, { recursive: true, force: true });
    }

    const partial = await runIchProductionCycle({
      now: new Date(NOW.getTime() + 1000),
      paths: first.paths,
      fetch: async (now) => { fs.writeFileSync(first.paths.pool, "pool-partial-success"); return fetchSummary(now, { successful_sources: 1 }); },
      translate: async () => { throw new Error(SECRET); },
      audit: () => passAudit,
      releaseManifestPath: path.join(first.dir, "missing-release.json"),
    });
    assert.equal(partial.status, "DEGRADED", "one failed source and translation failure must not discard fetch results");
    assert.equal(partial.failure_code, "TRANSLATION_DEGRADED");
    assert.equal(fs.readFileSync(first.paths.pool, "utf8"), "pool-partial-success");
    assert.doesNotMatch(fs.readFileSync(first.paths.manifest, "utf8"), new RegExp(SECRET, "u"));

    const backlog = await runIchProductionCycle({
      now: new Date(NOW.getTime() + 1500), paths: first.paths,
      fetch: async (now) => fetchSummary(now),
      translate: async () => translationSummary({ failed_records: 2, failure_counts: { QUALITY_REJECTED: 2 } }),
      audit: () => passAudit,
      releaseManifestPath: path.join(first.dir, "missing-release.json"),
    });
    assert.equal(backlog.status, "COMPLETED_WITH_BACKLOG", "low-priority translation failures with passing P0/P1 and safety gates are visible backlog, not perpetual DEGRADED");

    const p1BacklogAudit: IchProductionCycleAudit = {
      ...passAudit,
      status: "FAIL",
      translation: {
        ...passAudit.translation,
        p1: { ...passAudit.translation.p1, coverage_percent: 79, meets_80_percent: false, meets_95_percent: false },
      },
    };
    const lowPriorityBacklog = await runIchProductionCycle({
      now: new Date(NOW.getTime() + 1750), paths: first.paths,
      fetch: async (now) => fetchSummary(now),
      translate: async () => translationSummary(),
      audit: () => p1BacklogAudit,
      releaseManifestPath: path.join(first.dir, "missing-release.json"),
    });
    assert.equal(lowPriorityBacklog.status, "COMPLETED_WITH_BACKLOG", "a P1 coverage shortfall alone is backlog when P0 and public safety gates pass");
    assert.equal(lowPriorityBacklog.failure_code, "TRANSLATION_BACKLOG");

    const beforeCrash = new Map([first.paths.sources, first.paths.pool, first.paths.health, first.paths.translations, first.paths.changeFeed].map((file) => [file, fs.readFileSync(file, "utf8")]));
    const lastSuccessBeforeCrash = JSON.parse(fs.readFileSync(first.paths.scheduler, "utf8")).last_successful_cycle_at;
    const failed = await runIchProductionCycle({
      now: new Date(NOW.getTime() + 2000), paths: first.paths,
      fetch: async () => { fs.writeFileSync(first.paths.pool, "corrupt partial write"); fs.writeFileSync(first.paths.sources, "corrupt sources"); throw new Error(SECRET); },
      releaseManifestPath: path.join(first.dir, "missing-release.json"),
    });
    assert.equal(failed.status, "FAILED");
    assert.equal(failed.failure_code, "FETCH_FAILED");
    for (const [file, contents] of beforeCrash) assert.equal(fs.readFileSync(file, "utf8"), contents, `catastrophic failure restores ${path.basename(file)}`);
    const failedScheduler = JSON.parse(fs.readFileSync(first.paths.scheduler, "utf8"));
    assert.equal(failedScheduler.last_cycle_status, "FAILED", "failed attempts remain visible after runtime data rollback");
    assert.equal(failedScheduler.last_successful_cycle_at, lastSuccessBeforeCrash, "failed attempt does not replace the last successful cycle timestamp");
    assert.equal(failedScheduler.next_run_at, new Date(NOW.getTime() + 2000 + 72 * 60 * 60 * 1000).toISOString(), "failed attempt and systemd timer use the same activation +72h next-run anchor");
    assert.doesNotMatch(fs.readFileSync(first.paths.manifest, "utf8"), new RegExp(SECRET, "u"));

    let active = 0;
    let maxActive = 0;
    const concurrent = (offset: number) => runIchProductionCycle({
      now: new Date(NOW.getTime() + offset), paths: first.paths,
      fetch: async (now) => { active += 1; maxActive = Math.max(maxActive, active); await new Promise((resolve) => setTimeout(resolve, 40)); active -= 1; return fetchSummary(now); },
      translate: async () => translationSummary(), audit: () => passAudit,
      releaseManifestPath: path.join(first.dir, "missing-release.json"),
    });
    await Promise.all([concurrent(3000), concurrent(4000)]);
    assert.equal(maxActive, 1, "timer/manual cycles using the same runtime never overlap");
    const backups = fs.readdirSync(first.paths.backupRoot).filter((name) => fs.statSync(path.join(first.paths.backupRoot, name)).isDirectory());
    assert.ok(backups.length <= 3, "runtime snapshot retention is bounded");

    assert.equal(productionCycleFreshness(null, NOW), "NEVER_SUCCEEDED");
    assert.equal(productionCycleFreshness(new Date(NOW.getTime() - 79 * 60 * 60 * 1000).toISOString(), NOW), "STALE");
    assert.equal(productionCycleFreshness(new Date(NOW.getTime() - 77 * 60 * 60 * 1000).toISOString(), NOW), "FRESH");

    const auditDir = fs.mkdtempSync(path.join(os.tmpdir(), "chanceping-v15-audit-"));
    try {
      const auditSourcesPath = path.join(auditDir, "sources.json");
      const auditPoolPath = path.join(auditDir, "opportunities.json");
      const auditHealthPath = path.join(auditDir, "source-health.json");
      const auditTranslationsPath = path.join(auditDir, "translations.json");
      fs.writeFileSync(auditSourcesPath, JSON.stringify({ sources: [
        { id: "stale-failed", name: "Stale failed", url: "https://example.invalid", region: "GLOBAL", priority: "P1", types: [], radars: ["ich"], enabled: true, status: "FAILED", last_fetch_at: new Date(NOW.getTime() - 79 * 60 * 60 * 1000).toISOString() },
        { id: "never-run", name: "Never run", url: "https://example.invalid", region: "CN", priority: "P1", types: [], radars: ["ich"], enabled: true, status: "PENDING", last_fetch_at: null },
      ] }));
      const encodingFixture: OpportunityV2 = {
        id: "opp-encoding-broken", title: "Broken � title", summary: "",
        source_id: "stale-failed", source_name: "Stale failed", source_url: "https://example.invalid/list",
        detail_url: "https://example.invalid/item/1", category: "competition", region: "GLOBAL", tags: [],
        deadline: null, status: "UNKNOWN_DEADLINE", first_seen_at: NOW.toISOString(), last_seen_at: NOW.toISOString(),
        discovered_by_sources: ["stale-failed"], radar_relevance: "IRRELEVANT",
      };
      fs.writeFileSync(auditPoolPath, JSON.stringify({ updated_at: NOW.toISOString(), opportunities: [encodingFixture] }));
      fs.writeFileSync(auditHealthPath, JSON.stringify({ sources: [{ source_id: "stale-failed", fetched_at: NOW.toISOString(), ok: false, http_status: 503, items_seen: 0, error: "safe fixture" }] }));
      fs.writeFileSync(auditTranslationsPath, JSON.stringify({ translations: [] }));
      const audit = await runIchProductionCycleAudit({ now: NOW, paths: { sources: auditSourcesPath, pool: auditPoolPath, health: auditHealthPath, translations: auditTranslationsPath } });
      assert.equal(audit.source_health.stale, 1, "source audit reports stale based on last successful fetch");
      assert.equal(audit.source_health.never_succeeded, 1, "source audit identifies never-successful sources");
      assert.equal(audit.source_health.failed, 1, "source audit separates latest fetch failure from freshness");
      assert.equal(audit.pool_encoding_errors, 1);
      assert.deepEqual(audit.pool_encoding_error_items, [{ id: "opp-encoding-broken", source_id: "stale-failed", title_error: true, summary_error: false }], "internal pool audit identifies every affected record without copying content");
      assert.equal(audit.public_encoding_errors, 0, "a title withheld by all public projections is not counted as a public leak");
      assert.deepEqual(audit.public_encoding_error_items, []);
      assert.equal(audit.status, "PASS");
    } finally {
      fs.rmSync(auditDir, { recursive: true, force: true });
    }
    console.log("ICH_V15_CYCLE: PASS (ordered fetch/translate/audit; partial keeps data; catastrophic restores; serialized; bounded snapshots; 78h freshness)");
  } finally {
    fs.rmSync(first.dir, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
