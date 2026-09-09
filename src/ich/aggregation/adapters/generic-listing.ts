import { extractAnchors, extractDeadlineEvidence, extractDeadlineText, htmlToText, identityHash, inferDeadlineKind, normalizeUrl, parseCfwDateRange, parseDateText, type ParsedAggregationItem, type ParsedDateRange } from "./common";

const NAVIGATION_TEXT = /^(about(?: us)?|add listing|all opportunities|apply now|artists?|become (?:a )?(?:member|benefactor)|benefits|browse(?: all)?(?: open calls| opportunities)?(?: →)?|browse opportunities|call listings|categories|ca[féé™]*|ccbc (?:events?|gallery|projects?)|closing this week(?: →)?|competitions? & open calls|craft council(?: of british columbia)?|craft directory|craft fair|craft inventory|craft map|craft resource library|craft scotland|craft status|countries|contact(?: us)?|dashboard|deadline|directory|donate(?: now)?!?|editor's picks|emerging artists|events?|find calls|forgotten password\?|fully funded|get involved|grants?|guides?|hybrid residencies|in conversation|international|join|journal|learn more|list your studio|login|makers?(?: directory| list)?|meet the team|more|more details|more opportunities|next page|no application fee|opencall radar|opportunities|organisations? to know|our work|our stories|partners|pricing|prizes?|previous page|read more|red list|refund|report this\?|residencies|resources?|reset|return policy|rolling deadline|search|sign in|skip to content|studio guide|submit(?: an)? opportunity|subscribe|support(?: us)?|terms|the makers|the skills|travel covered|view all|what(?:'|’)s on|who we are|with accommodation|workshops|全部|关于我们|联系我们|机会|更多|登录|注册|搜索|提交|征集大赛)$/iu;
const CLEAR_NAVIGATION_TEXT = /^(?:advertising|archives?|newsletter(?: signup)?|object stories|our history|press(?: & media)?|privacy policy\.?|renew my membership|stay in the loop|terms(?: & conditions| of (?:use|sale))?|view all stories)$/iu;
const CLEAR_CONTENT_PATH = /\/(?:advertising|archives?|object-stories|our-history|press(?:-and-media)?|privacy(?:-policy)?|stories?|terms(?:-and-conditions|-of-use|-of-sale)?)(?:\/|$)/iu;
const OPPORTUNITY_SIGNAL = /(?:opportunit|open.?call|contest|competition|residen|award|exhibition|craft|artist|apply|call|vendor|market|grant|fellowship|participat|young.?ambassadors|deadline|招募|征集|比赛|竞赛|大赛|展览| 사업공모|모집|공모|지원사업|지원|신청)/iu;
const RESULT_OR_CONTENT_NOISE = /(?:获奖名单|名单公示|评审结果|结果公布|结果揭晓|获奖作品|入围名单|结果发布|作品赏析|招聘|公示|公告解读)/iu;
const INLINE_DEADLINE = String.raw`(?:[A-Z][a-z]+\s+\d{1,2},?\s+20\d{2}|\d{1,2}\s+[A-Z][a-z]+\s+20\d{2}|20\d{2}\s*[年./-]\s*\d{1,2}\s*[月./-]\s*\d{1,2}\s*日?|\d{1,2}\s*[月./-]\s*\d{1,2}\s*日?)`;

/** Removes listing chrome while retaining the actual opportunity wording. */
export function cleanGenericListingTitle(value: string): string {
  return value
    .replace(/^\s*(?:full\s+details?|more\s+details?)\s*(?:&rarr;|&raquo;|→|->|›)?\s*/iu, "")
    .replace(new RegExp(`(?:closing\\s+date|application\\s+deadline|submission\\s+deadline|entry\\s+deadline|deadline|截止日期|截止时间|报名截止|投稿截止|申请截止|截稿(?:至)?|截至|截止)\\s*[:：-]?\\s*${INLINE_DEADLINE}`, "iu"), "")
    .replace(/\s+/gu, " ")
    .trim();
}

function hasPriorYearTitle(title: string): boolean {
  const currentYear = new Date().getUTCFullYear();
  return [...title.matchAll(/(?:^|[^\d])(20\d{2})(?:年|\b)/gu)].some((match) => Number(match[1]) < currentYear);
}

export function isLikelyGenericNavigationItem(title: string, detailUrl: string): boolean {
  const normalizedTitle = title.trim();
  if (NAVIGATION_TEXT.test(normalizedTitle) || CLEAR_NAVIGATION_TEXT.test(normalizedTitle) || /^\d+$/u.test(normalizedTitle) || /^&(?:raquo|rarr);$/iu.test(normalizedTitle)) return true;
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
    if (CLEAR_CONTENT_PATH.test(pathname)) return true;
    const contentPath = /\/(?:blog|podcast|archive|contact|stories?|journal|press|about|faq|info|resources?|news)(?:\/|$)/iu.test(pathname);
    if (contentPath && !/\/news(?:\/|$)/iu.test(pathname)) return true;
    if (/\/news(?:\/|$)/iu.test(pathname) && !OPPORTUNITY_SIGNAL.test(`${normalizedTitle} ${detailUrl}`)) return true;
  } catch {
    return true;
  }
  if (/(?:\b(?:blog|podcast|archive|contact|news|story|stories|about us|our history)\b)/iu.test(normalizedTitle) && !OPPORTUNITY_SIGNAL.test(`${normalizedTitle} ${detailUrl}`)) return true;
  return false;
}

export function isLikelySourceListingNoise(sourceId: string, title: string, detailUrl: string): boolean {
  if (isLikelyGenericNavigationItem(title, detailUrl)) return true;
  const value = `${title} ${detailUrl}`;
  if (sourceId === "american-craft-council-opportunities") {
    if (/^(?:national craft directory|about american craft|craft happenings|craft champions circle|maker support)$/iu.test(title.trim())) return true;
    if (/\/(?:national-directory|magazine|craft-happenings-calendar|craft-champions-circle)$/iu.test(detailUrl)) return true;
  }
  if (sourceId === "craft-scotland-opportunities" && /(?:shared studio|studio (?:application|space)|workshop spaces|general (?:tour|travel)|about|news|podcast|archive)/iu.test(value)) return true;
  if (["cfw-cultural-ip", "whaleideas-competition", "zjmtcn-product-competition", "iuben-cultural-competition"].includes(sourceId)) {
    if (RESULT_OR_CONTENT_NOISE.test(value) || hasPriorYearTitle(title)) return true;
  }
  if (sourceId === "everyart-competition") {
    if (!/\/single\/\d+/iu.test(detailUrl)) return true;
    if (/(?:招聘|就业|艺术家介绍|展览回顾|新闻|资讯)/iu.test(value)) return true;
  }
  if (sourceId === "gtn9-competition" && !/work_list\.aspx/iu.test(detailUrl)) return true;
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

function structuredAnchorText(html: string, listingUrl: string, sourceId?: string): Map<string, string> {
  const result = new Map<string, string>();
  if (sourceId !== "whaleideas-competition") return result;
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>\s*<div[^>]*class=["'][^"']*\btitle\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/giu)) {
    const href = normalizeUrl(match[1], listingUrl);
    if (!href) continue;
    const title = htmlToText(match[2]);
    result.set(href, title);
  }
  return result;
}

function structuredListingDeadline(html: string, listingUrl: string, sourceId?: string): Map<string, string> {
  const result = new Map<string, string>();
  if (sourceId !== "iuben-cultural-competition") return result;
  for (const match of html.matchAll(/<article\b[\s\S]*?<\/article>/giu)) {
    const block = match[0];
    const deadline = extractDeadlineText(block)
      ?? block.match(/data-deadline=["']([^"']+)["']/iu)?.[1];
    if (!deadline) continue;
    for (const href of block.matchAll(/<a\b[^>]*href=["']([^"']+)["']/giu)) {
      const normalized = normalizeUrl(href[1], listingUrl);
      if (normalized) result.set(normalized, deadline);
    }
  }
  return result;
}

function structuredCfwListingDates(html: string, listingUrl: string, sourceId?: string): Map<string, ParsedDateRange> {
  const result = new Map<string, ParsedDateRange>();
  if (sourceId !== "cfw-cultural-ip") return result;
  for (const match of html.matchAll(/<li\b[^>]*>[\s\S]*?<\/li>/giu)) {
    const block = match[0];
    const titleAnchor = block.match(/<a\b[^>]*href=["']([^"']+)["'][^>]*class=["'][^"']*\bname\b[^"']*["'][^>]*>([\s\S]*?)<\/a>/iu);
    if (!titleAnchor) continue;
    const detailUrl = normalizeUrl(titleAnchor[1], listingUrl);
    if (!detailUrl) continue;
    for (const dateMatch of block.matchAll(/<p\b[^>]*class=["'][^"']*\bpt15\b[^"']*\bc6\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/giu)) {
      const parsed = parseCfwDateRange(htmlToText(dateMatch[1]));
      if (parsed) {
        result.set(detailUrl, parsed);
        break;
      }
    }
  }
  return result;
}

export function parseCfwDetailDate(html: string): ParsedDateRange | null {
  for (const match of html.matchAll(/<p\b[^>]*class=["'][^"']*\bpt10\b[^"']*\bc6\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/giu)) {
    const parsed = parseCfwDateRange(htmlToText(match[1]));
    if (parsed) return parsed;
  }
  return null;
}

export function parseGenericListing(html: string, listingUrl: string, patterns: RegExp[] = [], sourceId?: string): ParsedAggregationItem[] {
  const result: ParsedAggregationItem[] = [];
  const seen = new Set<string>();
  const listing = new URL(listingUrl);
  const structuredText = structuredAnchorText(html, listingUrl, sourceId);
  const structuredDeadlines = structuredListingDeadline(html, listingUrl, sourceId);
  const structuredCfwDates = structuredCfwListingDates(html, listingUrl, sourceId);
  for (const anchor of extractAnchors(html, listingUrl)) {
    if (/^(?:mailto:|tel:)/iu.test(anchor.href)) continue;
    if (patterns.length && !patterns.some((pattern) => pattern.test(anchor.href))) continue;
    if (anchor.href === listingUrl || seen.has(anchor.href)) continue;
    const rawCandidateText = structuredText.get(anchor.href) ?? anchor.text;
    if (isLikelyGenericNavigationItem(rawCandidateText, anchor.href)) continue;
    const candidateText = cleanGenericListingTitle(rawCandidateText);
    if (/\S+@\S+/u.test(candidateText) || candidateText.trim().length < 4) continue;
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
    if (!OPPORTUNITY_SIGNAL.test(`${anchor.href} ${candidateText}`)) continue;
    const detailUrl = normalizeUrl(anchor.href, listingUrl) ?? anchor.href;
    const cfwDate = structuredCfwDates.get(detailUrl);
    const listingEvidence = extractDeadlineEvidence(rawCandidateText, new Date(), candidateText);
    const listingPrimary = listingEvidence.find((candidate) => candidate.deadline_at) ?? listingEvidence[0] ?? null;
    const deadline = listingPrimary?.text ?? structuredDeadlines.get(anchor.href) ?? cfwDate?.raw ?? null;
    seen.add(anchor.href);
    const deadlineResolution = cfwDate ? "found_listing" : deadline && parseDateText(deadline, new Date(), `${rawCandidateText} ${candidateText}`) ? "found_listing" : deadline ? "relative_only" : "not_attempted";
    result.push({
      source_item_id: identityHash(anchor.href), title: candidateText, source_category: null, detail_url: detailUrl,
      source_url: listingUrl, published_at: null, deadline_text: deadline, deadline_at: cfwDate?.deadlineAt ?? parseDateText(deadline, new Date(), candidateText),
      deadline_source_url: deadline ? listingUrl : null, deadline_raw_text: listingPrimary?.raw_text ?? deadline, deadline_checked_at: deadline ? new Date().toISOString() : null, deadline_resolution: deadlineResolution, deadline_kind: listingPrimary?.kind ?? inferDeadlineKind(deadline),
      organizer: null, application_url: null, raw_text: [candidateText, cfwDate?.raw].filter(Boolean).join(" "),
    });
  }
  return result;
}

export function enrichGenericItem(item: ParsedAggregationItem, detailHtml: string, detailUrl: string): ParsedAggregationItem {
  const text = htmlToText(detailHtml);
  const title = detailHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const context = `${item.raw_text} ${text}`;
  const evidence = extractDeadlineEvidence(text, new Date(), `${item.title} ${item.raw_text}`);
  const primary = evidence.find((candidate) => candidate.deadline_at) ?? null;
  const deadline = primary?.text ?? extractDeadlineText(item.raw_text) ?? item.deadline_text;
  const deadlineAt = primary?.deadline_at ?? parseDateText(deadline, new Date(), `${item.raw_text} ${text}`) ?? item.deadline_at;
  const conflicts = evidence.filter((candidate) => candidate.deadline_at && candidate.deadline_at !== deadlineAt).map((candidate) => ({ stored_deadline: deadlineAt, conflicting_deadline: candidate.deadline_at as string, evidence: candidate.raw_text, source_url: detailUrl, kind: candidate.kind }));
  if (item.deadline_at && deadlineAt && item.deadline_at !== deadlineAt) conflicts.unshift({ stored_deadline: item.deadline_at, conflicting_deadline: deadlineAt, evidence: primary?.raw_text ?? deadline ?? "", source_url: detailUrl, kind: primary?.kind ?? item.deadline_kind ?? inferDeadlineKind(deadline) ?? "deadline" });
  const parsedTitle = title ? htmlToText(title).replace(/\s*[|–-].*$/u, "").trim() : "";
  // Many detail pages use the publisher name as their HTML <title>. Keep the
  // listing title unless the parsed title still carries an opportunity signal;
  // otherwise the source-level noise filter can mistake the real item for a
  // navigation row and the enriched deadline never reconciles back into the
  // existing pool record.
  const nextTitle = parsedTitle && parsedTitle.length >= Math.max(8, item.title.length * 0.6) && !isLikelyGenericNavigationItem(parsedTitle, detailUrl) && OPPORTUNITY_SIGNAL.test(parsedTitle) ? parsedTitle : item.title;
  return {
    ...item,
    title: nextTitle,
    deadline_text: deadline,
    deadline_at: deadlineAt,
    deadline_source_url: deadline ? detailUrl : detailUrl,
    deadline_raw_text: primary?.raw_text ?? deadline ?? item.deadline_raw_text ?? null,
    deadline_checked_at: new Date().toISOString(),
    deadline_kind: primary?.kind ?? item.deadline_kind ?? inferDeadlineKind(deadline),
    deadline_resolution: conflicts.length ? "date_conflict" : primary ? "found_detail" : evidence.some((candidate) => !candidate.deadline_at) ? "relative_only" : (deadline ? "not_stated" : "source_has_no_date"),
    deadline_conflicts: [...(item.deadline_conflicts ?? []), ...conflicts],
    raw_text: context.slice(0, 8000),
    detail_url: detailUrl,
  };
}
