import fs from "node:fs";
import path from "node:path";

export const OPPORTUNITY_V2_INTERVAL_HOURS = 72;

export function resolveOpportunityV2SchedulerPath(filePath?: string): string {
  const configured = filePath ?? process.env.CHANCEPING_OPPORTUNITY_V2_SCHEDULER_PATH ?? process.env.CHANCEPING_OPPORTUNITY_V2_SCHEDULE_PATH;
  if (configured) return path.resolve(configured);
  const runtimePath = "/var/lib/chanceping/opportunity-v2/scheduler.json";
  return path.resolve(fs.existsSync(path.dirname(runtimePath)) ? runtimePath : "data/opportunity-v2/scheduler.json");
}

export function opportunityV2ShouldRun(lastRunAt: string | null, now = new Date()): boolean {
  if (!lastRunAt) return true;
  const last = new Date(lastRunAt).getTime();
  return !Number.isFinite(last) || now.getTime() - last >= OPPORTUNITY_V2_INTERVAL_HOURS * 60 * 60 * 1000;
}

export function opportunityV2NextRunAt(lastRunAt: string | null, now = new Date()): string {
  const base = lastRunAt && Number.isFinite(new Date(lastRunAt).getTime()) ? new Date(lastRunAt) : now;
  return new Date(base.getTime() + OPPORTUNITY_V2_INTERVAL_HOURS * 60 * 60 * 1000).toISOString();
}
