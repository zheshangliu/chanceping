import { extractAnchors, normalizeUrl } from "./adapters/common";
import type { AggregationItem, OfficialBacktraceStatus } from "./types";

const AGGREGATOR_HOSTS = new Set(["shejijingsai.com", "www.shejijingsai.com", "contestwatchers.com", "www.contestwatchers.com", "artconnect.com", "www.artconnect.com", "competitions.archi", "www.competitions.archi"]);

export function findOfficialLinks(html: string, sourceUrl: string): string[] {
  const sourceHost = (() => { try { return new URL(sourceUrl).hostname; } catch { return ""; } })();
  const links = extractAnchors(html, sourceUrl).map((link) => link.href).filter((url) => {
    try {
      const host = new URL(url).hostname;
      return host !== sourceHost && ![...AGGREGATOR_HOSTS].some((aggregator) => host === aggregator || host.endsWith(`.${aggregator}`));
    } catch { return false; }
  });
  return [...new Set(links)].filter((url) => !/facebook|instagram|twitter|linkedin|youtube|mailto:/i.test(url));
}

export function backtraceStatus(item: Pick<AggregationItem, "official_url">, officialLinks: string[], providerAvailable: boolean): { status: OfficialBacktraceStatus; official_url: string | null } {
  if (officialLinks.length === 1) return { status: "OFFICIAL_FOUND", official_url: normalizeUrl(officialLinks[0], officialLinks[0]) };
  if (officialLinks.length > 1) return { status: "MULTIPLE_CONFLICTING", official_url: null };
  if (item.official_url) return { status: "OFFICIAL_FOUND", official_url: item.official_url };
  return providerAvailable ? { status: "OFFICIAL_NOT_FOUND", official_url: null } : { status: "PENDING_PROVIDER", official_url: null };
}
