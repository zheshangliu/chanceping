import type { OpportunityV2Translation } from "./display";

// Explicit user approval on 2026-10-07, following production cycle
// ich-cycle-81eff94e-b081-49b6-b307-a1df9d444224. This is not a general retry reset.
const APPROVED_TITLE_REPAIR_IDS = new Set([
  "oppv2_6150510674e7858292faf45c",
  "oppv2_6dff384b8cb200042b57ca53",
  "oppv2_738353f18d8c7b821e306088",
  "oppv2_77f08bf9e27bd4171f7494ed",
  "oppv2_cc93864a650fb6d755e979e8",
]);

export function hasApprovedTitleRepair(id: string): boolean {
  return APPROVED_TITLE_REPAIR_IDS.has(id);
}

/**
 * Recovery is deliberately evidence-led. Historical provider rows without a
 * current response are inventory only; quality/provider rows from the current
 * DeepSeek run may receive one bounded retry under the shared budget.
 */
export function shouldRecoverOpportunityV2Translation(entry: OpportunityV2Translation | undefined): boolean {
  if (!entry || entry.status !== "failed") return false;
  if (/\bqwen\b/iu.test(entry.error ?? "") || entry.provider?.toLowerCase() === "qwen") return false;
  if ((entry.attempt_count ?? 0) === 0 && entry.failure_code === "UNKNOWN") return false;
  return entry.failure_code === "QUALITY_REJECTED"
    || entry.failure_code === "PROVIDER_UNAVAILABLE"
    || entry.failure_code === "TIMEOUT"
    || entry.failure_code === "EMPTY_CONTENT"
    || entry.failure_code === "INVALID_JSON";
}
