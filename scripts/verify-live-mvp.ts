import { readFileSync } from "fs";
import { spawnSync } from "child_process";
import { loadLocalApiEnv } from "../src/config/local-env";
import type { OpportunityCard } from "../src/schema/opportunity-card";
import type { RadarRequirementSpec } from "../src/schema/radar-requirement-spec";
import type { FieldEvidenceName, FieldEvidenceStatus } from "../src/schema/radar-mvp-contracts";
import type { SearchResult } from "../src/search/types";
import type { SearchProvider } from "../src/search/provider-registry";

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail = ""): void {
  if (condition) {
    passed++;
    console.log(`PASS ${name}`);
  } else {
    failed++;
    console.log(`FAIL ${name}${detail ? ` -> ${detail}` : ""}`);
  }
}

function sanitize(message: unknown): string {
  let text = message instanceof Error ? message.message : String(message ?? "");
  for (const keyName of ["SERPER_API_KEY"]) {
    const value = process.env[keyName];
    if (value && value.length > 0) {
      text = text.split(value).join("[redacted]");
    }
  }
  return text;
}

function hasMockOrExampleUrl(url: string): boolean {
  return /mock\.chanceping\.local|example\.(com|org|net|cn|edu)/i.test(url);
}

function titleOf(card: OpportunityCard | undefined): string {
  return String(card?.title ?? "").trim();
}

function lowActionText(value: string): boolean {
  return /视频|集锦|百科|维基|规则|历史|新闻转载|培训广告|培训班|专栏|博客|科普|入门|指南|升段|升级|知乎|新浪|搜狐|网易|YouTube|playlist|wikipedia|baike|rules|history|zhihu|column|blog|guide|explainer|sports\.sina|sohu|163\.com/i.test(value);
}

function cardText(card: OpportunityCard | undefined): string {
  if (!card) return "";
  return [
    card.title,
    card.official_source_url,
    card.match_reason,
    card.next_action,
  ].join(" ");
}

function actionSignalText(value: string): boolean {
  return /报名|申报|申请|赛事通知|赛程|采购公告|招标公告|申请入口|官方公告|公开赛|锦标赛|大会|イベント|棋戦|calendar|event|events|tournament|championship|registration|entry/i.test(value);
}

const REQUIRED_TRUST_SECTIONS = [
  "### 搜索到的来源",
  "### 字段已核验事实",
  "### 模型判断",
  "### 待复核项",
  "### 失败来源",
  "### 未检查来源",
  "### 低行动性观察来源",
];

const REQUIRED_FIELD_EVIDENCE: FieldEvidenceName[] = [
  "title",
  "source_url",
  "source_domain",
  "source_type",
  "registration_or_application_signal",
  "date_or_deadline",
  "fee",
  "eligibility",
  "contact_or_application_route",
];

const ALLOWED_FIELD_STATUSES: FieldEvidenceStatus[] = [
  "verified",
  "partially_verified",
  "unverified",
  "not_found",
  "failed",
];

function hasRequiredTrustSections(markdown: string): boolean {
  return REQUIRED_TRUST_SECTIONS.every((section) => markdown.includes(section));
}

function fieldEvidenceFields(card: OpportunityCard | undefined): string[] {
  return (card?.field_evidence ?? []).map((item) => item.field);
}

function fieldEvidenceStatuses(card: OpportunityCard | undefined): string[] {
  return (card?.field_evidence ?? []).map((item) => item.status);
}

function setConfirmed(spec: RadarRequirementSpec, now: string): void {
  spec.requirement_confidence.total = 95;
  spec.confirmation_status.status = "confirmed";
  spec.confirmation_status.user_confirmed = true;
  spec.confirmation_status.confirmed_at = now;
}

function addSources(
  spec: RadarRequirementSpec,
  now: string,
  sources: Array<{ name: string; url: string }>,
  manualSources: string[] = [],
): void {
  const sourceStrategy = spec.source_strategy!;
  sourceStrategy.manual_sources = manualSources;
  sourceStrategy.user_supplied_sources = sources.map((source) => ({
    source_name: source.name,
    source_url: source.url,
    added_at: now,
    contributed_by: "user",
  }));
}

function buildTableTennisSpec(createDefaultSpec: () => RadarRequirementSpec, now: string): RadarRequirementSpec {
  const spec = createDefaultSpec();
  spec.client_profile.client_type = "个人";
  spec.client_profile.industry = "体育";
  spec.client_profile.business_type = "乒乓球选手";
  spec.client_profile.regions = ["中国", "国际"];
  spec.core_goals.primary_goal = "寻找未来30天内可报名的乒乓球比赛";
  spec.core_goals.action_intent = ["报名比赛"];
  spec.core_goals.priority_order = ["WTT", "ITTF", "中国乒协"];
  spec.opportunity_scope.primary_opportunity_types = ["乒乓球比赛", "公开赛", "报名窗口"];
  spec.region_scope.primary_regions = ["中国", "国际"];
  spec.region_scope.global_allowed = true;
  spec.keyword_strategy.core_keywords_zh = ["乒乓球", "比赛", "报名", "赛事通知"];
  spec.keyword_strategy.core_keywords_en = ["table tennis", "WTT", "ITTF", "calendar"];
  spec.filter_rules.must_exclude = ["培训广告"];
  addSources(spec, now, [
    { name: "WTT", url: "https://worldtabletennis.com/" },
    { name: "ITTF", url: "https://www.ittf.com/" },
  ], ["中国乒协官网"]);
  setConfirmed(spec, now);
  return spec;
}

function liveRunHasEvidence(data: {
  opportunityCards?: OpportunityCard[];
  rawCandidates?: Array<{ title: string; url: string; sourceDomain: string }>;
  executionLog?: {
    openedUrls?: Array<{ url: string; status: string; errorType?: string; fetchedAt: string }>;
    queryExecutions?: Array<{ provider: string; status: string; rawResultCount: number }>;
  };
} | undefined): boolean {
  const cards = data?.opportunityCards ?? [];
  const rawCandidates = data?.rawCandidates ?? [];
  const openedUrls = data?.executionLog?.openedUrls ?? [];
  const providerSummary = data?.executionLog?.queryExecutions ?? [];
  return rawCandidates.length > 0
    && rawCandidates.every((candidate) => Boolean(candidate.sourceDomain) && !hasMockOrExampleUrl(candidate.url))
    && openedUrls.length > 0
    && openedUrls.length <= 5
    && providerSummary.some((item) => item.provider === "serper")
    && cards.length > 0
    && cards.every((card) => card.data_mode === "live" && card.is_demo_data !== true)
    && cards.slice(0, 5).every((card) => !lowActionText(cardText(card)));
}

async function generateBoundReport(
  app: { request: (input: string, init?: RequestInit) => Response | Promise<Response> },
  radarId: string,
  spec: RadarRequirementSpec,
  runData: {
    run?: { id?: string };
    opportunityCards?: OpportunityCard[];
    sourceCoverage?: unknown[];
    sourceHintChecks?: unknown[];
    candidateAccounting?: unknown;
    executionLog?: unknown;
    rawCandidates?: unknown[];
  },
): Promise<{ reportId?: string; markdown: string; status: number; success?: boolean; error?: string }> {
  const response = await app.request("/api/reports/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      radar_id: radarId,
      run_id: runData.run?.id,
      radar_type: "custom",
      spec,
      opportunities: runData.opportunityCards ?? [],
      sourceHintChecks: runData.sourceCoverage ?? runData.sourceHintChecks ?? [],
      candidateAccounting: runData.candidateAccounting,
      executionLog: runData.executionLog,
      rawCandidates: runData.rawCandidates ?? [],
    }),
  });
  const json = await response.json() as {
    success?: boolean;
    data?: { reportId?: string; markdown?: string };
    error?: { message?: string };
  };
  return {
    reportId: json.data?.reportId,
    markdown: json.data?.markdown ?? "",
    status: response.status,
    success: json.success,
    error: json.error?.message,
  };
}

interface LiveScenario {
  id: string;
  label: string;
  query: string;
  expectedDomains: string[];
  buildSpec: (base: RadarRequirementSpec, now: string) => RadarRequirementSpec;
}

async function main(): Promise<void> {
  const packageJsonSource = readFileSync("package.json", "utf-8");
  const packageJson = JSON.parse(packageJsonSource) as { scripts?: Record<string, string> };
  const scriptSource = readFileSync("scripts/verify-live-mvp.ts", "utf-8");

  check(
    "verify:live-mvp is opt-in and not part of verify:all",
    !String(packageJson.scripts?.["verify:all"] ?? "").includes("verify:live-mvp"),
  );
  const ignored = spawnSync("git", ["check-ignore", "-q", "api.env"], {
    cwd: process.cwd(),
    stdio: "ignore",
  });
  check("api.env is git-ignored", ignored.status === 0);
  check("live script does not print API key values or prefixes", !/SERPER_API_KEY\s*=|substring\(0|slice\(0,\s*8/.test(scriptSource));

  const localEnv = loadLocalApiEnv({ enabled: true });
  check("api.env loads only through explicit live script", localEnv.loaded, `reason=${localEnv.reason}`);
  check("SERPER_API_KEY is available for live search", Boolean(process.env.SERPER_API_KEY));

  process.env.DATA_MODE = "mock";
  process.env.LLM_MODE = "mock";
  process.env.CHANCEPING_ENABLE_LOCAL_LIVE_SEARCH = "true";
  check("global DATA_MODE remains mock during product-path live test", process.env.DATA_MODE === "mock");
  check("LLM_MODE stays mock for live search MVP", process.env.LLM_MODE === "mock");
  check("local live search switch is explicit", process.env.CHANCEPING_ENABLE_LOCAL_LIVE_SEARCH === "true");

  if (!process.env.SERPER_API_KEY) {
    console.log(`live MVP verification: ${passed} PASS / ${failed} FAIL`);
    process.exit(1);
  }

  const [{ createApp }, { createAppContext }, { createDefaultSpec }, { SearchOrchestrator }, { providerRegistry }, { ModelRouter }] = await Promise.all([
    import("../src/api/app"),
    import("../src/api/context"),
    import("../src/schema/radar-requirement-spec"),
    import("../src/search/orchestrator"),
    import("../src/search/provider-registry"),
    import("../src/agents/model-router"),
  ]);

  const ctx = createAppContext();
  const app = createApp(ctx);
  const now = new Date().toISOString();
  const originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  const productionBlocked = await app.request("/api/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      spec: createDefaultSpec(),
      query: "table tennis",
      search_mode: "live",
      max_results: 1,
      enable_content_fetch: false,
    }),
  });
  check("production blocks request-level live search", productionBlocked.status === 403, `status=${productionBlocked.status}`);
  if (originalNodeEnv === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = originalNodeEnv;
  }

  const testRadarNamePrefix = "Milestone M live复跑验收";
  const existingRadarsResponse = await app.request("/api/radars?scope=mine");
  const existingRadarsJson = await existingRadarsResponse.json() as {
    success?: boolean;
    data?: Array<{ id: string; name?: string; isBuiltin?: boolean }>;
  };
  if (existingRadarsJson.success && Array.isArray(existingRadarsJson.data)) {
    for (const radar of existingRadarsJson.data) {
      if (radar.name?.startsWith(testRadarNamePrefix) && radar.isBuiltin !== true) {
        await app.request(`/api/radars/${radar.id}`, { method: "DELETE" });
      }
    }
  }
  const quotaRadarsResponse = await app.request("/api/radars?scope=mine");
  const quotaRadarsJson = await quotaRadarsResponse.json() as {
    success?: boolean;
    data?: Array<{ id: string; name?: string; status?: string; isBuiltin?: boolean; createdAt?: string }>;
  };
  const activeCustomRadars = (quotaRadarsJson.data ?? [])
    .filter((radar) => radar.isBuiltin !== true && radar.status !== "archived")
    .sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
  if (activeCustomRadars.length >= 3) {
    const target = activeCustomRadars[0];
    const deleteResponse = await app.request(`/api/radars/${target.id}`, { method: "DELETE" });
    const afterDeleteResponse = await app.request("/api/radars?scope=mine");
    const afterDeleteJson = await afterDeleteResponse.json() as {
      success?: boolean;
      data?: Array<{ id: string; status?: string; isBuiltin?: boolean }>;
    };
    const afterActiveCount = (afterDeleteJson.data ?? []).filter((radar) => radar.isBuiltin !== true && radar.status !== "archived").length;
    check(
      "live verification releases a custom radar quota slot when full",
      deleteResponse.status === 200 && afterActiveCount < activeCustomRadars.length,
      `deleted=${target.name || target.id}, before=${activeCustomRadars.length}, after=${afterActiveCount}`,
    );
  }

  const liveRerunSpec = buildTableTennisSpec(createDefaultSpec, now);
  const liveRadarCreateResponse = await app.request("/api/radars", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: `${testRadarNamePrefix} ${Date.now()}`,
      kind: "custom",
      spec: liveRerunSpec,
      preferredSearchMode: "live",
    }),
  });
  const liveRadarCreateJson = await liveRadarCreateResponse.json() as {
    success?: boolean;
    data?: { id?: string; preferredSearchMode?: string };
    error?: { message?: string };
  };
  const liveRadarId = liveRadarCreateJson.data?.id ?? "";
  check("saved live radar create endpoint returns 200", liveRadarCreateResponse.status === 200, `status=${liveRadarCreateResponse.status}, error=${sanitize(liveRadarCreateJson.error?.message)}`);
  check("saved live radar persists preferred live mode", liveRadarCreateJson.data?.preferredSearchMode === "live", JSON.stringify(liveRadarCreateJson.data ?? {}));

  if (liveRadarId) {
    const activateResponse = await app.request(`/api/radars/${liveRadarId}/activate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    check("saved live radar activates", activateResponse.status === 200, `status=${activateResponse.status}`);

    const nodeEnvBeforeRadarRun = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    const productionRunResponse = await app.request(`/api/radars/${liveRadarId}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const productionRunJson = await productionRunResponse.json() as { success?: boolean; error?: { message?: string } };
    check(
      "production blocks persisted live radar rerun without explicit switch",
      productionRunResponse.status !== 200 && productionRunJson.success !== true && /真实搜索未开启|LIVE_SEARCH_DISABLED/.test(productionRunJson.error?.message ?? ""),
      `status=${productionRunResponse.status}, message=${sanitize(productionRunJson.error?.message)}`,
    );
    if (nodeEnvBeforeRadarRun === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = nodeEnvBeforeRadarRun;
    }

    const runIds: string[] = [];
    const reportIds: string[] = [];
    for (const attempt of [1, 2]) {
      const runResponse = await app.request(`/api/radars/${liveRadarId}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const runJson = await runResponse.json() as {
        success?: boolean;
        data?: {
          run?: { id?: string; reportId?: string };
          opportunityCards?: OpportunityCard[];
          rawCandidates?: Array<{ title: string; url: string; sourceDomain: string }>;
          sourceCoverage?: unknown[];
          sourceHintChecks?: unknown[];
          candidateAccounting?: unknown;
          executionLog?: {
            openedUrls?: Array<{ url: string; status: string; errorType?: string; fetchedAt: string }>;
            queryExecutions?: Array<{ provider: string; status: string; rawResultCount: number }>;
          };
        };
        error?: { message?: string };
      };
      const runId = runJson.data?.run?.id ?? "";
      if (runId) runIds.push(runId);
      check(`saved live radar rerun ${attempt} returns 200`, runResponse.status === 200, `status=${runResponse.status}, error=${sanitize(runJson.error?.message)}`);
      check(`saved live radar rerun ${attempt} succeeds`, runJson.success === true, sanitize(runJson.error?.message));
      check(`saved live radar rerun ${attempt} uses live evidence`, liveRunHasEvidence(runJson.data), JSON.stringify(runJson.data?.executionLog?.queryExecutions ?? []));

      const report = await generateBoundReport(app, liveRadarId, liveRerunSpec, runJson.data ?? {});
      if (report.reportId) reportIds.push(report.reportId);
      check(`saved live radar rerun ${attempt} report returns 200`, report.status === 200, `status=${report.status}, error=${sanitize(report.error)}`);
      check(`saved live radar rerun ${attempt} report is bound`, Boolean(report.reportId), report.markdown.slice(0, 120));
      check(`saved live radar rerun ${attempt} report keeps trust sections`, hasRequiredTrustSections(report.markdown));
      check(`saved live radar rerun ${attempt} report does not overclaim verified facts`, !/已确认(报名资格|费用|截止日期|版权义务)/.test(report.markdown));

      const runsResponse = await app.request(`/api/radars/${liveRadarId}/runs?limit=10`);
      const runsJson = await runsResponse.json() as { success?: boolean; data?: Array<{ id: string; reportId?: string }> };
      const boundRun = (runsJson.data ?? []).find((run) => run.id === runId);
      check(`saved live radar rerun ${attempt} writes RadarRun.reportId`, boundRun?.reportId === report.reportId, JSON.stringify(boundRun ?? {}));
    }

    const reportsResponse = await app.request(`/api/reports?radar_id=${liveRadarId}`);
    const reportsJson = await reportsResponse.json() as { success?: boolean; data?: Array<{ id: string; runId?: string }> };
    const historyReports = reportsJson.data ?? [];
    check("saved live radar rerun creates two distinct runs", new Set(runIds).size === 2, runIds.join(", "));
    check("saved live radar rerun creates two distinct reports", new Set(reportIds).size === 2, reportIds.join(", "));
    check("saved live radar report history includes rerun reports", reportIds.every((id) => historyReports.some((report) => report.id === id)), JSON.stringify(historyReports));

    await app.request(`/api/radars/${liveRadarId}`, { method: "DELETE" });
  }

  const mixedQualityResults: SearchResult[] = [
    {
      title: "WTT Champions 2026 报名入口",
      url: "https://worldtabletennis.com/eventInfo?eventId=123",
      snippet: "官方公告：报名入口开放，选手可查看参赛要求和赛程。",
      source_provider: "test_live_quality",
      source_type: "web",
    },
    {
      title: "乒乓球比赛规则介绍",
      url: "https://rules.example.local/table-tennis-rules",
      snippet: "泛资讯页面：介绍乒乓球比赛规则和历史。",
      source_provider: "test_live_quality",
      source_type: "web",
    },
    {
      title: "精彩乒乓球比赛视频集锦 - YouTube",
      url: "https://youtube.com/playlist?list=test",
      snippet: "视频合集，不含报名或申请入口。",
      source_provider: "test_live_quality",
      source_type: "web",
    },
    {
      title: "2026 全国乒乓球赛事通知",
      url: "https://www.ctta.cn/ssxx/2026-notice.html",
      snippet: "中国乒协官方公告：赛事通知、赛程和报名安排。",
      source_provider: "test_live_quality",
      source_type: "web",
    },
    {
      title: "乒乓球升段和入门指南 - 知乎专栏",
      url: "https://zhuanlan.zhihu.com/p/table-tennis-guide",
      snippet: "科普介绍乒乓球升段与基础知识，不含报名或申请入口。",
      source_provider: "test_live_quality",
      source_type: "web",
    },
    {
      title: "乒乓球新闻_新浪竞技风暴 - 体育",
      url: "https://sports.sina.com.cn/others/pingpang/",
      snippet: "门户资讯聚合页面，不是官方赛事通知或报名入口。",
      source_provider: "test_live_quality",
      source_type: "web",
    },
    {
      title: "乒乓球培训广告",
      url: "https://training.example.local/table-tennis-camp",
      snippet: "培训班招生广告，不是正式赛事机会。",
      source_provider: "test_live_quality",
      source_type: "web",
    },
  ];
  const qualityProvider: SearchProvider = {
    name: "test_live_quality",
    display_name: "Test Live Quality",
    source_type: "web",
    reliability: "A",
    enabled: true,
    radar_types: ["custom"],
    async search() {
      return mixedQualityResults;
    },
    async healthCheck() {
      return true;
    },
  };
  providerRegistry.register(qualityProvider);
  try {
    const qualitySpec = createDefaultSpec();
    qualitySpec.client_profile.business_type = "乒乓球选手";
    qualitySpec.core_goals.primary_goal = "寻找可报名的乒乓球比赛";
    qualitySpec.core_goals.action_intent = ["报名比赛"];
    qualitySpec.opportunity_scope.primary_opportunity_types = ["乒乓球比赛", "赛事通知", "报名窗口"];
    qualitySpec.keyword_strategy.core_keywords_zh = ["乒乓球", "比赛", "报名", "赛事通知"];
    qualitySpec.filter_rules.must_exclude = ["培训广告"];
    setConfirmed(qualitySpec, now);
    const qualitySearch = await new SearchOrchestrator({
      llmAdapter: new ModelRouter(),
      dataMode: "live",
      enableContentFetch: false,
      maxResultsPerProvider: 5,
    }).search(qualitySpec, "乒乓球 比赛 报名", { primary: ["test_live_quality"], fallback: [] });
    const qualityCards = qualitySearch.opportunityCards ?? [];
    const qualityCardText = qualityCards.map(cardText).join(" | ");
    const rawLowAction = qualitySearch.rawCandidates?.filter((candidate) =>
      lowActionText(`${candidate.title} ${candidate.url} ${candidate.snippet ?? ""}`),
    ) ?? [];
    check("quality filter keeps low-action pages in raw candidates", rawLowAction.length >= 2, JSON.stringify(qualitySearch.rawCandidates ?? []));
    check("quality filter removes low-action pages from key opportunity cards", qualityCards.length > 0 && qualityCards.every((card) => !lowActionText(cardText(card))), qualityCardText);
    check("quality filter keeps action-oriented cards", qualityCards.some((card) => actionSignalText(cardText(card))), qualityCardText);
    const qualityReportResponse = await app.request("/api/reports/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        spec: qualitySpec,
        radar_type: "custom",
        opportunities: qualityCards,
        candidateAccounting: qualitySearch.candidateAccounting,
        executionLog: qualitySearch.executionLog,
        rawCandidates: qualitySearch.rawCandidates,
      }),
    });
    const qualityReportJson = await qualityReportResponse.json() as { success?: boolean; data?: { markdown?: string } };
    const qualityMarkdown = qualityReportJson.data?.markdown ?? "";
    check("quality report separates low-action observation sources", qualityReportJson.success === true && qualityMarkdown.includes("### 低行动性观察来源"));
    check("quality report keeps low-action pages out of recommended opportunity titles", !qualityCards.some((card) => lowActionText(titleOf(card))), qualityCardText);
  } finally {
    providerRegistry.unregister("test_live_quality");
  }

  const scenarios: LiveScenario[] = [
    {
      id: "table-tennis",
      label: "乒乓球选手 WTT / ITTF",
      query: "乒乓球 比赛 报名 WTT ITTF 2026",
      expectedDomains: ["ittf.com", "worldtabletennis.com"],
      buildSpec(base, timestamp) {
        base.client_profile.client_type = "个人";
        base.client_profile.industry = "体育";
        base.client_profile.business_type = "乒乓球选手";
        base.client_profile.regions = ["中国", "国际"];
        base.core_goals.primary_goal = "寻找未来30天内可报名的乒乓球比赛";
        base.core_goals.action_intent = ["报名比赛"];
        base.core_goals.priority_order = ["WTT", "ITTF", "中国乒协"];
        base.opportunity_scope.primary_opportunity_types = ["乒乓球比赛", "公开赛", "报名窗口"];
        base.region_scope.primary_regions = ["中国", "国际"];
        base.region_scope.global_allowed = true;
        base.keyword_strategy.core_keywords_zh = ["乒乓球", "比赛", "报名"];
        base.keyword_strategy.core_keywords_en = ["table tennis", "WTT", "ITTF"];
        base.filter_rules.must_exclude = ["培训广告"];
        addSources(base, timestamp, [
          { name: "WTT", url: "https://worldtabletennis.com/" },
          { name: "ITTF", url: "https://www.ittf.com/" },
        ], ["中国乒协官网"]);
        setConfirmed(base, timestamp);
        return base;
      },
    },
    {
      id: "go",
      label: "围棋选手国内外棋院",
      query: "site:nihonkiin.or.jp 囲碁 大会 2026",
      expectedDomains: ["nihonkiin.or.jp", "intergofed.org", "baduk.or.kr", "imsa.cn"],
      buildSpec(base, timestamp) {
        base.client_profile.client_type = "个人";
        base.client_profile.industry = "体育";
        base.client_profile.business_type = "围棋选手";
        base.client_profile.regions = ["中国", "日本", "韩国", "国际"];
        base.core_goals.primary_goal = "寻找未来30天内可报名或值得关注的围棋比赛";
        base.core_goals.action_intent = ["报名比赛", "保存观察"];
        base.core_goals.priority_order = ["中国围棋协会", "日本棋院", "韩国棋院", "国际围棋联盟"];
        base.opportunity_scope.primary_opportunity_types = ["围棋公开赛", "职业定段赛", "奖金赛事"];
        base.region_scope.primary_regions = ["中国", "日本", "韩国", "国际"];
        base.region_scope.global_allowed = true;
        base.keyword_strategy.core_keywords_zh = ["围棋", "囲碁", "大会", "比赛", "报名", "公开赛"];
        base.keyword_strategy.core_keywords_en = ["go tournament", "baduk", "weiqi"];
        base.filter_rules.must_exclude = ["培训广告"];
        addSources(base, timestamp, [
          { name: "日本棋院", url: "https://www.nihonkiin.or.jp/" },
          { name: "韩国棋院", url: "https://www.baduk.or.kr/" },
          { name: "国际围棋联盟", url: "https://www.intergofed.org/" },
        ], ["中国围棋协会"]);
        setConfirmed(base, timestamp);
        return base;
      },
    },
  ];

  for (const scenario of scenarios) {
    const spec = scenario.buildSpec(createDefaultSpec(), now);
    const searchResponse = await app.request("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        spec,
        query: scenario.query,
        search_mode: "live",
        max_results: 3,
        enable_content_fetch: true,
      }),
    });
    const searchJson = await searchResponse.json() as {
      success?: boolean;
      data?: {
        opportunityCards?: OpportunityCard[];
        rawCandidates?: Array<{ title: string; url: string; sourceDomain: string }>;
        sourceHintChecks?: unknown[];
        sourceCoverage?: unknown[];
        candidateAccounting?: unknown;
        executionLog?: {
          openedUrls?: Array<{ url: string; status: string; errorType?: string; fetchedAt: string }>;
          queryExecutions?: Array<{ provider: string; status: string; rawResultCount: number }>;
        };
      };
      error?: { message?: string };
    };
    const cards = searchJson.data?.opportunityCards ?? [];
    const rawCandidates = searchJson.data?.rawCandidates ?? [];
    const domains = rawCandidates.map((candidate) => candidate.sourceDomain).filter(Boolean);
    const firstTitle = titleOf(cards[0]);

    check(`${scenario.label}: product /api/search returns 200`, searchResponse.status === 200, `status=${searchResponse.status}, error=${sanitize(searchJson.error?.message)}`);
    check(`${scenario.label}: product /api/search succeeds`, searchJson.success === true, sanitize(searchJson.error?.message));
    check(`${scenario.label}: live product path returns raw candidates`, rawCandidates.length > 0, `rawCandidates=${rawCandidates.length}`);
    check(`${scenario.label}: raw candidates include sourceDomain`, domains.length === rawCandidates.length && domains.length > 0, domains.join(", "));
    check(`${scenario.label}: live product path does not return mock/example URLs`, rawCandidates.every((candidate) => !hasMockOrExampleUrl(candidate.url)));
    check(`${scenario.label}: opportunity cards include real URL`, cards.some((card) => /^https?:\/\//.test(card.official_source_url || "")));
    check(`${scenario.label}: opportunity cards are live and not demo`, cards.length > 0 && cards.every((card) => card.data_mode === "live" && card.is_demo_data !== true));
    check(`${scenario.label}: source status stays待复核`, cards.every((card) => card.evidence_status !== "confirmed" && card.verificationStatus !== "verified"));
    check(`${scenario.label}: key opportunity cards exclude low-action pages`, cards.slice(0, 5).every((card) => !lowActionText(cardText(card))), cards.slice(0, 5).map(cardText).join(" | "));
    check(`${scenario.label}: key opportunity cards keep action signals`, cards.slice(0, 5).some((card) => actionSignalText(cardText(card))), cards.slice(0, 5).map(cardText).join(" | "));
    check(`${scenario.label}: result has one expected source family`, domains.some((domain) => scenario.expectedDomains.some((expected) => domain.includes(expected))), domains.join(", "));
    const openedUrls = searchJson.data?.executionLog?.openedUrls ?? [];
    check(`${scenario.label}: live evidence attempts at most first 5 URLs`, openedUrls.length > 0 && openedUrls.length <= 5, `opened=${openedUrls.length}`);
    check(`${scenario.label}: openedUrls record fetch outcome`, openedUrls.every((item) => ["succeeded", "partial", "failed"].includes(item.status) && !!item.fetchedAt));
    const firstCard = cards[0];
    check(`${scenario.label}: first card has field-level evidence`, (firstCard?.field_evidence ?? []).length >= REQUIRED_FIELD_EVIDENCE.length, fieldEvidenceFields(firstCard).join(", "));
    check(`${scenario.label}: first card covers required evidence fields`, REQUIRED_FIELD_EVIDENCE.every((field) => fieldEvidenceFields(firstCard).includes(field)), fieldEvidenceFields(firstCard).join(", "));
    check(`${scenario.label}: field evidence statuses use MVP vocabulary`, fieldEvidenceStatuses(firstCard).every((status) => ALLOWED_FIELD_STATUSES.includes(status as FieldEvidenceStatus)), fieldEvidenceStatuses(firstCard).join(", "));
    check(`${scenario.label}: search snippets alone are not marked verified for action fields`, (firstCard?.field_evidence ?? [])
      .filter((item) => ["registration_or_application_signal", "date_or_deadline", "fee", "eligibility", "contact_or_application_route"].includes(item.field))
      .every((item) => item.status !== "verified"));

    const reportResponse = await app.request("/api/reports/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        spec,
        radar_type: "custom",
        opportunities: cards.slice(0, 3),
        sourceHintChecks: searchJson.data?.sourceHintChecks ?? searchJson.data?.sourceCoverage,
        candidateAccounting: searchJson.data?.candidateAccounting,
        executionLog: searchJson.data?.executionLog,
        rawCandidates,
      }),
    });
    const reportJson = await reportResponse.json() as {
      success?: boolean;
      data?: { markdown?: string };
      error?: { message?: string };
    };
    const markdown = reportJson.data?.markdown ?? "";

    check(`${scenario.label}: report endpoint returns 200`, reportResponse.status === 200, `status=${reportResponse.status}`);
    check(`${scenario.label}: report succeeds`, reportJson.success === true, sanitize(reportJson.error?.message));
    check(`${scenario.label}: report includes live opportunity title`, firstTitle.length > 0 && markdown.includes(firstTitle), firstTitle);
    check(`${scenario.label}: report separates searched sources`, markdown.includes("### 搜索到的来源"));
    check(`${scenario.label}: report separates verified facts`, markdown.includes("### 字段已核验事实"));
    check(`${scenario.label}: report separates model judgment`, markdown.includes("### 模型判断"));
    check(`${scenario.label}: report separates review items`, markdown.includes("### 待复核项"));
    check(`${scenario.label}: report separates failed sources`, markdown.includes("### 失败来源"));
    check(`${scenario.label}: report separates unchecked sources`, markdown.includes("### 未检查来源"));
    check(`${scenario.label}: report does not claim demo/mock data`, !markdown.includes("演示 / 测试数据") && !markdown.includes("未真实联网搜索"));
    check(`${scenario.label}: report does not claim verified eligibility or fees`, !/已确认(报名资格|费用|截止日期|版权义务)/.test(markdown));

    const providerSummary = (searchJson.data?.executionLog?.queryExecutions ?? [])
      .map((item) => `${item.provider}:${item.status}:${item.rawResultCount}`)
      .join(", ");
    console.log(`LIVE ${scenario.id} provider summary: ${providerSummary}`);
    console.log(`LIVE ${scenario.id} sample title: ${firstTitle}`);
    console.log(`LIVE ${scenario.id} sample domains: ${domains.slice(0, 5).join(", ")}`);
  }

  console.log(`live MVP verification: ${passed} PASS / ${failed} FAIL`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  check("live MVP script completes", false, sanitize(err));
  console.log(`live MVP verification: ${passed} PASS / ${failed} FAIL`);
  process.exit(1);
});
