import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { SearchResult } from "./types";

export interface SearchCostLimits {
  maxThemesPerRun: number;
  maxQueriesPerRun: number;
  maxResultsPerQuery: number;
  maxReadUrlsPerRun: number;
}

export interface SearchCacheLookup {
  status: "hit" | "miss";
  key: string;
  queryHash: string;
  results?: SearchResult[];
}

export interface SearchBudgetRecord {
  provider: string;
  date: string;
  used: number;
  softBudget: number;
  hardBudget: number;
  softExceeded: boolean;
}

const DEFAULT_SEARCH_COST_LIMITS: SearchCostLimits = {
  maxThemesPerRun: 5,
  maxQueriesPerRun: 15,
  maxResultsPerQuery: 5,
  maxReadUrlsPerRun: 5,
};

const DEFAULT_CACHE_TTL_DAYS = 7;
const DEFAULT_SERPER_DAILY_SOFT_BUDGET = 3000;
const DEFAULT_SERPER_DAILY_HARD_BUDGET = 5000;

interface CacheFile {
  entries: Record<string, {
    createdAt: string;
    expiresAt: string;
    results: SearchResult[];
  }>;
}

interface BudgetFile {
  days: Record<string, Record<string, number>>;
}

function envNumber(name: string, fallback: number, env: NodeJS.ProcessEnv = process.env): number {
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export function getSearchCostLimits(env: NodeJS.ProcessEnv = process.env): SearchCostLimits {
  return {
    maxThemesPerRun: envNumber("MAX_SEARCH_THEMES_PER_RUN", DEFAULT_SEARCH_COST_LIMITS.maxThemesPerRun, env),
    maxQueriesPerRun: envNumber("MAX_SEARCH_QUERIES_PER_RUN", DEFAULT_SEARCH_COST_LIMITS.maxQueriesPerRun, env),
    maxResultsPerQuery: envNumber("MAX_SEARCH_RESULTS_PER_QUERY", DEFAULT_SEARCH_COST_LIMITS.maxResultsPerQuery, env),
    maxReadUrlsPerRun: envNumber("MAX_READ_URLS_PER_RUN", DEFAULT_SEARCH_COST_LIMITS.maxReadUrlsPerRun, env),
  };
}

export function normalizeSearchQuery(query: string): string {
  return query
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function cacheRoot(): string {
  return process.env.CHANCEPING_SEARCH_CACHE_DIR
    ? path.resolve(process.env.CHANCEPING_SEARCH_CACHE_DIR)
    : path.resolve(process.cwd(), "data", "search-cost-guard");
}

function ensureDir(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function cacheFile(): string {
  return path.join(cacheRoot(), "search-cache.json");
}

function budgetFile(): string {
  return path.join(cacheRoot(), "serper-daily-budget.json");
}

function readJson<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

function writeJson(filePath: string, value: unknown): void {
  ensureDir(filePath);
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf-8");
}

function hash(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 16);
}

export function buildSearchCacheKey(input: {
  provider: string;
  query: string;
  language?: string;
  region?: string;
  siteFilter?: string;
}): { key: string; normalizedQuery: string; queryHash: string } {
  const normalizedQuery = normalizeSearchQuery(input.siteFilter ? `${input.query} site:${input.siteFilter}` : input.query);
  const language = normalizeSearchQuery(input.language || "");
  const region = normalizeSearchQuery(input.region || "");
  const rawKey = `${input.provider}|${normalizedQuery}|locale:${language}|country:${region}`;
  return { key: hash(rawKey), normalizedQuery, queryHash: hash(normalizedQuery) };
}

export function getCachedSearchResults(input: {
  provider: string;
  query: string;
  language?: string;
  region?: string;
  siteFilter?: string;
}): SearchCacheLookup {
  const key = buildSearchCacheKey(input);
  const cache = readJson<CacheFile>(cacheFile(), { entries: {} });
  const entry = cache.entries[key.key];
  if (!entry || Date.parse(entry.expiresAt) <= Date.now()) {
    return { status: "miss", key: key.key, queryHash: key.queryHash };
  }
  console.info(`[SearchCostGuard] provider=${input.provider} cache hit queryHash=${key.queryHash}`);
  return { status: "hit", key: key.key, queryHash: key.queryHash, results: entry.results };
}

export function setCachedSearchResults(
  input: {
    provider: string;
    query: string;
    language?: string;
    region?: string;
    siteFilter?: string;
  },
  results: SearchResult[],
): void {
  const key = buildSearchCacheKey(input);
  const ttlDays = envNumber("CHANCEPING_SEARCH_CACHE_TTL_DAYS", DEFAULT_CACHE_TTL_DAYS);
  const now = new Date();
  const cache = readJson<CacheFile>(cacheFile(), { entries: {} });
  cache.entries[key.key] = {
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000).toISOString(),
    results,
  };
  writeJson(cacheFile(), cache);
}

export function recordSerperCallOrThrow(env: NodeJS.ProcessEnv = process.env): SearchBudgetRecord {
  const provider = "serper";
  const softBudget = envNumber("SERPER_DAILY_SOFT_BUDGET", DEFAULT_SERPER_DAILY_SOFT_BUDGET, env);
  const hardBudget = envNumber("SERPER_DAILY_HARD_BUDGET", DEFAULT_SERPER_DAILY_HARD_BUDGET, env);
  const date = new Date().toISOString().slice(0, 10);
  const ledger = readJson<BudgetFile>(budgetFile(), { days: {} });
  const day = ledger.days[date] ?? {};
  const current = day[provider] ?? 0;
  if (current >= hardBudget) {
    throw new Error(`Serper daily hard budget exceeded: used=${current}, hard=${hardBudget}. 已阻断 live search，不会静默回退 mock。`);
  }

  const used = current + 1;
  day[provider] = used;
  ledger.days[date] = day;
  writeJson(budgetFile(), ledger);
  const softExceeded = used >= softBudget;
  if (softExceeded) {
    console.warn(`[SearchCostGuard] provider=serper soft budget reached used=${used} soft=${softBudget} hard=${hardBudget}`);
  }
  return { provider, date, used, softBudget, hardBudget, softExceeded };
}

export function clearSearchCostGuardCache(): void {
  fs.rmSync(cacheRoot(), { recursive: true, force: true });
}
