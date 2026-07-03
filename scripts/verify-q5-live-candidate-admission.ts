import fs from "node:fs";
import path from "node:path";
import { createDefaultSpec, type RadarRequirementSpec } from "../src/schema/radar-requirement-spec";
import type { RadarVersionQueryFamily } from "../src/schema/radar-version-spec";
import type { OpportunityKind, SearchIntentType, SourceArchetypeId } from "../src/schema/radar-mvp-contracts";
import type { SearchResult } from "../src/search/types";
import type { SearchProvider } from "../src/search/provider-registry";
import type { LLMAdapter } from "../src/agents/llm-adapter";
import { ruleFilter } from "../src/search/rule-filter";
import { buildKeywordPack } from "../src/search/keyword-pack";
import { SearchOrchestrator } from "../src/search/orchestrator";
import { providerRegistry } from "../src/search/provider-registry";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = ""): void {
  if (condition) {
    passed += 1;
    console.log(`PASS ${name}`);
  } else {
    failed += 1;
    failures.push(name);
    console.log(`FAIL ${name}${detail ? ` -> ${detail}` : ""}`);
  }
}

function family(input: {
  familyName: string;
  intentType: SearchIntentType;
  sourceArchetype: string;
  queries: string[];
  resultBucket?: OpportunityKind;
}): RadarVersionQueryFamily {
  return {
    familyName: input.familyName,
    intentType: input.intentType,
    sourceArchetype: input.sourceArchetype,
    queries: input.queries,
    queryVariants: input.queries.slice(0, 3).map((query, index) => ({
      query,
      variant: index === 0 ? "broad_discovery" : index === 1 ? "action_keyword" : "source_archetype",
    })),
    whyThisFamily: `验证 ${input.familyName} 的动态搜索策略。`,
    resultBucket: input.resultBucket ?? input.intentType,
  };
}

function makeSpec(input: {
  targetUser: string;
  literalKeywords: string[];
  sourceArchetypes: string[];
  families: RadarVersionQueryFamily[];
  exclusions?: string[];
}): RadarRequirementSpec {
  const spec = createDefaultSpec();
  spec.client_profile.business_type = input.targetUser;
  spec.client_profile.client_type = input.targetUser;
  spec.core_goals.primary_goal = `为${input.targetUser}寻找可行动机会`;
  spec.core_goals.action_intent = ["寻找合作", "寻找客户", "准备材料", "保存观察"];
  spec.opportunity_scope.primary_opportunity_types = input.literalKeywords;
  spec.keyword_strategy.core_keywords_zh = input.literalKeywords;
  spec.filter_rules.must_exclude = input.exclusions ?? [];
  spec.radar_version = {
    version: "V1.0",
    oneSentencePositioning: `${input.targetUser}机会雷达`,
    targetUser: input.targetUser,
    businessContext: `${input.targetUser}需要持续寻找可行动机会。`,
    opportunityIntents: input.literalKeywords,
    highValueCriteria: ["有明确下一步", "可联系确认", "与当前行业相关"],
    exclusionRules: input.exclusions ?? [],
    prioritySourceArchetypes: input.sourceArchetypes,
    queryFamilies: input.families,
    scoringRules: [],
    reportTemplate: ["重点机会卡", "可行动线索", "待复核项"],
    missingConfig: ["指定官网、平台或协会来源"],
    defaultAssumptions: ["默认优先未来30-60天内可行动机会"],
    revisionNotes: [],
    resultBuckets: ["direct_opportunity", "business_lead", "channel_partner_lead", "customer_lead"],
  };
  return spec;
}

function result(input: {
  title: string;
  snippet: string;
  query: string;
  queryFamily: string;
  semanticType: OpportunityKind;
  intentType?: SearchIntentType;
  sourceArchetype?: SourceArchetypeId;
  url?: string;
}): SearchResult {
  const slug = encodeURIComponent(input.title).replace(/%/g, "").slice(0, 80);
  return {
    title: input.title,
    url: input.url ?? `https://example-opportunity.test/${slug}`,
    snippet: input.snippet,
    source_provider: "serper",
    source_type: "web",
    search_query: input.query,
    search_theme: input.queryFamily,
    intent_type: input.intentType ?? "business_lead",
    source_archetype: input.sourceArchetype ?? "procurement_or_supplier_portal",
    source_archetype_label: "动态来源类型",
    query_family: input.queryFamily,
    query_variant: "action_keyword",
    semantic_type: input.semanticType,
  };
}

const goldenRegressionCases = [
  {
    id: 3,
    name: "广州婚庆公司",
    literalKeywords: ["高端婚礼客户线索", "酒店会所合作", "品牌异业合作", "婚礼项目机会"],
    sourceArchetypes: ["高端酒店官网", "会所官网", "品牌异业合作页面", "婚礼行业门户"],
    families: [
      family({
        familyName: "酒店会所合作",
        intentType: "channel_partner_lead",
        sourceArchetype: "酒店会所官网",
        queries: ["广州 酒店 婚礼 合作 招募", "广州 会所 合作 婚礼", "大湾区 酒店 婚礼 供应商 合作"],
      }),
    ],
    candidate: result({
      title: "婚宴婚礼服务 | 广州中国大酒店",
      snippet: "酒店婚宴场地提供婚礼服务，可联系宴会团队确认供应商合作可能。",
      query: "广州 酒店 婚礼 合作 招募",
      queryFamily: "酒店会所合作",
      semanticType: "channel_partner_lead",
      intentType: "channel_partner_lead",
      sourceArchetype: "company_careers_or_contact",
    }),
  },
  {
    id: 4,
    name: "员工福利礼品供应商",
    literalKeywords: ["企业福利采购", "工会福利项目", "节日礼品招标"],
    sourceArchetypes: ["企业官网采购公告", "招标采购平台", "工会或福利协会网站"],
    families: [
      family({
        familyName: "广东企业福利采购招标",
        intentType: "direct_opportunity",
        sourceArchetype: "招标采购平台",
        queries: ["广东 企业福利 采购 招标", "广东 工会福利 招标 公告", "广东 工会 节日礼品 供应商 征集"],
      }),
    ],
    candidate: result({
      title: "关于人保财险广东省分公司员工福利项目供应商征集公告",
      snippet: "公告面向员工福利项目供应商征集，需联系确认资格、截止时间和提交方式。",
      query: "广东 企业福利 采购 招标",
      queryFamily: "广东企业福利采购招标",
      semanticType: "business_lead",
      intentType: "direct_opportunity",
    }),
  },
  {
    id: 8,
    name: "猎头顾问",
    literalKeywords: ["招聘需求", "跨境财务岗位", "资金岗位", "税务岗位", "内控岗位"],
    sourceArchetypes: ["公司官网招聘页", "企业招聘门户", "IPO相关公司新闻"],
    families: [
      family({
        familyName: "IPO公司招聘信号",
        intentType: "business_lead",
        sourceArchetype: "公司官网招聘页",
        queries: ["IPO 招聘 财务 香港", "Financial Controller IPO Hong Kong careers", "treasury tax internal control jobs Singapore"],
      }),
    ],
    candidate: result({
      title: "Financial Controller, BioTech IPO - Hays",
      snippet: "The role relates to IPO finance hiring in Hong Kong and should be treated as a lead requiring confirmation.",
      query: "Financial Controller IPO Hong Kong careers",
      queryFamily: "IPO公司招聘信号",
      semanticType: "business_lead",
      intentType: "business_lead",
      sourceArchetype: "company_careers_or_contact",
    }),
  },
  {
    id: 9,
    name: "非遗文创公司",
    literalKeywords: ["文创赛事", "工艺美术赛事", "博物馆文创征集", "文旅伴手礼采购", "非遗展会"],
    sourceArchetypes: ["赛事官网", "博物馆官网", "文旅部门官网", "非遗协会官网"],
    families: [
      family({
        familyName: "博物馆文创征集",
        intentType: "direct_opportunity",
        sourceArchetype: "博物馆官网",
        queries: ["博物馆文创产品 征集 官网", "文创大赛 报名 2025", "伴手礼 征集 报名"],
      }),
    ],
    candidate: result({
      title: "中国大运河博物馆文创设计大赛火热开启",
      snippet: "面向文创产品设计作品征集，报名和资格需要打开官方来源复核。",
      query: "博物馆文创产品 征集 官网",
      queryFamily: "博物馆文创征集",
      semanticType: "direct_opportunity",
      intentType: "direct_opportunity",
      sourceArchetype: "open_call_submission_page",
    }),
  },
  {
    id: 11,
    name: "自由摄影师",
    literalKeywords: ["摄影比赛", "品牌征稿", "城市影像计划", "展览征集"],
    sourceArchetypes: ["摄影比赛官网", "品牌官方征稿页", "美术馆展览征集页"],
    families: [
      family({
        familyName: "摄影比赛投稿",
        intentType: "direct_opportunity",
        sourceArchetype: "摄影比赛官网",
        queries: ["摄影大赛 征稿 2025 site:.cn", "写真コンテスト 2025 募集", "摄影展 投稿 2025"],
      }),
    ],
    candidate: result({
      title: "第30届全国摄影艺术展览 - 中国摄影家协会征稿平台",
      snippet: "摄影作品征稿平台开放投稿，截止日期和投稿入口需复核。",
      query: "摄影展 投稿 2025",
      queryFamily: "摄影比赛投稿",
      semanticType: "direct_opportunity",
      intentType: "direct_opportunity",
      sourceArchetype: "open_call_submission_page",
    }),
  },
  {
    id: 13,
    name: "宠物用品品牌",
    literalKeywords: ["宠物展会", "渠道招商", "商超采购", "跨境平台活动", "宠物行业奖项"],
    sourceArchetypes: ["宠物行业展会官网", "商超采购平台", "跨境平台活动页面", "渠道招商页面"],
    families: [
      family({
        familyName: "宠物展会机会",
        intentType: "direct_opportunity",
        sourceArchetype: "宠物行业展会官网",
        queries: ["宠物展 展商 申请", "宠物用品展 参展 报名 截止", "宠物 经销商 申请 加入"],
      }),
    ],
    candidate: result({
      title: "亚洲宠物展展商申请",
      snippet: "宠物用品品牌可申请成为展商，展位、费用和截止日期需联系确认。",
      query: "宠物展 展商 申请",
      queryFamily: "宠物展会机会",
      semanticType: "direct_opportunity",
      intentType: "direct_opportunity",
      sourceArchetype: "official_event_site",
    }),
  },
  {
    id: 19,
    name: "B2B SaaS 出海",
    literalKeywords: ["展会", "创业扶持", "渠道合作", "政府招商", "代理商"],
    sourceArchetypes: ["展会官网", "创业扶持机构官网", "渠道合作平台", "代理商名录"],
    families: [
      family({
        familyName: "东南亚渠道合作伙伴招募",
        intentType: "channel_partner_lead",
        sourceArchetype: "渠道合作平台或企业官网",
        queries: ["channel partner program Southeast Asia SaaS", "B2B SaaS reseller Southeast Asia", "contact SaaS partner Philippines"],
      }),
    ],
    candidate: result({
      title: "Ardent Networks - Premier ICT Distributor in the Philippines",
      snippet: "Potential distributor and partner lead for B2B SaaS market entry, contact route needs confirmation.",
      query: "B2B SaaS reseller Southeast Asia",
      queryFamily: "东南亚渠道合作伙伴招募",
      semanticType: "channel_partner_lead",
      intentType: "channel_partner_lead",
      sourceArchetype: "distributor_directory",
    }),
  },
  {
    id: 20,
    name: "手工饰品工作室",
    literalKeywords: ["手工市集", "买手店合作", "展会摊位", "电商平台活动", "品牌联名", "社媒曝光"],
    sourceArchetypes: ["手工市集主办方官网", "买手店合作页面", "展会官网", "电商平台活动页面"],
    families: [
      family({
        familyName: "手工市集摊位招募",
        intentType: "direct_opportunity",
        sourceArchetype: "手工市集主办方官网",
        queries: ["手工市集 摊位 招募 2025", "创意市集 招募 手作", "文创展会 参展 报名"],
      }),
    ],
    candidate: result({
      title: "2025屏东跨年市集摊商招募开跑",
      snippet: "市集摊商招募开放报名，手作饰品摊主可联系确认资格和档期。",
      query: "手工市集 摊位 招募 2025",
      queryFamily: "手工市集摊位招募",
      semanticType: "business_lead",
      intentType: "direct_opportunity",
      sourceArchetype: "open_call_submission_page",
    }),
  },
];

const randomGeneralizationCases = [
  ["宠物殡葬服务公司", "宠物殡葬合作曝光机会", "宠物善终 纪念服务 合作", "pet cremation memorial partner", "宠物医院合作入口"],
  ["工业除尘设备公司", "环保项目招标和园区改造机会", "工业废气治理 采购", "dust collector supplier procurement", "园区环保改造项目"],
  ["养老院运营服务商", "政府购买服务和康养合作机会", "养老服务 政府购买 招标", "senior care procurement", "康养机构采购"],
  ["新能源充电桩安装公司", "物业园区商场政府项目机会", "充电桩 安装 采购 招标", "EV charger installer tender", "物业合作入口"],
  ["企业心理咨询服务商", "企业EAP和员工关怀采购机会", "企业 EAP 采购", "employee assistance program vendor", "工会福利合作"],
  ["城市露营装备品牌", "渠道市集户外展和品牌联名机会", "户外展 露营品牌 参展", "camping gear retailer partner", "市集摊位招募"],
  ["校园团餐供应商", "学校食堂团餐采购和供应商入库机会", "学校食堂 供应商 入库", "campus catering procurement", "团餐招标公告"],
  ["民宿运营公司", "文旅活动OTA平台和景区合作机会", "民宿 文旅 合作 征集", "homestay OTA campaign", "景区合作招募"],
  ["低空无人机巡检服务公司", "园区能源电力应急政府采购机会", "无人机巡检 政府采购", "drone inspection tender", "电力巡检供应商"],
  ["二手奢侈品寄售店", "买手店合作商场快闪和平台入驻机会", "二手奢侈品 寄售 合作", "luxury resale popup partner", "平台入驻申请"],
];

function verifyGolden8Regression(): void {
  for (const item of goldenRegressionCases) {
    const spec = makeSpec({ ...item, targetUser: item.name });
    const strict = ruleFilter([item.candidate], spec);
    check(`#${item.id} strict literal keyword gate reproduces old block`, strict.passed.length === 0, JSON.stringify(strict.reject_reasons.get(item.candidate.url)));

    const keywordPack = buildKeywordPack(spec);
    const relaxed = ruleFilter([item.candidate], spec, {
      keywordPack,
      allowRadarVersionSemanticCandidates: true,
    });
    check(`#${item.id} relaxed semantic admission passes candidate`, relaxed.passed.length === 1, JSON.stringify([...relaxed.reject_reasons.values()]));
    check(`#${item.id} keyword pack keeps literal keywords for display`, item.literalKeywords.every((kw) => keywordPack.literalKeywords.includes(kw)));
    check(`#${item.id} keyword pack derives dynamic query terms`, item.families[0].queries.some((query) =>
      query.split(/\s+/).some((token) => token.length >= 2 && keywordPack.matchKeywords.includes(token)),
    ), JSON.stringify(keywordPack.matchKeywords.slice(0, 20)));
  }
}

function verifySafetyStillApplies(): void {
  const spec = makeSpec({
    targetUser: "安全过滤测试公司",
    literalKeywords: ["合作线索"],
    sourceArchetypes: ["供应商入口"],
    exclusions: ["招商加盟"],
    families: [family({
      familyName: "合作入口",
      intentType: "business_lead",
      sourceArchetype: "供应商入口",
      queries: ["供应商 合作 招募"],
    })],
  });
  const keywordPack = buildKeywordPack(spec);
  const excluded = result({
    title: "招商加盟供应商合作招募",
    snippet: "命中排除规则，即使语义像线索也不能通过。",
    query: "供应商 合作 招募",
    queryFamily: "合作入口",
    semanticType: "business_lead",
  });
  const invalid = result({
    title: "供应商合作招募",
    snippet: "localhost URL 应被 URL 安全校验阻断。",
    query: "供应商 合作 招募",
    queryFamily: "合作入口",
    semanticType: "business_lead",
    url: "https://localhost/lead",
  });
  const excludedOnly = ruleFilter([excluded], spec, { keywordPack, allowRadarVersionSemanticCandidates: true });
  const invalidOnly = ruleFilter([invalid], spec, { keywordPack, allowRadarVersionSemanticCandidates: true });
  check("Q5 admission still respects exclusion rules", excludedOnly.passed.length === 0 && [...excludedOnly.reject_reasons.values()].some((reason) => /排除/.test(reason)));
  check("Q5 admission still respects URL safety", invalidOnly.passed.length === 0 && [...invalidOnly.reject_reasons.values()].some((reason) => /URL 安全|localhost|SSRF/.test(reason)));
}

function verifyRandom10Generalization(): void {
  const forbiddenSourceText = fs.existsSync(path.resolve(process.cwd(), "src/search/keyword-pack.ts"))
    ? fs.readFileSync(path.resolve(process.cwd(), "src/search/keyword-pack.ts"), "utf-8")
    : "";
  const forbiddenHardcodedIndustries = ["广州婚庆", "员工福利礼品供应商", "猎头顾问", "岭南押花", "自由摄影师", "宠物用品品牌", "手工饰品工作室"];
  check(
    "keyword pack source does not hardcode Golden 8 industry templates",
    forbiddenHardcodedIndustries.every((term) => !forbiddenSourceText.includes(term)),
    forbiddenHardcodedIndustries.filter((term) => forbiddenSourceText.includes(term)).join(", "),
  );

  for (const [targetUser, literal, zhQuery, enQuery, sourceTerm] of randomGeneralizationCases) {
    const spec = makeSpec({
      targetUser,
      literalKeywords: [literal],
      sourceArchetypes: [sourceTerm, "行业协会目录", "平台合作入口"],
      families: [
        family({
          familyName: `${targetUser}动态机会地图`,
          intentType: "business_lead",
          sourceArchetype: sourceTerm,
          queries: [zhQuery, enQuery, `${sourceTerm} 申请 联系`],
          resultBucket: "business_lead",
        }),
      ],
    });
    const keywordPack = buildKeywordPack(spec);
    const candidate = result({
      title: `${sourceTerm} 开放申请`,
      snippet: `${zhQuery} 相关页面，可联系确认资格、费用、截止日期和合作条件。`,
      query: zhQuery,
      queryFamily: `${targetUser}动态机会地图`,
      semanticType: "business_lead",
      intentType: "business_lead",
    });
    const relaxed = ruleFilter([candidate], spec, { keywordPack, allowRadarVersionSemanticCandidates: true });
    check(`${targetUser}: generates match keywords from dynamic queries`, zhQuery.split(/\s+/).some((token) => keywordPack.matchKeywords.includes(token)), JSON.stringify(keywordPack.matchKeywords));
    check(`${targetUser}: generates source keywords from source archetypes`, sourceTerm.split(/\s+/).some((token) => keywordPack.sourceKeywords.includes(token) || keywordPack.matchKeywords.includes(token)), JSON.stringify(keywordPack.sourceKeywords));
    check(`${targetUser}: semantic lead is not blocked by literal phrase`, relaxed.passed.length === 1, JSON.stringify([...relaxed.reject_reasons.values()]));
  }
}

const llmAdapter: LLMAdapter = {
  async chat() {
    return {
      content: JSON.stringify({ fit: 82, intent: 80, effort_cost: 62, reason: "q5 test" }),
      parsed: { fit: 82, intent: 80, effort_cost: 62 },
    };
  },
};

async function verifyOrchestratorIntegration(): Promise<void> {
  const original = providerRegistry.get("q5_fake_provider");
  const provider: SearchProvider = {
    name: "q5_fake_provider",
    display_name: "Q5 Fake Provider",
    source_type: "web",
    reliability: "B",
    enabled: true,
    radar_types: ["custom"],
    async healthCheck() {
      return true;
    },
    async search(query) {
      return [result({
        title: "关于人保财险广东省分公司员工福利项目供应商征集公告",
        snippet: "面向员工福利项目供应商征集，搜索发现不代表已确认采购意向，需联系确认。",
        query,
        queryFamily: "广东企业福利采购招标",
        semanticType: "business_lead",
        intentType: "direct_opportunity",
        sourceArchetype: "procurement_or_supplier_portal",
        url: "https://q5.example.test/picc-benefit-supplier",
      })];
    },
  };
  providerRegistry.register(provider);
  try {
    const spec = makeSpec({
      targetUser: "员工福利和节日礼品供应商",
      literalKeywords: ["企业福利采购", "工会福利项目", "节日礼品招标"],
      sourceArchetypes: ["招标采购平台", "工会福利协会网站"],
      families: [family({
        familyName: "广东企业福利采购招标",
        intentType: "direct_opportunity",
        sourceArchetype: "招标采购平台",
        queries: ["广东 企业福利 采购 招标", "广东 工会福利 招标 公告", "广东 工会 节日礼品 供应商 征集"],
      })],
    });
    const resultEnvelope = await new SearchOrchestrator({
      llmAdapter,
      dataMode: "live",
      enableContentFetch: false,
      maxResultsPerProvider: 5,
    }).search(spec, "企业福利采购", { primary: ["q5_fake_provider"], fallback: [] });
    const firstCard = resultEnvelope.opportunityCards?.[0];
    check("orchestrator admits semantically relevant live candidate", (resultEnvelope.total_rule_passed ?? 0) > 0, JSON.stringify(resultEnvelope));
    check("orchestrator creates opportunity card after Q5 admission", (resultEnvelope.opportunityCards ?? []).length > 0, JSON.stringify(resultEnvelope.candidateAccounting));
    check(
      "lead card is marked pending review/contact confirmation",
      !!firstCard && /待复核|需联系确认/.test([
        firstCard.risk_note,
        firstCard.next_action,
        firstCard.source_disclaimer,
        ...(firstCard.sourceBadges ?? []),
      ].join(" ")),
      JSON.stringify(firstCard),
    );
  } finally {
    providerRegistry.unregister("q5_fake_provider");
    if (original) providerRegistry.register(original);
  }
}

async function verifyAssociationDirectoryStaysOutOfKeyCards(): Promise<void> {
  const original = providerRegistry.get("q5_association_provider");
  const provider: SearchProvider = {
    name: "q5_association_provider",
    display_name: "Q5 Association Provider",
    source_type: "web",
    reliability: "B",
    enabled: true,
    radar_types: ["custom"],
    async healthCheck() {
      return true;
    },
    async search(query) {
      return [result({
        title: "养老服务协会会员单位目录",
        snippet: "会员目录可作为潜在合作对象清单，是否有采购或合作需求需逐一联系确认。",
        query,
        queryFamily: "养老机构合作资源",
        semanticType: "association_directory",
        intentType: "association_directory",
        sourceArchetype: "association_member_directory",
        url: "https://q5.example.test/senior-care-association-directory",
      })];
    },
  };
  providerRegistry.register(provider);
  try {
    const spec = makeSpec({
      targetUser: "养老院运营服务商",
      literalKeywords: ["政府购买服务和康养合作机会"],
      sourceArchetypes: ["养老协会目录", "康养机构采购平台"],
      families: [family({
        familyName: "养老机构合作资源",
        intentType: "association_directory",
        sourceArchetype: "养老协会目录",
        queries: ["养老服务 协会 会员目录", "康养机构 合作 目录", "senior care association directory"],
        resultBucket: "association_directory",
      })],
    });
    const resultEnvelope = await new SearchOrchestrator({
      llmAdapter,
      dataMode: "live",
      enableContentFetch: false,
      maxResultsPerProvider: 5,
    }).search(spec, "养老合作", { primary: ["q5_association_provider"], fallback: [] });
    check("association directory remains searchable raw material", resultEnvelope.total_raw > 0, JSON.stringify(resultEnvelope.candidateAccounting));
    check(
      "association directory stays out of key opportunity cards",
      (resultEnvelope.opportunityCards ?? []).length === 0,
      JSON.stringify(resultEnvelope.opportunityCards ?? []),
    );
  } finally {
    providerRegistry.unregister("q5_association_provider");
    if (original) providerRegistry.register(original);
  }
}

async function main(): Promise<void> {
  verifyGolden8Regression();
  verifySafetyStillApplies();
  verifyRandom10Generalization();
  await verifyOrchestratorIntegration();
  await verifyAssociationDirectoryStaysOutOfKeyCards();
  console.log(`Q5 live candidate admission: ${passed} PASS / ${failed} FAIL`);
  if (failures.length > 0) {
    console.log("Failures:");
    for (const item of failures) console.log(`- ${item}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
