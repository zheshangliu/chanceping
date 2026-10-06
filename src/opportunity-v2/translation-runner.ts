import { buildOpportunityV2Display, readOpportunityV2Translations, resolveOpportunityV2TranslationPath, writeOpportunityV2Translations, type OpportunityV2Translation } from "./display";
import { readOpportunityV2Pool, resolveOpportunityV2PoolPath } from "./opportunity-pool";
import { readOpportunityV2Sources, resolveOpportunityV2SourcesPath } from "./source-pool";
import { collectOpportunityV2TranslationTargets } from "./translation-targets";
import { translateWithProviderChain } from "./translation-provider";
import { TranslationRequestBudget } from "./translation-budget";
import { selectOpportunityV2TranslationQueue } from "./translation-queue";
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
  const deepseek = configuredTranslationProviders(process.env).providers.find((provider) => provider.id === "deepseek");
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
  if (options.execute === false) return { ...common, status: "DRY_RUN_ONLY", actual_requests: 0, attempted_records: 0, translated_records: 0, failed_records: 0, failure_counts: {}, write_result: { written_count: 0, skipped_stale_count: 0, preserved_success_count: 0 }, budget_after: budget.summary(), visible_with_chinese: 0, unattempted_selected: queue.selected.length };
  if (!deepseek) return { ...common, status: "ACCESS_BLOCKED", actual_requests: 0, attempted_records: 0, translated_records: 0, failed_records: 0, failure_counts: { CREDENTIAL_NOT_CONFIGURED: queue.selected.length }, write_result: { written_count: 0, skipped_stale_count: 0, preserved_success_count: 0 }, budget_after: budget.summary(), visible_with_chinese: 0, unattempted_selected: queue.selected.length };

  const results: OpportunityV2Translation[] = [];
  const failureCounts: Record<string, number> = {};
  let cursor = 0;
  let inFlight = 0;
  let attemptedRecords = 0;
  let waiters: Array<() => void> = [];
  const worker = async (): Promise<void> => {
    while (true) {
      const ticket = budget.reserve(2);
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
        const result = await translateWithProviderChain(entry.item, [deepseek], now, {
          includeSummary: isOpportunityV2PublicSummaryAllowed(entry.item.source_id),
          onRequestStart: () => ticket.requestStarted(),
        });
        const safeTranslation = result.translation.status === "failed"
          ? { ...result.translation, error: "翻译未通过，已按失败状态冷却并等待后续重试" }
          : result.translation;
        results.push(safeTranslation);
        if (safeTranslation.status === "failed") {
          const reason = safeTranslation.failure_code ?? "UNKNOWN";
          failureCounts[reason] = (failureCounts[reason] ?? 0) + 1;
        }
      } catch {
        const failed = await translateWithProviderChain(entry.item, [], now);
        const safeFailure = { ...failed.translation, failure_code: "PROVIDER_UNAVAILABLE" as const, error: "翻译服务暂不可用，等待后续重试" };
        results.push(safeFailure);
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
  return { ...common, status: "COMPLETED", actual_requests: budgetAfter.actual_requests, attempted_records: attemptedRecords, translated_records: translatedRecords, failed_records: failedRecords, failure_counts: failureCounts, write_result: writes, budget_after: budgetAfter, visible_with_chinese: visibleWithChinese, unattempted_selected: Math.max(0, queue.selected.length - attemptedRecords) };
}
