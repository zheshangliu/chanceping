import fs from "node:fs";
import path from "node:path";
import { identityHash, classifyCategory, type ParsedAggregationItem } from "../ich/aggregation/adapters/common";
import { cleanGenericListingTitle } from "../ich/aggregation/adapters/generic-listing";
import { atomicWriteJson, withJsonFileLock } from "./file-lock";
import type { OpportunityV2, OpportunityV2PoolFile, V2OpportunityStatus } from "./types";
import { classifyV2Dimensions, classifyV2RadarRelevance } from "./keywords";

function poolPath(filePath?: string): string {
  const configured = filePath ?? process.env.CHANCEPING_OPPORTUNITY_V2_POOL_PATH;
  if (configured) return path.resolve(configured);
  const runtimePath = "/var/lib/chanceping/opportunity-v2/opportunities.json";
  return path.resolve(fs.existsSync(path.dirname(runtimePath)) ? runtimePath : "data/opportunity-v2/opportunities.json");
}

export function emptyOpportunityV2Pool(): OpportunityV2PoolFile {
  return { schema_version: "chanceping-opportunity-v2.v1", updated_at: new Date(0).toISOString(), opportunities: [] };
}

export function readOpportunityV2Pool(filePath?: string): OpportunityV2PoolFile {
  const target = poolPath(filePath);
  if (!fs.existsSync(target)) return emptyOpportunityV2Pool();
  try {
    const value = JSON.parse(fs.readFileSync(target, "utf8")) as OpportunityV2PoolFile;
    return Array.isArray(value.opportunities) ? value : emptyOpportunityV2Pool();
  } catch {
    return emptyOpportunityV2Pool();
  }
}

export function writeOpportunityV2Pool(pool: OpportunityV2PoolFile, filePath?: string): void {
  const target = poolPath(filePath);
  withJsonFileLock(target, () => atomicWriteJson(target, pool));
}

export function opportunityStatus(deadline: string | null, now = new Date()): V2OpportunityStatus {
  if (!deadline) return "UNKNOWN_DEADLINE";
  const timestamp = new Date(deadline).getTime();
  if (!Number.isFinite(timestamp)) return "UNKNOWN_DEADLINE";
  const day = deadline.match(/^(20\d{2}-\d{2}-\d{2})/u)?.[1];
  const nowParts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const nowDay = `${nowParts.find((part) => part.type === "year")?.value}-${nowParts.find((part) => part.type === "month")?.value}-${nowParts.find((part) => part.type === "day")?.value}`;
  if (day) return day < nowDay ? "EXPIRED" : "CURRENT";
  return timestamp < now.getTime() ? "EXPIRED" : "CURRENT";
}

export function opportunityStatusFromSourceStatus(sourceStatus: string | null | undefined): V2OpportunityStatus | null {
  const value = String(sourceStatus ?? "").trim();
  if (!value) return null;
  if (/(?:^|\b)(?:EXPIRED|已结束|已截止|已经截止|投稿已经截止|报名已结束|获奖已公布|获奖公布|结果已公布|结果公布|已公示)(?:\b|$)/iu.test(value)) return "EXPIRED";
  if (/(?:^|\b)(?:CURRENT|征稿中|报名中|招募中|投稿中|征集中|开放报名|正在征集|进行中)(?:\b|$)/iu.test(value)) return "CURRENT";
  return null;
}

function statusWithoutDeadline(item: OpportunityV2, now: Date): V2OpportunityStatus {
  const structured = opportunityStatus(item.deadline, now);
  return structured === "UNKNOWN_DEADLINE" ? item.status : structured;
}

function mergedStatus(prior: OpportunityV2, item: OpportunityV2, sameSource: boolean, now: Date): V2OpportunityStatus {
  if (item.deadline || prior.deadline) return opportunityStatus(item.deadline ?? prior.deadline, now);
  if (sameSource) return item.status;
  const statuses = [statusWithoutDeadline(prior, now), statusWithoutDeadline(item, now)];
  if (statuses.every((status) => status === "EXPIRED")) return "EXPIRED";
  if (statuses.includes("CURRENT")) return "CURRENT";
  return "UNKNOWN_DEADLINE";
}

function storedSourceCategory(item: OpportunityV2): string | null {
  if (item.source_id !== "zjmtcn-product-competition") return null;
  if (/\/zjxx\/lipin\//iu.test(item.detail_url)) return "礼品征集";
  if (/\/zjxx\/taoci\//iu.test(item.detail_url)) return "陶瓷";
  if (/\/zjxx\/chanpin\//iu.test(item.detail_url)) return "产品征集";
  return null;
}

export function refreshOpportunityV2DerivedFields(item: OpportunityV2): OpportunityV2 {
  const sourceCategory = storedSourceCategory(item);
  const sourceSpecificScope = item.source_id === "cnyisai-competition";
  if (!sourceCategory && !sourceSpecificScope) return item;
  const categoryInput = sourceCategory ?? item.category;
  const category = classifyCategory(categoryInput, item.title);
  const relevance = classifyV2RadarRelevance(item.title, item.summary, categoryInput);
  const dimensions = classifyV2Dimensions(item.title, item.summary, category);
  return {
    ...item,
    category,
    tags: [...new Set([...item.tags, ...relevance.tags])].slice(0, 8),
    radar_relevance: relevance.relevance,
    directions: dimensions.directions,
    work_formats: dimensions.work_formats,
    participation_scope: dimensions.participation_scope,
    participation_mode: item.participation_mode && item.participation_mode !== "unspecified" ? item.participation_mode : dimensions.participation_mode,
  };
}

/** Formats source date-only values without shifting the published calendar day. */
export function formatOpportunityV2Date(value: string | null | undefined): string {
  if (!value) return "";
  const dateOnly = value.match(/^(20\d{2})-(\d{2})-(\d{2})/u);
  if (dateOnly) return `${dateOnly[1]}/${Number(dateOnly[2])}/${Number(dateOnly[3])}`;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "numeric", day: "numeric" }).format(parsed);
}

export function canonicalOpportunityTitle(title: string): string {
  let normalized = cleanGenericListingTitle(title).normalize("NFKC").toLowerCase().trim();
  normalized = normalized
    .replace(/[（(【\[][^）)】\]]*(?:截至|截止|截稿|报名)[^）)】\]]*[）)】\]]/gu, " ")
    .replace(/(?:截至|截稿至|截止时间?|报名截止|征集时间)\s*[:：]?\s*(?:20\d{2}[年./-]\d{1,2}[月./-]\d{1,2}日?|\d{1,2}[月./-]\d{1,2}日?)\s*$/u, " ");
  const wrappers = /(?:报名通知|报名启事|征集启事|征稿通知|征集令|正式启动|报名开始|开始报名|公开征集|作品征集|征集活动|启动招募|等你来战|来了)$/u;
  while (wrappers.test(normalized)) normalized = normalized.replace(wrappers, "").trim();
  const years = normalized.match(/20\d{2}/gu) ?? [];
  normalized = normalized.replace(/20\d{2}年?/gu, "");
  return `${normalized.replace(/[^\p{L}\p{N}]+/gu, "")}${years.join("")}`;
}

function crossSourceTitleKey(title: string): string | null {
  const normalized = canonicalOpportunityTitle(title);
  return normalized || null;
}

function conciseSummary(summary: string, title: string): string {
  const cleaned = summary.replace(title, "").replace(/\s+/gu, " ").trim();
  return (cleaned || "来源页面未提供更详细摘要。").slice(0, 360);
}

function hasUsableSummary(summary: string | null | undefined, title: string): boolean {
  return Boolean(summary?.replace(title, "").replace(/\s+/gu, " ").trim());
}

const CFW_SOURCE_ID = "cfw-cultural-ip";

function mergeOpportunityRecords(prior: OpportunityV2, item: OpportunityV2, now: Date): OpportunityV2 {
  const preferIncoming = item.source_id === "loewe-craft-prize" && prior.source_id !== "loewe-craft-prize";
  const sameCfwDetail = item.source_id === CFW_SOURCE_ID && prior.source_id === CFW_SOURCE_ID && item.detail_url === prior.detail_url;
  const deadline = sameCfwDetail && item.deadline ? item.deadline : (item.deadline ?? prior.deadline);
  const mergedTitle = preferIncoming ? item.title : cleanGenericListingTitle(prior.title);
  const mergedSummary = hasUsableSummary(item.summary, item.title) ? conciseSummary(item.summary, item.title) : conciseSummary(prior.summary, prior.title);
  const category = item.category === "competition" && prior.category !== "competition" ? prior.category : (item.category || prior.category);
  const derived = classifyV2Dimensions(mergedTitle, mergedSummary, category);
  const relevance = classifyV2RadarRelevance(mergedTitle, mergedSummary, category);
  const sameSource = item.source_id === prior.source_id;
  return {
    ...prior,
    ...(preferIncoming ? { title: item.title, detail_url: item.detail_url, source_url: item.source_url, source_id: item.source_id, source_name: item.source_name } : {}),
    title: mergedTitle,
    summary: mergedSummary,
    source_item_id: prior.source_item_id ?? item.source_item_id,
    category,
    deadline,
    deadline_text: item.deadline_text ?? prior.deadline_text ?? null,
    deadline_source_url: item.deadline_source_url ?? prior.deadline_source_url ?? null,
    deadline_raw_text: item.deadline_raw_text ?? prior.deadline_raw_text ?? item.deadline_text ?? prior.deadline_text ?? null,
    deadline_checked_at: item.deadline_checked_at ?? prior.deadline_checked_at ?? null,
    deadline_resolution: deadline ? "found" : (item.deadline_resolution ?? prior.deadline_resolution ?? "not_attempted"),
    status: mergedStatus({ ...prior, deadline }, item, sameSource, now),
    first_seen_at: prior.first_seen_at,
    last_seen_at: now.toISOString(),
    discovered_by_sources: [...new Set([...prior.discovered_by_sources, ...item.discovered_by_sources])],
    tags: [...new Set([...prior.tags, ...item.tags, ...relevance.tags])].slice(0, 8),
    radar_relevance: relevance.relevance === "IRRELEVANT" && prior.radar_relevance === "RELEVANT" ? prior.radar_relevance : relevance.relevance,
    source_url: preferIncoming ? item.source_url : (prior.source_url || item.source_url),
    source_name: preferIncoming ? item.source_name : (prior.source_name || item.source_name),
    ...(item.directions?.length || prior.directions?.length || derived.directions.length ? { directions: [...new Set([...(prior.directions ?? []), ...(item.directions ?? []), ...derived.directions])] } : {}),
    ...(item.work_formats?.length || prior.work_formats?.length || derived.work_formats.length ? { work_formats: [...new Set([...(prior.work_formats ?? []), ...(item.work_formats ?? []), ...derived.work_formats])] } : {}),
    event_location: item.event_location?.trim() || prior.event_location || derived.event_location || null,
    participation_scope: sameSource
      ? (item.participation_scope && item.participation_scope !== "unspecified" ? item.participation_scope : derived.participation_scope)
      : (item.participation_scope && item.participation_scope !== "unspecified"
        ? item.participation_scope
        : (prior.participation_scope && prior.participation_scope !== "unspecified" ? prior.participation_scope : derived.participation_scope)),
    participation_mode: item.participation_mode && item.participation_mode !== "unspecified" ? item.participation_mode : (prior.participation_mode ?? derived.participation_mode),
    is_long_term: Boolean(prior.is_long_term || item.is_long_term),
    starts_at: item.starts_at ?? prior.starts_at ?? null,
  };
}

export function normalizeOpportunityV2(input: ParsedAggregationItem, source: { id: string; name: string; region: "CN" | "GLOBAL"; types?: string[] }, now = new Date()): OpportunityV2 {
  const title = cleanGenericListingTitle(input.title) || input.title.trim();
  const summary = conciseSummary(input.raw_text.replace(/\s+/gu, " ").trim(), title);
  const categoryInput = [input.source_category, ...(source.types ?? [])].filter(Boolean).join(" ");
  const category = classifyCategory(categoryInput, input.title);
  const relevance = classifyV2RadarRelevance(title, summary, input.source_category ?? "");
  const dimensions = classifyV2Dimensions(title, summary, category);
  const identity = identityHash(title, input.deadline_at ?? "", input.organizer ?? "");
  const structuredStatus = opportunityStatus(input.deadline_at, now);
  const status = structuredStatus === "UNKNOWN_DEADLINE"
    ? (opportunityStatusFromSourceStatus(input.source_status) ?? structuredStatus)
    : structuredStatus;
  return {
    id: `oppv2_${identity}`,
    title,
    summary,
    source_id: source.id,
    source_item_id: input.source_item_id,
    source_name: source.name,
    source_url: input.source_url,
    detail_url: input.detail_url,
    category,
    region: source.region,
    tags: relevance.tags,
    deadline: input.deadline_at,
    deadline_text: input.deadline_text,
    deadline_source_url: input.deadline_source_url ?? null,
    deadline_raw_text: input.deadline_raw_text ?? input.deadline_text ?? null,
    deadline_checked_at: input.deadline_checked_at ?? null,
    deadline_resolution: input.deadline_resolution ?? (input.deadline_at ? "found" : "not_attempted"),
    status,
    first_seen_at: now.toISOString(),
    last_seen_at: now.toISOString(),
    discovered_by_sources: [source.id],
    radar_relevance: relevance.relevance,
    ...(input.organizer ? { organizer: input.organizer } : {}),
    ...(input.application_url ? { application_url: input.application_url } : {}),
    directions: dimensions.directions,
    work_formats: dimensions.work_formats,
    event_location: input.event_location ?? dimensions.event_location,
    participation_scope: input.participation_scope && input.participation_scope !== "unspecified" ? input.participation_scope : dimensions.participation_scope,
    participation_mode: input.participation_mode ?? dimensions.participation_mode,
    is_long_term: input.is_long_term ?? false,
    starts_at: input.starts_at ?? null,
  };
}

export function mergeOpportunityV2(existing: OpportunityV2[], incoming: OpportunityV2[], now = new Date()): OpportunityV2[] {
  const byKey = new Map<string, OpportunityV2>();
  const cfwDetailKeys = new Map<string, string>();
  for (const item of [...existing, ...incoming]) {
    const titleKey = crossSourceTitleKey(item.title) ?? `url:${item.source_id}:${item.detail_url}`;
    const cfwDetailKey = item.source_id === CFW_SOURCE_ID ? item.detail_url : null;
    const key = cfwDetailKey ? (cfwDetailKeys.get(cfwDetailKey) ?? titleKey) : titleKey;
    const prior = byKey.get(key);
    byKey.set(key, prior ? mergeOpportunityRecords(prior, item, now) : { ...item, status: item.status });
    if (cfwDetailKey) cfwDetailKeys.set(cfwDetailKey, key);
  }
  return [...byKey.values()].map(refreshOpportunityV2DerivedFields);
}

export function deduplicateOpportunityV2(items: OpportunityV2[]): { opportunities: OpportunityV2[]; duplicate_count: number } {
  const byIdentity = new Map<string, OpportunityV2>();
  const cfwDetailKeys = new Map<string, string>();
  let duplicate_count = 0;
  for (const item of items) {
    const titleKey = crossSourceTitleKey(item.title) ?? identityHash(item.title, item.deadline ?? "", item.organizer ?? "");
    const cfwDetailKey = item.source_id === CFW_SOURCE_ID ? item.detail_url : null;
    const key = cfwDetailKey ? (cfwDetailKeys.get(cfwDetailKey) ?? titleKey) : titleKey;
    const prior = byIdentity.get(key);
    if (!prior) {
      byIdentity.set(key, item);
      if (cfwDetailKey) cfwDetailKeys.set(cfwDetailKey, key);
      continue;
    }
    duplicate_count += 1;
    byIdentity.set(key, {
      ...prior,
      discovered_by_sources: [...new Set([...prior.discovered_by_sources, ...item.discovered_by_sources])],
      source_item_id: prior.source_item_id ?? item.source_item_id,
      tags: [...new Set([...prior.tags, ...item.tags])].slice(0, 8),
      summary: conciseSummary(item.summary, item.title) || conciseSummary(prior.summary, prior.title),
      deadline_text: item.deadline_text ?? prior.deadline_text ?? null,
      deadline_source_url: item.deadline_source_url ?? prior.deadline_source_url ?? null,
      deadline_raw_text: item.deadline_raw_text ?? prior.deadline_raw_text ?? item.deadline_text ?? prior.deadline_text ?? null,
      deadline_checked_at: item.deadline_checked_at ?? prior.deadline_checked_at ?? null,
      deadline_resolution: item.deadline ? "found" : (item.deadline_resolution ?? prior.deadline_resolution ?? "not_attempted"),
      ...(prior.detail_url ? {} : { detail_url: item.detail_url }),
      directions: [...new Set([...(prior.directions ?? []), ...(item.directions ?? [])])],
      work_formats: [...new Set([...(prior.work_formats ?? []), ...(item.work_formats ?? [])])],
      event_location: prior.event_location || item.event_location || null,
      participation_scope: prior.participation_scope && prior.participation_scope !== "unspecified" ? prior.participation_scope : item.participation_scope,
      participation_mode: prior.participation_mode && prior.participation_mode !== "unspecified" ? prior.participation_mode : item.participation_mode,
      status: mergedStatus(prior, item, prior.source_id === item.source_id, new Date()),
    });
    if (cfwDetailKey) cfwDetailKeys.set(cfwDetailKey, key);
  }
  return { opportunities: [...byIdentity.values()], duplicate_count };
}
