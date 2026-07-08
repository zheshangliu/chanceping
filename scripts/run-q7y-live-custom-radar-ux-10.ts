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
  revisionMessages: string[];
  expectedFinalVersion: "V1.0" | "V1.1" | "V1.2" | "V1.3" | "V1.4";
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
  finalVersion?: string;
  revisionCount?: number;
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

const REPORT_FILE = "Q7Y_Live_Custom_Radar_UX_10_Report.md";
const TEMP_PREFIX = `q7y-live-custom-radar-ux-10-${Date.now()}`;
const TEMP_FILES = {
  radars: `data/radars-${TEMP_PREFIX}.json`,
  runs: `data/radar-runs-${TEMP_PREFIX}.json`,
  opportunities: `data/opportunities-${TEMP_PREFIX}.json`,
  watchRules: `data/watch-rules-${TEMP_PREFIX}.txt`,
  reports: `data/report-index-${TEMP_PREFIX}.json`,
};

const SCENARIOS: Scenario[] = [
  {
    id: "vision-screening-service",
    label: "儿童视力防控服务",
    familiarity: "new_user",
    input: "我们做儿童青少年视力筛查和近视防控服务，想找学校、社区、卫健委、教育局和眼科机构的筛查服务采购、合作项目和入校服务机会。",
    revisionMessages: [],
    expectedFinalVersion: "V1.0",
    expectedKeywords: ["视力", "近视", "学校", "筛查", "采购"],
    negativePatterns: [/AI\s*赛事|Hackathon|眼镜零售|求职/i],
  },
  {
    id: "museum-digital-exhibition",
    label: "博物馆数字化展陈",
    familiarity: "normal_user",
    input: "我们做博物馆和文化馆数字化展陈，想找展厅改造、数字展览、文博数字化、互动装置和智慧展馆项目。",
    revisionMessages: [
      "补充一下，我们不是做普通装修，也不是找展会资讯。重点是政府采购、博物馆招标、文旅项目、数字展陈供应商和智慧展馆建设。",
    ],
    expectedFinalVersion: "V1.1",
    expectedKeywords: ["博物馆", "数字化", "展陈", "智慧展馆", "招标"],
    negativePatterns: [/AI\s*赛事|普通装修|招聘|展会资讯/i],
  },
  {
    id: "archive-digitization",
    label: "档案数字化服务",
    familiarity: "power_user",
    input: "我们做档案数字化、纸质档案扫描、电子档案管理和数据整理服务，想找政府、医院、学校和国企的档案数字化采购项目。",
    revisionMessages: [],
    expectedFinalVersion: "V1.0",
    expectedKeywords: ["档案", "数字化", "扫描", "政府", "采购"],
    negativePatterns: [/AI\s*赛事|招聘|培训/i],
  },
  {
    id: "smart-water-sensor",
    label: "智慧水务传感器",
    familiarity: "new_user",
    input: "我们做智慧水务传感器和管网监测设备，想找水务集团、住建局、园区和污水厂的设备采购、试点项目和供应商入库机会。",
    revisionMessages: [
      "不是找泛智慧城市新闻，也不是找水处理药剂。我们要管网监测、漏损监测、水质传感器、物联网采集设备。",
      "如果没有直接采购，也可以找水务试点、更新改造、智慧水务平台合作和集成商合作入口。",
      "优先华南、长三角和政府采购项目，报告里要说明投标或联系下一步。",
    ],
    expectedFinalVersion: "V1.3",
    expectedKeywords: ["智慧水务", "传感器", "管网", "监测", "采购"],
    negativePatterns: [/药剂|纯政策|AI\s*赛事|招聘/i],
  },
  {
    id: "commercial-acoustic-engineering",
    label: "商业空间声学工程",
    familiarity: "normal_user",
    input: "我们做商业空间声学工程，想找录音棚、直播间、剧场、会议中心、学校音乐教室和办公空间的声学改造项目。",
    revisionMessages: [
      "不是卖家用吸音棉，也不是装修文章。我要的是声学设计、隔音降噪、录播室建设、会议室声学改造的采购或招标机会。",
    ],
    expectedFinalVersion: "V1.1",
    expectedKeywords: ["声学", "隔音", "录播室", "会议室", "招标"],
    negativePatterns: [/家用吸音棉|装修文章|AI\s*赛事|招聘/i],
  },
  {
    id: "cold-chain-equipment",
    label: "冷链物流设备服务",
    familiarity: "new_user",
    input: "我们做冷链物流设备和温控仓储服务，想找食品、医药、生鲜电商、园区和政府项目的冷库建设、冷链设备采购和仓储合作机会。",
    revisionMessages: [
      "重点不是冷链行业新闻。我要可投标、可联系、能做设备供应或仓储合作的入口。",
      "客户包括药企、医院、食品厂、商超、生鲜平台和产业园区。",
      "排除司机招聘、普通物流招聘、货运广告和加盟广告。",
      "如果是政策或园区建设信息，可以作为观察线索，但重点卡必须能指向采购或合作。",
    ],
    expectedFinalVersion: "V1.4",
    expectedKeywords: ["冷链", "冷库", "温控", "仓储", "采购"],
    negativePatterns: [/司机招聘|货运广告|加盟|AI\s*赛事/i],
  },
  {
    id: "barrier-free-renovation",
    label: "无障碍改造服务",
    familiarity: "normal_user",
    input: "我们做无障碍环境改造和适老化改造，想找社区、民政、残联、养老机构、医院和公共建筑的改造项目。",
    revisionMessages: [],
    expectedFinalVersion: "V1.0",
    expectedKeywords: ["无障碍", "适老化", "社区", "民政", "改造"],
    negativePatterns: [/AI\s*赛事|招聘|家装广告/i],
  },
  {
    id: "sports-venue-operator",
    label: "体育场馆运营服务",
    familiarity: "power_user",
    input: "我们做体育场馆运营和赛事活动承办，想找学校、社区、园区、文旅项目和政府公共体育服务的运营外包、赛事承办和合作机会。",
    revisionMessages: [
      "不是找运动员比赛报名，也不是健身房广告。我想找场馆委托运营、体育赛事执行、全民健身活动和政府购买服务项目。",
      "优先广东、华南和文旅体育项目，报告要给出能投标或联系的入口。",
      "如果是新闻报道，只能作为观察线索，不能当成已确认项目。",
    ],
    expectedFinalVersion: "V1.3",
    expectedKeywords: ["体育场馆", "运营", "赛事承办", "全民健身", "政府购买"],
    negativePatterns: [/比赛报名|健身房广告|AI\s*赛事|招聘/i],
  },
  {
    id: "agriculture-sensor",
    label: "智慧农业传感器",
    familiarity: "new_user",
    input: "我们做智慧农业传感器和农田物联网设备，想找农业农村局、农场、种植基地和农业园区的设备采购、示范项目和合作机会。",
    revisionMessages: [
      "补充一下，重点不是农产品销售，也不是农业新闻。我要的是传感器、土壤墒情、气象站、灌溉控制和智慧农田建设项目。",
    ],
    expectedFinalVersion: "V1.1",
    expectedKeywords: ["智慧农业", "传感器", "农田", "物联网", "采购"],
    negativePatterns: [/农产品销售|农业新闻|AI\s*赛事|招聘/i],
  },
  {
    id: "short-video-production",
    label: "企业短视频拍摄服务",
    familiarity: "normal_user",
    input: "我们做企业短视频拍摄、品牌宣传片和新媒体内容制作，想找政府、园区、文旅、学校和品牌方的视频制作采购、宣传片招标和内容合作机会。",
    revisionMessages: [],
    expectedFinalVersion: "V1.0",
    expectedKeywords: ["短视频", "宣传片", "视频制作", "文旅", "采购"],
    negativePatterns: [/AI\s*赛事|招聘|培训/i],
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
    radarVersion: data.radarVersion
      ? {
          name: (data.radarVersion as { name?: unknown }).name,
          oneSentencePositioning: (data.radarVersion as { oneSentencePositioning?: unknown }).oneSentencePositioning,
          opportunityIntents: (data.radarVersion as { opportunityIntents?: unknown }).opportunityIntents,
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
  const userId = `q7y_live_${Date.now()}_${index}_${scenario.id}`;
  const reasons: string[] = [];
  let hardFailure = false;
  let generatedName = "";
  let radarId = "";
  let runId = "";
  let reportId = "";
  let runStatus = "";
  let finalVersion = "";
  let revisionCount = 0;
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
        finalVersion,
        revisionCount,
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
    let draftSpec = generatedData?.spec ?? null;
    let draftRadarVersion = generatedData?.radarVersion as { version?: string } | undefined;
    generatedName = generatedData?.suggestedName ?? "";
    const generatedText = JSON.stringify({
      suggestedName: generatedData?.suggestedName,
      spec: generatedData?.spec,
      radarVersion: generatedData?.radarVersion,
      profileSummary: generatedData?.profileSummary,
    });
    const generatedIntentText = generatedRadarIntentText(generatedData);

    if (!draftSpec) {
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
    if (!draftRadarVersion) {
      hardFailure = true;
      reasons.push("没有生成 RadarVersionSpec");
    }
    if (!draftSpec || !draftRadarVersion) {
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
        finalVersion,
        revisionCount,
        cardCount,
        storedEntryCount,
        rawCandidateCount,
        reportLength,
        reasons,
        firstCards,
      };
    }

    for (const [revisionIndex, userMessage] of scenario.revisionMessages.entries()) {
      const revised = await postJson(app, "/api/radars/revise", {
        previousSpec: draftSpec,
        previousRadarVersion: draftRadarVersion,
        userMessage,
        trigger: revisionIndex === 0 ? "requirement_correction" : "strategy_adjustment",
        revisionMode: "auto",
      }, userId);
      if (revised.res.status !== 200 || revised.json.success !== true) {
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
          finalVersion,
          revisionCount,
          cardCount,
          storedEntryCount,
          rawCandidateCount,
          reportLength,
          reasons: [...reasons, `第 ${revisionIndex + 1} 次雷达修订失败: status=${revised.res.status}, message=${revised.json.error?.message ?? ""}`],
          firstCards,
        };
      }
      const revisionData = revised.json.data as {
        spec?: RadarRequirementSpec;
        radarVersion?: { version?: string };
        suggestedName?: string;
        revisionSource?: string;
      };
      if (!revisionData.spec || !revisionData.radarVersion) {
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
          finalVersion,
          revisionCount,
          cardCount,
          storedEntryCount,
          rawCandidateCount,
          reportLength,
          reasons: [...reasons, `第 ${revisionIndex + 1} 次雷达修订没有返回 spec 或 radarVersion`],
          firstCards,
        };
      }
      draftSpec = revisionData.spec;
      draftRadarVersion = revisionData.radarVersion;
      generatedName = revisionData.suggestedName || generatedName;
      revisionCount += 1;
    }

    finalVersion = draftRadarVersion.version ?? "unknown";
    if (finalVersion !== scenario.expectedFinalVersion) {
      reasons.push(`WARN: 最终版本 ${finalVersion} 与预期 ${scenario.expectedFinalVersion} 不一致`);
    }
    const spec = confirmSpec(draftSpec);

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
      finalVersion,
      revisionCount,
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
    finalVersion,
    revisionCount,
    cardCount,
    storedEntryCount,
    rawCandidateCount,
    reportLength,
    reasons: reasons.length > 0 ? reasons : [`${finalVersion || "V1.0"} live 生成、修订、运行、入库和报告链路通过`],
    firstCards,
  };
}

function renderReport(results: ScenarioResult[], stoppedEarly: boolean, startedAt: string, finishedAt: string): string {
  const pass = results.filter((result) => result.status === "pass").length;
  const nearPass = results.filter((result) => result.status === "near_pass").length;
  const failed = results.filter((result) => result.status === "fail").length;
  const passLike = pass + nearPass;
  const carded = results.filter((result) => result.cardCount > 0).length;
  const lines = [
    "# Q7Y Live Custom Radar UX 10 Report",
    "",
    `开始时间：${startedAt}`,
    `结束时间：${finishedAt}`,
    `总体结果：pass ${pass}，near_pass ${nearPass}，fail ${failed}，pass-like ${passLike}/${SCENARIOS.length}。`,
    `机会卡达标：carded ${carded}/${SCENARIOS.length}。`,
    `是否连续 3 个失败提前停止：${stoppedEarly ? "是" : "否"}`,
    `是否达到 9/10 目标：${!stoppedEarly && carded >= 9 ? "是" : "否"}`,
    "",
    "| # | 行业 | 熟悉度 | 确认版本 | 修订次数 | 结果 | 失败分类 | 雷达名 | raw | 卡片 | 入库 | 报告 | 原因 |",
    "|---|---|---|---|---:|---|---|---|---:|---:|---:|---|---|",
  ];
  results.forEach((result, index) => {
    const reason = result.reasons.join("；").replace(/\|/g, "/");
    lines.push(`| ${index + 1} | ${result.label} | ${result.familiarity} | ${result.finalVersion || "-"} | ${result.revisionCount ?? 0} | ${result.status} | ${result.failureClass} | ${result.generatedName || "-"} | ${result.rawCandidateCount} | ${result.cardCount} | ${result.storedEntryCount} | ${result.reportId ? "有" : "无"} | ${reason} |`);
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
    carded >= 9 && !stoppedEarly
      ? "- 本轮达到 9/10 有机会卡目标，可进入更广的真人内测路径；继续保留失败/near_pass 行业作为下一轮质量优化输入。"
      : "- 本轮未达到 9/10 目标。优先修复出现 2 次以上的共性失败分类，不做单行业硬模板补丁。",
  );
  return `${lines.join("\n")}\n`;
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  console.log("=== Q7Y live 自定义雷达 UX 10 行业诊断 ===");
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
  const carded = results.filter((result) => result.cardCount > 0).length;
  console.log(`\n报告已写入 ${REPORT_FILE}`);
  console.log(`结果：${carded}/${SCENARIOS.length} carded，${passLike}/${SCENARIOS.length} pass-like，stoppedEarly=${stoppedEarly}`);
  cleanupTempFiles();
  process.exit(!stoppedEarly && carded >= 9 ? 0 : 1);
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Q7Y live 诊断脚本执行失败：${message}`);
  cleanupTempFiles();
  process.exit(1);
});
