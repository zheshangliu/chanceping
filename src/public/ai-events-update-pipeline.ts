import fs from "fs";
import path from "path";
import type { OpportunityStore, StoreEntry } from "../agents/opportunity-store";
import {
  buildPublicAiEventFeed,
  type BuildPublicAiEventFeedOptions,
} from "./ai-events-publisher";
import type { PublicAiEventSampleRoomData } from "../demo/ai-events-sample-room";
import {
  hydratePublicAiEventImages,
  PUBLIC_AI_EVENTS_RADAR_ID,
  PUBLIC_AI_EVENTS_RADAR_NAME,
  type HydratePublicAiEventImagesOptions,
  type HydratePublicAiEventImagesResult,
  syncAndHydratePublicAiEventsToStore,
} from "./ai-events-store-sync";
import {
  collectPublicAiEventsFromSources,
  type CollectPublicAiEventsOptions,
  type PublicAiEventSourceCollectionResult,
} from "./ai-events-source-collector";

const PIPELINE_PAGE_SIZE = 60;

export interface PublicAiEventsUpdatePipelineOptions extends Pick<BuildPublicAiEventFeedOptions, "now"> {
  hydrateImages?: boolean;
  imageHydrationLimit?: number;
  imageHydrationTimeoutMs?: number;
  fetchHtml?: HydratePublicAiEventImagesOptions["fetchHtml"];
  collectSources?: boolean;
  sourceIds?: CollectPublicAiEventsOptions["sourceIds"];
  sourceMaxLinks?: number;
  discoverWithSearch?: boolean;
  sourceSearch?: CollectPublicAiEventsOptions["searchSource"];
  sourceHealthPath?: string;
}

interface SourceHealthSnapshot {
  updatedAt: string;
  runs: number;
  sources: Record<string, {
    sourceName: string;
    lastStatus: string;
    lastDiscoveryMethod: string;
    lastDiscoveredCount: number;
    lastAcceptedCount: number;
    failureStreak: number;
    lastError?: string;
  }>;
}

export interface PublicAiEventsSourceHealthSummary {
  available: boolean;
  updatedAt?: string;
  runs: number;
  healthyCount: number;
  degradedCount: number;
  failedCount: number;
}

function resolveSourceHealthPath(targetPath?: string): string {
  return targetPath
    ?? process.env.CHANCEPING_AI_EVENTS_SOURCE_HEALTH_PATH
    ?? path.resolve(process.cwd(), "data", "ai-events-source-health.json");
}

/**
 * Returns operational freshness without exposing source errors, local paths, or
 * provider details through the public API.
 */
export function getPublicAiEventsSourceHealthSummary(targetPath?: string): PublicAiEventsSourceHealthSummary {
  const outputPath = resolveSourceHealthPath(targetPath);
  try {
    if (!fs.existsSync(outputPath)) {
      return { available: false, runs: 0, healthyCount: 0, degradedCount: 0, failedCount: 0 };
    }
    const snapshot = JSON.parse(fs.readFileSync(outputPath, "utf-8")) as SourceHealthSnapshot;
    const sources = Object.values(snapshot.sources ?? {});
    let healthyCount = 0;
    let degradedCount = 0;
    let failedCount = 0;
    for (const source of sources) {
      if (source.lastStatus === "collected") healthyCount += 1;
      else if (source.lastStatus === "failed") failedCount += 1;
      else degradedCount += 1;
    }
    return {
      available: true,
      ...(snapshot.updatedAt ? { updatedAt: snapshot.updatedAt } : {}),
      runs: Number.isFinite(snapshot.runs) ? snapshot.runs : 0,
      healthyCount,
      degradedCount,
      failedCount,
    };
  } catch {
    return { available: false, runs: 0, healthyCount: 0, degradedCount: 0, failedCount: 0 };
  }
}

export interface PublicAiEventsUpdatePipelineSummary {
  radarId: string;
  radarName: string;
  executionMode: "offline_store_refresh" | "source_index_collection";
  ranAt: string;
  sync: {
    syncedCount: number;
    totalForPublicRadar: number;
  };
  imageHydration?: HydratePublicAiEventImagesResult;
  publicFeed: {
    totalCount: number;
    currentCount: number;
    historicalCount: number;
    filteredCount: number;
    pageSize: number;
    totalPages: number;
    databaseCount: number;
    seedCount: number;
  };
  images: {
  withCoverCount: number;
  sourceImageCount: number;
  sourceLogoCount: number;
  platformPlaceholderCount: number;
  defaultPlaceholderCount: number;
};
  sourceNetwork: {
    sourceCount: number;
    officialSourceCount: number;
    aggregatorSourceCount: number;
  };
  sourceCollection?: PublicAiEventSourceCollectionResult;
}

function listPublicRadarEntries(store: OpportunityStore): StoreEntry[] {
  return store.list({
    radarId: PUBLIC_AI_EVENTS_RADAR_ID,
    page: 1,
    page_size: 100000,
    sort_by: "deadline",
    sort_order: "asc",
  }).entries;
}

function countImages(entries: StoreEntry[]): PublicAiEventsUpdatePipelineSummary["images"] {
  let withCoverCount = 0;
  let sourceImageCount = 0;
  let sourceLogoCount = 0;
  let platformPlaceholderCount = 0;
  let defaultPlaceholderCount = 0;

  for (const entry of entries) {
    const extra = entry.card as unknown as Record<string, unknown>;
    const coverImageUrl = typeof extra.coverImageUrl === "string" ? extra.coverImageUrl : "";
    const imageStatus = typeof extra.imageStatus === "string" ? extra.imageStatus : "";
    if (coverImageUrl.length > 0) withCoverCount += 1;
    if (imageStatus === "source_image") sourceImageCount += 1;
    if (imageStatus === "source_logo") sourceLogoCount += 1;
    if (imageStatus === "platform_placeholder") platformPlaceholderCount += 1;
    if (imageStatus === "default_placeholder") defaultPlaceholderCount += 1;
  }

  return {
    withCoverCount,
    sourceImageCount,
    sourceLogoCount,
    platformPlaceholderCount,
    defaultPlaceholderCount,
  };
}

function persistSourceHealth(
  sourceCollection: PublicAiEventSourceCollectionResult | undefined,
  targetPath: string | undefined,
): void {
  if (!sourceCollection) return;
  const outputPath = resolveSourceHealthPath(targetPath);
  let previous: SourceHealthSnapshot = { updatedAt: "", runs: 0, sources: {} };
  try {
    if (fs.existsSync(outputPath)) {
      previous = JSON.parse(fs.readFileSync(outputPath, "utf-8")) as SourceHealthSnapshot;
    }
  } catch {
    // Health telemetry must not block an otherwise successful refresh.
  }
  const sources = { ...previous.sources };
  for (const item of sourceCollection.sources) {
    const existing = sources[item.sourceId];
    const failed = item.status === "failed" || item.status === "empty";
    sources[item.sourceId] = {
      sourceName: item.sourceName,
      lastStatus: item.status,
      lastDiscoveryMethod: item.discoveryMethod,
      lastDiscoveredCount: item.discoveredCount,
      lastAcceptedCount: item.acceptedCount,
      failureStreak: failed ? (existing?.failureStreak ?? 0) + 1 : 0,
      ...(item.error ? { lastError: item.error } : {}),
    };
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify({
    updatedAt: sourceCollection.ranAt,
    runs: previous.runs + 1,
    sources,
  } satisfies SourceHealthSnapshot, null, 2), "utf-8");
}

export async function runPublicAiEventsUpdatePipeline(
  store: OpportunityStore,
  seedData?: PublicAiEventSampleRoomData,
  options: PublicAiEventsUpdatePipelineOptions = {},
): Promise<PublicAiEventsUpdatePipelineSummary> {
  const syncResult = await syncAndHydratePublicAiEventsToStore(store, seedData, {
    now: options.now,
    lifecycle: "all",
    // Collect before hydration so newly discovered concrete event pages can be
    // enriched in the same scheduled run rather than three days later.
    hydrateImages: false,
    imageHydrationLimit: options.imageHydrationLimit,
    imageHydrationTimeoutMs: options.imageHydrationTimeoutMs,
    fetchHtml: options.fetchHtml,
  });
  const sourceCollection = options.collectSources
    ? await collectPublicAiEventsFromSources(store, {
      sourceIds: options.sourceIds,
      maxLinksPerSource: options.sourceMaxLinks,
      fetchHtml: options.fetchHtml,
      discoverWithSearch: options.discoverWithSearch,
      searchSource: options.sourceSearch,
    })
    : undefined;
  persistSourceHealth(sourceCollection, options.sourceHealthPath);
  const imageHydration = options.hydrateImages
    ? await hydratePublicAiEventImages(store, {
      limit: options.imageHydrationLimit,
      timeoutMs: options.imageHydrationTimeoutMs,
      fetchHtml: options.fetchHtml,
    })
    : undefined;
  const publicEntries = listPublicRadarEntries(store);
  const feed = buildPublicAiEventFeed(publicEntries, seedData, {
    lifecycle: "all",
    page: 1,
    pageSize: PIPELINE_PAGE_SIZE,
    now: options.now,
  });

  return {
    radarId: PUBLIC_AI_EVENTS_RADAR_ID,
    radarName: PUBLIC_AI_EVENTS_RADAR_NAME,
    executionMode: sourceCollection ? "source_index_collection" : "offline_store_refresh",
    ranAt: new Date().toISOString(),
    sync: {
      syncedCount: syncResult.syncedCount,
      totalForPublicRadar: syncResult.totalForPublicRadar,
    },
    imageHydration,
    publicFeed: {
      totalCount: feed.stats.totalCount,
      currentCount: feed.stats.currentCount,
      historicalCount: feed.stats.historicalCount,
      filteredCount: feed.stats.filteredCount,
      pageSize: feed.stats.pageSize,
      totalPages: feed.stats.totalPages,
      databaseCount: feed.stats.databaseCount,
      seedCount: feed.stats.seedCount,
    },
    images: countImages(publicEntries),
    sourceNetwork: {
      sourceCount: feed.stats.sourceCount,
      officialSourceCount: feed.stats.officialSourceCount,
      aggregatorSourceCount: feed.stats.aggregatorSourceCount,
    },
    sourceCollection,
  };
}
