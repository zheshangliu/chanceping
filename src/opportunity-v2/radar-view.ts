import { opportunityStatus } from "./opportunity-pool";
import type { OpportunityV2, OpportunityV2Source } from "./types";

export type OpportunityV2StatusFilter = "current" | "closing_soon" | "opening_soon" | "long_term" | "deadline_tbd" | "history";

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
  now?: Date;
}

function values(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) return value.filter(Boolean);
  return value ? [value] : [];
}

function liveStatus(item: OpportunityV2, now: Date): OpportunityV2["status"] {
  return opportunityStatus(item.deadline, now);
}

function statusMatches(item: OpportunityV2, filter: string | string[] | undefined, now: Date): boolean {
  const expected = values(filter);
  const status = liveStatus(item, now);
  if (expected.length === 0) return status !== "EXPIRED";
  return expected.some((candidate) => {
    if (candidate === "history") return status === "EXPIRED";
    if (candidate === "current") return status === "CURRENT";
    if (candidate === "deadline_tbd") return status === "UNKNOWN_DEADLINE" && !item.is_long_term;
    if (candidate === "long_term") return status === "UNKNOWN_DEADLINE" && item.is_long_term === true;
    if (candidate === "closing_soon") {
      if (status !== "CURRENT" || !item.deadline) return false;
      const deadline = new Date(item.deadline).getTime();
      return deadline >= now.getTime() && deadline <= now.getTime() + 30 * 24 * 60 * 60 * 1000;
    }
    if (candidate === "opening_soon") {
      if (!item.starts_at) return false;
      const start = new Date(item.starts_at).getTime();
      return start >= now.getTime() && start <= now.getTime() + 30 * 24 * 60 * 60 * 1000;
    }
    return true;
  });
}

function eventRegionMatches(item: OpportunityV2, region: OpportunityV2RadarQuery["event_region"]): boolean {
  if (!region) return true;
  const location = item.event_location?.toLowerCase() ?? "";
  if (region === "unknown") return !location;
  if (region === "overseas") return item.region === "GLOBAL" || /japan|uk|united kingdom|usa|us|canada|australia|海外|英国|美国|加拿大|日本/u.test(location);
  if (region === "hkmt") return /香港|澳门|台湾|hong kong|macau|taiwan/u.test(location);
  return item.region === "CN" && !/香港|澳门|台湾|hong kong|macau|taiwan/u.test(location);
}

export function filterOpportunityV2Radar(opportunities: OpportunityV2[], sources: OpportunityV2Source[], query: OpportunityV2RadarQuery = {}): OpportunityV2[] {
  const now = query.now ?? new Date();
  const enabled = new Set(sources.filter((source) => source.enabled && !["PAUSED", "NEEDS_ADAPTER"].includes(source.status)).map((source) => source.id));
  const q = query.q?.trim().toLowerCase();
  const tag = query.tag?.trim().toLowerCase();
  return opportunities
    .filter((item) => enabled.has(item.source_id))
    .filter((item) => item.radar_relevance === "RELEVANT" || (query.include_uncertain === true && item.radar_relevance === "UNCERTAIN"))
    .filter((item) => statusMatches(item, query.status, now))
    .filter((item) => !query.region || item.region === query.region)
    .filter((item) => !query.source_id || item.source_id === query.source_id)
    .filter((item) => !tag || item.tags.some((value) => value.toLowerCase() === tag || value.toLowerCase().includes(tag)))
    .filter((item) => values(query.category).length === 0 || values(query.category).includes(item.category))
    .filter((item) => values(query.direction).length === 0 || values(query.direction).some((value) => (item.directions ?? []).includes(value as never)))
    .filter((item) => values(query.work_format).length === 0 || values(query.work_format).some((value) => (item.work_formats ?? []).includes(value as never)))
    .filter((item) => eventRegionMatches(item, query.event_region))
    .filter((item) => !q || `${item.title} ${item.summary} ${item.source_name} ${item.tags.join(" ")} ${(item.directions ?? []).join(" ")} ${item.event_location ?? ""}`.toLowerCase().includes(q))
    .sort((a, b) => {
      const aDeadline = a.deadline ? new Date(a.deadline).getTime() : Number.MAX_SAFE_INTEGER;
      const bDeadline = b.deadline ? new Date(b.deadline).getTime() : Number.MAX_SAFE_INTEGER;
      return aDeadline - bDeadline || b.first_seen_at.localeCompare(a.first_seen_at);
    });
}

export function opportunityV2LiveStatus(item: OpportunityV2, now = new Date()): OpportunityV2["status"] {
  return liveStatus(item, now);
}
