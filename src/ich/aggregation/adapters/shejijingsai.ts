import { classifyCategory, htmlToText, identityHash, normalizeUrl, parseDateText, type ParsedAggregationItem } from "./common";

export const SHEJIJINGSAI_URL = "https://www.shejijingsai.com/liebiao";

/** Parses the site's table rows, rather than asking an LLM to infer fields from page text. */
export function parseShejijingsaiListing(html: string, listingUrl = SHEJIJINGSAI_URL): ParsedAggregationItem[] {
  const items: ParsedAggregationItem[] = [];
  for (const row of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((match) => htmlToText(match[1]));
    const anchor = row[1].match(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!anchor || cells.length < 3) continue;
    const title = htmlToText(anchor[2]);
    const detailUrl = normalizeUrl(anchor[1], listingUrl);
    if (!detailUrl || !title || /设计竞赛项目列表|比赛名称|竞赛项目列表/u.test(title)) continue;
    const sourceCategory = cells[0] || null;
    const deadlineText = cells[cells.length - 1] || null;
    items.push({
      source_item_id: detailUrl,
      title,
      source_category: sourceCategory,
      detail_url: detailUrl,
      source_url: listingUrl,
      published_at: null,
      deadline_text: deadlineText,
      deadline_at: parseDateText(deadlineText),
      organizer: null,
      application_url: null,
      raw_text: cells.join(" | "),
    });
  }
  return items.map((item) => ({ ...item, source_item_id: identityHash(item.detail_url) }));
}

export function shejiItemIsCurrent(item: ParsedAggregationItem, now = new Date()): boolean {
  return !item.deadline_at || new Date(item.deadline_at).getTime() >= now.getTime();
}

export function shejiCategory(item: ParsedAggregationItem): ReturnType<typeof classifyCategory> {
  return classifyCategory(item.source_category, item.title);
}
