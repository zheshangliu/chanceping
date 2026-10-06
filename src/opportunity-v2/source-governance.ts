import type { OpportunityV2, OpportunityV2Source } from "./types";

export type OpportunityV2SourcePermission = "REVIEWED_OK" | "REVIEWED_METADATA_ONLY" | "OFFICIAL_OPEN_DATA" | "COMPLIANCE_HOLD" | "NOT_REVIEWED";
export type OpportunityV2FreshnessStatus = "FRESH" | "STALE" | "NEVER_SUCCEEDED" | "UNKNOWN";
export const OPPORTUNITY_V2_STALE_AFTER_HOURS = 78;
export const ARTCONNECT_TERMS_URL = "https://www.magazine.artconnect.com/terms";

// ArtConnect's published terms require prior written permission for automated
// access/collection and reproduction. No permission evidence was supplied in
// this task. Keep the registry and historical rows, but fail closed for fresh
// collection and canonical public copies.
const COMPLIANCE_HOLD_SOURCE_IDS = new Set(["artconnect-opportunities"]);
const OFFICIAL_OPEN_DATA_SOURCE_IDS = new Set(["proc-ca-canadabuys"]);
const CANADABUYS_DATASET_URL = "https://open.canada.ca/data/en/dataset/6abd20d4-7a1c-4b38-baa2-9525d0bb2fd2";
const CANADABUYS_LICENSE_URL = "https://open.canada.ca/en/open-government-licence-canada";

export function getOpportunityV2SourcePermission(sourceId: string): OpportunityV2SourcePermission {
  if (COMPLIANCE_HOLD_SOURCE_IDS.has(sourceId)) return "COMPLIANCE_HOLD";
  if (OFFICIAL_OPEN_DATA_SOURCE_IDS.has(sourceId)) return "OFFICIAL_OPEN_DATA";
  return "NOT_REVIEWED";
}

export function getOpportunityV2SourcePermissionEvidence(sourceId: string): { basis: string; url: string | null } {
  const permission = getOpportunityV2SourcePermission(sourceId);
  if (permission === "COMPLIANCE_HOLD") return { basis: "Official ArtConnect terms require prior written permission for automated access/collection and reproduction; no written permission evidence was supplied.", url: ARTCONNECT_TERMS_URL };
  if (permission === "OFFICIAL_OPEN_DATA") return { basis: `Official Open Government Portal identifies the CanadaBuys tender-notices dataset under the Open Government Licence - Canada; attribution remains required. Licence: ${CANADABUYS_LICENSE_URL}`, url: CANADABUYS_DATASET_URL };
  return { basis: "NOT_REVIEWED; no permission/license conclusion is made. Public display is limited to necessary metadata and source link.", url: null };
}

export function isOpportunityV2SourceCollectionAllowed(sourceId: string): boolean {
  return getOpportunityV2SourcePermission(sourceId) !== "COMPLIANCE_HOLD";
}

/** Long summaries are public only when source reuse permissions have evidence. */
export function isOpportunityV2PublicSummaryAllowed(sourceId: string): boolean {
  const permission = getOpportunityV2SourcePermission(sourceId);
  return permission === "REVIEWED_OK" || permission === "OFFICIAL_OPEN_DATA";
}

export function isOpportunityV2PublicCopyAllowed(item: Pick<OpportunityV2, "source_id">): boolean {
  return isOpportunityV2SourceCollectionAllowed(item.source_id);
}

export function publicOpportunityV2DiscoverySources(sourceIds: string[]): string[] {
  return [...new Set(sourceIds.filter(isOpportunityV2SourceCollectionAllowed))];
}

export function hasPublicOpportunityV2DiscoverySource(sourceIds: string[], sourceId: string): boolean {
  return publicOpportunityV2DiscoverySources(sourceIds).includes(sourceId);
}

export function sourceFreshness(lastSuccessAt: string | null | undefined, now = new Date()): { status: OpportunityV2FreshnessStatus; age_hours: number | null; stale_after_hours: number } {
  if (!lastSuccessAt) return { status: "NEVER_SUCCEEDED", age_hours: null, stale_after_hours: OPPORTUNITY_V2_STALE_AFTER_HOURS };
  const timestamp = new Date(lastSuccessAt).getTime();
  if (!Number.isFinite(timestamp) || timestamp > now.getTime()) return { status: "UNKNOWN", age_hours: null, stale_after_hours: OPPORTUNITY_V2_STALE_AFTER_HOURS };
  const ageHours = (now.getTime() - timestamp) / (60 * 60 * 1000);
  return { status: ageHours > OPPORTUNITY_V2_STALE_AFTER_HOURS ? "STALE" : "FRESH", age_hours: Math.round(ageHours * 100) / 100, stale_after_hours: OPPORTUNITY_V2_STALE_AFTER_HOURS };
}

export function isOpportunityV2SourceRunnable(source: Pick<OpportunityV2Source, "id" | "enabled" | "status">): boolean {
  return source.enabled && isOpportunityV2SourceCollectionAllowed(source.id) && !["PAUSED", "NEEDS_ADAPTER"].includes(source.status);
}
