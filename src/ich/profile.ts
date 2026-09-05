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
] as const;

const LANE_QUERIES: Array<{
  familyName: string;
  intentType: RadarVersionQueryFamily["intentType"];
  sourceArchetype: string;
  queries: string[];
  whyThisFamily: string;
  resultBucket: RadarVersionQueryFamily["resultBucket"];
}> = [
  { familyName: "非遗赛事与征集", intentType: "direct_opportunity", sourceArchetype: "official_event_site", queries: ["非遗 传统工艺 文创 设计大赛 报名 官方", "非物质文化遗产 作品征集 截止 官方"], whyThisFamily: "寻找可直接报名、投稿或申报的官方赛事与征集。", resultBucket: "direct_opportunity" },
  { familyName: "文化采购与项目承接", intentType: "business_lead", sourceArchetype: "procurement_or_supplier_portal", queries: ["非遗 传统工艺 文创 产品采购 招标 官方", "博物馆 文化馆 文创 展陈 采购 比选"], whyThisFamily: "寻找采购、比选、项目承接及供应商入库线索。", resultBucket: "business_lead" },
  { familyName: "湾区在地合作", intentType: "channel_partner_lead", sourceArchetype: "business_matching_platform", queries: ["广州 广东 非遗 传统工艺 文创 合作 入驻 联名", "粤港澳大湾区 非遗 展销 市集 采购"], whyThisFamily: "覆盖广州、广东及大湾区的展销、入驻、联名与研学机会。", resultBucket: "channel_partner_lead" },
  { familyName: "国际工艺开放机会", intentType: "direct_opportunity", sourceArchetype: "open_call_submission_page", queries: ["craft heritage craft open call residency award official", "international craft design competition application official"], whyThisFamily: "寻找国际工艺奖项、驻地、展览与开放征集。", resultBucket: "direct_opportunity" },
  { familyName: "文化遗产资助与交流", intentType: "direct_opportunity", sourceArchetype: "government_grant_page", queries: ["intangible cultural heritage craft grant fellowship official", "cultural heritage cultural exchange funding call for proposals"], whyThisFamily: "寻找文化遗产、创意产业和国际交流的资助与 fellowship。", resultBucket: "direct_opportunity" },
];

function buildQueryFamilies(): RadarVersionQueryFamily[] {
  return LANE_QUERIES.map((family) => ({
    ...family,
    queryVariants: family.queries.map((query, index) => ({ query, variant: index === 0 ? "broad_discovery" : "action_keyword" })),
  }));
}

const scoringDimensions = [
  { key: "heritage_relevance", label: "非遗/传统工艺相关性", weight: 25 },
  { key: "evidence_authority", label: "来源权威与证据完整度", weight: 25 },
  { key: "timeliness", label: "时效与截止临近度", weight: 15 },
  { key: "eligibility_fit", label: "申请主体匹配度", weight: 15 },
  { key: "actionability", label: "行动入口可执行性", weight: 15 },
  { key: "source_risk", label: "来源风险扣分", weight: 5 },
];

export const ICH_RADAR_PROFILE: IchRadarProfile = {
  id: ICH_RADAR_PROFILE_ID,
  version: ICH_RADAR_PROFILE_VERSION,
  purpose: "为非遗手艺人、工作室、品牌与文创团队发现可参与的项目、赛事、采购与合作机会。",
  audience: ["非遗手艺人", "工作室", "文创品牌", "文化创意团队"],
  queryPackIds: [...QUERY_PACK_IDS],
  lanes: ["competition", "exhibition", "market", "procurement", "channel", "funding", "international", "residency", "education", "brand_collaboration"],
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
    core_keywords_zh: ["非遗", "非物质文化遗产", "传统工艺", "工艺美术", "文创", "文化创意", "设计大赛", "采购", "合作", "资助"],
    core_keywords_en: ["intangible cultural heritage", "heritage craft", "traditional craft", "craft prize", "open call", "residency", "procurement", "cultural exchange"],
    expanded_keywords_zh: ["征集", "招募", "申报", "入驻", "联名", "展销", "研学", "驻地", "基金", "fellowship"],
    expanded_keywords_en: ["competition", "exhibition", "market", "commission", "studio", "grant", "funding", "fellowship"],
    negative_keywords: ["结果公告", "获奖名单", "招聘", "已结束", "closed", "past deadline"],
  };
  spec.source_strategy = {
    official_sites: sourceUrls(), platforms: ["政府采购平台", "官方赛事平台"], search_engines: [...ICH_PROVIDER_ROUTING.primary, ...ICH_PROVIDER_ROUTING.fallback], social_media: [], rss_sources: [], manual_sources: [],
    source_priority: getIchSourceRegistryV2().sources.filter((source) => source.role === "primary").map((source) => source.id), sources_used_in_report: [], user_supplied_sources: [], source_transparency_enabled: true,
  };
  spec.filter_rules = {
    must_include: ["报名", "申请", "申报", "采购", "合作", "征集", "招募", "open call", "apply", "deadline"],
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
