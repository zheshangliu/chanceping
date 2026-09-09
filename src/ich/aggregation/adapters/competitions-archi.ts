import { decodeHtml, htmlToText, normalizeUrl, parseDateText, type ParsedAggregationItem } from "./common";
import { enrichGenericItem } from "./generic-listing";

export const COMPETITIONS_ARCHI = "https://competitions.archi/";
export const COMPETITIONS_ARCHI_LIGHT_PAGES = [
  "https://competitions.archi/registration-ending-latest/",
  "https://competitions.archi/submission-ending-latest/",
  "https://competitions.archi/registration-ending-latest/page/2/",
  "https://competitions.archi/submission-ending-latest/page/2/",
] as const;

function field(block: string, name: string): string | null {
  const match = block.match(new RegExp(`<span[^>]*class=["'][^"']*${name}[^"']*["'][^>]*>[\\s\\S]*?<span[^>]*>([\\s\\S]*?)</span>`, "i"));
  return match ? htmlToText(match[1]) : null;
}

/** Parser for the light WordPress listing pages; it does not depend on JS. */
export function parseCompetitionsArchiListing(html: string, url: string): ParsedAggregationItem[] {
  const items: ParsedAggregationItem[] = [];
  const starts = [...html.matchAll(/<div[^>]*class=["'][^"']*competition-item[^"']*["'][^>]*>/gi)].map((match) => match.index ?? -1).filter((index) => index >= 0);
  const blocks = starts.map((start, index) => html.slice(start, starts[index + 1] ?? html.length));
  for (const block of blocks) {
    const link = block.match(/<a[^>]*href=["']([^"']+)["'][^>]*>/i);
    const titleMatch = block.match(/<h2[^>]*class=["'][^"']*title[^"']*["'][^>]*>([\s\S]*?)<\/h2>/i);
    if (!link || !titleMatch) continue;
    const detailUrl = normalizeUrl(link[1], url);
    if (!detailUrl) continue;
    const title = htmlToText(titleMatch[1]);
    const submission = field(block, "submission");
    const registration = field(block, "registration");
    const deadlineText = submission ?? registration;
    const rawText = htmlToText(block);
    items.push({
      source_item_id: detailUrl,
      title: decodeHtml(title),
      source_category: field(block, "type"),
      detail_url: detailUrl,
      source_url: url,
      published_at: null,
      deadline_text: deadlineText,
      deadline_at: parseDateText(deadlineText),
      deadline_kind: submission ? "submission_deadline" : registration ? "registration_deadline" : null,
      organizer: null,
      application_url: null,
      raw_text: rawText,
    });
  }
  return items;
}
export const enrichCompetitionsArchiItem = enrichGenericItem;
