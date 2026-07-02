import fs from "fs";
import path from "path";
import { createApp } from "../src/api/app";
import type { AppContext } from "../src/api/context";
import { ModelRouter } from "../src/agents/model-router";
import { LocalFileStore } from "../src/agents/opportunity-store";
import { StarManager } from "../src/agents/star-manager";
import { JsonRadarStore, JsonRadarRunStore } from "../src/agents/radar-store";
import { RadarRegistry } from "../src/agents/radar-registry";
import { JsonReportStore } from "../src/agents/report-store";
import { LocalWatchStore } from "../src/watch/watch-store";
import { createDefaultSpec } from "../src/schema/radar-requirement-spec";
import { providerRegistry, type SearchProvider } from "../src/search/provider-registry";
import type { SearchResult } from "../src/search/types";
import type { ApiResponse, RadarRunResult } from "../src/api/types";

let passed = 0;
let failed = 0;
const failures: string[] = [];

const files = {
  radars: "data/radars-q3-saveable-failed-run-test.json",
  runs: "data/radar-runs-q3-saveable-failed-run-test.json",
  opps: "data/opportunity-store-q3-saveable-failed-run-test.json",
  watch: "data/watch-rules-q3-saveable-failed-run-test.txt",
  reports: "data/report-index-q3-saveable-failed-run-test.json",
};

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

function cleanup(): void {
  for (const file of Object.values(files)) {
    const abs = path.resolve(process.cwd(), file);
    if (fs.existsSync(abs)) fs.unlinkSync(abs);
  }
}

function createTestContext(): AppContext {
  cleanup();
  const store = new LocalFileStore({ file_path: files.opps });
  store.load();
  const radarStore = new JsonRadarStore({ file_path: files.radars });
  const radarRunStore = new JsonRadarRunStore({ file_path: files.runs });
  const radarRegistry = new RadarRegistry(radarStore);
  radarRegistry.initialize();
  return {
    llmAdapter: new ModelRouter(),
    store,
    starManager: new StarManager(store),
    watchStore: new LocalWatchStore({ file_path: files.watch }),
    conversations: new Map(),
    radarStore,
    radarRunStore,
    radarRegistry,
    reportStore: new JsonReportStore({ file_path: files.reports }),
  };
}

async function post<T = unknown>(
  app: ReturnType<typeof createApp>,
  url: string,
  body: unknown,
): Promise<{ res: Response; json: ApiResponse<T> }> {
  const res = await app.request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { res, json: await res.json() as ApiResponse<T> };
}

function buildSpec() {
  const spec = createDefaultSpec();
  spec.client_profile.client_type = "公司";
  spec.client_profile.industry = "企业服务";
  spec.client_profile.business_type = "B2B 商品交易 SaaS 公司";
  spec.client_profile.regions = ["东南亚"];
  spec.core_goals.primary_goal = "寻找东南亚零售行业客户、渠道和合作机会";
  spec.core_goals.action_intent = ["寻找客户", "寻找合作"];
  spec.core_goals.success_definition = "未来60天内可联系确认";
  spec.opportunity_scope.primary_opportunity_types = ["零售客户线索", "渠道合作线索", "商务配对机会"];
  spec.region_scope.primary_regions = ["东南亚"];
  spec.keyword_strategy.core_keywords_zh = ["零售", "商超", "便利店", "渠道合作"];
  spec.keyword_strategy.core_keywords_en = ["retail", "FMCG", "distributor", "supplier portal"];
  spec.filter_rules.must_exclude = ["泛科技新闻", "培训广告"];
  spec.requirement_confidence.total = 95;
  spec.confirmation_status.status = "confirmed";
  spec.confirmation_status.user_confirmed = true;
  spec.confirmation_status.confirmed_at = new Date().toISOString();
  return spec;
}

function failingProvider(): SearchProvider {
  return {
    name: "test_q3_fail",
    display_name: "Q3 Failing Provider",
    source_type: "web",
    reliability: "B",
    enabled: true,
    radar_types: ["custom"],
    async search(): Promise<SearchResult[]> {
      throw new Error("fetch failed");
    },
    async healthCheck() {
      return false;
    },
  };
}

function emptyProvider(): SearchProvider {
  return {
    name: "test_q3_empty",
    display_name: "Q3 Empty Provider",
    source_type: "web",
    reliability: "B",
    enabled: true,
    radar_types: ["custom"],
    async search(): Promise<SearchResult[]> {
      return [];
    },
    async healthCheck() {
      return true;
    },
  };
}

async function main(): Promise<void> {
  process.env.DATA_MODE = "mock";
  process.env.LLM_MODE = "mock";
  process.env.CHANCEPING_ENABLE_LOCAL_LIVE_SEARCH = "true";

  providerRegistry.register(failingProvider());
  providerRegistry.register(emptyProvider());

  const ctx = createTestContext();
  const app = createApp(ctx);
  const spec = buildSpec();

  try {
    const failedSearch = await post<{
      runOutcome?: { status?: string; canSaveRadar?: boolean; canRetry?: boolean; canSwitchToDemo?: boolean; message?: string };
      opportunityCards?: unknown[];
      searchPlan?: unknown;
      candidateAccounting?: { rawCount?: number };
      errors?: string[];
    }>(app, "/api/search", {
      spec,
      query: "B2B 商品交易 SaaS 东南亚 零售 供应商入口",
      search_mode: "live",
      providerRouting: { primary: ["test_q3_fail"], fallback: [] },
      enable_content_fetch: false,
    });
    check("failed live search returns 200 with saveable result", failedSearch.res.status === 200 && failedSearch.json.success === true, `status=${failedSearch.res.status}, error=${failedSearch.json.error?.message}`);
    check("failed live search exposes failed outcome", failedSearch.json.data?.runOutcome?.status === "failed", JSON.stringify(failedSearch.json.data?.runOutcome));
    check("failed live search can still be saved as radar", failedSearch.json.data?.runOutcome?.canSaveRadar === true, JSON.stringify(failedSearch.json.data?.runOutcome));
    check("failed live search keeps search plan for diagnosis", Boolean(failedSearch.json.data?.searchPlan));
    check("failed live search does not fabricate opportunity cards", (failedSearch.json.data?.opportunityCards ?? []).length === 0);

    const emptySearch = await post<{
      runOutcome?: { status?: string; canSaveRadar?: boolean; message?: string };
      opportunityCards?: unknown[];
      candidateAccounting?: { rawCount?: number };
    }>(app, "/api/search", {
      spec,
      query: "B2B 商品交易 SaaS 东南亚 零售 供应商入口",
      search_mode: "live",
      providerRouting: { primary: ["test_q3_empty"], fallback: [] },
      enable_content_fetch: false,
    });
    check("empty live search returns 200 with saveable result", emptySearch.res.status === 200 && emptySearch.json.success === true, `status=${emptySearch.res.status}, error=${emptySearch.json.error?.message}`);
    check("empty live search exposes no_results outcome", emptySearch.json.data?.runOutcome?.status === "no_results", JSON.stringify(emptySearch.json.data?.runOutcome));
    check("empty live search can still be saved as radar", emptySearch.json.data?.runOutcome?.canSaveRadar === true, JSON.stringify(emptySearch.json.data?.runOutcome));

    const created = await post<{ id?: string }>(app, "/api/radars", {
      name: "Q3 失败也可保存雷达",
      kind: "custom",
      spec,
      preferredSearchMode: "live",
      providerRouting: { primary: ["test_q3_fail"], fallback: [] },
    });
    const radarId = created.json.data?.id ?? "";
    check("radar can be saved after failed search", created.res.status === 200 && radarId.length > 0, `status=${created.res.status}`);
    const activated = await post(app, `/api/radars/${radarId}/activate`, {});
    check("saved radar activates after failed search", activated.res.status === 200 && activated.json.success === true);

    const runFailed = await post<RadarRunResult & { runOutcome?: { status?: string; canRetry?: boolean; canSaveRadar?: boolean } }>(
      app,
      `/api/radars/${radarId}/run`,
      { search_mode: "live" },
    );
    check("saved radar rerun failure returns result envelope", runFailed.res.status === 200 && runFailed.json.success === true, `status=${runFailed.res.status}, error=${runFailed.json.error?.message}`);
    check("failed rerun writes failed RadarRun", runFailed.json.data?.run?.status === "failed", JSON.stringify(runFailed.json.data?.run));
    check("failed rerun remains retryable and does not mock fallback", runFailed.json.data?.runOutcome?.status === "failed" && runFailed.json.data.runOutcome.canRetry === true, JSON.stringify(runFailed.json.data?.runOutcome));
    check("failed rerun is stored in history", ctx.radarRunStore.listByRadarId(radarId).some((run) => run.status === "failed"));

    const mvpUxSource = fs.readFileSync(path.resolve(process.cwd(), "web/radar-profile.js"), "utf-8")
      + fs.readFileSync(path.resolve(process.cwd(), "web/watch-result.js"), "utf-8");
    check("frontend labels radar version as strategy card", mvpUxSource.includes("雷达 ${escapeHtml(radarVersion.version)} 策略卡") || mvpUxSource.includes("雷达 V1.0 策略卡"));
    check("strategy card shows search themes", mvpUxSource.includes("会按哪些搜索主题去找"));
    check("failed/no-result UI can save long-term radar", mvpUxSource.includes("本轮真实搜索结果不足，但雷达已生成") && mvpUxSource.includes("保存为长期雷达"));
    check("failed/no-result UI offers adjust and retry", mvpUxSource.includes("调整雷达策略") && mvpUxSource.includes("重试搜索"));
  } finally {
    providerRegistry.unregister("test_q3_fail");
    providerRegistry.unregister("test_q3_empty");
    cleanup();
  }

  console.log(`Q3 saveable failed run verification: ${passed} PASS / ${failed} FAIL`);
  if (failures.length > 0) {
    console.log("Failures:");
    for (const item of failures) console.log(`- ${item}`);
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  cleanup();
  providerRegistry.unregister("test_q3_fail");
  providerRegistry.unregister("test_q3_empty");
  process.exit(1);
});
