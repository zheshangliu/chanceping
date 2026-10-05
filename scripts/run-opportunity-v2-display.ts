import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { loadLocalApiEnv } from "../src/config/local-env";
import {
  buildOpportunityV2Display,
  collectOpportunityV2TranslationTargets,
  readOpportunityV2Pool,
  readOpportunityV2Sources,
  readOpportunityV2Translations,
  resolveOpportunityV2PoolPath,
  resolveOpportunityV2SourcesPath,
  resolveOpportunityV2TranslationPath,
  translateWithProviderChain,
  writeOpportunityV2Translations,
  type OpportunityV2Translation,
} from "../src/opportunity-v2";
import { TranslationRequestBudget } from "../src/opportunity-v2/translation-budget";
import { selectOpportunityV2TranslationQueue } from "../src/opportunity-v2/translation-queue";
import { configuredTranslationProviders } from "../src/opportunity-v2/translation-provider";

const MAX_ITEMS = 200;
const MAX_REQUESTS = 250;
const MAX_CONCURRENCY = 2;

function cappedPositiveInteger(value: string | undefined, fallback: number, ceiling: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, ceiling) : fallback;
}

function sha256(filePath: string): string | null {
  try { return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex"); }
  catch { return null; }
}

function writeReport(report: Record<string, unknown>): void {
  const target = path.resolve(process.env.CHANCEPING_V14_TRANSLATION_RUN_PATH ?? "audits/ich/v14/latest/translation-run.json");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ report_path: target, ...report }, null, 2));
}

async function main(): Promise<void> {
  const execute = process.argv.includes("--execute");
  const dryRun = !execute || process.argv.includes("--dry-run");
  const allSurfaces = process.argv.includes("--all");
  const now = new Date();

  // Loading a local secret file is opt-in and never turns on the live-LLM gate.
  const localEnv = execute && process.env.CHANCEPING_LOAD_API_ENV === "true"
    ? loadLocalApiEnv({ enabled: true })
    : { loaded: false, reason: "disabled" as const };

  const poolPath = resolveOpportunityV2PoolPath();
  const sourcesPath = resolveOpportunityV2SourcesPath();
  const translationsPath = resolveOpportunityV2TranslationPath();
  const pool = readOpportunityV2Pool(poolPath);
  const sources = readOpportunityV2Sources(sourcesPath);
  const targets = collectOpportunityV2TranslationTargets(pool.opportunities, sources, now);
  const targetSet = allSurfaces
    ? targets
    : targets.filter((target) => target.surfaces.some((surface) => ["main", "memo", "procurement", "overseas"].includes(surface)));
  const previous = readOpportunityV2Translations(translationsPath);
  const maxItems = cappedPositiveInteger(process.env.CHANCEPING_TRANSLATION_MAX_ITEMS, MAX_ITEMS, MAX_ITEMS);
  const maxRequests = cappedPositiveInteger(process.env.CHANCEPING_TRANSLATION_MAX_REQUESTS, MAX_REQUESTS, MAX_REQUESTS);
  const queue = selectOpportunityV2TranslationQueue(targetSet, previous, {
    now,
    recoveryMode: process.env.CHANCEPING_TRANSLATION_RECOVERY === "targeted" ? "targeted" : "all",
    maxItems,
  });
  const providerConfig = configuredTranslationProviders(process.env);
  const deepseek = providerConfig.providers.find((provider) => provider.id === "deepseek");
  const budget = new TranslationRequestBudget(maxRequests);

  const common = {
    schema_version: "chanceping-ich-v14-translation-run.v1",
    created_at: now.toISOString(),
    mode: dryRun ? "dry_run" : "execute",
    scope: allSurfaces ? "all_public_surfaces" : "primary_visible_surfaces",
    runtime_paths: { pool: poolPath, sources: sourcesPath, translations: translationsPath },
    input_sha256: { pool: sha256(poolPath), sources: sha256(sourcesPath), translations: sha256(translationsPath) },
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
    limits: { max_unique_items: maxItems, max_requests: maxRequests, max_attempts_per_item: 2, concurrency: MAX_CONCURRENCY, timeout_ms: 30_000 },
    provider: "deepseek",
    provider_configured: Boolean(deepseek),
    provider_gate: providerConfig.status,
    local_env_loaded: localEnv.loaded,
    local_env_load_reason: localEnv.reason,
    budget_before: budget.summary(),
    token_usage: { available: false, reason: "current provider adapter does not expose token usage" },
    cost: { available: false, reason: "current provider adapter does not expose billed cost" },
  };

  if (dryRun) {
    writeReport({ ...common, status: "DRY_RUN_ONLY", actual_requests: 0, attempted_records: 0, written_count: 0, failure_counts: {}, output_sha256: { translations: sha256(translationsPath) }, production_operations: "not performed" });
    return;
  }
  if (!deepseek) {
    writeReport({ ...common, status: "ACCESS_BLOCKED", blocker: "No authorized DeepSeek provider is active in the current runtime profile; no provider calls or translation writes were performed.", actual_requests: 0, attempted_records: 0, written_count: 0, failure_counts: {}, output_sha256: { translations: sha256(translationsPath) }, production_operations: "not performed" });
    return;
  }

  const results: OpportunityV2Translation[] = [];
  const failureCounts: Record<string, number> = {};
  const providerRecords: Record<string, number> = {};
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
        const result = await translateWithProviderChain(entry.item, [deepseek], now, { onRequestStart: () => ticket.requestStarted() });
        results.push(result.translation);
        if (result.translation.status === "failed") {
          const reason = result.translation.failure_code ?? "UNKNOWN";
          failureCounts[reason] = (failureCounts[reason] ?? 0) + 1;
        }
        if (result.provider_id) providerRecords[result.provider_id] = (providerRecords[result.provider_id] ?? 0) + 1;
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

  const writes = results.length
    ? writeOpportunityV2Translations(results, translationsPath, { guardAgainstPool: true, poolPath })
    : { written_count: 0, skipped_stale_count: 0, preserved_success_count: 0 };
  const currentTranslations = readOpportunityV2Translations(translationsPath);
  const visibleChinese = targetSet.filter((target) => buildOpportunityV2Display(target.item, currentTranslations).translated).length;
  const summary = budget.summary();
  writeReport({
    ...common,
    status: "COMPLETED_LOCAL_OR_AUTHORIZED_RUNTIME",
    actual_requests: summary.actual_requests,
    budget_after: summary,
    attempted_records: attemptedRecords,
    translated_records: results.filter((entry) => entry.status === "translated").length,
    failure_counts: failureCounts,
    provider_records: providerRecords,
    write_result: writes,
    visible_with_chinese: visibleChinese,
    unattempted_selected: Math.max(0, queue.selected.length - attemptedRecords),
    output_sha256: { translations: sha256(translationsPath) },
    production_operations: "not inferred; identify exact runtime paths and execution environment",
  });
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
