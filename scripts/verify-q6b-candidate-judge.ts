import { createDefaultSpec, type RadarRequirementSpec } from "../src/schema/radar-requirement-spec";
import type { OpportunityKind, SourceArchetypeId } from "../src/schema/radar-mvp-contracts";
import type { RadarVersionQueryFamily } from "../src/schema/radar-version-spec";
import type { LLMAdapter, LLMRequest, LLMResponse } from "../src/agents/llm-adapter";
import type { SearchResult } from "../src/search/types";
import {
  applyCandidateJudgeGate,
  judgeCandidateBatch,
  type CandidateJudgeType,
  type CandidateJudgeDecision,
} from "../src/search/candidate-llm-judge";
import { assessCandidateRelevance } from "../src/search/candidate-relevance";
import { ruleFilter } from "../src/search/rule-filter";

interface ProfileFixture {
  targetUser: string;
  businessContext: string;
  opportunityIntents: string[];
  highValueCriteria: string[];
  exclusionRules: string[];
  prioritySourceArchetypes: string[];
  queryFamily: string;
  query: string;
}

interface CandidateFixture {
  id: string;
  profile: ProfileFixture;
  result: SearchResult;
  expectedDecision: CandidateJudgeDecision;
  expectedType: CandidateJudgeType;
  minScore?: number;
  maxScore?: number;
}

class StaticJsonAdapter implements LLMAdapter {
  constructor(private readonly response: unknown) {}

  async chat(_request: LLMRequest): Promise<LLMResponse> {
    return {
      content: JSON.stringify(this.response),
      parsed: this.response,
    };
  }
}

function toSpec(profile: ProfileFixture): RadarRequirementSpec {
  const spec = createDefaultSpec();
  spec.client_profile.client_type = profile.targetUser;
  spec.client_profile.business_type = profile.targetUser;
  spec.core_goals.primary_goal = profile.businessContext;
  spec.core_goals.action_intent = ["寻找合作"];
  spec.opportunity_scope.primary_opportunity_types = profile.opportunityIntents;
  spec.keyword_strategy.core_keywords_zh = profile.opportunityIntents;
  spec.filter_rules.must_exclude = profile.exclusionRules;
  const family: RadarVersionQueryFamily = {
    familyName: profile.queryFamily,
    intentType: "business_lead",
    sourceArchetype: profile.prioritySourceArchetypes[0] ?? "官方网站",
    queries: [profile.query],
    whyThisFamily: "Q.6-B candidate judge fixture",
  };
  spec.radar_version = {
    version: "V1.0",
    oneSentencePositioning: `${profile.targetUser}机会雷达`,
    targetUser: profile.targetUser,
    businessContext: profile.businessContext,
    opportunityIntents: profile.opportunityIntents,
    highValueCriteria: profile.highValueCriteria,
    exclusionRules: profile.exclusionRules,
    prioritySourceArchetypes: profile.prioritySourceArchetypes,
    queryFamilies: [family],
    scoringRules: [],
    reportTemplate: ["重点机会", "待复核项"],
    missingConfig: [],
    defaultAssumptions: [],
    revisionNotes: [],
    resultBuckets: ["direct_opportunity", "business_lead", "watch_signal"],
  };
  return spec;
}

function result(
  title: string,
  snippet: string,
  semanticType: OpportunityKind,
  sourceArchetype: SourceArchetypeId,
  url = "https://example.org/item",
): SearchResult {
  return {
    title,
    url,
    snippet,
    source_provider: "fixture",
    source_type: "web",
    published_at: "2026-07-01",
    search_query: title,
    search_theme: "Q.6-B fixture",
    query_family: "Q.6-B fixture",
    query_variant: "action_keyword",
    intent_type: semanticType === "rejected" ? "watch_signal" : semanticType,
    semantic_type: semanticType,
    source_archetype: sourceArchetype,
    source_archetype_label: sourceArchetype,
  };
}

const profiles = {
  welfareSupplier: {
    targetUser: "员工福利和节日礼品供应商",
    businessContext: "寻找广东和香港企业福利采购、工会项目与礼品招标",
    opportunityIntents: ["企业福利采购", "工会福利项目", "节日礼品招标", "供应商入库"],
    highValueCriteria: ["采购或入库入口", "供应商可参与"],
    exclusionRules: ["加盟广告", "系统教程"],
    prioritySourceArchetypes: ["采购公告", "供应商门户", "工会官网"],
    queryFamily: "福利采购与供应商征集",
    query: "广东 员工福利 礼品 供应商 征集",
  },
  headhunter: {
    targetUser: "跨境财务岗位猎头顾问",
    businessContext: "寻找香港、新加坡、广州有跨境财务、资金、税务、内控招聘需求的公司",
    opportunityIntents: ["公司招聘需求", "跨境财务岗位", "资金税务内控岗位"],
    highValueCriteria: ["公司直接招聘", "可识别招聘公司", "岗位近期开放"],
    exclusionRules: ["求职培训", "猎头本人招聘"],
    prioritySourceArchetypes: ["公司官网招聘页", "企业联系人页面"],
    queryFamily: "企业财务岗位招聘信号",
    query: "Hong Kong careers tax finance controller",
  },
  kidsCoding: {
    targetUser: "少儿编程培训机构",
    businessContext: "寻找招生合作、学校社区科创活动合作、竞赛承办、课程采购和渠道合作机会",
    opportunityIntents: ["少儿编程招生合作", "学校科创活动合作", "竞赛承办", "课程采购"],
    highValueCriteria: ["机构可承办或合作", "面向少儿编程机构"],
    exclusionRules: ["加盟广告", "大学生个人参赛"],
    prioritySourceArchetypes: ["学校合作页", "采购公告", "教育机构合作页"],
    queryFamily: "少儿编程学校合作",
    query: "少儿编程 学校 合作 课程采购",
  },
  environmentVendor: {
    targetUser: "工业环保设备供应商",
    businessContext: "寻找广东和长三角环保项目招标、政府采购与园区改造",
    opportunityIntents: ["环保设备招标", "政府采购", "园区绿色改造"],
    highValueCriteria: ["设备供应商可投标", "有采购范围", "项目仍可参与"],
    exclusionRules: ["装修工程", "环保科普"],
    prioritySourceArchetypes: ["政府采购页", "招标公告", "园区项目公告"],
    queryFamily: "工业环保设备招标",
    query: "广东 工业环保设备 招标 采购",
  },
  goPlayer: {
    targetUser: "围棋选手",
    businessContext: "寻找可报名或可参与的围棋赛事与训练机会",
    opportunityIntents: ["围棋公开赛", "职业定段赛", "奖金赛事", "训练营"],
    highValueCriteria: ["有报名入口", "面向围棋选手", "未来仍可行动"],
    exclusionRules: ["电子游戏", "培训广告"],
    prioritySourceArchetypes: ["围棋协会官网", "赛事官网"],
    queryFamily: "围棋赛事报名",
    query: "围棋 公开赛 报名 2026",
  },
} satisfies Record<string, ProfileFixture>;

const cases: CandidateFixture[] = [
  {
    id: "q6b-001",
    profile: profiles.kidsCoding,
    result: result(
      "2026年广东省大学生程序设计竞赛报名通知",
      "面向高校大学生参赛队伍开放报名，学生提交队伍资料。",
      "direct_opportunity",
      "official_event_site",
      "https://education.example.org/acm-2026",
    ),
    expectedDecision: "reject",
    expectedType: "reject",
    maxScore: 35,
  },
  {
    id: "q6b-002",
    profile: profiles.environmentVendor,
    result: result(
      "某办公楼房间装修改造采购公告",
      "采购范围为室内装修、家具安装和墙面翻新，不包含环保设备采购。",
      "direct_opportunity",
      "procurement_or_supplier_portal",
      "https://gov.example.cn/tender/room-renovation",
    ),
    expectedDecision: "reject",
    expectedType: "reject",
    maxScore: 35,
  },
  {
    id: "q6b-003",
    profile: profiles.welfareSupplier,
    result: result(
      "广东某集团2026年员工节日福利礼品供应商征集",
      "面向礼品供应商公开征集，提供入库材料清单与提交方式。",
      "direct_opportunity",
      "procurement_or_supplier_portal",
      "https://procurement.example.org/welfare-vendor",
    ),
    expectedDecision: "accept",
    expectedType: "key_opportunity",
    minScore: 75,
  },
  {
    id: "q6b-004",
    profile: profiles.headhunter,
    result: result(
      "跨境财务工作机会 - 聚合招聘列表",
      "招聘平台聚合多个公司职位，需继续打开公司官网确认真实招聘方。",
      "business_lead",
      "company_careers_or_contact",
      "https://jobs.example.org/finance-list",
    ),
    expectedDecision: "downgrade_to_watch_signal",
    expectedType: "watch_signal",
    maxScore: 65,
  },
  {
    id: "q6b-005",
    profile: profiles.goPlayer,
    result: result(
      "2026全国业余围棋公开赛报名通知",
      "面向业余围棋选手开放报名，查看竞赛规程与报名入口。",
      "direct_opportunity",
      "official_event_site",
      "https://weiqi.example.org/open-2026",
    ),
    expectedDecision: "accept",
    expectedType: "key_opportunity",
    minScore: 75,
  },
  {
    id: "q6b-006",
    profile: profiles.welfareSupplier,
    result: result(
      "First-Year Application Dates, Undergraduate Admissions",
      "Application deadlines and admission requirements for individual undergraduate applicants.",
      "direct_opportunity",
      "official_event_site",
      "https://admissions.example.edu/first-year-dates",
    ),
    expectedDecision: "reject",
    expectedType: "reject",
    maxScore: 10,
  },
  {
    id: "q6b-007",
    profile: profiles.welfareSupplier,
    result: result(
      "Deadlines · Admissions · Purchase College",
      "College admissions deadlines and application information for individual applicants.",
      "direct_opportunity",
      "official_event_site",
      "https://college.example.edu/admissions/deadlines",
    ),
    expectedDecision: "reject",
    expectedType: "reject",
    maxScore: 10,
  },
];

let failed = 0;
function check(name: string, condition: boolean, detail = ""): void {
  if (condition) {
    console.log(`PASS ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL ${name}${detail ? ` -> ${detail}` : ""}`);
  }
}

async function main(): Promise<void> {
  for (const item of cases) {
    item.result.relevance_assessment = assessCandidateRelevance(item.result, toSpec(item.profile), {
      now: new Date("2026-07-03T00:00:00+08:00"),
    });
    const [assessment] = await judgeCandidateBatch([item.result], toSpec(item.profile), new StaticJsonAdapter({ candidates: [] }), {
      mode: "fallback",
      now: new Date("2026-07-03T00:00:00+08:00"),
    });
    check(`${item.id} decision`, assessment.decision === item.expectedDecision, `expected=${item.expectedDecision} actual=${assessment.decision} reason=${assessment.reason}`);
    check(`${item.id} candidate_type`, assessment.candidate_type === item.expectedType, `expected=${item.expectedType} actual=${assessment.candidate_type}`);
    if (typeof item.minScore === "number") {
      check(`${item.id} min score`, assessment.relevance_score >= item.minScore, `score=${assessment.relevance_score}`);
    }
    if (typeof item.maxScore === "number") {
      check(`${item.id} max score`, assessment.relevance_score <= item.maxScore, `score=${assessment.relevance_score}`);
    }
    if (item.id === "q6b-006" || item.id === "q6b-007") {
      check(
        "individual admissions mismatch is rejected before LLM judging",
        item.result.relevance_assessment?.reasonCodes.includes("individual_admissions_mismatch") === true,
        JSON.stringify(item.result.relevance_assessment?.reasonCodes),
      );
    }
  }

  const spec = toSpec(profiles.kidsCoding);
  const mixed = cases.slice(0, 3).map((item) => ({
    ...item.result,
    relevance_assessment: assessCandidateRelevance(item.result, spec, {
      now: new Date("2026-07-03T00:00:00+08:00"),
    }),
  }));
  const gated = await applyCandidateJudgeGate(mixed, spec, new StaticJsonAdapter({ candidates: [] }), {
    mode: "fallback",
    now: new Date("2026-07-03T00:00:00+08:00"),
  });
  check("judge gate keeps total audit results", gated.assessedResults.length === mixed.length, `count=${gated.assessedResults.length}`);
  check("judge gate rejects mismatches", gated.rejected.length >= 1, `rejected=${gated.rejected.length}`);
  check("judge gate does not upgrade rejected candidates", gated.rejected.every((item) => item.semantic_type === "rejected"), "rejected candidate leaked");
  check("judge gate writes assessment", gated.assessedResults.every((item) => item.candidate_judge_assessment), "missing assessment");

  const admissionsCandidate = cases.find((item) => item.id === "q6b-006")!;
  const admissionsRuleFilter = ruleFilter([admissionsCandidate.result], toSpec(profiles.welfareSupplier), {
    allowRadarVersionSemanticCandidates: true,
  });
  check(
    "rule filter rejects individual admissions pages before semantic bypass",
    admissionsRuleFilter.passed.length === 0 && admissionsRuleFilter.rejected.length === 1,
    JSON.stringify([...admissionsRuleFilter.reject_reasons.values()]),
  );

  const liveParsed = {
    candidates: [
      {
        url: "https://weiqi.example.org/open-2026",
        candidate_type: "key_opportunity",
        beneficiary_fit: "fit",
        action_fit: "fit",
        source_fit: "fit",
        freshness_fit: "valid",
        relevance_score: 88,
        decision: "accept",
        reason: "面向围棋选手开放报名，符合雷达目标。",
      },
    ],
  };
  const [liveAssessment] = await judgeCandidateBatch([cases[4].result], toSpec(profiles.goPlayer), new StaticJsonAdapter(liveParsed), {
    mode: "llm",
    now: new Date("2026-07-03T00:00:00+08:00"),
  });
  check("judge parses structured LLM JSON", liveAssessment.decision === "accept" && liveAssessment.relevance_score === 88, JSON.stringify(liveAssessment));

  if (failed > 0) {
    console.error(`Q.6-B candidate judge: ${failed} FAIL`);
    process.exit(1);
  }
  console.log("Q.6-B candidate judge: PASS");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
