import { extractAnchors, extractDeadlineText, htmlToText, identityHash, normalizeUrl, parseDateText, type ParsedAggregationItem } from "./common";

const RESULT_NOISE = /(?:获奖|获奖公布|结果|揭晓|公示|关于我们|赛事推广|会员登录|客服|导航|论坛|发布征集|VIP|广告)/iu;
const OPPORTUNITY_WORDS = /(?:大赛|竞赛|比赛|征集|征稿|设计|文创|非遗|工艺|产品|礼品|陶瓷|国潮|奖)/u;

function attr(tag: string, name: string): string | null {
  return tag.match(new RegExp(`${name}=["']([^"']*)["']`, "iu"))?.[1] ?? null;
}

function item(title: string, detailUrl: string, sourceUrl: string, rawText: string, fields: Partial<ParsedAggregationItem> = {}): ParsedAggregationItem {
  const deadlineText = fields.deadline_text ?? extractDeadlineText(rawText);
  const relativeOnly = !deadlineText && /\d+\s*(?:天|日|小时|周|个月)\s*(?:后|内|剩余|截止)/u.test(rawText);
  return {
    source_item_id: fields.source_item_id ?? identityHash(detailUrl), title: title.trim(), source_category: fields.source_category ?? "文创设计", source_status: fields.source_status ?? null,
    detail_url: detailUrl, source_url: sourceUrl, published_at: fields.published_at ?? null, deadline_text: deadlineText, deadline_at: fields.deadline_at ?? parseDateText(deadlineText, new Date(), rawText), organizer: fields.organizer ?? null, application_url: fields.application_url ?? null, raw_text: rawText.slice(0, 8000),
    deadline_resolution: fields.deadline_resolution ?? (deadlineText ? "found_listing" : relativeOnly ? "relative_only" : "not_attempted"),
    event_location: fields.event_location ?? null, participation_scope: fields.participation_scope ?? "unspecified", participation_mode: fields.participation_mode ?? "unspecified",
  };
}

function extractSpanInnerHtml(html: string, className: string): string {
  const opening = html.match(new RegExp("<span\\b[^>]*class=[\"'][^\"']*\\b" + className + "\\b[^\"']*[\"'][^>]*>", "iu"));
  if (!opening || opening.index === undefined) return "";
  const contentStart = opening.index + opening[0].length;
  const tokens = /<\/?span\b[^>]*>/giu;
  tokens.lastIndex = contentStart;
  let depth = 1;
  let token: RegExpExecArray | null;
  while ((token = tokens.exec(html))) {
    if (/^<\/span/iu.test(token[0])) depth -= 1;
    else if (!/\/\s*>$/u.test(token[0])) depth += 1;
    if (depth === 0) return html.slice(contentStart, token.index);
  }
  return html.slice(contentStart);
}

function classify1zjTimeStatus(timeText: string): string {
  const compact = timeText.replace(/\s+/gu, "").trim();
  if (!compact) return "CURRENT_OR_UNKNOWN";
  if (/(?:\d+)(?:天|日|小时|周|个月)后/u.test(compact) || /(?:尚未|还未|未)(?:截止|结束)/u.test(compact)) {
    return "CURRENT_OR_UNKNOWN";
  }
  if (/(?:已|已经)(?:截止|结束)(?:了)?/u.test(compact) || /(?:获奖|结果)(?:已|已经)(?:公布|公示|揭晓)/u.test(compact)) {
    return "EXPIRED";
  }
  return "CURRENT_OR_UNKNOWN";
}

export function parseCnyisaiListing(html: string, listingUrl: string): ParsedAggregationItem[] {
  const result: ParsedAggregationItem[] = [];
  for (const match of html.matchAll(/<a\b[^>]*class=["'][^"']*\bcard\b[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/giu)) {
    const detailUrl = normalizeUrl(match[1], listingUrl);
    const inner = match[2];
    const title = inner.match(/<h3\b[^>]*>([\s\S]*?)<\/h3>/iu)?.[1];
    if (!detailUrl || !title) continue;
    const cleanTitle = htmlToText(title);
    const rawText = htmlToText(inner);
    if (!cleanTitle || RESULT_NOISE.test(cleanTitle) || !OPPORTUNITY_WORDS.test(cleanTitle)) continue;
    const status = inner.match(/<span\b[^>]*class=["'][^"']*\bchip\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/iu)?.[1];
    const deadline = inner.match(/data-deadline=["']([^"']+)["']/iu)?.[1] ?? null;
    const organizer = inner.match(/<div\b[^>]*class=["'][^"']*\bhost\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/iu)?.[1];
    const summary = inner.match(/<p\b[^>]*class=["'][^"']*\bcard-sum\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/iu)?.[1];
    const className = attr(match[0], "class") ?? "";
    result.push(item(cleanTitle, detailUrl, listingUrl, [htmlToText(organizer ?? ""), htmlToText(summary ?? ""), rawText].filter(Boolean).join(" "), {
      source_item_id: identityHash("cnyisai", detailUrl), source_category: className.includes("c-intl") ? "国际赛事" : "国内赛事", source_status: htmlToText(status ?? ""), deadline_text: deadline, deadline_at: parseDateText(deadline, new Date(), rawText), organizer: organizer ? htmlToText(organizer) : null,
    }));
  }
  return result;
}

export function parse1zjListing(html: string, listingUrl: string): ParsedAggregationItem[] {
  const result: ParsedAggregationItem[] = [];
  for (const match of html.matchAll(/<a\b[^>]*class=["']list-item["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/giu)) {
    const detailUrl = normalizeUrl(match[1], listingUrl);
    const inner = match[2];
    const title = inner.match(/class=["']list-item-title["'][^>]*>([\s\S]*?)<\/span>/iu)?.[1];
    if (!detailUrl || !title) continue;
    const cleanTitle = htmlToText(title);
    const rawText = htmlToText(inner);
    if (!cleanTitle || RESULT_NOISE.test(cleanTitle) || !OPPORTUNITY_WORDS.test(cleanTitle)) continue;
    const reward = inner.match(/class=["']list-item-price["'][^>]*>([\s\S]*?)<\/span>/iu)?.[1];
    const timeText = htmlToText(extractSpanInnerHtml(inner, "list-item-time"));
    const status = classify1zjTimeStatus(timeText);
    const deadlineText = extractDeadlineText(rawText);
    result.push(item(cleanTitle, detailUrl, listingUrl, rawText, { source_item_id: identityHash("1zj", detailUrl), source_category: "文创设计", source_status: status, deadline_text: deadlineText, organizer: null, raw_text: `${rawText} 奖金 ${htmlToText(reward ?? "")}` }));
  }
  return result;
}

function parsePathListing(
  html: string,
  listingUrl: string,
  sourceId: string,
  pathPattern: RegExp,
  sourceCategoryForHref: (href: string) => string = () => "文创设计",
): ParsedAggregationItem[] {
  const result: ParsedAggregationItem[] = [];
  for (const anchor of extractAnchors(html, listingUrl)) {
    if (!pathPattern.test(anchor.href) || anchor.href === listingUrl) continue;
    const title = anchor.text.trim();
    if (title.length < 4 || RESULT_NOISE.test(title) || !OPPORTUNITY_WORDS.test(title)) continue;
    const deadlineText = extractDeadlineText(title);
    result.push(item(title, anchor.href, listingUrl, title, { source_item_id: identityHash(sourceId, anchor.href), deadline_text: deadlineText, source_category: sourceCategoryForHref(anchor.href) }));
  }
  return result;
}

export function parseChuangyisaiListing(html: string, listingUrl: string): ParsedAggregationItem[] {
  return parsePathListing(html, listingUrl, "chuangyisai", /\/zjds\/gycp\//iu);
}

export function parseZjmtListing(html: string, listingUrl: string): ParsedAggregationItem[] {
  return parsePathListing(html, listingUrl, "zjmtcn", /\/zjxx\/(?:chanpin|lipin|taoci)\//iu, (href) => {
    if (/\/zjxx\/lipin\//iu.test(href)) return "礼品征集";
    if (/\/zjxx\/taoci\//iu.test(href)) return "陶瓷";
    return "产品征集";
  });
}
