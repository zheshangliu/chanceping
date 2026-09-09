import { deduplicateOpportunityV2, opportunityStatus } from "./opportunity-pool";
import { readOpportunityV2Translations } from "./display";
import { hasEncodingCorruption } from "../ich/aggregation/adapters/common";
import { isLikelySourceListingNoise } from "../ich/aggregation/adapters/generic-listing";
import { isCraftRelevantProcurement } from "./procurement";
import type { OpportunityV2, OpportunityV2Source } from "./types";

export type OpportunityV2StatusFilter = "browse" | "current" | "closing_soon" | "opening_soon" | "long_term" | "deadline_tbd" | "history";

export interface OpportunityV2RadarQuery {
  q?: string;
  region?: "CN" | "GLOBAL";
  source_id?: string;
  tag?: string;
  category?: string | string[];
  direction?: string | string[];
  work_format?: string | string[];
  event_region?: "mainland" | "hkmt" | "overseas" | "unknown";
  status?: OpportunityV2StatusFilter | OpportunityV2StatusFilter[];
  include_uncertain?: boolean;
  /** Internal/public memo export opt-in; the home radar keeps its relevance filter. */
  include_irrelevant?: boolean;
  now?: Date;
}

function values(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) return value.filter(Boolean);
  return value ? [value] : [];
}

function liveStatus(item: OpportunityV2, now: Date): OpportunityV2["status"] {
  const structured = opportunityStatus(item.deadline, now);
  return structured === "UNKNOWN_DEADLINE" ? item.status : structured;
}

function startsInFuture(item: OpportunityV2, now: Date): boolean {
  if (!item.starts_at) return false;
  const start = new Date(item.starts_at).getTime();
  return Number.isFinite(start) && start > now.getTime();
}

function statusMatches(item: OpportunityV2, filter: string | string[] | undefined, now: Date): boolean {
  const expected = values(filter);
  const status = liveStatus(item, now);
  if (expected.length === 0) return status !== "EXPIRED";
  return expected.some((candidate) => {
    if (candidate === "browse") return status !== "EXPIRED";
    if (candidate === "history") return status === "EXPIRED";
    if (candidate === "current") return status === "CURRENT" && !startsInFuture(item, now);
    if (candidate === "deadline_tbd") return status === "UNKNOWN_DEADLINE" && !item.is_long_term;
    if (candidate === "long_term") return status === "UNKNOWN_DEADLINE" && item.is_long_term === true;
    if (candidate === "closing_soon") {
      if (status !== "CURRENT" || !item.deadline || startsInFuture(item, now)) return false;
      const deadline = new Date(item.deadline).getTime();
      return deadline >= now.getTime() && deadline <= now.getTime() + 30 * 24 * 60 * 60 * 1000;
    }
    if (candidate === "opening_soon") {
      if (!item.starts_at) return false;
      const start = new Date(item.starts_at).getTime();
      return Number.isFinite(start) && start >= now.getTime() && start <= now.getTime() + 30 * 24 * 60 * 60 * 1000;
    }
    return true;
  });
}

function eventRegionMatches(item: OpportunityV2, region: OpportunityV2RadarQuery["event_region"]): boolean {
  if (!region) return true;
  const location = item.event_location?.toLowerCase().trim() ?? "";
  if (region === "unknown") return !location;
  if (region === "overseas") return /japan|uk|united kingdom|usa|\bus\b|canada|australia|france|germany|italy|spain|europe|海外|英国|美国|加拿大|日本|法国|德国|意大利|西班牙|欧洲|韩国|korea|singapore|新加坡|greece|希腊|scotland|苏格兰|england|英格兰|new zealand|新西兰/u.test(location);
  if (region === "hkmt") return /香港|澳门|台湾|hong kong|macau|taiwan/u.test(location);
  return /中国大陆|中国内地|中国|北京|上海|广州|深圳|广东|浙江|江苏|四川|杭州|成都|福建|厦门|山东|西安|武汉|重庆|mainland china|china/u.test(location) && !/香港|澳门|台湾|hong kong|macau|taiwan/u.test(location);
}

export function filterOpportunityV2Radar(opportunities: OpportunityV2[], sources: OpportunityV2Source[], query: OpportunityV2RadarQuery = {}): OpportunityV2[] {
  const now = query.now ?? new Date();
  const enabled = new Set(sources.filter((source) => source.enabled && !["PAUSED", "NEEDS_ADAPTER"].includes(source.status)).map((source) => source.id));
  const q = query.q?.trim().toLowerCase();
  const tag = query.tag?.trim().toLowerCase();
  const translations = q ? new Map(readOpportunityV2Translations().map((entry) => [entry.opportunity_id, entry])) : new Map();
  const filtered = opportunities
    .filter((item) => enabled.has(item.source_id))
    .filter((item) => !isLikelySourceListingNoise(item.source_id, item.title, item.detail_url))
    .filter((item) => !hasEncodingCorruption(item.title))
    // A legacy row classified as procurement without structured procurement
    // metadata is not safe to publish: it could be a supplier page, an award,
    // or an unrelated notice. Keep it in the Pool for later reconciliation,
    // but require the bounded procurement parser plus ICH relevance for Radar.
    .filter((item) => item.category !== "procurement_project" || Boolean(item.procurement && item.procurement.direction !== "seller_offer" && isCraftRelevantProcurement(`${item.title} ${item.summary}`)))
    .filter((item) => query.include_irrelevant === true || item.radar_relevance === "RELEVANT" || (query.include_uncertain === true && item.radar_relevance === "UNCERTAIN"))
    .filter((item) => statusMatches(item, query.status, now))
    .filter((item) => !query.region || item.region === query.region)
    .filter((item) => !query.source_id || item.source_id === query.source_id || item.discovered_by_sources.includes(query.source_id))
    .filter((item) => !tag || item.tags.some((value) => value.toLowerCase() === tag || value.toLowerCase().includes(tag)))
    .filter((item) => values(query.category).length === 0 || values(query.category).includes(item.category))
    .filter((item) => values(query.direction).length === 0 || values(query.direction).some((value) => (item.directions ?? []).includes(value as never)))
    .filter((item) => values(query.work_format).length === 0 || values(query.work_format).some((value) => (item.work_formats ?? []).includes(value as never)))
    .filter((item) => eventRegionMatches(item, query.event_region))
    .filter((item) => !q || `${item.title} ${item.encoding_error_fields?.includes("summary") ? "" : item.summary} ${item.source_name} ${item.tags.join(" ")} ${(item.directions ?? []).join(" ")} ${item.event_location ?? ""} ${translations.get(item.id)?.title_zh ?? ""} ${translations.get(item.id)?.summary_zh ?? ""}`.toLowerCase().includes(q));
  return deduplicateOpportunityV2(filtered).opportunities.sort((a, b) => {
      const aDeadline = a.deadline ? new Date(a.deadline).getTime() : Number.MAX_SAFE_INTEGER;
      const bDeadline = b.deadline ? new Date(b.deadline).getTime() : Number.MAX_SAFE_INTEGER;
      return aDeadline - bDeadline || b.first_seen_at.localeCompare(a.first_seen_at);
    });
}

export function opportunityV2LiveStatus(item: OpportunityV2, now = new Date()): OpportunityV2["status"] {
  return liveStatus(item, now);
}
