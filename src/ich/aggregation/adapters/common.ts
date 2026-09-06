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

export function parseDateText(value: string | null, now = new Date()): string | null {
  if (!value) return null;
  const normalized = value.replace(/(\d{1,2})(?:st|nd|rd|th)\b/gi, "$1").replace(/[年月]/g, "-").replace(/日/g, "").replace(/[./]/g, "-").replace(/\s+/g, " ").trim();
  const iso = normalized.match(/(20\d{2})-(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2})(?::|点)(\d{1,2})?)?/u);
  if (iso) return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), Number(iso[4] ?? 23), Number(iso[5] ?? 59))).toISOString();
  const en = value.match(/(?:by\s+)?([A-Z][a-z]+\s+\d{1,2},?\s+20\d{2})/u);
  if (en) {
    const parts = en[1].replace(",", "").split(/\s+/u);
    const month = new Date(`${parts[0]} 1, 2000`).getMonth();
    const date = new Date(Date.UTC(Number(parts[2]), month, Number(parts[1]), 23, 59));
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  const enDayFirst = normalized.match(/(\d{1,2})\s+([A-Z][a-z]+)\s+(20\d{2})/u);
  if (enDayFirst) {
    const month = new Date(`${enDayFirst[2]} 1, 2000`).getMonth();
    const date = new Date(Date.UTC(Number(enDayFirst[3]), month, Number(enDayFirst[1]), 23, 59));
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  const dateOnly = new Date(value);
  if (!Number.isNaN(dateOnly.getTime()) && dateOnly.getFullYear() >= 2020) return dateOnly.toISOString();
  // A year without a month is deliberately not guessed.
  void now;
  return null;
}

export function classifyCategory(sourceCategory: string | null, title: string): "competition" | "exhibition_market" | "procurement_project" | "channel_collaboration" | "policy_funding" | "international" {
  const value = `${sourceCategory ?? ""} ${title}`.toLowerCase();
  if (/市集|展销|market|fair|exhibition|展览|展会|open call|征集/u.test(value)) return "exhibition_market";
  if (/采购|供应商|commission|supplier|招标/u.test(value)) return "procurement_project";
  if (/合作|联名|partnership|collaboration|入驻/u.test(value)) return "channel_collaboration";
  if (/资助|基金|grant|fellowship|funding|program/u.test(value)) return "policy_funding";
  if (/international|国际|residency|驻地/u.test(value)) return "international";
  return "competition";
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
  organizer: string | null;
  application_url: string | null;
  raw_text: string;
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
