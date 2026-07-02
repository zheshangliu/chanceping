import fs from "fs";
import path from "path";
import { createApp } from "../src/api/app";
import type { AppContext } from "../src/api/context";
import { ModelRouter } from "../src/agents/model-router";
import { LocalFileStore } from "../src/agents/opportunity-store";
import { StarManager } from "../src/agents/star-manager";
import { LocalWatchStore } from "../src/watch/watch-store";
import { JsonRadarStore, JsonRadarRunStore } from "../src/agents/radar-store";
import { RadarRegistry } from "../src/agents/radar-registry";
import { JsonReportStore } from "../src/agents/report-store";
import type { ApiResponse, RadarGenerateResponseData } from "../src/api/types";
import type { OpportunityCard } from "../src/schema/opportunity-card";
import type { CandidateAccounting, RadarSearchPlan, SearchExecutionLog, SourceCoverageItem } from "../src/schema/radar-mvp-contracts";
import type { RawCandidateAudit } from "../src/search/types";
import type { SearchProvider } from "../src/search/provider-registry";
import type { SearchResult } from "../src/search/types";
import { SearchOrchestrator } from "../src/search/orchestrator";
import { providerRegistry } from "../src/search/provider-registry";

let passed = 0;
let failed = 0;
const failures: string[] = [];

const files = {
  radars: "data/radars-chat-mvp-api-test.json",
  runs: "data/radar-runs-chat-mvp-api-test.json",
  opps: "data/opportunity-store-chat-mvp-api-test.json",
  watch: "data/watch-rules-chat-mvp-api-test.txt",
  reports: "data/report-index-chat-mvp-api-test.json",
};

function check(name: string, condition: boolean, detail = ""): void {
  if (condition) {
    passed++;
    console.log(`PASS ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`FAIL ${name}${detail ? ` -> ${detail}` : ""}`);
  }
}

function cleanup(): void {
  for (const file of Object.values(files)) {
    const abs = path.resolve(process.cwd(), file);
    if (fs.existsSync(abs)) {
      fs.unlinkSync(abs);
    }
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

async function get<T = unknown>(
  app: ReturnType<typeof createApp>,
  url: string,
): Promise<{ res: Response; json: ApiResponse<T> }> {
  const res = await app.request(url);
  return { res, json: await res.json() as ApiResponse<T> };
}

async function del<T = unknown>(
  app: ReturnType<typeof createApp>,
  url: string,
): Promise<{ res: Response; json: ApiResponse<T> }> {
  const res = await app.request(url, { method: "DELETE" });
  return { res, json: await res.json() as ApiResponse<T> };
}

function summarizeFailures(): void {
  console.log(`chat MVP API: ${passed} PASS / ${failed} FAIL`);
  if (failures.length > 0) {
    console.log("Failures:");
    for (const item of failures) {
      console.log(`- ${item}`);
    }
  }
}

async function main(): Promise<void> {
  process.env.DATA_MODE = "mock";
  process.env.LLM_MODE = "mock";

  const ctx = createTestContext();
  const app = createApp(ctx);

  const generated = await post<RadarGenerateResponseData>(app, "/api/radars/generate", {
    description: "我是乒乓球选手，想盯未来30天内国内外可报名的乒乓球比赛，优先 ITTF、WTT、中国乒协官网，排除培训广告",
  });
  const genData = generated.json.data;
  check("generate profile summary", generated.res.status === 200 && !!genData?.profileSummary);
  const confirmedSpec = genData?.spec ? {
    ...genData.spec,
    confirmation_status: {
      ...genData.spec.confirmation_status,
      status: "confirmed" as const,
      user_confirmed: true,
      confirmed_at: new Date().toISOString(),
    },
  } : undefined;

  const mineBeforeCreate = await get<Array<{ isBuiltin?: boolean }>>(app, "/api/radars?scope=mine");
  check(
    "my radars excludes builtin templates",
    mineBeforeCreate.res.status === 200 && (mineBeforeCreate.json.data ?? []).every((radar) => radar.isBuiltin === false),
    JSON.stringify(mineBeforeCreate.json.data ?? []),
  );

  const created = await post<{ id?: string }>(app, "/api/radars", {
    name: genData?.suggestedName || "乒乓球比赛雷达",
    kind: "custom",
    spec: confirmedSpec,
  });
  const radarId = created.json.data?.id || "";
  check("create custom radar", created.res.status === 200 && radarId.length > 0, `status=${created.res.status}`);

  const activated = await post(app, `/api/radars/${radarId}/activate`, {});
  check("activate radar", activated.res.status === 200 && activated.json.success === true);

  const runResp = await post<{
    run?: { id?: string; status?: string };
    opportunityCards?: OpportunityCard[];
    rawCandidates?: RawCandidateAudit[];
    searchPlan?: RadarSearchPlan;
    executionLog?: SearchExecutionLog;
    sourceCoverage?: SourceCoverageItem[];
    candidateAccounting?: CandidateAccounting;
  }>(app, `/api/radars/${radarId}/run`, {});

  const runData = runResp.json.data;
  const runId = runData?.run?.id || "";
  const cards = runData?.opportunityCards || [];
  const accounting = runData?.candidateAccounting;
  check("run succeeded", runResp.res.status === 200 && runData?.run?.status === "succeeded", `status=${runResp.res.status}`);
  check("run has opportunity cards", cards.length > 0, `cards=${cards.length}`);
  check("run has search plan", !!runData?.searchPlan);
  check("search plan has query", (runData?.searchPlan?.queries ?? []).length > 0);
  const runSearchThemes = (runData?.searchPlan as RadarSearchPlan & { searchThemes?: Array<Record<string, unknown>> } | undefined)?.searchThemes ?? [];
  check("search plan has 3-5 semantic search themes", runSearchThemes.length >= 3 && runSearchThemes.length <= 5, JSON.stringify(runSearchThemes));
  check(
    "search themes expose intent/source/query rationale",
    runSearchThemes.every((theme) =>
      typeof theme.themeName === "string" &&
      ["direct_opportunity", "business_lead", "watch_signal", "reference_case"].includes(String(theme.intentType)) &&
      typeof theme.sourceArchetype === "string" &&
      Array.isArray(theme.queryExamples) &&
      (theme.queryExamples as unknown[]).length >= 2 &&
      (theme.queryExamples as unknown[]).length <= 3 &&
      typeof theme.whyThisTheme === "string",
    ),
    JSON.stringify(runSearchThemes),
  );
  check(
    "search plan query family records semantic metadata",
    (runData?.searchPlan?.queries ?? []).every((item) => {
      const q = item as Record<string, unknown>;
      return typeof q.themeName === "string" &&
        typeof q.intentType === "string" &&
        typeof q.sourceArchetype === "string" &&
        typeof q.queryFamily === "string";
    }),
    JSON.stringify(runData?.searchPlan?.queries ?? []),
  );
  check("run has execution log", (runData?.executionLog?.queryExecutions ?? []).length > 0);
  check(
    "execution log query executions keep query family metadata",
    (runData?.executionLog?.queryExecutions ?? []).every((item) => {
      const q = item as Record<string, unknown>;
      return typeof q.intentType === "string" &&
        typeof q.sourceArchetype === "string" &&
        typeof q.queryFamily === "string";
    }),
    JSON.stringify(runData?.executionLog?.queryExecutions ?? []),
  );
  check("run does not fake openedUrls", Array.isArray(runData?.executionLog?.openedUrls) && runData.executionLog.openedUrls.length === 0);
  check("run has source coverage", Array.isArray(runData?.sourceCoverage));
  check("run has raw candidates", (runData?.rawCandidates ?? []).length > 0);
  check("raw candidate has source domain", !!runData?.rawCandidates?.[0]?.sourceDomain);
  check("run has candidate accounting", typeof accounting?.rawCount === "number");
  check(
    "candidate accounting is internally consistent",
    (accounting?.rawCount ?? 0) >= (accounting?.deduplicatedCount ?? 0) &&
      (accounting?.assessedCount ?? 0) >= (accounting?.acceptedCount ?? 0) &&
      (accounting?.rejectedCount ?? -1) >= 0,
    JSON.stringify(accounting),
  );
  const runText = JSON.stringify(runData ?? {});
  check("mock run does not expose example.com links", !/example\.com/.test(runText), runText);
  check(
    "mock run opportunity cards are marked as demo data",
    cards.length > 0 && cards.every((card) =>
      card.is_demo_data === true && /演示|测试数据|未真实核验/.test(`${card.risk_note}${card.source_disclaimer ?? ""}`),
    ),
    JSON.stringify(cards),
  );
  check(
    "mock run does not pretend official source verification",
    !/已真实核验|已核验官网|已验证官网/.test(runText) &&
      cards.every((card) => !card.official_source_url || !/example\.com|mock\.chanceping\.local/.test(card.official_source_url)),
    runText,
  );
  check(
    "mock source coverage is not reported as checked",
    (runData?.sourceCoverage ?? []).every((item) => item.status === "not_checked"),
    JSON.stringify(runData?.sourceCoverage ?? []),
  );

  const opps = await get<{
    entries?: Array<{ card?: OpportunityCard; radarId?: string; radarIds?: string[] }>;
  }>(app, `/api/opportunities?radar_id=${encodeURIComponent(radarId)}`);
  const entries = opps.json.data?.entries || [];
  check("opportunities persisted", entries.length > 0, `entries=${entries.length}`);
  check(
    "opportunities bound to radar",
    entries.length > 0 && entries.every((entry) => entry.radarId === radarId || (entry.radarIds ?? []).includes(radarId)),
  );
  check("card keeps opportunity kind", entries.some((entry) => !!entry.card?.opportunity_kind));
  check("card keeps evidence status", entries.some((entry) => !!entry.card?.evidence_status));
  check("card keeps action status", entries.some((entry) => !!entry.card?.action_status));
  check("card keeps assessment", entries.some((entry) => !!entry.card?.assessment));

  const report = await post<{ reportId?: string; markdown?: string }>(app, "/api/reports/generate", {
    radar_id: radarId,
    run_id: runId,
    radar_type: "custom",
    spec: confirmedSpec,
    opportunities: cards,
    profile: genData?.profileSummary,
    sourceHintChecks: runData?.sourceCoverage,
    candidateAccounting: runData?.candidateAccounting,
  });
  const reportData = report.json.data;
  check("report generated", report.res.status === 200 && !!reportData?.reportId, `status=${report.res.status}`);
  check("report includes opportunity title", !!cards[0]?.title && !!reportData?.markdown?.includes(cards[0].title));
  check("report includes source coverage", !!reportData?.markdown?.includes("来源与检查回执"));
  check("report includes evidence status", !!reportData?.markdown?.includes("证据状态"));
  check("report includes action status", !!reportData?.markdown?.includes("行动状态"));
  check("mock report declares demo data is unverified", !!reportData?.markdown?.includes("演示 / 测试数据") && !!reportData.markdown.includes("未真实核验"));
  check("mock report does not include fake links", !/example\.com|mock\.chanceping\.local/.test(reportData?.markdown ?? ""), reportData?.markdown ?? "");
  check("mock report does not claim real source verification", !/已真实核验|已核验官网|已验证官网/.test(reportData?.markdown ?? ""), reportData?.markdown ?? "");
  check("run reportId written back", ctx.radarRunStore.get(runId)?.reportId === reportData?.reportId);

  const reportsBeforeRerun = ctx.reportStore.listByRadarId(radarId).length;
  const rerunResp = await post<{
    run?: { id?: string; status?: string; reportId?: string };
    opportunityCards?: OpportunityCard[];
    sourceCoverage?: SourceCoverageItem[];
    sourceHintChecks?: unknown[];
    candidateAccounting?: CandidateAccounting;
  }>(app, `/api/radars/${radarId}/run`, {});
  const rerunData = rerunResp.json.data;
  const rerunRunId = rerunData?.run?.id || "";
  const rerunCards = rerunData?.opportunityCards || [];
  check("rerun creates a new RadarRun", rerunResp.res.status === 200 && rerunRunId.length > 0 && rerunRunId !== runId, `runId=${rerunRunId}`);
  check("rerun keeps opportunity cards", rerunCards.length > 0, `cards=${rerunCards.length}`);
  const rerunReport = await post<{ reportId?: string; markdown?: string }>(app, "/api/reports/generate", {
    radar_id: radarId,
    run_id: rerunRunId,
    radar_type: "custom",
    spec: confirmedSpec,
    opportunities: rerunCards,
    profile: genData?.profileSummary,
    sourceHintChecks: rerunData?.sourceCoverage ?? rerunData?.sourceHintChecks,
    candidateAccounting: rerunData?.candidateAccounting,
  });
  const rerunReportData = rerunReport.json.data;
  const reportsAfterRerun = ctx.reportStore.listByRadarId(radarId).length;
  check("rerun report generated", rerunReport.res.status === 200 && !!rerunReportData?.reportId, `status=${rerunReport.res.status}`);
  check("rerun report binds radar_id + run_id", ctx.reportStore.get(rerunReportData?.reportId || "")?.runId === rerunRunId);
  check("rerun RadarRun.reportId written back", ctx.radarRunStore.get(rerunRunId)?.reportId === rerunReportData?.reportId);
  check("rerun appends a historical report", reportsAfterRerun === reportsBeforeRerun + 1, `before=${reportsBeforeRerun}, after=${reportsAfterRerun}`);

  const reloadedStore = new LocalFileStore({ file_path: files.opps });
  reloadedStore.load();
  check("reload keeps opportunities", reloadedStore.list({ radarId }).entries.length > 0);
  check("reload keeps report meta", new JsonReportStore({ file_path: files.reports }).listByRadarId(radarId).length > 0);

  await post(app, "/api/radars", { name: "第二个雷达", kind: "custom", spec: confirmedSpec });
  await post(app, "/api/radars", { name: "第三个雷达", kind: "custom", spec: confirmedSpec });
  const fullQuota = await get<{ current?: number; quota?: number; allowed?: boolean }>(app, "/api/radars/quota");
  check(
    "three custom radars fill free quota",
    fullQuota.json.data?.current === 3 && fullQuota.json.data?.quota === 3 && fullQuota.json.data?.allowed === false,
    JSON.stringify(fullQuota.json.data),
  );

  const archived = await del<{ status?: string }>(app, `/api/radars/${radarId}`);
  check(
    "delete radar performs soft archive",
    archived.res.status === 200 && archived.json.data?.status === "archived",
    JSON.stringify(archived.json),
  );
  const quotaAfterDelete = await get<{ current?: number; quota?: number; allowed?: boolean }>(app, "/api/radars/quota");
  check(
    "archiving radar immediately releases quota",
    quotaAfterDelete.json.data?.current === 2 && quotaAfterDelete.json.data?.allowed === true,
    JSON.stringify(quotaAfterDelete.json.data),
  );
  const mineAfterDelete = await get<Array<{ id?: string; isBuiltin?: boolean }>>(app, "/api/radars?scope=mine");
  check(
    "archived radar disappears from my radars",
    (mineAfterDelete.json.data ?? []).every((radar) => radar.id !== radarId && radar.isBuiltin === false),
    JSON.stringify(mineAfterDelete.json.data ?? []),
  );
  check("soft delete keeps historical opportunities", reloadedStore.list({ radarId }).entries.length > 0);
  check("soft delete keeps historical reports", new JsonReportStore({ file_path: files.reports }).listByRadarId(radarId).length > 0);

  const semanticProviderResults: SearchResult[] = [
    {
      title: "广东员工福利礼品采购公告",
      url: "https://procurement.example.org/welfare-gift-tender-2026",
      snippet: "采购公告：员工福利礼品项目正在招标，供应商可查看报名和投标要求。",
      source_provider: "test_q1_semantic",
      source_type: "web",
    },
    {
      title: "大湾区集团员工福利供应商入库合作入口",
      url: "https://partners.example.org/welfare-supplier-onboarding",
      snippet: "合作入口：征集员工福利和节日礼品供应商，需联系采购部门确认入库条件。",
      source_provider: "test_q1_semantic",
      source_type: "web",
    },
    {
      title: "广东企业员工福利采购趋势观察",
      url: "https://insights.example.org/welfare-procurement-trend",
      snippet: "观察信号：多家企业下半年福利采购预算和节日礼品需求上升。",
      source_provider: "test_q1_semantic",
      source_type: "web",
    },
    {
      title: "员工福利礼品项目案例复盘",
      url: "https://cases.example.org/welfare-gift-reference-case",
      snippet: "参考案例：往届员工福利礼品项目供应商方案、预算和执行方式复盘。",
      source_provider: "test_q1_semantic",
      source_type: "web",
    },
    {
      title: "员工福利培训广告课程",
      url: "https://ads.example.org/welfare-training-course",
      snippet: "培训广告：员工福利课程招商，不是采购、合作或报名入口。",
      source_provider: "test_q1_semantic",
      source_type: "web",
    },
  ];
  const semanticProvider: SearchProvider = {
    name: "test_q1_semantic",
    display_name: "Q1 Semantic Provider",
    source_type: "web",
    reliability: "B",
    enabled: true,
    radar_types: ["custom"],
    async search() {
      return semanticProviderResults;
    },
    async healthCheck() {
      return true;
    },
  };
  providerRegistry.register(semanticProvider);
  try {
    if (confirmedSpec) {
      const semanticSpec: typeof confirmedSpec = {
        ...confirmedSpec,
        client_profile: {
          ...confirmedSpec.client_profile,
          industry: "企业服务",
          business_type: "员工福利和节日礼品供应商",
          regions: ["广东", "香港"],
        },
        core_goals: {
          ...confirmedSpec.core_goals,
          primary_goal: "寻找员工福利采购、节日礼品招标和企业合作线索",
          action_intent: ["寻找合作", "寻找客户", "准备材料"],
        },
        opportunity_scope: {
          ...confirmedSpec.opportunity_scope,
          primary_opportunity_types: ["员工福利采购", "节日礼品招标", "企业合作线索"],
          excluded_opportunity_types: ["加盟广告"],
        },
        region_scope: {
          ...confirmedSpec.region_scope,
          primary_regions: ["广东", "香港"],
        },
        keyword_strategy: {
          ...confirmedSpec.keyword_strategy,
          core_keywords_zh: ["员工福利", "节日礼品", "采购", "合作"],
          core_keywords_en: ["employee benefits", "corporate gifts", "procurement"],
        },
        filter_rules: {
          ...confirmedSpec.filter_rules,
          must_exclude: ["加盟广告"],
        },
      };
      const semanticSearch = await new SearchOrchestrator({
        llmAdapter: ctx.llmAdapter,
        dataMode: "live",
        enableContentFetch: false,
        maxResultsPerProvider: 5,
      }).search(semanticSpec, "员工福利 礼品 采购 合作", { primary: ["test_q1_semantic"], fallback: [] });
      const semanticThemes = (semanticSearch.searchPlan as RadarSearchPlan & { searchThemes?: Array<{ intentType?: string; queryExamples?: string[] }> } | undefined)?.searchThemes ?? [];
      const semanticRaw = semanticSearch.rawCandidates ?? [];
      const semanticCards = semanticSearch.opportunityCards ?? [];
      const rawTypes = semanticRaw.map((item) => (item as RawCandidateAudit & { semanticType?: string }).semanticType);
      const cardTypes = semanticCards.map((card) => card.opportunity_kind);
      const expectedRawTypes: Array<NonNullable<RawCandidateAudit["semanticType"]>> = ["direct_opportunity", "business_lead", "watch_signal", "reference_case", "rejected"];
      check("semantic planner produces 3-5 themes", semanticThemes.length >= 3 && semanticThemes.length <= 5, JSON.stringify(semanticThemes));
      check("semantic planner includes business/watch/reference themes", ["business_lead", "watch_signal", "reference_case"].every((type) => semanticThemes.some((theme) => theme.intentType === type)), JSON.stringify(semanticThemes));
      check("semantic query hard cap stays within 15 queries", (semanticSearch.searchPlan?.queries ?? []).length <= 15, JSON.stringify(semanticSearch.searchPlan?.queries ?? []));
      check("semantic raw candidates keep all five result buckets", expectedRawTypes.every((type) => rawTypes.includes(type)), JSON.stringify(semanticRaw));
      check("business lead can enter key opportunity cards", cardTypes.includes("business_lead"), JSON.stringify(semanticCards));
      check("watch/reference/rejected stay out of key opportunity cards", !cardTypes.includes("watch_signal") && !cardTypes.includes("reference_case") && !cardTypes.includes("rejected"), JSON.stringify(semanticCards));
      check(
        "business lead card is clearly marked as contact-confirmed lead",
        semanticCards.some((card) =>
          card.opportunity_kind === "business_lead" &&
          /可行动线索/.test(`${card.type}${card.sourceBadges?.join(" ")}${card.risk_note}`) &&
          /需联系确认|联系确认|待复核/.test(`${card.next_action}${card.risk_note}${card.source_disclaimer ?? ""}`),
        ),
        JSON.stringify(semanticCards),
      );
    }
  } finally {
    providerRegistry.unregister("test_q1_semantic");
  }

  cleanup();
  summarizeFailures();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  cleanup();
  process.exit(1);
});
