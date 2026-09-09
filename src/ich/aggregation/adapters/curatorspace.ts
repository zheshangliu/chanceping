import { extractDeadlineText, htmlToText, identityHash, normalizeUrl, parseDateText, type ParsedAggregationItem } from "./common";
import { enrichGenericItem } from "./generic-listing";

function curatorSpaceItem(block: string, listingUrl: string): ParsedAggregationItem | null {
  const href = block.match(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/iu)?.[1];
  const title = block.match(/<h4\b[^>]*>([\s\S]*?)<\/h4>/iu)?.[1];
  if (!href || !title) return null;
  const detailUrl = normalizeUrl(href, listingUrl);
  if (!detailUrl) return null;
  const rawText = htmlToText(block);
  const deadlineText = block.match(/<strong\b[^>]*>\s*Deadline:\s*([\s\S]*?)<\/strong>/iu)?.[1]?.trim() ?? extractDeadlineText(rawText);
  const deadlineAt = deadlineText ? parseDateText(deadlineText, new Date(), rawText, /\d{1,2}\s*[/-]\s*\d{1,2}\s*[/-]\s*20\d{2}/u.test(deadlineText) ? "day-first" : "month-first") : null;
  return {
    source_item_id: identityHash(detailUrl),
    title: htmlToText(title),
    source_category: "opportunity",
    source_status: null,
    detail_url: detailUrl,
    source_url: listingUrl,
    published_at: null,
    deadline_text: deadlineText,
    deadline_at: deadlineAt,
    deadline_source_url: deadlineAt ? listingUrl : null,
    deadline_raw_text: deadlineText,
    deadline_checked_at: deadlineAt ? new Date().toISOString() : null,
    deadline_resolution: deadlineAt ? "found_listing" : deadlineText ? "relative_only" : "not_attempted",
    organizer: null,
    application_url: null,
    raw_text: rawText.slice(0, 8000),
    participation_scope: "unspecified",
    participation_mode: "unspecified",
  };
}

export function parseCuratorSpaceListing(html: string, listingUrl: string): ParsedAggregationItem[] {
  const result: ParsedAggregationItem[] = [];
  const seen = new Set<string>();
  for (const match of html.matchAll(/<li\b[^>]*\bopportunity\b[^>]*>[\s\S]*?<\/li>/giu)) {
    const parsed = curatorSpaceItem(match[0], listingUrl);
    if (!parsed || seen.has(parsed.detail_url)) continue;
    seen.add(parsed.detail_url);
    result.push(parsed);
  }
  return result;
}

export function enrichCuratorSpaceItem(item: ParsedAggregationItem, detailHtml: string, detailUrl: string): ParsedAggregationItem {
  const enriched = enrichGenericItem(item, detailHtml, detailUrl);
  const deadlineText = enriched.deadline_text ?? "";
  if (!/\d{1,2}\s*[/-]\s*\d{1,2}\s*[/-]\s*20\d{2}/u.test(deadlineText)) return enriched;
  const deadlineAt = parseDateText(deadlineText, new Date(), `${item.title} ${enriched.raw_text}`, "day-first");
  if (!deadlineAt) return enriched;
  return { ...enriched, deadline_at: deadlineAt, deadline_resolution: "found_detail", deadline_source_url: detailUrl };
}
