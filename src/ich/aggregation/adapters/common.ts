import crypto from "node:crypto";

export function decodeHtml(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_m, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/gu, (_m, code: string) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, "&")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

export function htmlToText(html: string): string {
  return decodeHtml(html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeUrl(href: string, baseUrl: string): string | null {
  try {
    const url = new URL(decodeHtml(href), baseUrl);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) if (/^(utm_|ref$|source$)/i.test(key)) url.searchParams.delete(key);
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

export function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function identityHash(...parts: string[]): string {
  return sha256(parts.map((part) => part.trim().toLowerCase()).join("\u001f")).slice(0, 24);
}

const DATE_HYPHENS = /[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/gu;

export interface ParsedDateRange {
  raw: string;
  deadlineAt: string;
}

const DEADLINE_DATE = String.raw`(?:[A-Z][a-z]+\s+\d{1,2},?\s+20\d{2}|\d{1,2}\s+[A-Z][a-z]+\s+20\d{2}|20\d{2}\s*[年./-]\s*\d{1,2}\s*[月./-]\s*\d{1,2}\s*日?|\d{1,2}\s*[月./-]\s*\d{1,2}\s*日?)`;
const DEADLINE_MARKER = /(?:closing\s+date|application\s+deadline|submission\s+deadline|entry\s+deadline|deadline|applications?\s+(?:close|closing|end|ends)(?:\s+on)?|截止日期|截止时间|报名截止|报名截至|报名截止时间|投稿截止|投稿截至|投稿截止时间|提交截止|提交截至|申请截止|申请截至|截稿(?:时间|至)?|截至|截止|征集时间|마감일|접수기간)/iu;

function dateMatches(value: string): RegExpMatchArray[] {
  return [...value.replace(DATE_HYPHENS, "-").matchAll(new RegExp(DEADLINE_DATE, "giu"))];
}

export function extractDeadlineText(value: string): string | null {
  const normalized = value.replace(DATE_HYPHENS, "-");
  const markers = [...normalized.matchAll(new RegExp(DEADLINE_MARKER.source, "giu"))];
  for (const marker of markers) {
    const start = (marker.index ?? 0) + marker[0].length;
    const window = normalized.slice(start, start + 220);
    const matches = dateMatches(window);
    if (!matches.length) continue;
    const first = matches[0];
    const firstStart = first.index ?? 0;
    const firstEnd = firstStart + first[0].length;
    const second = matches[1];
    if (second) {
      const between = window.slice(firstEnd, second.index ?? firstEnd);
      if (/^\s*(?:至|到|[-~～])\s*/u.test(between)) return window.slice(firstStart, (second.index ?? 0) + second[0].length).trim();
    }
    return first[0].trim();
  }
  return null;
}

export function parseDateText(value: string | null, now = new Date(), context = ""): string | null {
  if (!value) return null;
  const normalized = value.replace(DATE_HYPHENS, "-").replace(/(\d{1,2})(?:st|nd|rd|th)\b/gi, "$1").replace(/[年月]/g, "-").replace(/日/g, "").replace(/[./]/g, "-").replace(/\s+/g, " ").trim();
  const dateTokens = dateMatches(value);
  const range = dateTokens.length > 1 && /(?:至|到|[-~～])/u.test(normalized);
  const selected = range ? dateTokens[dateTokens.length - 1]?.[0] : dateTokens[0]?.[0];
  if (selected && selected !== value) return parseDateText(selected, now, `${context} ${value}`);
  const iso = normalized.match(/(20\d{2})-(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2})(?::|点)(\d{1,2})?)?/u);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    const hour = Number(iso[4] ?? 23);
    const minute = Number(iso[5] ?? 59);
    const date = new Date(Date.UTC(year, month - 1, day, hour, minute));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day || hour > 23 || minute > 59) return null;
    return date.toISOString();
  }
  const monthDay = normalized.match(/(?:^|[^\d])(\d{1,2})-(\d{1,2})(?:$|[^\d])/u);
  if (monthDay) {
    const explicitYear = value.match(/20\d{2}/u)?.[0] ?? context.match(/20\d{2}/u)?.[0];
    const year = Number(explicitYear ?? now.getUTCFullYear());
    const month = Number(monthDay[1]);
    const day = Number(monthDay[2]);
    const date = new Date(Date.UTC(year, month - 1, day, 23, 59));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    return date.toISOString();
  }
  const en = value.match(/(?:by\s+)?([A-Z][a-z]+\s+\d{1,2},?\s+20\d{2})/u);
  if (en) {
    const parts = en[1].replace(",", "").split(/\s+/u);
    const month = new Date(`${parts[0]} 1, 2000`).getMonth();
    const date = new Date(Date.UTC(Number(parts[2]), month, Number(parts[1]), 23, 59));
    if (!Number.isNaN(date.getTime()) && date.getUTCFullYear() === Number(parts[2]) && date.getUTCMonth() === month && date.getUTCDate() === Number(parts[1])) return date.toISOString();
  }
  const enDayFirst = normalized.match(/(\d{1,2})\s+([A-Z][a-z]+)\s+(20\d{2})/u);
  if (enDayFirst) {
    const month = new Date(`${enDayFirst[2]} 1, 2000`).getMonth();
    const date = new Date(Date.UTC(Number(enDayFirst[3]), month, Number(enDayFirst[1]), 23, 59));
    if (!Number.isNaN(date.getTime()) && date.getUTCFullYear() === Number(enDayFirst[3]) && date.getUTCMonth() === month && date.getUTCDate() === Number(enDayFirst[1])) return date.toISOString();
  }
  const dateOnly = new Date(value);
  if (!Number.isNaN(dateOnly.getTime()) && dateOnly.getFullYear() >= 2020) return dateOnly.toISOString();
  // A year without a month is deliberately not guessed.
  return null;
}

/**
 * CFW publishes date ranges such as `2026.03.20-08.31` on each listing card.
 * The end date is the application deadline; an omitted end year belongs to
 * the start year. This parser is intentionally source-specific and does not
 * broaden generic listing date inference.
 */
export function parseCfwDateRange(value: string | null): ParsedDateRange | null {
  if (!value) return null;
  const normalized = value.replace(DATE_HYPHENS, "-");
  const match = normalized.match(/(?<!\d)(20\d{2})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{1,2})\s*(?:-|~|～|至)\s*(?:(20\d{2})\s*[./-]\s*)?(\d{1,2})\s*[./-]\s*(\d{1,2})(?!\d)/u);
  if (!match) return null;
  const endYear = Number(match[4] ?? match[1]);
  const month = Number(match[5]);
  const day = Number(match[6]);
  const date = new Date(Date.UTC(endYear, month - 1, day, 23, 59));
  if (Number.isNaN(date.getTime()) || date.getUTCFullYear() !== endYear || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return { raw: match[0].trim(), deadlineAt: date.toISOString() };
}

export function classifyCategory(sourceCategory: string | null, title: string): "competition" | "exhibition_market" | "procurement_project" | "channel_collaboration" | "policy_funding" | "international" | "other" {
  const value = `${sourceCategory ?? ""} ${title}`.toLowerCase();
  if (/采购|供应商|commission|supplier|招标/u.test(value)) return "procurement_project";
  if (/合作|联名|partnership|collaboration|入驻/u.test(value)) return "channel_collaboration";
  if (/资助|基金|grant|\bfund(?:ing)?\b|scholarship|program/u.test(value)) return "policy_funding";
  // “international/国际” describes geography, not the public module. Only
  // classify explicit study, residency, fellowship, exchange, or mobility calls
  // as 研修 / 交流.
  if (/residency|驻地|fellowship|研修|培训|工作坊|workshop|exchange|交流|mobility|访问学者/u.test(value)) return "international";
  if (/市集|展销|market|fair|exhibition|展览|展会|vendor|vendors/u.test(value)) return "exhibition_market";
  if (/competition|contest|challenge|prize|award|open\s*call|call\s+for\s+entry|submission|征集|征稿|大赛|竞赛|比赛|评选|奖项/u.test(value)) return "competition";
  return "other";
}

export interface ParsedAggregationItem {
  source_item_id: string;
  title: string;
  source_category: string | null;
  source_status?: string | null;
  detail_url: string;
  source_url: string;
  published_at: string | null;
  deadline_text: string | null;
  deadline_at: string | null;
  deadline_source_url?: string | null;
  deadline_raw_text?: string | null;
  deadline_checked_at?: string | null;
  deadline_resolution?: "found" | "not_attempted" | "fetch_failed" | "image_only" | "ambiguous" | "not_stated";
  organizer: string | null;
  application_url: string | null;
  raw_text: string;
  event_location?: string | null;
  participation_scope?: "nationwide" | "global" | "regional" | "unspecified";
  participation_mode?: "online" | "physical" | "onsite" | "unspecified";
  is_long_term?: boolean;
  starts_at?: string | null;
}

export function extractAnchors(html: string, baseUrl: string): Array<{ href: string; text: string }> {
  const result: Array<{ href: string; text: string }> = [];
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = normalizeUrl(match[1], baseUrl);
    const text = htmlToText(match[2]);
    if (href && text) result.push({ href, text });
  }
  return result;
}

export function externalApplicationLink(html: string, baseUrl: string): string | null {
  for (const link of extractAnchors(html, baseUrl)) if (/(报名|申请|申报|招募|apply|register|submit|official website|官网)/iu.test(link.text)) return link.href;
  return null;
}
