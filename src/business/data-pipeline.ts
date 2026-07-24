import fs from "node:fs";
import path from "node:path";

export type SourcePriority = "P0" | "P1" | "P2";
export type SourceRole = "official_fact" | "candidate_discovery";
export type CandidateState = "DISCOVERED" | "FETCH_FAILED" | "FETCHED" | "EXTRACTED" | "NEEDS_MANUAL_PARSE" | "NORMALIZED" | "DEDUPE_REVIEW" | "DUPLICATE" | "MANUAL_DEDUPE" | "PENDING_VERIFICATION" | "FIELD_VERIFIED" | "FULLY_VERIFIED" | "PUBLISHED" | "NEEDS_REVIEW" | "EXPIRED" | "REVOKED" | "REJECTED" | "ARCHIVED";
export type SourceHealthStatus = "HEALTHY" | "DEGRADED" | "DOWN" | "MANUAL_ONLY";

export interface SourceDefinition {
  sourceId: string;
  name: string;
  officialDomain: string;
  entryUrl: string;
  authority: string;
  regions: string;
  categories: string;
  priority: SourcePriority;
  role: SourceRole;
  yield: string;
  method: string;
  technical: string;
  risks: string;
  finalAllowed: "是" | "条件式" | "否";
  batch: string;
  frequency: string;
  health: string;
  lastChecked: string;
  notes: string;
}

export interface SourceRegistry {
  version: string;
  generatedAt: string;
  timezone: "Asia/Shanghai";
  sourceCount: number;
  rules: Record<SourcePriority, string>;
  sources: SourceDefinition[];
}

export interface FieldEvidence {
  url: string;
  locator: string;
  capturedAt: string;
}

export interface EvidenceRecord {
  candidateId: string;
  sourceId: string;
  discoveryUrl: string;
  officialUrl?: string;
  fetchedAt: string;
  lastVerifiedAt?: string;
  documentHash?: string;
  originalSummary?: string;
  fieldEvidence: Record<string, FieldEvidence[]>;
}

export interface CandidateRecord {
  candidateId: string;
  sourceId: string;
  discoveryUrl: string;
  canonicalUrl?: string;
  sourceRecordId?: string;
  noticeNo?: string;
  rawTitle: string;
  rawPublishedAt?: string;
  rawDeadlineText?: string;
  htmlHash?: string;
  contentHash?: string;
  state: CandidateState;
  duplicateStatus?: "NONE" | "EXACT" | "POSSIBLE" | "MANUAL";
  evidenceRef?: string;
  primaryRegionBucket?: "guangzhou" | "tianhe" | "shaoguan" | "guangdong";
  createdAt: string;
  updatedAt: string;
}

export interface SourceHealth {
  sourceId: string;
  status: SourceHealthStatus;
  checkedAt: string;
  latencyMs?: number;
  detail: string;
}

export interface SourceAdapter {
  sourceId: string;
  healthcheck(): Promise<SourceHealth>;
  fetchList(cursor?: string): Promise<{ items: Array<Pick<CandidateRecord, "sourceRecordId" | "rawTitle" | "discoveryUrl" | "rawPublishedAt">>; nextCursor?: string; fetchedAt: string }>;
  fetchDetail(candidate: CandidateRecord): Promise<{ url: string; content: string; fetchedAt: string }>;
  extractEvidence(candidate: CandidateRecord, document: { url: string; content: string; fetchedAt: string }): Promise<EvidenceRecord>;
  normalize(candidate: CandidateRecord, evidence: EvidenceRecord): Promise<CandidateRecord>;
}

const REGISTRY_PATH = path.resolve(process.cwd(), "src/business/data/source-registry.v1.json");

function fail(message: string): never { throw new Error(`Business data pipeline validation failed: ${message}`); }
function required(value: unknown, name: string): string { if (typeof value !== "string" || !value.trim()) fail(`${name} is required`); return value.trim(); }
function https(value: string, name: string): void { try { if (new URL(value).protocol !== "https:") throw new Error(); } catch { fail(`${name} must be an HTTPS URL`); } }

export function validateSourceRegistry(value: unknown): SourceRegistry {
  if (!value || typeof value !== "object") fail("registry must be an object");
  const registry = value as Partial<SourceRegistry>;
  if (registry.timezone !== "Asia/Shanghai") fail("timezone must be Asia/Shanghai");
  if (!Array.isArray(registry.sources) || registry.sources.length === 0) fail("sources must be a non-empty array");
  const ids = new Set<string>();
  for (const source of registry.sources) {
    const sourceId = required(source.sourceId, "sourceId");
    if (ids.has(sourceId)) fail(`duplicate sourceId ${sourceId}`);
    ids.add(sourceId);
    required(source.name, `${sourceId}.name`);
    https(required(source.entryUrl, `${sourceId}.entryUrl`), `${sourceId}.entryUrl`);
    required(source.officialDomain, `${sourceId}.officialDomain`);
    if (!(["P0", "P1", "P2"] as string[]).includes(source.priority)) fail(`${sourceId}.priority is invalid`);
    if (!(["official_fact", "candidate_discovery"] as string[]).includes(source.role)) fail(`${sourceId}.role is invalid`);
    if (source.priority === "P2" && source.role !== "candidate_discovery") fail(`${sourceId} P2 sources must be candidate discovery only`);
    if (source.role === "candidate_discovery" && source.finalAllowed === "是") fail(`${sourceId} discovery source cannot be finalAllowed`);
  }
  if (registry.sourceCount !== registry.sources.length) fail(`sourceCount ${registry.sourceCount} does not match sources ${registry.sources.length}`);
  return registry as SourceRegistry;
}

export function loadSourceRegistry(file = REGISTRY_PATH): SourceRegistry {
  return validateSourceRegistry(JSON.parse(fs.readFileSync(file, "utf8")));
}

/** P2 sources may discover records, but their own URLs are never eligible as public facts. */
export function sourceMayPublish(source: SourceDefinition): boolean {
  return source.role === "official_fact" && (source.priority === "P0" || source.priority === "P1") && source.finalAllowed === "是";
}

export function sourceById(sourceId: string): SourceDefinition | undefined {
  return loadSourceRegistry().sources.find((source) => source.sourceId === sourceId);
}
