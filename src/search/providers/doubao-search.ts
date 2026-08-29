import type { SearchResult, SearchOptions } from "../types";
import type { SearchProvider } from "../provider-registry";
import { validateLink } from "../../utils/link-validator";
import { normalizeUrl } from "../../utils/url-normalizer";

export interface DoubaoSearchConfig {
  apiKey?: string;
  mockMode?: boolean;
}

export interface DoubaoSearchOptions extends SearchOptions {
  timeRange?: "OneDay" | "OneWeek" | "OneMonth" | "OneYear" | string;
  authLevel?: 0 | 1;
  needContent?: boolean;
  needUrl?: boolean;
  sites?: string[];
  blockHosts?: string[];
  industry?: "finance" | "game" | "gov";
  queryRewrite?: boolean;
  contentFormats?: "text" | "markdown";
}

const DOUBAO_ENDPOINT = "https://open.feedcoopapi.com/search_api/web_search";
const DEFAULT_MAX_RESULTS = 10;
const MAX_WEB_RESULTS = 50;
const MAX_SITES = 20;
const MAX_BLOCK_HOSTS = 5;

const MOCK_RESULTS: SearchResult[] = [
  {
    title: "豆包搜索 Provider 演示结果",
    url: "https://mock.chanceping.local/doubao-search/demo",
    snippet: "【演示数据，未真实核验】仅用于无 API Key 的单元测试。",
    source_provider: "doubao_search",
    source_type: "web",
  },
];

interface DoubaoRawItem {
  Title?: string;
  Url?: string;
  Snippet?: string;
  Summary?: string;
  Content?: string;
  PublishTime?: string;
  SiteName?: string;
  RankScore?: number;
  [key: string]: unknown;
}

function getResultArray(payload: unknown): DoubaoRawItem[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  const direct = root.Results ?? root.results;
  if (Array.isArray(direct)) return direct as DoubaoRawItem[];
  const data = root.data;
  if (data && typeof data === "object") {
    const nested = (data as Record<string, unknown>).Results ?? (data as Record<string, unknown>).results;
    if (Array.isArray(nested)) return nested as DoubaoRawItem[];
  }
  return [];
}

function cleanHosts(values: string[] | undefined, max: number): string[] {
  if (!values) return [];
  return values
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, max);
}

export class DoubaoSearchProvider implements SearchProvider {
  readonly name = "doubao_search";
  readonly display_name = "Doubao SearchInfinity";
  readonly source_type = "web" as const;
  readonly reliability = "B" as const;
  readonly enabled = true;
  readonly radar_types = ["custom", "opc_policy", "cultural_heritage"];
  readonly mockMode: boolean;

  private readonly apiKey: string;

  constructor(config?: Partial<DoubaoSearchConfig>) {
    const envKey = typeof process !== "undefined"
      ? process.env?.DOUBAO_SEARCH_API_KEY
        ?? process.env?.ASK_ECHO_SEARCH_INFINITY_API_KEY
        ?? ""
      : "";
    this.apiKey = config?.apiKey ?? envKey;
    this.mockMode = config?.mockMode ?? this.apiKey === "";
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    return this.searchWithDoubaoOptions(query, options);
  }

  async searchWithDoubaoOptions(query: string, options?: DoubaoSearchOptions): Promise<SearchResult[]> {
    if (this.mockMode) {
      const max = Math.min(options?.max_results ?? DEFAULT_MAX_RESULTS, MOCK_RESULTS.length);
      return MOCK_RESULTS.slice(0, max).map((item) => ({ ...item }));
    }

    const trimmedQuery = query.trim();
    if (!trimmedQuery) return [];

    const maxResults = Math.max(1, Math.min(options?.max_results ?? DEFAULT_MAX_RESULTS, MAX_WEB_RESULTS));
    const sites = cleanHosts(options?.sites ?? (options?.site_filter ? [options.site_filter] : undefined), MAX_SITES);
    const blockHosts = cleanHosts(options?.blockHosts, MAX_BLOCK_HOSTS);

    const filter: Record<string, unknown> = {};
    if (options?.authLevel && options.authLevel > 0) filter.AuthInfoLevel = options.authLevel;
    if (options?.needContent !== undefined) filter.NeedContent = options.needContent;
    if (options?.needUrl !== undefined) filter.NeedUrl = options.needUrl;
    if (sites.length) filter.Sites = sites.join("|");
    if (blockHosts.length) filter.BlockHosts = blockHosts.join("|");
    if (options?.industry) filter.Industry = options.industry;

    const body: Record<string, unknown> = {
      Query: trimmedQuery,
      SearchType: "web",
      Count: maxResults,
    };
    if (Object.keys(filter).length) body.Filter = filter;
    if (options?.timeRange) body.TimeRange = options.timeRange;
    if (options?.queryRewrite !== undefined) body.QueryControl = { QueryRewrite: options.queryRewrite };
    if (options?.contentFormats) body.ContentFormats = options.contentFormats;

    const response = await fetch(DOUBAO_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "X-Traffic-Tag": "chanceping_search_provider",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(`Doubao Search API error: status=${response.status}, body=${errorText.slice(0, 200)}`);
    }

    const payload = await response.json() as unknown;
    const items = getResultArray(payload);
    const results: SearchResult[] = [];

    for (const item of items) {
      const rawUrl = item.Url ?? "";
      if (!rawUrl) continue;
      const validation = validateLink(rawUrl);
      if (!validation.valid) continue;
      const normalizedUrl = normalizeUrl(validation.safeUrl ?? rawUrl);
      const snippet = item.Summary
        ?? item.Snippet
        ?? (typeof item.Content === "string" ? item.Content.slice(0, 500) : "")
        ?? "";

      results.push({
        title: item.Title ?? "",
        url: normalizedUrl,
        snippet,
        source_provider: "doubao_search",
        source_type: "web",
        published_at: item.PublishTime,
        raw_data: item,
      });
    }

    return results.slice(0, maxResults);
  }

  async healthCheck(): Promise<boolean> {
    if (this.mockMode) return true;
    try {
      await this.searchWithDoubaoOptions("测试", {
        max_results: 1,
        needContent: false,
        needUrl: true,
      });
      return true;
    } catch {
      return false;
    }
  }
}
