import { OPPORTUNITY_V2_DISPLAY_STRATEGY, buildOpportunityV2Display, createOpportunityV2Translation, isForeignLanguageOpportunity, readOpportunityV2Pool, readOpportunityV2Translations, writeOpportunityV2Translations } from "../src/opportunity-v2";

const pool = readOpportunityV2Pool();
const previous = new Map(readOpportunityV2Translations().map((entry) => [entry.opportunity_id, entry]));
const now = new Date();
let translated = 0;
let reused = 0;
let pending = 0;
const translations = pool.opportunities.flatMap((item) => {
  if (!isForeignLanguageOpportunity(item)) return [];
  const existing = previous.get(item.id);
  if (existing && existing.source_hash === createOpportunityV2Translation(item, now).source_hash && existing.strategy_version === OPPORTUNITY_V2_DISPLAY_STRATEGY) {
    reused += 1;
    return [existing];
  }
  const entry = createOpportunityV2Translation(item, now);
  if (entry.title_zh && entry.summary_zh) translated += 1;
  else pending += 1;
  return [entry];
});
writeOpportunityV2Translations(translations);
const current = pool.opportunities.filter((item) => item.status !== "EXPIRED" && isForeignLanguageOpportunity(item));
const visibleWithChinese = current.filter((item) => buildOpportunityV2Display(item, translations).translated).length;
console.log(JSON.stringify({
  pool: pool.opportunities.length,
  foreign_records: translations.length,
  current_foreign_records: current.length,
  translated,
  reused,
  pending,
  failed: 0,
  current_with_chinese_display: visibleWithChinese,
}, null, 2));
