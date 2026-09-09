import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { filterOpportunityV2Radar, type OpportunityV2RadarQuery } from "./radar-view";
import { readOpportunityV2Pool } from "./opportunity-pool";
import { readOpportunityV2Sources } from "./source-pool";
import type { OpportunityV2, OpportunityV2Source, OpportunityV2SourceHealth } from "./types";

export const OPPORTUNITY_V2_MEMO_SCOPE = "all_competitions" as const;

export interface OpportunityV2MemoCoverage {
  registered_sources: number;
  successful_sources: number;
  partial_sources: string[];
  failed_sources: string[];
  needs_adapter_sources: string[];
  source_listing_items: number;
  source_listing_to_pool_omissions: number;
}

export interface OpportunityV2MemoSnapshot {
  snapshot_id: string;
  generated_at: string;
  scope: typeof OPPORTUNITY_V2_MEMO_SCOPE;
  sort: "deadline_desc";
  total: number;
  returned_count: number;
  truncated: false;
  known_deadlines: number;
  unknown_deadlines: number;
  long_term: number;
  coverage: OpportunityV2MemoCoverage;
  items: OpportunityV2[];
}

const NON_COMPETITION_TITLE = /(?:^|\b)(?:about(?: us)?|archive|blog|champions? circle|contact(?: us)?|craft happenings|craft directory|directory|endangered crafts? fund|events?|fellowship|fund(?:ing)?|grant|happenings|holiday season|journal|maker support|magazine|news|newsletter|podcast|residen(?:cy|cies)|resource library|shared studio|studio (?:application|guide|space)|support(?: resources?)?|tour|travel|workshop)(?:\b|$)/iu;
// Do not blanket-block `/events/`: several configured sources use that path
// for their actual competition detail pages. Only block navigation/archive
// paths that are unambiguously non-opportunity pages.
const NON_COMPETITION_PATH = /\/(?:about|archive|blog|contact|craft-happenings|craft-champions-circle|craft-directory|directory|journal|magazine|news|podcasts?|resources?|residenc(?:y|ies)|studios?|support|workshops?)(?:\/|$)/iu;

/**
 * The memo is broader than the home radar, but it is still a competition
 * table. This narrow negative list prevents navigation and clearly non-event
 * pages from inheriting the generic category fallback of "competition".
 */
export function isRealCompetitionMemoItem(item: Pick<OpportunityV2, "category" | "title" | "summary" | "detail_url">): boolean {
  if (item.category !== "competition") return false;
  // Navigation phrases are intentionally evaluated against the title only.
  // Legitimate competition summaries often begin with editorial copy such as
  // “About the awards”; using the whole summary here would drop the actual
  // opportunity even though its title is a competition.
  return !NON_COMPETITION_TITLE.test(item.title.trim()) && !NON_COMPETITION_PATH.test(item.detail_url);
}

function healthPath(filePath?: string): string {
  const configured = filePath ?? process.env.CHANCEPING_OPPORTUNITY_V2_HEALTH_PATH;
  return path.resolve(configured ?? (fs.existsSync("/var/lib/chanceping/opportunity-v2") ? "/var/lib/chanceping/opportunity-v2/source-health.json" : "data/opportunity-v2/source-health.json"));
}

export function readOpportunityV2Health(filePath?: string): OpportunityV2SourceHealth[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(healthPath(filePath), "utf8")) as { sources?: OpportunityV2SourceHealth[] };
    return Array.isArray(parsed.sources) ? parsed.sources : [];
  } catch {
    return [];
  }
}

export function sortOpportunityV2Memo(items: OpportunityV2[]): OpportunityV2[] {
  return [...items].sort((a, b) => {
    const aKnown = Boolean(a.deadline);
    const bKnown = Boolean(b.deadline);
    if (aKnown !== bKnown) return aKnown ? -1 : 1;
    if (aKnown && bKnown) {
      const byDeadline = new Date(b.deadline as string).getTime() - new Date(a.deadline as string).getTime();
      if (Number.isFinite(byDeadline) && byDeadline !== 0) return byDeadline;
    }
    return a.title.localeCompare(b.title, "zh-CN") || a.id.localeCompare(b.id);
  });
}

function coverage(sources: OpportunityV2Source[], health: OpportunityV2SourceHealth[], items: OpportunityV2[]): OpportunityV2MemoCoverage {
  const healthById = new Map(health.map((row) => [row.source_id, row]));
  const partialSources = sources.filter((source) => healthById.get(source.id)?.partial === true).map((source) => source.id);
  const failedSources = sources.filter((source) => source.status === "FAILED" || healthById.get(source.id)?.ok === false).map((source) => source.id);
  const needsAdapterSources = sources.filter((source) => source.status === "NEEDS_ADAPTER").map((source) => source.id);
  const listingItems = health.reduce((total, row) => total + row.items_seen, 0);
  const poolSourceIds = new Set(items.flatMap((item) => item.discovered_by_sources));
  const omissionCount = health.reduce((total, row) => total + (poolSourceIds.has(row.source_id) ? 0 : row.items_seen), 0);
  return {
    registered_sources: sources.length,
    successful_sources: new Set(health.filter((row) => row.ok).map((row) => row.source_id)).size,
    partial_sources: [...new Set(partialSources)],
    failed_sources: [...new Set(failedSources)],
    needs_adapter_sources: [...new Set(needsAdapterSources)],
    source_listing_items: listingItems,
    source_listing_to_pool_omissions: omissionCount,
  };
}

export function buildOpportunityV2MemoSnapshot(options: {
  opportunities?: OpportunityV2[];
  sources?: OpportunityV2Source[];
  health?: OpportunityV2SourceHealth[];
  query?: OpportunityV2RadarQuery;
  generatedAt?: string;
  poolUpdatedAt?: string;
} = {}): OpportunityV2MemoSnapshot {
  const opportunities = options.opportunities ?? readOpportunityV2Pool().opportunities;
  const sources = options.sources ?? readOpportunityV2Sources();
  const health = options.health ?? readOpportunityV2Health();
  const query = options.query ?? {};
  const filtered = filterOpportunityV2Radar(opportunities, sources, { ...query, include_irrelevant: true });
  const items = sortOpportunityV2Memo(filtered.filter(isRealCompetitionMemoItem));
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const poolUpdatedAt = options.poolUpdatedAt ?? readOpportunityV2Pool().updated_at;
  const snapshot_id = crypto.createHash("sha256").update(`${OPPORTUNITY_V2_MEMO_SCOPE}\n${poolUpdatedAt}\n${items.map((item) => item.id).join("\n")}`, "utf8").digest("hex").slice(0, 24);
  return {
    snapshot_id,
    generated_at: generatedAt,
    scope: OPPORTUNITY_V2_MEMO_SCOPE,
    sort: "deadline_desc",
    total: items.length,
    returned_count: items.length,
    truncated: false,
    known_deadlines: items.filter((item) => Boolean(item.deadline)).length,
    unknown_deadlines: items.filter((item) => !item.deadline && !item.is_long_term).length,
    long_term: items.filter((item) => item.is_long_term).length,
    coverage: coverage(sources, health, items),
    items,
  };
}
