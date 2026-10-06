import type { OpportunityV2, V2OpportunityStatus } from "./types";
import { isOpportunityV2PublicSummaryAllowed, publicOpportunityV2DiscoverySources } from "./source-governance";
import { isOpportunityV2PublicSummarySafe } from "./public-text";

export const UNSAFE_DEADLINE_TEXT = "截止时间待核实";

export interface PublicOpportunityV2Deadline {
  deadline: string | null;
  deadline_text: string | null;
  status: V2OpportunityStatus;
  unsafe: boolean;
}

/**
 * The Pool keeps the original evidence, but every public projection must use
 * this fail-closed view when reconciliation found an unsafe date conflict.
 */
export function publicOpportunityV2Deadline(item: Pick<OpportunityV2, "deadline" | "deadline_text" | "deadline_conflict_unsafe" | "status">): PublicOpportunityV2Deadline {
  if (item.deadline_conflict_unsafe === true) {
    return { deadline: null, deadline_text: UNSAFE_DEADLINE_TEXT, status: "UNKNOWN_DEADLINE", unsafe: true };
  }
  return { deadline: item.deadline ?? null, deadline_text: item.deadline_text ?? null, status: item.status, unsafe: false };
}

/** Serialize a V2 opportunity for public JSON without leaking unsafe evidence. */
export function serializeOpportunityV2Public(item: OpportunityV2): Record<string, unknown> {
  const deadline = publicOpportunityV2Deadline(item);
  const reuseAllowed = isOpportunityV2PublicSummaryAllowed(item.source_id);
  const publicSummary = reuseAllowed && isOpportunityV2PublicSummarySafe(item) ? item.summary : "";
  if (!deadline.unsafe) return {
    ...item,
    summary: publicSummary,
    ...(!reuseAllowed ? { deadline_conflicts: [] } : {}),
    discovered_by_sources: publicOpportunityV2DiscoverySources(item.discovered_by_sources),
  };
  const { deadline_conflicts: _conflicts, deadline_source_url: _sourceUrl, deadline_raw_text: _rawText, deadline_checked_at: _checkedAt, ...publicItem } = item;
  return {
    ...publicItem,
    summary: publicSummary,
    discovered_by_sources: publicOpportunityV2DiscoverySources(item.discovered_by_sources),
    deadline: null,
    deadline_text: UNSAFE_DEADLINE_TEXT,
    status: "UNKNOWN_DEADLINE",
  };
}
