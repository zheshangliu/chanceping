import { extractAnchors, identityHash, normalizeUrl, type ParsedAggregationItem } from "./common";
import { enrichGenericItem, parseGenericListing } from "./generic-listing";

export const ARTCONNECT_OPPORTUNITIES = "https://www.artconnect.com/opportunities";

const NAVIGATION_TITLES = /^(?:add opportunity|opportunities for (?:international artists|artists in .+|curators|digital artists|illustrators|installation artists|painters|photographers|printmakers|sculptors|video artists|visual artists|contemporary artists)|residencies|awards? & prizes?|calls? for curators|commissions?|education|jobs|open calls?|collaborations?|call for entries|art submissions?|art contests?|art competitions?|fellowships?|fully funded residencies|opportunities without fees)$/iu;

export function isRealArtConnectOpportunityUrl(url: string): boolean {
  return /artconnect\.com\/opportunity\/[^/?#]+$/iu.test(url);
}

/** ArtConnect's listing contains both real entries and taxonomy/SEO links. */
export function parseArtConnectListing(html: string, url: string): ParsedAggregationItem[] {
  const detailItems = parseGenericListing(html, url, [/artconnect\.com\/opportunity\//i]);
  const seen = new Set<string>();
  return detailItems.filter((item) => {
    const normalized = normalizeUrl(item.detail_url, url) ?? item.detail_url;
    if (!isRealArtConnectOpportunityUrl(normalized)) return false;
    if (NAVIGATION_TITLES.test(item.title.trim())) return false;
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  }).map((item) => ({ ...item, source_item_id: identityHash(item.detail_url) }));
}

export const enrichArtConnectItem = enrichGenericItem;
