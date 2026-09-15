import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DEFAULT_OPPORTUNITY_V2_SOURCES, filterOpportunityV2Radar, runOpportunityV2, writeOpportunityV2Sources } from "../src/opportunity-v2";
import { buildProcurementChangeEvents, renderProcurementDigestMarkdown } from "../src/opportunity-v2/procurement-change-feed";
import { readOpportunityV2Pool } from "../src/opportunity-v2/opportunity-pool";
import type { OpportunityV2Source } from "../src/opportunity-v2/types";

const sourceIds = ["proc-cn-gzsun", "proc-cn-csg", "proc-cn-gz-wglj", "proc-uk-contracts-finder"];
const now = new Date();

function writeJson(target: string, value: unknown): void {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function main(): Promise<void> {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "chanceping-procurement-autonomous-v1-"));
  const sourcesPath = path.join(temp, "sources.json");
  const poolPath = path.join(temp, "opportunities.json");
  const healthPath = path.join(temp, "source-health.json");
  const sources: OpportunityV2Source[] = DEFAULT_OPPORTUNITY_V2_SOURCES.filter((source) => sourceIds.includes(source.id)).map((source) => ({ ...source, enabled: true, status: "ACTIVE", last_fetch_at: null }));
  writeOpportunityV2Sources(sources, sourcesPath);
  writeJson(poolPath, { schema_version: "chanceping-opportunity-v2.v1", updated_at: now.toISOString(), opportunities: [] });
  writeJson(healthPath, { sources: [] });
  process.env.CHANCEPING_OPPORTUNITY_V2_DETAIL_BUDGET = "3";
  const run = await runOpportunityV2({ now, sourcesPath, poolPath, healthPath });
  const pool = readOpportunityV2Pool(poolPath).opportunities;
  const radar = filterOpportunityV2Radar(pool, run.sources, { now });
  const outputDir = path.resolve("audits/ich/procurement/autonomous-v1/latest");
  const sourceResults = run.source_health.map((health) => ({
    source_id: health.source_id,
    name: run.sources.find((source) => source.id === health.source_id)?.name ?? health.source_id,
    url: run.sources.find((source) => source.id === health.source_id)?.url ?? null,
    status: run.sources.find((source) => source.id === health.source_id)?.status ?? "UNKNOWN",
    http_status: health.http_status,
    ok: health.ok,
    format: health.format ?? null,
    items_seen: health.items_seen,
    deadline_resolved: health.deadline_resolved ?? 0,
    deadline_unknown: health.deadline_unknown ?? 0,
    error: health.error,
    evidence_level: "LIVE_READ",
  }));
  const report = {
    schema_version: "chanceping.procurement.autonomous-v1.live-audit.v1",
    generated_at: now.toISOString(),
    mode: "isolated_live_read",
    production_mutated: false,
    synthetic_fixture_published: false,
    candidate_source_ids: sourceIds,
    sources_before: 0,
    sources_after: run.sources.length,
    fetched_sources: run.fetched_sources,
    successful_sources: run.successful_sources,
    raw_items: run.raw_items,
    pool_items: pool.length,
    public_relevant_items: radar.length,
    source_results: sourceResults,
    request_traces: run.request_traces ?? [],
    runtime_dir: temp,
    evidence_level: "LIVE_READ",
  };
  writeJson(path.join(outputDir, "manifest.json"), report);
  writeJson(path.join(outputDir, "source-results.json"), sourceResults);
  writeJson(path.join(outputDir, "pool-sample.json"), pool.slice(0, 100));
  writeJson(path.join(outputDir, "radar-sample.json"), radar.slice(0, 100));
  writeJson(path.join(outputDir, "change-feed-initial.json"), buildProcurementChangeEvents([], pool, now.toISOString()));
  fs.writeFileSync(path.join(outputDir, "change-feed-initial.md"), renderProcurementDigestMarkdown(buildProcurementChangeEvents([], pool, now.toISOString()), now.toISOString()), "utf8");
  console.log(JSON.stringify(report, null, 2));
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
