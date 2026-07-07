import type { OpportunityStore, StoreEntry } from "../agents/opportunity-store";
import type { OpportunityCard } from "../schema/opportunity-card";
import type { EvidenceStatus, OpportunityKind } from "../schema/radar-mvp-contracts";
import {
  buildPublicAiEventFeed,
  normalizePublicReward,
  type BuildPublicAiEventFeedOptions,
  type PublicAiEventCard,
} from "./ai-events-publisher";
import { extractAiEventPageMetadata } from "./ai-event-page-metadata";
import {
  getPublicAiEventSampleRoomData,
  type PublicAiEventSampleRoomData,
} from "../demo/ai-events-sample-room";

export const PUBLIC_AI_EVENTS_RADAR_ID = "public_ai_events";
export const PUBLIC_AI_EVENTS_RADAR_NAME = "AI Events 公共赛事库";

const AI_EVENTS_SYNC_PAGE_SIZE = 60;
const DEFAULT_IMAGE_HYDRATION_LIMIT = 30;
const DEFAULT_IMAGE_HYDRATION_TIMEOUT_MS = 8000;

export interface SyncPublicAiEventsOptions extends Pick<BuildPublicAiEventFeedOptions, "now"> {
  lifecycle?: BuildPublicAiEventFeedOptions["lifecycle"];
}

export interface SyncPublicAiEventsResult {
  radarId: string;
  radarName: string;
  syncedCount: number;
  totalForPublicRadar: number;
  currentCount: number;
  historicalCount: number;
  imageCoverageCount: number;
  imageHydration?: HydratePublicAiEventImagesResult;
}

export interface HydratePublicAiEventImagesOptions {
  limit?: number;
  timeoutMs?: number;
  fetchHtml?: (url: string) => Promise<string>;
}

export interface HydratePublicAiEventImagesResult {
  radarId: string;
  checkedCount: number;
  hydratedCount: number;
  failedCount: number;
  failedDomains: Array<{ domain: string; count: number }>;
  failedUrls: Array<{ url: string; domain: string; reason: string }>;
}

export interface SyncAndHydratePublicAiEventsOptions extends SyncPublicAiEventsOptions {
  hydrateImages?: boolean;
  imageHydrationLimit?: number;
  imageHydrationTimeoutMs?: number;
  fetchHtml?: HydratePublicAiEventImagesOptions["fetchHtml"];
}

function listAllStoreEntries(store: OpportunityStore): StoreEntry[] {
  return store.list({
    page: 1,
    page_size: 100000,
    sort_by: "added_at",
    sort_order: "desc",
  }).entries;
}

function collectAllPublicCards(
  entries: StoreEntry[],
  seedData: PublicAiEventSampleRoomData,
  options: SyncPublicAiEventsOptions = {},
): { cards: PublicAiEventCard[]; currentCount: number; historicalCount: number; imageCoverageCount: number } {
  const lifecycle = options.lifecycle ?? "all";
  const firstPage = buildPublicAiEventFeed(entries, seedData, {
    lifecycle,
    page: 1,
    pageSize: AI_EVENTS_SYNC_PAGE_SIZE,
    now: options.now,
  });
  const cards = [...firstPage.items];
  for (let page = 2; page <= firstPage.stats.totalPages; page += 1) {
    const nextPage = buildPublicAiEventFeed(entries, seedData, {
      lifecycle,
      page,
      pageSize: AI_EVENTS_SYNC_PAGE_SIZE,
      now: options.now,
    });
    cards.push(...nextPage.items);
  }
  return {
    cards,
    currentCount: firstPage.stats.currentCount,
    historicalCount: firstPage.stats.historicalCount,
    imageCoverageCount: firstPage.stats.imageCoverageCount,
  };
}

function mapCandidateType(candidateType: PublicAiEventCard["candidateType"]): OpportunityKind {
  if (
    candidateType === "direct_opportunity" ||
    candidateType === "business_lead" ||
    candidateType === "channel_partner_lead" ||
    candidateType === "customer_lead" ||
    candidateType === "association_directory" ||
    candidateType === "reference_case" ||
    candidateType === "watch_signal" ||
    candidateType === "rejected"
  ) {
    return candidateType;
  }
  return "watch_signal";
}

function mapEvidenceStatus(evidenceStatus: PublicAiEventCard["evidenceStatus"]): EvidenceStatus {
  if (evidenceStatus === "verified" || evidenceStatus === "official_entry_to_review") {
    return "partially_verified";
  }
  if (evidenceStatus === "partially_verified") return "partially_verified";
  return "unverified";
}

function mapVisibleLevel(card: PublicAiEventCard): OpportunityCard["visible_level"] {
  if (card.candidateType === "direct_opportunity" && card.priority >= 90) return "A";
  if (card.candidateType === "direct_opportunity" || card.priority >= 75) return "B";
  return "C";
}

function normalizeText(value: string | undefined, fallback: string): string {
  const normalized = (value ?? "").trim();
  return normalized.length > 0 ? normalized : fallback;
}

function hasSourceImage(card: OpportunityCard): boolean {
  const extra = card as OpportunityCard & Record<string, unknown>;
  return extra.imageStatus === "source_image" && typeof extra.coverImageUrl === "string" && extra.coverImageUrl.length > 0;
}

async function defaultFetchHtml(url: string, timeoutMs = DEFAULT_IMAGE_HYDRATION_TIMEOUT_MS): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "ChancePing-AIEventsBot/0.1 (+https://chanceping.local/aievents)",
        accept: "text/html,application/xhtml+xml",
      },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeDeadline(card: PublicAiEventCard): string {
  const candidates = [card.deadlineSortKey, card.deadline, card.deadlineDisplay];
  return candidates.find((value) => /^\d{4}-\d{2}-\d{2}/.test(value ?? "")) ?? "见官网";
}

function normalizeStableIdentity(value: string): string {
  return value.trim().replace(/#.*$/, "").replace(/\?.*$/, "").replace(/\/$/, "").toLowerCase();
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "unknown";
  }
}

function stringifyErrorReason(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  if (typeof error === "string" && error.trim().length > 0) return error;
  return "unknown_error";
}

function summarizeFailedDomains(failedUrls: Array<{ domain: string }>): Array<{ domain: string; count: number }> {
  const counts = new Map<string, number>();
  for (const failure of failedUrls) {
    counts.set(failure.domain, (counts.get(failure.domain) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([domain, count]) => ({ domain, count }))
    .sort((a, b) => b.count - a.count || a.domain.localeCompare(b.domain));
}

export function publicAiEventCardToOpportunityCard(card: PublicAiEventCard): OpportunityCard {
  const officialUrl = normalizeText(card.officialUrl, card.registrationUrl);
  const applicationUrl = normalizeText(card.registrationUrl, officialUrl);
  const opportunityKind = mapCandidateType(card.candidateType);
  const stableIdentity = normalizeStableIdentity(officialUrl || card.title);
  const opportunityCard: OpportunityCard = {
    title: card.title,
    type: normalizeText(card.eventType, card.primaryCategory?.label ?? "AI 赛事"),
    organizer: normalizeText(card.organizer, `${card.sourceName} · ${card.sourceType}`),
    region: normalizeText(card.region, "见官网"),
    deadline: normalizeDeadline(card),
    reward_or_value: normalizeText(card.prize || card.rewardTypeLabel || card.reward, "见官网"),
    eligibility: normalizeText(card.audience || card.participantTypeLabel, "见官网"),
    materials_required: "以官方赛事页说明为准",
    match_reason: normalizeText(card.reason, "该赛事来自 AI Events 公共赛事库，适合作为 AI 参赛机会跟进。"),
    next_action: "打开官方页面，查看报名入口、截止时间、参赛资格和提交材料。",
    official_source_url: officialUrl,
    application_url: applicationUrl,
    contact_info: "以官方页面为准",
    risk_note: "公开导航只整理赛事入口；资格、奖金、截止时间和提交要求以官方页面为准。",
    backend_score: Math.max(45, Math.min(100, card.priority)),
    visible_level: mapVisibleLevel(card),
    status: "new",
    guid: `ai-events:${stableIdentity}`,
    opportunity_kind: opportunityKind,
    evidence_status: mapEvidenceStatus(card.evidenceStatus),
    action_status: opportunityKind === "watch_signal" || opportunityKind === "reference_case" ? "monitor" : "prepare",
    data_mode: card.publicSource === "database" ? "live" : "recorded",
    source_disclaimer: card.publicSource === "database" ? "来自 ChancePing 机会库。" : "来自 AI Events 样板间种子源，等待下一轮真实抓取刷新。",
  };
  const extended = opportunityCard as OpportunityCard & Record<string, unknown>;
  extended.coverImageUrl = card.coverImageUrl;
  extended.imageSourceUrl = card.imageSourceUrl;
  extended.imageAlt = card.imageAlt;
  extended.imageStatus = card.imageStatus;
  extended.imageAttribution = card.imageAttribution;
  extended.prize = card.prize;
  extended.benefits = card.benefits;
  extended.registrationUrl = card.registrationUrl;
  extended.eventMode = card.eventMode;
  extended.eventModeLabel = card.eventModeLabel;
  extended.participantTypes = card.participantTypes;
  extended.participantTypeLabel = card.participantTypeLabel;
  extended.rewardTypes = card.rewardTypes;
  extended.rewardTypeLabel = card.rewardTypeLabel;
  extended.organizerType = card.organizerType;
  extended.organizerTypeLabel = card.organizerTypeLabel;
  extended.knownFields = card.knownFields;
  extended.missingFields = card.missingFields;
  extended.fieldCompleteness = card.fieldCompleteness;
  extended.lifecycleStatus = card.lifecycleStatus;
  extended.deadlineDisplay = card.deadlineDisplay;
  extended.primaryCategory = card.primaryCategory;
  extended.categoryTags = card.categoryTags;
  return opportunityCard;
}

export function syncPublicAiEventsToStore(
  store: OpportunityStore,
  seedData: PublicAiEventSampleRoomData = getPublicAiEventSampleRoomData(),
  options: SyncPublicAiEventsOptions = {},
): SyncPublicAiEventsResult {
  const previousAutoFlush = store.autoFlush;
  const existingEntries = listAllStoreEntries(store);
  const publicFeed = collectAllPublicCards(existingEntries, seedData, options);
  const cards = publicFeed.cards.map(publicAiEventCardToOpportunityCard);
  store.autoFlush = false;
  try {
    store.addBatch(cards, "ai_competition", PUBLIC_AI_EVENTS_RADAR_ID);
    store.flush();
  } finally {
    store.autoFlush = previousAutoFlush;
  }
  const totalForPublicRadar = store.list({
    radarId: PUBLIC_AI_EVENTS_RADAR_ID,
    page: 1,
    page_size: 100000,
  }).total;
  return {
    radarId: PUBLIC_AI_EVENTS_RADAR_ID,
    radarName: PUBLIC_AI_EVENTS_RADAR_NAME,
    syncedCount: cards.length,
    totalForPublicRadar,
    currentCount: publicFeed.currentCount,
    historicalCount: publicFeed.historicalCount,
    imageCoverageCount: publicFeed.imageCoverageCount,
  };
}

export async function syncAndHydratePublicAiEventsToStore(
  store: OpportunityStore,
  seedData: PublicAiEventSampleRoomData = getPublicAiEventSampleRoomData(),
  options: SyncAndHydratePublicAiEventsOptions = {},
): Promise<SyncPublicAiEventsResult> {
  const syncResult = syncPublicAiEventsToStore(store, seedData, options);
  if (!options.hydrateImages) return syncResult;

  const imageHydration = await hydratePublicAiEventImages(store, {
    limit: options.imageHydrationLimit,
    timeoutMs: options.imageHydrationTimeoutMs,
    fetchHtml: options.fetchHtml,
  });
  const refreshedEntries = listAllStoreEntries(store);
  const refreshedFeed = collectAllPublicCards(refreshedEntries, seedData, options);
  return {
    ...syncResult,
    totalForPublicRadar: store.list({
      radarId: PUBLIC_AI_EVENTS_RADAR_ID,
      page: 1,
      page_size: 100000,
    }).total,
    imageCoverageCount: refreshedFeed.imageCoverageCount,
    imageHydration,
  };
}

export async function hydratePublicAiEventImages(
  store: OpportunityStore,
  options: HydratePublicAiEventImagesOptions = {},
): Promise<HydratePublicAiEventImagesResult> {
  const limit = Math.max(1, Math.min(options.limit ?? DEFAULT_IMAGE_HYDRATION_LIMIT, 120));
  const fetchHtml = options.fetchHtml ?? ((url: string) => defaultFetchHtml(url, options.timeoutMs));
  const entries = store.list({
    radarId: PUBLIC_AI_EVENTS_RADAR_ID,
    page: 1,
    page_size: 100000,
    sort_by: "deadline",
    sort_order: "asc",
  }).entries;
  const candidates = entries
    .filter((entry) => !hasSourceImage(entry.card))
    .filter((entry) => /^https?:\/\//i.test(entry.card.official_source_url))
    .slice(0, limit);
  let checkedCount = 0;
  let hydratedCount = 0;
  let failedCount = 0;
  const failedUrls: HydratePublicAiEventImagesResult["failedUrls"] = [];
  const previousAutoFlush = store.autoFlush;
  store.autoFlush = false;
  try {
    for (const entry of candidates) {
      checkedCount += 1;
      try {
        const html = await fetchHtml(entry.card.official_source_url);
        const metadata = extractAiEventPageMetadata(html, entry.card.official_source_url);
        if (!metadata.coverImageUrl) continue;
        const updatedCard: OpportunityCard & Record<string, unknown> = { ...entry.card };
        updatedCard.coverImageUrl = metadata.coverImageUrl;
        updatedCard.imageSourceUrl = metadata.imageSourceUrl ?? metadata.coverImageUrl;
        updatedCard.imageAlt = metadata.imageAlt ?? `${entry.card.title} 赛事封面`;
        updatedCard.imageStatus = "source_image";
        updatedCard.imageAttribution = "source_page";
        if (metadata.registrationUrl) {
          updatedCard.application_url = metadata.registrationUrl;
          updatedCard.registrationUrl = metadata.registrationUrl;
        }
        if (metadata.deadline) {
          updatedCard.deadline = metadata.deadline;
          updatedCard.deadlineDisplay = metadata.deadline;
        }
        if (metadata.reward) {
          const normalizedReward = normalizePublicReward(metadata.reward, "见官网");
          updatedCard.reward_or_value = normalizedReward;
          updatedCard.prize = normalizedReward;
        }
        if (metadata.organizer) {
          updatedCard.organizer = metadata.organizer;
        }
        if (metadata.region) {
          updatedCard.region = metadata.region;
        }
        store.update(entry.dedup_key, updatedCard);
        hydratedCount += 1;
      } catch (error) {
        failedCount += 1;
        const url = entry.card.official_source_url;
        failedUrls.push({
          url,
          domain: extractDomain(url),
          reason: stringifyErrorReason(error),
        });
      }
    }
    store.flush();
  } finally {
    store.autoFlush = previousAutoFlush;
  }
  return {
    radarId: PUBLIC_AI_EVENTS_RADAR_ID,
    checkedCount,
    hydratedCount,
    failedCount,
    failedDomains: summarizeFailedDomains(failedUrls),
    failedUrls,
  };
}
