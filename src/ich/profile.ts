import { createDefaultScoringRules, type ScoringRules } from "../schema/scoring-rules";
import { createDefaultSpec, type RadarRequirementSpec } from "../schema/radar-requirement-spec";
import type { RadarVersionQueryFamily } from "../schema/radar-version-spec";
import { getIchSourceRegistryV2 } from "./source-registry-v2";

export const ICH_RADAR_PROFILE_ID = "ich-radar-profile" as const;
export const ICH_RADAR_PROFILE_VERSION = "V1.0" as const;

/** Providers are ordered so that the first tier is used before fallback. */
export const ICH_PROVIDER_ROUTING = {
  primary: ["bocha", "serper"],
  fallback: ["doubao_search", "brave"],
} as const;

export type IchOpportunityLane =
  | "competition"
  | "exhibition"
  | "market"
  | "procurement"
  | "channel"
  | "funding"
  | "international"
  | "heritage_program"
  | "residency"
  | "education"
  | "brand_collaboration";

export interface IchRadarProfile {
  id: typeof ICH_RADAR_PROFILE_ID;
  version: typeof ICH_RADAR_PROFILE_VERSION;
  purpose: string;
  audience: string[];
  queryPackIds: string[];
  lanes: IchOpportunityLane[];
  sourcePolicy: {
    detailPageRequiredForFormalPublish: boolean;
    discoveryPagesRemainCandidates: boolean;
    unconfirmedFieldsRemainUnknown: boolean;
  };
  scoringDimensions: Array<{ key: string; label: string; weight: number }>;
  requiredFields: string[];
}

const QUERY_PACK_IDS = [
  "ich-cn-opportunity",
  "ich-cn-procurement",
  "ich-gba-local",
  "ich-crafts-intl",
  "ich-grants-intl",
  "ich-cn-competition-v2",
  "ich-intl-competition-v2",
  "ich-exhibition-v2",
  "ich-commercial-v2",
  "ich-residency-v2",
  "ich-education-brand-v2",
  "ich-cn-quality-v3",
  "ich-intl-quality-v3",
  "ich-heritage-program-v4",
  "ich-museum-collaboration-v4",
  "ich-commercial-channel-v4",
  "ich-craft-market-v4",
  "ich-residency-v4",
] as const;

const LANE_QUERIES: Array<{
  familyName: string;
  intentType: RadarVersionQueryFamily["intentType"];
  sourceArchetype: string;
  queries: string[];
  whyThisFamily: string;
  resultBucket: RadarVersionQueryFamily["resultBucket"];
}> = [
  { familyName: "非遗强相关赛事与征集", intentType: "direct_opportunity", sourceArchetype: "official_event_site", queries: ["非物质文化遗产 非遗 传统工艺 传承人 报名 征集 官方", "手工艺 工艺美术 非遗文创 作品征集 截止 官方"], whyThisFamily: "优先寻找明确指向非遗、传统工艺、手工艺或传承人的行动型赛事。", resultBucket: "direct_opportunity" },
  { familyName: "传统工艺采购与项目承接", intentType: "business_lead", sourceArchetype: "procurement_or_supplier_portal", queries: ["非遗 传统工艺 文创产品 采购 供应商 招标 官方", "博物馆 文化馆 非遗文创 展陈 采购 比选 官方"], whyThisFamily: "减少泛采购噪声，优先保留非遗文创、博物馆供应和传统工艺项目。", resultBucket: "business_lead" },
  { familyName: "湾区非遗合作与渠道", intentType: "channel_partner_lead", sourceArchetype: "business_matching_platform", queries: ["广州 广东 非遗 传统工艺 手工艺 合作 入驻 联名 官方", "粤港澳大湾区 非遗文创 展销 市集 采购 合作"], whyThisFamily: "覆盖具有非遗/手工艺语义的展销、入驻、联名和渠道合作。", resultBucket: "channel_partner_lead" },
  { familyName: "国际传统工艺开放机会", intentType: "direct_opportunity", sourceArchetype: "open_call_submission_page", queries: ["intangible cultural heritage heritage craft artisan open call official", "traditional craft craftsmanship award residency application official"], whyThisFamily: "国际查询必须包含 heritage craft、artisan 或 craftsmanship 强相关信号。", resultBucket: "direct_opportunity" },
  { familyName: "非遗项目与扶持计划", intentType: "direct_opportunity", sourceArchetype: "government_grant_page", queries: ["非遗 项目申报 保护项目 传统工艺振兴 官方", "非遗人才培养 传承人计划 文化产业项目 官方"], whyThisFamily: "将非遗保护、传统工艺振兴和传承人培养从泛资助中单独识别。", resultBucket: "direct_opportunity" },
];

function buildQueryFamilies(): RadarVersionQueryFamily[] {
  return LANE_QUERIES.map((family) => ({
    ...family,
    queryVariants: family.queries.map((query, index) => ({ query, variant: index === 0 ? "broad_discovery" : "action_keyword" })),
  }));
}

const scoringDimensions = [
  { key: "evidence_authority", label: "来源权威与证据完整度", weight: 25 },
  { key: "heritage_relevance", label: "非遗/传统工艺相关性", weight: 25 },
  { key: "actionability", label: "行动入口可执行性", weight: 20 },
  { key: "applicant_fit", label: "申请主体匹配度", weight: 15 },
  { key: "commercial_value", label: "商业与合作价值", weight: 10 },
  { key: "freshness", label: "时效与新鲜度", weight: 5 },
];

export const ICH_RADAR_PROFILE: IchRadarProfile = {
  id: ICH_RADAR_PROFILE_ID,
  version: ICH_RADAR_PROFILE_VERSION,
  purpose: "为非遗手艺人、工作室、品牌与文创团队发现可参与的项目、赛事、采购与合作机会。",
  audience: ["非遗手艺人", "工作室", "文创品牌", "文化创意团队"],
  queryPackIds: [...QUERY_PACK_IDS],
  lanes: ["competition", "exhibition", "market", "procurement", "channel", "funding", "international", "heritage_program", "residency", "education", "brand_collaboration"],
  sourcePolicy: { detailPageRequiredForFormalPublish: true, discoveryPagesRemainCandidates: true, unconfirmedFieldsRemainUnknown: true },
  scoringDimensions,
  requiredFields: ["title", "organizer", "deadline_text", "geography", "category_hint", "source_url"],
};

function sourceUrls(): string[] {
  return getIchSourceRegistryV2().sources
    .filter((source) => source.operational_status !== "disabled")
    .map((source) => source.canonical_url);
}

function createIchScoringRules(): ScoringRules {
  const rules = createDefaultScoringRules();
  return {
    ...rules,
    weights: { ...rules.weights, match_score: 25, business_value: 25, timeliness: 15, credibility: 25, actionability: 15, risk_penalty: -5 },
  };
}

/** Stable ICH Profile consumed by SearchIntentPlanner and SearchOrchestrator. */
export function createIchRadarSpec(): RadarRequirementSpec {
  const spec = createDefaultSpec();
  spec.product_name = "ChancePing";
  spec.product_category = "非遗机会雷达";
  spec.client_profile = {
    client_name: "ICH Radar",
    client_type: "非遗手艺人、工作室、品牌与文创团队",
    industry: "非物质文化遗产与传统工艺",
    business_type: "非遗技艺、工艺美术、文化创意与文创产品",
    company_stage: "个人、工作室、品牌或团队",
    products_or_projects: ["非遗技艺", "传统工艺", "文创产品", "展览与研学项目"],
    target_users: ["非遗从业者", "手艺人", "工作室", "文创品牌", "文化机构"],
    core_capabilities: ["作品创作", "工艺生产", "文化内容", "项目合作"],
    current_assets: [],
    regions: ["广州", "广东", "中国", "全球"],
    notes: "搜索发现不等于官方核验；详情页、字段证据与发布门禁分离。",
  };
  spec.core_goals = {
    primary_goal: "发现可参与的非遗项目、赛事、采购、资助与合作机会",
    secondary_goals: ["持续监控官方来源", "保留观察线索", "减少错过截止日期"],
    success_definition: "来源可追溯、字段可核验、行动入口可访问的机会候选进入审核流程。",
    action_intent: ["报名比赛", "申请补贴", "申报项目", "寻找客户", "寻找合作", "保存观察", "准备材料"],
    priority_order: ["官方详情页", "截止日期", "申请资格", "行动入口", "相关性"],
  };
  spec.opportunity_scope = {
    primary_opportunity_types: [...ICH_RADAR_PROFILE.lanes],
    secondary_opportunity_types: ["展览", "研学", "驻地", "设计奖项", "供应商入库"],
    excluded_opportunity_types: ["结果公示", "获奖名单", "招聘", "纯新闻", "已关闭机会"],
    must_have_conditions: ["存在行动信号", "来源页面可追溯", "非遗/传统工艺/文创关联"],
    nice_to_have_conditions: ["明确截止时间", "明确申请资格", "明确报名入口"],
  };
  spec.region_scope = { primary_regions: ["广州", "广东", "中国"], secondary_regions: ["全球", "海外"], excluded_regions: [], global_allowed: true, overseas_allowed: true };
  spec.keyword_strategy = {
    core_keywords_zh: ["非遗", "非物质文化遗产", "传统工艺", "传统技艺", "手工艺", "工艺美术", "传承人", "非遗文创", "文化遗产", "采购", "合作", "资助"],
    core_keywords_en: ["intangible cultural heritage", "heritage craft", "traditional craft", "craftsmanship", "artisan", "heritage design", "open call", "residency", "procurement", "cultural exchange"],
    expanded_keywords_zh: ["征集", "招募", "申报", "入驻", "联名", "展销", "研学", "驻地", "基金", "非遗产品开发", "传统文化创新"],
    expanded_keywords_en: ["competition", "exhibition", "commission", "studio", "grant", "funding", "fellowship", "craft maker", "museum partnership"],
    negative_keywords: ["论文", "征文", "摄影比赛", "普通广告设计", "平面设计", "学生作业", "毕业设计", "UI设计", "软件设计", "程序设计", "结果公告", "结果公示", "中选结果", "获奖名单", "获奖作品", "活动预告", "招聘", "已结束", "closed", "past deadline"],
  };
  spec.source_strategy = {
    official_sites: sourceUrls(), platforms: ["政府采购平台", "官方赛事平台"], search_engines: [...ICH_PROVIDER_ROUTING.primary, ...ICH_PROVIDER_ROUTING.fallback], social_media: [], rss_sources: [], manual_sources: [],
    source_priority: getIchSourceRegistryV2().sources.filter((source) => source.role === "primary").map((source) => source.id), sources_used_in_report: [], user_supplied_sources: [], source_transparency_enabled: true,
  };
  spec.filter_rules = {
    must_include: ["报名", "申请", "申报", "采购", "合作", "征集", "招募", "open call", "apply", "deadline"],
    // Negative keywords are scored as penalties in the candidate gate; keep the
    // hard exclusion list narrow for backward compatibility with the profile contract.
    must_exclude: ["结果公示", "获奖名单", "招聘", "closed", "past deadline"],
    low_priority_signals: ["主页", "聚合列表", "无截止日期", "仅新闻"],
    high_priority_signals: ["官方详情页", "报名入口", "截止日期", "申请资格", "采购公告"],
    requires_manual_review: ["来源为聚合页", "字段冲突", "地区不明确", "截止日期不明确"],
  };
  spec.scoring_rules = createIchScoringRules();
  spec.requirement_confidence = { total: 92, client_identity: { score: 95, weight: 15, reason: "ICH audience is defined" }, business_goal: { score: 95, weight: 20, reason: "discovery and action are explicit" }, opportunity_type: { score: 90, weight: 20, reason: "ten search lanes map to six public categories" }, region_scope: { score: 90, weight: 10, reason: "China plus overseas is explicit" }, exclusion_rules: { score: 90, weight: 10, reason: "result/news/closed signals excluded" }, action_scenario: { score: 90, weight: 15, reason: "application, procurement and collaboration actions" }, report_format: { score: 90, weight: 10, reason: "auditable cards with evidence" } };
  spec.confirmation_status = { status: "confirmed", user_confirmed: true, confirmed_at: "2026-09-05T00:00:00+08:00", last_user_feedback: "Radar Engine integration confirmed", revision_count: 1 };
  spec.primary_subject = "非遗机会发现";
  spec.profile_version = 1;
  spec.radar_version = {
    version: ICH_RADAR_PROFILE_VERSION,
    oneSentencePositioning: ICH_RADAR_PROFILE.purpose,
    targetUser: ICH_RADAR_PROFILE.audience.join("、"),
    businessContext: "ICH Radar Profile runs on the shared ChancePing Search Engine and Evidence Pipeline.",
    opportunityIntents: [...ICH_RADAR_PROFILE.lanes],
    highValueCriteria: ["官方详情页", "明确行动入口", "当前届次与截止日期", "申请主体匹配", "非遗/传统工艺关联"],
    exclusionRules: spec.opportunity_scope.excluded_opportunity_types,
    prioritySourceArchetypes: ["official_event_site", "procurement_or_supplier_portal", "open_call_submission_page", "government_grant_page"],
    queryFamilies: buildQueryFamilies(),
    scoringRules: scoringDimensions.map((item) => ({ ...item, highScoreRule: `${item.label}有一手证据且与当前机会一致。` })),
    reportTemplate: ["当前机会", "即将截止", "观察线索", "字段证据", "下一步行动"],
    missingConfig: [], defaultAssumptions: ["搜索结果仅为候选", "正式发布需要详情页证据"],
    revisionNotes: [{ type: "source_shift", detail: "建立 ICH Profile，复用通用 Search Engine 与 Evidence Pipeline。" }],
    resultBuckets: ["direct_opportunity", "business_lead", "channel_partner_lead", "watch_signal"],
  };
  spec.risk_policy = { required_fields: ICH_RADAR_PROFILE.requiredFields, manual_review_fields: ["deadline_text", "geography", "category_hint", "application_url"], disqualifying_signals: ["重复 primary URL", "来源不可访问", "仅聚合主页", "已过期"] };
  spec.report_blueprint = { common_sections: ["机会名称", "主办方", "截止日期", "地区", "官方来源", "证据状态"], vertical_sections: ["非遗关联性", "工艺类别", "申请主体", "行动入口"] };
  spec.scoring_policy = { version: ICH_RADAR_PROFILE_VERSION, dimensions: scoringDimensions, thresholds: { S: 90, A: 80, B: 65, C: 50 } };
  return spec;
}
