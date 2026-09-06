import { getIchSourceRegistryV2 } from "../source-registry-v2";
import type { AggregationSourceDefinition } from "./types";

export const AGGREGATION_SOURCE_IDS = [
  "shejijingsai-list",
  "contest-watchers-open",
  "crafts-council-opportunities",
  "artconnect-opportunities",
  "competitions-archi",
] as const;

export function getAggregationRegistry(): AggregationSourceDefinition[] {
  const registry = getIchSourceRegistryV2();
  return AGGREGATION_SOURCE_IDS.map((sourceId) => {
    const entry = registry.sources.find((source) => source.id === sourceId);
    if (!entry) throw new Error(`Aggregation source is not registered in ICH Source Registry: ${sourceId}`);
    return {
      source_id: sourceId,
      name: entry.name,
      canonical_url: entry.canonical_url,
      discovery_url: entry.canonical_url,
      adapter_id: entry.adapter_id ?? `${sourceId}-v1`,
      tier: sourceId === "artconnect-opportunities" || sourceId === "competitions-archi" ? "P1" : "P0",
      region: sourceId === "shejijingsai-list" ? "CN" : "GLOBAL",
      source_type: entry.access_mode === "rss" ? "rss" : "listing",
      priority: sourceId === "artconnect-opportunities" || sourceId === "competitions-archi" ? "P1" : "P0",
      source_role: "discovery_source",
      categories: entry.categories,
      health_status: entry.health_status ?? "pending",
    };
  });
}

export function validateAggregationRegistry(): string[] {
  const errors: string[] = [];
  const ids = new Set(getIchSourceRegistryV2().sources.map((source) => source.id));
  for (const source of getAggregationRegistry()) {
    if (!ids.has(source.source_id)) errors.push(`${source.source_id}: missing from source registry`);
    if (source.source_role !== "discovery_source") errors.push(`${source.source_id}: must be discovery_source`);
    if (!source.adapter_id) errors.push(`${source.source_id}: adapter_id missing`);
    if (!/^https?:\/\//.test(source.discovery_url)) errors.push(`${source.source_id}: invalid discovery_url`);
  }
  return errors;
}
