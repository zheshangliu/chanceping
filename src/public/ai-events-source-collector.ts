import type { OpportunityStore } from "../agents/opportunity-store";
import type { OpportunityCard } from "../schema/opportunity-card";
import type { SearchResult } from "../search/types";
import { SerperProvider } from "../search/providers/serper";
import type { PublicAiEventSource } from "../demo/ai-events-sample-room";
import { AI_EVENT_SOURCE_NETWORK } from "../demo/ai-events-sample-room";
import { PUBLIC_AI_EVENTS_RADAR_ID } from "./ai-events-store-sync";

const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_MAX_LINKS_PER_SOURCE = 12;
// Each source is promoted only after a concrete-URL collection run succeeds.
const ACTIVE_SOURCE_IDS = [
  "devpost",
  "dorahacks",
  "lablab",
  "kaggle",
  "mlh",
  "hackerearth",
  "devfolio",
  "taikai",
  "challengerocket",
  "hackster",
] as const;
const SECOND_BATCH_SOURCE_IDS: readonly string[] = [];
const AI_EVENT_HINT = /\bai\b|artificial intelligence|machine learning|llm|agent|generative|aigc|hackathon|黑客松|人工智能|大模型|算法|模型/i;

export type PublicAiEventSourceCollectionStatus = "collected" | "empty" | "failed" | "not_enabled";
export type PublicAiEventSourceDiscoveryMethod = "index_fetch" | "search_fallback" | "none";

export interface PublicAiEventSourceCollectionItem {
  sourceId: string;
  sourceName: string;
  status: PublicAiEventSourceCollectionStatus;
  discoveredCount: number;
  acceptedCount: number;
  discoveryMethod: PublicAiEventSourceDiscoveryMethod;
  error?: string;
}

export interface PublicAiEventSourceCollectionResult {
  ranAt: string;
  enabledSourceIds: string[];
  discoveredCardCount: number;
  acceptedCardCount: number;
  sources: PublicAiEventSourceCollectionItem[];
}

export interface CollectPublicAiEventsOptions {
  sourceIds?: readonly string[];
  maxLinksPerSource?: number;
  timeoutMs?: number;
  fetchHtml?: (url: string) => Promise<string>;
  discoverWithSearch?: boolean;
  searchSource?: (query: string, source: PublicAiEventSource) => Promise<SearchResult[]>;
}

interface ExtractedLink {
  title: string;
  url: string;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim();
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function normalizeUrl(value: string, baseUrl: string): string | null {
  try {
    const url = new URL(decodeHtml(value), baseUrl);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    url.hash = "";
    for (const key of Array.from(url.searchParams.keys())) {
      if (/^(utm_|ref$|source$)/i.test(key)) url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return null;
  }
}

function isConcreteEventUrl(sourceId: string, url: URL): boolean {
  const path = url.pathname.replace(/\/+$/, "").toLowerCase();
  if (sourceId === "devpost") {
    const isEventSubdomain = url.hostname !== "devpost.com" && url.hostname !== "www.devpost.com" && /\.devpost\.com$/i.test(url.hostname);
    return isEventSubdomain
      && (path.length === 0 || path.length > 1)
      && !/^\/(participants|resources|rules|updates|submissions?|manage|login|hackathons?)\/?$/i.test(path);
  }
  if (sourceId === "dorahacks") return /dorahacks\.io$/i.test(url.hostname) && /^\/hackathon\//i.test(path);
  if (sourceId === "lablab") return /lablab\.ai$/i.test(url.hostname) && /^\/event\//i.test(path);
  if (sourceId === "kaggle") return /kaggle\.com$/i.test(url.hostname) && /^\/competitions\/[a-z0-9][a-z0-9_-]+/i.test(path);
  if (sourceId === "mlh") return /mlh\.io$/i.test(url.hostname) && /^\/events\/[a-z0-9][a-z0-9_-]+/i.test(path);
  if (sourceId === "hackerearth") return /hackerearth\.com$/i.test(url.hostname) && /^\/challenges\/hackathon\/[a-z0-9][a-z0-9_-]+/i.test(path);
  if (sourceId === "taikai") {
    // Current TAIKAI cards use /en/{organization}/hackathons/{event}/overview.
    // Keep the legacy direct pattern too, but never admit platform or organisation index pages.
    return /taikai\.network$/i.test(url.hostname)
      && (/^\/(?:[a-z]{2}\/)?[a-z0-9-]+\/hackathons\/[a-z0-9][a-z0-9_-]+(?:\/overview)?$/i.test(path)
        || /^\/hackathons\/[a-z0-9][a-z0-9_-]+/i.test(path));
  }
  if (sourceId === "devfolio") return /devfolio\.co$/i.test(url.hostname) && /^\/hackathons\/[a-z0-9][a-z0-9_-]+/i.test(path);
  if (sourceId === "challengerocket") {
    // ChallengeRocket's public challenge pages are root-level slugs. Do not
    // publish its product, account, rules, or nested registration pages.
    const excluded = new Set([
      "",
      "/about",
      "/contact",
      "/faq",
      "/login",
      "/signup",
      "/privacy",
      "/terms",
      "/hackathons-and-challenges.html",
      "/open-learning-by-globalworth",
      "/run-outstanding-hackathons",
      "/start-intern-recruitment-challenge",
      "/start-recruitment-challenge",
    ]);
    return /challengerocket\.com$/i.test(url.hostname)
      && /^\/[a-z0-9][a-z0-9-]*$/i.test(path)
      && !excluded.has(path);
  }
  if (sourceId === "hackster") {
    // Hackster contest detail pages are /contests/{slug}. Keep the contest
    // itself, but never publish the index, rules, submissions, or project pages.
    return /hackster\.io$/i.test(url.hostname)
      && /^\/contests\/[a-z0-9][a-z0-9_-]*$/i.test(path);
  }
  return false;
}

function extractLinks(html: string, source: PublicAiEventSource, maxLinks: number): ExtractedLink[] {
  const pattern = /<a\b[^>]*href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
  const deduped = new Map<string, ExtractedLink>();
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    const urlValue = normalizeUrl(match[2], source.url);
    if (!urlValue) continue;
    const url = new URL(urlValue);
    if (!isConcreteEventUrl(source.id, url)) continue;
    const title = normalizeWhitespace(decodeHtml(match[3]));
    if (!AI_EVENT_HINT.test(`${title} ${url.pathname}`)) continue;
    if (title.length < 3) continue;
    deduped.set(url.toString(), { title: title.slice(0, 220), url: url.toString() });
    if (deduped.size >= maxLinks) break;
  }
  return Array.from(deduped.values());
}

async function defaultFetchHtml(url: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "ChancePing-AIEventsBot/0.2 (+https://aievents.chanceping.com)",
        accept: "text/html,application/xhtml+xml",
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

function buildSourceDiscoveryQuery(source: PublicAiEventSource): string {
  if (source.id === "lablab") return "site:lablab.ai/event (AI OR agent OR LLM) hackathon registration";
  if (source.id === "taikai") return "site:taikai.network/en/*/hackathons/* AI hackathon registration";
  if (source.id === "challengerocket") return "site:challengerocket.com (AI OR hackathon OR challenge) registration -rules -faq -login";
  if (source.id === "hackster") return "site:hackster.io/contests (AI OR edge AI OR machine learning OR robotics) contest participate";
  const focus = source.id === "kaggle" ? "AI machine learning competition" : "AI hackathon registration";
  return `site:${source.domain} ${focus}`;
}

async function defaultSearchSource(query: string): Promise<SearchResult[]> {
  const apiKey = process.env.SERPER_API_KEY?.trim() ?? "";
  if (!apiKey) throw new Error("SERPER_API_KEY unavailable for source discovery");
  // Explicitly prevent mock results from becoming public event cards.
  const provider = new SerperProvider({ apiKey, mockMode: false });
  return provider.search(query, { max_results: 8, language: "en", region: "us" });
}

function linksFromSearchResults(results: SearchResult[], source: PublicAiEventSource, maxLinks: number): ExtractedLink[] {
  const deduped = new Map<string, ExtractedLink>();
  for (const result of results) {
    try {
      const url = new URL(result.url);
      if (!isConcreteEventUrl(source.id, url)) continue;
      if (!AI_EVENT_HINT.test(`${result.title} ${result.snippet} ${url.pathname}`)) continue;
      const title = normalizeWhitespace(result.title);
      if (title.length < 3) continue;
      deduped.set(url.toString(), { title: title.slice(0, 220), url: url.toString() });
      if (deduped.size >= maxLinks) break;
    } catch {
      // Search results remain untrusted until their URL is parsed and accepted.
    }
  }
  return Array.from(deduped.values());
}

function toOpportunityCard(source: PublicAiEventSource, link: ExtractedLink): OpportunityCard {
  const title = link.title;
  return {
    title,
    type: "AI 赛事 / 开发者挑战",
    organizer: source.name,
    region: "以官方页面为准",
    deadline: "见官网",
    reward_or_value: "奖金、云资源或展示机会以官方页面为准",
    eligibility: "个人开发者、小团队或参赛资格以官方页面为准",
    materials_required: "以官方赛事页面说明为准",
    match_reason: `盯比赛从 ${source.name} 的公开赛事索引发现该具体页面，已保留官方入口供后续核对。`,
    next_action: "打开官方页面，确认当前报名状态、截止时间、奖项和参赛资格。",
    official_source_url: link.url,
    application_url: link.url,
    contact_info: "以官方页面为准",
    risk_note: "来源索引仅用于发现赛事；是否开放报名、资格、奖金和截止时间以该官方页面为准。",
    backend_score: 64,
    visible_level: "B",
    status: "new",
    // Must match publicAiEventCardToOpportunityCard's persisted identity so a
    // later seed sync updates this card instead of adding a second copy.
    guid: `ai-events:${link.url.trim().replace(/#.*$/, "").replace(/\?.*$/, "").replace(/\/$/, "").toLowerCase()}`,
    opportunity_kind: "direct_opportunity",
    evidence_status: "unverified",
    action_status: "prepare",
    data_mode: "live",
    source_disclaimer: `从 ${source.name} 公开索引发现，尚待读取具体页面字段。`,
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message.slice(0, 180);
  return String(error).slice(0, 180) || "unknown_error";
}

/**
 * Fetch only source index pages, then preserve concrete event links for the existing
 * public-feed and image/metadata hydration pipeline. This intentionally does not
 * publish index pages, social posts, or aggregation pages as events.
 */
export async function collectPublicAiEventsFromSources(
  store: OpportunityStore,
  options: CollectPublicAiEventsOptions = {},
): Promise<PublicAiEventSourceCollectionResult> {
  const requestedIds = options.sourceIds?.length ? new Set(options.sourceIds) : new Set(ACTIVE_SOURCE_IDS);
  const collectableIds = new Set<string>([...ACTIVE_SOURCE_IDS, ...SECOND_BATCH_SOURCE_IDS]);
  const enabledSources = AI_EVENT_SOURCE_NETWORK.filter((source) => requestedIds.has(source.id) && collectableIds.has(source.id));
  const maxLinks = Math.max(1, Math.min(options.maxLinksPerSource ?? DEFAULT_MAX_LINKS_PER_SOURCE, 30));
  const fetchHtml = options.fetchHtml ?? ((url: string) => defaultFetchHtml(url, options.timeoutMs ?? DEFAULT_TIMEOUT_MS));
  const searchSource = options.searchSource ?? defaultSearchSource;
  const sources: PublicAiEventSourceCollectionItem[] = [];
  let discoveredCardCount = 0;
  let acceptedCardCount = 0;
  const previousAutoFlush = store.autoFlush;
  store.autoFlush = false;
  try {
    for (const source of enabledSources) {
      let directError: string | undefined;
      try {
        const html = await fetchHtml(source.url);
        const links = extractLinks(html, source, maxLinks);
        if (links.length > 0) {
          const cards = links.map((link) => toOpportunityCard(source, link));
          const accepted = store.addBatch(cards, "ai_competition", PUBLIC_AI_EVENTS_RADAR_ID);
          discoveredCardCount += links.length;
          acceptedCardCount += accepted.length;
          sources.push({
            sourceId: source.id,
            sourceName: source.name,
            status: "collected",
            discoveredCount: links.length,
            acceptedCount: accepted.length,
            discoveryMethod: "index_fetch",
          });
          continue;
        }
      } catch (error) {
        directError = errorMessage(error);
      }

      if (options.discoverWithSearch) {
        try {
          const links = linksFromSearchResults(await searchSource(buildSourceDiscoveryQuery(source), source), source, maxLinks);
          const cards = links.map((link) => toOpportunityCard(source, link));
          const accepted = store.addBatch(cards, "ai_competition", PUBLIC_AI_EVENTS_RADAR_ID);
          discoveredCardCount += links.length;
          acceptedCardCount += accepted.length;
          sources.push({
            sourceId: source.id,
            sourceName: source.name,
            status: links.length > 0 ? "collected" : "empty",
            discoveredCount: links.length,
            acceptedCount: accepted.length,
            discoveryMethod: links.length > 0 ? "search_fallback" : "none",
            error: directError,
          });
        } catch (error) {
          sources.push({
            sourceId: source.id,
            sourceName: source.name,
            status: directError ? "failed" : "empty",
            discoveredCount: 0,
            acceptedCount: 0,
            discoveryMethod: "none",
            error: directError ? `${directError}; search fallback: ${errorMessage(error)}` : errorMessage(error),
          });
        }
      } else {
        sources.push({
          sourceId: source.id,
          sourceName: source.name,
          status: directError ? "failed" : "empty",
          discoveredCount: 0,
          acceptedCount: 0,
          discoveryMethod: "none",
          error: directError,
        });
      }
    }
    store.flush();
  } finally {
    store.autoFlush = previousAutoFlush;
  }
  return {
    ranAt: new Date().toISOString(),
    enabledSourceIds: enabledSources.map((source) => source.id),
    discoveredCardCount,
    acceptedCardCount,
    sources,
  };
}
