import fs from "node:fs";
import path from "node:path";
import {
  buildOpportunityV2Display,
  collectOpportunityV2TranslationTargets,
  findCurrentOpportunityV2Translation,
  isForeignLanguageOpportunity,
  isReusableOpportunityV2Translation,
  readOpportunityV2Pool,
  readOpportunityV2Sources,
  readOpportunityV2Translations,
  type OpportunityV2Translation,
} from "../src/opportunity-v2";

const outputDir = path.resolve(process.env.CHANCEPING_V13_AUDIT_DIR ?? "audits/ich/v13-artconnect/latest");
const now = new Date();
const pool = readOpportunityV2Pool();
const sources = readOpportunityV2Sources();
const translations = readOpportunityV2Translations();
const byTranslationId = new Map(translations.map((entry) => [entry.opportunity_id, entry]));
const targets = collectOpportunityV2TranslationTargets(pool.opportunities, sources, now);
const foreign = targets.filter((target) => isForeignLanguageOpportunity(target.item));
const qualified = foreign.filter((target) => buildOpportunityV2Display(target.item, translations).translated);
const healthPath = path.resolve(process.env.CHANCEPING_OPPORTUNITY_V2_HEALTH_PATH ?? (fs.existsSync("/var/lib/chanceping/opportunity-v2") ? "/var/lib/chanceping/opportunity-v2/source-health.json" : "data/opportunity-v2/source-health.json"));
let healthRows: Array<Record<string, unknown>> = [];
try { healthRows = (JSON.parse(fs.readFileSync(healthPath, "utf8")) as { sources?: Array<Record<string, unknown>> }).sources ?? []; } catch { /* audit records unavailable health as unknown */ }
const artconnectSource = sources.find((source) => source.id === "artconnect-opportunities");
const artconnectHealth = healthRows.find((row) => row.source_id === "artconnect-opportunities") ?? null;
const artconnectItems = pool.opportunities.filter((item) => item.source_id === "artconnect-opportunities" || item.discovered_by_sources?.includes("artconnect-opportunities"));
const currentArtconnectItems = artconnectItems.filter((item) => item.status !== "EXPIRED");

function failureCategory(entry: OpportunityV2Translation | undefined): string {
  if (!entry) return "UNATTEMPTED";
  if (entry.status === "translated") return "TRANSLATED";
  if (/\bqwen\b/iu.test(entry.error ?? "") || ((entry.attempt_count ?? 0) === 0 && entry.failure_code === "UNKNOWN")) return "HISTORICAL_OR_UNREPRODUCIBLE";
  if (entry.failure_code === "PROVIDER_UNAVAILABLE" || entry.failure_code === "TIMEOUT") return "PROVIDER_TRANSIENT";
  if (entry.failure_code === "QUALITY_REJECTED" && (entry.validation_errors ?? []).some((error) => error.includes("long non-proper English residue"))) return "VALIDATOR_FALSE_REJECT_CANDIDATE";
  if (entry.failure_code === "QUALITY_REJECTED") return "TRANSLATION_WRONG_OR_INCOMPLETE";
  return "HISTORICAL_OR_UNREPRODUCIBLE";
}

function disposition(entry: OpportunityV2Translation | undefined): string {
  if (!entry) return "needs_bounded_attempt";
  if (entry.status === "translated" && isReusableOpportunityV2Translation({ id: entry.opportunity_id, title: "", summary: "" }, entry as never)) return "reused_success";
  if (failureCategory(entry) === "HISTORICAL_OR_UNREPRODUCIBLE") return "preserve_as_historical_evidence";
  return "targeted_recovery_candidate";
}

const currentFailed = foreign.flatMap((target) => {
  const entry = findCurrentOpportunityV2Translation(target.item, translations);
  if (!entry || entry.status !== "failed") return [];
  return [{
    opportunity_id: target.item.id,
    title: target.item.title,
    source_id: target.item.source_id,
    source_hash: entry.source_hash,
    provider: entry.provider ?? null,
    failure_code: entry.failure_code ?? "UNKNOWN",
    validation_errors: entry.validation_errors ?? [],
    attempt_count: entry.attempt_count ?? 0,
    error: entry.error ?? null,
    surfaces: target.surfaces,
    category: failureCategory(entry),
    disposition: disposition(entry),
  }];
});

const counts = currentFailed.reduce((out, row) => {
  out[row.category] = (out[row.category] ?? 0) + 1;
  return out;
}, {} as Record<string, number>);

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, "baseline.json"), JSON.stringify({
  generated_at: now.toISOString(),
  source_count: sources.length,
  enabled_source_count: sources.filter((source) => source.enabled).length,
  pool_count: pool.opportunities.length,
  visible_union: targets.length,
  foreign_title_count: foreign.length,
  qualified_chinese_title_count: qualified.length,
  failed_current: currentFailed.length,
  failure_counts: counts,
  translation_cache_entries: translations.length,
  source_pool_updated_at: pool.updated_at,
}, null, 2));
fs.writeFileSync(path.join(outputDir, "translation-failure-inventory.json"), JSON.stringify({
  generated_at: now.toISOString(),
  current_failed_count: currentFailed.length,
  historical_rows_not_added_to_current_count: translations.filter((entry) => entry.status === "failed" && !currentFailed.some((row) => row.opportunity_id === entry.opportunity_id)).length,
  failures: currentFailed,
}, null, 2));
fs.writeFileSync(path.join(outputDir, "artconnect-before.json"), JSON.stringify({
  generated_at: now.toISOString(),
  source_id: "artconnect-opportunities",
  source: artconnectSource ?? null,
  health: artconnectHealth,
  pool_items: artconnectItems.length,
  current_visible_items: currentArtconnectItems.length,
  next_page: artconnectHealth?.next_page ?? null,
  partial: artconnectHealth?.partial ?? null,
  canonical_records: artconnectHealth?.canonical_records ?? null,
  merged_duplicates: artconnectHealth?.merged_duplicates ?? null,
  deadline_attempted: artconnectHealth?.deadline_attempted ?? null,
  deadline_resolved: artconnectHealth?.deadline_resolved ?? null,
  authorization: {
    status: "NOT_VERIFIED_FOR_AUTOMATED_REUSE",
    reason: "ArtConnect terms require prior written permission for automated access, systematic retrieval, reproduction or redistribution.",
    terms_url: "https://www.magazine.artconnect.com/terms",
    application_help_url: "https://artconnect.zendesk.com/hc/en-us/articles/4404179240338-How-do-I-apply-for-opportunities-on-ArtConnect",
  },
  official_route: "Keep ArtConnect as discovery evidence and direct users to the original opportunity/apply link; do not expand pagination or bulk copy until written permission/API scope is supplied.",
}, null, 2));
console.log(JSON.stringify({
  output_dir: outputDir,
  source_count: sources.length,
  pool_count: pool.opportunities.length,
  visible_union: targets.length,
  foreign_title_count: foreign.length,
  qualified_chinese_title_count: qualified.length,
  current_failed_count: currentFailed.length,
  failure_counts: counts,
  artconnect: { pool_items: artconnectItems.length, current_visible_items: currentArtconnectItems.length, health: artconnectHealth },
}, null, 2));
