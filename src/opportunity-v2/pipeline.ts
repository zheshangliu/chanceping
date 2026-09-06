import fs from "node:fs";
import path from "node:path";
import { getAggregationAdapter } from "../ich/aggregation/adapters";
import type { ParsedAggregationItem } from "../ich/aggregation/adapters/common";
import { deduplicateOpportunityV2, mergeOpportunityV2, normalizeOpportunityV2, readOpportunityV2Pool, writeOpportunityV2Pool } from "./opportunity-pool";
import { readOpportunityV2Sources, writeOpportunityV2Sources } from "./source-pool";
import { filterOpportunityV2Radar } from "./radar-view";
import type { OpportunityV2Fetcher, OpportunityV2RunResult, OpportunityV2SourceHealth } from "./types";

const SPECIAL_SOURCE_URL: Record<string, string> = { "chuangsaiyun-competition-list": "https://www.xiacansai.com/mrjs.html" };
const DEFAULT_TIMEOUT_MS = 20_000;

export async function defaultOpportunityV2Fetcher(url: string): Promise<{ status: number; final_url: string; text: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(url, { redirect: "follow", signal: controller.signal, headers: { "user-agent": "ChancePing-OpportunityV2/1.0" } });
    return { status: response.status, final_url: response.url, text: await response.text() };
  } finally {
    clearTimeout(timer);
  }
}

function healthPath(): string {
  return path.resolve(process.env.CHANCEPING_OPPORTUNITY_V2_HEALTH_PATH ?? "data/opportunity-v2/source-health.json");
}

function writeHealth(rows: OpportunityV2SourceHealth[]): void {
  const target = healthPath();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify({ schema_version: "chanceping-opportunity-v2.source-health.v1", updated_at: new Date().toISOString(), sources: rows }, null, 2)}\n`, "utf8");
}

export async function runOpportunityV2(options: { now?: Date; fetcher?: OpportunityV2Fetcher; maxItems?: number; sourcesPath?: string; poolPath?: string; healthPath?: string } = {}): Promise<OpportunityV2RunResult> {
  const now = options.now ?? new Date();
  const startedAt = now.toISOString();
  const fetcher = options.fetcher ?? defaultOpportunityV2Fetcher;
  const sources = readOpportunityV2Sources(options.sourcesPath);
  const pool = readOpportunityV2Pool(options.poolPath);
  const fetched: ReturnType<typeof normalizeOpportunityV2>[] = [];
  const health: OpportunityV2SourceHealth[] = [];
  let successfulSources = 0;
  for (const source of sources.filter((item) => item.enabled && item.status === "ACTIVE")) {
    const fetchedAt = new Date().toISOString();
    let httpStatus: number | null = null;
    try {
      const response = await fetcher(SPECIAL_SOURCE_URL[source.id] ?? source.url);
      httpStatus = response.status;
      if (response.status < 200 || response.status >= 400) throw new Error(`HTTP ${response.status}`);
      const adapter = getAggregationAdapter(source.id);
      const parsed: ParsedAggregationItem[] = adapter.parseListing(response.text, response.final_url).slice(0, options.maxItems ?? 200);
      for (const item of parsed) fetched.push(normalizeOpportunityV2(item, source, now));
      source.last_fetch_at = fetchedAt;
      successfulSources += 1;
      health.push({ source_id: source.id, fetched_at: fetchedAt, ok: true, http_status: response.status, items_seen: parsed.length, error: null });
    } catch (error) {
      health.push({ source_id: source.id, fetched_at: fetchedAt, ok: false, http_status: httpStatus, items_seen: 0, error: error instanceof Error ? error.message : String(error) });
    }
  }
  const deduped = deduplicateOpportunityV2(fetched);
  const merged = mergeOpportunityV2(pool.opportunities, deduped.opportunities, now);
  writeOpportunityV2Pool({ schema_version: "chanceping-opportunity-v2.v1", updated_at: new Date().toISOString(), opportunities: merged }, options.poolPath);
  writeOpportunityV2Sources(sources, options.sourcesPath);
  if (options.healthPath) {
    const target = path.resolve(options.healthPath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, `${JSON.stringify({ schema_version: "chanceping-opportunity-v2.source-health.v1", updated_at: new Date().toISOString(), sources: health }, null, 2)}\n`, "utf8");
  } else {
    writeHealth(health);
  }
  const finishedAt = new Date().toISOString();
  return {
    run_id: `opportunity-v2-${finishedAt.replace(/[-:.TZ]/gu, "").slice(0, 14)}`,
    started_at: startedAt,
    finished_at: finishedAt,
    fetched_sources: sources.filter((source) => source.enabled && source.status === "ACTIVE").length,
    successful_sources: successfulSources,
    raw_items: fetched.length,
    pool_items: merged.length,
    radar_items: filterOpportunityV2Radar(merged, sources).length,
    sources,
    source_health: health,
    radar_opportunities: filterOpportunityV2Radar(merged, sources),
  };
}
