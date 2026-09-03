export type TrendType = "policy" | "market" | "industry" | "hiring_market";

export interface TrendIntelligence {
  trend_id: string;
  trend_type: TrendType;
  title: string;
  summary: string;
  evidence_ids: string[];
  source_confidence: number | null;
  first_seen_at: string;
  last_seen_at: string;
  active: boolean;
  event_date?: string | null;
  published_at?: string | null;
  source_name?: string | null;
  source_url?: string | null;
  fact_summary_zh?: string | null;
  relevance_to_gbs_zh?: string | null;
  supporting_evidence?: string[];
  implication_for_gbs_zh?: string | null;
}

export function isTrendType(value: string): value is TrendType {
  return ["policy", "market", "industry", "hiring_market"].includes(value);
}
