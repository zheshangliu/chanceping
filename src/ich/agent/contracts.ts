export type IchAgentMode = "auto" | "library" | "web";
export type IchAgentRegion = "all" | "CN" | "GLOBAL";
export type IchAgentBudgetPreference = "any" | "free_only" | "low_cost";

export interface IchAgentConstraints {
  craft_terms: string[];
  opportunity_types: string[];
  location_terms: string[];
  region: IchAgentRegion;
  within_days: number | null;
  budget_preference: IchAgentBudgetPreference;
  online_only: boolean;
  explicit_exclusions: string[];
}

export interface IchAgentEvidence {
  evidence_id: string;
  field: "title" | "summary" | "deadline" | "money" | "eligibility" | "work_requirements" | "source";
  value: string;
  status: "pool_record" | "source_excerpt" | "search_lead";
  source_url: string;
  recorded_at: string;
  excerpt?: string;
}

export interface IchAgentFact {
  value: string | null;
  status: "recorded" | "source_excerpt" | "unknown" | "conflict" | "pending_review";
  evidence_refs: string[];
}

export interface IchAgentResult {
  result_ref: string;
  opportunity_id?: string;
  source_kind: "library" | "web_new";
  title_zh: string;
  original_title?: string;
  title_translation?: "translated" | "original";
  opportunity_type: string;
  lifecycle: "current" | "upcoming" | "unknown" | "historical" | "cancelled" | "conflict";
  region: string;
  deadline_fact: IchAgentFact;
  money_facts: IchAgentFact[];
  eligibility_facts: IchAgentFact[];
  work_requirements: IchAgentFact[];
  fit_reason: string;
  key_gap: string;
  next_action: string;
  detail_url?: string;
  original_url: string;
  evidence_refs: string[];
  verification_state: string;
}

export interface IchAgentToolReceipt {
  library_used: boolean;
  web_attempted: boolean;
  web_succeeded: boolean;
  search_calls: number;
  fetch_calls: number;
  chat_calls: number;
  search_cache_hits: number;
}

export interface IchAgentTurnResponse {
  schema_version: "chanceping-ich-agent.v1";
  request_id: string;
  turn_id: string;
  parent_turn_id: string | null;
  snapshot_id: string;
  as_of: string;
  understood_constraints: IchAgentConstraints;
  assumptions: string[];
  clarification_question: string | null;
  tool_receipt: IchAgentToolReceipt;
  results: IchAgentResult[];
  comparison?: Array<{ result_ref: string; title_zh: string; opportunity_type: string; deadline: IchAgentFact; money: IchAgentFact[]; eligibility: IchAgentFact[]; work_requirements: IchAgentFact[]; key_gap: string }>;
  evidences: IchAgentEvidence[];
  remaining_result_count: number;
  partial_failures: string[];
  fallback_mode: "none" | "library_only" | "template_only";
  notice: string;
}

export interface IchAgentQueryRequest {
  request_id: string;
  message: string;
  conversation_token?: string;
  parent_turn_id?: string;
  result_ref?: string;
  compare_result_refs?: string[];
  mode?: IchAgentMode;
}

export const DEFAULT_ICH_AGENT_CONSTRAINTS: IchAgentConstraints = {
  craft_terms: [], opportunity_types: [], location_terms: [], region: "all",
  within_days: null, budget_preference: "any", online_only: false, explicit_exclusions: [],
};
