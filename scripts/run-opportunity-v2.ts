import fs from "node:fs";
import path from "node:path";
import { opportunityV2NextRunAt, resolveOpportunityV2SchedulerPath, runOpportunityV2 } from "../src/opportunity-v2";
import { atomicWriteJson } from "../src/opportunity-v2/file-lock";

async function main(): Promise<void> {
  const nowRaw = process.argv.includes("--now") ? process.argv[process.argv.indexOf("--now") + 1] : undefined;
  const now = nowRaw ? new Date(nowRaw) : new Date();
  if (Number.isNaN(now.getTime())) throw new Error(`Invalid --now value: ${nowRaw}`);
  const result = await runOpportunityV2({ now });
  const schedulePath = resolveOpportunityV2SchedulerPath();
  fs.mkdirSync(path.dirname(schedulePath), { recursive: true });
  const nextRunAt = opportunityV2NextRunAt(result.started_at, now);
  atomicWriteJson(schedulePath, { schema_version: "chanceping-opportunity-v2.scheduler.v1", timezone: "Asia/Shanghai", interval_hours: 72, last_run_at: result.finished_at, last_run_started_at: result.started_at, next_run_basis: "systemd_service_activation", next_run_at: nextRunAt });
  console.log(JSON.stringify({ run_id: result.run_id, fetched_sources: result.fetched_sources, successful_sources: result.successful_sources, raw_items: result.raw_items, pool_items: result.pool_items, radar_items: result.radar_items, next_run_at: nextRunAt }, null, 2));
}

void main();
