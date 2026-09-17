import { extractAnchors, normalizeUrl } from "./adapters/common";
import type { AggregationItem, OfficialBacktraceStatus } from "./types";

export const AGGREGATOR_HOSTS = new Set([
  "shejijingsai.com", "www.shejijingsai.com", "chuangsaiyun.com", "www.chuangsaiyun.com",
  "xiacansai.com", "www.xiacansai.com", "contestwatchers.com", "www.contestwatchers.com",
  "artconnect.com", "www.artconnect.com", "competitions.archi", "www.competitions.archi",
  "craftscouncil.org.uk", "www.craftscouncil.org.uk",
]);

export function isAggregatorHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return [...AGGREGATOR_HOSTS].some((aggregator) => host === aggregator || host.endsWith(`.${aggregator}`));
}

export function findOfficialLinks(html: string, sourceUrl: string): string[] {
  const sourceHost = (() => { try { return new URL(sourceUrl).hostname; } catch { return ""; } })();
  const links = extractAnchors(html, sourceUrl).map((link) => link.href).filter((url) => {
    try {
      const host = new URL(url).hostname;
      return host !== sourceHost && !isAggregatorHost(host);
    } catch { return false; }
  });
  return [...new Set(links)].filter((url) => !/facebook|instagram|twitter|linkedin|youtube|mailto:/i.test(url));
}

export interface OfficialCandidateEvidence {
  url: string;
  title: string;
  organizer: string | null;
  deadline: string | null;
  action_signal: boolean;
  domain_owner_match: boolean;
  score: number;
  status: "OFFICIAL_FOUND" | "PENDING_REVIEW" | "MULTIPLE_CONFLICTING";
  evidence: string[];
}

/** Score a fetched external page; 80 is the hard official-found threshold. */
export function scoreOfficialCandidate(input: {
  url: string;
  pageTitle: string;
  pageText: string;
  itemTitle: string;
  organizer?: string | null;
  deadline?: string | null;
  sourceOwnerHost?: string | null;
}): OfficialCandidateEvidence {
  const host = (() => { try { return new URL(input.url).hostname.toLowerCase(); } catch { return ""; } })();
  const text = `${input.pageTitle} ${input.pageText}`;
  const titleMatch = input.itemTitle.length >= 8 && text.toLowerCase().includes(input.itemTitle.slice(0, 30).toLowerCase());
  const organizerMatch = Boolean(input.organizer && text.toLowerCase().includes(input.organizer.toLowerCase().slice(0, 24)));
  const deadlineMatch = Boolean(input.deadline && text.includes(input.deadline.slice(0, 10)));
  const actionSignal = /(apply|application|register|registration|submit|submission|open call|报名|申请|征集|招募|申报|截止|deadline)/iu.test(text);
  const ownerMatch = Boolean(input.sourceOwnerHost && (host === input.sourceOwnerHost || host.endsWith(`.${input.sourceOwnerHost}`)));
  const evidence: string[] = [];
  if (ownerMatch) evidence.push("source_owner_domain");
  if (titleMatch) evidence.push("title_match");
  if (organizerMatch) evidence.push("organizer_match");
  if (deadlineMatch) evidence.push("deadline_match");
  if (actionSignal) evidence.push("action_signal");
  const score = (ownerMatch ? 30 : 0) + (titleMatch ? 25 : 0) + (organizerMatch ? 20 : 0) + (deadlineMatch ? 15 : 0) + (actionSignal ? 10 : 0);
  return { url: normalizeUrl(input.url, input.url) ?? input.url, title: input.pageTitle, organizer: input.organizer ?? null, deadline: input.deadline ?? null, action_signal: actionSignal, domain_owner_match: ownerMatch, score, status: score >= 80 ? "OFFICIAL_FOUND" : "PENDING_REVIEW", evidence };
}

export function backtraceStatus(item: Pick<AggregationItem, "official_url">, officialLinks: string[], providerAvailable: boolean): { status: OfficialBacktraceStatus; official_url: string | null } {
  if (officialLinks.length === 1) return { status: "OFFICIAL_FOUND", official_url: normalizeUrl(officialLinks[0], officialLinks[0]) };
  if (officialLinks.length > 1) return { status: "MULTIPLE_CONFLICTING", official_url: null };
  if (item.official_url) return { status: "OFFICIAL_FOUND", official_url: item.official_url };
  return providerAvailable ? { status: "OFFICIAL_NOT_FOUND", official_url: null } : { status: "PENDING_PROVIDER", official_url: null };
}
