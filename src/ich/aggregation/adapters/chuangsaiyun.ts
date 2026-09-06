import { decodeHtml, htmlToText, identityHash, parseDateText, type ParsedAggregationItem } from "./common";

/**
 * 创赛云的 /#/diy?id=150 页面是 Nuxt/Vue Hash Router。
 * 页面公开 diy JSON 只返回 iframe 配置；实际赛事卡片由 xiacansai.com/mrjs.html
 * 返回。该适配器解析这个公开、可重复抓取的结构化 HTML，不模拟浏览器点击。
 */
const CARD_RE = /<a\b[^>]*class=["']tl-card["'][^>]*>([\s\S]*?)<\/a>/giu;

function attribute(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`${name}=["']([^"']*)["']`, "iu"));
  return match ? decodeHtml(match[1]) : null;
}

function preserveHashUrl(value: string, baseUrl: string): string | null {
  try {
    const url = new URL(value, baseUrl);
    for (const key of [...url.searchParams.keys()]) if (/^(utm_|ref$|source$)/iu.test(key)) url.searchParams.delete(key);
    return url.toString().replace(/\/$/u, "");
  } catch {
    return null;
  }
}

function cardText(card: string, className: string): string {
  const match = card.match(new RegExp(`<[^>]*class=["']${className}["'][^>]*>([\\s\\S]*?)<\\/[^>]+>`, "iu"));
  return match ? htmlToText(match[1]) : "";
}

export function parseChuangsaiyunListing(html: string, listingUrl: string): ParsedAggregationItem[] {
  const result: ParsedAggregationItem[] = [];
  for (const match of html.matchAll(CARD_RE)) {
    const card = match[0];
    const inner = match[1];
    const pcUrl = attribute(card, "data-url-pc");
    const h5Url = attribute(card, "data-url-h5");
    const detailUrl = (pcUrl && preserveHashUrl(pcUrl, listingUrl)) || (h5Url && preserveHashUrl(h5Url, listingUrl));
    if (!detailUrl) continue;
    const id = detailUrl.match(/[?&]id=(\d+)/iu)?.[1];
    if (!id) continue;
    const title = cardText(inner, "tl-title");
    const meta = cardText(inner, "tl-meta");
    const deadlineText = meta.match(/截止时间：\s*([^·]+)/u)?.[1]?.trim() || null;
    const sourceCategory = meta.split("·").slice(1).join("·").trim() || null;
    const sourceStatus = inner.match(/<span\b[^>]*>([^<]+)<\/span>/iu)?.[1]?.trim() || null;
    if (!title) continue;
    result.push({
      source_item_id: id,
      title,
      source_category: sourceCategory,
      source_status: sourceStatus,
      detail_url: detailUrl,
      source_url: listingUrl,
      published_at: null,
      deadline_text: deadlineText,
      deadline_at: parseDateText(deadlineText),
      organizer: null,
      application_url: null,
      raw_text: htmlToText(inner),
    });
  }
  return result;
}

export function chuangsaiyunItemId(item: ParsedAggregationItem): string {
  return identityHash("chuangsaiyun", item.source_item_id, item.detail_url);
}
