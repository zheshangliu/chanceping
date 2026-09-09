import fs from "node:fs";
import path from "node:path";
import { encodingErrorFields, hasEncodingCorruption, identityHash, classifyCategory, inferDeadlineKind, normalizeUrl, type DeadlineKind, type ParsedAggregationItem } from "../ich/aggregation/adapters/common";
import { cleanGenericListingTitle } from "../ich/aggregation/adapters/generic-listing";
import { atomicWriteJson, withJsonFileLock } from "./file-lock";
import type { OpportunityV2, OpportunityV2PoolFile, V2DeadlineConflict, V2DeadlineKind, V2DeadlineResolution, V2OpportunityStatus } from "./types";
import { classifyV2Dimensions, classifyV2RadarRelevance } from "./keywords";
import { isCraftRelevantProcurement } from "./procurement";

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
    return Array.isArray(value.opportunities) ? { ...value, opportunities: reconcileOpportunityV2Deadlines(value.opportunities) } : emptyOpportunityV2Pool();
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

function mergedStatusWithoutConflict(prior: OpportunityV2, item: OpportunityV2, sameSource: boolean, now: Date): V2OpportunityStatus {
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
  const wrappers = /(?:报名通知|报名启事|征集启事|征稿通知|征集令|正式启动|报名开始|开始报名|公开征集|作品征集|征集(?:活动)?(?:正式)?(?:启动|开启|招募)?|启动招募|等你来战|来了)$/u;
  while (wrappers.test(normalized)) normalized = normalized.replace(wrappers, "").trim();
  const years = normalized.match(/20\d{2}/gu) ?? [];
  normalized = normalized.replace(/20\d{2}年?/gu, "");
  return `${normalized.replace(/[^\p{L}\p{N}]+/gu, "")}${years.join("")}`;
}

function crossSourceTitleKey(title: string): string | null {
  const normalized = canonicalOpportunityTitle(title);
  return normalized || null;
}

function yearlessTitleKey(title: string): string {
  return canonicalOpportunityTitle(title).replace(/20\d{2}/gu, "");
}

function hasExplicitYear(title: string): boolean {
  return /20\d{2}/u.test(title);
}

function findYearlessAlias<T extends { title: string; source_id: string; discovered_by_sources: string[] }>(entries: Iterable<[string, T]>, item: T): string | null {
  const key = yearlessTitleKey(item.title);
  if (!key) return null;
  const itemHasYear = hasExplicitYear(item.title);
  for (const [candidateKey, candidate] of entries) {
    const crossSource = candidate.source_id !== item.source_id || candidate.discovered_by_sources.some((sourceId) => sourceId !== item.source_id);
    if (crossSource && yearlessTitleKey(candidate.title) === key && hasExplicitYear(candidate.title) !== itemHasYear) return candidateKey;
  }
  return null;
}

function sameSourceRecordKey(item: OpportunityV2): string {
  return `source:${item.source_id}:${item.detail_url}`;
}

function conciseSummary(summary: string, title: string): string {
  const cleaned = summary.replace(title, "").replace(/\s+/gu, " ").trim();
  return (cleaned || "来源页面未提供更详细摘要。").slice(0, 360);
}

function hasUsableSummary(summary: string | null | undefined, title: string): boolean {
  return Boolean(summary?.replace(title, "").replace(/\s+/gu, " ").trim());
}

export interface DeadlineBundle {
  deadline: string | null;
  deadline_text: string | null;
  deadline_source_url: string | null;
  deadline_raw_text: string | null;
  deadline_checked_at: string | null;
  deadline_resolution: V2DeadlineResolution;
  deadline_kind: V2DeadlineKind | null;
  source_id: string;
  detail_url: string;
  evidence_strength: number;
}

export interface DeadlineSelection {
  selected: DeadlineBundle;
  unsafe: boolean;
}

const DEADLINE_KIND_PRIORITY: Record<V2DeadlineKind, number> = {
  submission_deadline: 1,
  application_deadline: 2,
  registration_deadline: 3,
  deadline: 4,
};

function asV2DeadlineKind(value: DeadlineKind | V2DeadlineKind | null | undefined): V2DeadlineKind | null {
  return value ? value as V2DeadlineKind : null;
}

function inferV2DeadlineKind(value: string | null | undefined): V2DeadlineKind | null {
  return asV2DeadlineKind(inferDeadlineKind(value));
}

function deadlineEvidenceStrength(resolution: V2DeadlineResolution, sourceUrl: string | null, detailUrl: string): number {
  if (resolution === "found_detail") return 3;
  if (resolution === "found_listing") return 2;
  if (resolution === "found_cross_source") return 1;
  if (sourceUrl && normalizeUrl(sourceUrl, detailUrl) === normalizeUrl(detailUrl, detailUrl)) return 3;
  return resolution === "date_conflict" ? 3 : 1;
}

function deadlineBundleFromOpportunity(item: OpportunityV2): DeadlineBundle {
  const resolution = item.deadline_resolution ?? (item.deadline ? "found" : "not_attempted");
  const sourceUrl = item.deadline_source_url ?? (item.deadline ? item.detail_url : null);
  return {
    deadline: item.deadline ?? null,
    deadline_text: item.deadline_text ?? null,
    deadline_source_url: sourceUrl,
    deadline_raw_text: item.deadline_raw_text ?? item.deadline_text ?? null,
    deadline_checked_at: item.deadline_checked_at ?? null,
    deadline_resolution: resolution,
    deadline_kind: item.deadline_kind ?? inferV2DeadlineKind(item.deadline_raw_text ?? item.deadline_text) ?? (item.deadline ? "deadline" : null),
    source_id: item.source_id,
    detail_url: item.detail_url,
    evidence_strength: deadlineEvidenceStrength(resolution, sourceUrl, item.detail_url),
  };
}

function deadlineBundleFromParsed(input: ParsedAggregationItem, sourceId: string): DeadlineBundle {
  const resolution = input.deadline_resolution ?? (input.deadline_at ? "found" : "not_attempted");
  const sourceUrl = input.deadline_source_url ?? (input.deadline_at ? input.detail_url : null);
  return {
    deadline: input.deadline_at ?? null,
    deadline_text: input.deadline_text ?? null,
    deadline_source_url: sourceUrl,
    deadline_raw_text: input.deadline_raw_text ?? input.deadline_text ?? null,
    deadline_checked_at: input.deadline_checked_at ?? null,
    deadline_resolution: resolution,
    deadline_kind: asV2DeadlineKind(input.deadline_kind) ?? inferV2DeadlineKind(input.deadline_raw_text ?? input.deadline_text) ?? (input.deadline_at ? "deadline" : null),
    source_id: sourceId,
    detail_url: input.detail_url,
    evidence_strength: deadlineEvidenceStrength(resolution, sourceUrl, input.detail_url),
  };
}

function deadlineBundleFromConflict(conflict: V2DeadlineConflict, parent: DeadlineBundle): DeadlineBundle {
  const sourceUrl = conflict.source_url ?? parent.deadline_source_url;
  const resolution: V2DeadlineResolution = sourceUrl && normalizeUrl(sourceUrl, parent.detail_url) === normalizeUrl(parent.detail_url, parent.detail_url) ? "found_detail" : "found_cross_source";
  return {
    deadline: conflict.conflicting_deadline,
    deadline_text: conflict.evidence || null,
    deadline_source_url: sourceUrl ?? null,
    deadline_raw_text: conflict.evidence || null,
    deadline_checked_at: null,
    deadline_resolution: resolution,
    deadline_kind: asV2DeadlineKind(conflict.kind) ?? inferV2DeadlineKind(conflict.evidence) ?? "deadline",
    source_id: parent.source_id,
    detail_url: parent.detail_url,
    evidence_strength: deadlineEvidenceStrength(resolution, sourceUrl ?? null, parent.detail_url),
  };
}

function evidenceCalendarDays(value: string | null | undefined): string[] {
  if (!value) return [];
  const normalized = value.replace(/[年月]/gu, "-").replace(/日/gu, "").replace(/[./]/gu, "-").replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/gu, "-");
  const days = [...normalized.matchAll(/(?<!\d)(20\d{2})-(\d{1,2})-(\d{1,2})\s*(?:-|~|～|至)\s*(?:(20\d{2})-)?(\d{1,2})-(\d{1,2})(?!\d)/gu)].flatMap((match) => {
    const start = `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
    const end = `${match[4] ?? match[1]}-${match[5].padStart(2, "0")}-${match[6].padStart(2, "0")}`;
    return [start, end];
  });
  const singleDays = [...normalized.matchAll(/(?<!\d)(20\d{2})-(\d{1,2})-(\d{1,2})(?!\d)/gu)].map((match) => `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`);
  return [...new Set([...days, ...singleDays])];
}

function deadlineMatchesEvidence(bundle: DeadlineBundle): boolean {
  if (!bundle.deadline || !bundle.deadline_raw_text) return true;
  const days = evidenceCalendarDays(bundle.deadline_raw_text);
  if (!days.length) return true;
  return days.includes(bundle.deadline.slice(0, 10));
}

function emptyDeadlineBundle(reference: DeadlineBundle, kind: V2DeadlineKind | null): DeadlineBundle {
  return { ...reference, deadline: null, deadline_text: null, deadline_source_url: null, deadline_raw_text: null, deadline_checked_at: null, deadline_resolution: "date_conflict", deadline_kind: kind, evidence_strength: 0 };
}

function safeResolution(bundle: DeadlineBundle, crossSource: boolean): V2DeadlineResolution {
  if (crossSource) return "found_cross_source";
  if (bundle.deadline_resolution !== "date_conflict") return bundle.deadline_resolution;
  return bundle.deadline_source_url && normalizeUrl(bundle.deadline_source_url, bundle.detail_url) === normalizeUrl(bundle.detail_url, bundle.detail_url)
    ? "found_detail"
    : "found_listing";
}

function isPastDeadline(bundle: DeadlineBundle, now: Date): boolean {
  return Boolean(bundle.deadline && new Date(bundle.deadline).getTime() < now.getTime());
}

/**
 * Select one deadline together with all of its evidence. Semantic priority is
 * stronger than date recency; same-kind disagreements stay unknown unless
 * one evidence source is clearly stronger. Past-vs-current conflicts are
 * treated as historical evidence when a current candidate exists.
 */
export function selectDeadlineBundle(candidates: DeadlineBundle[], now = new Date()): DeadlineSelection {
  const dated = candidates.filter((candidate) => Boolean(candidate.deadline));
  const validDated = dated.filter(deadlineMatchesEvidence);
  if (!validDated.length) {
    if (!dated.length) return { selected: candidates[0] ?? emptyDeadlineBundle({ deadline: null, deadline_text: null, deadline_source_url: null, deadline_raw_text: null, deadline_checked_at: null, deadline_resolution: "not_attempted", deadline_kind: null, source_id: "", detail_url: "", evidence_strength: 0 }, null), unsafe: false };
    return { selected: emptyDeadlineBundle(dated[0], dated[0].deadline_kind), unsafe: true };
  }
  const usable = validDated;
  const current = usable.filter((candidate) => !isPastDeadline(candidate, now));
  const pool = current.length ? current : usable;
  const bestKindPriority = Math.min(...pool.map((candidate) => DEADLINE_KIND_PRIORITY[candidate.deadline_kind ?? "deadline"]));
  const sameKind = pool.filter((candidate) => DEADLINE_KIND_PRIORITY[candidate.deadline_kind ?? "deadline"] === bestKindPriority);
  const bestStrength = Math.max(...sameKind.map((candidate) => candidate.evidence_strength));
  const strongest = sameKind.filter((candidate) => candidate.evidence_strength === bestStrength);
  const dates = new Set(strongest.map((candidate) => candidate.deadline));
  if (dates.size === 1) {
    const selected = strongest[0];
    const crossSource = strongest.some((candidate) => candidate.source_id !== selected.source_id);
    return { selected: { ...selected, deadline_resolution: safeResolution(selected, crossSource) }, unsafe: false };
  }
  return { selected: emptyDeadlineBundle(strongest[0], asV2DeadlineKind(strongest[0].deadline_kind)), unsafe: true };
}

function normalizedDeadlineConflicts(conflicts: V2DeadlineConflict[]): V2DeadlineConflict[] {
  return conflicts
    .map((conflict) => ({ ...conflict, kind: asV2DeadlineKind(conflict.kind) ?? inferV2DeadlineKind(conflict.evidence) ?? "deadline" }))
    .filter((conflict, index, all) => all.findIndex((candidate) => candidate.conflicting_deadline === conflict.conflicting_deadline && candidate.evidence === conflict.evidence && candidate.source_url === conflict.source_url && candidate.kind === conflict.kind) === index);
}

function appendDeadlineConflict(conflicts: V2DeadlineConflict[], selected: DeadlineBundle, candidate: DeadlineBundle): V2DeadlineConflict[] {
  if (!candidate.deadline || candidate.deadline === selected.deadline) return conflicts;
  const next: V2DeadlineConflict = {
    stored_deadline: selected.deadline,
    conflicting_deadline: candidate.deadline,
    evidence: candidate.deadline_raw_text ?? candidate.deadline_text ?? "",
    source_url: candidate.deadline_source_url,
    kind: candidate.deadline_kind,
  };
  const exists = conflicts.some((conflict) => conflict.conflicting_deadline === next.conflicting_deadline && conflict.evidence === next.evidence && conflict.source_url === next.source_url);
  return exists ? conflicts : [...conflicts, next];
}

function deadlineFields(selected: DeadlineBundle, unsafe: boolean): Pick<OpportunityV2, "deadline" | "deadline_text" | "deadline_source_url" | "deadline_raw_text" | "deadline_checked_at" | "deadline_resolution" | "deadline_kind" | "deadline_conflict_unsafe"> {
  return {
    deadline: selected.deadline,
    deadline_text: selected.deadline_text,
    deadline_source_url: selected.deadline_source_url,
    deadline_raw_text: selected.deadline_raw_text,
    deadline_checked_at: selected.deadline_checked_at,
    deadline_resolution: selected.deadline_resolution,
    deadline_kind: selected.deadline_kind,
    deadline_conflict_unsafe: unsafe,
  };
}

export function reconcileOpportunityV2Deadlines(items: OpportunityV2[], now = new Date()): OpportunityV2[] {
  return items.map((item) => {
    const base = deadlineBundleFromOpportunity(item);
    if (!(item.deadline_conflicts?.length)) return withEncodingMetadata({ ...item, ...deadlineFields(base, false) });
    const conflicts = normalizedDeadlineConflicts(item.deadline_conflicts);
    const candidates = [base, ...conflicts.map((conflict) => deadlineBundleFromConflict(conflict, base))];
    const selection = selectDeadlineBundle(candidates, now);
    // Reconciliation can encounter legacy rows where the stored conflict list
    // repeats the selected date (for example, a listing and detail page both
    // reported the same day). Keep only real alternatives after selecting the
    // atomic evidence bundle.
    const allConflicts = conflicts.reduce((acc, conflict, index) => appendDeadlineConflict(acc, selection.selected, candidates[index + 1]), [] as V2DeadlineConflict[]);
    const status = selection.selected.deadline ? opportunityStatus(selection.selected.deadline, now) : "UNKNOWN_DEADLINE";
    return withEncodingMetadata({ ...item, ...deadlineFields(selection.selected, selection.unsafe), deadline_conflicts: allConflicts, status });
  });
}

function withEncodingMetadata(item: OpportunityV2): OpportunityV2 {
  const fields = encodingErrorFields(item.title, item.summary);
  return { ...item, encoding_error: fields.length > 0, encoding_error_fields: fields };
}

function sourceIdentityAliases(item: Pick<OpportunityV2, "source_id" | "source_item_id" | "detail_url" | "source_url">): string[] {
  const aliases: string[] = [];
  const sourceItemId = item.source_item_id?.trim();
  if (sourceItemId) aliases.push(`${item.source_id}|item:${sourceItemId}`);
  const detailUrl = normalizeUrl(item.detail_url, item.source_url);
  if (detailUrl) aliases.push(`${item.source_id}|url:${detailUrl}`);
  return aliases;
}

function mergeTitleText(prior: string, incoming: string, preferIncoming: boolean): string {
  if (hasEncodingCorruption(prior) && !hasEncodingCorruption(incoming)) return incoming;
  if (!hasEncodingCorruption(prior) && hasEncodingCorruption(incoming)) return cleanGenericListingTitle(prior);
  return preferIncoming ? incoming : cleanGenericListingTitle(prior);
}

function mergeSummaryText(prior: string, incoming: string, priorTitle: string, incomingTitle: string): string {
  if (hasEncodingCorruption(prior) && !hasEncodingCorruption(incoming)) return conciseSummary(incoming, incomingTitle);
  if (!hasEncodingCorruption(prior) && hasEncodingCorruption(incoming)) return conciseSummary(prior, priorTitle);
  return hasUsableSummary(incoming, incomingTitle) ? conciseSummary(incoming, incomingTitle) : conciseSummary(prior, priorTitle);
}

const CFW_SOURCE_ID = "cfw-cultural-ip";

function mergeOpportunityRecords(prior: OpportunityV2, item: OpportunityV2, now: Date): OpportunityV2 {
  const preferIncoming = item.source_id === "loewe-craft-prize" && prior.source_id !== "loewe-craft-prize";
  const priorDeadline = deadlineBundleFromOpportunity(prior);
  const incomingDeadline = deadlineBundleFromOpportunity(item);
  const deadlineSelection = selectDeadlineBundle([priorDeadline, incomingDeadline], now);
  const deadlineConflicts = [
    ...normalizedDeadlineConflicts([...(prior.deadline_conflicts ?? []), ...(item.deadline_conflicts ?? [])]),
  ].reduce((acc, conflict) => appendDeadlineConflict(acc, deadlineSelection.selected, deadlineBundleFromConflict(conflict, priorDeadline)), [] as V2DeadlineConflict[]);
  const withDirectConflict = appendDeadlineConflict(deadlineConflicts, deadlineSelection.selected, priorDeadline);
  const allDeadlineConflicts = appendDeadlineConflict(withDirectConflict, deadlineSelection.selected, incomingDeadline);
  const mergedTitle = mergeTitleText(prior.title, item.title, preferIncoming);
  const mergedSummary = mergeSummaryText(prior.summary, item.summary, prior.title, item.title);
  // A cross-source record is still a competition when either source
  // classified the same opportunity as one. Do not let a broader source
  // taxonomy such as `grant` demote a real contest out of the public module.
  const category = prior.category === "competition" || item.category === "competition" ? "competition" : (item.category || prior.category);
  const derived = classifyV2Dimensions(mergedTitle, mergedSummary, category);
  const procurement = item.procurement ?? prior.procurement;
  const procurementRelevant = procurement ? isCraftRelevantProcurement(`${mergedTitle} ${mergedSummary}`) : false;
  const relevance = category === "procurement_project" && procurement && procurement.direction !== "seller_offer" && procurementRelevant
    ? { relevance: "RELEVANT" as const, tags: ["procurement"] }
    : classifyV2RadarRelevance(mergedTitle, mergedSummary, category);
  const sameSource = item.source_id === prior.source_id;
  const mergedStatus = deadlineSelection.selected.deadline ? opportunityStatus(deadlineSelection.selected.deadline, now) : deadlineSelection.unsafe ? "UNKNOWN_DEADLINE" : mergedStatusWithoutConflict(prior, item, sameSource, now);
  return withEncodingMetadata({
    ...prior,
    ...(preferIncoming ? { title: item.title, detail_url: item.detail_url, source_url: item.source_url, source_id: item.source_id, source_name: item.source_name } : {}),
    title: mergedTitle,
    summary: mergedSummary,
    source_item_id: prior.source_item_id ?? item.source_item_id,
    category,
    ...deadlineFields(deadlineSelection.selected, deadlineSelection.unsafe),
    deadline_conflicts: allDeadlineConflicts,
    status: mergedStatus,
    first_seen_at: prior.first_seen_at,
    last_seen_at: now.toISOString(),
    discovered_by_sources: [...new Set([...prior.discovered_by_sources, ...item.discovered_by_sources])],
    tags: [...new Set([...prior.tags, ...item.tags, ...relevance.tags])].slice(0, 8),
    radar_relevance: category === "procurement_project" && procurement ? (procurementRelevant ? "RELEVANT" : "IRRELEVANT") : (relevance.relevance === "IRRELEVANT" && prior.radar_relevance === "RELEVANT" ? prior.radar_relevance : relevance.relevance),
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
    ...(procurement ? { procurement } : {}),
  });
}

export function normalizeOpportunityV2(input: ParsedAggregationItem, source: { id: string; name: string; region: "CN" | "GLOBAL"; types?: string[] }, now = new Date()): OpportunityV2 {
  const title = cleanGenericListingTitle(input.title) || input.title.trim();
  const summary = conciseSummary(input.raw_text.replace(/\s+/gu, " ").trim(), title);
  const categoryInput = [input.source_category, ...(source.types ?? [])].filter(Boolean).join(" ");
  const category = classifyCategory(categoryInput, input.title);
  const procurementRelevant = input.procurement ? isCraftRelevantProcurement(`${title} ${summary}`) : false;
  const relevance = category === "procurement_project" && input.procurement && input.procurement.direction !== "seller_offer" && procurementRelevant
    ? { relevance: "RELEVANT" as const, tags: ["procurement"] }
    : classifyV2RadarRelevance(title, summary, input.source_category ?? "");
  const dimensions = classifyV2Dimensions(title, summary, category);
  const parsedDeadline = deadlineBundleFromParsed(input, source.id);
  const parsedConflicts = normalizedDeadlineConflicts((input.deadline_conflicts ?? []) as V2DeadlineConflict[]);
  const deadlineSelection = parsedDeadline.deadline
    ? selectDeadlineBundle([parsedDeadline, ...parsedConflicts.map((conflict) => deadlineBundleFromConflict(conflict, parsedDeadline))], now)
    : { selected: parsedDeadline, unsafe: false };
  const identity = identityHash(title, deadlineSelection.selected.deadline ?? "", input.organizer ?? "");
  const structuredStatus = deadlineSelection.selected.deadline ? opportunityStatus(deadlineSelection.selected.deadline, now) : "UNKNOWN_DEADLINE";
  const status = deadlineSelection.unsafe
    ? "UNKNOWN_DEADLINE"
    : structuredStatus === "UNKNOWN_DEADLINE"
    ? (opportunityStatusFromSourceStatus(input.source_status) ?? structuredStatus)
    : structuredStatus;
  return withEncodingMetadata({
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
    ...deadlineFields(deadlineSelection.selected, deadlineSelection.unsafe),
    deadline_conflicts: parsedConflicts,
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
    ...(input.procurement ? { procurement: input.procurement } : {}),
  });
}

export function mergeOpportunityV2(existing: OpportunityV2[], incoming: OpportunityV2[], now = new Date()): OpportunityV2[] {
  const byKey = new Map<string, OpportunityV2>();
  const cfwDetailKeys = new Map<string, string>();
  const sourceIdentityKeys = new Map<string, string>();
  for (const item of [...existing, ...incoming]) {
    const titleKey = crossSourceTitleKey(item.title) ?? `url:${item.source_id}:${item.detail_url}`;
    const cfwDetailKey = item.source_id === CFW_SOURCE_ID ? item.detail_url : null;
    const sourceKeys = sourceIdentityAliases(item);
    const existingSourceKey = sourceKeys.map((candidate) => sourceIdentityKeys.get(candidate)).find(Boolean);
    const key = existingSourceKey
      ? existingSourceKey
      : cfwDetailKey ? (cfwDetailKeys.get(cfwDetailKey) ?? titleKey) : (byKey.get(titleKey) ? titleKey : findYearlessAlias(byKey.entries(), item) ?? titleKey);
    const prior = byKey.get(key);
    byKey.set(key, prior ? mergeOpportunityRecords(prior, item, now) : withEncodingMetadata({ ...item, status: item.status }));
    for (const sourceKey of sourceKeys) sourceIdentityKeys.set(sourceKey, key);
    if (cfwDetailKey) cfwDetailKeys.set(cfwDetailKey, key);
  }
  const reconciled = [...byKey.values()].map(refreshOpportunityV2DerivedFields);
  // A prior enrichment may have retained the same stable id under two
  // slightly different source titles. Keep the pool one-record-per-id while
  // preserving the richer deadline and discovery metadata.
  const byStableId = new Map<string, OpportunityV2>();
  for (const item of reconciled) {
    const prior = byStableId.get(item.id);
    if (!prior) {
      byStableId.set(item.id, item);
      continue;
    }
    byStableId.set(item.id, withEncodingMetadata({
      ...prior,
      ...(prior.deadline ? {} : item.deadline ? { deadline: item.deadline, deadline_text: item.deadline_text, deadline_source_url: item.deadline_source_url, deadline_raw_text: item.deadline_raw_text, deadline_checked_at: item.deadline_checked_at, deadline_resolution: item.deadline_resolution } : {}),
      title: mergeTitleText(prior.title, item.title, item.title.length > prior.title.length),
      summary: mergeSummaryText(prior.summary, item.summary, prior.title, item.title),
      discovered_by_sources: [...new Set([...prior.discovered_by_sources, ...item.discovered_by_sources])],
      deadline_conflicts: [...(prior.deadline_conflicts ?? []), ...(item.deadline_conflicts ?? [])],
      ...(item.procurement ?? prior.procurement ? { procurement: item.procurement ?? prior.procurement } : {}),
    }));
  }
  return [...byStableId.values()];
}

export function deduplicateOpportunityV2(items: OpportunityV2[]): { opportunities: OpportunityV2[]; duplicate_count: number } {
  const byIdentity = new Map<string, OpportunityV2>();
  const cfwDetailKeys = new Map<string, string>();
  const sourceIdentityKeys = new Map<string, string>();
  let duplicate_count = 0;
  for (const item of items) {
    const titleKey = crossSourceTitleKey(item.title) ?? identityHash(item.title, item.deadline ?? "", item.organizer ?? "");
    const cfwDetailKey = item.source_id === CFW_SOURCE_ID ? item.detail_url : null;
    const sourceKeys = sourceIdentityAliases(item);
    const existingSourceKey = sourceKeys.map((candidate) => sourceIdentityKeys.get(candidate)).find(Boolean);
    const titleMatch = byIdentity.get(titleKey);
    const canMergeByTitle = titleMatch && (titleMatch.source_id !== item.source_id || titleMatch.discovered_by_sources.some((sourceId) => sourceId !== item.source_id));
    const sameSourceSameDetail = titleMatch && titleMatch.source_id === item.source_id && titleMatch.detail_url === item.detail_url;
    const yearlessAlias = !titleMatch ? findYearlessAlias(byIdentity.entries(), item) : null;
    const key = existingSourceKey
      ? existingSourceKey
      : cfwDetailKey ? (cfwDetailKeys.get(cfwDetailKey) ?? titleKey) : (canMergeByTitle || sameSourceSameDetail ? titleKey : titleMatch ? sameSourceRecordKey(item) : yearlessAlias ?? titleKey);
    const prior = byIdentity.get(key);
    if (!prior) {
      byIdentity.set(key, withEncodingMetadata(item));
      for (const sourceKey of sourceKeys) sourceIdentityKeys.set(sourceKey, key);
      if (cfwDetailKey) cfwDetailKeys.set(cfwDetailKey, key);
      continue;
    }
    duplicate_count += 1;
    byIdentity.set(key, mergeOpportunityRecords(prior, item, new Date()));
    for (const sourceKey of sourceKeys) sourceIdentityKeys.set(sourceKey, key);
    if (cfwDetailKey) cfwDetailKeys.set(cfwDetailKey, key);
  }
  return { opportunities: [...byIdentity.values()], duplicate_count };
}
