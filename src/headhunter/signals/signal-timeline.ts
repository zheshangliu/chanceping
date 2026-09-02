import type { CompanySignal } from "../model/signal";
import { deduplicateSignalCandidates, type SignalCandidate } from "./signal-dedup";

export function buildSignalTimeline(signals: SignalCandidate[], companyId?: string): CompanySignal[] {
  const filtered = companyId ? signals.filter((signal) => signal.company_id === companyId) : signals;
  return deduplicateSignalCandidates(filtered).sort((a, b) => {
    const left = new Date(a.event_date ?? a.last_seen_at).getTime();
    const right = new Date(b.event_date ?? b.last_seen_at).getTime();
    return right - left;
  });
}
