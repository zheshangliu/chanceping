import type { ProviderRouting } from "../schema/radar";
import { buildSearchIntentPlan, type SearchIntentPlan } from "../search/search-intent-planner";
import { SearchOrchestrator, type SearchOrchestratorResult } from "../search/orchestrator";
import type { SearchResult } from "../search/types";
import { createIchRadarSpec, ICH_PROVIDER_ROUTING } from "./profile";
import { normalizeSearchResultToIchCandidate, type IchNormalizedCandidate } from "./normalizer";
import { scoreIchSearchOpportunity, type IchSearchScore } from "./scoring";

export interface IchRadarEngineResult {
  profileId: string;
  profileVersion: string;
  searchPlan: SearchIntentPlan | SearchOrchestratorResult["searchPlan"];
  candidates: Array<{ candidate: IchNormalizedCandidate; score: IchSearchScore }>;
  raw: SearchOrchestratorResult;
}

export function buildIchSearchIntentPlan(baseQuery = "非遗机会"): SearchIntentPlan {
  return buildSearchIntentPlan(createIchRadarSpec(), baseQuery);
}

/**
 * The one supported entry point for live ICH discovery. It deliberately does
 * not write the formal ICH store: candidates still pass DS3/DS14 gates.
 */
export async function runIchRadarSearch(
  orchestrator: SearchOrchestrator,
  options: { query?: string; providerRouting?: ProviderRouting; watchRules?: string[] } = {},
): Promise<IchRadarEngineResult> {
  const routing: ProviderRouting = options.providerRouting ?? { primary: [...ICH_PROVIDER_ROUTING.primary], fallback: [...ICH_PROVIDER_ROUTING.fallback] };
  const raw = await orchestrator.search(createIchRadarSpec(), options.query, routing, options.watchRules);
  return normalizeIchRadarEngineResult(raw);
}

export function normalizeIchRadarEngineResult(raw: SearchOrchestratorResult): IchRadarEngineResult {
  const evidenceItems = raw.evidenceItems ?? [];
  const candidates = raw.opportunities.map((opportunity) => {
    const matching = evidenceItems.filter((item) => {
      const source = raw.sourceCandidates?.find((candidate) => candidate.sourceId === item.sourceId);
      return !source || source.url === opportunity.search_result.url;
    });
    const candidate = normalizeSearchResultToIchCandidate({ result: opportunity.search_result as SearchResult, content: opportunity.cleaned_content, evidenceItems: matching });
    return { candidate, score: scoreIchSearchOpportunity(opportunity, matching, candidate.source_policy) };
  });
  return { profileId: "ich-radar-profile", profileVersion: "V1.0", searchPlan: raw.searchPlan ?? buildIchSearchIntentPlan(), candidates, raw };
}
