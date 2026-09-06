import type { IchPrimaryCategory } from "../types";

export const AGGREGATION_SCHEMA = "ich-aggregation-discovery.v1" as const;
export type AggregationItemStatus = "NEW" | "UPDATED" | "UNCHANGED" | "REMOVED";
export type AggregationRelevance = "CORE_ICH" | "ICH_ADJACENT" | "GENERAL_CREATIVE" | "IRRELEVANT";
export type OfficialBacktraceStatus =
  | "OFFICIAL_FOUND"
  | "OFFICIAL_NOT_FOUND"
  | "MULTIPLE_CONFLICTING"
  | "ORGANIZER_UNKNOWN"
  | "PENDING_PROVIDER";

export interface AggregationSourceDefinition {
  source_id: string;
  name: string;
  canonical_url: string;
  discovery_url: string;
  adapter_id: string;
  tier: "P0" | "P1";
  region: "CN" | "GLOBAL";
  source_type: "listing" | "rss";
  priority: "P0" | "P1";
  source_role: "discovery_source";
  categories: IchPrimaryCategory[];
  health_status: "healthy" | "partial" | "blocked" | "pending";
}

export interface AggregationItem {
  item_id: string;
  source_id: string;
  source_item_id: string;
  title: string;
  source_category: string | null;
  discovery_url: string;
  detail_url: string;
  source_url: string;
  published_at: string | null;
  deadline_text: string | null;
  deadline_at: string | null;
  organizer: string | null;
  application_url: string | null;
  raw_text: string;
  content_hash: string;
  last_content_hash: string | null;
  first_seen_at: string;
  last_seen_at: string;
  status: AggregationItemStatus;
  rule_relevance: number;
  semantic_relevance: number | null;
  relevance: AggregationRelevance;
  opportunity_type: IchPrimaryCategory;
  official_backtrace_status: OfficialBacktraceStatus;
  official_url: string | null;
  discovered_by_sources: string[];
}

export interface AggregationLedgerEntry {
  source_id: string;
  source_item_id: string;
  item_id: string;
  title: string;
  source_category: string | null;
  discovery_url: string;
  detail_url: string;
  deadline_at: string | null;
  first_seen_at: string;
  last_seen_at: string;
  content_hash: string;
  last_content_hash: string | null;
  status: AggregationItemStatus;
  official_backtrace_status: OfficialBacktraceStatus;
  candidate_status: "pending" | "qualified" | "rejected";
}

export interface AggregationLedgerFile {
  schema_version: "ich-aggregation-discovery-ledger.v1";
  updated_at: string;
  entries: AggregationLedgerEntry[];
}

export interface SourceHealthRow {
  source_id: string;
  reachable: boolean;
  http_status: number | null;
  last_checked_at: string;
  adapter_status: "PASS" | "PARTIAL" | "BLOCKED" | "PARSER_FAILED" | "JS_REQUIRED" | "AUTH_REQUIRED";
  parse_success: boolean;
  items_seen: number;
  last_success_at: string | null;
  consecutive_failures: number;
  error: string | null;
}

export interface AggregationFunnel {
  raw_items_seen: number;
  new_items: number;
  updated_items: number;
  unchanged_items: number;
  removed_items: number;
  rule_relevant: number;
  semantic_relevant: number;
  official_backtrace_attempted: number;
  official_backtrace_success: number;
  qualified_candidates: number;
  rejected_candidates: number;
  ds3_pass: number;
  ds14_imported: number;
}

export interface AggregationRunReport {
  schema_version: typeof AGGREGATION_SCHEMA;
  run_id: string;
  started_at: string;
  finished_at: string;
  readonly: true;
  formal_store_write: false;
  formal_store_before_sha256: string;
  formal_store_after_sha256: string;
  formal_store_unchanged: boolean;
  baseline: {
    is_first_run: boolean;
    baseline_total: number;
    currently_open: number;
    already_expired: number;
    likely_relevant: number;
  };
  incremental_simulation: { new_items: number; updated_items: number };
  stage5_kpi: { metric: "direction_aware_ich_actionable"; before: number; after: number; target: number };
  sources: AggregationSourceDefinition[];
  source_health: SourceHealthRow[];
  funnel: AggregationFunnel;
  candidates: AggregationItem[];
  gate: "pass" | "pass_with_followups" | "blocked";
}
