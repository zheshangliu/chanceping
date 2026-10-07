import { buildOpportunityV2Display, cleanOpportunityDisplayText, createTranslatedOpportunityV2Translation, readOpportunityV2Translations, resolveOpportunityV2TranslationPath, writeOpportunityV2Translations, type OpportunityV2Translation } from "./display";
import { readOpportunityV2Pool, resolveOpportunityV2PoolPath } from "./opportunity-pool";
import { readOpportunityV2Sources, resolveOpportunityV2SourcesPath } from "./source-pool";
import { collectOpportunityV2TranslationTargets } from "./translation-targets";
import { translateWithProviderChain, type OpportunityTranslationProvider } from "./translation-provider";
import { TranslationRequestBudget } from "./translation-budget";
import { selectOpportunityV2TranslationQueue, type OpportunityV2TranslationQueueEntry } from "./translation-queue";
import { configuredTranslationProviders } from "./translation-provider";
import { isOpportunityV2PublicSummaryAllowed } from "./source-governance";

const MAX_ITEMS = 200;
const MAX_REQUESTS = 250;
const MAX_CONCURRENCY = 2;

function cap(value: number | undefined, fallback: number, ceiling: number): number {
  return Number.isInteger(value) && (value as number) > 0 ? Math.min(value as number, ceiling) : fallback;
}

export interface OpportunityV2TranslationRunSummary {
  status: "COMPLETED" | "ACCESS_BLOCKED" | "DRY_RUN_ONLY";
  provider: "deepseek";
  provider_configured: boolean;
  source_count: number;
  pool_count: number;
  visible_target_count: number;
  foreign_count: number;
  cache_reused: number;
  cooling: number;
  skipped_not_retryable: number;
  eligible_pending: number;
  selected_unique_ids: string[];
  selected_surfaces: Record<string, string[]>;
  actual_requests: number;
  attempted_records: number;
  translated_records: number;
  failed_records: number;
  failure_counts: Record<string, number>;
  p0_title_repair_attempted: number;
  p0_title_repair_succeeded: number;
  p0_title_repair_failed: number;
  quality_rejection_clusters: Record<string, number>;
  write_result: { written_count: number; skipped_stale_count: number; preserved_success_count: number };
  budget_after: { max_requests: number; actual_requests: number; reserved_requests: number };
  visible_with_chinese: number;
  unattempted_selected: number;
}

export interface OpportunityV2TranslationRunOptions {
  now?: Date;
  execute?: boolean;
  allSurfaces?: boolean;
  poolPath?: string;
  sourcesPath?: string;
  translationPath?: string;
  maxItems?: number;
  maxRequests?: number;
  /** Narrow test seam; production remains pinned to the configured DeepSeek adapter. */
  translationProvider?: OpportunityTranslationProvider;
}

function qualityFailureClusters(errors: string[]): string[] {
  const clusters = new Set<string>();
  for (const error of errors) {
    if (/missing factual token/iu.test(error)) clusters.add("MISSING_FACT");
    else if (/title is unchanged/iu.test(error)) clusters.add("TITLE_UNCHANGED");
    else if (/title remains untranslated/iu.test(error)) clusters.add("TITLE_REMAINS_ENGLISH");
    else if (/english residue/iu.test(error)) clusters.add("ENGLISH_RESIDUE");
    else if (/currency|fee|deadline|post-selection/iu.test(error)) clusters.add("STRUCTURED_FACT_MISMATCH");
    else if (/template summary/iu.test(error)) clusters.add("UNSUPPORTED_SUMMARY_TEMPLATE");
    else clusters.add("OTHER_VALIDATION");
  }
  return [...clusters];
}

/** Reusable, bounded DeepSeek-only step shared by manual and protected cycle entrypoints. */
export async function runOpportunityV2DisplayTranslation(options: OpportunityV2TranslationRunOptions = {}): Promise<OpportunityV2TranslationRunSummary> {
  const now = options.now ?? new Date();
  const poolPath = resolveOpportunityV2PoolPath(options.poolPath);
  const sourcesPath = resolveOpportunityV2SourcesPath(options.sourcesPath);
  const translationsPath = resolveOpportunityV2TranslationPath(options.translationPath);
  const pool = readOpportunityV2Pool(poolPath);
  const sources = readOpportunityV2Sources(sourcesPath);
  const targets = collectOpportunityV2TranslationTargets(pool.opportunities, sources, now);
  const targetSet = options.allSurfaces
    ? targets
    : targets.filter((target) => target.surfaces.some((surface) => ["main", "memo", "procurement", "overseas", "weekly"].includes(surface)));
  const previous = readOpportunityV2Translations(translationsPath);
  const maxItems = cap(options.maxItems, MAX_ITEMS, MAX_ITEMS);
  const maxRequests = cap(options.maxRequests, MAX_REQUESTS, MAX_REQUESTS);
  const queue = selectOpportunityV2TranslationQueue(targetSet, previous, {
    now,
    recoveryMode: process.env.CHANCEPING_TRANSLATION_RECOVERY === "targeted" ? "targeted" : "all",
    maxItems,
  });
  const deepseek = options.translationProvider?.id === "deepseek"
    ? options.translationProvider
    : configuredTranslationProviders(process.env).providers.find((provider) => provider.id === "deepseek");
  const budget = new TranslationRequestBudget(maxRequests);
  const common = {
    provider: "deepseek" as const,
    provider_configured: Boolean(deepseek),
    source_count: sources.length,
    pool_count: pool.opportunities.length,
    visible_target_count: targetSet.length,
    foreign_count: queue.foreign_count,
    cache_reused: queue.reused,
    cooling: queue.cooling,
    skipped_not_retryable: queue.skipped_not_retryable,
    eligible_pending: queue.pending.length,
    selected_unique_ids: queue.selected.map((entry) => entry.item.id),
    selected_surfaces: Object.fromEntries(queue.selected.map((entry) => [entry.item.id, entry.surfaces])),
  };
  const emptyQuality = { p0_title_repair_attempted: 0, p0_title_repair_succeeded: 0, p0_title_repair_failed: 0, quality_rejection_clusters: {} };
  if (options.execute === false) return { ...common, ...emptyQuality, status: "DRY_RUN_ONLY", actual_requests: 0, attempted_records: 0, translated_records: 0, failed_records: 0, failure_counts: {}, write_result: { written_count: 0, skipped_stale_count: 0, preserved_success_count: 0 }, budget_after: budget.summary(), visible_with_chinese: 0, unattempted_selected: queue.selected.length };
  if (!deepseek) return { ...common, ...emptyQuality, status: "ACCESS_BLOCKED", actual_requests: 0, attempted_records: 0, translated_records: 0, failed_records: 0, failure_counts: { CREDENTIAL_NOT_CONFIGURED: queue.selected.length }, write_result: { written_count: 0, skipped_stale_count: 0, preserved_success_count: 0 }, budget_after: budget.summary(), visible_with_chinese: 0, unattempted_selected: queue.selected.length };

  const results: OpportunityV2Translation[] = [];
  const failureCounts: Record<string, number> = {};
  const qualityRejectionClusters: Record<string, number> = {};
  let p0TitleRepairAttempted = 0;
  let p0TitleRepairSucceeded = 0;
  let p0TitleRepairFailed = 0;
  let cursor = 0;
  let inFlight = 0;
  let attemptedRecords = 0;
  let waiters: Array<() => void> = [];
  const applyRetryDisposition = (entry: OpportunityV2TranslationQueueEntry, resultIndex: number): void => {
    const current = results[resultIndex];
    if (!current) return;
    const currentAttemptCount = Math.max(1, current.attempt_count ?? 0);
    const cumulativeAttemptCount = (entry.existing?.attempt_count ?? 0) + currentAttemptCount;
    if (current.status !== "failed") {
      results[resultIndex] = { ...current, attempt_count: cumulativeAttemptCount };
      return;
    }
    const attemptLimit = current.failure_code === "QUALITY_REJECTED" ? 2 : 3;
    const repairAlreadySpent = entry.priority === 0 && current.p0_title_repair_attempted === true;
    const retryable = !repairAlreadySpent && cumulativeAttemptCount < attemptLimit;
    results[resultIndex] = {
      ...current,
      attempt_count: cumulativeAttemptCount,
      retryable,
      next_retry_at: retryable ? current.next_retry_at ?? new Date(now.getTime() + 60 * 60 * 1000).toISOString() : null,
    };
  };
  const worker = async (): Promise<void> => {
    while (true) {
      if (cursor >= queue.selected.length) return;
      const ticket = budget.reserve(queue.selected[cursor].recovery ? 1 : 2);
      if (!ticket) {
        if (inFlight === 0) return;
        await new Promise<void>((resolve) => waiters.push(resolve));
        continue;
      }
      if (cursor >= queue.selected.length) { ticket.finish(); return; }
      const entry = queue.selected[cursor++];
      inFlight += 1;
      attemptedRecords += 1;
      try {
        if (entry.recovery) {
          const isP0Repair = entry.recovery === "unspent_p0_title_repair";
          if (isP0Repair) p0TitleRepairAttempted += 1;
          const recovered = await translateWithProviderChain(entry.item, [deepseek], now, {
            includeSummary: false, validationErrors: entry.existing?.validation_errors,
            onRequestStart: () => ticket.requestStarted(),
          });
          const translated = recovered.translation.status === "translated";
          results.push({ ...recovered.translation,
            attempt_count: (entry.existing?.attempt_count ?? 0) + recovered.request_count,
            retryable: false, next_retry_at: null,
            ...(isP0Repair ? { p0_title_repair_attempted: true } : { title_fact_recovery_version: "listing-facts-v1" as const }),
          });
          if (isP0Repair) { if (translated) p0TitleRepairSucceeded += 1; else p0TitleRepairFailed += 1; }
          if (!translated) {
            const reason = recovered.translation.failure_code ?? "UNKNOWN";
            failureCounts[reason] = (failureCounts[reason] ?? 0) + 1;
            for (const cluster of qualityFailureClusters(recovered.translation.validation_errors ?? [])) qualityRejectionClusters[cluster] = (qualityRejectionClusters[cluster] ?? 0) + 1;
          }
          continue;
        }
        const result = await translateWithProviderChain(entry.item, [deepseek], now, {
          includeSummary: isOpportunityV2PublicSummaryAllowed(entry.item.source_id),
          onRequestStart: () => ticket.requestStarted(),
        });
        const safeTranslation = result.translation.status === "failed"
          ? { ...result.translation, error: "翻译未通过，已按失败状态冷却并等待后续重试" }
          : result.translation;
        if (safeTranslation.status === "failed" && safeTranslation.failure_code === "QUALITY_REJECTED") {
          for (const cluster of qualityFailureClusters(safeTranslation.validation_errors ?? [])) qualityRejectionClusters[cluster] = (qualityRejectionClusters[cluster] ?? 0) + 1;
          if (entry.priority === 0 && !entry.existing?.p0_title_repair_attempted) {
            p0TitleRepairAttempted += 1;
            try {
              const repaired = await deepseek.translate({ title: cleanOpportunityDisplayText(entry.item.title), summary: "", targetLanguage: "zh-CN", validationErrors: safeTranslation.validation_errors }, { includeSummary: false, onRequestStart: () => ticket.requestStarted() });
              const checkedRepair = createTranslatedOpportunityV2Translation(entry.item, { title_zh: repaired.title_zh, summary_zh: "" }, now);
              if (checkedRepair.status === "translated") {
                results.push({ ...checkedRepair, provider: "deepseek", attempt_count: (safeTranslation.attempt_count ?? 1) + 1, last_attempt_at: now.toISOString(), retryable: false, p0_title_repair_attempted: true });
                p0TitleRepairSucceeded += 1;
              } else {
                for (const cluster of qualityFailureClusters(checkedRepair.validation_errors ?? [])) qualityRejectionClusters[cluster] = (qualityRejectionClusters[cluster] ?? 0) + 1;
                results.push({ ...safeTranslation, attempt_count: (safeTranslation.attempt_count ?? 1) + 1, retryable: false, p0_title_repair_attempted: true });
                p0TitleRepairFailed += 1;
              }
            } catch {
              results.push({ ...safeTranslation, attempt_count: (safeTranslation.attempt_count ?? 1) + 1, retryable: false, p0_title_repair_attempted: true });
              p0TitleRepairFailed += 1;
            }
          } else results.push(safeTranslation);
        } else results.push(safeTranslation);
        applyRetryDisposition(entry, results.length - 1);
        if (results.at(-1)?.status === "failed") {
          const reason = results.at(-1)?.failure_code ?? "UNKNOWN";
          failureCounts[reason] = (failureCounts[reason] ?? 0) + 1;
        }
      } catch {
        const failed = await translateWithProviderChain(entry.item, [], now);
        const safeFailure = { ...failed.translation, failure_code: "PROVIDER_UNAVAILABLE" as const, error: "翻译服务暂不可用，等待后续重试" };
        results.push(safeFailure);
        applyRetryDisposition(entry, results.length - 1);
        failureCounts.PROVIDER_UNAVAILABLE = (failureCounts.PROVIDER_UNAVAILABLE ?? 0) + 1;
      } finally {
        ticket.finish();
        inFlight -= 1;
        const ready = waiters;
        waiters = [];
        ready.forEach((resolve) => resolve());
      }
    }
  };
  await Promise.all(Array.from({ length: MAX_CONCURRENCY }, () => worker()));
  const writes = results.length ? writeOpportunityV2Translations(results, translationsPath, { guardAgainstPool: true, poolPath }) : { written_count: 0, skipped_stale_count: 0, preserved_success_count: 0 };
  const currentTranslations = readOpportunityV2Translations(translationsPath);
  const visibleWithChinese = targetSet.filter((target) => buildOpportunityV2Display(target.item, currentTranslations).translated).length;
  const budgetAfter = budget.summary();
  const translatedRecords = results.filter((entry) => entry.status === "translated").length;
  const failedRecords = results.filter((entry) => entry.status === "failed").length;
  return { ...common, status: "COMPLETED", actual_requests: budgetAfter.actual_requests, attempted_records: attemptedRecords, translated_records: translatedRecords, failed_records: failedRecords, failure_counts: failureCounts, p0_title_repair_attempted: p0TitleRepairAttempted, p0_title_repair_succeeded: p0TitleRepairSucceeded, p0_title_repair_failed: p0TitleRepairFailed, quality_rejection_clusters: qualityRejectionClusters, write_result: writes, budget_after: budgetAfter, visible_with_chinese: visibleWithChinese, unattempted_selected: Math.max(0, queue.selected.length - attemptedRecords) };
}
