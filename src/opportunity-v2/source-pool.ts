import fs from "node:fs";
import path from "node:path";
import { identityHash } from "../ich/aggregation/adapters/common";
import type { OpportunityV2Source } from "./types";

export const OPPORTUNITY_V2_SOURCE_IDS = [
  "shejijingsai-list",
  "chuangsaiyun-competition-list",
  "contest-watchers-open",
  "crafts-council-opportunities",
  "artconnect-opportunities",
  "competitions-archi",
] as const;

export const DEFAULT_OPPORTUNITY_V2_SOURCES: OpportunityV2Source[] = [
  { id: "shejijingsai-list", name: "设计竞赛网", url: "https://www.shejijingsai.com/liebiao", region: "CN", priority: "P0", types: ["competition", "design", "cultural_creative"], radars: ["ich"], enabled: true, status: "ACTIVE", last_fetch_at: null },
  { id: "chuangsaiyun-competition-list", name: "创赛云", url: "https://www.xiacansai.com/mrjs.html", region: "CN", priority: "P0", types: ["competition", "design", "cultural_creative"], radars: ["ich"], enabled: true, status: "ACTIVE", last_fetch_at: null },
  { id: "contest-watchers-open", name: "Contest Watchers", url: "https://www.contestwatchers.com/feed/", region: "GLOBAL", priority: "P0", types: ["competition", "open_call"], radars: ["ich"], enabled: true, status: "ACTIVE", last_fetch_at: null },
  { id: "crafts-council-opportunities", name: "Crafts Council", url: "https://www.craftscouncil.org.uk/sector-support/opportunities", region: "GLOBAL", priority: "P0", types: ["craft", "open_call", "residency"], radars: ["ich"], enabled: true, status: "ACTIVE", last_fetch_at: null },
  { id: "artconnect-opportunities", name: "ArtConnect", url: "https://www.artconnect.com/opportunities", region: "GLOBAL", priority: "P1", types: ["art", "open_call", "exhibition"], radars: ["ich"], enabled: true, status: "ACTIVE", last_fetch_at: null },
  { id: "competitions-archi", name: "Competitions.archi", url: "https://competitions.archi/registration-ending-latest/", region: "GLOBAL", priority: "P1", types: ["competition", "architecture"], radars: ["ich"], enabled: true, status: "ACTIVE", last_fetch_at: null },
];

function resolved(filePath?: string): string {
  return path.resolve(filePath ?? process.env.CHANCEPING_OPPORTUNITY_V2_SOURCES_PATH ?? "data/opportunity-v2/sources.json");
}

export function readOpportunityV2Sources(filePath?: string): OpportunityV2Source[] {
  const target = resolved(filePath);
  if (!fs.existsSync(target)) return DEFAULT_OPPORTUNITY_V2_SOURCES.map((source) => ({ ...source, types: [...source.types], radars: [...source.radars] }));
  try {
    const value = JSON.parse(fs.readFileSync(target, "utf8")) as { sources?: OpportunityV2Source[] } | OpportunityV2Source[];
    const sources = Array.isArray(value) ? value : value.sources;
    if (!Array.isArray(sources)) return DEFAULT_OPPORTUNITY_V2_SOURCES;
    return sources;
  } catch {
    return DEFAULT_OPPORTUNITY_V2_SOURCES;
  }
}

export function writeOpportunityV2Sources(sources: OpportunityV2Source[], filePath?: string): void {
  const target = resolved(filePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify({ schema_version: "chanceping-opportunity-v2.sources.v1", updated_at: new Date().toISOString(), sources }, null, 2)}\n`, "utf8");
}

export function validateOpportunityV2Sources(sources: OpportunityV2Source[]): string[] {
  const errors: string[] = [];
  if (new Set(sources.map((source) => source.id)).size !== sources.length) errors.push("source ids must be unique");
  for (const source of sources) {
    if (!source.id || !source.name || !/^https?:\/\//u.test(source.url)) errors.push(`${source.id || "unknown"}: id/name/url are required`);
    if (!/^[a-z0-9][a-z0-9-]{0,79}$/u.test(source.id)) errors.push(`${source.id || "unknown"}: id must be a lowercase slug`);
    if (source.region !== "CN" && source.region !== "GLOBAL") errors.push(`${source.id}: region must be CN or GLOBAL`);
    if (source.priority !== "P0" && source.priority !== "P1") errors.push(`${source.id}: priority must be P0 or P1`);
    if (source.radars.length === 0) errors.push(`${source.id}: at least one radar is required`);
  }
  return errors;
}

export interface OpportunityV2SourceInput {
  id?: string;
  name: string;
  url: string;
  region: "CN" | "GLOBAL";
  priority: "P0" | "P1";
  types: string[];
  radars: string[];
}

function sourceIdFor(input: OpportunityV2SourceInput): string {
  const slug = input.id?.trim().toLowerCase() || input.name.trim().toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 64);
  return slug || `source-${identityHash(input.url)}`;
}

function normalizeInput(input: OpportunityV2SourceInput): OpportunityV2SourceInput {
  return {
    ...input,
    id: sourceIdFor(input),
    name: input.name.trim(),
    url: input.url.trim(),
    types: [...new Set(input.types.map((value) => value.trim()).filter(Boolean))],
    radars: [...new Set(input.radars.map((value) => value.trim()).filter(Boolean))],
  };
}

export function createOpportunityV2Source(input: OpportunityV2SourceInput): OpportunityV2Source {
  const normalized = normalizeInput(input);
  const source = {
    ...normalized,
    id: normalized.id as string,
    enabled: true,
    status: "PENDING" as const,
    last_fetch_at: null,
  };
  const errors = validateOpportunityV2Sources([source]);
  if (errors.length) throw new Error(errors.join("; "));
  return source;
}

export function findOpportunityV2Source(sourceId: string, filePath?: string): OpportunityV2Source | undefined {
  return readOpportunityV2Sources(filePath).find((source) => source.id === sourceId);
}

export function updateOpportunityV2Source(sourceId: string, patch: Partial<OpportunityV2Source>, filePath?: string): OpportunityV2Source {
  const sources = readOpportunityV2Sources(filePath);
  const index = sources.findIndex((source) => source.id === sourceId);
  if (index < 0) throw new Error(`Source not found: ${sourceId}`);
  const next = { ...sources[index], ...patch, id: sourceId };
  const errors = validateOpportunityV2Sources([next]);
  if (errors.length) throw new Error(errors.join("; "));
  sources[index] = next;
  writeOpportunityV2Sources(sources, filePath);
  return next;
}

export function setOpportunityV2SourceState(sourceId: string, state: { enabled: boolean; status: OpportunityV2Source["status"] }, filePath?: string): OpportunityV2Source {
  return updateOpportunityV2Source(sourceId, state, filePath);
}
