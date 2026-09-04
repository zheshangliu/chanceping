import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { loadLocalApiEnv } from "../src/config/local-env";

async function main(): Promise<void> {
  const envFile = process.env.CHANCEPING_API_ENV_FILE ?? join(process.env.HOME ?? ".", "Projects/Codex/chanceping/api.env");
  loadLocalApiEnv({ enabled: process.env.CHANCEPING_LOAD_API_ENV === "true", envFile });
  const { runHeadHunterWeeklyPipeline } = await import("../src/headhunter/pipeline/weekly-pipeline");
  const result = await runHeadHunterWeeklyPipeline({
    weekKey: process.env.CHANCEPING_WEEK_KEY,
    radarRunId: process.env.CHANCEPING_RADAR_RUN_ID,
    maxThemes: Number(process.env.CHANCEPING_WEEKLY_MAX_THEMES ?? 18),
    maxCompanies: Number(process.env.CHANCEPING_WEEKLY_MAX_COMPANIES ?? 30),
    companyIds: process.env.CHANCEPING_WEEKLY_COMPANY_IDS?.split(",").map((value) => value.trim()).filter(Boolean),
    publish: process.env.CHANCEPING_WEEKLY_PUBLISH !== "false",
  });
  await mkdir(process.env.CHANCEPING_HEADHUNTER_DATA_DIR ?? "data/headhunter", { recursive: true });
  console.log(JSON.stringify({
    status: "success",
    run_id: result.run.radar_run_id,
    week_key: result.snapshot.week_key,
    funnel: result.stage_metrics,
    a_count: result.run.a_count,
    b_count: result.run.b_count,
    providers: result.run.provider_usage,
  }));
}

main().catch((error: unknown) => {
  console.error(JSON.stringify({ status: "failed", error: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
});
