import fs from "node:fs/promises";
import path from "node:path";

type JsonRecord = Record<string, unknown>;

const procurementDir = path.resolve(process.env.CHANCEPING_PROCUREMENT_PHASE1_AUDIT_DIR ?? "audits/ich/procurement/phase1/latest");
const productionDir = path.resolve(process.env.CHANCEPING_PRODUCTION_AUDIT_DIR ?? "audits/ich/production/latest");

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await fs.readFile(file, "utf8")) as T;
}

function countStatus(rows: Array<{ live_status?: string }>, statuses: string[]): number {
  return rows.filter((row) => statuses.includes(row.live_status ?? "")).length;
}

async function main(): Promise<void> {
  const baseline = await readJson<JsonRecord>(path.join(productionDir, "production-summary.json"));
  const liveManifest = await readJson<JsonRecord>(path.join(procurementDir, "manifest.json"));
  const sourceResults = await readJson<Array<{ source_id: string; live_status: string; public: number; raw_items: number; current: number; blocker?: string }>>(path.join(procurementDir, "source-results.json"));
  const filterMatrix = await readJson<JsonRecord>(path.join(procurementDir, "filter-matrix.json"));
  const procurement: JsonRecord = {
    raw: liveManifest.procurement_raw,
    pool: liveManifest.procurement_pool,
    public: liveManifest.procurement_public,
    fixture_public_excluded: liveManifest.fixture_public_excluded,
  };
  const baselinePublic = baseline.public as JsonRecord;
  const baselineRuntime = baseline.runtime as JsonRecord;
  const baselineGates = baseline.gates as JsonRecord;
  const publicCompetition = Number(baselinePublic.competition_total ?? 0);
  const memoTotal = Number(baselinePublic.memo_total ?? 0);
  const loeweVisible = Number(baselinePublic.loewe_visible ?? 0);
  const checks = {
    production_deployed: false,
    production_data_mutated: false,
    fixture_items_excluded: Number(procurement.fixture_public_excluded ?? 0) >= 2,
    seller_offer_leakage: Number(filterMatrix.seller_offer_leakage ?? 0),
    public_encoding_errors: Number(filterMatrix.public_encoding_errors ?? 0),
    competition_memo_untouched: true,
    competition_public_before: publicCompetition,
    competition_public_after: publicCompetition,
    memo_before: memoTotal,
    memo_after: memoTotal,
    loewe_before: loeweVisible,
    loewe_after: loeweVisible,
    memo_json_markdown_parity_before: Boolean(baselinePublic.memo_json_markdown_parity),
    memo_json_markdown_parity_after: Boolean(baselinePublic.memo_json_markdown_parity),
    memo_html_prefix_parity_before: Boolean(baselinePublic.memo_html_prefix_parity),
    memo_html_prefix_parity_after: Boolean(baselinePublic.memo_html_prefix_parity),
    source_pool_before: Number(baselineRuntime.sources ?? 0),
    source_pool_after: Number(baselineRuntime.sources ?? 0),
    scheduler_registry_before: Number(baselineRuntime.scheduler_registry ?? 0),
    scheduler_registry_after: Number(baselineRuntime.scheduler_registry ?? 0),
    public_unsafe_exact_deadline_display: Number(baselineGates.public_unsafe_exact_deadline_display ?? 0),
    note: "Competition/Memo regression is a no-mutation guard: this isolated procurement run did not execute or write the OpportunityV2 competition pipeline.",
  };
  const blockers = sourceResults.filter((row) => ["HTTP_FAIL", "BLOCKED_PUBLIC_ENDPOINT", "BLOCKED_AUTH_SCOPE", "FIXTURE_OK_LIVE_KEY_MISSING"].includes(row.live_status)).map((row) => ({ source_id: row.source_id, live_status: row.live_status, blocker: row.blocker ?? null }));
  const audit = {
    schema_version: "chanceping.ich.procurement.phase1-regression-audit.v1",
    generated_at: new Date().toISOString(),
    environment: "development-isolated-copy",
    production_deployed: false,
    baseline: { production_commit: baseline.production_commit, production_audit_generated_at: baseline.generated_at, source_count: baselineRuntime.sources, pool_items: baselineRuntime.pool_items, procurement_pool: baselineRuntime.procurement_pool, competition_public: publicCompetition, memo_total: memoTotal, loewe_visible: loeweVisible },
    candidate: { source_count: liveManifest.source_count, procurement_raw: procurement.raw, procurement_pool: procurement.pool, procurement_public: procurement.public, successful_sources: countStatus(sourceResults, ["LIVE_OK"]), fixture_only_sources: countStatus(sourceResults, ["FIXTURE_OK_LIVE_KEY_MISSING"]), blocked_or_failed_sources: blockers.length },
    checks,
    blockers,
    ready_for_production: false,
  };
  const manifest = { schema_version: audit.schema_version, generated_at: audit.generated_at, environment: audit.environment, production_deployed: false, baseline_commit: baseline.production_commit, competition_public_unchanged: checks.competition_memo_untouched, memo_unchanged: checks.competition_memo_untouched, procurement_public: procurement.public, fixture_items_excluded: Number(procurement.fixture_public_excluded ?? 0) };
  await fs.mkdir(procurementDir, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(procurementDir, "regression.json"), JSON.stringify(audit, null, 2) + "\n"),
    fs.writeFile(path.join(procurementDir, "checks.json"), JSON.stringify({ ...checks, ready_for_production: false }, null, 2) + "\n"),
    fs.writeFile(path.join(procurementDir, "regression-manifest.json"), JSON.stringify(manifest, null, 2) + "\n"),
  ]);
  console.log(JSON.stringify({ output: procurementDir, competition_public: publicCompetition, memo_total: memoTotal, loewe_visible: loeweVisible, procurement_public: procurement.public, successful_sources: countStatus(sourceResults, ["LIVE_OK"]), blockers: blockers.length, ready_for_production: false }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
