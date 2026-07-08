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

const REPORT_FILE = "Q7X_Live_Custom_Radar_Multiversion_10_Report.md";
const TEMP_PREFIX = `q7x-live-custom-radar-multiversion-10-${Date.now()}`;
const TEMP_FILES = {
  radars: `data/radars-${TEMP_PREFIX}.json`,
  runs: `data/radar-runs-${TEMP_PREFIX}.json`,
  opportunities: `data/opportunities-${TEMP_PREFIX}.json`,
  watchRules: `data/watch-rules-${TEMP_PREFIX}.txt`,
  reports: `data/report-index-${TEMP_PREFIX}.json`,
};

const SCENARIOS: Scenario[] = [
  {
    id: "ip-legal-service",
    label: "知识产权法律服务",
    familiarity: "new_user",
    input: "我是做知识产权和商标专利服务的小团队，想找初创公司、跨境品牌、园区企业的商标注册、专利申请、版权保护和合规服务机会。",
    revisionMessages: [],
    expectedFinalVersion: "V1.0",
    expectedKeywords: ["知识产权", "商标", "专利", "版权", "合规"],
    negativePatterns: [/AI\s*赛事|Hackathon|宠物殡葬/i],
  },
  {
    id: "industrial-design",
    label: "深圳工业设计工作室",
    familiarity: "normal_user",
    input: "我们是深圳工业设计工作室，想找制造业客户、智能硬件公司、消费电子品牌的产品外观设计和结构设计项目。",
    revisionMessages: [
      "补充一下，我们不是找设计比赛，也不是找招聘岗位，我们要的是企业委托设计项目、供应商入库、创新券服务商和园区企业合作机会。",
    ],
    expectedFinalVersion: "V1.1",
    expectedKeywords: ["工业设计", "制造业", "智能硬件", "外观设计", "供应商"],
    negativePatterns: [/AI\s*赛事|招聘|学生比赛/i],
  },
  {
    id: "digital-human-live",
    label: "数字人直播代运营",
    familiarity: "power_user",
    input: "我们做数字人直播和 AI 直播间代运营，想找品牌方、电商商家、产业带企业的直播代运营采购、合作招募和服务商入库机会。",
    revisionMessages: [],
    expectedFinalVersion: "V1.0",
    expectedKeywords: ["数字人", "直播", "电商", "代运营", "品牌"],
    negativePatterns: [/AI\s*赛事|Hackathon|求职/i],
  },
  {
    id: "drone-inspection",
    label: "无人机巡检服务",
    familiarity: "new_user",
    input: "我们是无人机巡检服务公司，想找园区、能源、电力、应急和政府采购机会。",
    revisionMessages: [
      "不对，我不是卖无人机硬件，我是做巡检服务，重点是电力巡线、园区安防、光伏巡检、应急测绘这种服务项目。",
      "再补充一下，排除个人航拍、无人机培训和玩具销售，要找招标、采购、服务外包或合作入口。",
      "优先广东、华南和能源园区，报告里要看能不能联系或投标。",
    ],
    expectedFinalVersion: "V1.3",
    expectedKeywords: ["无人机", "巡检", "电力", "光伏", "招标"],
    negativePatterns: [/玩具|培训|个人航拍|AI\s*赛事/i],
  },
  {
    id: "esg-consulting",
    label: "低碳 ESG 咨询",
    familiarity: "normal_user",
    input: "我们做低碳和 ESG 咨询，想找企业碳盘查、ESG 报告、绿色供应链、双碳项目和园区低碳改造机会。",
    revisionMessages: [
      "客户最好是上市公司、制造业、园区或政府项目。不要泛政策新闻，要找采购、服务商征集、咨询项目招标或合作入口。",
    ],
    expectedFinalVersion: "V1.1",
    expectedKeywords: ["ESG", "低碳", "碳盘查", "绿色供应链", "招标"],
    negativePatterns: [/AI\s*赛事|培训广告|纯政策解读/i],
  },
  {
    id: "special-robot",
    label: "特种机器人集成商",
    familiarity: "new_user",
    input: "我们做特种机器人集成，想找企业和政府采购机会。",
    revisionMessages: [
      "具体是消防机器人、巡检机器人、安防机器人和园区机器人，不是普通工业机械臂。",
      "我想找政府应急、园区安防、能源巡检、工厂安全生产相关采购或试点项目。",
      "排除机器人比赛、展会新闻、教育机器人和玩具机器人。",
      "如果没有直接采购，也可以找集成商合作、供应商入库和试点示范项目。",
    ],
    expectedFinalVersion: "V1.4",
    expectedKeywords: ["机器人", "消防", "巡检", "安防", "采购"],
    negativePatterns: [/机器人比赛|教育机器人|玩具|AI\s*赛事/i],
  },
  {
    id: "parent-child-study",
    label: "亲子研学机构",
    familiarity: "normal_user",
    input: "我们是亲子研学机构，想找学校、社区、文旅景区和博物馆合作，承接研学课程、营地活动和周末亲子活动。",
    revisionMessages: [],
    expectedFinalVersion: "V1.0",
    expectedKeywords: ["研学", "亲子", "学校", "文旅", "博物馆"],
    negativePatterns: [/AI\s*赛事|招聘/i],
  },
  {
    id: "medical-device-channel",
    label: "医疗器械渠道商",
    familiarity: "power_user",
    input: "我们是医疗器械渠道商，想找医院采购、基层医疗设备、康复设备代理和医疗展会渠道合作机会。",
    revisionMessages: [
      "不是找医生招聘，也不是患者服务。我想找器械采购、招标、经销商代理、医院设备更新和供应商入库。",
      "优先广东、港澳和东南亚渠道，排除药品和耗材零售广告。",
      "如果是展会，可以作为渠道线索，但重点还是采购和代理合作入口。",
    ],
    expectedFinalVersion: "V1.3",
    expectedKeywords: ["医疗器械", "医院", "采购", "代理", "设备"],
    negativePatterns: [/医生招聘|患者|药品零售|AI\s*赛事/i],
  },
  {
    id: "heritage-food-brand",
    label: "老字号食品品牌",
    familiarity: "new_user",
    input: "我们是老字号食品品牌，想找商超入驻、便利店供应商报名、团购渠道、食品展和城市伴手礼合作机会。",
    revisionMessages: [
      "补充一下，重点不是加盟广告，而是采购入口、渠道商、买手、平台招商和政府文旅伴手礼项目。",
    ],
    expectedFinalVersion: "V1.1",
    expectedKeywords: ["食品", "商超", "便利店", "团购", "伴手礼"],
    negativePatterns: [/AI\s*赛事|加盟广告|招聘/i],
  },
  {
    id: "data-security",
    label: "企业数据安全服务商",
    familiarity: "normal_user",
    input: "我们做企业数据安全、等保测评和隐私合规服务，想找政府、金融、园区企业和 SaaS 公司的安全服务采购、合规整改和供应商合作机会。",
    revisionMessages: [],
    expectedFinalVersion: "V1.0",
    expectedKeywords: ["数据安全", "等保", "隐私", "合规", "采购"],
    negativePatterns: [/AI\s*赛事|Hackathon|求职/i],
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
  const userId = `q7x_live_${Date.now()}_${index}_${scenario.id}`;
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
    "# Q7X Live Custom Radar Multiversion 10 Report",
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
  console.log("=== Q7X live 多版本自定义雷达 10 行业诊断 ===");
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
  console.error(`Q7X live 诊断脚本执行失败：${message}`);
  cleanupTempFiles();
  process.exit(1);
});
