import type { SearchResult, CleanedContent } from "./types";
import type { FieldEvidenceItem, FieldEvidenceName, SearchExecutionLog } from "../schema/radar-mvp-contracts";
import { JinaReaderFetcher } from "./content/jina-reader";

const DEFAULT_LIVE_EVIDENCE_LIMIT = 5;
const DEFAULT_LIVE_EVIDENCE_TIMEOUT_MS = 8000;

const REQUIRED_FIELDS: FieldEvidenceName[] = [
  "title",
  "source_url",
  "source_domain",
  "source_type",
  "registration_or_application_signal",
  "date_or_deadline",
  "fee",
  "eligibility",
  "contact_or_application_route",
];

export interface LiveEvidenceFetchOptions {
  maxUrls?: number;
  timeoutMs?: number;
}

export interface LiveEvidenceFetchResult {
  contentsByUrl: Map<string, CleanedContent>;
  fieldEvidenceByUrl: Map<string, FieldEvidenceItem[]>;
  openedUrls: SearchExecutionLog["openedUrls"];
}

interface FieldMatch {
  value: string;
  evidenceText: string;
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function shortError(error?: string): string | undefined {
  if (!error) return undefined;
  if (/timeout|abort/i.test(error)) return "timeout";
  if (/status=\d+/i.test(error)) return error.match(/status=\d+/i)?.[0] ?? "http_error";
  if (/fetch failed/i.test(error)) return "fetch_failed";
  return error.slice(0, 80);
}

function uniqueByUrl(results: SearchResult[]): SearchResult[] {
  const seen = new Set<string>();
  const unique: SearchResult[] = [];
  for (const result of results) {
    if (!result.url || seen.has(result.url)) continue;
    seen.add(result.url);
    unique.push(result);
  }
  return unique;
}

function contextFor(text: string, start: number, length: number): string {
  const from = Math.max(0, start - 36);
  const to = Math.min(text.length, start + length + 80);
  return text.slice(from, to).replace(/\s+/g, " ").trim();
}

function matchAny(text: string, patterns: RegExp[]): FieldMatch | undefined {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const value = String(match[1] || match[0] || "").trim();
    const index = match.index ?? 0;
    return {
      value,
      evidenceText: contextFor(text, index, value.length),
    };
  }
  return undefined;
}

function field(
  result: SearchResult,
  fieldName: FieldEvidenceName,
  status: FieldEvidenceItem["status"],
  basis: FieldEvidenceItem["basis"],
  checkedAt: string,
  extras: Partial<FieldEvidenceItem> = {},
): FieldEvidenceItem {
  return {
    field: fieldName,
    status,
    basis,
    sourceUrl: result.url,
    sourceDomain: domainOf(result.url),
    checkedAt,
    ...extras,
  };
}

export function buildUnopenedFieldEvidence(result: SearchResult, checkedAt = new Date().toISOString()): FieldEvidenceItem[] {
  return [
    field(result, "title", "unverified", "search_result", checkedAt, { value: result.title }),
    field(result, "source_url", "unverified", "search_result", checkedAt, { value: result.url }),
    field(result, "source_domain", "unverified", "search_result", checkedAt, { value: domainOf(result.url) }),
    field(result, "source_type", "unverified", "search_result", checkedAt, { value: result.source_type }),
    ...REQUIRED_FIELDS
      .filter((name) => !["title", "source_url", "source_domain", "source_type"].includes(name))
      .map((name) => field(result, name, "unverified", "search_result", checkedAt)),
  ];
}

function buildFailedFieldEvidence(result: SearchResult, content: CleanedContent, checkedAt: string): FieldEvidenceItem[] {
  const error = shortError(content.fetch_error);
  return REQUIRED_FIELDS.map((name) =>
    field(result, name, "failed", "fetched_content", checkedAt, {
      ...(name === "title" ? { value: result.title } : {}),
      ...(name === "source_url" ? { value: result.url } : {}),
      ...(name === "source_domain" ? { value: domainOf(result.url) } : {}),
      ...(name === "source_type" ? { value: result.source_type } : {}),
      ...(error ? { error } : {}),
    }),
  );
}

function buildSuccessfulFieldEvidence(result: SearchResult, content: CleanedContent, checkedAt: string): FieldEvidenceItem[] {
  const text = content.main_text ?? "";
  const title = content.title || result.title;
  const registration = matchAny(text, [
    /(报名|申请|参赛|申込|エントリー|参加|신청|참가|register|apply|entry)[^\n。；;]{0,80}/i,
  ]);
  const deadline = matchAny(text, [
    /(?:截止|报名截止|申请截止|申込締切|締切|deadline)[日期时间：:\s]*(\d{4}[-/年]\d{1,2}[-/月]\d{1,2}日?|\d{1,2}[-/月]\d{1,2}日?)/i,
    /(\d{4}[-/年]\d{1,2}[-/月]\d{1,2}日?)\s*(?:截止|到期|结束|締切)/,
  ]);
  const fee = matchAny(text, [
    /(?:报名费|参赛费|费用|fee|entry fee)[：:\s]*([^。\n；;]{1,80})/i,
    /(?:無料|free of charge|no fee|免报名费|不收取报名费)/i,
  ]);
  const eligibility = matchAny(text, [
    /(?:参赛资格|适合对象|参赛条件|报名条件|eligibility|参加資格|応募資格)[：:\s]*([^。\n；;]{1,120})/i,
    /(?:面向|対象)[：:\s]*([^。\n；;]{1,120})/,
  ]);
  const contact = matchAny(text, [
    /(?:报名链接|报名地址|申请入口|申込|エントリー|apply|register)[：:\s]*(https?:\/\/[^\s\n]+)/i,
    /(?:联系方式|联系人|contact|問い合わせ|お問い合わせ)[：:\s]*([^。\n；;]{1,100})/i,
    /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/,
  ]);

  const partial = (name: FieldEvidenceName, match?: FieldMatch) =>
    match
      ? field(result, name, "partially_verified", "fetched_content", checkedAt, {
        value: match.value,
        evidenceText: match.evidenceText,
      })
      : field(result, name, "not_found", "fetched_content", checkedAt);

  return [
    field(result, "title", title ? "verified" : "not_found", "fetched_content", checkedAt, {
      ...(title ? { value: title, evidenceText: title } : {}),
    }),
    field(result, "source_url", "verified", "fetched_content", checkedAt, { value: result.url }),
    field(result, "source_domain", "verified", "fetched_content", checkedAt, { value: domainOf(result.url) }),
    field(result, "source_type", "verified", "fetched_content", checkedAt, { value: result.source_type }),
    partial("registration_or_application_signal", registration),
    partial("date_or_deadline", deadline),
    partial("fee", fee),
    partial("eligibility", eligibility),
    partial("contact_or_application_route", contact),
  ];
}

export async function fetchLiveEvidence(
  results: SearchResult[],
  options: LiveEvidenceFetchOptions = {},
): Promise<LiveEvidenceFetchResult> {
  const maxUrls = options.maxUrls ?? DEFAULT_LIVE_EVIDENCE_LIMIT;
  const timeoutMs = options.timeoutMs ?? DEFAULT_LIVE_EVIDENCE_TIMEOUT_MS;
  const targets = uniqueByUrl(results).slice(0, Math.max(0, maxUrls));
  const fetcher = new JinaReaderFetcher({ mockMode: false, timeoutMs, preferDirect: true });
  const contentsByUrl = new Map<string, CleanedContent>();
  const fieldEvidenceByUrl = new Map<string, FieldEvidenceItem[]>();
  const openedUrls: SearchExecutionLog["openedUrls"] = [];

  for (const result of targets) {
    const fetchedAt = new Date().toISOString();
    const content = await fetcher.fetch(result.url);
    contentsByUrl.set(result.url, content);

    const status = content.fetch_success
      ? content.word_count > 0 ? "succeeded" : "partial"
      : "failed";
    openedUrls.push({
      url: result.url,
      status,
      ...(content.fetch_error ? { errorType: shortError(content.fetch_error) } : {}),
      fetchedAt,
      ...(content.title ? { title: content.title } : {}),
      wordCount: content.word_count,
    });

    fieldEvidenceByUrl.set(
      result.url,
      content.fetch_success
        ? buildSuccessfulFieldEvidence(result, content, fetchedAt)
        : buildFailedFieldEvidence(result, content, fetchedAt),
    );
  }

  return { contentsByUrl, fieldEvidenceByUrl, openedUrls };
}
