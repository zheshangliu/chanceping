import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { atomicWriteJson, withJsonFileLock } from "./file-lock";
import { getOpportunityV2SourcePermission, isOpportunityV2PublicCopyAllowed, publicOpportunityV2DiscoverySources } from "./source-governance";
import type { OpportunityV2, OpportunityV2SourceHealth } from "./types";

export type ProcurementChangeEventType = "new" | "deadline_changed" | "application_link_changed" | "eligibility_changed" | "budget_changed" | "stage_changed" | "cancelled" | "source_degraded";
export interface ChangeEvent {
  event_id: string;
  opportunity_id: string;
  event_type: ProcurementChangeEventType;
  before: unknown;
  after: unknown;
  evidence_url: string | null;
  occurred_at: string;
  detected_at: string;
  semantic_hash: string;
  discovered_by_sources?: string[];
}

export interface ProcurementChangeFeedFile {
  schema_version: "chanceping-procurement-change-feed.v1";
  updated_at: string;
  snapshot: OpportunityV2[];
  events: ChangeEvent[];
}

function changeFeedPath(filePath?: string): string {
  const configured = filePath ?? process.env.CHANCEPING_PROCUREMENT_CHANGE_FEED_PATH;
  if (configured) return path.resolve(configured);
  const runtimePath = "/var/lib/chanceping/opportunity-v2/procurement-change-feed.json";
  return path.resolve(fs.existsSync(path.dirname(runtimePath)) ? runtimePath : "data/opportunity-v2/procurement-change-feed.json");
}

function emptyChangeFeed(): ProcurementChangeFeedFile {
  return { schema_version: "chanceping-procurement-change-feed.v1", updated_at: new Date(0).toISOString(), snapshot: [], events: [] };
}

export function readProcurementChangeFeed(filePath?: string): ProcurementChangeFeedFile {
  const target = changeFeedPath(filePath);
  try {
    const parsed = JSON.parse(fs.readFileSync(target, "utf8")) as Partial<ProcurementChangeFeedFile>;
    return {
      schema_version: "chanceping-procurement-change-feed.v1",
      updated_at: typeof parsed.updated_at === "string" ? parsed.updated_at : new Date(0).toISOString(),
      snapshot: Array.isArray(parsed.snapshot) ? parsed.snapshot : [],
      events: Array.isArray(parsed.events) ? parsed.events : [],
    };
  } catch {
    return emptyChangeFeed();
  }
}

/** Public change feed is metadata-only for unreviewed sources and never includes its private pool snapshot. */
export function serializePublicProcurementChangeFeed(feed: ProcurementChangeFeedFile): Pick<ProcurementChangeFeedFile, "schema_version" | "updated_at" | "events"> {
  const snapshot = new Map(feed.snapshot.map((item) => [item.id, item]));
  const events = feed.events.flatMap((item) => {
    const sourceEventId = item.opportunity_id.startsWith("source:") ? item.opportunity_id.slice("source:".length) : null;
    const opportunity = sourceEventId ? undefined : snapshot.get(item.opportunity_id);
    if (opportunity && !isOpportunityV2PublicCopyAllowed(opportunity)) return [];
    if (sourceEventId && getOpportunityV2SourcePermission(sourceEventId) === "COMPLIANCE_HOLD") return [];
    const metadataKeys: Record<ChangeEvent["event_type"], string[]> = {
      new: ["title", "deadline", "deadline_kind", "application_url", "official_url", "participation_scope", "budget_amount", "budget_currency", "stage", "direction", "detail_url", "source_url"],
      deadline_changed: ["deadline", "deadline_kind"],
      application_link_changed: ["application_url", "official_url", "detail_url"],
      eligibility_changed: ["participation_scope"],
      budget_changed: ["amount", "currency"],
      stage_changed: [],
      cancelled: [],
      source_degraded: ["source_id", "http_status"],
    };
    const pick = (value: unknown): unknown => {
      if (value === null || typeof value !== "object" || Array.isArray(value)) return value;
      const record = value as Record<string, unknown>;
      return Object.fromEntries(metadataKeys[item.event_type].filter((key) => key in record).map((key) => [key, record[key]]));
    };
    return [{
      ...item,
      before: pick(item.before),
      after: item.event_type === "source_degraded" ? { source_id: sourceEventId, status: "FAILED" } : pick(item.after),
      discovered_by_sources: opportunity ? publicOpportunityV2DiscoverySources(opportunity.discovered_by_sources) : undefined,
    }];
  });
  return { schema_version: feed.schema_version, updated_at: feed.updated_at, events };
}

function semanticSnapshot(item: OpportunityV2): Record<string, unknown> {
  return { title: item.title, summary: item.summary, deadline: item.deadline, deadline_kind: item.deadline_kind ?? null, application_url: item.application_url ?? null, official_url: item.official_url ?? null, participation_scope: item.participation_scope ?? null, budget_amount: item.procurement?.budget_amount ?? null, budget_currency: item.procurement?.budget_currency ?? null, stage: item.procurement?.stage ?? null, direction: item.procurement?.direction ?? null, detail_url: item.detail_url, source_url: item.source_url };
}
function qualificationEvidence(item: OpportunityV2): string[] {
  const text = item.summary ?? "";
  const clauses = text.split(/(?<=[。.!?；;\n])/u).map((part) => part.trim()).filter((part) => /(?:eligib(?:le|ility)|applicant(?:s)? must|only (?:open|accept|for)|must be (?:a|an)|residents? of|申请对象|申报条件|资格要求|仅限|须为|必须为|参赛对象|报名对象|地区限制)/iu.test(part));
  return [...new Set(clauses)].slice(0, 6);
}
function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex"); }
function event(opportunityId: string, eventType: ChangeEvent["event_type"], before: unknown, after: unknown, evidenceUrl: string | null, detectedAt: string): ChangeEvent {
  const semanticHash = hash({ eventType, before, after });
  return { event_id: hash(`${opportunityId}|${eventType}|${semanticHash}`).slice(0, 32), opportunity_id: opportunityId, event_type: eventType, before, after, evidence_url: evidenceUrl, occurred_at: detectedAt, detected_at: detectedAt, semantic_hash: semanticHash };
}

export function buildProcurementChangeEvents(previous: OpportunityV2[], current: OpportunityV2[], detectedAt = new Date().toISOString()): ChangeEvent[] {
  const before = new Map(previous.map((item) => [item.id, item]));
  const events: ChangeEvent[] = [];
  for (const item of current) {
    const old = before.get(item.id);
    if (!old) { events.push(event(item.id, "new", null, semanticSnapshot(item), item.detail_url || item.source_url, detectedAt)); continue; }
    if (old.deadline !== item.deadline || old.deadline_kind !== item.deadline_kind) events.push(event(item.id, "deadline_changed", { deadline: old.deadline, deadline_kind: old.deadline_kind ?? null }, { deadline: item.deadline, deadline_kind: item.deadline_kind ?? null }, item.deadline_source_url || item.detail_url, detectedAt));
    const oldLinks = { application_url: old.application_url ?? null, official_url: old.official_url ?? null, detail_url: old.detail_url ?? null };
    const newLinks = { application_url: item.application_url ?? null, official_url: item.official_url ?? null, detail_url: item.detail_url ?? null };
    if (JSON.stringify(oldLinks) !== JSON.stringify(newLinks)) events.push(event(item.id, "application_link_changed", oldLinks, newLinks, item.official_url || item.application_url || item.detail_url, detectedAt));
    const oldEligibility = { participation_scope: old.participation_scope ?? null, evidence: qualificationEvidence(old) };
    const newEligibility = { participation_scope: item.participation_scope ?? null, evidence: qualificationEvidence(item) };
    if (JSON.stringify(oldEligibility) !== JSON.stringify(newEligibility)) events.push(event(item.id, "eligibility_changed", oldEligibility, newEligibility, item.detail_url || item.source_url, detectedAt));
    if (old.procurement?.budget_amount !== item.procurement?.budget_amount || old.procurement?.budget_currency !== item.procurement?.budget_currency) events.push(event(item.id, "budget_changed", { amount: old.procurement?.budget_amount ?? null, currency: old.procurement?.budget_currency ?? null }, { amount: item.procurement?.budget_amount ?? null, currency: item.procurement?.budget_currency ?? null }, item.detail_url, detectedAt));
    if (old.procurement?.stage !== item.procurement?.stage) {
      const type: ChangeEvent["event_type"] = item.procurement?.stage === "cancelled" ? "cancelled" : "stage_changed";
      events.push(event(item.id, type, old.procurement?.stage ?? null, item.procurement?.stage ?? null, item.detail_url, detectedAt));
    }
  }
  return events;
}

export function buildSourceDegradedEvents(health: OpportunityV2SourceHealth[], detectedAt = new Date().toISOString()): ChangeEvent[] {
  return health.filter((row) => row.ok === false).map((row) => event(`source:${row.source_id}`, "source_degraded", null, { source_id: row.source_id, error: row.error, http_status: row.http_status }, null, detectedAt));
}

export function renderProcurementDigestMarkdown(events: ChangeEvent[], detectedAt = new Date().toISOString()): string {
  const lines = [`# 采购机会变更摘要`, ``, `检测时间：${detectedAt}`, ``];
  if (!events.length) return `${lines.join("\n")}本轮无新增或语义变更。\n`;
  for (const item of events) lines.push(`- **${item.event_type}** · \`${item.opportunity_id}\` · ${item.evidence_url ? `[来源](${item.evidence_url})` : "来源待补"}`);
  return `${lines.join("\n")}\n`;
}

/** Persist semantic procurement changes after a V2 run; last_seen-only updates are ignored. */
export function recordProcurementChangeFeed(current: OpportunityV2[], health: OpportunityV2SourceHealth[], filePath?: string, detectedAt = new Date().toISOString()): ChangeEvent[] {
  const target = changeFeedPath(filePath);
  return withJsonFileLock(target, () => {
    const previous = readProcurementChangeFeed(target);
    const detected = [
      ...buildProcurementChangeEvents(previous.snapshot, current, detectedAt),
      ...buildSourceDegradedEvents(health, detectedAt),
    ];
    const existingIds = new Set(previous.events.map((item) => item.event_id));
    const fresh = detected.filter((item) => !existingIds.has(item.event_id));
    atomicWriteJson(target, {
      schema_version: "chanceping-procurement-change-feed.v1",
      updated_at: detectedAt,
      snapshot: current,
      events: [...previous.events, ...fresh],
    } satisfies ProcurementChangeFeedFile);
    return fresh;
  });
}
