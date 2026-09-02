import type { CompanySignal } from "../model/signal";

export interface SignalCandidate extends CompanySignal {
  semantic_event_fingerprint?: string;
}

export function signalFingerprint(signal: SignalCandidate): string {
  const semantic = signal.semantic_event_fingerprint ?? `${signal.title}:${signal.fact_summary}`;
  return [signal.company_id, signal.signal_type, signal.event_date ?? "unknown", normalize(semantic)].join("|");
}

export function deduplicateSignalCandidates(candidates: SignalCandidate[]): SignalCandidate[] {
  const byFingerprint = new Map<string, SignalCandidate>();
  for (const candidate of candidates) {
    const fingerprint = signalFingerprint(candidate);
    const existing = byFingerprint.get(fingerprint);
    if (!existing || signalQuality(candidate) > signalQuality(existing)) byFingerprint.set(fingerprint, candidate);
  }
  return [...byFingerprint.values()];
}

function signalQuality(signal: SignalCandidate): number {
  return (signal.evidence_ids.length * 2) + (signal.primary_source_id ? 1 : 0) + new Date(signal.last_seen_at).getTime() / 1e13;
}

function normalize(value: string): string { return value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, ""); }
