interface HostBudgetState {
  requests: number;
  next_start_at: number;
  tail: Promise<void>;
}

export interface OpportunityV2FetchBudgetOptions {
  maxRequestsPerHost?: number;
  minIntervalMs?: number;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
}

/** Per-run host request cap + concurrency-one spacing, shared by listing and detail fetches. */
export class OpportunityV2FetchBudget {
  private readonly hosts = new Map<string, HostBudgetState>();
  private readonly maxRequestsPerHost: number;
  private readonly minIntervalMs: number;
  private readonly now: () => number;
  private readonly sleep: (milliseconds: number) => Promise<void>;

  constructor(options: OpportunityV2FetchBudgetOptions = {}) {
    this.maxRequestsPerHost = options.maxRequestsPerHost ?? 50;
    this.minIntervalMs = options.minIntervalMs ?? 1_000;
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    if (!Number.isInteger(this.maxRequestsPerHost) || this.maxRequestsPerHost < 1) throw new Error("maxRequestsPerHost must be a positive integer");
    if (!Number.isFinite(this.minIntervalMs) || this.minIntervalMs < 0) throw new Error("minIntervalMs must be non-negative");
  }

  async run<T>(hostname: string, request: () => Promise<T>): Promise<T> {
    const host = hostname.trim().toLowerCase().replace(/\.$/u, "");
    if (!host) throw new Error("source request hostname is required");
    const state = this.hosts.get(host) ?? { requests: 0, next_start_at: 0, tail: Promise.resolve() };
    if (state.requests >= this.maxRequestsPerHost) throw new Error(`host request budget (limit=${this.maxRequestsPerHost}) exhausted for ${host}`);
    state.requests += 1;
    const previous = state.tail;
    let release!: () => void;
    const turn = new Promise<void>((resolve) => { release = resolve; });
    state.tail = previous.then(() => turn);
    this.hosts.set(host, state);
    await previous;
    try {
      const delay = Math.max(0, state.next_start_at - this.now());
      if (delay > 0) await this.sleep(delay);
      state.next_start_at = this.now() + this.minIntervalMs;
      return await request();
    } finally {
      release();
    }
  }

  summary(): Record<string, number> {
    return Object.fromEntries([...this.hosts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([host, state]) => [host, state.requests]));
  }
}
