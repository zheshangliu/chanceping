import { providerRegistry, type SearchProvider } from "../../search/provider-registry";
import type { HeadhunterSearchIntent } from "./intents";
import { resolveProviders } from "./routing";

export interface SearchOutcome {
  intent: HeadhunterSearchIntent;
  providers_attempted: string[];
  results: unknown[];
  errors: string[];
  known_cost: number;
  unknown_cost: boolean;
  stopped_after_evidence_gate: boolean;
}

export interface ProviderPricing {
  cost_per_request: number | null;
}

export async function executeHeadhunterIntent(intent: HeadhunterSearchIntent, providers = providerRegistry, pricing: Record<string, ProviderPricing> = {}): Promise<SearchOutcome> {
  const route = resolveProviders(intent);
  if (intent.evidence_gate_passed) return { intent, providers_attempted: [], results: [], errors: [], known_cost: 0, unknown_cost: false, stopped_after_evidence_gate: true };
  const attempted: string[] = [];
  const results: unknown[] = [];
  const errors: string[] = [];
  let knownCost = 0;
  let unknownCost = false;
  for (const providerName of route.providers) {
    const provider = providers.get(providerName);
    if (!provider || !provider.enabled) { errors.push(`${providerName}: unavailable`); continue; }
    attempted.push(providerName);
    try {
      const found = await provider.search(intent.query);
      results.push(...found);
      const cost = pricing[providerName]?.cost_per_request ?? null;
      if (cost === null) unknownCost = true; else knownCost += cost;
      if (found.length > 0) break;
    } catch (error) {
      errors.push(`${providerName}: ${error instanceof Error ? error.message : "search failed"}`);
    }
  }
  return { intent, providers_attempted: attempted, results, errors, known_cost: knownCost, unknown_cost: unknownCost, stopped_after_evidence_gate: false };
}

export function providerForName(name: string, providers = providerRegistry): SearchProvider | undefined { return providers.get(name); }
