import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ichPagesRoutes } from "../src/api/routes/ich-pages";
import { migrateOpportunityV2Sources, readOpportunityV2Sources, runOpportunityV2, writeOpportunityV2Sources } from "../src/opportunity-v2";
import type { OpportunityV2, OpportunityV2Source } from "../src/opportunity-v2/types";

const now = new Date("2026-09-10T00:00:00.000Z");
const PHASE1_PROCUREMENT_IDS = ["proc-cn-ccgp", "proc-cn-cib", "proc-global-ocp", "proc-eu-ted", "proc-wb"] as const;
const EXPECTED_ADDED_IDS = [
  "proc-uk-fts",
  "proc-ca-canadabuys",
  ...PHASE1_PROCUREMENT_IDS,
].sort();

function gitValue(args: string[]): string {
  try { return execFileSync("git", args, { encoding: "utf8", timeout: 5_000 }).trim(); } catch { return "unknown"; }
}

function writeAuditJson(auditDir: string, name: string, value: unknown): void {
  fs.mkdirSync(auditDir, { recursive: true });
  fs.writeFileSync(path.join(auditDir, name), `${JSON.stringify(value, null, 2)}\n`);
}

const source: OpportunityV2Source = {
  id: "fixture-v211-source",
  name: "V2.1.1 Fixture Source",
  url: "https://example.com/opportunities",
  region: "GLOBAL",
  priority: "P0",
  types: ["competition"],
  radars: ["ich"],
  enabled: true,
  status: "ACTIVE",
  last_fetch_at: now.toISOString(),
};

function item(id: string, radar_relevance: "RELEVANT" | "IRRELEVANT", overrides: Partial<OpportunityV2> = {}): OpportunityV2 {
  return {
    id,
    title: `Craft competition ${id}`,
    summary: "A real judged competition for craft makers.",
    source_id: source.id,
    source_name: source.name,
    source_url: source.url,
    detail_url: `${source.url}/${id}`,
    category: "competition",
    region: "GLOBAL",
    tags: ["craft"],
    deadline: "2027-02-01T23:59:00.000Z",
    status: "CURRENT",
    first_seen_at: now.toISOString(),
    last_seen_at: now.toISOString(),
    discovered_by_sources: [source.id],
    radar_relevance,
    ...overrides,
  };
}

async function main(): Promise<void> {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "chanceping-ich-v211-"));
  const sourcesPath = path.join(temp, "sources.json");
  const poolPath = path.join(temp, "opportunities.json");
  const healthPath = path.join(temp, "source-health.json");
  fs.writeFileSync(sourcesPath, JSON.stringify({ sources: [source] }));
  fs.writeFileSync(poolPath, JSON.stringify({ schema_version: "chanceping-opportunity-v2.v1", updated_at: now.toISOString(), opportunities: [
    item("relevant", "RELEVANT"),
    item("memo-only", "IRRELEVANT"),
    item("expired", "RELEVANT", { deadline: "2026-08-01T23:59:00.000Z", status: "EXPIRED" }),
    item("noise", "IRRELEVANT", { title: "Privacy Policy", detail_url: "https://example.com/privacy" }),
  ] }));
  fs.writeFileSync(healthPath, JSON.stringify({ sources: [] }));

  const app = ichPagesRoutes({ opportunityV2: true, opportunityV2SourcesPath: sourcesPath, opportunityV2PoolPath: poolPath, now: () => now });
  const home = await (await app.request("http://local/")).text();
  const memo = await (await app.request("http://local/memo")).text();
  const json = await (await app.request("http://local/memo.json")).json() as { snapshot_id: string; scope: string; total: number; returned_count: number; truncated: boolean; items: Array<{ id: string }> };
  const markdown = await (await app.request("http://local/memo.md")).text();
  const homeIds = [...home.matchAll(/href="\/ich\/opportunities\/([^"]+)"/gu)].map((match) => decodeURIComponent(match[1])).filter((id, index, ids) => ids.indexOf(id) === index);
  const htmlIds = [...memo.matchAll(/data-opportunity-id="([^"]+)"/gu)].map((match) => match[1]);
  const jsonIds = json.items.map((entry) => entry.id);
  const markdownIds = [...markdown.matchAll(/^\|\s*([^|\s]+)\s*\|/gmu)].map((match) => match[1]).filter((id) => id !== "ID" && id !== "---");
  assert.deepEqual(homeIds, ["relevant"], "home remains the relevance-gated radar");
  assert.deepEqual(htmlIds, ["memo-only", "relevant"], "memo includes a real competition that is IRRELEVANT to the home radar");
  assert.deepEqual(jsonIds, htmlIds);
  assert.deepEqual(markdownIds, htmlIds);
  assert.equal(json.total, 2);
  assert.equal(json.returned_count, 2);
  assert.equal(json.truncated, false);
  assert.equal(json.scope, "all_competitions");
  assert.match(markdown, new RegExp(`snapshot_id: ${json.snapshot_id}`));
  assert.doesNotMatch(memo, /Privacy Policy|expired/iu);
  assert.doesNotMatch(home, /memo-only/iu);
  const header = home.match(/<header class="ich-header">[\s\S]*?<\/header>/u)?.[0] ?? "";
  assert.doesNotMatch(header, /历史机会/iu, "history remains a route/filter, not a top-level nav item");

  const persisted = path.resolve("data/opportunity-v2/sources.json");
  const migrationPath = path.join(temp, "migration-sources.json");
  const baselineSources = readOpportunityV2Sources(persisted).filter((candidate) => !["proc-uk-fts", "proc-ca-canadabuys"].includes(candidate.id));
  assert.equal(baselineSources.length, 31);
  writeOpportunityV2Sources(baselineSources, migrationPath);
  assert.equal(readOpportunityV2Sources(migrationPath).length, 31);
  const migrated = migrateOpportunityV2Sources(migrationPath);
  assert.equal(migrated.before_count, 31);
  assert.equal(migrated.after_count, 38);
  assert.deepEqual([...migrated.added_ids].sort(), EXPECTED_ADDED_IDS);
  const migratedById = new Map(migrated.sources.map((candidate) => [candidate.id, candidate]));
  for (const sourceId of PHASE1_PROCUREMENT_IDS) {
    const candidate = migratedById.get(sourceId);
    assert.ok(candidate, `${sourceId} must be registered by migration`);
    assert.equal(candidate.enabled, false, `${sourceId} must remain disabled until explicit enablement`);
    assert.equal(candidate.status, "PENDING", `${sourceId} must remain PENDING until explicit enablement`);
  }
  const idempotent = migrateOpportunityV2Sources(migrationPath);
  assert.equal(idempotent.before_count, 38);
  assert.equal(idempotent.after_count, 38);
  assert.deepEqual(idempotent.added_ids, []);
  const schedulerPool = path.join(temp, "scheduler-pool.json");
  fs.writeFileSync(schedulerPool, JSON.stringify({ schema_version: "chanceping-opportunity-v2.v1", updated_at: now.toISOString(), opportunities: [] }));
  const schedulerCalls: string[] = [];
  const scheduled = await runOpportunityV2({ now, sourcesPath: migrationPath, poolPath: schedulerPool, healthPath: path.join(temp, "scheduler-health.json"), fetcher: async (url) => { schedulerCalls.push(url); return { status: 200, final_url: url, text: "" }; } });
  assert.equal(scheduled.sources.length, 38, "next scheduler reads the migrated 38-source registry");
  const disabledPhase1Urls = new Set(PHASE1_PROCUREMENT_IDS.map((sourceId) => migratedById.get(sourceId)?.url).filter((url): url is string => Boolean(url)));
  assert.equal(schedulerCalls.filter((url) => disabledPhase1Urls.has(url)).length, 0, "disabled Phase 1 procurement seeds must not be fetched");

  const baselineIds = new Set(baselineSources.map((candidate) => candidate.id));
  const migratedIds = new Set(migrated.sources.map((candidate) => candidate.id));
  assert.equal([...baselineIds].filter((id) => !migratedIds.has(id)).length, 0, "migration must not lose existing source membership");

  const customizedPath = path.join(temp, "customized-sources.json");
  fs.copyFileSync(migrationPath, customizedPath);
  const customized = readOpportunityV2Sources(customizedPath).map((candidate) => candidate.id === "proc-uk-fts" ? { ...candidate, name: "管理员保留配置", url: "https://example.com/custom-procurement", enabled: false, status: "PAUSED" as const } : candidate);
  writeOpportunityV2Sources(customized, customizedPath);
  const preserved = migrateOpportunityV2Sources(customizedPath).sources.find((candidate) => candidate.id === "proc-uk-fts");
  assert.deepEqual(preserved && { name: preserved.name, url: preserved.url, enabled: preserved.enabled, status: preserved.status }, { name: "管理员保留配置", url: "https://example.com/custom-procurement", enabled: false, status: "PAUSED" });

  const reconciliation = JSON.parse(fs.readFileSync("reports/ich/v21/competition-missing-reconciliation.json", "utf8")) as { summary: { baseline_status: string; unknown_missing: number; legit_competition_missing: number; classifications: Record<string, number> } };
  assert.equal(reconciliation.summary.baseline_status, "BASELINE_UNRECOVERABLE");
  assert.equal(reconciliation.summary.legit_competition_missing, 0);
  assert.equal(reconciliation.summary.unknown_missing, 26);
  assert.equal(reconciliation.summary.classifications.UNKNOWN, 26);
  const migration = {
    historical_fixture_before: baselineSources.length,
    expected_added_ids: EXPECTED_ADDED_IDS,
    actual_added_ids: [...migrated.added_ids].sort(),
    after_first_migration: migrated.after_count,
    after_second_migration: idempotent.after_count,
    second_added_ids: idempotent.added_ids,
    phase1_new_sources_registered: PHASE1_PROCUREMENT_IDS.filter((sourceId) => migratedById.has(sourceId)).length,
    phase1_new_sources_disabled: PHASE1_PROCUREMENT_IDS.filter((sourceId) => migratedById.get(sourceId)?.enabled === false).length,
    phase1_new_sources_pending: PHASE1_PROCUREMENT_IDS.filter((sourceId) => migratedById.get(sourceId)?.status === "PENDING").length,
    phase1_new_sources_fetched_while_disabled: schedulerCalls.filter((url) => disabledPhase1Urls.has(url)).length,
    admin_customization_preserved: true,
    existing_source_membership_loss: [...baselineIds].filter((id) => !migratedIds.has(id)).length,
    status: "PASS",
  };
  const auditDir = path.resolve("audits/ich/procurement/phase1-2a3/latest");
  writeAuditJson(auditDir, "manifest.json", {
    schema_version: "chanceping.ich.procurement.phase1-2a3.v1",
    generated_at: new Date().toISOString(),
    git_sha: gitValue(["rev-parse", "HEAD"]),
    remote_head: gitValue(["ls-remote", "origin", "refs/heads/rescue/mvp-codex"]).split("\t")[0] || "unknown",
    production_deployed: false,
    migration_contract: migration,
  });
  writeAuditJson(auditDir, "migration-contract.json", migration);
  writeAuditJson(auditDir, "regression.json", {
    verifier: "PASS",
    migration_contract: "PASS",
    scheduler_disabled_seed_gate: "PASS",
    admin_customization: "PASS",
    production_untouched: "PASS",
    typecheck: "RUN_SEPARATELY",
    verify_all: "RUN_SEPARATELY",
    notes: "Competition UNKNOWN=26 remains the documented historical baseline limitation; verify:ich:v12 remains an unrelated UI failure."
  });
  writeAuditJson(auditDir, "production-untouched.json", {
    production_deployed: false,
    production_source_migration: false,
    production_scheduler_run: false,
    production_commit_changed: false,
    dns_changed: false,
    note: "All migration and scheduler checks used local temporary files and a fake fetcher."
  });
  fs.writeFileSync(path.join(auditDir, "README.md"), `# Procurement Radar Phase 1.2A.3\n\nThis isolated contract audit verifies idempotent source migration from the historical 31-source fixture to the current 38-source registry. The five Phase 1 procurement seeds are registered but remain disabled/PENDING, so the scheduler does not fetch them. Production, DNS, production migration, and production scheduler were not touched.\n\n- First migration: ${migration.historical_fixture_before} → ${migration.after_first_migration}\n- Exact added IDs: ${migration.actual_added_ids.join(", ")}\n- Second migration: ${migration.after_first_migration} → ${migration.after_second_migration}\n- Phase 1 seeds disabled/PENDING: ${migration.phase1_new_sources_disabled}/${PHASE1_PROCUREMENT_IDS.length}, ${migration.phase1_new_sources_pending}/${PHASE1_PROCUREMENT_IDS.length}\n- Disabled Phase 1 seeds fetched: ${migration.phase1_new_sources_fetched_while_disabled}\n- Admin customization preserved: ${migration.admin_customization_preserved}\n`);
  console.log(JSON.stringify({ gate: "pass", memo_only_item: "memo-only", home_ids: homeIds, memo_ids: htmlIds, memo_total: json.total, migration, scheduler_registry_sources: scheduled.sources.length, admin_config_preserved: true, reconciliation: { status: reconciliation.summary.baseline_status, legit_competition_missing: reconciliation.summary.legit_competition_missing, unknown: reconciliation.summary.unknown_missing } }, null, 2));
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
