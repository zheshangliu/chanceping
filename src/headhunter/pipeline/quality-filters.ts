import type { Company } from "../model/company";
import type { SearchResult } from "../../search/types";
import { evaluateTriggerQuality, isGenericTriggerPage } from "./trigger-quality";

/** Shared quality filters for weekly reuse and API read-model hydration. */
export function isRecentSignal(eventDate: string | null | undefined, now: Date, title = "", sourceUrl = ""): boolean {
  // Persisted V1.2 signals may predate the stricter Trigger classifier. A
  // careers/history/service page must not be resurrected as a current event
  // merely because its stored event_date is null.
  if (isEvergreenReference(sourceUrl, title) || isGenericTriggerPage(sourceUrl, title)) return false;
  if (!eventDate) return true;
  const parsed = Date.parse(eventDate);
  return Number.isNaN(parsed) || parsed >= now.getTime() - 60 * 86400000;
}

export { isGenericTriggerPage } from "./trigger-quality";

/**
 * Date freshness is not enough to make a signal a current Trigger. Keep this
 * stricter predicate beside the legacy reuse helper so old persisted records
 * remain readable while newly-created signals must satisfy all relations.
 */
export function isValidRecentTrigger(result: SearchResult, company: Company, now: Date): boolean {
  return evaluateTriggerQuality(result, {
    now,
    target_company_name: company.canonical_name,
    target_company_aliases: [company.name_en, company.name_cn, ...company.aliases].filter((v): v is string => Boolean(v)),
    target_region: company.city ?? company.region ?? company.country,
    target_website: company.website,
  }).valid_for_a_gate;
}

export function isEvergreenReference(url: string | null | undefined, title = "", body = ""): boolean {
  return /\/(?:careers?|jobs?|current-vacancies|job-openings|students-graduates)(?:[/?#]|$)/i.test(url ?? "") || /\b(?:careers?|current\s+vacancies|job\s+openings?|students?\s*(?:and|&)\s*graduates?)\b|招聘入口|职位空缺/i.test(`${title} ${body}`);
}

export function isGenericJobSourceUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    const aggregator = ["linkedin.com", "jobsdb.com", "indeed.com", "glassdoor.com", "michaelpage.com", "robertwalters.com.hk", "randstad.com.hk", "jobstreet.com", "jobs.gov.hk", "efinancialcareers.hk", "ambition.com.hk", "hongkongbusiness.hk"];
    return aggregator.some((domain) => host === domain || host.endsWith(`.${domain}`)) || (/\/jobs?(?:\/|$)/i.test(url) && host.includes("linkedin.com"));
  } catch { return true; }
}
