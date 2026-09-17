import { loadLocalApiEnv } from "../src/config/local-env";
import {
  buildOpportunityV2Display,
  filterOpportunityV2Radar,
  isForeignLanguageOpportunity,
  opportunityV2SourceHash,
  readOpportunityV2Pool,
  readOpportunityV2Sources,
  readOpportunityV2Translations,
  translateWithProviderChain,
  writeOpportunityV2Translations,
  OPPORTUNITY_V2_DISPLAY_STRATEGY,
  type OpportunityV2,
  type OpportunityV2Translation,
} from "../src/opportunity-v2";
import { configuredTranslationProviders } from "../src/opportunity-v2/translation-provider";

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

async function main(): Promise<void> {
  loadLocalApiEnv({ enabled: true });
  const now = new Date();
  const all = process.argv.includes("--all");
  const pool = readOpportunityV2Pool();
  const sources = readOpportunityV2Sources();
  const currentIds = new Set(filterOpportunityV2Radar(pool.opportunities, sources, { now }).map((item) => item.id));
  const foreign = pool.opportunities.filter(isForeignLanguageOpportunity);
  const candidates = all ? foreign : foreign.filter((item) => currentIds.has(item.id));
  const candidateIds = new Set(candidates.map((item) => item.id));
  const previous = new Map(readOpportunityV2Translations().map((entry) => [entry.opportunity_id, entry]));
  const providerConfig = configuredTranslationProviders(process.env);
  let reused = 0;
  const pending: OpportunityV2[] = [];
  const retained: OpportunityV2Translation[] = [];
  for (const entry of previous.values()) if (!candidateIds.has(entry.opportunity_id)) retained.push(entry);
  for (const item of candidates) {
    const existing = previous.get(item.id);
    if (existing?.source_hash === opportunityV2SourceHash(item) && existing.strategy_version === OPPORTUNITY_V2_DISPLAY_STRATEGY && existing.status === "translated" && existing.title_zh && existing.summary_zh) {
      retained.push(existing);
      reused += 1;
    } else pending.push(item);
  }
  const stats = { translated: 0, failed: 0, pending: 0, fallback_to_deepseek: 0, characters_sent_to_free_provider: 0, providers: {} as Record<string, number> };
  const processed = await mapWithConcurrency(pending, 3, async (item) => {
    const result = await translateWithProviderChain(item, providerConfig.providers, now);
    if (result.translation.status === "translated") stats.translated += 1;
    else if (result.translation.status === "failed") stats.failed += 1;
    else stats.pending += 1;
    if (result.provider_id) stats.providers[result.provider_id] = (stats.providers[result.provider_id] ?? 0) + 1;
    if (result.fallback_to_deepseek) stats.fallback_to_deepseek += 1;
    stats.characters_sent_to_free_provider += result.characters_sent_to_free_provider;
    return result.translation;
  });
  const translations = [...retained, ...processed].sort((a, b) => a.opportunity_id.localeCompare(b.opportunity_id));
  writeOpportunityV2Translations(translations);
  const currentStatus = candidates.map((item) => translations.find((entry) => entry.opportunity_id === item.id)?.status ?? "pending");
  const counts = (values: string[]) => values.reduce((out, value) => { out[value] = (out[value] ?? 0) + 1; return out; }, {} as Record<string, number>);
  const currentDisplay = candidates.filter((item) => buildOpportunityV2Display(item, translations).translated).length;
  console.log(JSON.stringify({
    mode: all ? "all" : "current",
    pool: pool.opportunities.length,
    sources: sources.length,
    foreign_records: foreign.length,
    current_foreign_records: foreign.filter((item) => currentIds.has(item.id)).length,
    candidates: candidates.length,
    translated: stats.translated + reused,
    reused,
    pending: stats.pending,
    failed: stats.failed,
    fallback_to_deepseek: stats.fallback_to_deepseek,
    characters_sent_to_free_provider: stats.characters_sent_to_free_provider,
    provider_used: stats.providers,
    current_status: counts(currentStatus),
    current_with_chinese_display: currentDisplay,
    live_status: providerConfig.status,
    configured_free_providers: providerConfig.configuredFreeProviders,
  }, null, 2));
}

void main();
