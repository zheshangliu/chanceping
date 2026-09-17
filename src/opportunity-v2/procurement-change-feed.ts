import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { atomicWriteJson, withJsonFileLock } from "./file-lock";
import type { OpportunityV2, OpportunityV2SourceHealth } from "./types";

export type ProcurementChangeEventType = "new" | "deadline_changed" | "budget_changed" | "stage_changed" | "cancelled" | "source_degraded";
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

function semanticSnapshot(item: OpportunityV2): Record<string, unknown> {
  return { title: item.title, summary: item.summary, deadline: item.deadline, deadline_kind: item.deadline_kind ?? null, budget_amount: item.procurement?.budget_amount ?? null, budget_currency: item.procurement?.budget_currency ?? null, stage: item.procurement?.stage ?? null, direction: item.procurement?.direction ?? null, detail_url: item.detail_url, source_url: item.source_url };
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
