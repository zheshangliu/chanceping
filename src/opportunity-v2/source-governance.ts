import type { OpportunityV2, OpportunityV2Source } from "./types";

export type OpportunityV2SourcePermission = "REVIEWED_OK" | "REVIEWED_METADATA_ONLY" | "OFFICIAL_OPEN_DATA" | "COMPLIANCE_HOLD" | "NOT_REVIEWED";
export type OpportunityV2FreshnessStatus = "FRESH" | "STALE" | "NEVER_SUCCEEDED" | "UNKNOWN";
export const OPPORTUNITY_V2_STALE_AFTER_HOURS = 78;
export const ARTCONNECT_TERMS_URL = "https://www.magazine.artconnect.com/terms";

// These sources have explicit official restrictions that conflict with our
// automated collection / downstream republication. Keep their registry and
// historical pool identity, but do not fetch or publish their records until an
// authorized access path is documented.
const COMPLIANCE_HOLD_SOURCE_IDS = new Set([
  "artconnect-opportunities",
  "opencalls-ai",
  "craft-scotland-opportunities",
  "curatorspace-opportunities",
  "american-craft-council-opportunities",
  "cafe-call-for-entry",
]);
const OPENCALLS_AI_TERMS_URL = "https://opencalls.ai/fr/terms";
const CRAFT_SCOTLAND_TERMS_URL = "https://www.craftscotland.org/terms-and-conditions";
const CURATORSPACE_TERMS_URL = "https://www.curatorspace.com/legal/terms-and-conditions";
const AMERICAN_CRAFT_COUNCIL_TERMS_URL = "https://craftcouncil.org/terms-of-use/";
const CAFE_CREATIVE_WEST_TERMS_URL = "https://wearecreativewest.org/terms-conditions/";
const TED_LEGAL_NOTICE_URL = "https://ted.europa.eu/en/legal-notice";
const OFFICIAL_OPEN_DATA_SOURCE_IDS = new Set(["proc-ca-canadabuys", "proc-eu-ted"]);
const CANADABUYS_DATASET_URL = "https://open.canada.ca/data/en/dataset/6abd20d4-7a1c-4b38-baa2-9525d0bb2fd2";
const CANADABUYS_LICENSE_URL = "https://open.canada.ca/en/open-government-licence-canada";
const NOT_REVIEWED_SOURCE_EVIDENCE: Record<string, { basis: string; url: string }> = {
  "1zj-cultural-competition": { basis: "The platform's official about page was reviewed; it does not establish a general licence for automated extraction or downstream commercial republication. Permission remains NOT_REVIEWED; public output is limited to necessary metadata and source links.", url: "https://www.1zj.com/aboutme/" },
  "whaleideas-competition": { basis: "The official platform page was reviewed; no general licence for automated extraction or downstream commercial republication was identified. Permission remains NOT_REVIEWED; public output is limited to necessary metadata and source links.", url: "https://whaleideas.com/zjds/index.html" },
  "shejijingsai-list": { basis: "The publisher states on its own event pages that some items are reposted from third parties and that copyright remains with the original rightsholders; this is not a general downstream reuse grant. Permission remains NOT_REVIEWED; public output is limited to necessary metadata and source links.", url: "https://www.shejijingsai.com/2025/12/1471221.html" },
  "cfw-cultural-ip": { basis: "The official platform/about page was reviewed; no general licence for automated extraction or downstream commercial republication was identified. Permission remains NOT_REVIEWED; public output is limited to necessary metadata and source links.", url: "https://dasai.cfw.cn/about/" },
  "chuangsaiyun-competition-list": { basis: "The official platform page was reviewed; no general licence for automated extraction or downstream commercial republication was identified. Permission remains NOT_REVIEWED; public output is limited to necessary metadata and source links.", url: "https://www.xiacansai.com/mrjs.html" },
  "iuben-cultural-competition": { basis: "The source is a high-contribution competition aggregator. No general license for automated extraction or downstream commercial republication was established in this review; permission remains NOT_REVIEWED and public output is limited to necessary metadata and source links.", url: "https://www.iuben.cn/" },
  "asef-culture360-opportunities": { basis: "Official pages display a Creative Commons Attribution-NonCommercial-Share notice; this is not treated as an open/commercial license, and the exact current license scope for opportunity listings remains unverified. Permission remains NOT_REVIEWED; use minimum metadata and link to the original, with long summary copying disabled.", url: "https://culture360.asef.org/opportunities/asef-linkup-2026-call-for-arts-sector-participants/" },
  "heritage-crafts-opportunities": { basis: "Official website terms state that materials are copyright and all rights reserved; no general automated collection/republication grant for opportunity listings was identified. Permission remains NOT_REVIEWED; public output is limited to necessary metadata and source links.", url: "https://heritagecrafts.org.uk/terms-conditions/" },
};

export function getOpportunityV2SourcePermission(sourceId: string): OpportunityV2SourcePermission {
  if (COMPLIANCE_HOLD_SOURCE_IDS.has(sourceId)) return "COMPLIANCE_HOLD";
  if (OFFICIAL_OPEN_DATA_SOURCE_IDS.has(sourceId)) return "OFFICIAL_OPEN_DATA";
  return "NOT_REVIEWED";
}

export function getOpportunityV2SourcePermissionEvidence(sourceId: string): { basis: string; url: string | null } {
  const permission = getOpportunityV2SourcePermission(sourceId);
  if (sourceId === "opencalls-ai") return { basis: "Official terms prohibit scraping, bulk downloading, and catalogue extraction by automated means; individual calls may be shared with original-source attribution, but this adapter collects the catalogue automatically.", url: OPENCALLS_AI_TERMS_URL };
  if (sourceId === "craft-scotland-opportunities") return { basis: "Official site terms prohibit reproduction of site contents except personal use; automated republication in this service is not covered, so collection and public copying remain on COMPLIANCE_HOLD pending permission.", url: CRAFT_SCOTLAND_TERMS_URL };
  if (sourceId === "curatorspace-opportunities") return { basis: "Official terms prohibit systematic or automated data collection, including scraping and extraction, without express written consent; they also restrict republication and redistribution. Collection and public copying remain on COMPLIANCE_HOLD pending written permission.", url: CURATORSPACE_TERMS_URL };
  if (sourceId === "american-craft-council-opportunities") return { basis: "Official terms limit website use to personal, non-commercial use, prohibit public display/republication, and prohibit robots or other automatic access without prior written consent. Collection and public copying remain on COMPLIANCE_HOLD pending written permission.", url: AMERICAN_CRAFT_COUNCIL_TERMS_URL };
  if (sourceId === "cafe-call-for-entry") return { basis: "CaFÉ incorporates Creative West's General Terms; section 6(c) prohibits automated access outside the provided interface and section 6(e) restricts use of Services/Content to personal/internal matters absent specific permission. Collection and public copying remain on COMPLIANCE_HOLD pending an authorized API or written permission.", url: CAFE_CREATIVE_WEST_TERMS_URL };
  if (permission === "COMPLIANCE_HOLD") return { basis: "Official ArtConnect terms require prior written permission for automated access/collection and reproduction; no written permission evidence was supplied.", url: ARTCONNECT_TERMS_URL };
  if (sourceId === "proc-eu-ted") return { basis: "Official TED legal notice says published EU procurement notices may be reused for commercial or non-commercial purposes unless otherwise noted; editorial SIMAP content is CC BY 4.0 and system metadata CC0. Third-party works, personal data and marks remain excluded or subject to their own rights; show attribution and link back to the notice. API reuse documentation: https://docs.ted.europa.eu/api/latest/search.html.", url: TED_LEGAL_NOTICE_URL };
  if (sourceId === "proc-ca-canadabuys") return { basis: `Official Open Government Portal identifies the CanadaBuys tender-notices dataset under the Open Government Licence - Canada; attribution remains required. Licence: ${CANADABUYS_LICENSE_URL}`, url: CANADABUYS_DATASET_URL };
  if (NOT_REVIEWED_SOURCE_EVIDENCE[sourceId]) return NOT_REVIEWED_SOURCE_EVIDENCE[sourceId];
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
