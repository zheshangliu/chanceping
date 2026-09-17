import type { FetchErrorTaxonomy, FetchReliabilityStatus, FetchStrategy } from "./types";

export interface ReliabilityFetchAttempt {
  strategy: FetchStrategy;
  status: number | null;
  error: string | null;
  elapsed_ms: number;
}
export interface ReliabilityFetchResult {
  url: string;
  finalUrl: string;
  status: number | null;
  text: string;
  strategy: FetchStrategy | null;
  attempts: ReliabilityFetchAttempt[];
  reliability_status: FetchReliabilityStatus;
  error_taxonomy: FetchErrorTaxonomy;
  error: string | null;
}

const DEFAULT_TIMEOUT_MS = 20_000;

function classifyError(error: unknown): FetchErrorTaxonomy {
  const message = error instanceof Error ? error.message : String(error);
  if (/abort|timeout|timed out/i.test(message)) return "TIMEOUT";
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo|dns/i.test(message)) return "DNS_FAILED";
  if (/ECONNRESET|ECONNREFUSED|socket|connection/i.test(message)) return "CONNECTION_FAILED";
  return "CONNECTION_FAILED";
}

function blocked(status: number): boolean {
  return status === 401 || status === 403 || status === 429 || status === 451;
}

async function attemptFetch(
  url: string,
  strategy: FetchStrategy,
  timeoutMs: number,
): Promise<{ status: number; finalUrl: string; text: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const headers: Record<string, string> = strategy === "BROWSER_HEADERS"
    ? {
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9,zh-CN;q=0.8",
      }
    : { "user-agent": "ChancePing-ICH-Aggregation/1.1 (+readonly)" };
  const target = strategy === "JINA_READER"
    ? `https://r.jina.ai/http://${url.replace(/^https?:\/\//i, "")}`
    : url;
  try {
    const response = await fetch(target, { redirect: "follow", signal: controller.signal, headers });
    return { status: response.status, finalUrl: response.url || url, text: await response.text() };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch a public source without attempting to bypass authentication or bot
 * protections.  SEARCH_INDEX is intentionally handled by the caller because
 * it requires a real configured search provider, not a local mock.
 */
export async function fetchWithReliability(
  url: string,
  options: { strategies?: FetchStrategy[]; timeoutMs?: number } = {},
): Promise<ReliabilityFetchResult> {
  const strategies = options.strategies ?? ["DIRECT", "BROWSER_HEADERS", "JINA_READER"];
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const attempts: ReliabilityFetchAttempt[] = [];
  let lastError: string | null = null;
  let blockedSeen = false;
  for (const strategy of strategies) {
    if (strategy === "SEARCH_INDEX") continue;
    const started = Date.now();
    try {
      const result = await attemptFetch(url, strategy, timeoutMs);
      const attempt = { strategy, status: result.status, error: null, elapsed_ms: Date.now() - started };
      attempts.push(attempt);
      if (result.status >= 200 && result.status < 400 && result.text.trim()) {
        return {
          url,
          finalUrl: result.finalUrl,
          status: result.status,
          text: result.text,
          strategy,
          attempts,
          reliability_status: strategy === "DIRECT" ? "DIRECT_PASS" : "DIRECT_BLOCKED_FALLBACK_PASS",
          error_taxonomy: "SUCCESS",
          error: null,
        };
      }
      if (blocked(result.status)) blockedSeen = true;
      lastError = `HTTP ${result.status}`;
      attempts[attempts.length - 1] = { ...attempt, error: lastError };
    } catch (error) {
      const taxonomy = classifyError(error);
      lastError = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      attempts.push({ strategy, status: null, error: lastError, elapsed_ms: Date.now() - started });
      if (taxonomy === "HTTP_BLOCKED") blockedSeen = true;
    }
  }
  const lastAttempt = attempts[attempts.length - 1];
  const lastStatus = lastAttempt?.status ?? null;
  const taxonomy: FetchErrorTaxonomy = blockedSeen || lastStatus !== null && blocked(lastStatus)
    ? "HTTP_BLOCKED"
    : lastStatus !== null && lastStatus >= 400
      ? "HTTP_ERROR"
      : classifyError(lastError ?? "empty response");
  return {
    url,
    finalUrl: url,
    status: lastStatus,
    text: "",
    strategy: null,
    attempts,
    reliability_status: "FULLY_BLOCKED",
    error_taxonomy: taxonomy === "CONNECTION_FAILED" && attempts.length > 0 && lastStatus === null ? taxonomy : taxonomy,
    error: lastError ?? "EMPTY_RESULT",
  };
}
