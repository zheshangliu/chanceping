import fs from "node:fs";
import path from "node:path";
import { getAggregationAdapter } from "../ich/aggregation/adapters";
import { isRealArtConnectOpportunityUrl } from "../ich/aggregation/adapters/artconnect";
import { parseRssItems } from "../ich/aggregation/adapters/rss";
import { isLikelyGenericNavigationItem, parseGenericListing } from "../ich/aggregation/adapters/generic-listing";
import type { ParsedAggregationItem } from "../ich/aggregation/adapters/common";
import { deduplicateOpportunityV2, mergeOpportunityV2, normalizeOpportunityV2, readOpportunityV2Pool, writeOpportunityV2Pool } from "./opportunity-pool";
import { DEFAULT_OPPORTUNITY_V2_SOURCES, findOpportunityV2Source, readOpportunityV2Sources, writeOpportunityV2Sources } from "./source-pool";
import { filterOpportunityV2Radar } from "./radar-view";
import type { OpportunityV2Fetcher, OpportunityV2RunResult, OpportunityV2Source, OpportunityV2SourceHealth } from "./types";

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

function defaultHealthPath(): string {
  return path.resolve(process.env.CHANCEPING_OPPORTUNITY_V2_HEALTH_PATH ?? (fs.existsSync("/var/lib/chanceping/opportunity-v2") ? "/var/lib/chanceping/opportunity-v2/source-health.json" : "data/opportunity-v2/source-health.json"));
}

function writeHealth(rows: OpportunityV2SourceHealth[], filePath?: string): void {
  const target = path.resolve(filePath ?? defaultHealthPath());
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify({ schema_version: "chanceping-opportunity-v2.source-health.v1", updated_at: new Date().toISOString(), sources: rows }, null, 2)}\n`, "utf8");
}

function parseSource(source: OpportunityV2Source, text: string, listingUrl: string): { items: ParsedAggregationItem[]; format: "DEDICATED" | "RSS" | "HTML_LISTING" | null } {
  try {
    const dedicated = getAggregationAdapter(source.id).parseListing(text, listingUrl);
    if (dedicated.length) return { items: dedicated, format: "DEDICATED" };
  } catch {
    // A new source has no dedicated adapter. It falls through to generic readers.
  }
  const rss = parseRssItems(text, listingUrl);
  if (rss.length) return { items: rss, format: "RSS" };
  const html = parseGenericListing(text, listingUrl);
  if (html.length) return { items: html, format: "HTML_LISTING" };
  return { items: [], format: null };
}

interface SourceFetchResult {
  parsed: ParsedAggregationItem[];
  format: "DEDICATED" | "RSS" | "HTML_LISTING" | null;
  responseStatus: number;
  fetchedAt: string;
  error: string | null;
}

async function fetchAndParseSource(source: OpportunityV2Source, fetcher: OpportunityV2Fetcher): Promise<SourceFetchResult> {
  const fetchedAt = new Date().toISOString();
  const response = await fetcher(SPECIAL_SOURCE_URL[source.id] ?? source.url);
  if (response.status < 200 || response.status >= 400) throw Object.assign(new Error(`HTTP ${response.status}`), { responseStatus: response.status, fetchedAt });
  const parsedSource = parseSource(source, response.text, response.final_url);
  return { parsed: parsedSource.items, format: parsedSource.format, responseStatus: response.status, fetchedAt, error: parsedSource.items.length ? null : "No RSS or HTML listing items recognized" };
}

function healthFor(source: OpportunityV2Source, result: SourceFetchResult): OpportunityV2SourceHealth {
  return { source_id: source.id, fetched_at: result.fetchedAt, ok: result.parsed.length > 0, http_status: result.responseStatus, items_seen: result.parsed.length, error: result.error, format: result.format };
}

export interface OpportunityV2SourceTestResult {
  source: OpportunityV2Source;
  ok: boolean;
  http_status: number | null;
  items_seen: number;
  format: "DEDICATED" | "RSS" | "HTML_LISTING" | null;
  error: string | null;
}

export async function testOpportunityV2Source(options: { sourceId: string; fetcher?: OpportunityV2Fetcher; sourcesPath?: string; healthPath?: string }): Promise<OpportunityV2SourceTestResult> {
  const source = findOpportunityV2Source(options.sourceId, options.sourcesPath);
  if (!source) throw new Error(`Source not found: ${options.sourceId}`);
  const fetcher = options.fetcher ?? defaultOpportunityV2Fetcher;
  try {
    const result = await fetchAndParseSource(source, fetcher);
    source.status = result.parsed.length ? "ACTIVE" : "NEEDS_ADAPTER";
    if (result.parsed.length) source.last_fetch_at = result.fetchedAt;
    writeOpportunityV2Sources(readOpportunityV2Sources(options.sourcesPath).map((item) => item.id === source.id ? source : item), options.sourcesPath);
    writeHealth([healthFor(source, result)], options.healthPath);
    return { source, ok: result.parsed.length > 0, http_status: result.responseStatus, items_seen: result.parsed.length, format: result.format, error: result.error };
  } catch (error) {
    const responseStatus = typeof error === "object" && error !== null && "responseStatus" in error ? Number(error.responseStatus) : null;
    source.status = "FAILED";
    writeOpportunityV2Sources(readOpportunityV2Sources(options.sourcesPath).map((item) => item.id === source.id ? source : item), options.sourcesPath);
    writeHealth([{ source_id: source.id, fetched_at: new Date().toISOString(), ok: false, http_status: responseStatus, items_seen: 0, error: error instanceof Error ? error.message : String(error), format: null }], options.healthPath);
    return { source, ok: false, http_status: responseStatus, items_seen: 0, format: null, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function runOpportunityV2(options: { now?: Date; fetcher?: OpportunityV2Fetcher; maxItems?: number; sourcesPath?: string; poolPath?: string; healthPath?: string; sourceId?: string } = {}): Promise<OpportunityV2RunResult> {
  const now = options.now ?? new Date();
  const startedAt = now.toISOString();
  const fetcher = options.fetcher ?? defaultOpportunityV2Fetcher;
  const sources = readOpportunityV2Sources(options.sourcesPath);
  if (!options.sourcesPath) for (const seed of DEFAULT_OPPORTUNITY_V2_SOURCES) {
    if (!sources.some((source) => source.id === seed.id)) sources.push({ ...seed, types: [...seed.types], radars: [...seed.radars] });
  }
  const selectedSources = options.sourceId
    ? sources.filter((source) => source.id === options.sourceId && source.enabled)
    : sources.filter((source) => source.enabled && source.status !== "PAUSED" && source.status !== "NEEDS_ADAPTER");
  if (options.sourceId && !selectedSources.length) throw new Error(`Source not found or paused: ${options.sourceId}`);
  const pool = readOpportunityV2Pool(options.poolPath);
  const fetched: ReturnType<typeof normalizeOpportunityV2>[] = [];
  const health: OpportunityV2SourceHealth[] = [];
  const genericSources = new Set<string>();
  let successfulSources = 0;
  for (const source of selectedSources) {
    try {
      const result = await fetchAndParseSource(source, fetcher);
      // Do not silently cap discovery. maxItems remains an explicit caller-controlled
      // safety valve for fixtures or bounded one-off runs only.
      const parsed = options.maxItems === undefined ? result.parsed : result.parsed.slice(0, options.maxItems);
      if (result.format === "HTML_LISTING") genericSources.add(source.id);
      for (const item of parsed) fetched.push(normalizeOpportunityV2(item, source, now));
      source.status = parsed.length ? "ACTIVE" : "NEEDS_ADAPTER";
      if (parsed.length) {
        source.last_fetch_at = result.fetchedAt;
        successfulSources += 1;
      }
      health.push(healthFor(source, { ...result, parsed }));
    } catch (error) {
      const responseStatus = typeof error === "object" && error !== null && "responseStatus" in error ? Number(error.responseStatus) : null;
      source.status = "FAILED";
      health.push({ source_id: source.id, fetched_at: new Date().toISOString(), ok: false, http_status: responseStatus, items_seen: 0, error: error instanceof Error ? error.message : String(error), format: null });
    }
  }
  const deduped = deduplicateOpportunityV2(fetched);
  const merged = mergeOpportunityV2(pool.opportunities, deduped.opportunities, now)
    .filter((item) => !genericSources.has(item.source_id) || !isLikelyGenericNavigationItem(item.title, item.detail_url))
    .filter((item) => item.source_id !== "artconnect-opportunities" || isRealArtConnectOpportunityUrl(item.detail_url));
  writeOpportunityV2Pool({ schema_version: "chanceping-opportunity-v2.v1", updated_at: new Date().toISOString(), opportunities: merged }, options.poolPath);
  writeOpportunityV2Sources(sources, options.sourcesPath);
  writeHealth(health, options.healthPath);
  const radarOpportunities = filterOpportunityV2Radar(merged, sources);
  const finishedAt = new Date().toISOString();
  return {
    run_id: `opportunity-v2-${finishedAt.replace(/[-:.TZ]/gu, "").slice(0, 14)}`,
    started_at: startedAt,
    finished_at: finishedAt,
    fetched_sources: selectedSources.length,
    successful_sources: successfulSources,
    raw_items: fetched.length,
    pool_items: merged.length,
    radar_items: radarOpportunities.length,
    sources,
    source_health: health,
    radar_opportunities: radarOpportunities,
  };
}

export async function runOpportunityV2Source(options: { sourceId: string; now?: Date; fetcher?: OpportunityV2Fetcher; maxItems?: number; sourcesPath?: string; poolPath?: string; healthPath?: string }): Promise<OpportunityV2RunResult> {
  return runOpportunityV2(options);
}
