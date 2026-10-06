import type { OpportunityV2Translation } from "./display";

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
