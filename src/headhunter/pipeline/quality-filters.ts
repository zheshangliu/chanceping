/** Shared quality filters for weekly reuse and API read-model hydration. */
export function isRecentSignal(eventDate: string | null | undefined, now: Date): boolean {
  if (!eventDate) return true;
  const parsed = Date.parse(eventDate);
  return Number.isNaN(parsed) || parsed >= now.getTime() - 60 * 86400000;
}

export function isGenericJobSourceUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    const aggregator = ["linkedin.com", "jobsdb.com", "indeed.com", "glassdoor.com", "michaelpage.com", "robertwalters.com.hk", "randstad.com.hk", "jobstreet.com", "jobs.gov.hk", "efinancialcareers.hk", "ambition.com.hk", "hongkongbusiness.hk"];
    return aggregator.some((domain) => host === domain || host.endsWith(`.${domain}`)) || (/\/jobs?(?:\/|$)/i.test(url) && host.includes("linkedin.com"));
  } catch { return true; }
}
