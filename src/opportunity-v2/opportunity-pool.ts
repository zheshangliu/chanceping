import fs from "node:fs";
import path from "node:path";
import { identityHash, classifyCategory, type ParsedAggregationItem } from "../ich/aggregation/adapters/common";
import type { OpportunityV2, OpportunityV2PoolFile, V2OpportunityStatus } from "./types";
import { classifyV2RadarRelevance } from "./keywords";

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
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(pool, null, 2)}\n`, "utf8");
}

export function opportunityStatus(deadline: string | null, now = new Date()): V2OpportunityStatus {
  if (!deadline) return "UNKNOWN_DEADLINE";
  const timestamp = new Date(deadline).getTime();
  return Number.isFinite(timestamp) && timestamp < now.getTime() ? "EXPIRED" : "CURRENT";
}

function crossSourceTitleKey(title: string): string | null {
  const normalized = title.toLowerCase().replace(/[^a-z0-9]+/gu, " ").trim();
  return normalized.includes("loewe") && normalized.includes("foundation") && normalized.includes("craft") && normalized.includes("prize") && normalized.includes("2027")
    ? "loewe-foundation-craft-prize-2027"
    : null;
}

function mergeOpportunityRecords(prior: OpportunityV2, item: OpportunityV2, now: Date): OpportunityV2 {
  const preferIncoming = item.source_id === "loewe-craft-prize" && prior.source_id !== "loewe-craft-prize";
  return {
    ...prior,
    ...(preferIncoming ? { title: item.title, detail_url: item.detail_url, source_url: item.source_url, source_id: item.source_id, source_name: item.source_name } : {}),
    summary: prior.summary.length >= item.summary.length ? prior.summary : item.summary,
    deadline: prior.deadline ?? item.deadline,
    status: opportunityStatus(prior.deadline ?? item.deadline, now),
    first_seen_at: prior.first_seen_at,
    last_seen_at: now.toISOString(),
    discovered_by_sources: [...new Set([...prior.discovered_by_sources, ...item.discovered_by_sources])],
    tags: [...new Set([...prior.tags, ...item.tags])].slice(0, 8),
    source_url: preferIncoming ? item.source_url : (prior.source_url || item.source_url),
    source_name: preferIncoming ? item.source_name : (prior.source_name || item.source_name),
  };
}

export function normalizeOpportunityV2(input: ParsedAggregationItem, source: { id: string; name: string; region: "CN" | "GLOBAL" }, now = new Date()): OpportunityV2 {
  const summary = input.raw_text.replace(/\s+/gu, " ").trim().slice(0, 360) || input.title;
  const relevance = classifyV2RadarRelevance(input.title, summary, input.source_category ?? "");
  const identity = identityHash(input.title, input.deadline_at ?? "", input.organizer ?? "");
  return {
    id: `oppv2_${identity}`,
    title: input.title.trim(),
    summary,
    source_id: source.id,
    source_name: source.name,
    source_url: input.source_url,
    detail_url: input.detail_url,
    category: classifyCategory(input.source_category, input.title),
    region: source.region,
    tags: relevance.tags,
    deadline: input.deadline_at,
    status: opportunityStatus(input.deadline_at, now),
    first_seen_at: now.toISOString(),
    last_seen_at: now.toISOString(),
    discovered_by_sources: [source.id],
    radar_relevance: relevance.relevance,
    ...(input.organizer ? { organizer: input.organizer } : {}),
    ...(input.application_url ? { application_url: input.application_url } : {}),
  };
}

export function mergeOpportunityV2(existing: OpportunityV2[], incoming: OpportunityV2[], now = new Date()): OpportunityV2[] {
  const byKey = new Map<string, OpportunityV2>();
  for (const item of [...existing, ...incoming]) {
    const key = crossSourceTitleKey(item.title) ?? `url:${item.source_id}:${item.detail_url}`;
    const prior = byKey.get(key);
    byKey.set(key, prior ? mergeOpportunityRecords(prior, item, now) : { ...item, status: opportunityStatus(item.deadline, now) });
  }
  return [...byKey.values()];
}

export function deduplicateOpportunityV2(items: OpportunityV2[]): { opportunities: OpportunityV2[]; duplicate_count: number } {
  const byIdentity = new Map<string, OpportunityV2>();
  let duplicate_count = 0;
  for (const item of items) {
    const key = crossSourceTitleKey(item.title) ?? identityHash(item.title, item.deadline ?? "", item.organizer ?? "");
    const prior = byIdentity.get(key);
    if (!prior) {
      byIdentity.set(key, item);
      continue;
    }
    duplicate_count += 1;
    byIdentity.set(key, {
      ...prior,
      discovered_by_sources: [...new Set([...prior.discovered_by_sources, ...item.discovered_by_sources])],
      tags: [...new Set([...prior.tags, ...item.tags])].slice(0, 8),
      summary: prior.summary.length >= item.summary.length ? prior.summary : item.summary,
      ...(prior.detail_url ? {} : { detail_url: item.detail_url }),
    });
  }
  return { opportunities: [...byIdentity.values()], duplicate_count };
}
