import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { identityHash } from "../ich/aggregation/adapters/common";
import { atomicWriteJson, withJsonFileLock } from "./file-lock";
import type { OpportunityV2Source } from "./types";

export const DEFAULT_OPPORTUNITY_V2_SOURCES: OpportunityV2Source[] = [
  { id: "shejijingsai-list", name: "设计竞赛网", url: "https://www.shejijingsai.com/liebiao", region: "CN", priority: "P0", types: ["competition", "design", "cultural_creative"], radars: ["ich"], enabled: true, status: "ACTIVE", last_fetch_at: null },
  { id: "chuangsaiyun-competition-list", name: "创赛云", url: "https://www.xiacansai.com/mrjs.html", region: "CN", priority: "P0", types: ["competition", "design", "cultural_creative"], radars: ["ich"], enabled: true, status: "ACTIVE", last_fetch_at: null },
  { id: "contest-watchers-open", name: "Contest Watchers", url: "https://www.contestwatchers.com/feed/", region: "GLOBAL", priority: "P1", types: ["competition", "open_call"], radars: ["ich"], enabled: true, status: "ACTIVE", last_fetch_at: null },
  { id: "crafts-council-opportunities", name: "Crafts Council", url: "https://www.craftscouncil.org.uk/sector-support/opportunities", region: "GLOBAL", priority: "P0", types: ["craft", "open_call", "residency"], radars: ["ich"], enabled: true, status: "ACTIVE", last_fetch_at: null },
  { id: "artconnect-opportunities", name: "ArtConnect", url: "https://www.artconnect.com/opportunities", region: "GLOBAL", priority: "P1", types: ["art", "open_call", "exhibition"], radars: ["ich"], enabled: true, status: "ACTIVE", last_fetch_at: null },
  { id: "competitions-archi", name: "Competitions.archi", url: "https://competitions.archi/registration-ending-latest/", region: "GLOBAL", priority: "P1", types: ["competition", "architecture"], radars: ["ich"], enabled: true, status: "ACTIVE", last_fetch_at: null },
  { id: "loewe-craft-prize", name: "LOEWE FOUNDATION Craft Prize", url: "https://craftprize.loewe.com/zh/craftprize2027", region: "GLOBAL", priority: "P0", types: ["craft", "award", "competition"], radars: ["ich"], enabled: true, status: "ACTIVE", last_fetch_at: null },
  { id: "opencall-radar-craft", name: "OpenCall Radar｜Craft", url: "https://opencallradar.com/open-calls/discipline/craft", region: "GLOBAL", priority: "P0", types: ["craft", "open_call", "residency", "grant", "award"], radars: ["ich"], enabled: true, status: "PENDING", last_fetch_at: null },
  { id: "opencalls-ai", name: "opencalls.ai", url: "https://opencalls.ai/", region: "GLOBAL", priority: "P0", types: ["open_call", "residency", "grant", "award"], radars: ["ich"], enabled: true, status: "PENDING", last_fetch_at: null },
  { id: "american-craft-council-opportunities", name: "American Craft Council Opportunities Board", url: "https://craftcouncil.org/opportunities-board/", region: "GLOBAL", priority: "P0", types: ["craft", "open_call", "residency", "grant", "award"], radars: ["ich"], enabled: true, status: "PENDING", last_fetch_at: null },
  { id: "craft-scotland-opportunities", name: "Craft Scotland", url: "https://www.craftscotland.org/community", region: "GLOBAL", priority: "P0", types: ["craft", "open_call", "residency", "award", "market"], radars: ["ich"], enabled: true, status: "PENDING", last_fetch_at: null },
  { id: "kcdf-opportunities", name: "KCDF 한국공예·디자인문화진흥원", url: "https://www.kcdf.or.kr/main", region: "GLOBAL", priority: "P0", types: ["craft", "design", "open_call", "grant", "exhibition"], radars: ["ich"], enabled: true, status: "PENDING", last_fetch_at: null },
  { id: "heritage-crafts-opportunities", name: "Heritage Crafts", url: "https://heritagecrafts.org.uk/opportunities/", region: "GLOBAL", priority: "P0", types: ["craft", "heritage", "open_call", "grant", "award"], radars: ["ich"], enabled: true, status: "PENDING", last_fetch_at: null },
  { id: "homo-faber-calls", name: "Homo Faber Calls", url: "https://www.homofaber.com/en/news/cfp", region: "GLOBAL", priority: "P0", types: ["craft", "open_call", "fellowship", "residency"], radars: ["ich"], enabled: true, status: "PENDING", last_fetch_at: null },
  { id: "asef-culture360-opportunities", name: "ASEF culture360 Opportunities", url: "https://culture360.org/opportunities/", region: "GLOBAL", priority: "P1", types: ["craft", "heritage", "open_call", "grant", "residency"], radars: ["ich"], enabled: true, status: "PENDING", last_fetch_at: null },
  { id: "on-the-move-open-calls", name: "On the Move Open Calls", url: "https://on-the-move.org/news", region: "GLOBAL", priority: "P1", types: ["open_call", "grant", "residency", "mobility"], radars: ["ich"], enabled: true, status: "PENDING", last_fetch_at: null },
  { id: "curatorspace-opportunities", name: "CuratorSpace Opportunities", url: "https://www.curatorspace.com/opportunities?orderBy=latest", region: "GLOBAL", priority: "P1", types: ["craft", "open_call", "exhibition", "residency", "award"], radars: ["ich"], enabled: true, status: "PENDING", last_fetch_at: null },
  { id: "cafe-call-for-entry", name: "CaFÉ CallForEntry", url: "https://artist.callforentry.org/festivals.php/calendar.phtml", region: "GLOBAL", priority: "P1", types: ["craft", "open_call", "exhibition", "award", "competition"], radars: ["ich"], enabled: true, status: "PENDING", last_fetch_at: null },
  { id: "artshub-craft-opportunities", name: "ArtsHub Craft Opportunities", url: "https://www.artshub.com.au/opportunity/", region: "GLOBAL", priority: "P1", types: ["craft", "open_call", "exhibition", "residency", "grant", "award"], radars: ["ich"], enabled: true, status: "PENDING", last_fetch_at: null },
  { id: "craft-council-bc-calls", name: "Craft Council of British Columbia Calls", url: "https://craftcouncilbc.ca/call-for-entry/", region: "GLOBAL", priority: "P1", types: ["craft", "open_call", "exhibition", "market", "residency"], radars: ["ich"], enabled: true, status: "PENDING", last_fetch_at: null },
  { id: "craft-council-nl-opportunities", name: "Craft Council of Newfoundland and Labrador Opportunities", url: "https://www.craftcouncilnl.ca/opportunities/opportunities", region: "GLOBAL", priority: "P1", types: ["craft", "open_call", "exhibition", "market", "residency"], radars: ["ich"], enabled: true, status: "PENDING", last_fetch_at: null },
  { id: "cfw-cultural-ip", name: "CFW设计大赛｜文创IP", url: "https://dasai.cfw.cn/compete/search?categoryCode=0400&ordernum=0&page=1", region: "CN", priority: "P0", types: ["competition", "cultural_creative", "heritage", "tourism_product", "ip", "gift"], radars: ["ich"], enabled: true, status: "PENDING", last_fetch_at: null },
  { id: "whaleideas-competition", name: "文创赛网｜鲸创意", url: "https://whaleideas.com/zjds/index.html", region: "CN", priority: "P0", types: ["competition", "cultural_creative", "heritage", "tourism_product", "ip"], radars: ["ich"], enabled: true, status: "PENDING", last_fetch_at: null },
  { id: "1zj-cultural-competition", name: "第一征集网｜全球征集网", url: "https://www.1zj.com/index.php?m=content&c=index&a=lists&catid=85&cid=6", region: "CN", priority: "P0", types: ["competition", "cultural_creative", "design", "gift"], radars: ["ich"], enabled: true, status: "PENDING", last_fetch_at: null },
  { id: "chuangyisai-cultural", name: "创意赛网", url: "https://chuangyisai.com/", region: "CN", priority: "P0", types: ["competition", "cultural_creative", "heritage", "tourism_product", "design"], radars: ["ich"], enabled: true, status: "PENDING", last_fetch_at: null },
  { id: "zcool-challenges", name: "站酷挑战赛 ZCOOL", url: "https://www.zcool.com.cn/events/challenge", region: "CN", priority: "P0", types: ["competition", "brand_collaboration", "cultural_creative", "ip", "packaging", "aigc", "design"], radars: ["ich"], enabled: true, status: "PENDING", last_fetch_at: null },
  { id: "zjmtcn-product-competition", name: "征集码头", url: "https://www.zjmtcn.com/zjxx/chanpin/index.html", region: "CN", priority: "P1", types: ["competition", "cultural_creative", "tourism_product", "gift", "craft", "design"], radars: ["ich"], enabled: true, status: "PENDING", last_fetch_at: null },
  { id: "iuben-cultural-competition", name: "优本视觉", url: "https://iuben.cn/collect/", region: "CN", priority: "P1", types: ["competition", "cultural_creative", "heritage", "tourism_product", "packaging", "design"], radars: ["ich"], enabled: true, status: "PENDING", last_fetch_at: null },
  { id: "everyart-competition", name: "EveryArt", url: "https://www.everyart.cn/search/0/%E8%89%BA%E6%9C%AF%E5%BE%81%E9%9B%86", region: "CN", priority: "P1", types: ["competition", "open_call", "cultural_creative", "heritage", "residency", "exhibition"], radars: ["ich"], enabled: true, status: "PENDING", last_fetch_at: null },
  { id: "gtn9-competition", name: "古田路9号", url: "https://www.gtn9.com/work_list.aspx?action=index_red&id=565&subcategory=567", region: "CN", priority: "P1", types: ["competition", "cultural_creative", "heritage", "tourism_product", "ip", "packaging", "design"], radars: ["ich"], enabled: true, status: "PENDING", last_fetch_at: null },
];

// These are the built-in seed IDs exported for compatibility. They are not an allowlist:
// Source Manager validation accepts any legal lowercase slug.
export const OPPORTUNITY_V2_SOURCE_IDS = DEFAULT_OPPORTUNITY_V2_SOURCES.map((source) => source.id);

function resolved(filePath?: string): string {
  const configured = filePath ?? process.env.CHANCEPING_OPPORTUNITY_V2_SOURCES_PATH;
  if (configured) return path.resolve(configured);
  const runtimePath = "/var/lib/chanceping/opportunity-v2/sources.json";
  return path.resolve(fs.existsSync(path.dirname(runtimePath)) ? runtimePath : "data/opportunity-v2/sources.json");
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
  withJsonFileLock(target, () => atomicWriteJson(target, { schema_version: "chanceping-opportunity-v2.sources.v1", updated_at: new Date().toISOString(), sources }));
}

export function appendOpportunityV2Source(source: OpportunityV2Source, filePath?: string): OpportunityV2Source {
  const target = resolved(filePath);
  return withJsonFileLock(target, () => {
    const sources = readOpportunityV2Sources(filePath);
    if (sources.some((candidate) => candidate.id === source.id)) throw new Error("Source ID 已存在");
    const next = [...sources, source];
    const errors = validateOpportunityV2Sources(next);
    if (errors.length) throw new Error(errors.join("; "));
    atomicWriteJson(target, { schema_version: "chanceping-opportunity-v2.sources.v1", updated_at: new Date().toISOString(), sources: next });
    return source;
  });
}

export function validateOpportunityV2Sources(sources: OpportunityV2Source[]): string[] {
  const errors: string[] = [];
  if (new Set(sources.map((source) => source.id)).size !== sources.length) errors.push("source ids must be unique");
  for (const source of sources) {
    if (!source.id || !source.name || !isPublicHttpUrl(source.url)) errors.push(`${source.id || "unknown"}: id/name/url are required and URL must be public HTTP(S)`);
    if (!/^[a-z0-9][a-z0-9-]{0,79}$/u.test(source.id)) errors.push(`${source.id || "unknown"}: id must be a lowercase slug`);
    if (source.region !== "CN" && source.region !== "GLOBAL") errors.push(`${source.id}: region must be CN or GLOBAL`);
    if (source.priority !== "P0" && source.priority !== "P1") errors.push(`${source.id}: priority must be P0 or P1`);
    if (source.radars.length === 0) errors.push(`${source.id}: at least one radar is required`);
  }
  return errors;
}

export function isPublicHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (!/^https?:$/u.test(url.protocol)) return false;
    if (url.username || url.password) return false;
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/gu, "");
    if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal") || host === "metadata.google.internal") return false;
    if (net.isIP(host)) return isPublicIp(host);
    return host.length > 0 && !host.endsWith(".");
  } catch {
    return false;
  }
}

export function isPublicIp(address: string): boolean {
  const host = address.toLowerCase().replace(/^\[|\]$/gu, "");
  if (net.isIP(host) === 4) {
    const parts = host.split(".").map(Number);
    const [a, b] = parts;
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
    return a !== 0 && a !== 10 && a !== 127 && !(a === 169 && b === 254) && !(a === 172 && b >= 16 && b <= 31) && !(a === 192 && b === 168) && !(a >= 224);
  }
  if (net.isIP(host) === 6) {
    if (host === "::" || host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe8") || host.startsWith("fe9") || host.startsWith("fea") || host.startsWith("feb") || host.startsWith("ff")) return false;
    const mapped = host.match(/::ffff:(.+)$/u);
    if (!mapped) return true;
    const dotted = mapped[1].match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/u);
    if (dotted) return isPublicIp(dotted[0]);
    const hex = mapped[1].split(":");
    if (hex.length !== 2 || hex.some((part) => !/^[0-9a-f]{1,4}$/u.test(part))) return false;
    const high = Number.parseInt(hex[0], 16);
    const low = Number.parseInt(hex[1], 16);
    return isPublicIp(`${high >>> 8}.${high & 255}.${low >>> 8}.${low & 255}`);
  }
  return false;
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
  const target = resolved(filePath);
  return withJsonFileLock(target, () => {
    const sources = readOpportunityV2Sources(filePath);
    const index = sources.findIndex((source) => source.id === sourceId);
    if (index < 0) throw new Error(`Source not found: ${sourceId}`);
    const next = { ...sources[index], ...patch, id: sourceId };
    const errors = validateOpportunityV2Sources([next]);
    if (errors.length) throw new Error(errors.join("; "));
    sources[index] = next;
    atomicWriteJson(target, { schema_version: "chanceping-opportunity-v2.sources.v1", updated_at: new Date().toISOString(), sources });
    return next;
  });
}

export function setOpportunityV2SourceState(sourceId: string, state: { enabled: boolean; status: OpportunityV2Source["status"] }, filePath?: string): OpportunityV2Source {
  return updateOpportunityV2Source(sourceId, state, filePath);
}
