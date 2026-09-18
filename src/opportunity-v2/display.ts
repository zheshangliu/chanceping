import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { OpportunityV2 } from "./types";
import { hasEncodingCorruption, htmlToText } from "../ich/aggregation/adapters/common";
import { atomicWriteJson, withJsonFileLock } from "./file-lock";

export const OPPORTUNITY_V2_DISPLAY_STRATEGY = "provider-chain-zh-v1";
export type OpportunityV2TranslationStatus = "translated" | "pending" | "failed";
export type OpportunityV2TranslationFieldStatus = "translated" | "failed" | "pending" | "unavailable" | "not_needed";
export type OpportunityV2TranslationFailureCode =
  | "CREDENTIAL_NOT_CONFIGURED"
  | "PROVIDER_UNAVAILABLE"
  | "QUALITY_REJECTED"
  | "EMPTY_CONTENT"
  | "INVALID_JSON"
  | "TIMEOUT"
  | "UNKNOWN";

export interface OpportunityV2Translation {
  opportunity_id: string;
  source_hash: string;
  target_language: "zh-CN";
  strategy_version: typeof OPPORTUNITY_V2_DISPLAY_STRATEGY;
  title_zh: string;
  summary_zh: string;
  status: OpportunityV2TranslationStatus;
  title_status?: OpportunityV2TranslationFieldStatus;
  summary_status?: OpportunityV2TranslationFieldStatus;
  validation_errors?: string[];
  failure_code?: OpportunityV2TranslationFailureCode;
  provider?: string;
  attempt_count?: number;
  retryable?: boolean;
  next_retry_at?: string | null;
  last_attempt_at?: string;
  error?: string;
  updated_at: string;
}

export interface OpportunityV2TranslationFile {
  schema_version: "chanceping-opportunity-v2.translation.v1";
  updated_at: string;
  translations: OpportunityV2Translation[];
}

export interface OpportunityV2Display {
  title: string;
  original_title: string | null;
  summary: string;
  original_summary: string | null;
  translated: boolean;
  translation_status: "translated" | "pending" | "failed" | "not_needed";
}

export function cleanOpportunityDisplayText(value: string | null | undefined): string {
  const navigation = /(?:^|\s)(?:首页|热门推荐|联系客服|广告投放|浏览量|阅读量|菜单|导航|返回首页|menu|login|sign\s+in|pricing|about\s+us|our\s+work|projects|reports|home|full\s+details?)(?=\s|$)/giu;
  let text = htmlToText(String(value ?? ""))
    .replace(/\u00a0/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  text = text
    .replace(/(?:浏览量|阅读量|views?|page\s+views?)\s*[:：]?\s*[\d,]+/giu, " ")
    .replace(/来源页面未提供(?:更详细|可直接使用的)?(?:赛事)?(?:摘要|简介)[，,。.]?请打开来源原文查看完整要求[。.]?/giu, " ")
    .replace(/来源页面未提供(?:更详细|可直接使用的)?(?:摘要|简介)[。.]?/giu, " ")
    .replace(navigation, " ")
    .replace(/\s+&\s+/gu, " ｜ ")
    .replace(/\s+/gu, " ")
    .trim();
  if (!text || /^[\s\d|｜·,，:：;；/\\-]+$/u.test(text)) return "";
  // Some listing adapters expose only an observation timestamp as summary.
  // It is not project content and must never be presented as one.
  if (/^(?:(?:[A-Z][a-z]{2,9}),?\s*)?20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}(?:[T\s+]\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?$/u.test(text)) return "";
  if (/(?:founded|established)\s+in\s+20\d{2}/iu.test(text)
    && /supports?\s+(?:craft|culture|artists?)/iu.test(text)
    && !/(?:submit|apply|application|call|open|deadline|project|作品|报名|申请|征集|展览|参赛|市场|grant|award)/iu.test(text)) return "";
  return text;
}

function displaySummary(item: Pick<OpportunityV2, "summary" | "encoding_error_fields">): string {
  return item.encoding_error_fields?.includes("summary") || hasEncodingCorruption(item.summary) ? "" : cleanOpportunityDisplayText(item.summary);
}

function translationPath(filePath?: string): string {
  return path.resolve(filePath ?? process.env.CHANCEPING_OPPORTUNITY_V2_TRANSLATION_PATH ?? "data/opportunity-v2/translations.json");
}

export function opportunityV2SourceHash(item: Pick<OpportunityV2, "title" | "summary">): string {
  return crypto.createHash("sha256").update(`${cleanOpportunityDisplayText(item.title)}\n${cleanOpportunityDisplayText(item.summary)}`, "utf8").digest("hex");
}

/** Hash used by V1.2 caches; accepted only for safe cache reuse during migration. */
export function opportunityV2LegacySourceHash(item: Pick<OpportunityV2, "title" | "summary">): string {
  return crypto.createHash("sha256").update(`${item.title}\n${item.summary}`, "utf8").digest("hex");
}

export function isReusableOpportunityV2Translation(
  item: Pick<OpportunityV2, "id" | "title" | "summary">,
  entry: (Pick<OpportunityV2Translation, "opportunity_id" | "source_hash" | "target_language" | "strategy_version" | "status" | "title_zh"> & Partial<Pick<OpportunityV2Translation, "title_status">>) | undefined,
): boolean {
  return Boolean(entry && entry.opportunity_id === item.id
    && (entry.source_hash === opportunityV2SourceHash(item) || entry.source_hash === opportunityV2LegacySourceHash(item))
    && entry.target_language === "zh-CN"
    && entry.strategy_version === OPPORTUNITY_V2_DISPLAY_STRATEGY
    && entry.status === "translated"
    && entry.title_status !== "failed"
    && Boolean(entry.title_zh?.trim()));
}

export function findCurrentOpportunityV2Translation(
  item: Pick<OpportunityV2, "id" | "title" | "summary">,
  translations: OpportunityV2Translation[],
): OpportunityV2Translation | undefined {
  return translations.find((entry) => entry.opportunity_id === item.id
    && (entry.source_hash === opportunityV2SourceHash(item) || entry.source_hash === opportunityV2LegacySourceHash(item)));
}

export function isOpportunityV2TranslationRetryCooling(entry: OpportunityV2Translation, now = new Date()): boolean {
  const next = entry.next_retry_at ? new Date(entry.next_retry_at).getTime() : Number.NaN;
  return entry.status === "failed" && Number.isFinite(next) && next > now.getTime();
}

export function readOpportunityV2Translations(filePath?: string): OpportunityV2Translation[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(translationPath(filePath), "utf8")) as OpportunityV2TranslationFile;
    return Array.isArray(parsed.translations) ? parsed.translations : [];
  } catch {
    return [];
  }
}

export function writeOpportunityV2Translations(translations: OpportunityV2Translation[], filePath?: string): void {
  const target = translationPath(filePath);
  withJsonFileLock(target, () => {
    let existing: OpportunityV2Translation[] = [];
    try {
      const parsed = JSON.parse(fs.readFileSync(target, "utf8")) as OpportunityV2TranslationFile;
      if (Array.isArray(parsed.translations)) existing = parsed.translations;
    } catch { /* first writer */ }
    const merged = new Map(existing.map((entry) => [entry.opportunity_id, entry]));
    for (const entry of translations) merged.set(entry.opportunity_id, entry);
    atomicWriteJson(target, {
      schema_version: "chanceping-opportunity-v2.translation.v1",
      updated_at: new Date().toISOString(),
      translations: [...merged.values()].sort((a, b) => a.opportunity_id.localeCompare(b.opportunity_id)),
    });
  });
}

function hasChinese(value: string): boolean { return /[\u3400-\u9fff]/u.test(value); }
function hasKana(value: string): boolean { return /[\u3040-\u309f\u30a1-\u30fa\u30fc]/u.test(value); }
function hasHangul(value: string): boolean { return /[\uac00-\ud7af]/u.test(value); }
function latinCount(value: string): number { return (value.match(/[A-Za-z]/gu) ?? []).length; }

/** Mixed CJK/Latin records are foreign when either field is substantively non-Chinese. */
export function isForeignLanguageOpportunity(item: Pick<OpportunityV2, "title" | "summary">): boolean {
  const title = cleanOpportunityDisplayText(item.title);
  const summary = cleanOpportunityDisplayText(item.summary);
  if (hasKana(title) || hasHangul(title)) return true;
  const titleLatin = latinCount(title);
  const titleChinese = (title.match(/[\u3400-\u9fff]/gu) ?? []).length;
  if (titleLatin >= 3 && (!hasChinese(title) || titleLatin >= 8 || titleLatin > titleChinese)) return true;
  if (summary && !hasChinese(summary) && (hasKana(summary) || hasHangul(summary) || latinCount(summary) >= 12)) return true;
  return false;
}

function pendingTranslation(item: OpportunityV2, now: Date, status: OpportunityV2TranslationStatus, error?: string, options: Partial<OpportunityV2Translation> = {}): OpportunityV2Translation {
  return {
    opportunity_id: item.id,
    source_hash: opportunityV2SourceHash(item),
    target_language: "zh-CN",
    strategy_version: OPPORTUNITY_V2_DISPLAY_STRATEGY,
    title_zh: "",
    summary_zh: "",
    status,
    title_status: status,
    summary_status: status,
    ...options,
    ...(error ? { error: error.slice(0, 240) } : {}),
    updated_at: now.toISOString(),
  };
}

/** No fake fallback: callers must use the configured LLM or leave this pending. */
export function createOpportunityV2Translation(item: OpportunityV2, now = new Date()): OpportunityV2Translation {
  return pendingTranslation(item, now, "pending", "translation provider is not configured");
}

export function createFailedOpportunityV2Translation(item: OpportunityV2, error: unknown, now = new Date()): OpportunityV2Translation {
  return pendingTranslation(item, now, "failed", error instanceof Error ? error.message : String(error), {
    failure_code: "UNKNOWN",
    retryable: true,
    last_attempt_at: now.toISOString(),
  });
}

function factualTokens(value: string): string[] {
  return [...new Set([
    ...(value.match(/20\d{2}/gu) ?? []),
    ...(value.match(/(?:€|£|\$|¥|￥)\s?\d[\d,.]*/gu) ?? []),
  ])];
}

/**
 * Deadline is already rendered as a separate card field. Source titles often
 * contain "Closing date" / "申请截止" text, while the translation prompt
 * explicitly removes that navigation metadata from the translated title.
 * Remove only those deadline fragments before checking factual tokens so the
 * validator does not reject an otherwise valid translation for omitting a
 * duplicated deadline year.
 */
function stripDeadlineFragments(value: string): string {
  return value.replace(
    /(?:closing\s+date|application\s+deadline|submission\s+deadline|entry\s+deadline|deadline|applications?\s+(?:close|closing|end|ends)(?:\s+on)?|截止日期|截止时间|报名截止|投稿截止|申请截止|截稿(?:至)?|截至|截止)\s*[:：-]?\s*(?:[A-Z][a-z]+\s+\d{1,2},?\s+20\d{2}|\d{1,2}\s+[A-Z][a-z]+\s+20\d{2}|20\d{2}\s*[年./-]\s*\d{1,2}\s*[月./-]\s*\d{1,2}\s*日?|\d{1,2}\s*[月./-]\s*\d{1,2}\s*日?)/giu,
    "",
  );
}

function factualTokenVariants(token: string): string[] {
  const match = token.match(/^(€|£|\$|¥|￥)\s?(\d[\d,.]*)$/u);
  if (!match) return [token];
  const [, symbol, amount] = match;
  const currencyName = { "€": "欧元", "£": "英镑", "$": "美元", "¥": "日元", "￥": "人民币" }[symbol] ?? "";
  return [token, `${amount}${currencyName}`, `${amount} ${currencyName}`, `${currencyName}${amount}`];
}

function containsFactualToken(value: string, token: string): boolean {
  const compact = value.replace(/\s+/gu, "");
  return factualTokenVariants(token).some((variant) => compact.includes(variant.replace(/\s+/gu, "")));
}

function isAcceptableUnchangedProperTitle(value: string): boolean {
  const words = value.match(/[A-Za-z]{3,}/gu) ?? [];
  return value.length <= 32 && words.length <= 2;
}

export function validateOpportunityV2Translation(
  item: OpportunityV2,
  title: string,
  summary: string,
  options: { field?: "title" | "summary" | "both" } = {},
): string[] {
  const field = options.field ?? "both";
  const errors: string[] = [];
  if (field !== "summary" && !title.trim()) errors.push("empty translated title");
  if (field === "summary" && !summary.trim()) errors.push("empty translated summary");
  if (/<(?:script|style)\b/iu.test(`${title} ${summary}`)) errors.push("markup is not allowed");
  const sourceTitle = cleanOpportunityDisplayText(item.title);
  const sourceSummary = cleanOpportunityDisplayText(item.summary);
  const sourceFacts = field === "title" ? sourceTitle : field === "summary" ? sourceSummary : `${sourceTitle}\n${sourceSummary}`;
  const translatedFacts = field === "title" ? title : field === "summary" ? summary : `${title} ${summary}`;
  for (const token of factualTokens(stripDeadlineFragments(sourceFacts))) {
    const normalizedToken = token.replace(/[.,]+$/u, "");
    if (!containsFactualToken(translatedFacts, normalizedToken)) errors.push(`missing factual token ${token}`);
  }
  if (field !== "summary" && title.trim().toLocaleLowerCase() === sourceTitle.trim().toLocaleLowerCase() && !isAcceptableUnchangedProperTitle(title.trim())) errors.push("translated title is unchanged");
  const originalWords = new Set((sourceFacts.match(/[A-Za-z]{3,}/gu) ?? []).map((word) => word.toLocaleLowerCase()));
  const translatedText = field === "title" ? title : field === "summary" ? summary : `${title} ${summary}`;
  const residualWords = translatedText.match(/[A-Za-z]{4,}/gu) ?? [];
  const common = new Set(["this", "that", "with", "from", "for", "the", "and", "application", "apply", "call", "craft", "prize", "award"]);
  const residualContent = residualWords.filter((word) => !originalWords.has(word.toLocaleLowerCase()) && !common.has(word.toLocaleLowerCase()) && !/^[A-Z]{2,}$/u.test(word));
  if (residualContent.length >= 6 || /(?:[A-Za-z]{4,}\s+){3,}[A-Za-z]{4,}/u.test(translatedText)) errors.push("long non-proper English residue");
  if (field !== "title" && /^(?:海外机会|来自.+的(?:赛事|资助申请|驻留或研修申请|市集或活动参与)信息)/u.test(summary.trim())) errors.push("template summary is not a translation");
  return errors;
}

export function createTranslatedOpportunityV2Translation(item: OpportunityV2, value: { title_zh: string; summary_zh: string }, now = new Date()): OpportunityV2Translation {
  const title = String(value.title_zh ?? "").trim();
  const summary = String(value.summary_zh ?? "").trim();
  const titleErrors = validateOpportunityV2Translation(item, title, "", { field: "title" });
  const summaryErrors = summary ? validateOpportunityV2Translation(item, title, summary, { field: "summary" }) : [];
  // A valid title is independently useful. A bad/empty summary is retained as
  // field-level failure and omitted by the public projection.
  if (titleErrors.length === 0) {
    return {
      opportunity_id: item.id,
      source_hash: opportunityV2SourceHash(item),
      target_language: "zh-CN",
      strategy_version: OPPORTUNITY_V2_DISPLAY_STRATEGY,
      title_zh: title,
      summary_zh: summaryErrors.length ? "" : summary,
      status: "translated",
      title_status: "translated",
      summary_status: summaryErrors.length ? "failed" : (summary ? "translated" : "unavailable"),
      ...(summaryErrors.length ? { validation_errors: summaryErrors, failure_code: "QUALITY_REJECTED" as const, error: summaryErrors.join("; ") } : {}),
      updated_at: now.toISOString(),
    };
  }
  const errors = [...titleErrors, ...summaryErrors];
  return {
    ...createFailedOpportunityV2Translation(item, errors.join("; "), now),
    validation_errors: errors,
    failure_code: "QUALITY_REJECTED",
  };
}

export function buildOpportunityV2Display(item: OpportunityV2, translations: OpportunityV2Translation[] = []): OpportunityV2Display {
  const title = cleanOpportunityDisplayText(item.title);
  const summary = displaySummary(item);
  if (!isForeignLanguageOpportunity(item)) {
    return { title: title || item.title, original_title: null, summary, original_summary: null, translated: false, translation_status: "not_needed" };
  }
  const current = findCurrentOpportunityV2Translation(item, translations);
  const cached = current && isReusableOpportunityV2Translation(item, current) ? current : undefined;
  if (cached?.title_zh) {
    const translatedSummary = cached.summary_status === "failed" || cached.summary_status === "unavailable" ? "" : cleanOpportunityDisplayText(cached.summary_zh);
    return { title: cleanOpportunityDisplayText(cached.title_zh), original_title: item.title, summary: translatedSummary, original_summary: summary || null, translated: true, translation_status: "translated" };
  }
  const safeForeignSummary = current?.summary_status === "failed" || current?.status === "failed" || current?.status === "pending" ? "" : summary;
  return { title: title || item.title, original_title: item.title, summary: safeForeignSummary, original_summary: safeForeignSummary || null, translated: false, translation_status: current?.status ?? "pending" };
}

export function isLikelyForeignText(value: string): boolean {
  return (hasKana(value) || hasHangul(value) || latinCount(value) >= 3) && !hasChinese(value);
}
