import { createDefaultSpec, type RadarRequirementSpec } from "../src/schema/radar-requirement-spec";
import type { OpportunityKind, SourceArchetypeId } from "../src/schema/radar-mvp-contracts";
import type { RadarVersionQueryFamily } from "../src/schema/radar-version-spec";
import type { LLMAdapter, LLMRequest, LLMResponse } from "../src/agents/llm-adapter";
import type { SearchResult } from "../src/search/types";
import { assessCandidateRelevance } from "../src/search/candidate-relevance";
import { assessCandidatePageType, applyCandidatePageTypeGate } from "../src/search/candidate-page-type";
import { applyCandidateJudgeGate } from "../src/search/candidate-llm-judge";
import { applyCandidateOwnershipGate } from "../src/search/candidate-ownership";
import { rankCandidateResults } from "../src/search/candidate-ranking";

class AlwaysAcceptKeyOpportunityAdapter implements LLMAdapter {
  async chat(request: LLMRequest): Promise<LLMResponse> {
    const payload = JSON.parse(request.messages.at(-1)?.content ?? "{}") as { candidates?: Array<{ url?: string }> };
    const candidates = (payload.candidates ?? []).map((item) => ({
      url: item.url,
      candidate_type: "key_opportunity",
      beneficiary_fit: "fit",
      action_fit: "fit",
      source_fit: "fit",
      freshness_fit: "valid",
      relevance_score: 94,
      decision: "accept",
      reason: "Q.6-J fixture confirms this page is an actionable entry for the current radar.",
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

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail = ""): void {
  if (condition) {
    passed += 1;
    console.log(`PASS ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL ${name}${detail ? ` -> ${detail}` : ""}`);
  }
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
    whyThisFamily: `Q.6-J fixture for ${familyName}`,
  };
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
    reportTemplate: ["重点机会", "可行动线索", "待复核项"],
    missingConfig: [],
    defaultAssumptions: [],
    revisionNotes: [],
    resultBuckets: ["direct_opportunity", "business_lead", "channel_partner_lead", "customer_lead", "watch_signal"],
  };
  return spec;
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
    search_theme: "Q.6-J fixture",
    query_family: "Q.6-J fixture",
    query_variant: "action_keyword",
    intent_type: semanticType === "rejected" ? "watch_signal" : semanticType,
    semantic_type: semanticType,
    original_semantic_type: semanticType,
    source_archetype: sourceArchetype,
    source_archetype_label: sourceArchetype,
  };
}

const aiStartupSpec = toSpec({
  targetUser: "AI 工具创业者",
  businessContext: "寻找未来45天内 AI Agent、AI 应用、Hackathon、云厂商创业扶持和开发者大赛机会",
  opportunityIntents: ["AI Agent Hackathon", "AI 应用开发者大赛", "云厂商创业扶持", "startup credits"],
  highValueCriteria: ["仍可申请", "有报名或申请入口", "创业者可参与"],
  exclusionRules: ["旧活动", "资格说明页"],
  prioritySourceArchetypes: ["开发者大赛官网", "云厂商创业扶持页", "加速器申请页"],
  queryFamilies: [
    family("AI 创业者可申请项目", "direct_opportunity", "official_event_site", ["AI developer competition registration"]),
  ],
});

const headhunterSpec = toSpec({
  targetUser: "跨境财务岗位猎头顾问",
  businessContext: "寻找香港、新加坡、广州有跨境财务、资金、税务、内控招聘需求的公司",
  opportunityIntents: ["公司招聘需求", "跨境财务岗位", "可外联公司线索"],
  highValueCriteria: ["公司直接招聘", "可识别招聘公司", "官网招聘或扩张信号"],
  exclusionRules: ["求职培训", "猎头本人招聘"],
  prioritySourceArchetypes: ["公司官网招聘页", "企业联系人页面", "协会会员目录"],
  queryFamilies: [
    family("企业财务岗位招聘信号", "business_lead", "company_careers_or_contact", ["Hong Kong current vacancies treasury controller"]),
  ],
});

const kidsCodingSpec = toSpec({
  targetUser: "少儿编程培训机构",
  businessContext: "寻找招生合作、学校社区科创活动合作、竞赛承办、课程采购和渠道合作机会",
  opportunityIntents: ["少儿编程招生合作", "学校科创活动合作", "竞赛承办", "课程采购"],
  highValueCriteria: ["机构可承办或合作", "面向少儿编程机构", "有学校或机构合作入口"],
  exclusionRules: ["加盟广告", "大学生个人参赛"],
  prioritySourceArchetypes: ["学校合作页", "采购公告", "教育机构合作页"],
  queryFamilies: [
    family("少儿编程学校合作", "business_lead", "business_matching_platform", ["少儿编程 学校 合作 课程采购"]),
  ],
});

const environmentVendorSpec = toSpec({
  targetUser: "工业环保设备供应商",
  businessContext: "寻找广东和长三角环保项目招标、政府采购、园区改造、制造业绿色转型项目机会",
  opportunityIntents: ["环保设备招标", "废气治理项目", "污水处理项目", "除尘设备采购", "园区绿色转型项目"],
  highValueCriteria: ["设备供应商可投标", "采购范围包含环保设备或治理服务"],
  exclusionRules: ["普通装修", "绿化养护", "政策规划"],
  prioritySourceArchetypes: ["政府采购页", "招标公告", "园区项目公告"],
  queryFamilies: [
    family("工业环保设备招标", "direct_opportunity", "procurement_or_supplier_portal", ["工业环保设备 废气治理 除尘 招标"]),
  ],
});

async function runFullCandidatePipeline(candidate: SearchResult, spec: RadarRequirementSpec): Promise<SearchResult[]> {
  candidate.relevance_assessment = assessCandidateRelevance(candidate, spec, {
    now: new Date("2026-07-03T00:00:00+08:00"),
  });
  const pageGate = applyCandidatePageTypeGate([candidate], spec, {
    now: new Date("2026-07-03T00:00:00+08:00"),
  });
  const judgeGate = await applyCandidateJudgeGate(pageGate.assessedResults, spec, new AlwaysAcceptKeyOpportunityAdapter(), {
    mode: "llm",
    now: new Date("2026-07-03T00:00:00+08:00"),
  });
  const ownershipGate = applyCandidateOwnershipGate(judgeGate.assessedResults, spec, {
    now: new Date("2026-07-03T00:00:00+08:00"),
  });
  const ranked = rankCandidateResults(ownershipGate.assessedResults, spec, {
    now: new Date("2026-07-03T00:00:00+08:00"),
  });
  return ranked.assessedResults;
}

async function main(): Promise<void> {
  const vacancies = assessCandidatePageType(
    result(
      "職位空缺- 香港金融管理局",
      "Current vacancies include finance manager, treasury, tax and internal control roles with an application route.",
      "business_lead",
      "company_careers_or_contact",
      "https://www.hkma.gov.hk/chi/about-us/join-us/current-vacancies",
    ),
    headhunterSpec,
    { now: new Date("2026-07-03T00:00:00+08:00") },
  );
  check("current-vacancies URL is classified as company careers before about-us", vacancies.pageType === "company_careers_page", JSON.stringify(vacancies));
  check("current-vacancies page remains key-card eligible", vacancies.keyCardEligibility === "eligible", JSON.stringify(vacancies));

  const plainAboutUs = assessCandidatePageType(
    result(
      "关于我们",
      "机构介绍页面，只说明组织使命，没有招聘、岗位、报名、采购或合作入口。",
      "business_lead",
      "company_careers_or_contact",
      "https://example.org/about-us",
    ),
    headhunterSpec,
    { now: new Date("2026-07-03T00:00:00+08:00") },
  );
  check("plain about-us still stays out of key cards", plainAboutUs.pageType === "about_us" && plainAboutUs.keyCardEligibility !== "eligible", JSON.stringify(plainAboutUs));

  const acceptedReferenceEntry = await runFullCandidatePipeline(
    result(
      "AI开发者创新应用赛 - 算法大赛-天池大赛-阿里云的赛制",
      "开发者创新应用赛页面提供报名入口和参赛规则，AI 工具创业者可提交作品申请参赛。",
      "reference_case",
      "official_event_site",
      "https://tianchi.aliyun.com/competition/entrance/531802/introduction",
    ),
    aiStartupSpec,
  );
  const accepted = acceptedReferenceEntry[0];
  check("LLM-accepted eligible reference entry is restored to key semantic bucket", accepted.semantic_type === "direct_opportunity", JSON.stringify({
    semantic: accepted.semantic_type,
    judge: accepted.candidate_judge_assessment,
    ownership: accepted.ownership_assessment,
    ranking: accepted.candidate_ranking_assessment,
  }));
  check("LLM-accepted eligible reference entry can become key card", accepted.candidate_ranking_assessment?.capStatus === "included", JSON.stringify(accepted.candidate_ranking_assessment));

  const genericTalentBridge = await runFullCandidatePipeline(
    result(
      "智归科创--海外人才归国桥梁",
      "海外人才归国项目提供报名二维码和城市科创政策说明，但未显示少儿编程机构、学校课程采购、课后服务、承办或招生合作入口。",
      "direct_opportunity",
      "business_matching_platform",
      "https://chinazhigui.example.com/h-nr--0_857_5.html",
    ),
    kidsCodingSpec,
  );
  check("kids coding radar does not accept generic talent-return tech program", genericTalentBridge[0].candidate_ranking_assessment?.capStatus !== "included", JSON.stringify({
    semantic: genericTalentBridge[0].semantic_type,
    judge: genericTalentBridge[0].candidate_judge_assessment,
    ownership: genericTalentBridge[0].ownership_assessment,
    ranking: genericTalentBridge[0].candidate_ranking_assessment,
  }));

  const greenFactoryApplication = await runFullCandidatePipeline(
    result(
      "广东绿色工厂、绿色园区申报启动！ - CTI华测检测",
      "绿色工厂和绿色园区申报通知，企业可提交申报材料申请绿色制造认证并咨询服务机构。",
      "direct_opportunity",
      "government_grant_page",
      "https://www.cti-cert.example.com/new/44628.html",
    ),
    environmentVendorSpec,
  );
  check("environment equipment vendor does not accept green-factory certification application as supplier project", greenFactoryApplication[0].candidate_ranking_assessment?.capStatus !== "included", JSON.stringify({
    semantic: greenFactoryApplication[0].semantic_type,
    judge: greenFactoryApplication[0].candidate_judge_assessment,
    ownership: greenFactoryApplication[0].ownership_assessment,
    ranking: greenFactoryApplication[0].candidate_ranking_assessment,
  }));

  const spamCareerPage = await runFullCandidatePipeline(
    result(
      "新加坡|解放军- beplay全站登陆",
      "Company careers location Singapore includes finance, treasury and controller jobs, but title shows beplay 全站登陆 spam.",
      "customer_lead",
      "company_careers_or_contact",
      "https://www.lisalozano.example.com/careers/locations/singapore",
    ),
    headhunterSpec,
  );
  check("headhunter radar does not include gambling/spam career-looking page", spamCareerPage[0].candidate_ranking_assessment?.capStatus !== "included", JSON.stringify({
    page: spamCareerPage[0].page_type_assessment,
    judge: spamCareerPage[0].candidate_judge_assessment,
    ownership: spamCareerPage[0].ownership_assessment,
    ranking: spamCareerPage[0].candidate_ranking_assessment,
  }));

  if (failed > 0) {
    console.error(`Q.6-J gate calibration: ${passed} PASS / ${failed} FAIL`);
    process.exit(1);
  }
  console.log(`Q.6-J gate calibration: ${passed} PASS / 0 FAIL`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
