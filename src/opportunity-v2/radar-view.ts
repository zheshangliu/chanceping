import type { OpportunityV2, OpportunityV2Source } from "./types";

export interface OpportunityV2RadarQuery {
  q?: string;
  region?: "CN" | "GLOBAL";
  source_id?: string;
  tag?: string;
  include_uncertain?: boolean;
}

export function filterOpportunityV2Radar(opportunities: OpportunityV2[], sources: OpportunityV2Source[], query: OpportunityV2RadarQuery = {}): OpportunityV2[] {
  const enabled = new Set(sources.filter((source) => source.enabled && source.status === "ACTIVE").map((source) => source.id));
  const q = query.q?.trim().toLowerCase();
  const tag = query.tag?.trim().toLowerCase();
  return opportunities
    .filter((item) => enabled.has(item.source_id))
    .filter((item) => item.radar_relevance === "RELEVANT" || (query.include_uncertain === true && item.radar_relevance === "UNCERTAIN"))
    .filter((item) => item.status === "CURRENT" || item.status === "UNKNOWN_DEADLINE")
    .filter((item) => !query.region || item.region === query.region)
    .filter((item) => !query.source_id || item.source_id === query.source_id)
    .filter((item) => !tag || item.tags.some((value) => value.toLowerCase() === tag || value.toLowerCase().includes(tag)))
    .filter((item) => !q || `${item.title} ${item.summary} ${item.source_name} ${item.tags.join(" ")}`.toLowerCase().includes(q))
    .sort((a, b) => {
      const aDeadline = a.deadline ? new Date(a.deadline).getTime() : Number.MAX_SAFE_INTEGER;
      const bDeadline = b.deadline ? new Date(b.deadline).getTime() : Number.MAX_SAFE_INTEGER;
      return aDeadline - bDeadline || b.last_seen_at.localeCompare(a.last_seen_at);
    });
}
