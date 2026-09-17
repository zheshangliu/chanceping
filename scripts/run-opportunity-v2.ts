import fs from "node:fs";
import path from "node:path";
import { opportunityV2NextRunAt, runOpportunityV2 } from "../src/opportunity-v2";

async function main(): Promise<void> {
  const nowRaw = process.argv.includes("--now") ? process.argv[process.argv.indexOf("--now") + 1] : undefined;
  const now = nowRaw ? new Date(nowRaw) : new Date();
  if (Number.isNaN(now.getTime())) throw new Error(`Invalid --now value: ${nowRaw}`);
  const result = await runOpportunityV2({ now });
  const schedulePath = path.resolve(process.env.CHANCEPING_OPPORTUNITY_V2_SCHEDULE_PATH ?? "data/opportunity-v2/scheduler.json");
  fs.mkdirSync(path.dirname(schedulePath), { recursive: true });
  fs.writeFileSync(schedulePath, `${JSON.stringify({ schema_version: "chanceping-opportunity-v2.scheduler.v1", timezone: "Asia/Shanghai", interval_hours: 72, last_run_at: result.finished_at, next_run_at: opportunityV2NextRunAt(result.finished_at, now) }, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ run_id: result.run_id, fetched_sources: result.fetched_sources, successful_sources: result.successful_sources, raw_items: result.raw_items, pool_items: result.pool_items, radar_items: result.radar_items, next_run_at: opportunityV2NextRunAt(result.finished_at, now) }, null, 2));
}

void main();
