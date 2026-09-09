import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import path from "node:path";
import dns from "node:dns/promises";
import { getAggregationAdapter } from "../ich/aggregation/adapters";
import { isRealArtConnectOpportunityUrl } from "../ich/aggregation/adapters/artconnect";
import { parseRssItems } from "../ich/aggregation/adapters/rss";
import { enrichGenericItem, isLikelySourceListingNoise, parseCfwDetailDate, parseGenericListing } from "../ich/aggregation/adapters/generic-listing";
import { extractAnchors, type ParsedAggregationItem } from "../ich/aggregation/adapters/common";
import { deduplicateOpportunityV2, mergeOpportunityV2, normalizeOpportunityV2, readOpportunityV2Pool, writeOpportunityV2Pool } from "./opportunity-pool";
import { DEFAULT_OPPORTUNITY_V2_SOURCES, findOpportunityV2Source, isPublicHttpUrl, isPublicIp, readOpportunityV2Sources, updateOpportunityV2Source, writeOpportunityV2Sources } from "./source-pool";
import { filterOpportunityV2Radar } from "./radar-view";
import { atomicWriteJson, withJsonFileLock } from "./file-lock";
import type { OpportunityV2Fetcher, OpportunityV2RunResult, OpportunityV2Source, OpportunityV2SourceHealth } from "./types";

const SPECIAL_SOURCE_URL: Record<string, string> = { "chuangsaiyun-competition-list": "https://www.xiacansai.com/mrjs.html" };
const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_RESPONSE_BYTES = 5_000_000;

interface PinnedAddress {
  address: string;
  family: 4 | 6;
}

async function resolvePublicAddress(target: string): Promise<PinnedAddress> {
  const parsed = new URL(target);
  const hostname = parsed.hostname.replace(/^\[|\]$/gu, "");
  const ipFamily = net.isIP(hostname);
  if (ipFamily === 4 || ipFamily === 6) {
    if (!isPublicIp(hostname)) throw new Error("source URL resolves to a non-public address");
    return { address: hostname, family: ipFamily };
  }
  const addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => !isPublicIp(address))) throw new Error("source URL resolves to a non-public address");
  const selected = addresses[0];
  return { address: selected.address, family: selected.family as 4 | 6 };
}

async function fetchPinned(target: string, resolved: PinnedAddress): Promise<{ status: number; headers: http.IncomingHttpHeaders; text: string }> {
  const parsed = new URL(target);
  const transport = parsed.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (error: Error): void => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const request = transport.request({
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port || undefined,
      path: `${parsed.pathname}${parsed.search}`,
      method: "GET",
      headers: { "user-agent": "ChancePing-OpportunityV2/1.0", accept: "text/html,application/rss+xml,application/xml;q=0.9,*/*;q=0.8" },
      servername: net.isIP(parsed.hostname.replace(/^\[|\]$/gu, "")) ? undefined : parsed.hostname,
      lookup: (_hostname, options, callback) => {
        if (options.all) callback(null, [{ address: resolved.address, family: resolved.family }]);
        else callback(null, resolved.address, resolved.family);
      },
    }, (response) => {
      const contentLength = Number(response.headers["content-length"] ?? 0);
      if (contentLength > MAX_RESPONSE_BYTES) {
        response.resume();
        request.destroy();
        fail(new Error("source response is too large"));
        return;
      }
      const chunks: Buffer[] = [];
      let total = 0;
      response.on("data", (chunk: Buffer | string) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        total += buffer.length;
        if (total > MAX_RESPONSE_BYTES) {
          request.destroy();
          fail(new Error("source response is too large"));
          return;
        }
        chunks.push(buffer);
      });
      response.on("aborted", () => fail(new Error("source response was aborted")));
      response.on("error", (error) => fail(error));
      response.on("end", () => {
        if (settled) return;
        settled = true;
        const body = Buffer.concat(chunks);
        const contentType = String(response.headers["content-type"] ?? "");
        const charset = contentType.match(/charset\s*=\s*["']?([^;"']+)/iu)?.[1]?.trim().toLowerCase();
        const legacyCharset = /(?:^|\.)1zj\.com$/iu.test(parsed.hostname) || /(?:^|\.)zjmtcn\.com$/iu.test(parsed.hostname);
        const decoder = charset === "gbk" || charset === "gb2312" || charset === "gb18030" || legacyCharset ? new TextDecoder("gb18030") : new TextDecoder("utf-8");
        resolve({ status: response.statusCode ?? 0, headers: response.headers, text: decoder.decode(body) });
      });
    });
    request.setTimeout(DEFAULT_TIMEOUT_MS, () => request.destroy(new Error("source request timed out")));
    request.on("error", (error) => fail(error));
    request.end();
  });
}

export async function defaultOpportunityV2Fetcher(url: string): Promise<{ status: number; final_url: string; text: string }> {
  if (!isPublicHttpUrl(url)) throw new Error("source URL must be a public HTTP(S) URL");
  let current = url;
  for (let hop = 0; hop <= 4; hop += 1) {
    if (!isPublicHttpUrl(current)) throw new Error("redirected source URL is not public");
    const resolved = await resolvePublicAddress(current);
    const response = await fetchPinned(current, resolved);
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.location;
      if (!location) throw new Error("source redirect has no location");
      if (hop === 4) throw new Error("source redirect limit exceeded");
      current = new URL(Array.isArray(location) ? location[0] : location, current).toString();
      continue;
    }
    return { status: response.status, final_url: current, text: response.text };
  }
  throw new Error("source redirect limit exceeded");
}

function defaultHealthPath(): string {
  return path.resolve(process.env.CHANCEPING_OPPORTUNITY_V2_HEALTH_PATH ?? (fs.existsSync("/var/lib/chanceping/opportunity-v2") ? "/var/lib/chanceping/opportunity-v2/source-health.json" : "data/opportunity-v2/source-health.json"));
}

function writeHealth(rows: OpportunityV2SourceHealth[], filePath?: string): void {
  const target = path.resolve(filePath ?? defaultHealthPath());
  withJsonFileLock(target, () => {
    let existing: OpportunityV2SourceHealth[] = [];
    try {
      const parsed = JSON.parse(fs.readFileSync(target, "utf8")) as { sources?: OpportunityV2SourceHealth[] };
      existing = Array.isArray(parsed.sources) ? parsed.sources : [];
    } catch { /* first run */ }
    const byId = new Map(existing.map((row) => [row.source_id, row]));
    for (const row of rows) byId.set(row.source_id, row);
    atomicWriteJson(target, { schema_version: "chanceping-opportunity-v2.source-health.v1", updated_at: new Date().toISOString(), sources: [...byId.values()] });
  });
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
  const html = parseGenericListing(text, listingUrl, [], source.id);
  const filtered = html.filter((item) => !isLikelySourceListingNoise(source.id, item.title, item.detail_url));
  if (filtered.length) return { items: filtered, format: "HTML_LISTING" };
  return { items: [], format: null };
}

interface PaginationPlan {
  pageBudget: number;
  pageUrl: (page: number) => string;
}

function paginationPlan(source: OpportunityV2Source): PaginationPlan | null {
  if (source.id === "1zj-cultural-competition") {
    return { pageBudget: 65, pageUrl: (page) => { const url = new URL(source.url); url.searchParams.set("page", String(page)); return url.toString(); } };
  }
  if (source.id === "cfw-cultural-ip") {
    return { pageBudget: 12, pageUrl: (page) => { const url = new URL(source.url); url.searchParams.set("page", String(page)); return url.toString(); } };
  }
  if (source.id === "whaleideas-competition") {
    return { pageBudget: 12, pageUrl: (page) => `https://whaleideas.com/zjds/index${page === 1 ? "" : `-${page}`}.html` };
  }
  if (source.id === "zjmtcn-product-competition") {
    return { pageBudget: 12, pageUrl: (page) => `https://www.zjmtcn.com/zjxx/chanpin/index${page === 1 ? "" : `-${page}`}.html` };
  }
  if (source.id === "iuben-cultural-competition") {
    return { pageBudget: 12, pageUrl: (page) => `https://iuben.cn/collect/${page === 1 ? "" : `list_10_${page}/`}` };
  }
  return null;
}

function hasNextPage(source: OpportunityV2Source, text: string, currentUrl: string, nextUrl: string): boolean {
  const expected = new URL(nextUrl);
  return extractAnchors(text, currentUrl).some(({ href }) => {
    try {
      const candidate = new URL(href);
      if (candidate.origin !== expected.origin || candidate.pathname !== expected.pathname) return false;
      return [...candidate.searchParams.entries()].sort().toString() === [...expected.searchParams.entries()].sort().toString();
    } catch {
      return false;
    }
  });
}

interface SourceFetchResult {
  parsed: ParsedAggregationItem[];
  format: "DEDICATED" | "RSS" | "HTML_LISTING" | null;
  responseStatus: number;
  fetchedAt: string;
  error: string | null;
  partial: boolean;
  next_page: number | null;
}

const DETAIL_BUDGET_BY_SOURCE: Record<string, number> = {
  "whaleideas-competition": 80,
  "1zj-cultural-competition": 52,
  "artconnect-opportunities": 16,
  "kcdf-opportunities": 12,
  "curatorspace-opportunities": 20,
};

function detailBudgetForSource(sourceId: string): number {
  const configured = process.env.CHANCEPING_OPPORTUNITY_V2_DETAIL_BUDGET;
  const value = Number(configured ?? String(DETAIL_BUDGET_BY_SOURCE[sourceId] ?? 12));
  return Number.isInteger(value) && value >= 0 ? value : 12;
}

function paginationStartPage(source: OpportunityV2Source, healthPath?: string): number {
  const plan = paginationPlan(source);
  if (!plan) return 1;
  const target = path.resolve(healthPath ?? defaultHealthPath());
  try {
    const parsed = JSON.parse(fs.readFileSync(target, "utf8")) as { sources?: OpportunityV2SourceHealth[] };
    const row = parsed.sources?.find((candidate) => candidate.source_id === source.id);
    const next = typeof row?.next_page === "number" ? row.next_page : 1;
    return next >= 1 ? next : 1;
  } catch {
    return 1;
  }
}

export { paginationStartPage };

async function enrichDetailDates(source: OpportunityV2Source, items: ParsedAggregationItem[], fetcher: OpportunityV2Fetcher, budget: number): Promise<void> {
  let attempted = 0;
  let detailEnricher: ((item: ParsedAggregationItem, detailHtml: string, detailUrl: string) => ParsedAggregationItem) | undefined;
  try { detailEnricher = getAggregationAdapter(source.id).enrichItem; } catch { /* generic detail fallback */ }
  for (const item of items) {
    if (item.deadline_at || !item.detail_url || attempted >= budget) {
      if (!item.deadline_at && item.detail_url && !item.deadline_resolution) item.deadline_resolution = "not_attempted";
      continue;
    }
    attempted += 1;
    try {
      const response = await fetcher(item.detail_url);
      if (response.status < 200 || response.status >= 400) {
        item.deadline_resolution = "fetch_failed";
        item.deadline_source_url = item.detail_url;
        item.deadline_checked_at = new Date().toISOString();
        continue;
      }
      const parsed = source.id === "cfw-cultural-ip" ? parseCfwDetailDate(response.text) : null;
      const enriched = parsed
        ? { ...item, deadline_text: parsed.raw, deadline_at: parsed.deadlineAt, raw_text: `${item.raw_text} ${parsed.raw}`.trim().slice(0, 8000) }
        : (detailEnricher ? detailEnricher(item, response.text, item.detail_url) : enrichGenericItem(item, response.text, item.detail_url));
      Object.assign(item, enriched);
      item.deadline_source_url = item.detail_url;
      item.deadline_checked_at = new Date().toISOString();
      if (item.deadline_at && item.deadline_resolution !== "date_conflict") item.deadline_resolution = item.deadline_resolution === "found_listing" ? "found_detail" : "found_detail";
      else if (!item.deadline_at && item.deadline_resolution !== "relative_only") item.deadline_resolution = "source_has_no_date";
    } catch {
      item.deadline_resolution = "fetch_failed";
      item.deadline_source_url = item.detail_url;
      item.deadline_checked_at = new Date().toISOString();
    }
  }
}

async function fetchAndParseSource(source: OpportunityV2Source, fetcher: OpportunityV2Fetcher, startPage = 1): Promise<SourceFetchResult> {
  const fetchedAt = new Date().toISOString();
  const firstUrl = SPECIAL_SOURCE_URL[source.id] ?? source.url;
  const plan = paginationPlan(source);
  const firstPage = plan ? Math.max(1, startPage) : 1;
  const pages = plan ? plan.pageBudget : 1;
  const parsed: ParsedAggregationItem[] = [];
  const seen = new Set<string>();
  let responseStatus = 0;
  let format: SourceFetchResult["format"] = null;
  let partial = false;
  let nextPage: number | null = null;
  for (let offset = 0; offset < pages; offset += 1) {
    const page = firstPage + offset;
    const pageUrl = page === 1 ? firstUrl : plan!.pageUrl(page);
    let response: Awaited<ReturnType<OpportunityV2Fetcher>>;
    try {
      response = await fetcher(pageUrl);
    } catch (error) {
      if (page === 1) throw error;
      partial = true;
      nextPage = page;
      break;
    }
    if (response.status < 200 || response.status >= 400) {
      if (page === 1) throw Object.assign(new Error(`HTTP ${response.status}`), { responseStatus: response.status, fetchedAt });
      partial = true;
      nextPage = page;
      break;
    }
    if (!responseStatus) responseStatus = response.status;
    const parsedSource = parseSource(source, response.text, source.url);
    format = parsedSource.format ?? format;
    for (const item of parsedSource.items) {
      if (seen.has(item.source_item_id)) continue;
      seen.add(item.source_item_id);
      parsed.push(item);
    }
    if (!plan || !hasNextPage(source, response.text, response.final_url, plan.pageUrl(page + 1))) break;
    if (offset + 1 >= pages || page >= plan!.pageBudget) {
      partial = true;
      nextPage = page + 1;
      break;
    }
  }
  await enrichDetailDates(source, parsed, fetcher, detailBudgetForSource(source.id));
  return {
    parsed,
    format,
    responseStatus,
    fetchedAt,
    error: parsed.length ? (partial ? `Partial pagination; next page ${nextPage}` : null) : "No RSS or HTML listing items recognized",
    partial,
    next_page: nextPage,
  };
}

function healthFor(source: OpportunityV2Source, result: SourceFetchResult): OpportunityV2SourceHealth {
  const deadlineAttempted = result.parsed.filter((item) => item.deadline_checked_at).length;
  const deadlineResolved = result.parsed.filter((item) => Boolean(item.deadline_at)).length;
  const deadlineConflicts = result.parsed.reduce((count, item) => count + (item.deadline_conflicts?.length ?? 0), 0);
  return {
    source_id: source.id,
    fetched_at: result.fetchedAt,
    ok: result.parsed.length > 0,
    http_status: result.responseStatus,
    items_seen: result.parsed.length,
    error: result.error,
    format: result.format,
    partial: result.partial,
    next_page: result.next_page,
    source_item_ids: result.parsed.map((item) => item.source_item_id),
    canonical_records: result.parsed.length,
    merged_duplicates: 0,
    reconciliation_status: result.partial ? "partial" : result.parsed.length ? "complete" : "unknown",
    deadline_attempted: deadlineAttempted,
    deadline_resolved: deadlineResolved,
    deadline_unknown: result.parsed.length - deadlineResolved,
    deadline_conflicts: deadlineConflicts,
  };
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
    updateOpportunityV2Source(source.id, { status: source.status, ...(source.last_fetch_at ? { last_fetch_at: source.last_fetch_at } : {}) }, options.sourcesPath);
    writeHealth([healthFor(source, result)], options.healthPath);
    return { source, ok: result.parsed.length > 0, http_status: result.responseStatus, items_seen: result.parsed.length, format: result.format, error: result.error };
  } catch (error) {
    const responseStatus = typeof error === "object" && error !== null && "responseStatus" in error ? Number(error.responseStatus) : null;
    source.status = "FAILED";
    updateOpportunityV2Source(source.id, { status: source.status }, options.sourcesPath);
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
    ? sources.filter((source) => source.id === options.sourceId && source.enabled && !["PAUSED", "NEEDS_ADAPTER"].includes(source.status))
    : sources.filter((source) => source.enabled && !["PAUSED", "NEEDS_ADAPTER"].includes(source.status));
  if (options.sourceId && !selectedSources.length) throw new Error(`Source not found or paused: ${options.sourceId}`);
  const pool = readOpportunityV2Pool(options.poolPath);
  const fetched: ReturnType<typeof normalizeOpportunityV2>[] = [];
  const health: OpportunityV2SourceHealth[] = [];
  let successfulSources = 0;
  for (const source of selectedSources) {
    try {
      const result = await fetchAndParseSource(source, fetcher, paginationStartPage(source, options.healthPath));
      // Do not silently cap discovery. maxItems remains an explicit caller-controlled
      // safety valve for fixtures or bounded one-off runs only.
      const parsed = options.maxItems === undefined ? result.parsed : result.parsed.slice(0, options.maxItems);
      for (const item of parsed) fetched.push(normalizeOpportunityV2(item, source, now));
      // The source listing can contain a continuation page while older pool
      // records still have detail URLs without a usable deadline. For the
      // Round 1 high-value sources, spend the bounded detail budget on those
      // retained records as well, so a full local run actually backfills the
      // existing pool instead of only enriching newly discovered cards.
      if (DETAIL_BUDGET_BY_SOURCE[source.id] !== undefined && options.maxItems === undefined) {
        const candidates = pool.opportunities
          .filter((item) => item.source_id === source.id && !item.deadline && item.detail_url)
          .slice(0, detailBudgetForSource(source.id))
          .map((item) => ({
            source_item_id: item.source_item_id ?? item.id,
            title: item.title,
            source_category: item.category,
            source_status: item.status,
            detail_url: item.detail_url,
            source_url: item.source_url,
            published_at: item.first_seen_at,
            deadline_text: item.deadline_text ?? null,
            deadline_at: item.deadline,
            deadline_source_url: item.deadline_source_url,
            deadline_raw_text: item.deadline_raw_text,
            deadline_checked_at: item.deadline_checked_at,
            deadline_resolution: item.deadline_resolution,
            organizer: item.organizer ?? null,
            application_url: item.application_url ?? null,
            raw_text: `${item.title} ${item.summary}`,
            event_location: item.event_location,
            participation_scope: item.participation_scope,
            participation_mode: item.participation_mode,
            is_long_term: item.is_long_term,
            starts_at: item.starts_at,
          } satisfies ParsedAggregationItem));
        await enrichDetailDates(source, candidates, fetcher, detailBudgetForSource(source.id));
        for (const enriched of candidates.filter((item) => item.deadline_at)) {
          const prior = pool.opportunities.find((item) => item.source_id === source.id && (item.source_item_id === enriched.source_item_id || item.detail_url === enriched.detail_url));
          if (!prior) continue;
          const normalized = normalizeOpportunityV2(enriched, source, now);
          fetched.push({ ...normalized, id: prior.id, first_seen_at: prior.first_seen_at, discovered_by_sources: prior.discovered_by_sources });
        }
      }
      source.status = parsed.length ? "ACTIVE" : "NEEDS_ADAPTER";
      if (parsed.length) {
        source.last_fetch_at = result.fetchedAt;
        successfulSources += 1;
      }
      health.push(healthFor(source, { ...result, parsed }));
    } catch (error) {
      const responseStatus = typeof error === "object" && error !== null && "responseStatus" in error ? Number(error.responseStatus) : null;
      source.status = "FAILED";
      health.push({ source_id: source.id, fetched_at: new Date().toISOString(), ok: false, http_status: responseStatus, items_seen: 0, error: error instanceof Error ? error.message : String(error), format: null, partial: false, next_page: null });
    }
  }
  const deduped = deduplicateOpportunityV2(fetched);
  const merged = mergeOpportunityV2(pool.opportunities, deduped.opportunities, now)
    // Apply the same listing-noise guard to retained records as to newly
    // fetched records. A full run must clean stale menu/content rows already
    // present in the pool; otherwise they survive forever when a source later
    // stops publishing them.
    .filter((item) => !isLikelySourceListingNoise(item.source_id, item.title, item.detail_url))
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
