export const OPPORTUNITY_V2_INTERVAL_HOURS = 72;

export function opportunityV2ShouldRun(lastRunAt: string | null, now = new Date()): boolean {
  if (!lastRunAt) return true;
  const last = new Date(lastRunAt).getTime();
  return !Number.isFinite(last) || now.getTime() - last >= OPPORTUNITY_V2_INTERVAL_HOURS * 60 * 60 * 1000;
}

export function opportunityV2NextRunAt(lastRunAt: string | null, now = new Date()): string {
  const base = lastRunAt && Number.isFinite(new Date(lastRunAt).getTime()) ? new Date(lastRunAt) : now;
  return new Date(base.getTime() + OPPORTUNITY_V2_INTERVAL_HOURS * 60 * 60 * 1000).toISOString();
}
