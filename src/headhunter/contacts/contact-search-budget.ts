export type ContactSearchProvider = "serper" | "exa" | "official_site";

const LIMITS: Record<ContactSearchProvider, number> = { serper: 3, exa: 2, official_site: 3 };

export class ContactSearchBudget {
  private readonly used: Record<ContactSearchProvider, number> = { serper: 0, exa: 0, official_site: 0 };
  private readonly limits: Record<ContactSearchProvider, number>;
  constructor(limits: Partial<Record<ContactSearchProvider, number>> = LIMITS) {
    this.limits = {
      serper: normalizeLimit(limits.serper ?? LIMITS.serper),
      exa: normalizeLimit(limits.exa ?? LIMITS.exa),
      official_site: normalizeLimit(limits.official_site ?? LIMITS.official_site),
    };
  }
  consume(provider: ContactSearchProvider): boolean {
    if (this.used[provider] >= this.limits[provider]) return false;
    this.used[provider] += 1;
    return true;
  }
  /** Explicit name for call sites where a provider request is being budgeted. */
  tryConsume(provider: ContactSearchProvider): boolean { return this.consume(provider); }
  usedCount(provider: ContactSearchProvider): number { return this.used[provider]; }
  remaining(provider: ContactSearchProvider): number { return Math.max(0, this.limits[provider] - this.used[provider]); }
  exhausted(provider: ContactSearchProvider): boolean { return this.remaining(provider) === 0; }
  limit(provider: ContactSearchProvider): number { return this.limits[provider]; }
  snapshot(): Record<ContactSearchProvider, { used: number; limit: number; remaining: number }> {
    return {
      serper: this.state("serper"),
      exa: this.state("exa"),
      official_site: this.state("official_site"),
    };
  }
  private state(provider: ContactSearchProvider): { used: number; limit: number; remaining: number } {
    return { used: this.usedCount(provider), limit: this.limit(provider), remaining: this.remaining(provider) };
  }
}

function normalizeLimit(value: number): number { return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0; }
