/** Business Radar collection is intentionally bounded to one refresh every three days. */
export const BUSINESS_REFRESH_INTERVAL_DAYS = 3;
export const BUSINESS_REFRESH_INTERVAL_MS = BUSINESS_REFRESH_INTERVAL_DAYS * 24 * 60 * 60 * 1000;

export function isBusinessRefreshDue(lastRunAt: string | undefined, now = new Date()): boolean {
  if (!lastRunAt) return true;
  const timestamp = Date.parse(lastRunAt);
  return Number.isNaN(timestamp) || now.getTime() - timestamp >= BUSINESS_REFRESH_INTERVAL_MS;
}
