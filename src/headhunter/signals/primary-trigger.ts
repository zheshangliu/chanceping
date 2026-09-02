import type { RawEvidence, HumanEvidenceOverride, EvidenceRecord } from "../model/evidence";
import type { CompanySignal, ImpactLevel } from "../model/signal";

export interface EvidenceGateResult {
  passed: boolean;
  reason: string;
  source_groups: string[];
}

export interface PrimaryTriggerCandidate {
  signal: CompanySignal;
  impact_level?: ImpactLevel;
  freshness_score?: number;
  evidence_quality?: number;
  gbs_relevance?: number;
}

export function evaluateEvidenceGate(evidence: RawEvidence[]): EvidenceGateResult {
  const firstParty = evidence.some((item) => item.source_type === "official");
  const sourceGroups = [...new Set(evidence.filter((item) => item.source_type === "reliable_media" || item.source_type === "regulator").map(sourceGroup))];
  if (firstParty) return { passed: true, reason: "first-party evidence", source_groups: sourceGroups };
  if (sourceGroups.length >= 2) return { passed: true, reason: "two independent reliable source groups", source_groups: sourceGroups };
  return { passed: false, reason: "requires first-party evidence or two independent reliable source groups", source_groups: sourceGroups };
}

export function applyHumanEvidenceOverride(evidence: RawEvidence, override: HumanEvidenceOverride): EvidenceRecord {
  return { ...evidence, human_override: { ...override } };
}

export function getDisplaySummary(evidence: RawEvidence | EvidenceRecord): string {
  return "human_override" in evidence && evidence.human_override?.corrected_summary ? evidence.human_override.corrected_summary : evidence.excerpt;
}

export function selectPrimaryTrigger(candidates: PrimaryTriggerCandidate[]): CompanySignal | null {
  const sorted = [...candidates].sort((a, b) => {
    const impact = impactRank(b.signal.impact_level) - impactRank(a.signal.impact_level);
    if (impact !== 0) return impact;
    const freshness = (b.freshness_score ?? freshnessFrom(b.signal)) - (a.freshness_score ?? freshnessFrom(a.signal));
    if (freshness !== 0) return freshness;
    const evidence = (b.evidence_quality ?? b.signal.evidence_ids.length) - (a.evidence_quality ?? a.signal.evidence_ids.length);
    if (evidence !== 0) return evidence;
    return (b.gbs_relevance ?? 0) - (a.gbs_relevance ?? 0);
  });
  return sorted[0]?.signal ?? null;
}

function sourceGroup(evidence: RawEvidence): string {
  if (evidence.source_group) return evidence.source_group;
  try { return new URL(evidence.source_url).hostname.replace(/^www\./, "").toLowerCase(); } catch { return evidence.source_name.toLowerCase().trim(); }
}
function impactRank(value: ImpactLevel): number { return ({ critical: 4, high: 3, medium: 2, low: 1, unknown: 0 })[value]; }
function freshnessFrom(signal: CompanySignal): number { return new Date(signal.last_seen_at).getTime(); }
