import { loadLocalApiEnv } from "../src/config/local-env";
import { runIchProductionCycle } from "../src/opportunity-v2/production-cycle";

async function main(): Promise<void> {
  // Production credentials arrive through the existing systemd EnvironmentFile.
  // Local api.env loading remains an explicit non-production developer option.
  if (process.env.NODE_ENV !== "production" && process.env.CHANCEPING_LOAD_API_ENV === "true") {
    loadLocalApiEnv({ enabled: true, allowInProduction: false });
  }
  const result = await runIchProductionCycle();
  console.log(JSON.stringify({
    run_id: result.run_id,
    status: result.status,
    production_commit: result.production_commit,
    fetch: result.fetch,
    translation: result.translation,
    audit: result.audit,
    next_run_at: result.next_run_at,
    freshness: result.freshness,
    failure_code: result.failure_code,
  }, null, 2));
  if (result.status !== "COMPLETED" && result.status !== "COMPLETED_WITH_BACKLOG") process.exitCode = 1;
}

main().catch(() => {
  // Exception text can contain request/provider data. Leave diagnostics in the
  // private run manifest using a stable failure code; never print raw errors.
  console.error("Protected ICH production cycle failed before a completed manifest was returned.");
  process.exitCode = 1;
});
