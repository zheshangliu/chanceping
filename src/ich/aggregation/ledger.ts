import fs from "node:fs";
import path from "node:path";
import type { AggregationItem, AggregationItemStatus, AggregationLedgerEntry, AggregationLedgerFile } from "./types";

export function emptyLedger(): AggregationLedgerFile {
  return { schema_version: "ich-aggregation-discovery-ledger.v1", updated_at: new Date(0).toISOString(), entries: [] };
}

export function readLedger(filePath: string): AggregationLedgerFile {
  if (!fs.existsSync(filePath)) return emptyLedger();
  try { return JSON.parse(fs.readFileSync(filePath, "utf8")) as AggregationLedgerFile; } catch { return emptyLedger(); }
}

export function compareToLedger(items: AggregationItem[], previous: AggregationLedgerFile, now: string, observedSourceIds = new Set<string>()): { items: AggregationItem[]; entries: AggregationLedgerEntry[]; counts: Record<AggregationItemStatus, number>; isFirstRun: boolean } {
  const previousById = new Map(previous.entries.map((entry) => [entry.item_id, entry]));
  const seen = new Set<string>();
  const counts: Record<AggregationItemStatus, number> = { NEW: 0, UPDATED: 0, UNCHANGED: 0, REMOVED: 0 };
  const nextItems = items.map((item) => {
    seen.add(item.item_id);
    const prior = previousById.get(item.item_id);
    const status: AggregationItemStatus = !prior ? "NEW" : prior.content_hash === item.content_hash ? "UNCHANGED" : "UPDATED";
    counts[status] += 1;
    return { ...item, status, first_seen_at: prior?.first_seen_at ?? now, last_seen_at: now, last_content_hash: prior?.content_hash ?? null };
  });
  const removed = previous.entries.filter((entry) => !seen.has(entry.item_id) && observedSourceIds.has(entry.source_id)).map((entry) => {
    counts.REMOVED += 1;
    return { ...entry, status: "REMOVED" as const, last_seen_at: now };
  });
  // A timeout, 403, JS wall, or parser failure is not evidence that all prior
  // items disappeared. Keep those source records in the ledger without
  // exposing them as current candidates until the source is observed again.
  const preservedFromUnavailableSources = previous.entries.filter((entry) => !seen.has(entry.item_id) && !observedSourceIds.has(entry.source_id));
  const entries = [...nextItems.map((item) => ({
    source_id: item.source_id, source_item_id: item.source_item_id, item_id: item.item_id, title: item.title, source_category: item.source_category, source_status: item.source_status ?? null,
    discovery_url: item.discovery_url, detail_url: item.detail_url, deadline_at: item.deadline_at, first_seen_at: item.first_seen_at,
    last_seen_at: item.last_seen_at, content_hash: item.content_hash, last_content_hash: item.last_content_hash, status: item.status,
    official_backtrace_status: item.official_backtrace_status, candidate_status: item.relevance === "IRRELEVANT" ? "rejected" as const : "pending" as const,
  })), ...removed, ...preservedFromUnavailableSources];
  return { items: nextItems, entries, counts, isFirstRun: previous.entries.length === 0 };
}

export function writeLedger(filePath: string, entries: AggregationLedgerEntry[], updatedAt: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify({ schema_version: "ich-aggregation-discovery-ledger.v1", updated_at: updatedAt, entries }, null, 2)}\n`, "utf8");
}
