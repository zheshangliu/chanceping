import { createDefaultSpec, type RadarRequirementSpec } from "../src/schema/radar-requirement-spec";
import type { OpportunityKind, SourceArchetypeId } from "../src/schema/radar-mvp-contracts";
import type { RadarVersionQueryFamily } from "../src/schema/radar-version-spec";
import type { SearchResult } from "../src/search/types";
import { assessCandidateRelevance } from "../src/search/candidate-relevance";
import { applyCandidatePageTypeGate } from "../src/search/candidate-page-type";
import { applyCandidateJudgeGate } from "../src/search/candidate-llm-judge";
import { applyCandidateOwnershipGate } from "../src/search/candidate-ownership";
import { rankCandidateResults } from "../src/search/candidate-ranking";
import type { LLMAdapter, LLMRequest, LLMResponse } from "../src/agents/llm-adapter";

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
      relevance_score: 96,
      decision: "accept",
      reason: "Q.6-I fixture tries to upgrade candidate",
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
    return;
  }
  failed += 1;
  console.error(`FAIL ${name}${detail ? ` -> ${detail}` : ""}`);
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
    whyThisFamily: `Q.6-I fixture for ${familyName}`,
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
    reportTemplate: ["重点机会", "行动建议", "待复核项"],
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
    search_theme: "Q.6-I fixture",
    query_family: "Q.6-I fixture",
    query_variant: "action_keyword",
    intent_type: semanticType === "rejected" ? "watch_signal" : semanticType,
    semantic_type: semanticType,
    original_semantic_type: semanticType,
    source_archetype: sourceArchetype,
    source_archetype_label: sourceArchetype,
  };
}

const profiles = {
  tableTennisPlayer: toSpec({
    targetUser: "乒乓球选手",
    businessContext: "寻找未来30天内国内外可报名的乒乓球公开赛、WTT赛事和 ITTF 相关比赛",
    opportunityIntents: ["乒乓球公开赛", "WTT赛事", "ITTF相关比赛", "赛事报名"],
    highValueCriteria: ["选手可报名", "有参赛规程", "有 entry 或报名入口"],
    exclusionRules: ["培训广告", "视频集锦"],
    prioritySourceArchetypes: ["WTT 官网", "ITTF 官网", "中国乒协官网"],
    queryFamilies: [
      family("乒乓球赛事报名入口", "direct_opportunity", "official_event_site", ["WTT entry registration table tennis"]),
    ],
  }),
  headhunter: toSpec({
    targetUser: "跨境财务岗位猎头顾问",
    businessContext: "寻找香港、新加坡、广州有跨境财务、资金、税务、内控招聘需求的公司",
    opportunityIntents: ["公司招聘需求", "跨境财务岗位", "可外联公司线索"],
    highValueCriteria: ["公司直接招聘", "可识别招聘公司", "官网招聘或扩张信号"],
    exclusionRules: ["求职培训", "猎头本人招聘"],
    prioritySourceArchetypes: ["公司官网招聘页", "企业联系人页面", "协会会员目录"],
    queryFamilies: [
      family("企业财务岗位招聘信号", "business_lead", "company_careers_or_contact", ["Hong Kong careers tax finance controller"]),
    ],
  }),
  environmentVendor: toSpec({
    targetUser: "工业环保设备供应商",
    businessContext: "寻找环保设备招标、废气治理、污水处理、除尘设备和园区绿色改造项目",
    opportunityIntents: ["环保设备招标", "废气治理项目", "污水处理项目", "除尘设备采购"],
    highValueCriteria: ["设备供应商可投标", "采购范围包含环保设备或治理服务"],
    exclusionRules: ["普通装修", "绿化养护", "政策规划"],
    prioritySourceArchetypes: ["政府采购页", "招标公告", "园区项目公告"],
    queryFamilies: [
      family("工业环保设备招标", "direct_opportunity", "procurement_or_supplier_portal", ["工业环保设备 废气治理 除尘 招标"]),
    ],
  }),
};

async function assess(candidate: SearchResult, spec: RadarRequirementSpec): Promise<SearchResult> {
  candidate.relevance_assessment = assessCandidateRelevance(candidate, spec, {
    now: new Date("2026-07-03T00:00:00+08:00"),
  });
  const pageGate = applyCandidatePageTypeGate([candidate], spec, {
    now: new Date("2026-07-03T00:00:00+08:00"),
  });
  const judgeGate = await applyCandidateJudgeGate(pageGate.assessedResults, spec, new AlwaysAcceptAdapter(), {
    mode: "llm",
    now: new Date("2026-07-03T00:00:00+08:00"),
  });
  const ownershipGate = applyCandidateOwnershipGate(judgeGate.assessedResults, spec, {
    now: new Date("2026-07-03T00:00:00+08:00"),
  });
  return ownershipGate.assessedResults[0];
}

async function main(): Promise<void> {
  const tableTennisCalendar = await assess(
    result(
      "WTT 2026 赛事日历",
      "WTT 官方赛历页面展示全年赛事 schedule 和 calendar，没有报名入口、entry form 或选手参赛提交路径。",
      "direct_opportunity",
      "official_event_site",
      "https://worldtabletennis.com/calendar",
    ),
    profiles.tableTennisPlayer,
  );
  check("table tennis calendar downgrades to watch signal", tableTennisCalendar.ownership_assessment?.ownershipDecision === "downgrade_to_watch_signal", JSON.stringify(tableTennisCalendar.ownership_assessment));
  check("table tennis calendar action owner is observe only", tableTennisCalendar.ownership_assessment?.currentUserActionMode === "observe_only", JSON.stringify(tableTennisCalendar.ownership_assessment));

  const tableTennisEntry = await assess(
    result(
      "2026 WTT Feeder Hong Kong entries open",
      "Official event page. Table tennis players can submit entry form before the deadline and check competition regulations.",
      "direct_opportunity",
      "official_event_site",
      "https://worldtabletennis.com/event/2026-feeder-hong-kong-entry",
    ),
    profiles.tableTennisPlayer,
  );
  check("table tennis entry remains key opportunity", tableTennisEntry.ownership_assessment?.ownershipDecision === "accept", JSON.stringify(tableTennisEntry.ownership_assessment));
  check("table tennis entry action owner can register", tableTennisEntry.ownership_assessment?.currentUserActionMode === "register", JSON.stringify(tableTennisEntry.ownership_assessment));

  const traditionalTableTennisEntry = await assess(
    result(
      "全國桌協報名入口",
      "桌球選手可線上報名並提交參賽資料，頁面提供 registration form。",
      "direct_opportunity",
      "official_event_site",
      "https://example.org/table-tennis-entry",
    ),
    profiles.tableTennisPlayer,
  );
  check("traditional Chinese table tennis registration is recognized", traditionalTableTennisEntry.ownership_assessment?.ownershipDecision === "accept", JSON.stringify(traditionalTableTennisEntry.ownership_assessment));
  check("traditional Chinese table tennis registration is not treated as supplier bid", traditionalTableTennisEntry.ownership_assessment?.currentUserActionMode === "register", JSON.stringify(traditionalTableTennisEntry.ownership_assessment));

  const tableTennisTenderLikePage = await assess(
    result(
      "乒乓球馆设备采购供应商公告",
      "页面面向供应商采购乒乓球器材，没有选手报名、参赛提交或 entry 路径。",
      "direct_opportunity",
      "procurement_or_supplier_portal",
      "https://example.org/table-tennis-equipment-procurement",
    ),
    profiles.tableTennisPlayer,
  );
  check("table tennis athlete radar does not treat supplier procurement as player opportunity", tableTennisTenderLikePage.ownership_assessment?.ownershipDecision !== "accept", JSON.stringify(tableTennisTenderLikePage.ownership_assessment));
  check("table tennis supplier procurement is observe only for athlete", tableTennisTenderLikePage.ownership_assessment?.currentUserActionMode === "observe_only", JSON.stringify(tableTennisTenderLikePage.ownership_assessment));

  const headhunterSelfJob = await assess(
    result(
      "Recruitment Consultant / Headhunter jobs in Hong Kong",
      "招聘猎头顾问岗位，面向猎头本人求职申请，不是跨境财务岗位客户招聘需求。",
      "business_lead",
      "company_careers_or_contact",
      "https://careers.example.com/recruitment-consultant",
    ),
    profiles.headhunter,
  );
  check("headhunter self-job is rejected", headhunterSelfJob.ownership_assessment?.ownershipDecision === "reject", JSON.stringify(headhunterSelfJob.ownership_assessment));
  check("headhunter self-job is not for current user's radar", headhunterSelfJob.ownership_assessment?.currentUserActionMode === "not_actionable", JSON.stringify(headhunterSelfJob.ownership_assessment));

  const companyCareersLead = await assess(
    result(
      "Global manufacturer careers - APAC Tax Manager and Treasury Controller",
      "Company official careers page lists APAC tax manager, treasury controller and internal control openings in Hong Kong and Singapore.",
      "business_lead",
      "company_careers_or_contact",
      "https://globalmanufacturer.example.com/careers/apac-finance",
    ),
    profiles.headhunter,
  );
  check("company careers can be hiring signal for headhunter", companyCareersLead.ownership_assessment?.opportunityRoleForUser === "hiring_signal", JSON.stringify(companyCareersLead.ownership_assessment));
  check("company careers lets headhunter contact as lead", companyCareersLead.ownership_assessment?.currentUserActionMode === "contact", JSON.stringify(companyCareersLead.ownership_assessment));

  const competingAgencyPage = await assess(
    result(
      "中企出海招聘 - 米高蒲志",
      "招聘机构介绍其为出海企业提供招聘服务，页面主体是招聘服务商，不是可识别的目标雇主官网岗位需求。",
      "business_lead",
      "company_careers_or_contact",
      "https://www.michaelpage.com.cn/advice/enterprise-overseas-hiring",
    ),
    profiles.headhunter,
  );
  check("headhunter competitor agency service page is downgraded", competingAgencyPage.ownership_assessment?.ownershipDecision === "downgrade_to_watch_signal", JSON.stringify(competingAgencyPage.ownership_assessment));
  check("headhunter competitor agency page is observe only", competingAgencyPage.ownership_assessment?.currentUserActionMode === "observe_only", JSON.stringify(competingAgencyPage.ownership_assessment));

  const robertWaltersServicePage = await assess(
    result(
      "借港出海：拓展全球业务从香港出发 - Robert Walters",
      "页面介绍借助香港拓展全球业务的市场建议，展示 Robert Walters 的顾问服务入口。",
      "business_lead",
      "company_careers_or_contact",
      "https://www.robertwalters.com.hk/insights/overseas-expansion",
    ),
    profiles.headhunter,
  );
  check("headhunter recruitment agency brand page is downgraded", robertWaltersServicePage.ownership_assessment?.ownershipDecision === "downgrade_to_watch_signal", JSON.stringify(robertWaltersServicePage.ownership_assessment));
  check("headhunter recruitment agency brand page is observe only", robertWaltersServicePage.ownership_assessment?.currentUserActionMode === "observe_only", JSON.stringify(robertWaltersServicePage.ownership_assessment));

  const genericApplicationHelp = await assess(
    result(
      "申请帮助",
      "泛招聘网站的申请帮助页面，解释如何提交求职申请，没有可识别企业、跨境财务岗位或招聘扩张信号。",
      "direct_opportunity",
      "company_careers_or_contact",
      "https://jobs.example.com/application-help",
    ),
    profiles.headhunter,
  );
  check("headhunter generic application help is not a client lead", genericApplicationHelp.ownership_assessment?.ownershipDecision !== "accept", JSON.stringify(genericApplicationHelp.ownership_assessment));
  check("headhunter generic application help is observe only", genericApplicationHelp.ownership_assessment?.currentUserActionMode === "observe_only", JSON.stringify(genericApplicationHelp.ownership_assessment));

  const environmentPolicy = await assess(
    result(
      "广东省绿色制造体系建设实施方案",
      "政策规划文件，介绍绿色制造方向和认定安排，没有环保设备采购、废气治理、污水处理、除尘设备招标或供应商投标入口。",
      "direct_opportunity",
      "government_grant_page",
      "https://industry.gov.cn/policy/green-manufacturing-plan",
    ),
    profiles.environmentVendor,
  );
  check("environment policy does not become vendor opportunity", environmentPolicy.ownership_assessment?.ownershipDecision !== "accept", JSON.stringify(environmentPolicy.ownership_assessment));
  check("environment policy is observe only", environmentPolicy.ownership_assessment?.currentUserActionMode === "observe_only", JSON.stringify(environmentPolicy.ownership_assessment));

  const environmentTender = await assess(
    result(
      "某工业园区废气治理与除尘设备采购项目招标公告",
      "政府采购公告，采购范围包含废气治理、除尘设备安装和环保治理服务，供应商可投标提交材料。",
      "direct_opportunity",
      "procurement_or_supplier_portal",
      "https://ccgp.gov.cn/procurement/dust-collector-tender-2026",
    ),
    profiles.environmentVendor,
  );
  check("environment equipment tender accepted", environmentTender.ownership_assessment?.ownershipDecision === "accept", JSON.stringify(environmentTender.ownership_assessment));
  check("environment equipment tender action owner can bid", environmentTender.ownership_assessment?.currentUserActionMode === "bid", JSON.stringify(environmentTender.ownership_assessment));

  const environmentEducationTender = await assess(
    result(
      "广东环境保护工程职业学院教学资源建设项目公开招标公告",
      "采购范围为教学资源建设与课程平台服务，未明确环保设备、废气治理、污水处理、除尘设备或环保治理服务采购。",
      "direct_opportunity",
      "procurement_or_supplier_portal",
      "https://www.gdpepe.edu.cn/procurement/teaching-resource-2026",
    ),
    profiles.environmentVendor,
  );
  check("environment school teaching-resource tender is not equipment opportunity", environmentEducationTender.ownership_assessment?.ownershipDecision !== "accept", JSON.stringify(environmentEducationTender.ownership_assessment));
  check("environment school teaching-resource tender is observe or reject", environmentEducationTender.ownership_assessment?.currentUserActionMode !== "bid", JSON.stringify(environmentEducationTender.ownership_assessment));

  const genericProcurementIndex = await assess(
    result(
      "公示公告 - 浙江大学采购网",
      "高校采购网公示公告栏目，未明确本页采购环保设备、废气治理、污水处理、除尘设备或环保治理服务。",
      "direct_opportunity",
      "procurement_or_supplier_portal",
      "https://procurement.zju.example.com/notice",
    ),
    profiles.environmentVendor,
  );
  check("environment generic procurement index is not equipment opportunity", genericProcurementIndex.ownership_assessment?.ownershipDecision !== "accept", JSON.stringify(genericProcurementIndex.ownership_assessment));
  check("environment generic procurement index is not bid action", genericProcurementIndex.ownership_assessment?.currentUserActionMode !== "bid", JSON.stringify(genericProcurementIndex.ownership_assessment));

  const ranked = rankCandidateResults([
    tableTennisCalendar,
    tableTennisEntry,
    traditionalTableTennisEntry,
    tableTennisTenderLikePage,
    headhunterSelfJob,
    companyCareersLead,
    competingAgencyPage,
    robertWaltersServicePage,
    genericApplicationHelp,
    environmentPolicy,
    environmentTender,
    environmentEducationTender,
    genericProcurementIndex,
  ], profiles.environmentVendor, {
    now: new Date("2026-07-03T00:00:00+08:00"),
  });
  check("ranking excludes ownership rejects and downgrades from key cards", !ranked.keyCandidates.some((item) =>
    item.ownership_assessment?.ownershipDecision !== "accept"
  ), JSON.stringify(ranked.keyCandidates.map((item) => ({ title: item.title, ownership: item.ownership_assessment }))));

  const downgradedCompanyCareersLead: SearchResult = {
    ...companyCareersLead,
    candidate_judge_assessment: {
      ...companyCareersLead.candidate_judge_assessment!,
      decision: "downgrade_to_watch_signal",
      reason: "Judge was uncertain, but Q.6-I can still identify a company careers hiring signal.",
    },
  };
  const rejectedCompanyCareersLead: SearchResult = {
    ...companyCareersLead,
    candidate_judge_assessment: {
      ...companyCareersLead.candidate_judge_assessment!,
      decision: "reject",
      reason: "Hard reject must not be overridden by ownership.",
    },
  };
  const headhunterRanked = rankCandidateResults([
    downgradedCompanyCareersLead,
    rejectedCompanyCareersLead,
    competingAgencyPage,
  ], profiles.headhunter, {
    now: new Date("2026-07-03T00:00:00+08:00"),
  });
  check("strong ownership can materialize judge-downgraded company hiring signal", headhunterRanked.keyCandidates.some((item) =>
    item.title === downgradedCompanyCareersLead.title
  ), JSON.stringify(headhunterRanked.keyCandidates.map((item) => ({
    title: item.title,
    judge: item.candidate_judge_assessment?.decision,
    ownership: item.ownership_assessment?.ownershipDecision,
    reasons: item.candidate_ranking_assessment?.reasonCodes,
  }))));
  check("ownership never overrides judge hard reject", !headhunterRanked.keyCandidates.some((item) =>
    item.candidate_judge_assessment?.decision === "reject"
  ), JSON.stringify(headhunterRanked.keyCandidates.map((item) => ({
    title: item.title,
    judge: item.candidate_judge_assessment?.decision,
  }))));

  if (failed > 0) {
    console.error(`Q.6-I ownership gate: ${failed} FAIL`);
    process.exit(1);
  }
  console.log(`Q.6-I ownership gate: ${passed} PASS / 0 FAIL`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
