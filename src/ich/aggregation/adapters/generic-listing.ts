import { extractAnchors, htmlToText, identityHash, normalizeUrl, parseDateText, type ParsedAggregationItem } from "./common";

const NAVIGATION_TEXT = /^(about(?: us)?|add listing|all opportunities|apply now|artists?|become (?:a )?(?:member|benefactor)|benefits|browse(?: all)?(?: open calls| opportunities)?(?: →)?|browse opportunities|call listings|categories|ca[féé™]*|ccbc (?:events?|gallery|projects?)|closing this week(?: →)?|competitions? & open calls|craft council(?: of british columbia)?|craft directory|craft fair|craft inventory|craft map|craft resource library|craft scotland|craft status|countries|contact(?: us)?|dashboard|deadline|directory|donate(?: now)?!?|editor's picks|emerging artists|events?|find calls|forgotten password\?|fully funded|get involved|grants?|guides?|hybrid residencies|in conversation|international|join|journal|learn more|list your studio|login|makers?(?: directory| list)?|meet the team|more|more details|more opportunities|next page|no application fee|opencall radar|opportunities|organisations? to know|our work|our stories|partners|pricing|prizes?|previous page|read more|red list|refund|report this\?|residencies|resources?|reset|return policy|rolling deadline|search|sign in|skip to content|studio guide|submit(?: an)? opportunity|subscribe|support(?: us)?|terms|the makers|the skills|travel covered|view all|what(?:'|’)s on|who we are|with accommodation|workshops|全部|关于我们|联系我们|机会|更多|登录|注册|搜索|提交)$/iu;
const OPPORTUNITY_SIGNAL = /(?:opportunit|open.?call|contest|competition|residen|award|exhibition|craft|artist|apply|call|vendor|market|grant|fellowship|participat|young.?ambassadors|deadline|招募|征集|比赛|竞赛|展览| 사업공모|모집|공모|지원사업|지원|신청)/iu;
const LISTING_DEADLINE = /(?:closing\s+date|application\s+deadline|deadline|截止日期|截止时间|报名截止|마감일|접수기간)[^\d]{0,80}((?:[A-Z][a-z]+\s+\d{1,2},?\s+20\d{2}|\d{1,2}\s+[A-Z][a-z]+\s+20\d{2}|20\d{2}[年/-]\d{1,2}[月/-]\d{1,2}日?))/iu;

export function isLikelyGenericNavigationItem(title: string, detailUrl: string): boolean {
  const normalizedTitle = title.trim();
  if (NAVIGATION_TEXT.test(normalizedTitle) || /^\d+$/u.test(normalizedTitle) || /^&(?:raquo|rarr);$/iu.test(normalizedTitle)) return true;
  if (/^(?:mailto:|tel:)/iu.test(detailUrl)) return true;
  try {
    const target = new URL(detailUrl);
    if (!/^https?:$/iu.test(target.protocol)) return true;
    const pathname = target.pathname.replace(/\/$/u, "");
    if (/\.(?:gif|jpe?g|png|webp)(?:$|\?)/iu.test(target.pathname) || /(?:instagram|facebook|twitter|linkedin)\.com$/iu.test(target.hostname)) return true;
    if (pathname === "") return true;
    if (/\/(?:about|category|categories|country|countries|login|register|search|submit|tag|tags)$/iu.test(pathname)) return true;
    if (/\/(?:artists?|about|benefactors?|category|categories|craft-directory|craft-map|crafts?|forgot-password|guides?|hybrid-residencies|join|makers?(?:-list)?|membership|new-opportunities|opportunities|popular|resources?|skills?|upcoming-deadlines|questions|subscribe|terms|privacy|refund|impressum|events?|donate(?:-now)?|ccbcgallery|signature-events|artist-resources|shop|studio-guide|studio-guide-info|return-policy|checkout|favourites|benefits|directory|dashboard|library)$/iu.test(pathname)) return true;
    if (/\/opportunities\/index\/page\//iu.test(pathname) || /\/open-calls\/(?:discipline|country|monthly)\//iu.test(pathname)) return true;
    if (/\/report$/iu.test(pathname)) return true;
    const contentPath = /\/(?:blog|podcast|archive|contact|stories?|journal|press|about|faq|info|resources?|news)(?:\/|$)/iu.test(pathname);
    if (contentPath && !OPPORTUNITY_SIGNAL.test(`${normalizedTitle} ${detailUrl}`)) return true;
  } catch {
    return true;
  }
  if (/(?:\b(?:blog|podcast|archive|contact|news|story|stories|about us|our history)\b)/iu.test(normalizedTitle) && !OPPORTUNITY_SIGNAL.test(`${normalizedTitle} ${detailUrl}`)) return true;
  return false;
}

export function isLikelySourceListingNoise(sourceId: string, title: string, detailUrl: string): boolean {
  if (isLikelyGenericNavigationItem(title, detailUrl)) return true;
  const value = `${title} ${detailUrl}`;
  if (sourceId === "kcdf-opportunities") {
    if (!/[?&]bbIdx=\d+/u.test(detailUrl)) return true;
    return /^(?:사업공모|공모결과|대관신청)$/u.test(title.trim()) || /공예문화\s*\(craft culture\)|뉴스|소식|공모결과|결과발표|모집마감|공지사항|채용|입찰/iu.test(title) || !/(사업공모|모집|공모|지원사업|지원|신청|참여자|후보자)/u.test(title);
  }
  if (sourceId === "homo-faber-calls") {
    if (/(?:holiday|season.?greetings|news|info|team|artisan: how to apply)/iu.test(value)) return true;
    return !/(?:call|application|fellowship|participation|young ambassadors|apply)/iu.test(value);
  }
  if (sourceId === "craft-council-bc-calls") {
    if (/\/call-for-entry\/\d+$/iu.test(detailUrl)) return true;
    return !/(?:call\s+for\s+(?:entry|artists?)|annual\s+call|vendor|market|application|award|grant|residen|exhibition)/iu.test(value);
  }
  return false;
}

export function parseGenericListing(html: string, listingUrl: string, patterns: RegExp[] = []): ParsedAggregationItem[] {
  const result: ParsedAggregationItem[] = [];
  const seen = new Set<string>();
  const listing = new URL(listingUrl);
  for (const anchor of extractAnchors(html, listingUrl)) {
    if (/^(?:mailto:|tel:)/iu.test(anchor.href)) continue;
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
    if (!OPPORTUNITY_SIGNAL.test(`${anchor.href} ${anchor.text}`)) continue;
    const deadline = anchor.text.match(LISTING_DEADLINE)?.[1] ?? null;
    seen.add(anchor.href);
    result.push({
      source_item_id: identityHash(anchor.href), title: anchor.text, source_category: null, detail_url: normalizeUrl(anchor.href, listingUrl) ?? anchor.href,
      source_url: listingUrl, published_at: null, deadline_text: deadline, deadline_at: parseDateText(deadline), organizer: null, application_url: null, raw_text: anchor.text,
    });
  }
  return result;
}

export function enrichGenericItem(item: ParsedAggregationItem, detailHtml: string, detailUrl: string): ParsedAggregationItem {
  const text = htmlToText(detailHtml);
  const title = detailHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const deadline = text.match(/(?:deadline|closing date|application deadline|截止日期|截止时间|报名截止)[^\d]{0,100}((?:[A-Z][a-z]+\s+\d{1,2},?\s+20\d{2}|\d{1,2}\s+[A-Z][a-z]+\s+20\d{2}|20\d{2}[年/-]\d{1,2}[月/-]\d{1,2}日?))/iu)?.[1] ?? null;
  return { ...item, title: title ? htmlToText(title).replace(/\s*[|–-].*$/u, "").trim() || item.title : item.title, deadline_text: deadline, deadline_at: parseDateText(deadline), raw_text: `${item.raw_text} ${text}`.slice(0, 8000), detail_url: detailUrl };
}
