import type { OpportunityV2, OpportunityV2Source } from "./types";

export type OpportunityV2SourcePermission = "COMPLIANCE_HOLD" | "NOT_REVIEWED";
export type OpportunityV2FreshnessStatus = "FRESH" | "STALE" | "NEVER_SUCCEEDED" | "UNKNOWN";
export const OPPORTUNITY_V2_STALE_AFTER_HOURS = 78;
export const ARTCONNECT_TERMS_URL = "https://www.magazine.artconnect.com/terms";

// ArtConnect's published terms require prior written permission for automated
// access/collection and reproduction. No permission evidence was supplied in
// this task. Keep the registry and historical rows, but fail closed for fresh
// collection and canonical public copies.
const COMPLIANCE_HOLD_SOURCE_IDS = new Set(["artconnect-opportunities"]);

export function getOpportunityV2SourcePermission(sourceId: string): OpportunityV2SourcePermission {
  return COMPLIANCE_HOLD_SOURCE_IDS.has(sourceId) ? "COMPLIANCE_HOLD" : "NOT_REVIEWED";
}

export function getOpportunityV2SourcePermissionEvidence(sourceId: string): { basis: string; url: string | null } {
  return getOpportunityV2SourcePermission(sourceId) === "COMPLIANCE_HOLD"
    ? { basis: "Official ArtConnect terms prohibit automated access/collection/copying and reproduction without prior written permission (sections 8 and 11); no written permission evidence was supplied.", url: ARTCONNECT_TERMS_URL }
    : { basis: "NOT_REVIEWED; no permission/license conclusion is made.", url: null };
}

export function isOpportunityV2SourceCollectionAllowed(sourceId: string): boolean {
  return getOpportunityV2SourcePermission(sourceId) !== "COMPLIANCE_HOLD";
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
