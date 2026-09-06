import fs from "node:fs";
import path from "node:path";
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
    if (!OPPORTUNITY_V2_SOURCE_IDS.includes(source.id as typeof OPPORTUNITY_V2_SOURCE_IDS[number])) errors.push(`${source.id}: not in V2 first source pool`);
    if (source.priority !== "P0" && source.priority !== "P1") errors.push(`${source.id}: priority must be P0 or P1`);
    if (source.radars.length === 0) errors.push(`${source.id}: at least one radar is required`);
  }
  return errors;
}
