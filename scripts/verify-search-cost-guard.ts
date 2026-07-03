import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SearchOrchestrator } from "../src/search/orchestrator";
import { providerRegistry, type SearchProvider } from "../src/search/provider-registry";
import type { SearchResult } from "../src/search/types";
import { createDefaultSpec, type RadarRequirementSpec } from "../src/schema/radar-requirement-spec";
import type { LLMAdapter } from "../src/agents/llm-adapter";
import { SerperProvider } from "../src/search/providers/serper";
import { fetchLiveEvidence } from "../src/search/live-evidence";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = ""): void {
  if (condition) {
    passed += 1;
    console.log(`PASS ${name}`);
  } else {
    failed += 1;
    failures.push(name);
    console.log(`FAIL ${name}${detail ? ` -> ${detail}` : ""}`);
  }
}

const llmAdapter: LLMAdapter = {
  async chat() {
    return { content: JSON.stringify({ relevance: 80, reason: "mock" }) };
  },
};

function tmpDir(name: string): string {
  const dir = path.join(os.tmpdir(), `chanceping-${name}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function makeBudgetSpec(): RadarRequirementSpec {
  const spec = createDefaultSpec();
  spec.client_profile.business_type = "搜索成本测试公司";
  spec.core_goals.primary_goal = "寻找可报名、可申请、可合作的机会";
  spec.opportunity_scope.primary_opportunity_types = ["采购合作", "报名申请", "渠道伙伴"];
  spec.region_scope.primary_regions = ["广东"];
  spec.keyword_strategy.core_keywords_zh = ["成本测试", "机会"];
  spec.radar_version = {
    version: "V1.0",
    oneSentencePositioning: "搜索成本测试雷达",
    targetUser: "测试用户",
    businessContext: "测试搜索成本保护",
    opportunityIntents: ["采购合作", "报名申请", "渠道伙伴"],
    highValueCriteria: ["有官方入口", "可联系确认"],
    exclusionRules: ["培训广告"],
    prioritySourceArchetypes: ["official_event_site", "procurement_or_supplier_portal"],
    queryFamilies: Array.from({ length: 6 }, (_, index) => ({
      familyName: `测试主题 ${index + 1}`,
      intentType: index % 2 === 0 ? "direct_opportunity" : "business_lead",
      sourceArchetype: index % 2 === 0 ? "official event site" : "supplier portal",
      queries: [
        "重复 查询 成本测试 报名",
        `成本测试 ${index + 1} 官方 申请`,
        `广东 成本测试 ${index + 1} 合作`,
        `成本测试 ${index + 1} extra query should be capped`,
      ],
      whyThisFamily: "验证每次运行的搜索主题、query 与去重上限。",
      resultBucket: index % 2 === 0 ? "direct_opportunity" : "business_lead",
    })),
    scoringRules: [],
    reportTemplate: [],
    missingConfig: [],
    defaultAssumptions: [],
    revisionNotes: [],
    resultBuckets: ["direct_opportunity", "business_lead"],
  };
  return spec;
}

function makeResult(query: string, index: number): SearchResult {
  const slug = encodeURIComponent(`${query}-${index}`).replace(/%/g, "");
  return {
    title: `${query} 官方报名申请入口`,
    url: `https://opportunity.example.org/${slug}`,
    snippet: "官方公告显示可报名、可申请、可联系确认，截止时间需复核。",
    source_provider: "serper",
    source_type: "web",
  };
}

async function verifyRunCapsAndDedup(): Promise<void> {
  const original = providerRegistry.get("serper");
  const calls: Array<{ query: string; maxResults?: number }> = [];
  const provider: SearchProvider = {
    name: "serper",
    display_name: "Serper Cost Guard Spy",
    source_type: "web",
    reliability: "B",
    enabled: true,
    radar_types: ["custom"],
    async healthCheck() {
      return true;
    },
    async search(query, options) {
      calls.push({ query, maxResults: options?.max_results });
      return [makeResult(query, calls.length)];
    },
  };

  providerRegistry.register(provider);
  try {
    const result = await new SearchOrchestrator({
      llmAdapter,
      dataMode: "live",
      enableContentFetch: false,
      maxResultsPerProvider: 50,
    }).search(makeBudgetSpec(), "成本测试", { primary: ["serper"], fallback: [] });

    const normalizedCalls = calls.map((item) => item.query.trim().replace(/\s+/g, " ").toLowerCase());
    check("run caps search themes at 5", (result.searchPlan?.searchThemes ?? []).length <= 5, JSON.stringify(result.searchPlan?.searchThemes ?? []));
    check("run caps search queries at 15", calls.length <= 15, `calls=${calls.length}`);
    check("run deduplicates identical queries inside one run", new Set(normalizedCalls).size === normalizedCalls.length, JSON.stringify(calls.map((item) => item.query)));
    check("run caps Serper results per query at 5", calls.every((item) => (item.maxResults ?? 0) <= 5), JSON.stringify(calls));
  } finally {
    providerRegistry.unregister("serper");
    if (original) providerRegistry.register(original);
  }
}

function makeSerperPayload(title: string, count = 1): unknown {
  return {
    organic: Array.from({ length: count }, (_, index) => ({
      title: `${title} ${index + 1}`,
      link: `https://real.example.com/${encodeURIComponent(title)}-${index + 1}`,
      snippet: "真实搜索测试结果，包含报名、申请和联系信号。",
      date: "2026-07-02",
    })),
  };
}

async function verifySerperCache(): Promise<void> {
  const dir = tmpDir("serper-cache");
  const originalEnv = { ...process.env };
  let fetchCount = 0;
  const originalFetch = globalThis.fetch;
  process.env.CHANCEPING_SEARCH_CACHE_DIR = dir;
  process.env.SERPER_DAILY_HARD_BUDGET = "100";
  process.env.SERPER_DAILY_SOFT_BUDGET = "90";
  globalThis.fetch = (async () => {
    fetchCount += 1;
    return new Response(JSON.stringify(makeSerperPayload(`缓存测试 ${fetchCount}`, 5)), { status: 200 });
  }) as typeof fetch;

  try {
    const provider = new SerperProvider({ apiKey: "test-serper-key", mockMode: false });
    const first = await provider.search("  Cache   Query 测试  ", { max_results: 5, language: "zh", region: "cn" });
    const second = await provider.search("cache query 测试", { max_results: 2, language: "zh", region: "cn" });
    check("Serper cache hit does not call fetch twice", fetchCount === 1, `fetchCount=${fetchCount}`);
    check("Serper cache returns cached results", first[0]?.url === second[0]?.url, JSON.stringify({ first: first[0]?.url, second: second[0]?.url }));
    check("Serper cache hit still respects max_results", first.length === 5 && second.length === 2, JSON.stringify({ first: first.length, second: second.length }));
  } finally {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function verifyDailyHardBudget(): Promise<void> {
  const dir = tmpDir("serper-budget");
  const originalEnv = { ...process.env };
  let fetchCount = 0;
  const originalFetch = globalThis.fetch;
  process.env.CHANCEPING_SEARCH_CACHE_DIR = dir;
  process.env.SERPER_DAILY_HARD_BUDGET = "1";
  process.env.SERPER_DAILY_SOFT_BUDGET = "1";
  globalThis.fetch = (async () => {
    fetchCount += 1;
    return new Response(JSON.stringify(makeSerperPayload(`预算测试 ${fetchCount}`)), { status: 200 });
  }) as typeof fetch;

  try {
    const provider = new SerperProvider({ apiKey: "test-serper-key", mockMode: false });
    await provider.search("预算 测试 A", { max_results: 5, language: "zh", region: "cn" });
    let blocked = false;
    try {
      await provider.search("预算 测试 B", { max_results: 5, language: "zh", region: "cn" });
    } catch (err) {
      blocked = /daily hard budget|硬预算|SERPER_DAILY_HARD_BUDGET/i.test(err instanceof Error ? err.message : String(err));
    }
    check("Serper daily hard budget blocks live search", blocked, "second uncached query should be blocked");
    check("hard-budget block does not call Serper again", fetchCount === 1, `fetchCount=${fetchCount}`);
  } finally {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function verifyReadUrlLimit(): Promise<void> {
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  globalThis.fetch = (async () => {
    fetchCount += 1;
    return new Response(`# 测试页面 ${fetchCount}\n\n报名入口：https://apply.example.com\n报名截止日期：2026-08-01`, { status: 200 });
  }) as typeof fetch;
  try {
    const results = Array.from({ length: 8 }, (_, index) => makeResult(`网页读取 ${index + 1}`, index + 1));
    const evidence = await fetchLiveEvidence(results);
    check("live evidence reads at most 5 URLs by default", evidence.openedUrls.length === 5, `opened=${evidence.openedUrls.length}`);
    check("live evidence does not fetch beyond 5 URLs", fetchCount === 5, `fetchCount=${fetchCount}`);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function verifyGoldenLiveSelection(): Promise<void> {
  const modulePath = path.resolve(process.cwd(), "scripts/golden-20-browser-baseline.mjs");
  const golden = await import(fileURLToPath(new URL(`file://${modulePath}`)));
  const defaults = golden.selectGoldenCaseIdsForLiveMode?.({});
  const full = golden.selectGoldenCaseIdsForLiveMode?.({ fullLiveGolden20: true });
  const selected = golden.selectGoldenCaseIdsForLiveMode?.({ selected: "2,7,19" });
  check("Golden 20 default live mode is selected sample", Array.isArray(defaults) && defaults.length > 0 && defaults.length < 20, JSON.stringify(defaults));
  check("Golden 20 full live mode is explicit", Array.isArray(full) && full.length === 20, JSON.stringify(full));
  check("Golden 20 supports selected live sample", JSON.stringify(selected) === JSON.stringify([2, 7, 19]), JSON.stringify(selected));
}

async function main(): Promise<void> {
  process.env.DATA_MODE = "mock";
  process.env.LLM_MODE = "mock";
  await verifyRunCapsAndDedup();
  await verifySerperCache();
  await verifyDailyHardBudget();
  await verifyReadUrlLimit();
  await verifyGoldenLiveSelection();

  console.log(`search cost guard: ${passed} PASS / ${failed} FAIL`);
  if (failures.length > 0) {
    console.log("Failures:");
    for (const failure of failures) console.log(`- ${failure}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
