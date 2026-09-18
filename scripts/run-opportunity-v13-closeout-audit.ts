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
import { atomicWriteJson } from "../src/opportunity-v2/file-lock";

function readJson<T>(filePath: string, fallback: T): T {
  try { return JSON.parse(fs.readFileSync(filePath, "utf8")) as T; } catch { return fallback; }
}

function main(): void {
  const output = path.resolve(process.env.CHANCEPING_ICH_CLOSEOUT_AUDIT_DIR ?? "audits/ich/v13-closeout/latest");
  fs.mkdirSync(output, { recursive: true });
  const now = new Date();
  const pool = readOpportunityV2Pool(process.env.CHANCEPING_OPPORTUNITY_V2_POOL_PATH);
  const sources = readOpportunityV2Sources(process.env.CHANCEPING_OPPORTUNITY_V2_SOURCES_PATH);
  const translations = readOpportunityV2Translations(process.env.CHANCEPING_OPPORTUNITY_V2_TRANSLATION_PATH);
  const targets = collectOpportunityV2TranslationTargets(pool.opportunities, sources, now);
  const translationById = new Map(translations.map((entry) => [entry.opportunity_id, entry]));
  const surfaces = [...new Set(targets.flatMap((target) => target.surfaces))].sort();
  const coverage = surfaces.map((surface) => {
    const members = targets.filter((target) => target.surfaces.includes(surface as never));
    const foreign = members.filter((target) => isForeignLanguageOpportunity(target.item));
    const translated = foreign.filter((target) => {
      const entry = findCurrentOpportunityV2Translation(target.item, translations);
      return Boolean(entry && isReusableOpportunityV2Translation(target.item, entry));
    });
    const failed = foreign.filter((target) => translationById.get(target.item.id)?.status === "failed");
    const pending = foreign.filter((target) => !translationById.has(target.item.id) || translationById.get(target.item.id)?.status === "pending");
    return {
      surface,
      unique_total: members.length,
      needs_translation_title: foreign.length,
      qualified_translated_title: translated.length,
      original_language: members.length - foreign.length,
      failed: failed.length,
      pending: pending.length,
      uncovered: foreign.length - translated.length,
      ids: members.map((target) => target.item.id),
    };
  });
  const failedEntries = translations.filter((entry) => entry.status === "failed").map((entry) => ({
    opportunity_id: entry.opportunity_id,
    failure_code: entry.failure_code ?? "UNKNOWN",
    validation_errors: entry.validation_errors ?? [],
    error: entry.error ?? null,
    attempt_count: entry.attempt_count ?? 0,
    next_retry_at: entry.next_retry_at ?? null,
  }));
  const runPath = process.env.CHANCEPING_TRANSLATION_RUN_JSON;
  const run = runPath ? readJson<Record<string, unknown>>(path.resolve(runPath), {}) : {};
  atomicWriteJson(path.join(output, "before-coverage.json"), {
    generated_at: now.toISOString(),
    pool: pool.opportunities.length,
    sources: sources.length,
    enabled_sources: sources.filter((source) => source.enabled).length,
    targets: targets.length,
    surfaces: coverage.map(({ ids: _ids, ...summary }) => summary),
  });
  atomicWriteJson(path.join(output, "visible-universe.json"), {
    generated_at: now.toISOString(),
    total: targets.length,
    surfaces: coverage,
  });
  atomicWriteJson(path.join(output, "failure-dispositions.json"), {
    generated_at: now.toISOString(),
    current_failed_count: failedEntries.length,
    current_failed: failedEntries,
    historical_failure_set: "HISTORICAL_FAILURE_SET_UNRECOVERABLE unless separately supplied",
  });
  atomicWriteJson(path.join(output, "queue-progress.json"), {
    generated_at: now.toISOString(),
    run,
    total_visible_union: targets.length,
    foreign_title_total: targets.filter((target) => isForeignLanguageOpportunity(target.item)).length,
    current_with_chinese_title: targets.filter((target) => buildOpportunityV2Display(target.item, translations).translated).length,
    cache_entries: translations.length,
    failed_entries: failedEntries.length,
  });
  const screenshotFile = path.resolve(process.env.CHANCEPING_V13_SCREENSHOT_FIXTURES ?? "fixtures/screenshot_items.json");
  const screenshot = readJson<{ items?: Array<{ label: string; title_observed: string; source_observed?: string; summary_observed?: string }> }>(screenshotFile, {});
  const screenshotTrace = (screenshot.items ?? []).map((observed) => {
    const sourceNeedle = (observed.source_observed ?? "").toLowerCase().split(/\s+/u).filter((word) => word.length > 3).slice(0, 2);
    const titleNeedle = observed.title_observed.toLowerCase().split(/\s+|[–—|:：]/u).filter((word) => word.length > 3).slice(0, 3);
    const matches = pool.opportunities.filter((item) => {
      const haystack = `${item.title} ${item.source_name}`.toLowerCase();
      return titleNeedle.some((word) => haystack.includes(word)) && (sourceNeedle.length === 0 || sourceNeedle.some((word) => haystack.includes(word)));
    }).map((item) => ({ id: item.id, title: item.title, source_name: item.source_name, display: buildOpportunityV2Display(item, translations) }));
    return { observed, match_status: matches.length === 1 ? "resolved" : matches.length > 1 ? "ambiguous" : "unresolved", matches };
  });
  atomicWriteJson(path.join(output, "screenshot-trace.json"), { generated_at: now.toISOString(), items: screenshotTrace });
  console.log(JSON.stringify({ output, pool: pool.opportunities.length, sources: sources.length, targets: targets.length, surfaces: coverage.map(({ ids: _ids, ...summary }) => summary), failed: failedEntries.length }, null, 2));
}

main();
