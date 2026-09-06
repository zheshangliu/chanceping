export const OPPORTUNITY_V2_SCHEMA = "chanceping-opportunity-v2.v1" as const;

export type V2SourcePriority = "P0" | "P1";
export type V2SourceStatus = "ACTIVE" | "BLOCKED" | "PENDING" | "PAUSED" | "FAILED" | "NEEDS_ADAPTER";
export type V2OpportunityStatus = "CURRENT" | "EXPIRED" | "UNKNOWN_DEADLINE";
export type V2RadarRelevance = "RELEVANT" | "IRRELEVANT" | "UNCERTAIN";

export interface OpportunityV2Source {
  id: string;
  name: string;
  url: string;
  region: "CN" | "GLOBAL";
  priority: V2SourcePriority;
  types: string[];
  radars: string[];
  enabled: boolean;
  status: V2SourceStatus;
  last_fetch_at: string | null;
}

export interface OpportunityV2 {
  id: string;
  title: string;
  summary: string;
  source_id: string;
  source_name: string;
  source_url: string;
  detail_url: string;
  category: string;
  region: "CN" | "GLOBAL";
  tags: string[];
  deadline: string | null;
  status: V2OpportunityStatus;
  first_seen_at: string;
  last_seen_at: string;
  discovered_by_sources: string[];
  radar_relevance: V2RadarRelevance;
  official_url?: string;
  application_url?: string;
  organizer?: string;
}

export interface OpportunityV2PoolFile {
  schema_version: typeof OPPORTUNITY_V2_SCHEMA;
  updated_at: string;
  opportunities: OpportunityV2[];
}

export interface OpportunityV2SourceHealth {
  source_id: string;
  fetched_at: string;
  ok: boolean;
  http_status: number | null;
  items_seen: number;
  error: string | null;
  format?: "DEDICATED" | "RSS" | "HTML_LISTING" | null;
}

export interface OpportunityV2RunResult {
  run_id: string;
  started_at: string;
  finished_at: string;
  fetched_sources: number;
  successful_sources: number;
  raw_items: number;
  pool_items: number;
  radar_items: number;
  sources: OpportunityV2Source[];
  source_health: OpportunityV2SourceHealth[];
  radar_opportunities: OpportunityV2[];
}

export interface OpportunityV2FetchResponse {
  status: number;
  final_url: string;
  text: string;
}

export type OpportunityV2Fetcher = (url: string) => Promise<OpportunityV2FetchResponse>;

// Short aliases keep the pool vocabulary convenient for adapters and callers.
export type Source = OpportunityV2Source;
export type Opportunity = OpportunityV2;
