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
}

export function isTrendType(value: string): value is TrendType {
  return ["policy", "market", "industry", "hiring_market"].includes(value);
}
