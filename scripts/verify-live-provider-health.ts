import { readFileSync } from "fs";
import { loadLocalApiEnv } from "../src/config/local-env";
import { isLocalLiveSearchEnabled } from "../src/config/local-live-search";
import type { ApiResponse, SearchRequest } from "../src/api/types";
import type { SearchProvider } from "../src/search/provider-registry";
import type { SearchResult } from "../src/search/types";

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail = ""): void {
  if (condition) {
    passed += 1;
    console.log(`PASS ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL ${name}${detail ? ` -> ${detail}` : ""}`);
  }
}

function hasExampleUrl(value: string): boolean {
  return /(?:^|\.)example\.(?:com|org|net|cn|edu)|mock\.chanceping\.local/i.test(value);
}

function checkQ4ServerImportOrder(): void {
  const source = readFileSync("scripts/start-q4-live-server.ts", "utf-8");
  const forbiddenStaticImports = Array.from(source.matchAll(/^import\s+(?!type\b)[^;]+from\s+["']\.\.\/src\/(api|agents|search|watch|schema)\//gm))
    .map((match) => match[0]);
  check(
    "Q4 live server does not statically import provider-triggering modules before api.env",
    forbiddenStaticImports.length === 0,
    forbiddenStaticImports.join(" | "),
  );
  check(
    "Q4 live server uses dynamic imports after api.env load",
    (() => {
      const envCallIndex = source.indexOf("const localEnv = loadLocalApiEnv");
      const appImportIndex = source.indexOf('import("../src/api/app")');
      const providerImportIndex = source.indexOf('import("../src/search/provider-registry")');
      const contextCallIndex = source.indexOf("await createQ4Context()");
      return envCallIndex >= 0
        && appImportIndex > envCallIndex
        && providerImportIndex > envCallIndex
        && contextCallIndex > envCallIndex;
    })(),
  );
}

function mockModeSerperProvider(): SearchProvider & { mockMode: boolean } {
  return {
    name: "serper",
    display_name: "Serper Mock Mode Regression Provider",
    source_type: "web",
    reliability: "B",
    enabled: true,
    radar_types: ["custom"],
    mockMode: true,
    async search(): Promise<SearchResult[]> {
      return [{
        title: "演示候选不应进入 live",
        url: "https://innovation.example.com/opportunities/2026",
        snippet: "This is a mock/example result and must be blocked before live search proceeds.",
        source_provider: "serper",
        source_type: "web",
      }];
    },
    async healthCheck(): Promise<boolean> {
      return true;
    },
  };
}

async function main(): Promise<void> {
  const packageJson = JSON.parse(readFileSync("package.json", "utf-8")) as { scripts?: Record<string, string> };
  check(
    "verify:live-provider-health is not part of verify:all",
    !String(packageJson.scripts?.["verify:all"] ?? "").includes("verify:live-provider-health"),
  );

  const envResult = loadLocalApiEnv({ enabled: true });
  check("api.env loaded explicitly for provider health", envResult.loaded, envResult.reason);
  check("SERPER_API_KEY exists without printing value", Boolean(process.env.SERPER_API_KEY));

  process.env.CHANCEPING_ENABLE_LOCAL_LIVE_SEARCH = "true";
  process.env.CHANCEPING_ENABLE_LOCAL_LIVE_LLM = "true";
  process.env.CHANCEPING_LLM_PROFILE = process.env.CHANCEPING_LLM_PROFILE || "commercial";
  process.env.LLM_MODE = process.env.LLM_MODE || "live";
  const oldNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";
  check("local live search switch is enabled for health check", isLocalLiveSearchEnabled());
  checkQ4ServerImportOrder();

  const [{ providerRegistry }, { createDefaultSpec }, { createApp }, { createAppContext }] = await Promise.all([
    import("../src/search/provider-registry"),
    import("../src/schema/radar-requirement-spec"),
    import("../src/api/app"),
    import("../src/api/context"),
  ]);
  const provider = providerRegistry.get("serper");
  check("serper provider is registered", Boolean(provider));
  if (provider) {
    check("serper provider is not in mockMode for live health", (provider as { mockMode?: boolean }).mockMode !== true);
    const healthy = await provider.healthCheck();
    check("serper health check succeeds", healthy, "provider returned unhealthy; do not run full live Golden 20");
  }

  const app = createApp(createAppContext());
  const spec = createDefaultSpec();
  spec.client_profile.industry = "体育";
  spec.client_profile.business_type = "乒乓球选手";
  spec.core_goals.primary_goal = "寻找可报名乒乓球赛事";
  spec.opportunity_scope.primary_opportunity_types = ["乒乓球赛事"];
  spec.keyword_strategy.core_keywords_zh = ["乒乓球", "公开赛", "报名"];
  spec.keyword_strategy.core_keywords_en = ["WTT", "ITTF", "table tennis registration"];
  const liveSearchBody: SearchRequest = {
    spec,
    query: "WTT ITTF table tennis tournament registration",
    search_mode: "live",
    max_results: 1,
    enable_content_fetch: false,
    providerRouting: { primary: ["serper"], fallback: [] },
  };
  const liveSearchRes = await app.request("/api/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(liveSearchBody),
  });
  const liveSearchJson = await liveSearchRes.json() as ApiResponse<{
    rawCandidates?: Array<{ url: string; sourceDomain: string }>;
    runOutcome?: { status?: string; errorCode?: string };
  }>;
  const rawCandidates = liveSearchJson.data?.rawCandidates ?? [];
  check("product /api/search live path succeeds", liveSearchJson.success === true, JSON.stringify(liveSearchJson.error));
  check("product /api/search live path returns at least one raw candidate", rawCandidates.length > 0, JSON.stringify(liveSearchJson.data?.runOutcome));
  check(
    "product /api/search live path does not return example/mock URLs",
    rawCandidates.length > 0 && rawCandidates.every((candidate) => !hasExampleUrl(`${candidate.url} ${candidate.sourceDomain}`)),
    rawCandidates.map((candidate) => candidate.url).join(", "),
  );

  const originalSerper = providerRegistry.get("serper");
  providerRegistry.register(mockModeSerperProvider());
  try {
    const blockedRes = await app.request("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        spec,
        query: "mock provider should be blocked",
        search_mode: "live",
        max_results: 1,
        enable_content_fetch: false,
        providerRouting: { primary: ["serper"], fallback: [] },
      } satisfies SearchRequest),
    });
    const blockedJson = await blockedRes.json() as ApiResponse<{
      rawCandidates?: Array<{ url: string; sourceDomain: string }>;
      runOutcome?: { status?: string; errorCode?: string; message?: string };
    }>;
    check(
      "live mode blocks providers stuck in mockMode",
      blockedJson.data?.runOutcome?.status === "failed"
        && blockedJson.data.runOutcome.errorCode === "LIVE_PROVIDER_MOCK_MODE_BLOCKED",
      JSON.stringify(blockedJson.data?.runOutcome),
    );
    check(
      "blocked mock provider does not emit example raw candidates",
      (blockedJson.data?.rawCandidates ?? []).length === 0,
      JSON.stringify(blockedJson.data?.rawCandidates),
    );
  } finally {
    providerRegistry.unregister("serper");
    if (originalSerper) providerRegistry.register(originalSerper);
  }

  if (oldNodeEnv === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = oldNodeEnv;
  }

  console.log(`live provider health verification: ${passed} PASS / ${failed} FAIL`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`FAIL live provider health script completes -> ${message}`);
  process.exit(1);
});
