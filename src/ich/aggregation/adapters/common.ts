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

export type EncodingErrorField = "title" | "summary";

/**
 * Keep this deliberately narrow. Replacement characters are an unambiguous
 * signal that the byte decoder could not represent the source text; the
 * mojibake form below is the same signal after a second Latin-1/UTF-8 pass.
 * Do not classify ordinary CJK text by shape or character frequency.
 */
export function hasEncodingCorruption(value: string | null | undefined): boolean {
  if (!value) return false;
  return value.includes("\uFFFD") || value.includes("ï¿½");
}

export function encodingErrorFields(title: string | null | undefined, summary: string | null | undefined): EncodingErrorField[] {
  return [
    ...(hasEncodingCorruption(title) ? ["title" as const] : []),
    ...(hasEncodingCorruption(summary) ? ["summary" as const] : []),
  ];
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

const DEADLINE_DATE = String.raw`(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+20\d{2}|\d{1,2}\s+[A-Z][a-z]+\s+20\d{2}|20\d{2}\s*[年./-]\s*\d{1,2}\s*[月./-]\s*\d{1,2}\s*日?|\d{1,2}\s*[/-]\s*\d{1,2}\s*[/-]\s*20\d{2}|\d{1,2}\s*[月./-]\s*\d{1,2}\s*日?)`;
const DEADLINE_MARKER = /(?:closing\s+date|application\s+deadline|submission\s+deadline|entry\s+deadline|deadline|applications?\s+(?:close|closing|end|ends)(?:\s+on)?|截止日期|截止时间|报名截止|报名截至|报名截止时间|投稿截止|投稿截至|投稿截止时间|提交截止|提交截至|申请截止|申请截至|截稿(?:时间|至)?|截至|截止|征集时间|공모기간|모집기간|지원기간|신청기간|마감일|접수기간)/iu;

export type DeadlineResolution = "found" | "found_listing" | "found_detail" | "found_cross_source" | "long_term" | "source_has_no_date" | "detail_fetch_failed" | "date_conflict" | "relative_only" | "not_attempted" | "fetch_failed" | "image_only" | "ambiguous" | "not_stated";
export type DeadlineKind = "submission_deadline" | "application_deadline" | "registration_deadline" | "deadline";

export interface DeadlineEvidence {
  kind: DeadlineKind;
  text: string;
  raw_text: string;
  deadline_at: string | null;
  marker_index: number;
  priority: number;
}

export interface DeadlineConflict {
  stored_deadline: string | null;
  conflicting_deadline: string;
  evidence: string;
  source_url?: string | null;
  kind?: DeadlineKind | null;
}

function deadlineKind(marker: string): { kind: DeadlineKind; priority: number } {
  if (/(?:submission|entry|投稿|截稿|提交)/iu.test(marker)) return { kind: "submission_deadline", priority: 1 };
  if (/(?:application|申请)/iu.test(marker)) return { kind: "application_deadline", priority: 2 };
  if (/(?:registration|报名|接收|접수)/iu.test(marker)) return { kind: "registration_deadline", priority: 3 };
  return { kind: "deadline", priority: 4 };
}

export function inferDeadlineKind(value: string | null | undefined): DeadlineKind | null {
  if (!value?.trim()) return null;
  return deadlineKind(value).kind;
}

function dateMatches(value: string): RegExpMatchArray[] {
  return [...value.replace(DATE_HYPHENS, "-").matchAll(new RegExp(DEADLINE_DATE, "giu"))];
}

export function extractDeadlineEvidence(value: string, now = new Date(), context = ""): DeadlineEvidence[] {
  const normalized = value.replace(DATE_HYPHENS, "-");
  const markers = [...normalized.matchAll(new RegExp(DEADLINE_MARKER.source, "giu"))];
  const candidates: DeadlineEvidence[] = [];
  for (const marker of markers) {
    const start = (marker.index ?? 0) + marker[0].length;
    const window = normalized.slice(start, start + 220);
    const matches = dateMatches(window);
    const markerInfo = deadlineKind(marker[0]);
    if (!matches.length) {
      const relativeContext = normalized.slice(Math.max(0, (marker.index ?? 0) - 100), start + 80);
      if (/\d+\s*(?:天|日|小时|周|个月|days?)\s*(?:后|left|until)/iu.test(relativeContext)) candidates.push({ kind: markerInfo.kind, text: "", raw_text: `${marker[0]} ${relativeContext.slice(-100).trim()}`, deadline_at: null, marker_index: marker.index ?? 0, priority: markerInfo.priority });
      continue;
    }
    const first = matches[0];
    const firstStart = first.index ?? 0;
    const firstEnd = firstStart + first[0].length;
    const second = matches[1];
    let text = first[0].trim();
    if (second) {
      const between = window.slice(firstEnd, second.index ?? firstEnd);
      if (/^\s*(?:至|到|[-~～])\s*/u.test(between)) text = window.slice(firstStart, (second.index ?? 0) + second[0].length).trim();
    }
    candidates.push({
      kind: markerInfo.kind,
      text,
      raw_text: `${marker[0]} ${text}`.trim(),
      deadline_at: parseDateText(text, now, `${context} ${value}`),
      marker_index: marker.index ?? 0,
      priority: markerInfo.priority,
    });
  }
  return candidates.sort((a, b) => a.priority - b.priority || a.marker_index - b.marker_index);
}

export function extractDeadlineText(value: string): string | null {
  return extractDeadlineEvidence(value)[0]?.text || null;
}

export function parseDateText(value: string | null, now = new Date(), context = "", dateOrder: "month-first" | "day-first" = "month-first"): string | null {
  if (!value) return null;
  const normalized = value.replace(DATE_HYPHENS, "-").replace(/(\d{1,2})(?:st|nd|rd|th)\b/gi, "$1").replace(/[年月]/g, "-").replace(/日/g, "").replace(/[./]/g, "-").replace(/\s+/g, " ").trim();
  const dateTokens = dateMatches(value);
  const range = dateTokens.length > 1 && /(?:至|到|[-~～])/u.test(normalized);
  const selected = range ? dateTokens[dateTokens.length - 1]?.[0] : dateTokens[0]?.[0];
  if (selected && selected !== value) return parseDateText(selected, now, `${context} ${value}`, dateOrder);
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
  const slashDate = normalized.match(/^(\d{1,2})-(\d{1,2})-(20\d{2})$/u);
  if (slashDate) {
    const first = Number(slashDate[1]);
    const second = Number(slashDate[2]);
    const year = Number(slashDate[3]);
    const month = dateOrder === "day-first" ? second : first;
    const day = dateOrder === "day-first" ? first : second;
    const date = new Date(Date.UTC(year, month - 1, day, 23, 59));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
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
  deadline_resolution?: DeadlineResolution;
  deadline_conflicts?: DeadlineConflict[];
  deadline_kind?: DeadlineKind | null;
  deadline_conflict_unsafe?: boolean;
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
