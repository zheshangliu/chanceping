import type { SearchResult, SearchOptions } from "../types";
import type { SearchProvider } from "../provider-registry";
import { validateLink } from "../../utils/link-validator";
import { normalizeUrl } from "../../utils/url-normalizer";

export interface BraveSearchConfig {
  apiKey?: string;
  mockMode?: boolean;
}

const BRAVE_ENDPOINT = "https://api.search.brave.com/res/v1/web/search";
const DEFAULT_MAX_RESULTS = 10;
const MAX_RESULTS = 20;

const MOCK_RESULTS: SearchResult[] = [
  {
    title: "Brave Search Provider demo result",
    url: "https://mock.chanceping.local/brave/demo",
    snippet: "Demo-only result for unit tests without a live Brave API key.",
    source_provider: "brave",
    source_type: "web",
  },
];

interface BraveRawItem {
  title?: string;
  url?: string;
  description?: string;
  age?: string;
  page_age?: string;
  [key: string]: unknown;
}

function normalizeLanguage(language?: string): string | undefined {
  if (!language) return undefined;
  const value = language.trim().toLowerCase();
  if (!value) return undefined;
  if (value === "zh-cn" || value === "zh-hans") return "zh-hans";
  if (value === "zh-tw" || value === "zh-hk" || value === "zh-hant") return "zh-hant";
  return value.split("-")[0];
}

function normalizeCountry(region?: string): string | undefined {
  if (!region) return undefined;
  const value = region.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(value) ? value : undefined;
}

function extractPublishedAt(item: BraveRawItem): string | undefined {
  for (const value of [item.page_age, item.age]) {
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return value;
  }
  return undefined;
}

export class BraveSearchProvider implements SearchProvider {
  readonly name = "brave";
  readonly display_name = "Brave Search";
  readonly source_type = "web" as const;
  readonly reliability = "B" as const;
  readonly enabled = true;
  readonly radar_types = ["custom", "ai_competition"];
  readonly mockMode: boolean;

  private readonly apiKey: string;

  constructor(config?: Partial<BraveSearchConfig>) {
    const envKey = typeof process !== "undefined" ? process.env?.BRAVE_SEARCH_API_KEY ?? "" : "";
    this.apiKey = config?.apiKey ?? envKey;
    this.mockMode = config?.mockMode ?? this.apiKey === "";
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    if (this.mockMode) {
      const max = Math.min(options?.max_results ?? DEFAULT_MAX_RESULTS, MOCK_RESULTS.length);
      return MOCK_RESULTS.slice(0, max).map((item) => ({ ...item }));
    }

    const trimmedQuery = query.trim();
    if (!trimmedQuery) return [];
    const q = options?.site_filter ? `${trimmedQuery} site:${options.site_filter}` : trimmedQuery;
    const params = new URLSearchParams({
      q,
      count: String(Math.max(1, Math.min(options?.max_results ?? DEFAULT_MAX_RESULTS, MAX_RESULTS))),
    });
    const country = normalizeCountry(options?.region);
    const language = normalizeLanguage(options?.language);
    if (country) params.set("country", country);
    if (language) params.set("search_lang", language);

    const response = await fetch(`${BRAVE_ENDPOINT}?${params.toString()}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-Subscription-Token": this.apiKey,
      },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(`Brave Search API error: status=${response.status}, body=${errorText.slice(0, 200)}`);
    }

    const data = await response.json() as { web?: { results?: BraveRawItem[] } };
    const items = data.web?.results ?? [];
    const results: SearchResult[] = [];

    for (const item of items) {
      const rawUrl = item.url ?? "";
      if (!rawUrl) continue;
      const validation = validateLink(rawUrl);
      if (!validation.valid) continue;
      results.push({
        title: item.title ?? "",
        url: normalizeUrl(validation.safeUrl ?? rawUrl),
        snippet: item.description ?? "",
        source_provider: "brave",
        source_type: "web",
        published_at: extractPublishedAt(item),
        raw_data: item,
      });
    }

    return results;
  }

  async healthCheck(): Promise<boolean> {
    if (this.mockMode) return true;
    try {
      await this.search("test", { max_results: 1 });
      return true;
    } catch {
      return false;
    }
  }
}
