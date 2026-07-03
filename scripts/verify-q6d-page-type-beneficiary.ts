import { createDefaultSpec, type RadarRequirementSpec } from "../src/schema/radar-requirement-spec";
import type { OpportunityKind, SourceArchetypeId } from "../src/schema/radar-mvp-contracts";
import type { RadarVersionQueryFamily } from "../src/schema/radar-version-spec";
import type { SearchResult } from "../src/search/types";
import {
  applyCandidatePageTypeGate,
  assessCandidatePageType,
  isKeyPageEligible,
  type CandidatePageType,
} from "../src/search/candidate-page-type";
import { judgeCandidateBatch, applyCandidateJudgeGate } from "../src/search/candidate-llm-judge";
import { assessCandidateRelevance } from "../src/search/candidate-relevance";
import { rankCandidateResults } from "../src/search/candidate-ranking";
import { buildOpportunityStrategy } from "../src/search/opportunity-strategy";
import type { LLMAdapter, LLMRequest, LLMResponse } from "../src/agents/llm-adapter";

class EmptyJsonAdapter implements LLMAdapter {
  async chat(_request: LLMRequest): Promise<LLMResponse> {
    return { content: "{\"candidates\":[]}", parsed: { candidates: [] } };
  }
}

class AlwaysAcceptAdapter implements LLMAdapter {
  async chat(request: LLMRequest): Promise<LLMResponse> {
    const payload = JSON.parse(request.messages.at(-1)?.content ?? "{}") as { candidates?: Array<{ url?: string }> };
    const candidates = (payload.candidates ?? []).map((item) => ({
      url: item.url,
      candidate_type: "key_opportunity",
      beneficiary_fit: "fit",
      action_fit: "fit",
      source_fit: "fit",
      freshness_fit: "valid",
      relevance_score: 95,
      decision: "accept",
      reason: "LLM fixture tries to upgrade candidate",
    }));
    return { content: JSON.stringify({ candidates }), parsed: { candidates } };
  }
}

interface ProfileFixture {
  targetUser: string;
  businessContext: string;
  opportunityIntents: string[];
  highValueCriteria: string[];
  exclusionRules: string[];
  prioritySourceArchetypes: string[];
  queryFamilies: RadarVersionQueryFamily[];
}

let failed = 0;

function check(name: string, condition: boolean, detail = ""): void {
  if (condition) {
    console.log(`PASS ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL ${name}${detail ? ` -> ${detail}` : ""}`);
  }
}

function toSpec(profile: ProfileFixture): RadarRequirementSpec {
  const spec = createDefaultSpec();
  spec.client_profile.client_type = profile.targetUser;
  spec.client_profile.business_type = profile.targetUser;
  spec.core_goals.primary_goal = profile.businessContext;
  spec.opportunity_scope.primary_opportunity_types = profile.opportunityIntents;
  spec.keyword_strategy.core_keywords_zh = profile.opportunityIntents;
  spec.filter_rules.must_exclude = profile.exclusionRules;
  spec.radar_version = {
    version: "V1.0",
    oneSentencePositioning: `${profile.targetUser}机会雷达`,
    targetUser: profile.targetUser,
    businessContext: profile.businessContext,
    opportunityIntents: profile.opportunityIntents,
    highValueCriteria: profile.highValueCriteria,
    exclusionRules: profile.exclusionRules,
    prioritySourceArchetypes: profile.prioritySourceArchetypes,
    queryFamilies: profile.queryFamilies,
    scoringRules: [],
    reportTemplate: ["重点机会", "行动建议", "待复核项"],
    missingConfig: [],
    defaultAssumptions: [],
    revisionNotes: [],
    resultBuckets: ["direct_opportunity", "business_lead", "channel_partner_lead", "customer_lead", "watch_signal"],
  };
  return spec;
}

function family(
  familyName: string,
  intentType: RadarVersionQueryFamily["intentType"],
  sourceArchetype: string,
  queries: string[],
): RadarVersionQueryFamily {
  return {
    familyName,
    intentType,
    sourceArchetype,
    queries,
    whyThisFamily: `Q.6-D fixture for ${familyName}`,
  };
}

function result(
  title: string,
  snippet: string,
  semanticType: OpportunityKind,
  sourceArchetype: SourceArchetypeId,
  url: string,
): SearchResult {
  return {
    title,
    url,
    snippet,
    source_provider: "fixture",
    source_type: "web",
    published_at: "2026-07-01",
    search_query: title,
    search_theme: "Q.6-D fixture",
    query_family: "Q.6-D fixture",
    query_variant: "action_keyword",
    intent_type: semanticType === "rejected" ? "watch_signal" : semanticType,
    semantic_type: semanticType,
    source_archetype: sourceArchetype,
    source_archetype_label: sourceArchetype,
  };
}

const profiles = {
  genericVendor: toSpec({
    targetUser: "员工福利和节日礼品供应商",
    businessContext: "寻找企业福利采购、工会福利项目、供应商入库和节日礼品招标",
    opportunityIntents: ["福利采购", "供应商入库", "节日礼品招标"],
    highValueCriteria: ["采购公告原文", "供应商可提交材料", "有申请或投标入口"],
    exclusionRules: ["加盟广告", "模板资料"],
    prioritySourceArchetypes: ["采购公告", "供应商门户", "工会官网"],
    queryFamilies: [
      family("福利采购供应商入口", "direct_opportunity", "procurement_or_supplier_portal", ["员工福利 供应商 入库 采购 公告"]),
    ],
  }),
  kidsCoding: toSpec({
    targetUser: "少儿编程培训机构",
    businessContext: "寻找招生合作、学校社区科创活动合作、竞赛承办、课程采购和渠道合作机会",
    opportunityIntents: ["少儿编程招生合作", "学校科创活动合作", "竞赛承办", "课程采购"],
    highValueCriteria: ["机构可承办或合作", "面向少儿编程机构", "有学校或机构合作入口"],
    exclusionRules: ["加盟广告", "大学生个人参赛"],
    prioritySourceArchetypes: ["学校合作页", "采购公告", "教育机构合作页"],
    queryFamilies: [
      family("少儿编程学校合作", "business_lead", "business_matching_platform", ["少儿编程 学校 合作 课程采购"]),
    ],
  }),
  environmentVendor: toSpec({
    targetUser: "工业环保设备供应商",
    businessContext: "寻找广东和长三角环保项目招标、政府采购与园区改造",
    opportunityIntents: ["环保设备招标", "政府采购", "园区绿色改造"],
    highValueCriteria: ["设备供应商可投标", "采购范围包含环保设备或治理服务"],
    exclusionRules: ["普通装修", "绿化养护"],
    prioritySourceArchetypes: ["政府采购页", "招标公告", "园区项目公告"],
    queryFamilies: [
      family("工业环保设备招标", "direct_opportunity", "procurement_or_supplier_portal", ["工业环保设备 废气治理 除尘 招标"]),
    ],
  }),
  weddingCompany: toSpec({
    targetUser: "广州婚庆公司",
    businessContext: "寻找高端婚礼客户线索、酒店会所合作、品牌异业合作和供应商招募",
    opportunityIntents: ["高端客户线索", "酒店会所合作", "品牌异业合作", "婚礼供应商招募"],
    highValueCriteria: ["有合作入口", "有酒店会所或品牌合作对象", "可外联"],
    exclusionRules: ["趋势文章", "低价套餐广告"],
    prioritySourceArchetypes: ["酒店合作页", "品牌合作入口", "会展活动招商"],
    queryFamilies: [
      family("高端婚礼合作入口", "business_lead", "business_matching_platform", ["广州 酒店 婚礼 合作 供应商 招募"]),
    ],
  }),
  heritageCreative: toSpec({
    targetUser: "岭南押花非遗和文创产品公司",
    businessContext: "寻找文创赛事、博物馆文创征集、文旅伴手礼采购和非遗展会机会",
    opportunityIntents: ["文创赛事", "博物馆文创征集", "伴手礼采购", "非遗展会"],
    highValueCriteria: ["有作品征集或采购入口", "有参展或报名方式"],
    exclusionRules: ["历史列表", "汇总表"],
    prioritySourceArchetypes: ["征集公告", "政府采购页", "展会报名页"],
    queryFamilies: [
      family("非遗文创征集采购", "direct_opportunity", "open_call_submission_page", ["非遗 文创 征集 采购 报名"]),
    ],
  }),
  headhunter: toSpec({
    targetUser: "跨境财务岗位猎头顾问",
    businessContext: "寻找香港、新加坡、广州有跨境财务、资金、税务、内控招聘需求的公司",
    opportunityIntents: ["公司招聘需求", "跨境财务岗位", "可外联公司线索"],
    highValueCriteria: ["公司直接招聘", "可识别招聘公司", "官网或联系人入口"],
    exclusionRules: ["求职培训", "猎头本人招聘"],
    prioritySourceArchetypes: ["公司官网招聘页", "企业联系人页面", "协会会员目录"],
    queryFamilies: [
      family("企业财务岗位招聘信号", "business_lead", "company_careers_or_contact", ["Hong Kong careers tax finance controller"]),
      family("金融协会会员公司目录", "association_directory", "association_member_directory", ["Hong Kong finance association member directory"]),
    ],
  }),
  aiStartup: toSpec({
    targetUser: "AI 工具创业者",
    businessContext: "寻找未来45天内 AI Agent、AI 应用、Hackathon、云厂商创业扶持和开发者大赛机会",
    opportunityIntents: ["AI Agent Hackathon", "AI 应用开发者大赛", "云厂商创业扶持", "startup credits"],
    highValueCriteria: ["仍可申请", "有报名或申请入口", "创业者可参与"],
    exclusionRules: ["旧活动", "资格说明页"],
    prioritySourceArchetypes: ["开发者大赛官网", "云厂商创业扶持页", "加速器申请页"],
    queryFamilies: [
      family("AI 创业者可申请项目", "direct_opportunity", "official_event_site", ["AI startup program application"]),
    ],
  }),
  crossBorderEcommerce: toSpec({
    targetUser: "跨境电商卖家或服务商",
    businessContext: "寻找平台招商、大促报名、卖家活动、供应链合作和海外仓履约合作",
    opportunityIntents: ["平台招商", "卖家报名", "平台大促活动", "海外仓履约合作", "marketplace partner program"],
    highValueCriteria: ["卖家可申请", "有平台招商或报名入口", "可合作或入驻"],
    exclusionRules: ["政策规划", "行业新闻"],
    prioritySourceArchetypes: ["平台卖家中心", "Marketplace partner page", "海外仓合作页"],
    queryFamilies: [
      family("跨境平台招商报名", "business_lead", "marketplace_partner_page", ["cross-border ecommerce seller program"]),
    ],
  }),
};

function pageCase(
  expectedType: CandidatePageType,
  keyEligible: boolean,
  candidate: SearchResult,
  spec: RadarRequirementSpec = profiles.genericVendor,
): void {
  const assessment = assessCandidatePageType(candidate, spec, {
    now: new Date("2026-07-03T00:00:00+08:00"),
  });
  check(`${candidate.title} page type`, assessment.pageType === expectedType, `expected=${expectedType} actual=${assessment.pageType} reasons=${assessment.reasonCodes.join(",")}`);
  check(`${candidate.title} key eligibility`, isKeyPageEligible(assessment) === keyEligible, `eligible=${assessment.keyCardEligibility} reasons=${assessment.reasonCodes.join(",")}`);
}

async function judgeDecision(candidate: SearchResult, spec: RadarRequirementSpec): Promise<SearchResult> {
  candidate.relevance_assessment = assessCandidateRelevance(candidate, spec, {
    now: new Date("2026-07-03T00:00:00+08:00"),
  });
  const gated = applyCandidatePageTypeGate([candidate], spec, {
    now: new Date("2026-07-03T00:00:00+08:00"),
  });
  const judged = await applyCandidateJudgeGate(gated.assessedResults, spec, new EmptyJsonAdapter(), {
    mode: "fallback",
    now: new Date("2026-07-03T00:00:00+08:00"),
  });
  return judged.assessedResults[0];
}

async function judgeDecisionWithUpgradeAttempt(candidate: SearchResult, spec: RadarRequirementSpec): Promise<SearchResult> {
  candidate.relevance_assessment = assessCandidateRelevance(candidate, spec, {
    now: new Date("2026-07-03T00:00:00+08:00"),
  });
  const gated = applyCandidatePageTypeGate([candidate], spec, {
    now: new Date("2026-07-03T00:00:00+08:00"),
  });
  const judged = await applyCandidateJudgeGate(gated.assessedResults, spec, new AlwaysAcceptAdapter(), {
    mode: "llm",
    now: new Date("2026-07-03T00:00:00+08:00"),
  });
  return judged.assessedResults[0];
}

async function main(): Promise<void> {
  pageCase(
    "department_index",
    false,
    result("下属单位-深圳市科技创新局网站", "下属单位列表、机构职能和联系方式导航。", "business_lead", "government_grant_page", "https://stic.sz.gov.cn/xxgk/xsdw/"),
  );
  pageCase(
    "xls_summary",
    false,
    result("[XLS] 汇总表（不需要填写）（不要删除）", "政府采购汇总表文件，不含供应商提交入口。", "direct_opportunity", "government_grant_page", "https://example.gov.cn/files/summary.xls"),
  );
  pageCase(
    "template_page",
    false,
    result("节日礼品采购单模板- 飞书官网", "提供采购单模板下载，不是采购方发布的供应商征集。", "business_lead", "reference_case_source", "https://www.feishu.cn/templates/gift-purchase"),
  );
  pageCase(
    "trend_article",
    false,
    result("2026员工福利趋势白皮书", "行业趋势新闻与分析报告，没有供应商报名或采购入口。", "reference_case", "reference_case_source", "https://news.example.com/welfare-trends"),
  );
  pageCase(
    "policy_plan",
    false,
    result("推动跨境电商高质量发展行动方案", "政策规划与行动方案，未提供平台招商或卖家报名入口。", "watch_signal", "government_grant_page", "https://commerce.gov.cn/policy/ecommerce-plan"),
    profiles.crossBorderEcommerce,
  );
  pageCase(
    "aggregator_page",
    false,
    result("环保招标采购信息", "招标平台聚合环保招标采购信息列表，需打开原公告确认。", "business_lead", "procurement_or_supplier_portal", "https://www.bidcenter.com.cn/huanbao/list"),
    profiles.environmentVendor,
  );
  pageCase(
    "registration_page",
    true,
    result("2026全国围棋公开赛报名通知", "面向围棋选手开放报名，含竞赛规程与报名入口。", "direct_opportunity", "official_event_site", "https://weiqi.example.org/register-2026"),
  );
  pageCase(
    "supplier_onboarding",
    true,
    result("广东某集团2026年员工节日福利礼品供应商征集公告", "面向礼品供应商公开征集，含材料清单与提交入口。", "direct_opportunity", "procurement_or_supplier_portal", "https://procurement.example.org/welfare-vendor"),
  );
  pageCase(
    "company_careers_page",
    true,
    result("HK company careers - treasury controller", "Company careers page lists treasury controller hiring and contact route.", "business_lead", "company_careers_or_contact", "https://company.example.com/careers/treasury-controller"),
    profiles.headhunter,
  );
  pageCase(
    "directory_page",
    false,
    result("香港金融协会会员公司目录", "会员公司列表含公司官网和联系方式，可用于逐一外联确认招聘或合作需求。", "association_directory", "association_member_directory", "https://association.example.org/member-directory"),
    profiles.headhunter,
  );

  const directoryLead = await judgeDecision(
    result("香港金融协会会员公司目录", "会员公司列表含公司官网和联系方式，可用于逐一外联确认招聘或合作需求。", "association_directory", "association_member_directory", "https://association.example.org/member-directory"),
    profiles.headhunter,
  );
  check("directory page stays as lead resource, not hard reject", directoryLead.candidate_judge_assessment?.decision !== "reject", directoryLead.candidate_judge_assessment?.reason ?? "");

  const kidsContest = await judgeDecision(
    result("2026年广东省大学生程序设计竞赛报名通知", "面向高校大学生参赛队伍开放报名，学生提交队伍资料。", "direct_opportunity", "official_event_site", "https://education.example.org/acm-2026"),
    profiles.kidsCoding,
  );
  check("kids coding rejects university-only contest", kidsContest.candidate_judge_assessment?.decision === "reject", kidsContest.candidate_judge_assessment?.reason ?? "");

  const renovation = await judgeDecision(
    result("临港工业园节点绿化改造及环境整治工程竞争性磋商公告", "采购范围为园区绿化、铺装和环境整治，未明确环保设备、废气治理、污水处理或除尘设备采购。", "business_lead", "procurement_or_supplier_portal", "https://bid.example.cn/greening-renovation"),
    profiles.environmentVendor,
  );
  check("environment vendor rejects greening without equipment scope", renovation.candidate_judge_assessment?.decision === "reject", renovation.candidate_judge_assessment?.reason ?? "");

  const weddingTrend = await judgeDecision(
    result("广州婚庆消费趋势与城市地标宣传活动", "新闻报道城市婚庆消费趋势和幸福地标征集，没有酒店会所合作或婚礼供应商招募入口。", "business_lead", "reference_case_source", "https://news.example.com/wedding-trend"),
    profiles.weddingCompany,
  );
  check("wedding trend does not become key lead", weddingTrend.candidate_judge_assessment?.decision !== "accept", weddingTrend.candidate_judge_assessment?.reason ?? "");

  const weddingLandmark = await judgeDecision(
    result("广州海珠举办婚庆创新赋能大赛，向社会征集三大婚恋幸福地标", "城市宣传活动征集婚恋幸福地标，没有酒店会所、品牌异业合作或婚礼供应商招募入口。", "direct_opportunity", "reference_case_source", "https://news.example.com/wedding-landmark"),
    profiles.weddingCompany,
  );
  check("wedding landmark branding call is not high-value lead", weddingLandmark.candidate_judge_assessment?.decision !== "accept", weddingLandmark.candidate_judge_assessment?.reason ?? "");

  const heritageXls = await judgeDecision(
    result("[XLS] 非遗文创政府采购汇总表", "汇总表文件，不需要填写，不含作品征集、供应商提交或参展报名入口。", "direct_opportunity", "government_grant_page", "https://culture.gov.cn/files/heritage-summary.xls"),
    profiles.heritageCreative,
  );
  check("heritage XLS summary is not accepted", heritageXls.candidate_judge_assessment?.decision !== "accept", heritageXls.candidate_judge_assessment?.reason ?? "");

  const welfarePdf = await judgeDecision(
    result("[PDF] 通过集体协商构建和谐劳动关系", "PDF 材料介绍劳动关系协商经验，不是员工福利礼品采购公告或供应商入库入口。", "business_lead", "government_grant_page", "https://union.example.org/reports/labor-relations.pdf"),
    profiles.genericVendor,
  );
  check("welfare labor-relations PDF is not supplier opportunity", welfarePdf.candidate_judge_assessment?.decision !== "accept", welfarePdf.candidate_judge_assessment?.reason ?? "");

  const broadUniversityContest = await judgeDecision(
    result("关于举办2026年腾讯CodeBuddy杯广东省大学生程序设计竞赛的通知", "面向广东省高校大学生个人和队伍报名参赛，未说明少儿编程机构可承办、招生或课程合作。", "direct_opportunity", "official_event_site", "https://contest.example.org/codebuddy-university"),
    profiles.kidsCoding,
  );
  check("kids coding rejects broad university programming contest", broadUniversityContest.candidate_judge_assessment?.decision === "reject", broadUniversityContest.candidate_judge_assessment?.reason ?? "");

  const llmUpgradeUniversityContest = await judgeDecisionWithUpgradeAttempt(
    result("赛事报名| 2026年ICPC国际大学生程序设计竞赛全国邀请赛（深圳）", "面向高校大学生个人和队伍报名参赛。", "direct_opportunity", "official_event_site", "https://contest.example.org/icpc-2026"),
    profiles.kidsCoding,
  );
  check("LLM cannot upgrade university programming contest for kids coding radar", llmUpgradeUniversityContest.candidate_judge_assessment?.decision === "reject", llmUpgradeUniversityContest.candidate_judge_assessment?.reason ?? "");

  const llmUpgradeGenericCodingContest = await judgeDecisionWithUpgradeAttempt(
    result("粤港澳大湾区国际编程大赛已开启报名 - 深圳河套学院", "国际编程大赛面向开发者和高校团队报名，未说明少儿编程机构合作、承办或课程采购。", "direct_opportunity", "official_event_site", "https://contest.example.org/gba-coding"),
    profiles.kidsCoding,
  );
  check("LLM cannot upgrade generic programming contest without kids/org action", llmUpgradeGenericCodingContest.candidate_judge_assessment?.decision === "reject", llmUpgradeGenericCodingContest.candidate_judge_assessment?.reason ?? "");

  const environmentPlatformRegistration = await judgeDecision(
    result("一、注册流程 - 首创环保电子商务平台", "介绍平台注册流程和账号登录步骤，未明确环保设备、废气治理、污水处理、除尘设备采购或具体招标项目。", "direct_opportunity", "procurement_or_supplier_portal", "https://ecp.example.cn/register-flow"),
    profiles.environmentVendor,
  );
  check("environment platform registration flow is not equipment opportunity", environmentPlatformRegistration.candidate_judge_assessment?.decision !== "accept", environmentPlatformRegistration.candidate_judge_assessment?.reason ?? "");

  pageCase(
    "information_disclosure",
    false,
    result("信息公开 news information - 广东省环境科学研究院", "机构信息公开栏目，包含新闻和公开信息索引，没有环保设备采购、废气治理或除尘设备招标入口。", "direct_opportunity", "procurement_or_supplier_portal", "https://www.gdei.example.cn/news-information"),
    profiles.environmentVendor,
  );
  pageCase(
    "about_us",
    false,
    result("关于我们_EDF - 美国环保协会", "机构介绍页面，说明组织使命和项目方向，没有供应商入库、合作提交或采购入口。", "business_lead", "reseller_partner_page", "https://edf.example.org/about-us"),
    profiles.environmentVendor,
  );
  pageCase(
    "institution_profile",
    false,
    result("广东环境保护工程职业学院大型仪器设备共享平台", "院校平台介绍和机构信息页面，没有明确采购公告、供应商入库或招标入口。", "business_lead", "procurement_or_supplier_portal", "https://college.example.edu.cn/platform/profile"),
    profiles.environmentVendor,
  );
  pageCase(
    "platform_intro",
    false,
    result("首创环保电子商务平台介绍", "介绍平台能力和注册须知，没有具体环保设备采购、招标项目或供应商提交入口。", "direct_opportunity", "procurement_or_supplier_portal", "https://ecp.example.cn/platform-intro"),
    profiles.environmentVendor,
  );

  const llmUpgradeInformationDisclosure = await judgeDecisionWithUpgradeAttempt(
    result("信息公开 news information - 广东省环境科学研究院", "机构信息公开栏目，包含新闻和公开信息索引，没有环保设备采购、废气治理或除尘设备招标入口。", "direct_opportunity", "procurement_or_supplier_portal", "https://www.gdei.example.cn/news-information"),
    profiles.environmentVendor,
  );
  check("LLM cannot upgrade information disclosure page into key card", llmUpgradeInformationDisclosure.candidate_judge_assessment?.decision !== "accept", llmUpgradeInformationDisclosure.candidate_judge_assessment?.reason ?? "");

  const llmUpgradeAboutUs = await judgeDecisionWithUpgradeAttempt(
    result("关于我们_EDF - 美国环保协会", "机构介绍页面，说明组织使命和项目方向，没有供应商入库、合作提交或采购入口。", "business_lead", "reseller_partner_page", "https://edf.example.org/about-us"),
    profiles.environmentVendor,
  );
  check("LLM cannot upgrade about-us page into key card", llmUpgradeAboutUs.candidate_judge_assessment?.decision !== "accept", llmUpgradeAboutUs.candidate_judge_assessment?.reason ?? "");

  const aggregator = assessCandidatePageType(
    result("推荐公告招标网_广东省招标_其他环保设备招标网_招标信息网站", "招标平台聚合环保招标采购信息列表，需打开原公告确认。", "direct_opportunity", "procurement_or_supplier_portal", "https://www.bidsite.example.cn/huanbao/list"),
    profiles.environmentVendor,
    { now: new Date("2026-07-03T00:00:00+08:00") },
  );
  check("environment bid portal is classified as aggregator", aggregator.pageType === "aggregator_page", aggregator.reason);

  const llmUpgradeAggregator = await judgeDecisionWithUpgradeAttempt(
    result("推荐公告招标网_广东省招标_其他环保设备招标网_招标信息网站", "招标平台聚合环保招标采购信息列表，需打开原公告确认。", "direct_opportunity", "procurement_or_supplier_portal", "https://www.bidsite.example.cn/huanbao/list"),
    profiles.environmentVendor,
  );
  check("LLM cannot upgrade aggregator bid portal into key card", llmUpgradeAggregator.candidate_judge_assessment?.decision !== "accept", llmUpgradeAggregator.candidate_judge_assessment?.reason ?? "");

  const duplicateA = result(
    "广州海珠举办婚庆创新赋能大赛，向社会征集三大婚恋幸福地标",
    "新闻报道婚庆创新赋能大赛和地标征集。",
    "direct_opportunity",
    "reference_case_source",
    "https://news-a.example.com/wedding",
  );
  const duplicateB = result(
    "广州海珠举办婚庆创新赋能大赛，向社会征集三大“婚恋幸福地标”打造",
    "转载同一婚庆创新赋能大赛和地标征集新闻。",
    "direct_opportunity",
    "reference_case_source",
    "https://news-b.example.com/wedding-copy",
  );
  for (const candidate of [duplicateA, duplicateB]) {
    candidate.relevance_assessment = assessCandidateRelevance(candidate, profiles.weddingCompany, { now: new Date("2026-07-03T00:00:00+08:00") });
    candidate.candidate_judge_assessment = {
      candidate_type: "key_opportunity",
      beneficiary_fit: "partial",
      action_fit: "fit",
      source_fit: "partial",
      freshness_fit: "valid",
      relevance_score: 72,
      decision: "accept",
      reason: "duplicate fixture",
      basis: "deterministic_fallback",
      assessedAt: "2026-07-03T00:00:00.000Z",
    };
  }
  const deduped = rankCandidateResults([duplicateA, duplicateB], profiles.weddingCompany, {
    maxKeyCandidates: 5,
    now: new Date("2026-07-03T00:00:00+08:00"),
  });
  check("near duplicate key cards keep only one included", deduped.keyCandidates.length === 1, deduped.keyCandidates.map((item) => item.title).join(" | "));
  check("near duplicate stays in audit as watch", deduped.assessedResults.some((item) => item.candidate_ranking_assessment?.reasonCodes.includes("near_duplicate_key_candidate") && item.semantic_type === "watch_signal"), JSON.stringify(deduped.assessedResults.map((item) => ({ title: item.title, type: item.semantic_type, reasons: item.candidate_ranking_assessment?.reasonCodes }))));

  const restoredCandidate = result(
    "深圳跨境电商展览会",
    "跨境电商展会面向卖家和服务商开放报名，提供平台招商、卖家活动和供应链合作入口。",
    "watch_signal",
    "marketplace_partner_page",
    "https://ecommerce.example.com/seller-expo-register",
  );
  restoredCandidate.original_semantic_type = "direct_opportunity";
  const restoredPageGate = applyCandidatePageTypeGate([restoredCandidate], profiles.crossBorderEcommerce, {
    now: new Date("2026-07-03T00:00:00+08:00"),
  });
  const restoredJudgeGate = await applyCandidateJudgeGate(restoredPageGate.assessedResults, profiles.crossBorderEcommerce, new AlwaysAcceptAdapter(), {
    mode: "llm",
    now: new Date("2026-07-03T00:00:00+08:00"),
  });
  const restoredRanking = rankCandidateResults(restoredJudgeGate.assessedResults, profiles.crossBorderEcommerce, {
    maxKeyCandidates: 5,
    now: new Date("2026-07-03T00:00:00+08:00"),
  });
  check("LLM accepted candidate restores original key semantic bucket", restoredJudgeGate.assessedResults[0]?.semantic_type === "direct_opportunity", JSON.stringify(restoredJudgeGate.assessedResults[0]));
  check("restored accepted candidate becomes included key card", restoredRanking.keyCandidates.length === 1 && restoredRanking.keyCandidates[0]?.candidate_ranking_assessment?.capStatus === "included", JSON.stringify(restoredRanking.assessedResults.map((item) => ({ title: item.title, semantic: item.semantic_type, original: item.original_semantic_type, cap: item.candidate_ranking_assessment?.capStatus }))));

  const aiStrategy = buildOpportunityStrategy(profiles.aiStartup);
  const aiQueries = aiStrategy?.queries.map((item) => item.query.toLowerCase()).join(" | ") ?? "";
  check("AI startup query recovery includes action/source variants", /hackathon|developer challenge|startup credits|cloud startup program|accelerator application/.test(aiQueries), aiQueries);
  check("AI startup query recovery includes cloud/provider variants", /qwen|alibaba cloud|aws|google cloud|microsoft for startups|ai application contest/.test(aiQueries), aiQueries);

  const ecommerceStrategy = buildOpportunityStrategy(profiles.crossBorderEcommerce);
  const ecommerceQueries = ecommerceStrategy?.queries.map((item) => item.query.toLowerCase()).join(" | ") ?? "";
  check("cross-border ecommerce query recovery includes marketplace seller variants", /seller program|marketplace partner|platform campaign|fulfillment partner|overseas warehouse/.test(ecommerceQueries), ecommerceQueries);
  check("cross-border ecommerce query recovery includes platform-specific variants", /shopee|lazada|tiktok shop|amazon global selling|seller registration/.test(ecommerceQueries), ecommerceQueries);

  if (failed > 0) {
    console.error(`Q.6-D page type and beneficiary strictness: ${failed} FAIL`);
    process.exit(1);
  }
  console.log("Q.6-D page type and beneficiary strictness: PASS");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
