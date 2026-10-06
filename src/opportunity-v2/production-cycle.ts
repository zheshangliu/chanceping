import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { hasEncodingCorruption } from "../ich/aggregation/adapters/common";
import { atomicWriteJson } from "./file-lock";
import { buildOpportunityV2MemoSnapshot, readOpportunityV2Health } from "./memo";
import { readOpportunityV2Pool, resolveOpportunityV2PoolPath } from "./opportunity-pool";
import { buildWeeklyOpportunityActions } from "./procurement-workbench";
import { filterOpportunityV2Radar } from "./radar-view";
import { opportunityV2NextRunAt, OPPORTUNITY_V2_INTERVAL_HOURS, resolveOpportunityV2SchedulerPath } from "./scheduler";
import { getOpportunityV2SourcePermission, getOpportunityV2SourcePermissionEvidence, isOpportunityV2SourceCollectionAllowed, isOpportunityV2PublicCopyAllowed, publicOpportunityV2DiscoverySources, sourceFreshness } from "./source-governance";
import { readOpportunityV2Sources, resolveOpportunityV2SourcesPath } from "./source-pool";
import { buildOpportunityV2Display, findCurrentOpportunityV2Translation, isForeignLanguageOpportunity, isForeignLanguageTitle, isOpportunityV2TranslationRetryCooling, isReusableOpportunityV2Translation, readOpportunityV2Translations, resolveOpportunityV2TranslationPath } from "./display";
import { collectOpportunityV2TranslationTargets } from "./translation-targets";
import { selectOpportunityV2TranslationQueue } from "./translation-queue";
import { shouldRecoverOpportunityV2Translation } from "./translation-recovery";
import { configuredTranslationProviders } from "./translation-provider";
import { withAsyncFileLock } from "./async-file-lock";
import { runOpportunityV2DisplayTranslation, type OpportunityV2TranslationRunSummary } from "./translation-runner";
import { runOpportunityV2 } from "./pipeline";
import { publicOpportunityV2Deadline } from "./public-deadline";
import { isOpportunityV2PublicSummarySafe, isOpportunityV2PublicTitleSafe } from "./public-text";
import type { OpportunityV2 } from "./types";
import type { OpportunityV2RunResult } from "./types";

export interface IchProductionCyclePaths {
  runtimeRoot: string;
  sources: string;
  pool: string;
  health: string;
  translations: string;
  scheduler: string;
  changeFeed: string;
  lock: string;
  backupRoot: string;
  manifest: string;
  runManifests: string;
}

export interface IchProductionCycleFetchSummary {
  run_id: string;
  started_at: string;
  finished_at: string;
  fetched_sources: number;
  successful_sources: number;
  raw_items: number;
  pool_items: number;
  radar_items: number;
}

export type IchTranslationDisposition = "PROVIDER_UNAVAILABLE" | "QUALITY_REJECTED" | "SOURCE_TEXT_BROKEN" | "INSUFFICIENT_EVIDENCE" | "COOLING" | "NON_RETRYABLE" | "BUDGET_DEFERRED";

export interface IchTranslationDispositionBucket {
  count: number;
  opportunity_ids: string[];
  by_source: Record<string, number>;
}

export interface IchProductionCycleAudit {
  status: "PASS" | "FAIL";
  source_count: number;
  successful_sources: number;
  pool_items: number;
  radar_items: number;
  memo_items: number;
  weekly_items: number;
  translation: {
    foreign_public_titles: number;
    translated_titles: number;
    failed_titles: number;
    pending_titles: number;
    p0: { foreign_titles: number; chinese_titles: number; coverage_percent: number; meets_98_percent: boolean };
    p1: { foreign_titles: number; chinese_titles: number; coverage_percent: number; meets_80_percent: boolean; meets_95_percent: boolean };
    quality_rejection_clusters: Record<string, number>;
    p0_title_repair_attempted: number;
    p0_title_repair_succeeded: number;
    p0_title_repair_failed: number;
    unresolved: Record<IchTranslationDisposition, IchTranslationDispositionBucket>;
    all_untranslated_p0_p1_dispositioned: boolean;
  };
  public_encoding_errors: number;
  public_encoding_error_items: Array<{ id: string; source_id: string; title_error: boolean; summary_error: boolean }>;
  pool_encoding_errors: number;
  pool_encoding_error_items: Array<{ id: string; source_id: string; title_error: boolean; summary_error: boolean }>;
  public_unsafe_exact_deadlines: number;
  artconnect_collection_allowed: boolean;
  weekly_limit_pass: boolean;
  source_governance: {
    reviewed_ok_count: number;
    reviewed_metadata_only_count: number;
    official_open_data_count: number;
    not_reviewed_count: number;
    compliance_hold_count: number;
    weekly_contributing_source_ids: string[];
    weekly_contributing_sources: Array<{ source_id: string; source_name: string; permission: string; permission_basis: string; permission_evidence_url: string | null; weekly_actions: number }>;
    top_public_contributors: Array<{ source_id: string; source_name: string; permission: string; permission_basis: string; permission_evidence_url: string | null; direct_pool_records: number; public_records: number }>;
  };
  source_health: {
    fresh: number;
    stale: number;
    never_succeeded: number;
    unknown: number;
    failed: number;
    sources: Array<{ source_id: string; source_name: string; enabled: boolean; registry_status: string; freshness: string; freshness_age_hours: number | null; last_success_at: string | null; latest_attempt_ok: boolean | null }>;
  };
}

export interface IchProductionCycleManifest {
  schema_version: "chanceping.ich.v15.production-cycle.v1";
  run_id: string;
  status: "COMPLETED" | "COMPLETED_WITH_BACKLOG" | "DEGRADED" | "FAILED";
  started_at: string;
  finished_at: string;
  production_commit: string | null;
  fetch: IchProductionCycleFetchSummary | null;
  translation: Pick<OpportunityV2TranslationRunSummary, "status" | "provider" | "provider_configured" | "visible_target_count" | "foreign_count" | "cache_reused" | "eligible_pending" | "attempted_records" | "translated_records" | "failed_records" | "failure_counts" | "unattempted_selected" | "actual_requests" | "p0_title_repair_attempted" | "p0_title_repair_succeeded" | "p0_title_repair_failed" | "quality_rejection_clusters"> | null;
  audit: IchProductionCycleAudit | null;
  next_run_at: string | null;
  freshness: "FRESH" | "STALE" | "NEVER_SUCCEEDED";
  failure_code: "FETCH_FAILED" | "FETCH_BACKLOG" | "TRANSLATION_DEGRADED" | "TRANSLATION_BACKLOG" | "QUALITY_AUDIT_FAILED" | null;
}

export interface IchProductionCycleOptions {
  now?: Date;
  paths?: Partial<IchProductionCyclePaths>;
  fetch?: (now: Date, paths: IchProductionCyclePaths) => Promise<IchProductionCycleFetchSummary>;
  translate?: (now: Date, paths: IchProductionCyclePaths) => Promise<OpportunityV2TranslationRunSummary>;
  audit?: (now: Date, paths: IchProductionCyclePaths, translation?: OpportunityV2TranslationRunSummary | null) => Promise<IchProductionCycleAudit> | IchProductionCycleAudit;
  releaseManifestPath?: string;
  snapshotRetention?: number;
}

export function withIchProductionCycleLock<T>(operation: () => Promise<T> | T, overrides: Partial<IchProductionCyclePaths> = {}): Promise<T> {
  const paths = resolvePaths(overrides);
  return withAsyncFileLock(paths.lock, operation);
}

const RUNTIME_ENV_KEYS = [
  "CHANCEPING_OPPORTUNITY_V2_POOL_PATH",
  "CHANCEPING_OPPORTUNITY_V2_SOURCES_PATH",
  "CHANCEPING_OPPORTUNITY_V2_HEALTH_PATH",
  "CHANCEPING_OPPORTUNITY_V2_TRANSLATION_PATH",
  "CHANCEPING_OPPORTUNITY_V2_SCHEDULE_PATH",
  "CHANCEPING_OPPORTUNITY_V2_SCHEDULER_PATH",
] as const;

function resolvePaths(overrides: Partial<IchProductionCyclePaths> = {}): IchProductionCyclePaths {
  const pool = path.resolve(overrides.pool ?? resolveOpportunityV2PoolPath());
  const runtimeRoot = path.resolve(overrides.runtimeRoot ?? path.dirname(pool));
  const sources = path.resolve(overrides.sources ?? resolveOpportunityV2SourcesPath());
  const health = path.resolve(overrides.health ?? process.env.CHANCEPING_OPPORTUNITY_V2_HEALTH_PATH ?? (fs.existsSync("/var/lib/chanceping/opportunity-v2") ? "/var/lib/chanceping/opportunity-v2/source-health.json" : path.join(runtimeRoot, "source-health.json")));
  const translations = path.resolve(overrides.translations ?? resolveOpportunityV2TranslationPath());
  const scheduler = path.resolve(overrides.scheduler ?? resolveOpportunityV2SchedulerPath());
  const changeFeed = path.resolve(overrides.changeFeed ?? path.join(path.dirname(pool), "procurement-change-feed.json"));
  return {
    runtimeRoot,
    sources,
    pool,
    health,
    translations,
    scheduler,
    changeFeed,
    lock: path.resolve(overrides.lock ?? path.join(runtimeRoot, "ich-production-cycle.lock")),
    backupRoot: path.resolve(overrides.backupRoot ?? path.join(runtimeRoot, "cycle-backups")),
    manifest: path.resolve(overrides.manifest ?? path.join(runtimeRoot, "production-cycle-latest.json")),
    runManifests: path.resolve(overrides.runManifests ?? path.join(runtimeRoot, "cycle-runs")),
  };
}

function withRuntimeEnvironment<T>(paths: IchProductionCyclePaths, operation: () => Promise<T>): Promise<T> {
  const values: Record<(typeof RUNTIME_ENV_KEYS)[number], string> = {
    CHANCEPING_OPPORTUNITY_V2_POOL_PATH: paths.pool,
    CHANCEPING_OPPORTUNITY_V2_SOURCES_PATH: paths.sources,
    CHANCEPING_OPPORTUNITY_V2_HEALTH_PATH: paths.health,
    CHANCEPING_OPPORTUNITY_V2_TRANSLATION_PATH: paths.translations,
    CHANCEPING_OPPORTUNITY_V2_SCHEDULE_PATH: paths.scheduler,
    CHANCEPING_OPPORTUNITY_V2_SCHEDULER_PATH: paths.scheduler,
  };
  const previous = new Map<string, string | undefined>();
  for (const key of RUNTIME_ENV_KEYS) { previous.set(key, process.env[key]); process.env[key] = values[key]; }
  return operation().finally(() => {
    for (const key of RUNTIME_ENV_KEYS) {
      const value = previous.get(key);
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
}

interface SnapshotEntry { path: string; existed: boolean; backup: string | null; mode: number | null; }
async function createSnapshot(paths: IchProductionCyclePaths, runId: string): Promise<{ dir: string; entries: SnapshotEntry[] }> {
  const dir = path.join(paths.backupRoot, runId);
  await fsp.mkdir(dir, { recursive: true, mode: 0o700 });
  const files = [paths.sources, paths.pool, paths.health, paths.translations, paths.scheduler, paths.changeFeed];
  const entries: SnapshotEntry[] = [];
  for (const [index, file] of files.entries()) {
    try {
      const stat = await fsp.stat(file);
      const backup = path.join(dir, `${index}-${path.basename(file)}.snapshot`);
      await fsp.copyFile(file, backup);
      await fsp.chmod(backup, 0o600);
      entries.push({ path: file, existed: true, backup, mode: stat.mode & 0o777 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      entries.push({ path: file, existed: false, backup: null, mode: null });
    }
  }
  return { dir, entries };
}

async function restoreSnapshot(entries: SnapshotEntry[]): Promise<void> {
  for (const entry of entries) {
    if (!entry.existed || !entry.backup) {
      await fsp.unlink(entry.path).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
      continue;
    }
    await fsp.mkdir(path.dirname(entry.path), { recursive: true });
    const temp = `${entry.path}.${process.pid}.${crypto.randomUUID()}.restore`;
    await fsp.copyFile(entry.backup, temp);
    if (entry.mode !== null) await fsp.chmod(temp, entry.mode);
    await fsp.rename(temp, entry.path);
  }
}

async function pruneSnapshots(root: string, keep: number): Promise<void> {
  await fsp.mkdir(root, { recursive: true, mode: 0o700 });
  const dirs = await fsp.readdir(root, { withFileTypes: true });
  const snapshots: Array<{ name: string; mtime: number }> = [];
  for (const entry of dirs) {
    if (!entry.isDirectory() || !/^[a-zA-Z0-9_-]+$/u.test(entry.name)) continue;
    const stat = await fsp.stat(path.join(root, entry.name));
    snapshots.push({ name: entry.name, mtime: stat.mtimeMs });
  }
  snapshots.sort((a, b) => b.mtime - a.mtime);
  for (const stale of snapshots.slice(Math.max(0, keep))) await fsp.rm(path.join(root, stale.name), { recursive: true, force: true });
}

function readProductionCommit(filePath?: string): string | null {
  const target = filePath ?? process.env.CHANCEPING_RELEASE_MANIFEST_PATH ?? "/opt/chanceping/release-manifest.json";
  try {
    const manifest = JSON.parse(fs.readFileSync(target, "utf8")) as { commit?: unknown };
    return typeof manifest.commit === "string" && /^[0-9a-f]{40}$/u.test(manifest.commit) ? manifest.commit : null;
  } catch { return null; }
}

async function defaultFetch(now: Date, paths: IchProductionCyclePaths): Promise<IchProductionCycleFetchSummary> {
  const result: OpportunityV2RunResult = await runOpportunityV2({ now, sourcesPath: paths.sources, poolPath: paths.pool, healthPath: paths.health, changeFeedPath: paths.changeFeed });
  return {
    run_id: result.run_id,
    started_at: result.started_at,
    finished_at: result.finished_at,
    fetched_sources: result.fetched_sources,
    successful_sources: result.successful_sources,
    raw_items: result.raw_items,
    pool_items: result.pool_items,
    radar_items: result.radar_items,
  };
}

function writeScheduler(paths: IchProductionCyclePaths, runId: string, startedAt: string, finishedAt: string, status: IchProductionCycleManifest["status"]): string {
  let previous: Record<string, unknown> = {};
  try { previous = JSON.parse(fs.readFileSync(paths.scheduler, "utf8")) as Record<string, unknown>; } catch { /* first run */ }
  // The installed timer uses OnUnitActiveSec=72h: its interval starts when
  // systemd activates the service. Keep runtime next_run_at on that same
  // start anchor instead of drifting later by the fetch/translation duration.
  const nextRunAt = opportunityV2NextRunAt(startedAt, new Date(startedAt));
  const successfulStatuses = ["COMPLETED", "COMPLETED_WITH_BACKLOG"];
  const lastSuccess = successfulStatuses.includes(status) ? finishedAt : (typeof previous.last_successful_cycle_at === "string" ? previous.last_successful_cycle_at : null);
  atomicWriteJson(paths.scheduler, {
    ...previous,
    schema_version: "chanceping-opportunity-v2.scheduler.v1",
    timezone: "Asia/Shanghai",
    interval_hours: OPPORTUNITY_V2_INTERVAL_HOURS,
    last_run_at: finishedAt,
    last_run_started_at: startedAt,
    last_cycle_run_id: runId,
    last_cycle_status: status,
    next_run_basis: "systemd_service_activation",
    last_successful_cycle_at: lastSuccess,
    next_run_at: nextRunAt,
  });
  try { fs.chmodSync(paths.scheduler, 0o600); } catch { /* restrictive parent permissions remain in force */ }
  return nextRunAt;
}

export function productionCycleFreshness(lastSuccessfulAt: string | null | undefined, now: Date): IchProductionCycleManifest["freshness"] {
  if (!lastSuccessfulAt) return "NEVER_SUCCEEDED";
  const age = now.getTime() - Date.parse(lastSuccessfulAt);
  return Number.isFinite(age) && age <= 78 * 60 * 60 * 1000 ? "FRESH" : "STALE";
}

function safeTranslationSummary(summary: OpportunityV2TranslationRunSummary): IchProductionCycleManifest["translation"] {
  return {
    status: summary.status,
    provider: summary.provider,
    provider_configured: summary.provider_configured,
    visible_target_count: summary.visible_target_count,
    foreign_count: summary.foreign_count,
    cache_reused: summary.cache_reused,
    eligible_pending: summary.eligible_pending,
    attempted_records: summary.attempted_records,
    translated_records: summary.translated_records,
    failed_records: summary.failed_records,
    failure_counts: summary.failure_counts,
    p0_title_repair_attempted: summary.p0_title_repair_attempted,
    p0_title_repair_succeeded: summary.p0_title_repair_succeeded,
    p0_title_repair_failed: summary.p0_title_repair_failed,
    quality_rejection_clusters: summary.quality_rejection_clusters,
    unattempted_selected: summary.unattempted_selected,
    actual_requests: summary.actual_requests,
  };
}

function auditRuntime(now: Date, paths: IchProductionCyclePaths, translationRun: OpportunityV2TranslationRunSummary | null = null): IchProductionCycleAudit {
  const poolFile = readOpportunityV2Pool(paths.pool);
  const pool = poolFile.opportunities;
  const sources = readOpportunityV2Sources(paths.sources);
  const health = readOpportunityV2Health(paths.health);
  const translations = readOpportunityV2Translations(paths.translations);
  const radar = filterOpportunityV2Radar(pool, sources, { now, status: "browse" });
  const memo = buildOpportunityV2MemoSnapshot({ opportunities: pool, sources, health, generatedAt: now.toISOString(), poolUpdatedAt: poolFile.updated_at });
  const weekly = buildWeeklyOpportunityActions({ opportunities: pool, sources, now }, 10);
  const targets = collectOpportunityV2TranslationTargets(pool, sources, now);
  const queue = selectOpportunityV2TranslationQueue(targets, translations, { now, recoveryMode: "all", maxItems: 200 });
  const selectedIds = new Set(queue.selected.map((entry) => entry.item.id));
  const deepseekConfigured = configuredTranslationProviders(process.env).providers.some((provider) => provider.id === "deepseek");
  const p0Targets = targets.filter((target) => target.priority === 0);
  const p1Targets = targets.filter((target) => target.priority === 1);
  const titleForeignCount = (members: typeof targets): number => members.filter((target) => isForeignLanguageTitle(target.item)).length;
  const titleTranslatedCount = (members: typeof targets): number => members.filter((target) => {
    if (!isForeignLanguageTitle(target.item)) return false;
    const entry = findCurrentOpportunityV2Translation(target.item, translations);
    return Boolean(entry && isReusableOpportunityV2Translation(target.item, entry));
  }).length;
  const titleCoverage = (members: typeof targets, threshold: number) => {
    const foreign = titleForeignCount(members);
    const translated = titleTranslatedCount(members);
    const percent = foreign === 0 ? 100 : Math.round((translated / foreign) * 10_000) / 100;
    return { foreign_titles: foreign, chinese_titles: members.length - foreign + translated, coverage_percent: percent, meets: percent >= threshold };
  };
  const p0 = titleCoverage(p0Targets, 98);
  const p1RoundTarget = titleCoverage(p1Targets, 80);
  const p1LongTermTarget = titleCoverage(p1Targets, 95);
  const dispositions: IchTranslationDisposition[] = ["PROVIDER_UNAVAILABLE", "QUALITY_REJECTED", "SOURCE_TEXT_BROKEN", "INSUFFICIENT_EVIDENCE", "COOLING", "NON_RETRYABLE", "BUDGET_DEFERRED"];
  const unresolved = Object.fromEntries(dispositions.map((code) => [code, { count: 0, opportunity_ids: [] as string[], by_source: {} as Record<string, number> }])) as unknown as Record<IchTranslationDisposition, IchTranslationDispositionBucket>;
  const p0p1Foreign = [...p0Targets, ...p1Targets].filter((target) => isForeignLanguageTitle(target.item));
  for (const target of p0p1Foreign) {
    const entry = findCurrentOpportunityV2Translation(target.item, translations);
    if (entry && isReusableOpportunityV2Translation(target.item, entry)) continue;
    let code: IchTranslationDisposition;
    if (target.item.encoding_error === true || target.item.encoding_error_fields?.includes("title") || hasEncodingCorruption(target.item.title)) code = "SOURCE_TEXT_BROKEN";
    else if (entry?.p0_title_repair_attempted) code = "NON_RETRYABLE";
    else if (entry?.status === "failed" && isOpportunityV2TranslationRetryCooling(entry, now)) code = "COOLING";
    else if (entry?.failure_code === "QUALITY_REJECTED" || entry?.failure_code === "INVALID_JSON") code = "QUALITY_REJECTED";
    else if (entry?.failure_code === "PROVIDER_UNAVAILABLE" || entry?.failure_code === "TIMEOUT" || entry?.failure_code === "CREDENTIAL_NOT_CONFIGURED" || (!entry && !deepseekConfigured)) code = "PROVIDER_UNAVAILABLE";
    else if (entry?.failure_code === "EMPTY_CONTENT") code = "INSUFFICIENT_EVIDENCE";
    else if (entry?.status === "failed" && (entry.retryable === false || !shouldRecoverOpportunityV2Translation(entry))) code = "NON_RETRYABLE";
    else if (!selectedIds.has(target.item.id)) code = "BUDGET_DEFERRED";
    else code = "INSUFFICIENT_EVIDENCE";
    const bucket = unresolved[code];
    bucket.count += 1;
    bucket.opportunity_ids.push(target.item.id);
    bucket.by_source[target.item.source_id] = (bucket.by_source[target.item.source_id] ?? 0) + 1;
  }
  for (const bucket of Object.values(unresolved)) bucket.opportunity_ids.sort();
  const p0p1Untranslated = p0p1Foreign.filter((target) => {
    const entry = findCurrentOpportunityV2Translation(target.item, translations);
    return !entry || !isReusableOpportunityV2Translation(target.item, entry);
  }).length;
  const dispositioned = Object.values(unresolved).reduce((sum, bucket) => sum + bucket.count, 0) === p0p1Untranslated;

  const visibleById = new Map<string, OpportunityV2>();
  for (const item of [...radar, ...memo.items]) visibleById.set(item.id, item);
  const publicCopyItems = pool.filter(isOpportunityV2PublicCopyAllowed);
  const poolEncodingErrorItems = publicCopyItems.flatMap((item) => {
    const titleError = !isOpportunityV2PublicTitleSafe(item);
    const summaryError = !isOpportunityV2PublicSummarySafe(item);
    return titleError || summaryError ? [{ id: item.id, source_id: item.source_id, title_error: titleError, summary_error: summaryError }] : [];
  });
  const publicEncodingErrorItems = publicCopyItems.filter(isOpportunityV2PublicTitleSafe).flatMap((item) => {
    const rendered = buildOpportunityV2Display(item, translations);
    const titleError = hasEncodingCorruption(rendered.title);
    const summaryError = hasEncodingCorruption(rendered.summary);
    return titleError || summaryError ? [{ id: item.id, source_id: item.source_id, title_error: titleError, summary_error: summaryError }] : [];
  });
  const publicEncodingErrors = publicEncodingErrorItems.length;
  const unsafePublicExactDeadlines = publicCopyItems.filter((item) => item.deadline_conflict_unsafe === true && publicOpportunityV2Deadline(item).deadline !== null).length;
  const translationTargets = [...visibleById.values()];
  const foreignCandidates = translationTargets.filter((item) => isForeignLanguageOpportunity(item));
  const translated = foreignCandidates.filter((item) => buildOpportunityV2Display(item, translations).translated).length;
  const publicItems = [...visibleById.values()];
  const sourceContributions = sources.map((source) => {
    const publicRecords = publicItems.filter((item) => publicOpportunityV2DiscoverySources([item.source_id, ...item.discovered_by_sources]).includes(source.id)).length;
    return {
      source_id: source.id,
      source_name: source.name,
      permission: getOpportunityV2SourcePermission(source.id),
      permission_basis: getOpportunityV2SourcePermissionEvidence(source.id).basis,
      permission_evidence_url: getOpportunityV2SourcePermissionEvidence(source.id).url,
      direct_pool_records: pool.filter((item) => item.source_id === source.id).length,
      public_records: publicRecords,
    };
  });
  const weeklyContributingIds = [...new Set(weekly.flatMap((action) => action.discovered_by_sources).filter(isOpportunityV2SourceCollectionAllowed))].sort();
  const weeklyActionCounts = new Map<string, number>();
  for (const action of weekly) for (const sourceId of new Set(action.discovered_by_sources)) weeklyActionCounts.set(sourceId, (weeklyActionCounts.get(sourceId) ?? 0) + 1);
  const notReviewedCount = sources.filter((source) => getOpportunityV2SourcePermission(source.id) === "NOT_REVIEWED").length;
  const complianceHoldCount = sources.filter((source) => getOpportunityV2SourcePermission(source.id) === "COMPLIANCE_HOLD").length;
  const reviewedOkCount = sources.filter((source) => getOpportunityV2SourcePermission(source.id) === "REVIEWED_OK").length;
  const reviewedMetadataOnlyCount = sources.filter((source) => getOpportunityV2SourcePermission(source.id) === "REVIEWED_METADATA_ONLY").length;
  const officialOpenDataCount = sources.filter((source) => getOpportunityV2SourcePermission(source.id) === "OFFICIAL_OPEN_DATA").length;
  const topPublicContributors = sourceContributions.sort((a, b) => b.public_records - a.public_records || b.direct_pool_records - a.direct_pool_records || a.source_id.localeCompare(b.source_id)).slice(0, 10);
  const healthBySource = new Map(health.map((entry) => [entry.source_id, entry]));
  const sourceHealthRows = sources.map((source) => {
    const latest = healthBySource.get(source.id);
    const lastSuccessAt = source.last_fetch_at ?? (latest?.ok ? latest.fetched_at : null);
    const freshness = sourceFreshness(lastSuccessAt, now);
    return {
      source_id: source.id,
      source_name: source.name,
      enabled: source.enabled,
      registry_status: source.status,
      freshness: freshness.status,
      freshness_age_hours: freshness.age_hours,
      last_success_at: lastSuccessAt,
      latest_attempt_ok: latest ? latest.ok : null,
    };
  });
  const sourceHealthSummary = {
    fresh: sourceHealthRows.filter((row) => row.freshness === "FRESH").length,
    stale: sourceHealthRows.filter((row) => row.freshness === "STALE").length,
    never_succeeded: sourceHealthRows.filter((row) => row.freshness === "NEVER_SUCCEEDED").length,
    unknown: sourceHealthRows.filter((row) => row.freshness === "UNKNOWN").length,
    failed: sourceHealthRows.filter((row) => row.registry_status === "FAILED" || row.latest_attempt_ok === false).length,
    sources: sourceHealthRows,
  };
  const rejectedTranslations = translations.filter((entry) => entry.failure_code === "QUALITY_REJECTED");
  const qualityRejectionClusters = rejectedTranslations.reduce<Record<string, number>>((clusters, entry) => {
    const errors = entry.validation_errors ?? [];
    for (const error of errors) {
      const cluster = /missing factual token/iu.test(error) ? "MISSING_FACT"
        : /title is unchanged/iu.test(error) ? "TITLE_UNCHANGED"
          : /title remains untranslated/iu.test(error) ? "TITLE_REMAINS_ENGLISH"
            : /english residue/iu.test(error) ? "ENGLISH_RESIDUE"
              : /currency|fee|deadline|post-selection/iu.test(error) ? "STRUCTURED_FACT_MISMATCH"
                : /template summary/iu.test(error) ? "UNSUPPORTED_SUMMARY_TEMPLATE" : "OTHER_VALIDATION";
      clusters[cluster] = (clusters[cluster] ?? 0) + 1;
    }
    return clusters;
  }, {});
  const status = publicEncodingErrors === 0 && unsafePublicExactDeadlines === 0 && weekly.length <= 10 && dispositioned && p0.meets && p1RoundTarget.meets ? "PASS" : "FAIL";
  return {
    status,
    source_count: sources.length,
    successful_sources: new Set(health.filter((item) => item.ok).map((item) => item.source_id)).size,
    pool_items: pool.length,
    radar_items: radar.length,
    memo_items: memo.items.length,
    weekly_items: weekly.length,
    translation: {
      foreign_public_titles: foreignCandidates.length,
      translated_titles: translated,
      failed_titles: translations.filter((item) => item.status === "failed" && visibleById.has(item.opportunity_id)).length,
      pending_titles: translations.filter((item) => item.status === "pending" && visibleById.has(item.opportunity_id)).length,
      p0: { foreign_titles: p0.foreign_titles, chinese_titles: p0.chinese_titles, coverage_percent: p0.coverage_percent, meets_98_percent: p0.meets },
      p1: { foreign_titles: p1LongTermTarget.foreign_titles, chinese_titles: p1LongTermTarget.chinese_titles, coverage_percent: p1LongTermTarget.coverage_percent, meets_80_percent: p1RoundTarget.meets, meets_95_percent: p1LongTermTarget.meets },
      quality_rejection_clusters: qualityRejectionClusters,
      p0_title_repair_attempted: translationRun?.p0_title_repair_attempted ?? 0,
      p0_title_repair_succeeded: translationRun?.p0_title_repair_succeeded ?? 0,
      p0_title_repair_failed: translationRun?.p0_title_repair_failed ?? 0,
      unresolved,
      all_untranslated_p0_p1_dispositioned: dispositioned,
    },
    public_encoding_errors: publicEncodingErrors,
    public_encoding_error_items: publicEncodingErrorItems,
    pool_encoding_errors: poolEncodingErrorItems.length,
    pool_encoding_error_items: poolEncodingErrorItems,
    public_unsafe_exact_deadlines: unsafePublicExactDeadlines,
    artconnect_collection_allowed: isOpportunityV2SourceCollectionAllowed("artconnect-opportunities"),
    weekly_limit_pass: weekly.length <= 10,
    source_governance: {
      reviewed_ok_count: reviewedOkCount,
      reviewed_metadata_only_count: reviewedMetadataOnlyCount,
      official_open_data_count: officialOpenDataCount,
      not_reviewed_count: notReviewedCount,
      compliance_hold_count: complianceHoldCount,
      weekly_contributing_source_ids: weeklyContributingIds,
      weekly_contributing_sources: sources.filter((source) => weeklyActionCounts.has(source.id)).map((source) => ({
        source_id: source.id,
        source_name: source.name,
        permission: getOpportunityV2SourcePermission(source.id),
        permission_basis: getOpportunityV2SourcePermissionEvidence(source.id).basis,
        permission_evidence_url: getOpportunityV2SourcePermissionEvidence(source.id).url,
        weekly_actions: weeklyActionCounts.get(source.id) ?? 0,
      })).sort((a, b) => b.weekly_actions - a.weekly_actions || a.source_id.localeCompare(b.source_id)),
      top_public_contributors: topPublicContributors,
    },
    source_health: sourceHealthSummary,
  };
}

export async function runIchProductionCycleAudit(options: { now?: Date; paths?: Partial<IchProductionCyclePaths> } = {}): Promise<IchProductionCycleAudit> {
  const paths = resolvePaths(options.paths);
  const now = options.now ?? new Date();
  return withRuntimeEnvironment(paths, async () => auditRuntime(now, paths));
}

async function persistManifest(paths: IchProductionCyclePaths, manifest: IchProductionCycleManifest): Promise<void> {
  await fsp.mkdir(path.dirname(paths.manifest), { recursive: true, mode: 0o750 });
  await fsp.mkdir(paths.runManifests, { recursive: true, mode: 0o750 });
  const runPath = path.join(paths.runManifests, `${manifest.run_id}.json`);
  atomicWriteJson(runPath, manifest);
  atomicWriteJson(paths.manifest, manifest);
  await Promise.all([fsp.chmod(runPath, 0o600), fsp.chmod(paths.manifest, 0o600)]);
  const entries = (await fsp.readdir(paths.runManifests, { withFileTypes: true })).filter((entry) => entry.isFile() && /^ich-cycle-[a-f0-9-]+\.json$/u.test(entry.name));
  const files = await Promise.all(entries.map(async (entry) => ({ path: path.join(paths.runManifests, entry.name), mtime: (await fsp.stat(path.join(paths.runManifests, entry.name))).mtimeMs })));
  files.sort((a, b) => b.mtime - a.mtime);
  for (const stale of files.slice(30)) await fsp.unlink(stale.path);
}

export async function runIchProductionCycle(options: IchProductionCycleOptions = {}): Promise<IchProductionCycleManifest> {
  const paths = resolvePaths(options.paths);
  const now = options.now ?? new Date();
  const stageTime = (): Date => options.now ? now : new Date();
  const runId = `ich-cycle-${crypto.randomUUID()}`;
  return withIchProductionCycleLock(() => withRuntimeEnvironment(paths, async () => {
    const startedAt = now.toISOString();
    const snapshot = await createSnapshot(paths, runId);
    await pruneSnapshots(paths.backupRoot, Math.max(1, options.snapshotRetention ?? 3));
    let fetchResult: IchProductionCycleFetchSummary | null = null;
    let translationResult: OpportunityV2TranslationRunSummary | null = null;
    let auditResult: IchProductionCycleAudit | null = null;
    let nextRunAt: string | null = null;
    let status: IchProductionCycleManifest["status"] = "FAILED";
    let failureCode: IchProductionCycleManifest["failure_code"] = null;
    let freshnessState: IchProductionCycleManifest["freshness"] = "NEVER_SUCCEEDED";
    try {
      fetchResult = await (options.fetch ?? defaultFetch)(stageTime(), paths);
    } catch {
      try { await restoreSnapshot(snapshot.entries); } catch { failureCode = "FETCH_FAILED"; }
      failureCode ??= "FETCH_FAILED";
      const finishedAt = stageTime();
      try { nextRunAt = writeScheduler(paths, runId, startedAt, finishedAt.toISOString(), "FAILED"); }
      catch { failureCode = "FETCH_FAILED"; }
      const scheduler: Record<string, unknown> = (() => { try { return JSON.parse(fs.readFileSync(paths.scheduler, "utf8")) as Record<string, unknown>; } catch { return {}; } })();
      freshnessState = productionCycleFreshness(typeof scheduler.last_successful_cycle_at === "string" ? scheduler.last_successful_cycle_at : null, finishedAt);
      status = "FAILED";
      const manifest: IchProductionCycleManifest = { schema_version: "chanceping.ich.v15.production-cycle.v1", run_id: runId, status, started_at: startedAt, finished_at: finishedAt.toISOString(), production_commit: readProductionCommit(options.releaseManifestPath), fetch: null, translation: null, audit: null, next_run_at: nextRunAt, freshness: freshnessState, failure_code: failureCode };
      await persistManifest(paths, manifest);
      return manifest;
    }

    const finishedFetchAt = fetchResult.finished_at;
    nextRunAt = writeScheduler(paths, runId, startedAt, finishedFetchAt, "DEGRADED");
    try {
      translationResult = await (options.translate ?? ((time, runtime) => runOpportunityV2DisplayTranslation({ now: time, execute: true, poolPath: runtime.pool, sourcesPath: runtime.sources, translationPath: runtime.translations })))(stageTime(), paths);
    } catch {
      failureCode = "TRANSLATION_DEGRADED";
    }
    try { auditResult = options.audit ? await options.audit(stageTime(), paths, translationResult) : auditRuntime(stageTime(), paths, translationResult); }
    catch { failureCode = "QUALITY_AUDIT_FAILED"; }

    const fetchComplete = fetchResult.successful_sources === fetchResult.fetched_sources;
    const translationComplete = (translationResult?.status === "COMPLETED" || (translationResult?.status === "ACCESS_BLOCKED" && translationResult.selected_unique_ids.length === 0))
      && translationResult.failed_records === 0 && translationResult.unattempted_selected === 0;
    const p0CoveragePass = auditResult?.translation.p0.meets_98_percent === true;
    const p1CoveragePass = auditResult?.translation.p1.meets_80_percent === true;
    const publicSafetyPass = auditResult?.public_encoding_errors === 0
      && auditResult.public_unsafe_exact_deadlines === 0
      && auditResult.weekly_limit_pass
      && auditResult.translation.all_untranslated_p0_p1_dispositioned;
    const p1OnlyBacklog = auditResult?.status === "FAIL"
      && p0CoveragePass
      && publicSafetyPass
      && !p1CoveragePass;
    if (!auditResult) status = "FAILED";
    else if ((!p0CoveragePass || !publicSafetyPass || !translationResult || (auditResult.status !== "PASS" && !p1OnlyBacklog))) status = "DEGRADED";
    else if (fetchComplete && translationComplete && p1CoveragePass) status = "COMPLETED";
    else status = "COMPLETED_WITH_BACKLOG";
    if (!failureCode && status === "FAILED") failureCode = "QUALITY_AUDIT_FAILED";
    if (!failureCode && status === "DEGRADED") failureCode = "QUALITY_AUDIT_FAILED";
    if (!failureCode && status === "DEGRADED") failureCode = "TRANSLATION_DEGRADED";
    if (!failureCode && status === "COMPLETED_WITH_BACKLOG" && !fetchComplete) failureCode = "FETCH_BACKLOG";
    if (!failureCode && status === "COMPLETED_WITH_BACKLOG") failureCode = "TRANSLATION_BACKLOG";
    nextRunAt = writeScheduler(paths, runId, startedAt, fetchResult.finished_at, status);
    const priorScheduler: Record<string, unknown> = (() => { try { return JSON.parse(fs.readFileSync(paths.scheduler, "utf8")) as Record<string, unknown>; } catch { return {}; } })();
    const finishedAt = stageTime();
    freshnessState = productionCycleFreshness(typeof priorScheduler.last_successful_cycle_at === "string" ? priorScheduler.last_successful_cycle_at : null, finishedAt);
    if (status === "COMPLETED" || status === "COMPLETED_WITH_BACKLOG") freshnessState = "FRESH";
    const manifest: IchProductionCycleManifest = {
      schema_version: "chanceping.ich.v15.production-cycle.v1",
      run_id: runId,
      status,
      started_at: startedAt,
      finished_at: finishedAt.toISOString(),
      production_commit: readProductionCommit(options.releaseManifestPath),
      fetch: fetchResult,
      translation: translationResult ? safeTranslationSummary(translationResult) : null,
      audit: auditResult,
      next_run_at: nextRunAt,
      freshness: freshnessState,
      failure_code: failureCode,
    };
    await persistManifest(paths, manifest);
    return manifest;
  }), paths);
}
