import { extractAnchors, htmlToText, identityHash, normalizeUrl, parseDateText, type ParsedAggregationItem } from "./common";

const NAVIGATION_TEXT = /^(about(?: us)?|add listing|all opportunities|apply now|artists?|become (?:a )?(?:member|benefactor)|benefits|browse opportunities|call listings|categories|ca[féé™]*|ccbc (?:events?|gallery|projects?)|craft council(?: of british columbia)?|craft directory|craft fair|craft inventory|craft map|craft resource library|craft scotland|craft status|countries|contact(?: us)?|dashboard|deadline|directory|donate(?: now)?!?|events?|find calls|forgotten password\?|get involved|guides?|hybrid residencies|in conversation|join|journal|learn more|list your studio|login|makers?(?: directory| list)?|meet the team|more|more details|more opportunities|next page|opencall radar|opportunities|organisations? to know|our work|our stories|partners|pricing|previous page|read more|red list|refund|report this\?|resources?|reset|return policy|search|sign in|skip to content|studio guide|submit(?: an)? opportunity|subscribe|support(?: us)?|terms|the makers|the skills|view all|what(?:'|’)s on|who we are|workshops|全部|关于我们|联系我们|机会|更多|登录|注册|搜索|提交)$/iu;

export function isLikelyGenericNavigationItem(title: string, detailUrl: string): boolean {
  const normalizedTitle = title.trim();
  if (NAVIGATION_TEXT.test(normalizedTitle) || /^\d+$/u.test(normalizedTitle) || /^&(?:raquo|rarr);$/iu.test(normalizedTitle)) return true;
  try {
    const target = new URL(detailUrl);
    const pathname = target.pathname.replace(/\/$/u, "");
    if (/\.(?:gif|jpe?g|png|webp)(?:$|\?)/iu.test(target.pathname) || /(?:instagram|facebook|twitter|linkedin)\.com$/iu.test(target.hostname)) return true;
    if (pathname === "") return true;
    if (/\/(?:about|category|categories|country|countries|login|register|search|submit|tag|tags)$/iu.test(pathname)) return true;
    if (/\/(?:artists?|about|benefactors?|category|categories|craft-directory|craft-map|crafts?|forgot-password|guides?|hybrid-residencies|join|makers?(?:-list)?|membership|new-opportunities|opportunities|popular|resources?|skills?|upcoming-deadlines|questions|subscribe|terms|privacy|refund|impressum|events?|donate(?:-now)?|ccbcgallery|signature-events|artist-resources|shop|studio-guide|studio-guide-info|return-policy|checkout|favourites|benefits|directory|dashboard|library)$/iu.test(pathname)) return true;
    if (/\/opportunities\/index\/page\//iu.test(pathname) || /\/open-calls\/(?:discipline|country|monthly)\//iu.test(pathname)) return true;
    if (/\/report$/iu.test(pathname)) return true;
  } catch {
    return true;
  }
  return false;
}

export function parseGenericListing(html: string, listingUrl: string, patterns: RegExp[] = []): ParsedAggregationItem[] {
  const result: ParsedAggregationItem[] = [];
  const seen = new Set<string>();
  const listing = new URL(listingUrl);
  for (const anchor of extractAnchors(html, listingUrl)) {
    if (patterns.length && !patterns.some((pattern) => pattern.test(anchor.href))) continue;
    if (anchor.href === listingUrl || seen.has(anchor.href)) continue;
    if (isLikelyGenericNavigationItem(anchor.text, anchor.href)) continue;
    if (/\S+@\S+/u.test(anchor.text) || anchor.text.trim().length < 4) continue;
    try {
      const target = new URL(anchor.href);
      const pathname = target.pathname.replace(/\/$/u, "");
      const listingPath = listing.pathname.replace(/\/$/u, "");
      if (target.origin === listing.origin && pathname === listingPath) continue;
      if (/\/(?:about|category|categories|country|countries|login|register|search|submit|tag|tags)$/iu.test(pathname)) continue;
      if (/\/opportunities\/index\/page\//iu.test(pathname) || /\/new-opportunities$/iu.test(pathname)) continue;
    } catch {
      continue;
    }
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
