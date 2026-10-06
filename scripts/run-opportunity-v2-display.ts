import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { loadLocalApiEnv } from "../src/config/local-env";
import { resolveOpportunityV2PoolPath } from "../src/opportunity-v2/opportunity-pool";
import { resolveOpportunityV2SourcesPath } from "../src/opportunity-v2/source-pool";
import { resolveOpportunityV2TranslationPath } from "../src/opportunity-v2/display";
import { runOpportunityV2DisplayTranslation } from "../src/opportunity-v2/translation-runner";

function cappedPositiveInteger(value: string | undefined, fallback: number, ceiling: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, ceiling) : fallback;
}
function sha256(filePath: string): string | null {
  try { return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex"); }
  catch { return null; }
}

async function main(): Promise<void> {
  const execute = process.argv.includes("--execute");
  const dryRun = !execute || process.argv.includes("--dry-run");
  const allSurfaces = process.argv.includes("--all");
  const now = new Date();
  const localEnv = !dryRun && process.env.CHANCEPING_LOAD_API_ENV === "true"
    ? loadLocalApiEnv({ enabled: true, allowInProduction: false })
    : { loaded: false, reason: "disabled" as const };
  const poolPath = resolveOpportunityV2PoolPath();
  const sourcesPath = resolveOpportunityV2SourcesPath();
  const translationsPath = resolveOpportunityV2TranslationPath();
  const summary = await runOpportunityV2DisplayTranslation({
    now,
    execute: !dryRun,
    allSurfaces,
    poolPath,
    sourcesPath,
    translationPath: translationsPath,
    maxItems: cappedPositiveInteger(process.env.CHANCEPING_TRANSLATION_MAX_ITEMS, 200, 200),
    maxRequests: cappedPositiveInteger(process.env.CHANCEPING_TRANSLATION_MAX_REQUESTS, 250, 250),
  });
  const report = {
    schema_version: "chanceping-ich-v15-translation-run.v1",
    created_at: now.toISOString(),
    mode: dryRun ? "dry_run" : "execute",
    scope: allSurfaces ? "all_public_surfaces" : "primary_visible_surfaces",
    runtime_paths: { pool: poolPath, sources: sourcesPath, translations: translationsPath },
    input_sha256: { pool: sha256(poolPath), sources: sha256(sourcesPath), translations: sha256(translationsPath) },
    local_env_loaded: localEnv.loaded,
    local_env_load_reason: localEnv.reason,
    limits: { max_unique_items: 200, max_requests: 250, max_attempts_per_item: 2, concurrency: 2, timeout_ms: 30_000 },
    ...summary,
    output_sha256: { translations: sha256(translationsPath) },
    production_operations: "This CLI does not imply production; the protected cycle service owns production execution.",
  };
  const target = path.resolve(process.env.CHANCEPING_V15_TRANSLATION_RUN_PATH ?? "audits/ich/v15/latest/translation-run.json");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ report_path: target, ...report }, null, 2));
}

void main().catch(() => { console.error("Opportunity V2 translation run failed; see protected cycle manifest for a sanitized status."); process.exitCode = 1; });
