import { findCurrentOpportunityV2Translation, isForeignLanguageOpportunity, isOpportunityV2TranslationRetryCooling, isReusableOpportunityV2Translation, OPPORTUNITY_V2_TITLE_PROMPT_VERSION, type OpportunityV2Translation } from "./display";
import { shouldRecoverOpportunityV2Translation } from "./translation-recovery";
import type { OpportunityV2TranslationSurface, OpportunityV2VisibleTarget } from "./translation-targets";
import type { OpportunityV2 } from "./types";
import { isOpportunityV2PublicSummaryAllowed } from "./source-governance";

export interface OpportunityV2TranslationQueueEntry {
  item: OpportunityV2;
  priority: number;
  surfaces: OpportunityV2TranslationSurface[];
  existing?: OpportunityV2Translation;
  recovery?: "unspent_p0_title_repair" | "listing_fact_prompt";
}

export interface OpportunityV2TranslationQueue {
  foreign_count: number;
  reused: number;
  cooling: number;
  skipped_not_retryable: number;
  pending: OpportunityV2TranslationQueueEntry[];
  selected: OpportunityV2TranslationQueueEntry[];
}

export function selectOpportunityV2TranslationQueue(
  targets: OpportunityV2VisibleTarget[],
  translations: OpportunityV2Translation[],
  options: { now?: Date; recoveryMode?: "targeted" | "all"; maxItems?: number } = {},
): OpportunityV2TranslationQueue {
  const now = options.now ?? new Date();
  const pending: OpportunityV2TranslationQueueEntry[] = [];
  let foreignCount = 0;
  let reused = 0;
  let cooling = 0;
  let skippedNotRetryable = 0;

  for (const target of targets) {
    if (!isForeignLanguageOpportunity({ ...target.item, summary: isOpportunityV2PublicSummaryAllowed(target.item.source_id) ? target.item.summary : "" })) continue;
    foreignCount += 1;
    const existing = findCurrentOpportunityV2Translation(target.item, translations);
    if (existing && isReusableOpportunityV2Translation(target.item, existing)) {
      reused += 1;
      continue;
    }
    let recovery: OpportunityV2TranslationQueueEntry["recovery"];
    if (existing?.status === "failed" && existing.failure_code === "QUALITY_REJECTED" && !existing.p0_title_repair_attempted) {
      if (target.priority === 0) recovery = "unspent_p0_title_repair";
      else if (existing.retryable === false && !existing.title_fact_recovery_version && existing.translation_prompt_version !== OPPORTUNITY_V2_TITLE_PROMPT_VERSION
        && /\b(?:closing|closes)\s*:?[\s\S]*20\d{2}/iu.test(target.item.title)
        && existing.validation_errors?.length
        && existing.validation_errors.every((error) => /^missing factual token 20\d{2}$/u.test(error))) recovery = "listing_fact_prompt";
    }
    if (!recovery && (existing?.p0_title_repair_attempted || existing?.retryable === false)) {
      skippedNotRetryable += 1;
      continue;
    }
    if (!recovery && existing && options.recoveryMode === "targeted" && !shouldRecoverOpportunityV2Translation(existing)) {
      skippedNotRetryable += 1;
      continue;
    }
    if (!recovery && existing && isOpportunityV2TranslationRetryCooling(existing, now)) {
      cooling += 1;
      continue;
    }
    pending.push({ item: target.item, priority: target.priority, surfaces: target.surfaces, ...(existing ? { existing } : {}), ...(recovery ? { recovery } : {}) });
  }
  pending.sort((a, b) => a.priority - b.priority || a.item.first_seen_at.localeCompare(b.item.first_seen_at) || a.item.id.localeCompare(b.item.id));
  const configuredMaxItems = options.maxItems ?? pending.length;
  const maxItems = Number.isInteger(configuredMaxItems) && configuredMaxItems >= 0 ? Math.min(configuredMaxItems, 200) : 200;
  return { foreign_count: foreignCount, reused, cooling, skipped_not_retryable: skippedNotRetryable, pending, selected: pending.slice(0, maxItems) };
}
