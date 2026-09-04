import type { SearchResult } from "../../search/types";

/** The quality of an item as a *current event*, rather than merely useful evidence. */
export type TriggerQualityStatus =
  | "valid_recent_trigger"
  | "evergreen_reference"
  | "generic_page"
  | "entity_mismatch"
  | "region_mismatch"
  | "stale"
  | "insufficient_event_evidence";

export interface TriggerQualityResult {
  status: TriggerQualityStatus;
  valid_for_a_gate: boolean;
  event_date: string | null;
  reasons: string[];
}

/**
 * The pipeline deliberately accepts a structural input here.  This keeps the
 * classifier usable for SearchResult, RawEvidence and fetched-page fixtures
 * without copying those domain models or mutating raw evidence.
 */
export interface TriggerQualityInput {
  title: string;
  snippet?: string | null;
  excerpt?: string | null;
  inline_content?: string | null;
  url?: string | null;
  published_at?: string | null;
  event_date?: string | null;
  source_type?: string | null;
  source_provider?: string | null;
  /** Explicit entity extracted by an upstream resolver, when available. */
  entity_name?: string | null;
  company_name?: string | null;
  candidate_region?: string | null;
  region?: string | null;
}

export interface TriggerQualityOptions {
  now?: Date;
  max_age_days?: number;
  target_company_name?: string | null;
  target_company_aliases?: string[];
  target_region?: string | null;
  target_website?: string | null;
}

const ACTION_PATTERN = /(?:\b(?:announce(?:s|d)?|announcing|launch(?:es|ed)?|open(?:s|ed)?|openings?|post(?:s|ed|ing)?|expand(?:s|ed|ing)?|establish(?:es|ed)?|build(?:s|ing)?|invest(?:s|ed|ing)?|hire|hiring|recruit(?:s|ed|ing|ment)?|appoint(?:s|ed|ment)?|fund(?:s|ed|ing)?|acqui(?:re|res|red|sition)|merge(?:s|d|r)?|license[sd]?|licen[cs]e|relocat(?:e|es|ed|ing)|restructur(?:e|es|ed|ing)|layoff(?:s)?|program(?:me)?s?|application(?:s)?|requisition(?:s)?)\b|裁员|招聘|招募|扩张|宣布|落地|设立|建设|投资|融资|并购|牌照|重组|订单)/i;
const ROLE_OR_REQUISITION_PATTERN = /(?:\b(?:requisition|req(?:uisition)?\s*#?[\w-]+|job\s*(?:id|opening)|vacanc(?:y|ies)|position|role|director|manager|head|lead|engineer|recruiter|talent acquisition|human resources|hrbp|intern|trainee|graduate|program(?:me)?)\b|招聘|岗位|职位|人才)/i;
const DATE_PATTERN = /\b(?:20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}|20\d{2}\s+(?:年\s*)?\d{1,2}\s*月\s*\d{1,2}\s*(?:日|号)?|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s+20\d{2})\b/i;
const CAREERS_PATH = /\/(?:careers?|jobs?|current-vacancies|job-openings|students-graduates)(?:[/?#]|$)/i;
const GENERIC_PAGE_PATTERN = /\b(?:corporate\s+history|our\s+history|company\s+history|treasury\s+(?:services?|products?|solutions?)|index|search\s+results?|job\s+aggregator|recruit(?:ing|ment)\s+agency|staffing\s+services?|robert\s+walters|michael\s+page)\b|(?:公司历史|企业历史|财资产品|资金管理|服务页|搜索结果|职位聚合|猎头服务)/i;
const GENERIC_PATH = /\/(?:history|about|index|search|services?|treasury)(?:[/?#]|$)/i;

/** Classify one candidate without changing or enriching the source object. */
export function evaluateTriggerQuality(input: TriggerQualityInput | SearchResult, options: TriggerQualityOptions = {}): TriggerQualityResult {
  const candidate = input as TriggerQualityInput;
  const now = options.now ?? new Date();
  const maxAgeDays = options.max_age_days ?? 60;
  const title = String(candidate.title ?? "").trim();
  const body = [title, candidate.snippet, candidate.excerpt, candidate.inline_content].filter(Boolean).join(" ");
  const eventDate = normalizeEventDate(candidate.event_date ?? candidate.published_at ?? extractDate(body, now), now);
  const reasons: string[] = [];

  // The URL/title taxonomy is intentionally evaluated before keyword/action
  // checks: a Treasury product page can contain “expansion” and still is not a
  // company event, while a careers page can contain “hiring” but be evergreen.
  if (isGenericTriggerPage(candidate.url, title, body)) {
    return result("generic_page", eventDate, ["generic reference/service page; no event relation"]);
  }

  if (hasExplicitEntityMismatch(candidate, body, options)) {
    return result("entity_mismatch", eventDate, ["event subject does not match target company"]);
  }

  if (hasRegionMismatch(candidate, body, options)) {
    return result("region_mismatch", eventDate, ["event geography does not match target region"]);
  }

  if (eventDate && isStale(eventDate, now, maxAgeDays)) {
    return result("stale", eventDate, [`event date is older than ${maxAgeDays} days`]);
  }

  const evergreen = isEvergreenCareersPage(candidate.url, title, body);
  const hasAction = ACTION_PATTERN.test(body);
  const hasConcreteRole = ROLE_OR_REQUISITION_PATTERN.test(body);
  const hasConfirmedDate = Boolean(eventDate);
  const subjectConfirmed = hasSubject(candidate, body, options);

  if (evergreen && !(hasConcreteRole && hasConfirmedDate)) {
    return result("evergreen_reference", eventDate, ["careers/jobs page is useful background but has no dated requisition"]);
  }

  // A signal must have all three relations: subject, action, and event time.
  // A role/requisition is required for evergreen recruitment pages; ordinary
  // dated company news may use its dated action as the event relation.
  if (subjectConfirmed && hasAction && hasConfirmedDate && (!evergreen || hasConcreteRole)) {
    return result("valid_recent_trigger", eventDate, ["target subject, action and recent event date are present"]);
  }

  if (!hasConfirmedDate) reasons.push("no confirmed event/posted date");
  if (!hasAction) reasons.push("no concrete event action");
  if (!subjectConfirmed) reasons.push("target company is not established as event subject");
  if (evergreen) reasons.push("evergreen careers reference cannot independently satisfy Trigger");
  return result("insufficient_event_evidence", eventDate, reasons);
}

/** Alias used by callers that phrase the operation as an assessment. */
export const assessTriggerQuality = evaluateTriggerQuality;

export function isRecentTrigger(input: TriggerQualityInput | SearchResult, options: TriggerQualityOptions = {}): boolean {
  return evaluateTriggerQuality(input, options).valid_for_a_gate;
}

export function isEvergreenCareersPage(url: string | null | undefined, title = "", body = ""): boolean {
  return CAREERS_PATH.test(url ?? "") || /\b(?:careers?|current\s+vacancies|job\s+openings?|students?\s*(?:and|&)\s*graduates?)\b|招聘入口|职位空缺/i.test(`${title} ${body}`);
}

export function isGenericTriggerPage(url: string | null | undefined, title = "", body = ""): boolean {
  return GENERIC_PAGE_PATTERN.test(`${title} ${body}`) || GENERIC_PATH.test(url ?? "");
}

function result(status: TriggerQualityStatus, eventDate: string | null, reasons: string[]): TriggerQualityResult {
  return { status, valid_for_a_gate: status === "valid_recent_trigger", event_date: eventDate, reasons };
}

function normalizeEventDate(value: string | null | undefined, now = new Date()): string | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  if (!Number.isNaN(timestamp)) return new Date(timestamp).toISOString().slice(0, 10);
  const relative = value.trim().match(/^(\d+)\s*(day|days|week|weeks|month|months)\s*ago$/i) ?? value.trim().match(/^(\d+)\s*(?:天|日|周|星期|个月)前$/i);
  if (!relative) return null;
  const amount = Number(relative[1]);
  // The Chinese relative-date branch has only one capture group; use the
  // original expression as a safe fallback instead of throwing during a
  // signal-first discovery run.
  const unit = (relative[2] ?? value).toLowerCase();
  const days = /week|周|星期/.test(unit) ? amount * 7 : /month|个月/.test(unit) ? amount * 30 : amount;
  return new Date(now.getTime() - days * 86400000).toISOString().slice(0, 10);
}

function extractDate(text: string, now = new Date()): string | null {
  const match = text.match(DATE_PATTERN)?.[0];
  return match ? normalizeEventDate(match, now) : null;
}

function isStale(value: string, now: Date, maxAgeDays: number): boolean {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) || timestamp < now.getTime() - maxAgeDays * 86400000;
}

function hasSubject(input: TriggerQualityInput, body: string, options: TriggerQualityOptions): boolean {
  const targetNames = [options.target_company_name, ...(options.target_company_aliases ?? [])].filter((v): v is string => Boolean(v));
  const explicit = input.entity_name ?? input.company_name;
  if (explicit && targetNames.length > 0) return namesEqual(explicit, targetNames);
  if (targetNames.length === 0) return Boolean(explicit) || Boolean(input.source_type === "official") || Boolean(input.url);
  const normalizedBody = normalizeForMatch(body);
  if (targetNames.some((name) => normalizedBody.includes(normalizeForMatch(name)))) return true;
  return isFirstPartyUrl(input.url, options.target_website);
}

function hasExplicitEntityMismatch(input: TriggerQualityInput, body: string, options: TriggerQualityOptions): boolean {
  const targetNames = [options.target_company_name, ...(options.target_company_aliases ?? [])].filter((v): v is string => Boolean(v));
  const explicit = input.entity_name ?? input.company_name;
  if (explicit && targetNames.length > 0 && !namesEqual(explicit, targetNames)) return true;
  // If the result is an external source and explicitly names another entity,
  // lack of target name is a safer rejection than inventing attribution.
  if (targetNames.length > 0 && input.source_type !== "official" && !targetNames.some((name) => normalizeForMatch(body).includes(normalizeForMatch(name))) && /\b(?:at|by|for|from)\s+[A-Z][\w&.-]+/.test(body)) return true;
  return false;
}

function hasRegionMismatch(input: TriggerQualityInput, body: string, options: TriggerQualityOptions): boolean {
  const target = canonicalRegion(options.target_region);
  const candidate = canonicalRegion(input.candidate_region ?? input.region) ?? inferRegion(body);
  return Boolean(target && candidate && target !== candidate);
}

function canonicalRegion(value: string | null | undefined): string | null {
  if (!value) return null;
  const text = value.toLowerCase();
  if (/hong\s*kong|香港|hk\b/.test(text)) return "hong_kong";
  if (/india|印度|mumbai|孟买|delhi|班加罗尔|bangalore|gurugram/.test(text)) return "india";
  if (/guangzhou|广州|shenzhen|深圳|dongguan|东莞|g\s*b\s*a|大湾区/.test(text)) return "gba";
  if (/china|中国|mainland|大陆/.test(text)) return "china";
  if (/singapore|新加坡/.test(text)) return "singapore";
  return null;
}

function inferRegion(body: string): string | null {
  return canonicalRegion(body);
}

function isFirstPartyUrl(url: string | null | undefined, website: string | null | undefined): boolean {
  if (!url || !website) return false;
  try {
    const left = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    const right = new URL(website).hostname.replace(/^www\./, "").toLowerCase();
    return left === right || left.endsWith(`.${right}`);
  } catch { return false; }
}

function namesEqual(value: string, names: string[]): boolean {
  const normalized = normalizeForMatch(value);
  return names.some((name) => normalizeForMatch(name) === normalized || normalized.includes(normalizeForMatch(name)) || normalizeForMatch(name).includes(normalized));
}

function normalizeForMatch(value: string): string { return value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, ""); }
