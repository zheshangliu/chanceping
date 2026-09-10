import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ichPagesRoutes } from "../src/api/routes/ich-pages";
import { migrateOpportunityV2Sources, readOpportunityV2Sources, runOpportunityV2, writeOpportunityV2Sources } from "../src/opportunity-v2";
import type { OpportunityV2, OpportunityV2Source } from "../src/opportunity-v2/types";

const now = new Date("2026-09-10T00:00:00.000Z");

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
  assert.equal(migrated.after_count, 33);
  assert.deepEqual(migrated.added_ids, ["proc-uk-fts", "proc-ca-canadabuys"]);
  const idempotent = migrateOpportunityV2Sources(migrationPath);
  assert.equal(idempotent.before_count, 33);
  assert.equal(idempotent.after_count, 33);
  assert.deepEqual(idempotent.added_ids, []);
  const schedulerPool = path.join(temp, "scheduler-pool.json");
  fs.writeFileSync(schedulerPool, JSON.stringify({ schema_version: "chanceping-opportunity-v2.v1", updated_at: now.toISOString(), opportunities: [] }));
  const scheduled = await runOpportunityV2({ now, sourcesPath: migrationPath, poolPath: schedulerPool, healthPath: path.join(temp, "scheduler-health.json"), fetcher: async (url) => ({ status: 200, final_url: url, text: "" }) });
  assert.equal(scheduled.sources.length, 33, "next scheduler reads the migrated 33-source registry");

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
  console.log(JSON.stringify({ gate: "pass", memo_only_item: "memo-only", home_ids: homeIds, memo_ids: htmlIds, memo_total: json.total, migration: { before: migrated.before_count, after: migrated.after_count, added: migrated.added_ids, idempotent_after: idempotent.after_count }, scheduler_registry_sources: scheduled.sources.length, admin_config_preserved: true, reconciliation: { status: reconciliation.summary.baseline_status, legit_competition_missing: reconciliation.summary.legit_competition_missing, unknown: reconciliation.summary.unknown_missing } }, null, 2));
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
