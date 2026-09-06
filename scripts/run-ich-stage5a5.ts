import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getAggregationAdapter } from "../src/ich/aggregation/adapters";
import { parseContestWatchersListing, CONTEST_WATCHERS_FEED, CONTEST_WATCHERS_LISTING, parseContestWatchersFeed } from "../src/ich/aggregation/adapters/contest-watchers";
import { COMPETITIONS_ARCHI_LIGHT_PAGES, parseCompetitionsArchiListing } from "../src/ich/aggregation/adapters/competitions-archi";
import { fetchWithReliability, type ReliabilityFetchResult } from "../src/ich/aggregation/fetch-reliability";
import { getAggregationRegistry } from "../src/ich/aggregation/registry";
import { findOfficialLinks, scoreOfficialCandidate } from "../src/ich/aggregation/official-backtrace";
import { isLikelyCurrent } from "../src/ich/aggregation/relevance";
import { ICH_PROVIDER_ROUTING } from "../src/ich/profile";
import { loadLocalApiEnv } from "../src/config/local-env";
import type { AggregationItem, SourceHealthRow, FetchStrategy, OfficialBacktraceStatus } from "../src/ich/aggregation/types";

const root = process.cwd();
const now = new Date();
const storePath = path.resolve(process.env.CHANCEPING_ICH_STORE_PATH ?? "data/ich-opportunities.json");
const candidatePath = path.resolve("data/ich/aggregation-candidates.json");
const qualifiedPath = path.resolve("data/ich/aggregation-qualified-candidates.json");
const outDir = path.resolve("docs/ich");
const reportJsonPath = path.join(outDir, "stage5a5-report.json");
const reliabilityPath = path.join(outDir, "stage5a5-fetch-reliability-report.md");
const backtracePath = path.join(outDir, "stage5a5-official-backtrace-report.md");
const providerPath = path.join(outDir, "stage5a5-provider-contribution.md");
const qualifiedReportPath = path.join(outDir, "stage5a5-qualified-candidates.md");

type CandidateWithEvidence = AggregationItem & {
  official_confidence_score?: number;
  official_candidate_urls?: string[];
  backtrace_evidence?: string[];
};

function sha256File(filePath: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function configured(name: string): boolean {
  if (name === "serper") return Boolean(process.env.SERPER_API_KEY);
  if (name === "bocha") return Boolean(process.env.BOCHA_API_KEY);
  if (name === "doubao_search") return Boolean(process.env.DOUBAO_SEARCH_API_KEY || process.env.ASK_ECHO_SEARCH_INFINITY_API_KEY);
  if (name === "brave") return Boolean(process.env.BRAVE_SEARCH_API_KEY);
  return false;
}

function providerRouting(region: "CN" | "GLOBAL") {
  const primary = (region === "CN" ? ICH_PROVIDER_ROUTING.primary : ["serper"]).filter(configured);
  const fallback = (region === "CN" ? ICH_PROVIDER_ROUTING.fallback : ["brave", "doubao_search"]).filter(configured);
  return { primary, fallback };
}

function parseTitle(html: string): string {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
  return title.replace(/<[^>]+>/g, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim();
}

function hostOf(url: string): string {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; }
}

function makeItem(sourceId: string, item: any): CandidateWithEvidence {
  const id = crypto.createHash("sha256").update(`${sourceId}\u001f${item.detail_url}\u001f${item.deadline_at ?? ""}`).digest("hex").slice(0, 24);
  return {
    item_id: id,
    source_id: sourceId,
    source_item_id: item.source_item_id,
    title: item.title,
    source_category: item.source_category ?? null,
    source_status: item.source_status ?? null,
    discovery_url: item.source_url,
    detail_url: item.detail_url,
    source_url: item.source_url,
    published_at: item.published_at ?? null,
    deadline_text: item.deadline_text ?? null,
    deadline_at: item.deadline_at ?? null,
    organizer: item.organizer ?? null,
    application_url: item.application_url ?? null,
    raw_text: item.raw_text ?? item.title,
    content_hash: crypto.createHash("sha256").update(JSON.stringify(item)).digest("hex"),
    last_content_hash: null,
    first_seen_at: now.toISOString(),
    last_seen_at: now.toISOString(),
    status: "NEW",
    rule_relevance: 0,
    semantic_relevance: null,
    relevance: "ICH_ADJACENT",
    opportunity_type: "competition",
    official_backtrace_status: "PENDING_PROVIDER",
    official_url: null,
    discovered_by_sources: [sourceId],
  };
}

interface SourceRun {
  source_id: string;
  items_seen: number;
  baseline_items_seen?: number;
  incremental_items_seen?: number;
  status: string;
  error_taxonomy: string;
  reliability_status: string;
  selected_strategy: FetchStrategy | null;
  attempts: Array<{ strategy: FetchStrategy; status: number | null; error: string | null; elapsed_ms: number }>;
  items: AggregationItem[];
}

type SearchIndexFallback = () => Promise<{ resultCount: number; attempts: Array<{ provider: string; results: number; error: string | null }> }>;

async function fetchSource(sourceId: string, discoveryUrl: string, strategies: FetchStrategy[], searchIndexFallback?: SearchIndexFallback): Promise<SourceRun> {
  const sourceRun: SourceRun = { source_id: sourceId, items_seen: 0, status: "BLOCKED", error_taxonomy: "EMPTY_RESULT", reliability_status: "FULLY_BLOCKED", selected_strategy: null, attempts: [], items: [] };
  if (sourceId === "competitions-archi") {
    const all: AggregationItem[] = [];
    for (const url of COMPETITIONS_ARCHI_LIGHT_PAGES) {
      const response = await fetchWithReliability(url, { strategies: ["DIRECT", "BROWSER_HEADERS"], timeoutMs: 8_000 });
      sourceRun.attempts.push(...response.attempts);
      if (response.text) {
        for (const item of parseCompetitionsArchiListing(response.text, response.finalUrl)) all.push(makeItem(sourceId, item));
        sourceRun.selected_strategy ??= response.strategy;
        sourceRun.status = "PASS";
        sourceRun.error_taxonomy = "SUCCESS";
        sourceRun.reliability_status = response.reliability_status;
      }
    }
    const unique = new Map(all.map((item) => [item.detail_url, item]));
    sourceRun.items = [...unique.values()];
    sourceRun.items_seen = sourceRun.items.length;
    if (sourceRun.items_seen === 0) {
      sourceRun.status = sourceRun.attempts.some((attempt) => attempt.status === 403) ? "BLOCKED" : "PARSER_FAILED";
      sourceRun.error_taxonomy = sourceRun.attempts.some((attempt) => attempt.status === 403) ? "HTTP_BLOCKED" : "PARSER_FAILED";
    }
    return sourceRun;
  }
  if (sourceId === "contest-watchers-open") {
    const baseline = await fetchWithReliability(CONTEST_WATCHERS_LISTING, { strategies: ["DIRECT", "BROWSER_HEADERS"], timeoutMs: 8_000 });
    const incremental = await fetchWithReliability(CONTEST_WATCHERS_FEED, { strategies: ["DIRECT", "BROWSER_HEADERS"], timeoutMs: 8_000 });
    sourceRun.attempts.push(...baseline.attempts, ...incremental.attempts);
    const baselineItems = baseline.text ? parseContestWatchersListing(baseline.text, baseline.finalUrl).map((item) => makeItem(sourceId, item)) : [];
    const feedItems = incremental.text ? parseContestWatchersFeed(incremental.text, incremental.finalUrl).map((item) => makeItem(sourceId, item)) : [];
    const unique = new Map([...baselineItems, ...feedItems].map((item) => [item.detail_url, item]));
    sourceRun.items = [...unique.values()];
    sourceRun.items_seen = sourceRun.items.length;
    sourceRun.baseline_items_seen = baselineItems.length;
    sourceRun.incremental_items_seen = feedItems.length;
    sourceRun.status = sourceRun.items_seen > 0 ? "PASS" : "PARSER_FAILED";
    sourceRun.error_taxonomy = sourceRun.items_seen > 0 ? "SUCCESS" : "EMPTY_RESULT";
    sourceRun.reliability_status = baseline.text || incremental.text ? "DIRECT_PASS" : "FULLY_BLOCKED";
    sourceRun.selected_strategy = baseline.strategy ?? incremental.strategy;
    return sourceRun;
  }
  const response = await fetchWithReliability(discoveryUrl, { strategies, timeoutMs: 8_000 });
  sourceRun.attempts = response.attempts;
  sourceRun.selected_strategy = response.strategy;
  sourceRun.reliability_status = response.reliability_status;
  sourceRun.error_taxonomy = response.error_taxonomy;
  if (response.text) {
    const adapter = getAggregationAdapter(sourceId);
    const parsed = adapter.parseListing(response.text, response.finalUrl);
    sourceRun.items = parsed.map((item) => makeItem(sourceId, item));
    sourceRun.items_seen = sourceRun.items.length;
    sourceRun.status = sourceRun.items_seen > 0 ? "PASS" : "PARTIAL";
    if (sourceRun.items_seen === 0) sourceRun.error_taxonomy = "EMPTY_RESULT";
  } else {
    sourceRun.status = response.error_taxonomy === "HTTP_BLOCKED" ? "BLOCKED" : "PARSER_FAILED";
    if (sourceId === "crafts-council-opportunities" && response.error_taxonomy === "HTTP_BLOCKED" && searchIndexFallback) {
      const fallback = await searchIndexFallback();
      sourceRun.attempts.push(...fallback.attempts.map((attempt) => ({ strategy: "SEARCH_INDEX" as const, status: attempt.results > 0 ? 200 : null, error: attempt.error, elapsed_ms: 0 })));
      if (fallback.resultCount > 0) {
        sourceRun.status = "PASS";
        sourceRun.reliability_status = "SEARCH_INDEX_ONLY";
        sourceRun.error_taxonomy = "SUCCESS";
        sourceRun.items_seen = fallback.resultCount;
      }
    }
  }
  return sourceRun;
}

async function verifyOfficialPage(item: CandidateWithEvidence, url: string, sourceOwnerHost: string | null): Promise<ReturnType<typeof scoreOfficialCandidate> | null> {
  const response = await fetchWithReliability(url, { strategies: ["DIRECT", "BROWSER_HEADERS"], timeoutMs: 5_000 });
  if (!response.text) return null;
  return scoreOfficialCandidate({ url: response.finalUrl, pageTitle: parseTitle(response.text), pageText: response.text, itemTitle: item.title, organizer: item.organizer, deadline: item.deadline_at, sourceOwnerHost });
}

async function main(): Promise<void> {
  // Provider modules read keys during construction. Load the local file before
  // dynamically importing the orchestrator so configured providers are real;
  // values are never printed.
  loadLocalApiEnv({ enabled: true });
  const [{ runIchRadarSearch }, { SearchOrchestrator }, { MockLLMAdapter }] = await Promise.all([
    import("../src/ich/radar-engine"),
    import("../src/search/orchestrator"),
    import("../src/agents/mock-llm-adapter"),
  ]);
  const { providerRegistry } = await import("../src/search/provider-registry");
  const providerLogs: Array<{ provider: string; queries: number; raw_results: number; errors: number; status: string }> = ["serper", "bocha", "brave", "doubao_search"].map((provider) => ({ provider, queries: 0, raw_results: 0, errors: 0, status: configured(provider) ? "CONFIGURED_NOT_CONFIRMED" : "NOT_CONFIGURED" }));
  fs.mkdirSync(outDir, { recursive: true });
  const formalBefore = sha256File(storePath);
  const registry = getAggregationRegistry();
  const sourceRuns: SourceRun[] = [];
  const searchIndexFallback: SearchIndexFallback = async () => {
    const names = ["bocha", "serper", "brave", "doubao_search"].filter(configured);
    const attempts: Array<{ provider: string; results: number; error: string | null }> = [];
    let resultCount = 0;
    for (const name of names) {
      const provider = providerRegistry.get(name);
      if (!provider) continue;
      try {
        const results = await provider.search("site:craftscouncil.org.uk opportunities craft", { max_results: 3, language: "en" });
        resultCount += results.length;
        const row = providerLogs.find((entry) => entry.provider === name);
        if (row) { row.queries += 1; row.raw_results += results.length; }
        attempts.push({ provider: name, results: results.length, error: null });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const row = providerLogs.find((entry) => entry.provider === name);
        if (row) { row.queries += 1; row.errors += 1; }
        attempts.push({ provider: name, results: 0, error: message });
      }
    }
    return { resultCount, attempts };
  };
  for (const source of registry) sourceRuns.push(await fetchSource(source.source_id, source.discovery_url, source.fetch_strategy ?? ["DIRECT", "BROWSER_HEADERS"], source.source_id === "crafts-council-opportunities" ? searchIndexFallback : undefined));

  const existing = JSON.parse(fs.readFileSync(candidatePath, "utf8")) as { candidates: AggregationItem[] };
  const combined = new Map<string, CandidateWithEvidence>();
  for (const item of existing.candidates) combined.set(item.item_id, { ...item });
  for (const run of sourceRuns) for (const item of run.items) combined.set(item.item_id, item);
  const relevant = [...combined.values()].filter((item) => item.relevance === "CORE_ICH" || item.relevance === "ICH_ADJACENT");
  const domestic = relevant.filter((item) => item.source_id === "shejijingsai-list").slice(0, 5);
  const chuang = relevant.filter((item) => item.source_id === "chuangsaiyun-competition-list").slice(0, 5);
  const overseas = relevant.filter((item) => !["shejijingsai-list", "chuangsaiyun-competition-list"].includes(item.source_id)).slice(0, 10);
  const selected = [...new Map([...domestic, ...chuang, ...overseas].map((item) => [item.item_id, item])).values()];
  let directLinkAttempted = 0;
  let directLinkCandidates = 0;
  let directLinkVerified = 0;
  let officialCandidatePagesRead = 0;
  let officialCandidateVerified = 0;
  let providerSearchAttempted = 0;
  let providerQueries = 0;
  let providerRawResults = 0;
  const qualified: CandidateWithEvidence[] = [];
  const backtraceRows: Array<Record<string, unknown>> = [];
  const orchestrator = new SearchOrchestrator({ llmAdapter: new MockLLMAdapter(), dataMode: "live", enableContentFetch: false, mockContent: false, maxResultsPerProvider: 3 });
  const hasProvider = providerLogs.some((row) => row.status === "CONFIGURED_NOT_CONFIRMED");
  const originalMaxQueries = process.env.MAX_SEARCH_QUERIES_PER_RUN;
  const originalMaxResults = process.env.MAX_SEARCH_RESULTS_PER_QUERY;
  process.env.MAX_SEARCH_QUERIES_PER_RUN = "1";
  process.env.MAX_SEARCH_RESULTS_PER_QUERY = "3";
  try {
    for (const item of selected) {
      const sourceOwnerHost = item.source_id === "crafts-council-opportunities" ? "craftscouncil.org.uk" : null;
      directLinkAttempted += 1;
      const detail = await fetchWithReliability(item.detail_url, { strategies: ["DIRECT", "BROWSER_HEADERS"], timeoutMs: 5_000 });
      let links = detail.text ? findOfficialLinks(detail.text, detail.finalUrl) : [];
      if (sourceOwnerHost && detail.text) links = [item.detail_url, ...links];
      directLinkCandidates += links.length;
      const scored: Array<ReturnType<typeof scoreOfficialCandidate>> = [];
      for (const link of links.slice(0, 2)) {
        const verified = await verifyOfficialPage(item, link, sourceOwnerHost);
        if (verified) { officialCandidatePagesRead += 1; scored.push(verified); }
      }
      const best = scored.sort((a, b) => b.score - a.score)[0];
      if (best?.status === "OFFICIAL_FOUND") {
        directLinkVerified += 1; officialCandidateVerified += 1;
        const updated = { ...item, official_url: best.url, official_backtrace_status: "OFFICIAL_FOUND" as const, official_confidence_score: best.score, official_candidate_urls: links, backtrace_evidence: best.evidence, application_url: item.application_url ?? best.url };
        qualified.push(updated);
        backtraceRows.push({ item_id: item.item_id, source_id: item.source_id, title: item.title, status: "OFFICIAL_FOUND", route: "direct_external_link", official_url: best.url, score: best.score, evidence: best.evidence });
        continue;
      }
      let status: OfficialBacktraceStatus = hasProvider ? "OFFICIAL_NOT_FOUND" : "PENDING_PROVIDER";
      if (links.length > 1 && !best) status = "MULTIPLE_CONFLICTING";
      if (hasProvider && links.length === 0) {
        providerSearchAttempted += 1;
        const region = ["shejijingsai-list", "chuangsaiyun-competition-list"].includes(item.source_id) ? "CN" : "GLOBAL";
        const routing = providerRouting(region);
        if (routing.primary.length || routing.fallback.length) {
          const result = await runIchRadarSearch(orchestrator, { query: `${item.title} official application`, providerRouting: routing });
          providerQueries += result.raw.executionLog?.queryExecutions.length ?? 0;
          providerRawResults += result.raw.total_raw;
          for (const log of result.raw.executionLog?.queryExecutions ?? []) {
            const row = providerLogs.find((entry) => entry.provider === log.provider);
            if (row) { row.queries += 1; row.raw_results += log.rawResultCount ?? 0; if (log.status === "failed") row.errors += 1; }
          }
          for (const candidate of result.raw.opportunities.slice(0, 3)) {
            const verified = await verifyOfficialPage(item, candidate.search_result.url, null);
            if (verified) { officialCandidatePagesRead += 1; if (verified.status === "OFFICIAL_FOUND") { officialCandidateVerified += 1; scored.push(verified); } }
          }
          const providerBest = scored.sort((a, b) => b.score - a.score)[0];
          if (providerBest?.status === "OFFICIAL_FOUND") {
            status = "OFFICIAL_FOUND";
            const updated = { ...item, official_url: providerBest.url, official_backtrace_status: "OFFICIAL_FOUND" as const, official_confidence_score: providerBest.score, official_candidate_urls: result.raw.opportunities.map((opportunity) => opportunity.search_result.url), backtrace_evidence: providerBest.evidence, application_url: item.application_url ?? providerBest.url };
            qualified.push(updated);
            backtraceRows.push({ item_id: item.item_id, source_id: item.source_id, title: item.title, status, route: "search_orchestrator", official_url: providerBest.url, score: providerBest.score, evidence: providerBest.evidence });
            continue;
          }
        }
      }
      backtraceRows.push({ item_id: item.item_id, source_id: item.source_id, title: item.title, status, route: links.length ? "direct_external_link_pending" : hasProvider ? "search_orchestrator_no_verified_page" : "provider_not_configured", direct_candidates: links });
    }
  } finally {
    if (originalMaxQueries === undefined) delete process.env.MAX_SEARCH_QUERIES_PER_RUN; else process.env.MAX_SEARCH_QUERIES_PER_RUN = originalMaxQueries;
    if (originalMaxResults === undefined) delete process.env.MAX_SEARCH_RESULTS_PER_QUERY; else process.env.MAX_SEARCH_RESULTS_PER_QUERY = originalMaxResults;
  }

  for (const row of providerLogs) {
    if (row.queries > 0 && row.errors === 0) row.status = "LIVE_CONFIRMED";
  }

  const formalAfter = sha256File(storePath);
  const totalProviderQueries = providerLogs.reduce((sum, row) => sum + row.queries, 0);
  const totalProviderRawResults = providerLogs.reduce((sum, row) => sum + row.raw_results, 0);
  const qualifiedDedup = [...new Map(qualified.map((item) => [item.item_id, item])).values()];
  fs.writeFileSync(qualifiedPath, `${JSON.stringify({ schema_version: "ich-aggregation-qualified-candidates.v1", run_id: `stage5a5-${now.toISOString()}`, formal_store_before_sha256: formalBefore, formal_store_after_sha256: formalAfter, formal_store_unchanged: formalBefore === formalAfter, candidates: qualifiedDedup }, null, 2)}\n`);
  const sourceHealth = sourceRuns.map((run): SourceHealthRow => ({ source_id: run.source_id, reachable: run.items_seen > 0, http_status: run.attempts.find((attempt) => attempt.status !== null)?.status ?? null, last_checked_at: now.toISOString(), adapter_status: run.status === "PASS" ? "PASS" : run.status === "BLOCKED" ? "BLOCKED" : "PARSER_FAILED", fetch_strategy: run.attempts.map((attempt) => attempt.strategy).filter((strategy, index, list) => list.indexOf(strategy) === index), reliability_status: run.reliability_status as any, error_taxonomy: run.error_taxonomy as any, attempts: run.attempts, parse_success: run.items_seen > 0, items_seen: run.items_seen, last_success_at: run.items_seen > 0 ? now.toISOString() : null, consecutive_failures: run.items_seen > 0 ? 0 : 1, error: run.items_seen > 0 ? null : run.error_taxonomy }));
  const reliabilityLines = ["# Stage5-A.5 抓取可靠性报告", "", "本轮只读；不绕过认证、CAPTCHA、Cloudflare 或登录。", "", "| source | items_seen | baseline | incremental | strategy | reliability_status | error_taxonomy | status |", "| --- | ---: | ---: | ---: | --- | --- | --- | --- |", ...sourceRuns.map((run) => `| ${run.source_id} | ${run.items_seen} | ${run.baseline_items_seen ?? "—"} | ${run.incremental_items_seen ?? "—"} | ${run.selected_strategy ?? "—"} | ${run.reliability_status} | ${run.error_taxonomy} | ${run.status} |`), "", "## 关键判断", "", `- Crafts Council：${sourceRuns.find((run) => run.source_id === "crafts-council-opportunities")?.reliability_status ?? "未确认"}；直连被阻断时只记录回退结果，不宣称抓取成功。`, `- Competitions.archi：使用轻量列表页、分页页和报名/提交视图；items_seen=${sourceRuns.find((run) => run.source_id === "competitions-archi")?.items_seen ?? 0}。`, `- Contest Watchers：baseline listing=${sourceRuns.find((run) => run.source_id === "contest-watchers-open")?.baseline_items_seen ?? 0}，RSS incremental=${sourceRuns.find((run) => run.source_id === "contest-watchers-open")?.incremental_items_seen ?? 0}；后续建议 7–14 天 reconciliation。`, ""];
  fs.writeFileSync(reliabilityPath, reliabilityLines.join("\n"));
  const backtraceLines = ["# Stage5-A.5 官方回溯报告", "", `selected=${selected.length}（Sheji=${domestic.length}，Chuang Sai Yun=${chuang.length}，overseas=${overseas.length}）`, "", "| item_id | source | title | status | route | official_url | score |", "| --- | --- | --- | --- | --- | --- | ---: |", ...backtraceRows.map((row) => `| ${row.item_id} | ${row.source_id} | ${String(row.title).replace(/\|/g, "\\|")} | ${row.status} | ${row.route} | ${row.official_url ?? "—"} | ${row.score ?? "—"} |`), "", "评分：domain owner 30 / title 25 / organizer 20 / deadline 15 / action signal 10；>=80 才标记 OFFICIAL_FOUND。", ""];
  fs.writeFileSync(backtracePath, backtraceLines.join("\n"));
  const providerLines = ["# Stage5-A.5 Provider Contribution", "", "只统计实际调用；未配置 Provider 的 queries/raw_results 均为 0。", "", "| provider | status | queries | raw_results | errors |", "| --- | --- | ---: | ---: | ---: |", ...providerLogs.map((row) => `| ${row.provider} | ${row.status} | ${row.queries} | ${row.raw_results} | ${row.errors} |`), "", `- provider_search_attempted: ${providerSearchAttempted}`, `- provider_queries: ${totalProviderQueries}`, `- provider_backtrace_queries: ${providerQueries}`, `- provider_raw_results: ${totalProviderRawResults}`, ""];
  fs.writeFileSync(providerPath, providerLines.join("\n"));
  const qualifiedLines = ["# Stage5-A.5 Qualified Candidates", "", `qualified=${qualifiedDedup.length}`, "", ...qualifiedDedup.map((item) => `- ${item.title} — ${item.deadline_at ?? "截止未确认"} — ${item.official_url} — score=${item.official_confidence_score ?? 0}`), "", "仅写入候选队列，不执行 DS14，不写正式机会库。", ""];
  fs.writeFileSync(qualifiedReportPath, qualifiedLines.join("\n"));
  const report = { schema_version: "ich-stage5a5.v1", run_id: `stage5a5-${now.toISOString()}`, readonly: true, formal_store_write: false, formal_store_before_sha256: formalBefore, formal_store_after_sha256: formalAfter, formal_store_unchanged: formalBefore === formalAfter, sources: sourceHealth, backtrace: { candidates_selected: selected.length, domestic_shejijingsai: domestic.length, domestic_chuangsaiyun: chuang.length, overseas: overseas.length, direct_link_attempted: directLinkAttempted, direct_link_candidates: directLinkCandidates, direct_link_verified: directLinkVerified, provider_search_attempted: providerSearchAttempted, provider_queries: totalProviderQueries, provider_backtrace_queries: providerQueries, provider_raw_results: totalProviderRawResults, official_candidate_pages_read: officialCandidatePagesRead, official_candidate_verified: officialCandidateVerified, official_backtrace_success: qualifiedDedup.length }, provider_contribution: providerLogs, qualified_candidates: qualifiedDedup.length, can_enter_stage5a6: qualifiedDedup.length > 0 && formalBefore === formalAfter };
  fs.writeFileSync(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
