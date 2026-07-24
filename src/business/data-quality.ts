import crypto from "node:crypto";
import type { CandidateRecord, EvidenceRecord, SourceDefinition } from "./data-pipeline";

const TRACKING_PARAMS = new Set(["fbclid", "gclid", "mc_cid", "mc_eid", "spm"]);

export function canonicalizeOfficialUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) if (key.startsWith("utm_") || TRACKING_PARAMS.has(key)) url.searchParams.delete(key);
  url.hostname = url.hostname.toLowerCase();
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString();
}

export function contentFingerprint(value: string): string {
  return crypto.createHash("sha256").update(value.replace(/\s+/g, " ").trim()).digest("hex");
}

export function canUseAsOfficialUrl(source: SourceDefinition, officialUrl: string): boolean {
  try {
    const url = new URL(officialUrl);
    return source.role === "official_fact" && source.finalAllowed === "是" && url.protocol === "https:" && (url.hostname === source.officialDomain || url.hostname.endsWith(`.${source.officialDomain}`));
  } catch { return false; }
}

export function exactDuplicateReason(candidate: CandidateRecord, existing: CandidateRecord): string | undefined {
  if (candidate.canonicalUrl && existing.canonicalUrl && canonicalizeOfficialUrl(candidate.canonicalUrl) === canonicalizeOfficialUrl(existing.canonicalUrl)) return "canonical_url";
  if (candidate.sourceId === existing.sourceId && candidate.sourceRecordId && candidate.sourceRecordId === existing.sourceRecordId) return "source_record_id";
  if (candidate.noticeNo && existing.noticeNo && candidate.noticeNo === existing.noticeNo) return "notice_no";
  if (candidate.contentHash && existing.contentHash && candidate.contentHash === existing.contentHash) return "content_hash";
  return undefined;
}

export function isEvidenceFresh(evidence: EvidenceRecord, maxDays: number, now = new Date()): boolean {
  const reviewed = evidence.lastVerifiedAt ? new Date(evidence.lastVerifiedAt) : undefined;
  return Boolean(reviewed && !Number.isNaN(reviewed.getTime()) && now.getTime() - reviewed.getTime() <= maxDays * 86_400_000);
}

export function isFixedDeadlineCurrent(deadline: string | undefined, now = new Date()): boolean {
  return Boolean(deadline && !Number.isNaN(new Date(deadline).getTime()) && new Date(deadline).getTime() >= now.getTime());
}
