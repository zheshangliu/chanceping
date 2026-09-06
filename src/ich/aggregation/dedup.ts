import { identityHash } from "./adapters/common";
import type { AggregationItem } from "./types";

export function normalizeOfficialUrl(url: string | null): string {
  if (!url) return "";
  try { const value = new URL(url); value.hash = ""; return value.toString().replace(/\/$/, "").toLowerCase(); } catch { return url.trim().toLowerCase(); }
}

export function aggregationIdentity(item: Pick<AggregationItem, "detail_url" | "title" | "deadline_at" | "source_id">): string {
  const url = normalizeOfficialUrl(item.detail_url);
  return url || identityHash(item.title, item.deadline_at ?? "", item.source_id);
}

export function deduplicateAggregationItems(items: AggregationItem[]): { items: AggregationItem[]; duplicateCount: number } {
  const byKey = new Map<string, AggregationItem>();
  let duplicateCount = 0;
  for (const item of items) {
    const key = aggregationIdentity(item);
    const prior = byKey.get(key);
    if (!prior) { byKey.set(key, item); continue; }
    duplicateCount += 1;
    const discovered = [...new Set([...prior.discovered_by_sources, ...item.discovered_by_sources])];
    byKey.set(key, { ...prior, discovered_by_sources: discovered, raw_text: prior.raw_text.length >= item.raw_text.length ? prior.raw_text : item.raw_text });
  }
  return { items: [...byKey.values()], duplicateCount };
}
