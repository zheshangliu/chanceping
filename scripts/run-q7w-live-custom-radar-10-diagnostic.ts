import fs from "fs";
import path from "path";
import { loadLocalApiEnv } from "../src/config/local-env";
import type { AppContext } from "../src/api/context";
import type { ApiResponse } from "../src/api/types";
import type { RadarRequirementSpec } from "../src/schema/radar-requirement-spec";
import type { OpportunityCard } from "../src/schema/opportunity-card";

type Scenario = {
  id: string;
  label: string;
  familiarity: "new_user" | "normal_user" | "power_user";
  input: string;
  expectedKeywords: string[];
  negativePatterns?: RegExp[];
};

type ScenarioStatus = "pass" | "near_pass" | "fail";

type ScenarioResult = {
  id: string;
  label: string;
  familiarity: Scenario["familiarity"];
  status: ScenarioStatus;
  failureClass: string;
  generatedName: string;
  radarId: string;
  runId: string;
  reportId: string;
  runStatus: string;
  cardCount: number;
  storedEntryCount: number;
  rawCandidateCount: number;
  reportLength: number;
  reasons: string[];
  firstCards: string[];
};

type ImportedModules = {
  createApp: (context?: AppContext) => { request: (url: string, init?: RequestInit) => Promise<Response> | Response };
  createAdapter: () => AppContext["llmAdapter"];
  LocalFileStore: new (options: { file_path: string }) => AppContext["store"];
  StarManager: new (store: AppContext["store"]) => AppContext["starManager"];
  LocalWatchStore: new (options: { file_path: string }) => AppContext["watchStore"];
  JsonRadarStore: new (options?: { file_path?: string }) => AppContext["radarStore"];
  JsonRadarRunStore: new (options?: { file_path?: string }) => AppContext["radarRunStore"];
  RadarRegistry: new (store: AppContext["radarStore"]) => AppContext["radarRegistry"];
  JsonReportStore: new (options?: { file_path?: string }) => AppContext["reportStore"];
  providerRegistry: { get: (name: string) => { mockMode?: boolean; healthCheck?: () => Promise<boolean> } | undefined };
};

const REPORT_FILE = "Q7W_Live_Custom_Radar_10_Diagnostic.md";
const TEMP_PREFIX = `q7w-live-custom-radar-10-${Date.now()}`;
const TEMP_FILES = {
  radars: `data/radars-${TEMP_PREFIX}.json`,
  runs: `data/radar-runs-${TEMP_PREFIX}.json`,
  opportunities: `data/opportunities-${TEMP_PREFIX}.json`,
  watchRules: `data/watch-rules-${TEMP_PREFIX}.txt`,
  reports: `data/report-index-${TEMP_PREFIX}.json`,
};

const SCENARIOS: Scenario[] = [
  {
    id: "heritage-embroidery",
    label: "广绣非遗传承人",
    familiarity: "new_user",
    input: "我是在广州从事广绣的非遗传承人，我想找订购广绣订单需求的客户，看看有没有项目采购、文旅合作、企业礼品定制或者展陈委托机会。",
    expectedKeywords: ["广绣", "非遗", "文旅", "礼品", "展陈"],
    negativePatterns: [/AI\s*赛事|Hackathon|开发者挑战/i],
  },
  {
    id: "aigc-marketing",
    label: "广州 AIGC 宣传服务商",
    familiarity: "normal_user",
    input: "我是在广州从事 AIGC 创意服务的创业者，想找企业客户用 AI 做宣传片、海报、短视频、展会物料和品牌内容的项目机会，最好是广州或大湾区。",
    expectedKeywords: ["AIGC", "宣传", "企业", "品牌", "广州"],
    negativePatterns: [/AI\s*赛事|Hackathon|学生比赛/i],
  },
  {
    id: "employee-benefits",
    label: "员工福利供应商",
    familiarity: "power_user",
    input: "我们做员工福利和节日礼品供应，想找广东和香港未来 60 天企业福利采购、工会福利项目、节日礼品招标，排除加盟广告和纯招商信息。",
    expectedKeywords: ["员工福利", "节日礼品", "工会", "采购", "招标"],
    negativePatterns: [/招聘|求职|AI\s*赛事/i],
  },
  {
    id: "pet-funeral",
    label: "宠物殡葬服务",
    familiarity: "new_user",
    input: "我们是宠物殡葬和宠物纪念服务公司，想找宠物医院合作、宠物展曝光、品牌联名和社区活动机会。",
    expectedKeywords: ["宠物", "殡葬", "纪念", "医院", "合作"],
    negativePatterns: [/AI\s*赛事|Hackathon/i],
  },
  {
    id: "industrial-dust",
    label: "工业除尘设备商",
    familiarity: "normal_user",
    input: "我们做工业除尘和废气治理设备，想找环保项目招标、园区改造、制造业绿色转型、设备采购和供应商投标机会。",
    expectedKeywords: ["工业", "除尘", "废气", "环保", "招标"],
    negativePatterns: [/普通装修|AI\s*赛事|学生比赛/i],
  },
  {
    id: "eldercare",
    label: "养老院运营服务商",
    familiarity: "new_user",
    input: "我们是养老院运营服务商，想找政府购买服务、康养合作、机构采购、社区养老和适老化项目机会。",
    expectedKeywords: ["养老", "康养", "政府购买", "社区", "采购"],
    negativePatterns: [/AI\s*赛事|Hackathon/i],
  },
  {
    id: "ev-charging",
    label: "新能源充电桩安装",
    familiarity: "normal_user",
    input: "我们做新能源充电桩安装和运维，想找物业、园区、商场、停车场和政府项目合作机会，优先广东。",
    expectedKeywords: ["充电桩", "物业", "园区", "停车场", "政府"],
    negativePatterns: [/AI\s*赛事|宠物/i],
  },
  {
    id: "eap",
    label: "企业心理咨询 EAP",
    familiarity: "power_user",
    input: "我们做企业心理咨询和 EAP 服务，想找企业员工关怀采购、工会福利、HR 服务商合作、园区企业合作和培训项目机会。",
    expectedKeywords: ["心理咨询", "EAP", "员工关怀", "HR", "园区"],
    negativePatterns: [/AI\s*赛事|宠物|学生比赛/i],
  },
  {
    id: "camping-brand",
    label: "城市露营装备品牌",
    familiarity: "new_user",
    input: "我们是城市露营装备品牌，想找渠道商、市集、户外展、商场快闪和品牌联名机会。",
    expectedKeywords: ["露营", "渠道", "市集", "户外展", "快闪"],
    negativePatterns: [/AI\s*赛事|Hackathon/i],
  },
  {
    id: "campus-catering",
    label: "校园团餐供应商",
    familiarity: "normal_user",
    input: "我们做校园团餐和食堂供应，想找学校食堂采购、团餐招标、供应商入库和教育后勤合作机会。",
    expectedKeywords: ["校园", "团餐", "食堂", "招标", "供应商"],
    negativePatterns: [/AI\s*赛事|学生比赛|Hackathon/i],
  },
];

function cleanupTempFiles(): void {
  for (const file of Object.values(TEMP_FILES)) {
    const abs = path.resolve(process.cwd(), file);
    if (fs.existsSync(abs)) fs.unlinkSync(abs);
  }
}

function prepareLiveEnv(): void {
  process.env.CHANCEPING_LOAD_API_ENV = "true";
  const envResult = loadLocalApiEnv({ enabled: true });
  if (!envResult.loaded) {
    throw new Error(`api.env 未加载，不能运行 live 诊断：${envResult.reason}`);
  }
  process.env.CHANCEPING_ENABLE_LOCAL_LIVE_SEARCH = "true";
  process.env.CHANCEPING_ENABLE_LOCAL_LIVE_LLM = "true";
  process.env.CHANCEPING_LLM_PROFILE = process.env.CHANCEPING_LLM_PROFILE || "contest";
  process.env.LLM_MODE = "live";
  process.env.DATA_MODE = "live";
  process.env.STORE_TYPE = "local";
  process.env.NODE_ENV = process.env.NODE_ENV === "production" ? "development" : process.env.NODE_ENV;
}

async function importAfterEnv(): Promise<ImportedModules> {
  const [
    { createApp },
    { createAdapter },
    { LocalFileStore },
    { StarManager },
    { LocalWatchStore },
    { JsonRadarStore, JsonRadarRunStore },
    { RadarRegistry },
    { JsonReportStore },
    { providerRegistry },
  ] = await Promise.all([
    import("../src/api/app"),
    import("../src/agents/model-router"),
    import("../src/agents/opportunity-store"),
    import("../src/agents/star-manager"),
    import("../src/watch/watch-store"),
    import("../src/agents/radar-store"),
    import("../src/agents/radar-registry"),
    import("../src/agents/report-store"),
    import("../src/search/provider-registry"),
  ]);
  return {
    createApp,
    createAdapter,
    LocalFileStore,
    StarManager,
    LocalWatchStore,
    JsonRadarStore,
    JsonRadarRunStore,
    RadarRegistry,
    JsonReportStore,
    providerRegistry,
  };
}

async function createLiveDiagnosticContext(modules: ImportedModules): Promise<AppContext> {
  cleanupTempFiles();
  const store = new modules.LocalFileStore({ file_path: TEMP_FILES.opportunities });
  store.load();
  const radarStore = new modules.JsonRadarStore({ file_path: TEMP_FILES.radars });
  const radarRunStore = new modules.JsonRadarRunStore({ file_path: TEMP_FILES.runs });
  const radarRegistry = new modules.RadarRegistry(radarStore);
  radarRegistry.initialize();
  return {
    llmAdapter: modules.createAdapter(),
    store,
    starManager: new modules.StarManager(store),
    watchStore: new modules.LocalWatchStore({ file_path: TEMP_FILES.watchRules }),
    conversations: new Map(),
    radarStore,
    radarRunStore,
    radarRegistry,
    reportStore: new modules.JsonReportStore({ file_path: TEMP_FILES.reports }),
  };
}

async function assertLiveProviders(modules: ImportedModules): Promise<void> {
  const serper = modules.providerRegistry.get("serper");
  if (!serper) throw new Error("serper provider 未注册，不能运行 live 诊断");
  if (serper.mockMode === true) throw new Error("serper provider 处于 mockMode，不能运行 live 诊断");
  if (serper.healthCheck && !(await serper.healthCheck())) {
    throw new Error("serper provider healthCheck 失败，不能运行 live 诊断");
  }
}

async function parseResponse(res: Response): Promise<ApiResponse> {
  const text = await res.text();
  try {
    return JSON.parse(text) as ApiResponse;
  } catch {
    throw new Error(`响应不是 JSON: status=${res.status}, body=${text.slice(0, 260)}`);
  }
}

async function postJson(app: ReturnType<ImportedModules["createApp"]>, url: string, body: unknown, userId: string): Promise<{ res: Response; json: ApiResponse }> {
  const res = await Promise.resolve(app.request(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-ChancePing-User-Id": userId,
    },
    body: JSON.stringify(body),
  }));
  return { res, json: await parseResponse(res) };
}

async function getJson(app: ReturnType<ImportedModules["createApp"]>, url: string, userId: string): Promise<{ res: Response; json: ApiResponse }> {
  const res = await Promise.resolve(app.request(url, {
    method: "GET",
    headers: { "X-ChancePing-User-Id": userId },
  }));
  return { res, json: await parseResponse(res) };
}

function confirmSpec(spec: RadarRequirementSpec): RadarRequirementSpec {
  return {
    ...spec,
    confirmation_status: {
      ...spec.confirmation_status,
      status: "confirmed",
      user_confirmed: true,
      confirmed_at: new Date().toISOString(),
    },
  };
}

function textContainsAny(text: string, keywords: string[]): boolean {
  const normalized = text.toLowerCase();
  return keywords.some((keyword) => normalized.includes(keyword.toLowerCase()));
}

function matchesNegativePattern(text: string, patterns: RegExp[] = []): string[] {
  return patterns.filter((pattern) => pattern.test(text)).map((pattern) => pattern.source);
}

function customerVisibleProviderLeak(text: string): boolean {
  return /DeepSeek|Serper|Live\s+LLM\s+profile|LLM\s+profile|source_provider|sourceProvider|provider\s*[:：]|API\s*Key/i.test(text);
}

function generatedRadarIntentText(data: {
  suggestedName?: string;
  spec?: RadarRequirementSpec;
  radarVersion?: unknown;
  profileSummary?: unknown;
}): string {
  const spec = data.spec;
  return JSON.stringify({
    suggestedName: data.suggestedName,
    primaryGoal: spec?.core_goals?.primary_goal,
    actionIntent: spec?.core_goals?.action_intent,
    primaryOpportunityTypes: spec?.opportunity_scope?.primary_opportunity_types,
    secondaryOpportunityTypes: spec?.opportunity_scope?.secondary_opportunity_types,
    coreKeywordsZh: spec?.keyword_strategy?.core_keywords_zh,
    coreKeywordsEn: spec?.keyword_strategy?.core_keywords_en,
    highPrioritySignals: spec?.filter_rules?.high_priority_signals,
    profileSummary: data.profileSummary,
    radarVersion: data.radarVersion
      ? {
          name: (data.radarVersion as { name?: unknown }).name,
          oneSentencePositioning: (data.radarVersion as { oneSentencePositioning?: unknown }).oneSentencePositioning,
          opportunityIntents: (data.radarVersion as { opportunityIntents?: unknown }).opportunityIntents,
          highValueCriteria: (data.radarVersion as { highValueCriteria?: unknown }).highValueCriteria,
        }
      : undefined,
  });
}

function visibleCardIntentText(cards: OpportunityCard[]): string {
  return JSON.stringify(cards.slice(0, 5).map((card) => ({
    title: card.title,
    type: card.type,
    opportunity_kind: card.opportunity_kind,
    match_reason: card.match_reason,
    next_action: card.next_action,
    source: card.official_source_url,
  })));
}

function inferFailureClass(reasons: string[]): string {
  const joined = reasons.join("\n");
  if (/生成雷达失败|没有生成 RadarRequirementSpec|误入 AI 赛事|未体现行业关键词/.test(joined)) return "radar_generation_mismatch";
  if (/运行雷达失败|运行状态不是 succeeded|runOutcome failed|LIVE_PROVIDER|搜索/.test(joined)) return "live_search_failed";
  if (/响应不是 JSON|网页错误页|HTML|timeout|超时/i.test(joined)) return "html_or_timeout_response";
  if (/没有返回机会卡|没有足够有效机会/.test(joined)) return "no_cards";
  if (/机会没有按 radarId 入库/.test(joined)) return "not_stored";
  if (/Markdown 报告没有包含/.test(joined)) return "report_missing_card_title";
  if (customerVisibleProviderLeak(joined)) return "provider_name_leak";
  return "unknown";
}

function statusFromChecks(reasons: string[], hardFailure: boolean): ScenarioStatus {
  if (hardFailure) return "fail";
  return reasons.some((reason) => reason.startsWith("WARN:")) ? "near_pass" : "pass";
}

async function runScenario(app: ReturnType<ImportedModules["createApp"]>, scenario: Scenario, index: number): Promise<ScenarioResult> {
  const userId = `q7w_live_${Date.now()}_${index}_${scenario.id}`;
  const reasons: string[] = [];
  let hardFailure = false;
  let generatedName = "";
  let radarId = "";
  let runId = "";
  let reportId = "";
  let runStatus = "";
  let cardCount = 0;
  let storedEntryCount = 0;
  let rawCandidateCount = 0;
  let reportLength = 0;
  let firstCards: string[] = [];

  try {
    const generated = await postJson(app, "/api/radars/generate", { description: scenario.input }, userId);
    if (generated.res.status !== 200 || generated.json.success !== true) {
      return {
        id: scenario.id,
        label: scenario.label,
        familiarity: scenario.familiarity,
        status: "fail",
        failureClass: "radar_generation_mismatch",
        generatedName,
        radarId,
        runId,
        reportId,
        runStatus,
        cardCount,
        storedEntryCount,
        rawCandidateCount,
        reportLength,
        reasons: [`生成雷达失败: status=${generated.res.status}, message=${generated.json.error?.message ?? ""}`],
        firstCards,
      };
    }

    const generatedData = generated.json.data as {
      spec?: RadarRequirementSpec;
      suggestedName?: string;
      radarVersion?: unknown;
      profileSummary?: unknown;
    };
    const spec = generatedData?.spec ? confirmSpec(generatedData.spec) : null;
    generatedName = generatedData?.suggestedName ?? "";
    const generatedText = JSON.stringify({
      suggestedName: generatedData?.suggestedName,
      spec: generatedData?.spec,
      radarVersion: generatedData?.radarVersion,
      profileSummary: generatedData?.profileSummary,
    });
    const generatedIntentText = generatedRadarIntentText(generatedData);

    if (!spec) {
      hardFailure = true;
      reasons.push("没有生成 RadarRequirementSpec");
    }
    if (!textContainsAny(generatedText, scenario.expectedKeywords)) {
      hardFailure = true;
      reasons.push(`未体现行业关键词: ${scenario.expectedKeywords.join(" / ")}`);
    }
    const generatedNegativeHits = matchesNegativePattern(`${generatedName}\n${generatedIntentText}`, scenario.negativePatterns);
    if (generatedNegativeHits.length > 0) {
      hardFailure = true;
      reasons.push(`生成雷达疑似偏题: ${generatedNegativeHits.join(", ")}`);
    }
    if (!spec) {
      return {
        id: scenario.id,
        label: scenario.label,
        familiarity: scenario.familiarity,
        status: "fail",
        failureClass: inferFailureClass(reasons),
        generatedName,
        radarId,
        runId,
        reportId,
        runStatus,
        cardCount,
        storedEntryCount,
        rawCandidateCount,
        reportLength,
        reasons,
        firstCards,
      };
    }

    const created = await postJson(app, "/api/radars", {
      name: generatedName || `${scenario.label}机会雷达`,
      kind: "custom",
      spec,
      preferredSearchMode: "live",
      providerRouting: { primary: ["serper"], fallback: [] },
    }, userId);
    if (created.res.status !== 200 || created.json.success !== true) {
      return {
        id: scenario.id,
        label: scenario.label,
        familiarity: scenario.familiarity,
        status: "fail",
        failureClass: "radar_generation_mismatch",
        generatedName,
        radarId,
        runId,
        reportId,
        runStatus,
        cardCount,
        storedEntryCount,
        rawCandidateCount,
        reportLength,
        reasons: [...reasons, `保存雷达失败: status=${created.res.status}, message=${created.json.error?.message ?? ""}`],
        firstCards,
      };
    }
    radarId = ((created.json.data ?? {}) as { id?: string }).id ?? "";

    const activated = await postJson(app, `/api/radars/${radarId}/activate`, {}, userId);
    if (activated.res.status !== 200 || activated.json.success !== true) {
      hardFailure = true;
      reasons.push(`激活雷达失败: status=${activated.res.status}, message=${activated.json.error?.message ?? ""}`);
    }

    const run = await postJson(app, `/api/radars/${radarId}/run`, {
      query: scenario.input,
      search_mode: "live",
    }, userId);
    if (run.res.status !== 200 || run.json.success !== true) {
      return {
        id: scenario.id,
        label: scenario.label,
        familiarity: scenario.familiarity,
        status: "fail",
        failureClass: "live_search_failed",
        generatedName,
        radarId,
        runId,
        reportId,
        runStatus,
        cardCount,
        storedEntryCount,
        rawCandidateCount,
        reportLength,
        reasons: [...reasons, `运行雷达失败: status=${run.res.status}, message=${run.json.error?.message ?? ""}`],
        firstCards,
      };
    }

    const runData = run.json.data as {
      run?: { id?: string; status?: string; error?: string; errorCode?: string };
      runOutcome?: { status?: string; message?: string; errorCode?: string };
      opportunityCards?: OpportunityCard[];
      rawCandidates?: unknown[];
    };
    runId = runData?.run?.id ?? "";
    runStatus = runData?.run?.status ?? "";
    rawCandidateCount = runData?.rawCandidates?.length ?? 0;
    const cards = runData?.opportunityCards ?? [];
    cardCount = cards.length;
    firstCards = cards.slice(0, 3).map((card) => card.title);
    const cardsText = visibleCardIntentText(cards);
    const negativeCardHits = matchesNegativePattern(cardsText, scenario.negativePatterns);

    if (runStatus !== "succeeded" || runData?.runOutcome?.status === "failed") {
      hardFailure = true;
      reasons.push(`运行状态不是 succeeded: run=${runStatus || "unknown"}, outcome=${runData?.runOutcome?.status || "unknown"}, message=${runData?.runOutcome?.message || ""}`);
    }
    if (cards.length === 0) {
      hardFailure = true;
      reasons.push("运行没有返回机会卡");
    } else if (!textContainsAny(cardsText, scenario.expectedKeywords)) {
      reasons.push(`WARN: 机会卡未明显体现行业关键词: ${scenario.expectedKeywords.join(" / ")}`);
    }
    if (negativeCardHits.length > 0) {
      hardFailure = true;
      reasons.push(`机会卡疑似偏题: ${negativeCardHits.join(", ")}`);
    }

    const opportunities = await getJson(app, `/api/opportunities?radar_id=${encodeURIComponent(radarId)}`, userId);
    const entries = ((opportunities.json.data ?? {}) as { entries?: unknown[] }).entries ?? [];
    storedEntryCount = entries.length;
    if (storedEntryCount === 0) {
      hardFailure = true;
      reasons.push("机会没有按 radarId 入库");
    }

    const report = await postJson(app, "/api/reports/generate", {
      radar_id: radarId,
      run_id: runId,
      radar_type: "custom",
      opportunities: cards,
      spec,
    }, userId);
    if (report.res.status !== 200 || report.json.success !== true) {
      return {
        id: scenario.id,
        label: scenario.label,
        familiarity: scenario.familiarity,
        status: "fail",
        failureClass: "report_missing_card_title",
        generatedName,
        radarId,
        runId,
        reportId,
        runStatus,
        cardCount,
        storedEntryCount,
        rawCandidateCount,
        reportLength,
        reasons: [...reasons, `报告生成失败: status=${report.res.status}, message=${report.json.error?.message ?? ""}`],
        firstCards,
      };
    }
    const reportData = report.json.data as { reportId?: string; markdown?: string };
    reportId = reportData?.reportId ?? "";
    const markdown = reportData?.markdown ?? "";
    reportLength = markdown.length;
    if (!reportId) {
      hardFailure = true;
      reasons.push("报告没有 reportId");
    }
    if (!markdown || (firstCards[0] && !markdown.includes(firstCards[0]))) {
      hardFailure = true;
      reasons.push("Markdown 报告没有包含首个机会标题");
    }
    if (customerVisibleProviderLeak(markdown)) {
      hardFailure = true;
      reasons.push("Markdown 报告泄露内部 provider 名称");
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      id: scenario.id,
      label: scenario.label,
      familiarity: scenario.familiarity,
      status: "fail",
      failureClass: inferFailureClass([message]),
      generatedName,
      radarId,
      runId,
      reportId,
      runStatus,
      cardCount,
      storedEntryCount,
      rawCandidateCount,
      reportLength,
      reasons: [`异常: ${message}`],
      firstCards,
    };
  }

  const status = statusFromChecks(reasons, hardFailure);
  return {
    id: scenario.id,
    label: scenario.label,
    familiarity: scenario.familiarity,
    status,
    failureClass: status === "fail" ? inferFailureClass(reasons) : "-",
    generatedName,
    radarId,
    runId,
    reportId,
    runStatus,
    cardCount,
    storedEntryCount,
    rawCandidateCount,
    reportLength,
    reasons: reasons.length > 0 ? reasons : ["V1.0 live 生成、运行、入库和报告链路通过"],
    firstCards,
  };
}

function renderReport(results: ScenarioResult[], stoppedEarly: boolean, startedAt: string, finishedAt: string): string {
  const pass = results.filter((result) => result.status === "pass").length;
  const nearPass = results.filter((result) => result.status === "near_pass").length;
  const failed = results.filter((result) => result.status === "fail").length;
  const passLike = pass + nearPass;
  const lines = [
    "# Q7W Live Custom Radar 10 Diagnostic Report",
    "",
    `开始时间：${startedAt}`,
    `结束时间：${finishedAt}`,
    `总体结果：pass ${pass}，near_pass ${nearPass}，fail ${failed}，pass-like ${passLike}/${SCENARIOS.length}。`,
    `是否连续 3 个失败提前停止：${stoppedEarly ? "是" : "否"}`,
    `是否达到 9/10 目标：${!stoppedEarly && passLike >= 9 ? "是" : "否"}`,
    "",
    "| # | 行业 | 熟悉度 | 结果 | 失败分类 | 雷达名 | raw | 卡片 | 入库 | 报告 | 原因 |",
    "|---|---|---|---|---|---|---:|---:|---:|---|---|",
  ];
  results.forEach((result, index) => {
    const reason = result.reasons.join("；").replace(/\|/g, "/");
    lines.push(`| ${index + 1} | ${result.label} | ${result.familiarity} | ${result.status} | ${result.failureClass} | ${result.generatedName || "-"} | ${result.rawCandidateCount} | ${result.cardCount} | ${result.storedEntryCount} | ${result.reportId ? "有" : "无"} | ${reason} |`);
  });
  lines.push("", "## 首批机会标题");
  for (const result of results) {
    lines.push("", `### ${result.label}`);
    if (result.firstCards.length === 0) {
      lines.push("- 无");
    } else {
      for (const title of result.firstCards) lines.push(`- ${title}`);
    }
  }
  lines.push(
    "",
    "## 失败分类说明",
    "",
    "- `radar_generation_mismatch`：V1.0 雷达没有抓住行业、目标或排除项。",
    "- `live_search_failed`：live 搜索、provider 或运行状态失败。",
    "- `html_or_timeout_response`：接口返回 HTML、网关错误或超时。",
    "- `no_cards`：搜索成功但没有重点机会卡。",
    "- `not_stored`：机会卡没有按 radarId 入库。",
    "- `report_missing_card_title`：报告生成失败或没有包含机会标题。",
    "- `provider_name_leak`：报告或用户可见内容泄露内部模型/搜索 provider 名称。",
    "",
    "## 下一步建议",
    "",
    passLike >= 9 && !stoppedEarly
      ? "- 本轮达到 9/10 目标，可进入更广的真人内测路径；继续保留失败/near_pass 行业作为下一轮质量优化输入。"
      : "- 本轮未达到 9/10 目标。优先修复出现 2 次以上的共性失败分类，不做单行业硬模板补丁。",
  );
  return `${lines.join("\n")}\n`;
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  console.log("=== Q7W live 自定义雷达 10 行业诊断 ===");
  prepareLiveEnv();
  const modules = await importAfterEnv();
  await assertLiveProviders(modules);
  const ctx = await createLiveDiagnosticContext(modules);
  const app = modules.createApp(ctx);
  const results: ScenarioResult[] = [];
  let consecutiveFailures = 0;
  let stoppedEarly = false;

  for (const [index, scenario] of SCENARIOS.entries()) {
    console.log(`\n[${index + 1}/${SCENARIOS.length}] ${scenario.label} (${scenario.familiarity})`);
    const result = await runScenario(app, scenario, index + 1);
    results.push(result);
    console.log(`${result.status.toUpperCase().padEnd(9)} cards=${result.cardCount} stored=${result.storedEntryCount} raw=${result.rawCandidateCount} class=${result.failureClass}`);
    if (result.reasons.length > 0) console.log(`  ${result.reasons.join("；")}`);
    if (result.status === "fail") {
      consecutiveFailures += 1;
    } else {
      consecutiveFailures = 0;
    }
    if (consecutiveFailures >= 3) {
      stoppedEarly = true;
      console.log("连续 3 个行业失败，按验收规则提前停止。");
      break;
    }
  }

  const finishedAt = new Date().toISOString();
  const report = renderReport(results, stoppedEarly, startedAt, finishedAt);
  fs.writeFileSync(path.resolve(process.cwd(), REPORT_FILE), report);
  const passLike = results.filter((result) => result.status === "pass" || result.status === "near_pass").length;
  console.log(`\n报告已写入 ${REPORT_FILE}`);
  console.log(`结果：${passLike}/${SCENARIOS.length} pass-like，stoppedEarly=${stoppedEarly}`);
  cleanupTempFiles();
  process.exit(!stoppedEarly && passLike >= 9 ? 0 : 1);
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Q7W live 诊断脚本执行失败：${message}`);
  cleanupTempFiles();
  process.exit(1);
});
