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

export function canonicalOpportunityTitle(title: string): string {
  let normalized = title.normalize("NFKC").toLowerCase().trim();
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

const CFW_SOURCE_ID = "cfw-cultural-ip";

function mergeOpportunityRecords(prior: OpportunityV2, item: OpportunityV2, now: Date): OpportunityV2 {
  const preferIncoming = item.source_id === "loewe-craft-prize" && prior.source_id !== "loewe-craft-prize";
  const sameCfwDetail = item.source_id === CFW_SOURCE_ID && prior.source_id === CFW_SOURCE_ID && item.detail_url === prior.detail_url;
  const deadline = sameCfwDetail && item.deadline ? item.deadline : (prior.deadline ?? item.deadline);
  return {
    ...prior,
    ...(preferIncoming ? { title: item.title, detail_url: item.detail_url, source_url: item.source_url, source_id: item.source_id, source_name: item.source_name } : {}),
    summary: prior.summary.length >= item.summary.length ? prior.summary : item.summary,
    deadline,
    status: opportunityStatus(deadline, now),
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
  const cfwDetailKeys = new Map<string, string>();
  for (const item of [...existing, ...incoming]) {
    const titleKey = crossSourceTitleKey(item.title) ?? `url:${item.source_id}:${item.detail_url}`;
    const cfwDetailKey = item.source_id === CFW_SOURCE_ID ? item.detail_url : null;
    const key = cfwDetailKey ? (cfwDetailKeys.get(cfwDetailKey) ?? titleKey) : titleKey;
    const prior = byKey.get(key);
    byKey.set(key, prior ? mergeOpportunityRecords(prior, item, now) : { ...item, status: opportunityStatus(item.deadline, now) });
    if (cfwDetailKey) cfwDetailKeys.set(cfwDetailKey, key);
  }
  return [...byKey.values()];
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
      tags: [...new Set([...prior.tags, ...item.tags])].slice(0, 8),
      summary: prior.summary.length >= item.summary.length ? prior.summary : item.summary,
      ...(prior.detail_url ? {} : { detail_url: item.detail_url }),
    });
    if (cfwDetailKey) cfwDetailKeys.set(cfwDetailKey, key);
  }
  return { opportunities: [...byIdentity.values()], duplicate_count };
}
