export interface RankableLead {
  id: string;
  business_score: number;
  freshness_score: number;
  final_rank_score?: number;
  hard_gate_passed: boolean;
  lead_pool?: "A_ACTIONABLE" | "B_ENRICHMENT";
  b_reasons?: string[];
}

export interface RankedLead extends RankableLead {
  final_rank_score: number;
  lead_pool: "A_ACTIONABLE" | "B_ENRICHMENT";
  b_reasons: string[];
  rank: number;
}

export function rankWeeklyCandidates(candidates: RankableLead[]): RankedLead[] {
  const scored = candidates.map((candidate) => ({ ...candidate, final_rank_score: candidate.business_score * 0.8 + candidate.freshness_score * 0.2 })).sort((a, b) => b.final_rank_score - a.final_rank_score);
  let accepted = 0;
  return scored.map((candidate, index) => {
    const qualified = candidate.hard_gate_passed && candidate.business_score >= 70 && accepted < 8;
    if (qualified) accepted += 1;
    return { ...candidate, rank: index + 1, lead_pool: qualified ? "A_ACTIONABLE" : "B_ENRICHMENT", b_reasons: qualified ? [] : (candidate.b_reasons?.length ? candidate.b_reasons : [candidate.business_score < 70 ? "score_below_70" : "outside_top8"]) };
  });
}
