import { extractAnchors, htmlToText, identityHash, normalizeUrl, parseDateText, type ParsedAggregationItem } from "./common";

export function parseGenericListing(html: string, listingUrl: string, patterns: RegExp[] = []): ParsedAggregationItem[] {
  const result: ParsedAggregationItem[] = [];
  const seen = new Set<string>();
  for (const anchor of extractAnchors(html, listingUrl)) {
    if (patterns.length && !patterns.some((pattern) => pattern.test(anchor.href))) continue;
    if (anchor.href === listingUrl || seen.has(anchor.href)) continue;
    if (!/(opportunit|open.?call|contest|competition|residen|award|exhibition|craft|artist|apply|call|招募|征集|比赛|竞赛|展览)/iu.test(`${anchor.href} ${anchor.text}`)) continue;
    seen.add(anchor.href);
    result.push({
      source_item_id: identityHash(anchor.href), title: anchor.text, source_category: null, detail_url: normalizeUrl(anchor.href, listingUrl) ?? anchor.href,
      source_url: listingUrl, published_at: null, deadline_text: null, deadline_at: null, organizer: null, application_url: null, raw_text: anchor.text,
    });
  }
  return result;
}

export function enrichGenericItem(item: ParsedAggregationItem, detailHtml: string, detailUrl: string): ParsedAggregationItem {
  const text = htmlToText(detailHtml);
  const title = detailHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const deadline = text.match(/(?:deadline|closing date|application deadline|截止日期|截止时间|报名截止)[^\d]{0,100}((?:\d{1,2}\s+)?[A-Z][a-z]+\s+\d{1,2},?\s+20\d{2}|20\d{2}[年/-]\d{1,2}[月/-]\d{1,2}日?)/iu)?.[1] ?? null;
  return { ...item, title: title ? htmlToText(title).replace(/\s*[|–-].*$/u, "").trim() || item.title : item.title, deadline_text: deadline, deadline_at: parseDateText(deadline), raw_text: `${item.raw_text} ${text}`.slice(0, 8000), detail_url: detailUrl };
}
