import { extractDeadlineEvidence, htmlToText, identityHash, inferDeadlineKind, normalizeUrl, parseDateText, type ParsedAggregationItem } from "./common";

export function parseRssItems(xml: string, feedUrl: string): ParsedAggregationItem[] {
  const items: ParsedAggregationItem[] = [];
  for (const match of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    const block = match[1];
    const read = (tag: string) => block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"))?.[1] ?? "";
    const title = htmlToText(read("title"));
    const link = normalizeUrl(htmlToText(read("link")), feedUrl);
    if (!title || !link) continue;
    const pubDate = htmlToText(read("pubDate"));
    const description = htmlToText(read("description"));
    const deadlineEvidence = extractDeadlineEvidence(description).find((candidate) => candidate.deadline_at) ?? null;
    items.push({
      source_item_id: identityHash(link), title, source_category: null, detail_url: link, source_url: feedUrl,
      published_at: parseDateText(pubDate), deadline_text: description.match(/(?:deadline|closing date|截止)[^\d]*(\d{1,2}\s+[A-Z][a-z]+\s+20\d{2}|20\d{2}[年/-]\d{1,2}[月/-]\d{1,2}日?)/iu)?.[1] ?? null,
      deadline_at: parseDateText(description.match(/(?:deadline|closing date|截止)[^\d]*(\d{1,2}\s+[A-Z][a-z]+\s+20\d{2}|20\d{2}[年/-]\d{1,2}[月/-]\d{1,2}日?)/iu)?.[1] ?? null),
      deadline_kind: deadlineEvidence?.kind ?? inferDeadlineKind(description),
      organizer: null, application_url: null, raw_text: `${title} ${description}`.slice(0, 4000),
    });
  }
  return items;
}
