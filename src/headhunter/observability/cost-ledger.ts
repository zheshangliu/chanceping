import type { WeeklyLeadSnapshot } from "../model/lead";
import type { ProviderUsage } from "../model/radar-run";

export interface LeadCostBreakdown {
  search_request_count: number;
  provider_cost: number | null;
  read_cost: number | null;
  llm_cost: number | null;
  enrichment_cost: number | null;
  total_intelligence_cost: number | null;
}

export interface RunCostSummary {
  provider_usage: ProviderUsage[];
  known_total: number;
  unknown_providers: string[];
}

export class CostLedger {
  private readonly usage = new Map<string, ProviderUsage>();
  record(provider: string, cost: number | null, requestCount = 1): void {
    const previous = this.usage.get(provider) ?? { provider, request_count: 0, success_count: 0, failure_count: 0, known_cost: 0, unknown_cost: false };
    previous.request_count += requestCount;
    previous.success_count += requestCount;
    if (cost === null) { previous.unknown_cost = true; previous.known_cost = null; }
    else if (!previous.unknown_cost) previous.known_cost = (previous.known_cost ?? 0) + cost * requestCount;
    this.usage.set(provider, previous);
  }
  summarize(): RunCostSummary {
    const provider_usage = [...this.usage.values()];
    return { provider_usage, known_total: provider_usage.reduce((sum, usage) => sum + (usage.known_cost ?? 0), 0), unknown_providers: provider_usage.filter((usage) => usage.unknown_cost).map((usage) => usage.provider) };
  }
}

export function attachLeadCost(lead: WeeklyLeadSnapshot, costs: LeadCostBreakdown): WeeklyLeadSnapshot & { cost_breakdown: LeadCostBreakdown } {
  return { ...lead, cost_breakdown: { ...costs } };
}
