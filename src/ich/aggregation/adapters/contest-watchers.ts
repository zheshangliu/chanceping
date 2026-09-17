import { parseRssItems } from "./rss";
import { htmlToText, normalizeUrl, parseDateText, type ParsedAggregationItem } from "./common";

export const CONTEST_WATCHERS_FEED = "https://www.contestwatchers.com/feed/";
export const CONTEST_WATCHERS_LISTING = "https://www.contestwatchers.com/";
export const parseContestWatchersFeed = parseRssItems;

/** Homepage baseline parser; RSS remains the incremental path. */
export function parseContestWatchersListing(html: string, url: string): ParsedAggregationItem[] {
  const items: ParsedAggregationItem[] = [];
  const add = (attrs: string, body: string) => {
    const href = attrs.match(/href=["']([^"']+)["']/i)?.[1];
    const detailUrl = href ? normalizeUrl(href, url) : null;
    if (!detailUrl) return;
    const title = htmlToText(body);
    if (!title) return;
    items.push({ source_item_id: detailUrl, title, source_category: null, detail_url: detailUrl, source_url: url, published_at: null, deadline_text: null, deadline_at: parseDateText(null), organizer: null, application_url: null, raw_text: title });
  };
  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) if (/\bentry-title\b/i.test(match[1])) add(match[1], match[2]);
  for (const match of html.matchAll(/<h[1-6]\b[^>]*class=["'][^"']*entry-title[^"']*["'][^>]*>([\s\S]*?)<\/h[1-6]>/gi)) {
    const link = match[1].match(/<a\b([^>]*)>([\s\S]*?)<\/a>/i);
    if (link) add(link[1], link[2]);
  }
  return items;
}
