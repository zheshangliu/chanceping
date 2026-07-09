import fs from "fs";
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
  expectedMinimumVersion: "V1.0" | "V1.1" | "V1.2" | "V1.3" | "V1.4";
  expectedKeywords: string[];
  negativePatterns?: RegExp[];
};

type ScenarioStatus = "pass" | "near_pass" | "fail";

type ScenarioResult = {
  id: string;
  label: string;
  familiarity: Scenario["familiarity"];
  status: ScenarioStatus;
  finalVersion: string;
  cardCount: number;
  rawCandidateCount: number;
  reportLength: number;
  firstCards: string[];
  reasons: string[];
  failureClass: string;
};

type App = { request: (url: string, init?: RequestInit) => Promise<Response> | Response };

const SCENARIO_SET = process.env.CHANCEPING_Q7Z_SCENARIO_SET === "second" ? "second" : "first";
const REPORT_FILE = SCENARIO_SET === "second"
  ? "Q7Z_Async_Custom_Radar_Random_10_Second_Report.md"
  : "Q7Z_Async_Custom_Radar_Random_10_Report.md";

const SCENARIOS_FIRST: Scenario[] = [
  {
    id: "dental-clinic-supply",
    label: "口腔诊所设备耗材供应商",
    familiarity: "new_user",
    input: "我们做口腔诊所设备和耗材供应，想找民营口腔连锁、医院口腔科、诊所新店装修采购、展会招商和供应商入库机会。",
    revisionMessages: [],
    expectedMinimumVersion: "V1.0",
    expectedKeywords: ["口腔", "诊所", "设备", "耗材", "采购"],
    negativePatterns: [/AI\s*赛事|Hackathon|牙医招聘/i],
  },
  {
    id: "elevator-retrofit-service",
    label: "老旧小区电梯加装服务商",
    familiarity: "normal_user",
    input: "我们做老旧小区电梯加装和维护，想找社区、街道、住建局、物业和业委会的电梯加装项目。",
    revisionMessages: [
      "不是找普通电梯广告，也不是招聘。重点是政府公告、老旧小区改造、电梯加装采购、施工单位招标和居民协商项目。",
    ],
    expectedMinimumVersion: "V1.1",
    expectedKeywords: ["电梯加装", "老旧小区", "住建", "物业", "招标"],
    negativePatterns: [/AI\s*赛事|招聘|普通广告/i],
  },
  {
    id: "night-tour-lighting",
    label: "城市夜游灯光工程公司",
    familiarity: "power_user",
    input: "我们做城市夜游、文旅灯光秀和景区亮化工程，想找文旅局、景区、园区、城市更新和商业街区的夜游项目招标。",
    revisionMessages: [
      "要排除普通路灯维修、家装灯具广告和灯具批发。重点是文旅夜游、沉浸式灯光、景区亮化、城市更新和 EPC 招标。",
      "如果是文旅规划新闻只能观察，重点机会必须有采购、招标、合作或项目公示入口。",
    ],
    expectedMinimumVersion: "V1.2",
    expectedKeywords: ["夜游", "文旅", "灯光", "景区", "招标"],
    negativePatterns: [/家装|路灯维修|AI\s*赛事|招聘/i],
  },
  {
    id: "study-tour-program",
    label: "校园研学课程机构",
    familiarity: "new_user",
    input: "我们做中小学生研学课程和劳动教育实践，想找学校、教育局、青少年宫、基地和文旅机构的研学采购、合作和入库机会。",
    revisionMessages: [
      "不是找学生报名广告。我要学校采购、教育局项目、研学基地合作、劳动教育课程入校和供应商入库。",
      "优先广东、华南，报告要告诉我先联系谁或准备什么材料。",
    ],
    expectedMinimumVersion: "V1.2",
    expectedKeywords: ["研学", "学校", "教育局", "劳动教育", "入库"],
    negativePatterns: [/学生报名广告|旅游团广告|AI\s*赛事/i],
  },
  {
    id: "data-compliance-consulting",
    label: "企业数据合规咨询公司",
    familiarity: "normal_user",
    input: "我们做企业数据合规、个人信息保护和数据出境评估咨询，想找政府项目、园区企业服务、金融和跨境企业的数据合规咨询采购机会。",
    revisionMessages: [],
    expectedMinimumVersion: "V1.0",
    expectedKeywords: ["数据合规", "个人信息保护", "数据出境", "咨询", "采购"],
    negativePatterns: [/AI\s*赛事|课程培训|招聘/i],
  },
  {
    id: "pet-hospital-chain",
    label: "宠物医院连锁服务商",
    familiarity: "new_user",
    input: "我们是宠物医院连锁，想找宠物展、社区合作、宠物品牌联名、商场活动和宠物服务平台入驻机会。",
    revisionMessages: [
      "重点不是宠物用品采购，也不是加盟广告。我要能带来客户、曝光、平台入驻、商场快闪或品牌合作的入口。",
      "如果是协会目录或展商名单，可以作为可联系线索，但要标明需要联系确认。",
      "排除宠物医生招聘和宠物用品批发。",
    ],
    expectedMinimumVersion: "V1.3",
    expectedKeywords: ["宠物医院", "宠物展", "商场", "品牌合作", "入驻"],
    negativePatterns: [/医生招聘|用品批发|AI\s*赛事/i],
  },
  {
    id: "ev-charging-operator",
    label: "新能源汽车充电运营商",
    familiarity: "power_user",
    input: "我们做新能源充电桩安装和运营，想找物业、商场、园区、高速服务区和政府充电基础设施项目。",
    revisionMessages: [
      "不是找充电桩零售广告。重点是场地方合作、充电站建设招标、运营商入围、政府补贴项目和物业合作入口。",
    ],
    expectedMinimumVersion: "V1.1",
    expectedKeywords: ["充电桩", "运营", "物业", "园区", "招标"],
    negativePatterns: [/零售广告|招聘|AI\s*赛事/i],
  },
  {
    id: "industrial-robot-integrator",
    label: "工业机器人集成商",
    familiarity: "normal_user",
    input: "我们做工业机器人系统集成和自动化产线改造，想找制造业技改、园区智能制造、工厂自动化采购和设备集成项目。",
    revisionMessages: [],
    expectedMinimumVersion: "V1.0",
    expectedKeywords: ["工业机器人", "系统集成", "自动化", "技改", "采购"],
    negativePatterns: [/AI\s*赛事|机器人比赛|招聘/i],
  },
  {
    id: "supply-chain-finance-saas",
    label: "供应链金融 SaaS 公司",
    familiarity: "new_user",
    input: "我们做供应链金融 SaaS 和应收账款管理系统，想找产业园、核心企业、金融机构、保理公司和平台合作机会。",
    revisionMessages: [
      "不是泛金融科技展会，也不是贷款广告。我要渠道合作、核心企业数字化、保理系统采购、银行生态伙伴和园区企业服务入口。",
      "如果是协会目录、生态伙伴目录，也可以作为线索，但要标明需要联系确认。",
      "优先华南和东南亚，如果有出海合作入口也保留。",
      "报告要给出本周先联系谁、准备什么资料、风险是什么。",
    ],
    expectedMinimumVersion: "V1.4",
    expectedKeywords: ["供应链金融", "SaaS", "保理", "核心企业", "合作"],
    negativePatterns: [/贷款广告|泛金融科技展会|AI\s*赛事/i],
  },
  {
    id: "low-carbon-building-materials",
    label: "低碳建筑材料供应商",
    familiarity: "normal_user",
    input: "我们做低碳建筑材料、装配式建材和绿色建材认证产品，想找政府采购、地产项目、绿色建筑示范和施工单位采购机会。",
    revisionMessages: [
      "排除普通建材广告和家装零售，重点是绿色建材、低碳建筑、装配式项目、政府采购和施工总包供应商入口。",
    ],
    expectedMinimumVersion: "V1.1",
    expectedKeywords: ["低碳", "绿色建材", "装配式", "政府采购", "施工"],
    negativePatterns: [/家装零售|普通建材广告|AI\s*赛事/i],
  },
];

const SCENARIOS_SECOND: Scenario[] = [
  {
    id: "specialty-coffee-roaster",
    label: "精品咖啡烘焙品牌",
    familiarity: "new_user",
    input: "我们是精品咖啡烘焙品牌，想找咖啡馆渠道、酒店餐饮采购、商超选品、咖啡展和品牌联名机会。",
    revisionMessages: [],
    expectedMinimumVersion: "V1.0",
    expectedKeywords: ["咖啡", "烘焙", "渠道", "采购", "联名"],
    negativePatterns: [/AI\s*赛事|招聘|咖啡师培训/i],
  },
  {
    id: "medical-device-compliance",
    label: "医疗器械合规注册咨询公司",
    familiarity: "normal_user",
    input: "我们做医疗器械注册、临床评价和出海合规咨询，想找医疗器械企业、园区孵化器、协会活动和政府服务项目的客户线索。",
    revisionMessages: [
      "不是找医生招聘，也不是找器械采购。重点是需要注册证、合规咨询、欧盟 MDR、FDA 或出海认证服务的企业。",
    ],
    expectedMinimumVersion: "V1.1",
    expectedKeywords: ["医疗器械", "注册", "合规", "咨询", "出海"],
    negativePatterns: [/医生招聘|器械采购|AI\s*赛事/i],
  },
  {
    id: "urban-renewal-landscape-design",
    label: "城市更新景观设计事务所",
    familiarity: "power_user",
    input: "我们做城市更新、街区景观和公共空间设计，想找住建局、城投、商业街区、公园和园区更新类设计招标机会。",
    revisionMessages: [
      "排除普通绿化养护和苗木采购。我要城市更新、口袋公园、街区改造、景观设计、公共空间营造和设计咨询招标。",
      "如果只是政策新闻只能观察，重点机会必须有招标、采购、征集或设计单位报名入口。",
    ],
    expectedMinimumVersion: "V1.2",
    expectedKeywords: ["城市更新", "景观", "设计", "招标", "公共空间"],
    negativePatterns: [/苗木采购|绿化养护|AI\s*赛事|招聘/i],
  },
  {
    id: "livestream-ecommerce-agency",
    label: "直播电商代运营公司",
    familiarity: "new_user",
    input: "我们做直播电商代运营和短视频带货，想找品牌方招商、平台招商、产业带服务商入驻和商家直播运营合作机会。",
    revisionMessages: [],
    expectedMinimumVersion: "V1.0",
    expectedKeywords: ["直播", "电商", "代运营", "品牌", "招商"],
    negativePatterns: [/主播招聘|培训广告|AI\s*赛事/i],
  },
  {
    id: "research-instrument-platform",
    label: "高校科研仪器共享平台服务商",
    familiarity: "normal_user",
    input: "我们做高校科研仪器共享平台和实验室设备预约系统，想找高校、科研院所、重点实验室和大型仪器共享平台建设项目。",
    revisionMessages: [
      "不是卖单台设备，也不是学生比赛。重点是平台系统建设、实验室管理、预约计费、仪器共享和高校信息化采购。",
    ],
    expectedMinimumVersion: "V1.1",
    expectedKeywords: ["高校", "科研仪器", "共享平台", "实验室", "采购"],
    negativePatterns: [/单台设备|学生比赛|AI\s*赛事/i],
  },
  {
    id: "smart-eldercare-equipment",
    label: "智慧养老设备公司",
    familiarity: "new_user",
    input: "我们做智慧养老设备、跌倒监测和护理呼叫系统，想找养老院、社区养老、民政项目和康养机构采购机会。",
    revisionMessages: [
      "排除养老院招聘和保健品广告。我要智慧养老、适老化改造、护理设备、社区养老服务中心和政府采购项目。",
      "如果是政策新闻只能观察，重点机会要有采购、招标、试点申报或机构合作入口。",
    ],
    expectedMinimumVersion: "V1.2",
    expectedKeywords: ["智慧养老", "养老院", "民政", "采购", "适老化"],
    negativePatterns: [/招聘|保健品|AI\s*赛事/i],
  },
  {
    id: "kids-sports-gym-chain",
    label: "儿童运动馆连锁",
    familiarity: "power_user",
    input: "我们做儿童体适能和运动馆连锁，想找商场场地、学校课后服务、体育赛事承办和亲子活动合作机会。",
    revisionMessages: [
      "不是找教练招聘，也不是普通招生广告。我要商场招商、学校合作、课后服务采购、赛事承办和品牌联名。",
      "优先华南，能联系到商场、学校、街道或体育机构的线索也可以保留。",
      "报告要给出先联系谁、准备什么材料和风险。",
    ],
    expectedMinimumVersion: "V1.3",
    expectedKeywords: ["儿童", "体适能", "商场", "学校", "课后服务"],
    negativePatterns: [/教练招聘|招生广告|AI\s*赛事/i],
  },
  {
    id: "study-abroad-service",
    label: "海外留学服务机构",
    familiarity: "normal_user",
    input: "我们做海外留学申请和国际教育服务，想找国际学校合作、教育展、高校招生代理、游学项目和家长社群渠道机会。",
    revisionMessages: [
      "排除单纯学生广告投放和留学顾问招聘。重点是学校合作、招生代理、国际教育展、游学项目合作和渠道伙伴。",
    ],
    expectedMinimumVersion: "V1.1",
    expectedKeywords: ["留学", "国际学校", "教育展", "招生代理", "游学"],
    negativePatterns: [/顾问招聘|广告投放|AI\s*赛事/i],
  },
  {
    id: "industrial-park-investment-ops",
    label: "工业园区招商运营服务商",
    familiarity: "new_user",
    input: "我们做工业园区招商运营和产业服务，想找政府园区、开发区、产业园招商外包、运营服务和企业服务项目。",
    revisionMessages: [],
    expectedMinimumVersion: "V1.0",
    expectedKeywords: ["园区", "招商", "运营", "开发区", "企业服务"],
    negativePatterns: [/房产中介|招聘|AI\s*赛事/i],
  },
  {
    id: "museum-interactive-tech",
    label: "文博互动技术公司",
    familiarity: "normal_user",
    input: "我们做博物馆数字展陈、互动装置和沉浸式文博体验，想找文旅局、博物馆、展陈公司和公共文化项目采购机会。",
    revisionMessages: [
      "排除纯展会资讯和艺术家征稿。重点是数字展陈、互动多媒体、沉浸式展厅、博物馆采购和文旅项目招标。",
      "如果是展陈公司或博物馆项目目录，可以作为客户线索，但要标明需要联系确认。",
    ],
    expectedMinimumVersion: "V1.2",
    expectedKeywords: ["博物馆", "数字展陈", "互动", "文旅", "采购"],
    negativePatterns: [/艺术家征稿|纯展会资讯|AI\s*赛事/i],
  },
];

const SCENARIOS = SCENARIO_SET === "second" ? SCENARIOS_SECOND : SCENARIOS_FIRST;

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

async function createAppAfterEnv(): Promise<App> {
  const [{ createApp }, { createAppContext }] = await Promise.all([
    import("../src/api/app"),
    import("../src/api/context"),
  ]);
  return createApp(createAppContext());
}

async function parseResponse(res: Response): Promise<ApiResponse> {
  const text = await res.text();
  try {
    return JSON.parse(text) as ApiResponse;
  } catch {
    throw new Error(`响应不是 JSON: status=${res.status}, body=${text.slice(0, 260)}`);
  }
}

async function postJson(app: App, url: string, body: unknown, userId: string): Promise<{ res: Response; json: ApiResponse }> {
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

async function getJson(app: App, url: string, userId: string): Promise<{ res: Response; json: ApiResponse }> {
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

function versionNumber(version: string | undefined): number {
  const match = String(version ?? "").match(/V(\d+)\.(\d+)/);
  if (!match) return 0;
  return Number(match[1]) * 100 + Number(match[2]);
}

function textContainsAny(text: string, keywords: string[]): boolean {
  const normalized = text.toLowerCase();
  return keywords.some((keyword) => normalized.includes(keyword.toLowerCase()));
}

function matchesNegativePattern(text: string, patterns: RegExp[] = []): string[] {
  const hits: string[] = [];
  for (const pattern of patterns) {
    const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
    const regex = new RegExp(pattern.source, flags);
    for (const match of text.matchAll(regex)) {
      if (match[0]) hits.push(match[0]);
    }
  }
  return [...new Set(hits)].slice(0, 8);
}

function toStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(toStrings);
  return [];
}

function pickStrings(record: Record<string, unknown> | undefined, keys: string[]): string[] {
  if (!record) return [];
  return keys.flatMap((key) => toStrings(record[key]));
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function diagnosticTextForGeneratedData(data: {
  spec?: RadarRequirementSpec;
  suggestedName?: string;
  radarVersion?: unknown;
  profileSummary?: unknown;
}): string {
  const spec = data.spec as unknown as Record<string, unknown> | undefined;
  const clientProfile = asRecord(spec?.client_profile);
  const coreGoals = asRecord(spec?.core_goals);
  const opportunityScope = asRecord(spec?.opportunity_scope);
  const regionScope = asRecord(spec?.region_scope);
  const keywordStrategy = asRecord(spec?.keyword_strategy);
  const radarVersion = asRecord(data.radarVersion);
  const queryFamilies = Array.isArray(radarVersion?.queryFamilies) ? radarVersion.queryFamilies : [];
  const familyStrings = queryFamilies.flatMap((family) => {
    const familyRecord = asRecord(family);
    return pickStrings(familyRecord, [
      "familyName",
      "intentType",
      "sourceArchetype",
      "whyThisFamily",
      "resultBucket",
      "queries",
    ]);
  });

  return [
    data.suggestedName,
    ...pickStrings(spec, ["product_name", "product_category", "primary_subject"]),
    ...pickStrings(clientProfile, [
      "client_name",
      "client_type",
      "industry",
      "business_type",
      "products_or_projects",
      "target_users",
      "core_capabilities",
      "regions",
      "notes",
    ]),
    ...pickStrings(coreGoals, [
      "primary_goal",
      "secondary_goals",
      "success_definition",
      "action_intent",
      "priority_order",
    ]),
    ...pickStrings(opportunityScope, [
      "primary_opportunity_types",
      "secondary_opportunity_types",
      "must_have_conditions",
      "nice_to_have_conditions",
    ]),
    ...pickStrings(regionScope, ["primary_regions", "secondary_regions"]),
    ...pickStrings(keywordStrategy, [
      "core_keywords_zh",
      "core_keywords_en",
      "expanded_keywords_zh",
      "expanded_keywords_en",
    ]),
    ...pickStrings(radarVersion, [
      "oneSentencePositioning",
      "targetUser",
      "businessContext",
      "opportunityIntents",
      "highValueCriteria",
      "prioritySourceArchetypes",
      "resultBuckets",
    ]),
    ...familyStrings,
  ].flatMap(toStrings).join("\n");
}

function diagnosticTextForCards(cards: OpportunityCard[]): string {
  return cards.slice(0, 5).flatMap((card) => {
    const record = card as unknown as Record<string, unknown>;
    return pickStrings(record, [
      "title",
      "url",
      "source_url",
      "sourceUrl",
      "source_domain",
      "sourceDomain",
      "summary",
      "reason",
      "why_this_opportunity",
      "whyThisOpportunity",
      "why_this_fits",
      "whyThisFits",
      "recommended_action",
      "recommendedAction",
      "next_action",
      "nextAction",
      "next_actions",
      "nextActions",
    ]);
  }).join("\n");
}

function inferFailureClass(reasons: string[]): string {
  const joined = reasons.join("\n");
  if (/生成|修订|关键词|偏题/.test(joined)) return "radar_generation_or_revision";
  if (/任务|搜索|run|失败/.test(joined)) return "async_live_run_failed";
  if (/没有机会卡|card/i.test(joined)) return "no_cards";
  if (/Markdown|报告/.test(joined)) return "report_failed";
  return "unknown";
}

async function pollJob(app: App, jobId: string, userId: string): Promise<any> {
  const deadline = Date.now() + 12 * 60 * 1000;
  while (Date.now() < deadline) {
    const job = await getJson(app, `/api/radar-jobs/${jobId}`, userId);
    if (job.res.status !== 200 || !job.json.success) {
      throw new Error(job.json.error?.message || `任务查询失败: ${job.res.status}`);
    }
    const data = job.json.data as any;
    if (data.status === "succeeded") return data;
    if (data.status === "failed") throw new Error(data.error?.message || "任务失败");
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  throw new Error("任务超过 12 分钟仍未完成");
}

async function runScenario(app: App, scenario: Scenario, index: number): Promise<ScenarioResult> {
  const userId = `q7z_async_${Date.now()}_${index}_${scenario.id}`;
  const reasons: string[] = [];
  let finalVersion = "";
  let cardCount = 0;
  let rawCandidateCount = 0;
  let reportLength = 0;
  let firstCards: string[] = [];

  try {
    const generated = await postJson(app, "/api/radars/generate", { description: scenario.input }, userId);
    if (generated.res.status !== 200 || generated.json.success !== true) {
      reasons.push(`生成雷达失败: ${generated.json.error?.message ?? generated.res.status}`);
      return failResult(scenario, reasons, finalVersion);
    }
    const generatedData = generated.json.data as {
      spec?: RadarRequirementSpec;
      suggestedName?: string;
      radarVersion?: { version?: string };
      profileSummary?: unknown;
    };
    let spec = generatedData.spec;
    let radarVersion = generatedData.radarVersion;
    if (!spec || !radarVersion) {
      reasons.push("生成结果缺少 spec 或 radarVersion");
      return failResult(scenario, reasons, finalVersion);
    }
    const initialText = diagnosticTextForGeneratedData(generatedData);
    if (!textContainsAny(initialText, scenario.expectedKeywords)) {
      reasons.push(`WARN: 初版雷达未明显包含预期关键词: ${scenario.expectedKeywords.join(" / ")}`);
    }
    const initialNegativeHits = matchesNegativePattern(initialText, scenario.negativePatterns);
    if (initialNegativeHits.length > 0) {
      reasons.push(`初版雷达疑似偏题: ${initialNegativeHits.join(", ")}`);
      return failResult(scenario, reasons, radarVersion.version ?? "");
    }

    for (const [revisionIndex, userMessage] of scenario.revisionMessages.entries()) {
      const revised = await postJson(app, "/api/radars/revise", {
        previousSpec: spec,
        previousRadarVersion: radarVersion,
        userMessage,
        trigger: revisionIndex === 0 ? "requirement_correction" : "strategy_adjustment",
        revisionMode: "auto",
      }, userId);
      if (revised.res.status !== 200 || revised.json.success !== true) {
        reasons.push(`第 ${revisionIndex + 1} 次雷达修订失败: ${revised.json.error?.message ?? revised.res.status}`);
        return failResult(scenario, reasons, radarVersion.version ?? "");
      }
      const revisionData = revised.json.data as { spec?: RadarRequirementSpec; radarVersion?: { version?: string } };
      if (!revisionData.spec || !revisionData.radarVersion) {
        reasons.push(`第 ${revisionIndex + 1} 次修订缺少 spec 或 radarVersion`);
        return failResult(scenario, reasons, radarVersion.version ?? "");
      }
      spec = revisionData.spec;
      radarVersion = revisionData.radarVersion;
    }

    finalVersion = radarVersion.version ?? "unknown";
    if (versionNumber(finalVersion) < versionNumber(scenario.expectedMinimumVersion)) {
      reasons.push(`WARN: 最终版本 ${finalVersion} 低于预期 ${scenario.expectedMinimumVersion}`);
    }
    const finalSpec = confirmSpec(spec);
    const started = await postJson(app, "/api/radar-jobs/run", {
      spec: finalSpec,
      radar_type: "custom",
      search_mode: "live",
      query: [scenario.input, ...scenario.revisionMessages].join(" "),
      profile: (finalSpec as { profile_summary?: unknown; profile?: unknown }).profile_summary ?? (finalSpec as { profile?: unknown }).profile,
    }, userId);
    if (started.res.status !== 202 || started.json.success !== true) {
      reasons.push(`异步任务启动失败: ${started.json.error?.message ?? started.res.status}`);
      return failResult(scenario, reasons, finalVersion);
    }
    const jobId = (started.json.data as any)?.jobId;
    if (!jobId) {
      reasons.push("异步任务没有返回 jobId");
      return failResult(scenario, reasons, finalVersion);
    }
    const job = await pollJob(app, jobId, userId);
    const cards = (job.result?.search?.opportunityCards ?? []) as OpportunityCard[];
    cardCount = cards.length;
    rawCandidateCount = Number(job.result?.search?.total_raw ?? job.result?.search?.rawCandidates?.length ?? 0);
    reportLength = String(job.result?.report?.markdown ?? "").length;
    firstCards = cards.slice(0, 3).map((card) => card.title);
    if (cardCount === 0) {
      reasons.push("没有返回机会卡");
    }
    if (reportLength < 500) {
      reasons.push("WARN: Markdown 报告较短，可能行动层不足");
    }
    const cardText = diagnosticTextForCards(cards);
    const cardNegativeHits = matchesNegativePattern(cardText, scenario.negativePatterns);
    if (cardNegativeHits.length > 0) {
      reasons.push(`机会卡疑似混入错配结果: ${cardNegativeHits.join(", ")}`);
    }
    const hardFail = reasons.some((reason) => !reason.startsWith("WARN:")) || cardCount === 0;
    return {
      id: scenario.id,
      label: scenario.label,
      familiarity: scenario.familiarity,
      status: hardFail ? "fail" : (reasons.length > 0 ? "near_pass" : "pass"),
      finalVersion,
      cardCount,
      rawCandidateCount,
      reportLength,
      firstCards,
      reasons,
      failureClass: hardFail ? inferFailureClass(reasons) : "none",
    };
  } catch (err) {
    reasons.push(err instanceof Error ? err.message : String(err));
    return failResult(scenario, reasons, finalVersion, cardCount, rawCandidateCount, reportLength, firstCards);
  }
}

function failResult(
  scenario: Scenario,
  reasons: string[],
  finalVersion = "",
  cardCount = 0,
  rawCandidateCount = 0,
  reportLength = 0,
  firstCards: string[] = [],
): ScenarioResult {
  return {
    id: scenario.id,
    label: scenario.label,
    familiarity: scenario.familiarity,
    status: "fail",
    finalVersion,
    cardCount,
    rawCandidateCount,
    reportLength,
    firstCards,
    reasons,
    failureClass: inferFailureClass(reasons),
  };
}

function writeReport(results: ScenarioResult[]): void {
  const passLike = results.filter((item) => item.status === "pass" || item.status === "near_pass").length;
  const carded = results.filter((item) => item.cardCount > 0).length;
  const lines = [
    "# Q7Z Async Custom Radar Random 10 Report",
    "",
    `- Generated at: ${new Date().toISOString()}`,
    `- Pass-like: ${passLike}/10`,
    `- Carded: ${carded}/10`,
    "",
    "| # | Scenario | Familiarity | Version | Cards | Raw | Status | Failure Class | First Cards | Reasons |",
    "|---|---|---|---:|---:|---:|---|---|---|---|",
    ...results.map((item, index) => [
      index + 1,
      item.label,
      item.familiarity,
      item.finalVersion || "-",
      item.cardCount,
      item.rawCandidateCount,
      item.status,
      item.failureClass,
      item.firstCards.join("<br>") || "-",
      item.reasons.join("<br>") || "-",
    ].map((value) => String(value).replace(/\|/g, "\\|")).join(" | ")).map((row) => `| ${row} |`),
    "",
  ];
  fs.writeFileSync(REPORT_FILE, lines.join("\n"), "utf8");
}

async function main(): Promise<void> {
  prepareLiveEnv();
  const app = await createAppAfterEnv();
  const results: ScenarioResult[] = [];
  let consecutiveFailures = 0;
  for (const [index, scenario] of SCENARIOS.entries()) {
    console.log(`\n[${index + 1}/10] ${scenario.label}`);
    const result = await runScenario(app, scenario, index + 1);
    results.push(result);
    console.log(`${result.status}: cards=${result.cardCount}, raw=${result.rawCandidateCount}, version=${result.finalVersion}`);
    if (result.status === "fail") {
      consecutiveFailures += 1;
    } else {
      consecutiveFailures = 0;
    }
    if (consecutiveFailures >= 3) {
      console.error("连续 3 个行业失败，按规则停止测试。");
      break;
    }
  }
  writeReport(results);
  const passLike = results.filter((item) => item.status === "pass" || item.status === "near_pass").length;
  const carded = results.filter((item) => item.cardCount > 0).length;
  console.log(`\nQ7Z async random 10 live result: pass-like=${passLike}/${results.length}, carded=${carded}/${results.length}`);
  console.log(`Report: ${REPORT_FILE}`);
  if (results.length < 10 || carded < 9 || passLike < 9) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
