export type ContactSearchProvider = "serper" | "exa" | "official_site";

const LIMITS: Record<ContactSearchProvider, number> = { serper: 3, exa: 2, official_site: 3 };

export class ContactSearchBudget {
  private readonly used: Record<ContactSearchProvider, number> = { serper: 0, exa: 0, official_site: 0 };
  constructor(private readonly limits: Record<ContactSearchProvider, number> = LIMITS) {}
  consume(provider: ContactSearchProvider): boolean {
    if (this.used[provider] >= this.limits[provider]) return false;
    this.used[provider] += 1;
    return true;
  }
  usedCount(provider: ContactSearchProvider): number { return this.used[provider]; }
  remaining(provider: ContactSearchProvider): number { return Math.max(0, this.limits[provider] - this.used[provider]); }
  exhausted(provider: ContactSearchProvider): boolean { return this.remaining(provider) === 0; }
}
