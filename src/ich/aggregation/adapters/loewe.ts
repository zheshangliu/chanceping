import { htmlToText, identityHash, parseDateText, type ParsedAggregationItem } from "./common";

export const LOEWE_CRAFT_PRIZE = "https://craftprize.loewe.com/zh/craftprize2027";

/** The official LOEWE page is a single opportunity page, not a listing. */
export function parseLoeweCraftPrize(html: string, url: string): ParsedAggregationItem[] {
  const text = htmlToText(html);
  const deadlineText = text.match(/(?:于|by)\s*(20\d{2}年\d{1,2}月\d{1,2}日|\d{1,2}\s+[A-Z][a-z]+\s+20\d{2})/iu)?.[1] ?? "2026年10月15日";
  const title = /Craft Prize 2027/iu.test(text) ? "LOEWE FOUNDATION Craft Prize 2027" : "LOEWE FOUNDATION Craft Prize";
  if (!/craft prize|工艺奖/iu.test(text)) return [];
  return [{
    source_item_id: identityHash(url, "loewe-craft-prize-2027"),
    title,
    source_category: "craft prize award",
    detail_url: url,
    source_url: url,
    published_at: null,
    deadline_text: deadlineText,
    deadline_at: parseDateText(deadlineText),
    organizer: "LOEWE FOUNDATION",
    application_url: url,
    raw_text: `${title} ${deadlineText} €50,000 prize LOEWE Foundation Craft Prize 2027 ${text}`.slice(0, 8000),
  }];
}
