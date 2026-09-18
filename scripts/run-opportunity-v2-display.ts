import { loadLocalApiEnv } from "../src/config/local-env";
import {
  buildOpportunityV2Display,
  collectOpportunityV2TranslationTargets,
  findCurrentOpportunityV2Translation,
  isOpportunityV2TranslationRetryCooling,
  isForeignLanguageOpportunity,
  isReusableOpportunityV2Translation,
  readOpportunityV2Pool,
  readOpportunityV2Sources,
  readOpportunityV2Translations,
  translateWithProviderChain,
  writeOpportunityV2Translations,
  type OpportunityV2,
  type OpportunityV2Translation,
} from "../src/opportunity-v2";
import { configuredTranslationProviders } from "../src/opportunity-v2/translation-provider";

interface QueueEntry { item: OpportunityV2; priority: number; surfaces: string[]; existing?: OpportunityV2Translation; }

function mapWithConcurrency<T, R>(items: T[], workerCount: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const result: R[] = [];
  let cursor = 0;
  async function run(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor++;
      result[index] = await worker(items[index]);
    }
  }
  return Promise.all(Array.from({ length: Math.min(workerCount, items.length || 1) }, () => run())).then(() => result);
}

function numberEnv(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

async function main(): Promise<void> {
  loadLocalApiEnv({ enabled: true });
  const now = new Date();
  const all = process.argv.includes("--all");
  const pool = readOpportunityV2Pool();
  const sources = readOpportunityV2Sources();
  const targets = collectOpportunityV2TranslationTargets(pool.opportunities, sources, now);
  const selectedTargets = all
    ? targets
    : targets.filter((target) => target.surfaces.some((surface) => ["main", "memo", "procurement", "overseas"].includes(surface)));
  const previous = new Map(readOpportunityV2Translations().map((entry) => [entry.opportunity_id, entry]));
  const allPrevious = [...previous.values()];
  const providerConfig = configuredTranslationProviders(process.env);
  const foreign = selectedTargets.filter((target) => isForeignLanguageOpportunity(target.item));
  const pending: QueueEntry[] = [];
  let reused = 0;
  let cooling = 0;
  for (const target of foreign) {
    const existing = findCurrentOpportunityV2Translation(target.item, allPrevious);
    if (existing && isReusableOpportunityV2Translation(target.item, existing)) {
      reused += 1;
      continue;
    }
    if (existing && isOpportunityV2TranslationRetryCooling(existing, now)) {
      cooling += 1;
      continue;
    }
    pending.push({ item: target.item, priority: target.priority, surfaces: target.surfaces, existing });
  }
  pending.sort((a, b) => a.priority - b.priority || a.item.first_seen_at.localeCompare(b.item.first_seen_at) || a.item.id.localeCompare(b.item.id));

  const maxItems = numberEnv("CHANCEPING_TRANSLATION_MAX_ITEMS", 200);
  const maxRequests = numberEnv("CHANCEPING_TRANSLATION_MAX_REQUESTS", 250);
  let reservedRequests = 0;
  let translated = 0;
  let failed = 0;
  let pendingCount = 0;
  let attemptedRecords = 0;
  let actualRequests = 0;
  let fallbackToDeepSeek = 0;
  let charactersSentToFreeProvider = 0;
  const providers: Record<string, number> = {};
  const processed = await mapWithConcurrency(pending.slice(0, maxItems), 2, async (entry) => {
    if (reservedRequests >= maxRequests) return null;
    reservedRequests += 1;
    attemptedRecords += 1;
    const result = await translateWithProviderChain(entry.item, providerConfig.providers, now);
    actualRequests += result.request_count;
    reservedRequests += Math.max(0, result.request_count - 1);
    if (result.translation.status === "translated") translated += 1;
    else if (result.translation.status === "failed") failed += 1;
    else pendingCount += 1;
    if (result.provider_id) providers[result.provider_id] = (providers[result.provider_id] ?? 0) + 1;
    if (result.fallback_to_deepseek) fallbackToDeepSeek += 1;
    charactersSentToFreeProvider += result.characters_sent_to_free_provider;
    return result.translation;
  });
  const writes = processed.filter((entry): entry is OpportunityV2Translation => Boolean(entry));
  writeOpportunityV2Translations(writes);
  const allTranslations = readOpportunityV2Translations();
  const visibleWithChinese = foreign.filter((target) => buildOpportunityV2Display(target.item, allTranslations).translated).length;
  const unattempted = Math.max(0, foreign.length - reused - cooling - attemptedRecords);
  const currentStatus = foreign.reduce((out, target) => {
    const entry = findCurrentOpportunityV2Translation(target.item, allTranslations);
    const status = entry?.status ?? "pending";
    out[status] = (out[status] ?? 0) + 1;
    return out;
  }, {} as Record<string, number>);
  console.log(JSON.stringify({
    mode: all ? "all" : "current",
    pool: pool.opportunities.length,
    sources: sources.length,
    visible_union: selectedTargets.length,
    visible_surfaces: [...new Set(selectedTargets.flatMap((target) => target.surfaces))],
    foreign_records: foreign.length,
    candidates: foreign.length,
    translated: translated + reused,
    reused,
    attempted_records: attemptedRecords,
    actual_requests: actualRequests,
    pending: pendingCount,
    failed,
    cooling,
    unattempted,
    budget: { max_items: maxItems, max_requests: maxRequests, reserved_requests: reservedRequests },
    fallback_to_deepseek: fallbackToDeepSeek,
    characters_sent_to_free_provider: charactersSentToFreeProvider,
    provider_used: providers,
    current_status: currentStatus,
    current_with_chinese_display: visibleWithChinese,
    live_status: providerConfig.status,
    configured_free_providers: providerConfig.configuredFreeProviders,
  }, null, 2));
}

void main();
