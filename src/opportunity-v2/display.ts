import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { OpportunityV2 } from "./types";
import { hasEncodingCorruption } from "../ich/aggregation/adapters/common";
import { atomicWriteJson, withJsonFileLock } from "./file-lock";

export const OPPORTUNITY_V2_DISPLAY_STRATEGY = "provider-chain-zh-v1";
export type OpportunityV2TranslationStatus = "translated" | "pending" | "failed";

export interface OpportunityV2Translation {
  opportunity_id: string;
  source_hash: string;
  target_language: "zh-CN";
  strategy_version: typeof OPPORTUNITY_V2_DISPLAY_STRATEGY;
  title_zh: string;
  summary_zh: string;
  status: OpportunityV2TranslationStatus;
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

function displaySummary(item: Pick<OpportunityV2, "summary" | "encoding_error_fields">): string {
  return item.encoding_error_fields?.includes("summary") || hasEncodingCorruption(item.summary) ? "" : item.summary;
}

function translationPath(filePath?: string): string {
  return path.resolve(filePath ?? process.env.CHANCEPING_OPPORTUNITY_V2_TRANSLATION_PATH ?? "data/opportunity-v2/translations.json");
}

export function opportunityV2SourceHash(item: Pick<OpportunityV2, "title" | "summary">): string {
  return crypto.createHash("sha256").update(`${item.title}\n${item.summary}`, "utf8").digest("hex");
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
  withJsonFileLock(target, () => atomicWriteJson(target, {
    schema_version: "chanceping-opportunity-v2.translation.v1",
    updated_at: new Date().toISOString(),
    translations,
  }));
}

function hasChinese(value: string): boolean { return /[\u3400-\u9fff]/u.test(value); }
function hasKana(value: string): boolean { return /[\u3040-\u309f\u30a1-\u30fa\u30fc]/u.test(value); }
function hasHangul(value: string): boolean { return /[\uac00-\ud7af]/u.test(value); }
function latinCount(value: string): number { return (value.match(/[A-Za-z]/gu) ?? []).length; }

/** Mixed CJK/Latin records are foreign when either field is substantively non-Chinese. */
export function isForeignLanguageOpportunity(item: Pick<OpportunityV2, "title" | "summary">): boolean {
  const title = item.title.trim();
  const summary = item.summary.trim();
  if (hasKana(title) || hasHangul(title)) return true;
  const titleLatin = latinCount(title);
  const titleChinese = (title.match(/[\u3400-\u9fff]/gu) ?? []).length;
  if (titleLatin >= 3 && (!hasChinese(title) || titleLatin >= 8 || titleLatin > titleChinese)) return true;
  if (summary && !hasChinese(summary) && (hasKana(summary) || hasHangul(summary) || latinCount(summary) >= 12)) return true;
  return false;
}

function pendingTranslation(item: OpportunityV2, now: Date, status: OpportunityV2TranslationStatus, error?: string): OpportunityV2Translation {
  return {
    opportunity_id: item.id,
    source_hash: opportunityV2SourceHash(item),
    target_language: "zh-CN",
    strategy_version: OPPORTUNITY_V2_DISPLAY_STRATEGY,
    title_zh: "",
    summary_zh: "",
    status,
    ...(error ? { error: error.slice(0, 240) } : {}),
    updated_at: now.toISOString(),
  };
}

/** No fake fallback: callers must use the configured LLM or leave this pending. */
export function createOpportunityV2Translation(item: OpportunityV2, now = new Date()): OpportunityV2Translation {
  return pendingTranslation(item, now, "pending", "translation provider is not configured");
}

export function createFailedOpportunityV2Translation(item: OpportunityV2, error: unknown, now = new Date()): OpportunityV2Translation {
  return pendingTranslation(item, now, "failed", error instanceof Error ? error.message : String(error));
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

export function validateOpportunityV2Translation(item: OpportunityV2, title: string, summary: string): string[] {
  const errors: string[] = [];
  if (!title.trim()) errors.push("empty translated title");
  if (!summary.trim()) errors.push("empty translated summary");
  if (/<(?:script|style)\b/iu.test(`${title} ${summary}`)) errors.push("markup is not allowed");
  for (const token of factualTokens(stripDeadlineFragments(`${item.title}\n${item.summary}`))) {
    const normalizedToken = token.replace(/[.,]+$/u, "");
    if (!containsFactualToken(`${title} ${summary}`, normalizedToken)) errors.push(`missing factual token ${token}`);
  }
  if (title.trim().toLocaleLowerCase() === item.title.trim().toLocaleLowerCase() && !isAcceptableUnchangedProperTitle(title.trim())) errors.push("translated title is unchanged");
  const originalWords = new Set((`${item.title} ${item.summary}`.match(/[A-Za-z]{3,}/gu) ?? []).map((word) => word.toLocaleLowerCase()));
  const residualWords = (title + " " + summary).match(/[A-Za-z]{4,}/gu) ?? [];
  const common = new Set(["this", "that", "with", "from", "for", "the", "and", "application", "apply", "call", "craft", "prize", "award"]);
  const residualContent = residualWords.filter((word) => !originalWords.has(word.toLocaleLowerCase()) && !common.has(word.toLocaleLowerCase()) && !/^[A-Z]{2,}$/u.test(word));
  if (residualContent.length >= 6 || /(?:[A-Za-z]{4,}\s+){3,}[A-Za-z]{4,}/u.test(title + " " + summary)) errors.push("long non-proper English residue");
  if (/^(?:海外机会|来自.+的(?:赛事|资助申请|驻留或研修申请|市集或活动参与)信息)/u.test(summary.trim())) errors.push("template summary is not a translation");
  return errors;
}

export function createTranslatedOpportunityV2Translation(item: OpportunityV2, value: { title_zh: string; summary_zh: string }, now = new Date()): OpportunityV2Translation {
  const title = String(value.title_zh ?? "").trim();
  const summary = String(value.summary_zh ?? "").trim();
  const errors = validateOpportunityV2Translation(item, title, summary);
  if (errors.length) return createFailedOpportunityV2Translation(item, errors.join("; "), now);
  return {
    opportunity_id: item.id,
    source_hash: opportunityV2SourceHash(item),
    target_language: "zh-CN",
    strategy_version: OPPORTUNITY_V2_DISPLAY_STRATEGY,
    title_zh: title,
    summary_zh: summary,
    status: "translated",
    updated_at: now.toISOString(),
  };
}

export function buildOpportunityV2Display(item: OpportunityV2, translations: OpportunityV2Translation[] = []): OpportunityV2Display {
  const summary = displaySummary(item);
  if (!isForeignLanguageOpportunity(item)) {
    return { title: item.title, original_title: null, summary, original_summary: null, translated: false, translation_status: "not_needed" };
  }
  const cached = translations.find((entry) => entry.opportunity_id === item.id && entry.source_hash === opportunityV2SourceHash(item) && entry.target_language === "zh-CN" && entry.strategy_version === OPPORTUNITY_V2_DISPLAY_STRATEGY);
  if (cached?.status === "translated" && cached.title_zh && cached.summary_zh) {
    return { title: cached.title_zh, original_title: item.title, summary: cached.summary_zh, original_summary: summary || null, translated: true, translation_status: "translated" };
  }
  return { title: item.title, original_title: item.title, summary, original_summary: summary || null, translated: false, translation_status: cached?.status ?? "pending" };
}

export function isLikelyForeignText(value: string): boolean {
  return (hasKana(value) || hasHangul(value) || latinCount(value) >= 3) && !hasChinese(value);
}
