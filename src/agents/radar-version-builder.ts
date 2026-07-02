import type { RadarProfileSummary } from "../schema/radar-profile-summary";
import type { RadarRequirementSpec } from "../schema/radar-requirement-spec";
import type { ExtractedOpportunityStrategy } from "../schema/extracted-requirement-info";
import type { OpportunityKind, SearchIntentType, SearchQueryVariant } from "../schema/radar-mvp-contracts";
import type {
  RadarVersionQueryFamily,
  RadarVersionRevisionNote,
  RadarVersionSpec,
} from "../schema/radar-version-spec";

function unique(values: Array<string | undefined>, limit = 20): string[] {
  return Array.from(new Set(
    values
      .map((value) => String(value ?? "").trim())
      .filter(Boolean),
  )).slice(0, limit);
}

function textIncludes(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function firstNonEmpty(...values: Array<string | string[] | undefined>): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (Array.isArray(value) && value.length > 0) return value.filter(Boolean).join("、");
  }
  return "未明确";
}

function revisionVersion(description: string): "V1.0" | "V1.1" {
  return /\[用户补充回答\]|不准|不是|改成|调整|更想|主要想/.test(description) ? "V1.1" : "V1.0";
}

function inferPositioning(spec: RadarRequirementSpec, description: string, profileSummary?: RadarProfileSummary): string {
  const text = description.toLowerCase();
  if (/b2b\s*商品交易|商品交易\s*saas|零售|retail/.test(text)) {
    return "B2B 商品交易 SaaS / 东南亚零售机会雷达";
  }
  if (/b2b\s*saas/.test(text) && /东南亚|southeast|出海/.test(description)) {
    return "B2B SaaS 出海机会雷达";
  }
  const identity = profileSummary?.identity || firstNonEmpty(spec.client_profile?.business_type, spec.client_profile?.client_type);
  const target = profileSummary?.target || firstNonEmpty(spec.opportunity_scope?.primary_opportunity_types, spec.core_goals?.primary_goal);
  return `${identity}的${target}机会雷达`;
}

function inferBusinessContext(spec: RadarRequirementSpec, description: string, profileSummary?: RadarProfileSummary): string {
  if (/b2b\s*商品交易|商品交易\s*saas|零售|retail/.test(description.toLowerCase())) {
    return "面向东南亚零售、FMCG、商超、便利店、批发商和渠道伙伴，寻找能进入联系人、供应商入口、合作入口或数字化转型项目的机会。";
  }
  if (/b2b\s*saas/.test(description.toLowerCase()) && /东南亚|southeast|出海/.test(description)) {
    return "面向东南亚市场拓展，优先寻找展会、创业扶持、渠道合作、政府招商、商务配对和潜在代理商线索。";
  }
  const regions = firstNonEmpty(spec.region_scope?.primary_regions, spec.client_profile?.regions, profileSummary?.regionsAndTime);
  return `${profileSummary?.identity || spec.client_profile?.business_type || "用户"}希望在${regions}范围内持续发现可行动机会。`;
}

function inferOpportunityIntents(spec: RadarRequirementSpec, description: string): string[] {
  const base = unique([
    ...(spec.opportunity_scope?.primary_opportunity_types ?? []),
    ...(spec.opportunity_scope?.secondary_opportunity_types ?? []),
    spec.core_goals?.primary_goal,
    ...(spec.core_goals?.secondary_goals ?? []),
  ], 8);
  if (/b2b\s*商品交易|商品交易\s*saas|零售|retail/.test(description.toLowerCase())) {
    return unique([
      "零售展会和行业活动",
      "FMCG / 批发商 / 分销商合作线索",
      "商超、便利店、供应商入驻或合作入口",
      "POS / ERP / 供应链伙伴合作",
      "B2B marketplace 渠道合作",
      ...base,
    ], 8);
  }
  if (/b2b\s*saas/.test(description.toLowerCase()) && /东南亚|southeast|出海/.test(description)) {
    return unique([
      "东南亚展会",
      "创业扶持",
      "渠道合作",
      "政府招商",
      "潜在代理商线索",
      ...base,
    ], 8);
  }
  return base.length > 0 ? base : ["直接可行动机会", "可联系业务线索", "观察信号", "参考案例"];
}

function inferHighValueCriteria(description: string): string[] {
  const common = [
    "有联系人、邮箱、官方表单、报名入口、招商入口、合作入口或商务配对入口",
    "来源来自官网、协会、政府、主办方、平台招商页或可核验机构页面",
    "与用户身份、地区、时间窗口和行动目的高度匹配",
    "能在本周形成下一步动作，而不是只提供泛资讯",
  ];
  if (/b2b\s*商品交易|商品交易\s*saas|零售|retail/.test(description.toLowerCase())) {
    return [
      "能触达零售商、商超、便利店、FMCG 分销商、批发商或渠道伙伴",
      "包含供应商注册、合作入口、招商入口、会员目录或展会展位/商务配对入口",
      ...common,
    ];
  }
  if (/b2b\s*saas/.test(description.toLowerCase())) {
    return [
      "能找到联系人、报名入口、合作入口、商务配对、表单或邮箱",
      "与东南亚出海、渠道伙伴、政府招商或创业扶持相关",
      ...common,
    ];
  }
  return common;
}

function inferExclusions(spec: RadarRequirementSpec, description: string): string[] {
  const base = unique([
    ...(spec.opportunity_scope?.excluded_opportunity_types ?? []),
    ...(spec.filter_rules?.must_exclude ?? []),
    ...(spec.keyword_strategy?.negative_keywords ?? []),
  ], 8);
  return unique([
    ...base,
    "纯广告、加盟广告、培训广告或无行动入口页面",
    "仅百科、历史介绍、规则介绍、视频集锦或新闻转载",
    "无法判断发布方、时间或下一步路径的泛资讯",
    ...(textIncludes(description, [/b2b\s*商品交易|零售|retail/i]) ? ["泛科技展会、FinTech、AI 主题但与零售商品交易无关的页面"] : []),
  ], 10);
}

function retailSourceArchetypes(): string[] {
  return [
    "retail association",
    "supermarket association",
    "convenience store association",
    "FMCG association",
    "wholesaler association",
    "distributor directory",
    "retail trade fair",
    "supplier portal",
    "B2B marketplace",
    "POS/ERP partner directory",
  ];
}

function inferSourceArchetypes(spec: RadarRequirementSpec, description: string): string[] {
  if (/b2b\s*商品交易|商品交易\s*saas|零售|retail/.test(description.toLowerCase())) {
    return retailSourceArchetypes();
  }
  if (/b2b\s*saas/.test(description.toLowerCase()) && /东南亚|southeast|出海/.test(description)) {
    return [
      "startup program",
      "government investment agency",
      "business matching platform",
      "trade fair",
      "SaaS partner directory",
      "distributor directory",
      "chamber of commerce",
      "technology association",
    ];
  }
  const sources = [
    ...(spec.source_strategy?.manual_sources ?? []),
    ...(spec.source_strategy?.official_sites ?? []),
    ...(spec.source_strategy?.platforms ?? []),
    ...(spec.source_strategy?.source_priority ?? []),
  ];
  return unique([
    ...sources,
    "official announcement",
    "application portal",
    "procurement notice",
    "association directory",
    "partner directory",
    "supplier portal",
    "trade fair",
    "business matching platform",
  ], 10);
}

function retailQueryFamilies(): RadarVersionQueryFamily[] {
  return [
    {
      familyName: "retail trade show",
      intentType: "direct_opportunity",
      sourceArchetype: "retail trade fair",
      queries: [
        "Southeast Asia retail trade show B2B SaaS business matching",
        "Thailand Vietnam Indonesia retail expo supplier registration",
        "retail trade show ASEAN exhibitor application partner meeting",
      ],
      whyThisFamily: "零售展会和商务配对最容易出现可报名、可联系、可参展或可拓展渠道的入口。",
      resultBucket: "direct_opportunity",
    },
    {
      familyName: "FMCG distributor",
      intentType: "business_lead",
      sourceArchetype: "FMCG association / distributor directory",
      queries: [
        "Southeast Asia FMCG distributor directory contact",
        "FMCG association ASEAN member directory distributor",
        "Vietnam Indonesia Thailand wholesaler association FMCG contact",
      ],
      whyThisFamily: "商品交易 SaaS 的潜在线索常在分销商、批发商、FMCG 协会和会员目录中出现。",
      resultBucket: "channel_partner_lead",
    },
    {
      familyName: "supermarket supplier registration",
      intentType: "business_lead",
      sourceArchetype: "supermarket association / supplier portal",
      queries: [
        "supermarket supplier registration Southeast Asia retail vendor portal",
        "convenience store supplier portal ASEAN retail partner",
        "Singapore Malaysia supermarket supplier application contact",
      ],
      whyThisFamily: "商超和便利店供应商入口可以转成零售客户线索或渠道合作线索。",
      resultBucket: "retail_customer_lead",
    },
    {
      familyName: "retail digital transformation grant",
      intentType: "watch_signal",
      sourceArchetype: "government SME digitalization grant",
      queries: [
        "retail digital transformation grant Southeast Asia SME SaaS",
        "ASEAN retail digitalisation grant POS ERP supplier",
        "Singapore Malaysia retail productivity grant software vendor",
      ],
      whyThisFamily: "政府数字化补贴和转型项目是零售 SaaS 切入客户需求的观察信号。",
      resultBucket: "watch_signal",
    },
    {
      familyName: "POS reseller partner",
      intentType: "business_lead",
      sourceArchetype: "POS/ERP partner directory / B2B marketplace",
      queries: [
        "POS reseller partner Southeast Asia B2B SaaS",
        "ERP partner directory retail ASEAN marketplace",
        "wholesale marketplace partner retail supplier portal",
      ],
      whyThisFamily: "POS/ERP 伙伴、批发平台和 marketplace 是商品交易 SaaS 的渠道合作入口。",
      resultBucket: "channel_partner_lead",
    },
  ];
}

function b2bSaasQueryFamilies(): RadarVersionQueryFamily[] {
  return [
    {
      familyName: "SEA trade fair business matching",
      intentType: "direct_opportunity",
      sourceArchetype: "trade fair / business matching platform",
      queries: [
        "Southeast Asia B2B SaaS trade fair business matching application",
        "ASEAN startup business matching SaaS exhibitor registration",
        "Singapore Malaysia Thailand SaaS expo partner matching",
      ],
      whyThisFamily: "展会和商务配对通常包含报名、参展、合作或联系入口。",
      resultBucket: "direct_opportunity",
    },
    {
      familyName: "startup grant and cloud program",
      intentType: "direct_opportunity",
      sourceArchetype: "startup program / cloud accelerator",
      queries: [
        "Southeast Asia startup program SaaS application",
        "ASEAN cloud startup support program SaaS",
        "AI SaaS startup accelerator Southeast Asia application",
      ],
      whyThisFamily: "创业扶持和云厂商计划能产生明确申请入口和资源支持。",
      resultBucket: "direct_opportunity",
    },
    {
      familyName: "government investment contact",
      intentType: "business_lead",
      sourceArchetype: "government investment agency / chamber of commerce",
      queries: [
        "Singapore EDB SaaS investment contact Southeast Asia",
        "Malaysia MDEC SaaS digital economy partner contact",
        "Thailand BOI SaaS startup investment contact",
      ],
      whyThisFamily: "政府招商机构和商会适合形成需联系确认的 BD 线索。",
      resultBucket: "business_lead",
    },
    {
      familyName: "channel partner directory",
      intentType: "business_lead",
      sourceArchetype: "SaaS partner directory / distributor directory",
      queries: [
        "SaaS partner directory Southeast Asia distributor contact",
        "ASEAN software reseller partner directory B2B SaaS",
        "Singapore Malaysia SaaS distributor channel partner contact",
      ],
      whyThisFamily: "渠道伙伴目录能帮助出海 SaaS 找到代理商或合作联系人。",
      resultBucket: "business_lead",
    },
  ];
}

function genericQueryFamilies(spec: RadarRequirementSpec, profileSummary?: RadarProfileSummary): RadarVersionQueryFamily[] {
  const identity = profileSummary?.identity || spec.client_profile?.business_type || "用户";
  const target = profileSummary?.target || spec.core_goals?.primary_goal || "机会";
  const region = firstNonEmpty(spec.region_scope?.primary_regions, spec.client_profile?.regions, "全国");
  return [
    {
      familyName: "direct actionable opportunity",
      intentType: "direct_opportunity",
      sourceArchetype: "official announcement / application portal",
      queries: [
        `${identity} ${target} 报名 申请 官方公告`,
        `${region} ${target} 机会 通知 截止`,
        `${target} application registration official`,
      ],
      whyThisFamily: "优先寻找可报名、可申请、可投稿、可投标或可联系的直接机会。",
      resultBucket: "direct_opportunity",
    },
    {
      familyName: "contactable business lead",
      intentType: "business_lead",
      sourceArchetype: "supplier portal / partner directory / procurement notice",
      queries: [
        `${identity} ${target} 合作 联系 供应商 入库`,
        `${region} ${target} 招商 合作 采购 联系方式`,
        `${target} partner supplier contact directory`,
      ],
      whyThisFamily: "不是所有机会都有报名页，客户线索、合作入口和供应商入口也需要进入主表。",
      resultBucket: "business_lead",
    },
    {
      familyName: "watch signal",
      intentType: "watch_signal",
      sourceArchetype: "association calendar / policy signal / event list",
      queries: [
        `${target} 协会 日历 活动 计划`,
        `${target} 政策 趋势 项目 2026`,
        `${target} calendar events association`,
      ],
      whyThisFamily: "观察信号用于补足下一轮监控方向，避免只看已经明确可报名的页面。",
      resultBucket: "watch_signal",
    },
    {
      familyName: "reference case",
      intentType: "reference_case",
      sourceArchetype: "case list / winner list / rule page",
      queries: [
        `${target} 案例 往届 名单`,
        `${target} 规则 费用 资格 条款`,
        `${target} case rules fee eligibility`,
      ],
      whyThisFamily: "参考案例帮助判断包装角度、材料缺口和风险，但不等同于直接机会。",
      resultBucket: "reference_case",
    },
  ];
}

function inferQueryFamilies(spec: RadarRequirementSpec, description: string, profileSummary?: RadarProfileSummary): RadarVersionQueryFamily[] {
  if (/b2b\s*商品交易|商品交易\s*saas|零售|retail/.test(description.toLowerCase())) return retailQueryFamilies();
  if (/b2b\s*saas/.test(description.toLowerCase()) && /东南亚|southeast|出海/.test(description)) return b2bSaasQueryFamilies();
  return genericQueryFamilies(spec, profileSummary);
}

function normalizeStrategyIntent(value: string | undefined): SearchIntentType {
  if (value === "retail_customer_lead") return "customer_lead";
  if (
    value === "direct_opportunity" ||
    value === "business_lead" ||
    value === "channel_partner_lead" ||
    value === "customer_lead" ||
    value === "association_directory" ||
    value === "watch_signal" ||
    value === "reference_case"
  ) return value;
  return "business_lead";
}

function normalizeQueryVariant(value: string | undefined): SearchQueryVariant {
  if (
    value === "broad_discovery" ||
    value === "official_source" ||
    value === "action_keyword" ||
    value === "region_language" ||
    value === "source_archetype" ||
    value === "source_hint"
  ) return value;
  return "broad_discovery";
}

function queryFamiliesFromStrategyDraft(draft?: ExtractedOpportunityStrategy): RadarVersionQueryFamily[] {
  const themes = draft?.search_themes ?? [];
  return themes.slice(0, 5).flatMap((theme) => {
    const familyName = String(theme.theme_name ?? theme.query_family ?? "").trim();
    const sourceArchetype = String(theme.source_archetype ?? "").trim();
    const queryVariants = (theme.query_variants ?? [])
      .map((item) => ({
        query: String(item.query ?? "").replace(/\s+/g, " ").trim(),
        variant: normalizeQueryVariant(item.variant),
      }))
      .filter((item) => item.query)
      .slice(0, 3);
    if (!familyName || !sourceArchetype || queryVariants.length < 2) return [];
    const intentType = normalizeStrategyIntent(theme.intent_type);
    const resultBucket = normalizeStrategyIntent(theme.result_bucket || intentType) as OpportunityKind;
    return [{
      familyName,
      intentType,
      sourceArchetype,
      queries: queryVariants.map((item) => item.query),
      queryVariants,
      whyThisFamily: String(theme.why_this_theme ?? "").trim() || "根据用户画像扩展该行业的可行动机会来源。",
      resultBucket,
    }];
  });
}

function inferMissingConfig(spec: RadarRequirementSpec, description: string): string[] {
  const missing: string[] = [];
  if (!spec.client_profile?.business_type) missing.push("雷达服务对象的具体角色");
  if ((spec.region_scope?.primary_regions ?? []).length === 0) missing.push("优先国家 / 城市 / 行业范围");
  if (!spec.core_goals?.success_definition) missing.push("时间窗口和截止偏好");
  if ((spec.source_strategy?.manual_sources ?? []).length === 0 && (spec.source_strategy?.user_supplied_sources ?? []).length === 0) {
    missing.push("指定官网、协会、平台或行业信息源");
  }
  if (/b2b\s*商品交易|商品交易\s*saas|零售|retail/.test(description.toLowerCase())) {
    missing.push("目标零售细分：商超、便利店、批发商、FMCG、渠道商的优先级");
    missing.push("产品切入点：POS、ERP、供应链、订货系统或 marketplace 的主卖点");
  }
  return unique(missing.length > 0 ? missing : ["预算、联系人偏好和材料准备状态暂未明确"], 8);
}

function inferDefaultAssumptions(spec: RadarRequirementSpec, description: string, profileSummary?: RadarProfileSummary): string[] {
  return unique([
    ...(profileSummary?.assumptions ?? []),
    "默认优先看未来30-60天内可形成下一步动作的机会",
    "默认把搜索发现、字段已核验事实、模型判断和待复核项分开写入报告",
    "默认不把搜索摘要包装成已确认资格、费用、截止或采购意向",
    ...(textIncludes(description, [/b2b\s*商品交易|零售|retail/i]) ? ["默认东南亚优先看英语信息源，并兼顾本地协会、展会和供应商入口"] : []),
    ...(spec.source_strategy?.source_priority ?? []).length ? `默认优先复核：${spec.source_strategy?.source_priority?.join("、")}` : "",
  ], 8);
}

function inferRevisionNotes(description: string): RadarVersionRevisionNote[] {
  if (!/\[用户补充回答\]|不准|不是|改成|调整|更想|主要想/.test(description)) return [];
  if (/b2b\s*商品交易|商品交易\s*saas|零售|retail/.test(description.toLowerCase())) {
    return [
      { type: "downweighted", detail: "降低 FinTech、AI、泛科技展会等与零售商品交易无关来源的权重。" },
      { type: "upweighted", detail: "提高零售展会、FMCG、批发商、便利店、商超、POS/ERP、供应链、B2B marketplace 的权重。" },
      { type: "source_shift", detail: "来源类型转向 retail association、supplier portal、distributor directory、retail trade fair、POS/ERP partner directory。" },
      { type: "query_shift", detail: "查询方向转向 retail trade show、FMCG distributor、supermarket supplier registration、POS reseller partner、wholesale marketplace partner。" },
      { type: "assumption_changed", detail: "默认把高价值机会定义为能进入联系人、合作入口、供应商注册或渠道伙伴主表的线索。" },
    ];
  }
  return [
    { type: "added", detail: "根据用户补充信息更新雷达定位和查询方向。" },
    { type: "query_shift", detail: "后续搜索优先使用用户最新补充中的关键词和来源类型。" },
  ];
}

function inferResultBuckets(description: string, strategyDraft?: ExtractedOpportunityStrategy): string[] {
  const strategyBuckets = unique((strategyDraft?.search_themes ?? []).map((theme) =>
    normalizeStrategyIntent(theme.result_bucket || theme.intent_type),
  ));
  if (strategyBuckets.length > 0) {
    return unique([...strategyBuckets, "watch_signal", "reference_case", "rejected"]);
  }
  if (/b2b\s*商品交易|商品交易\s*saas|零售|retail/.test(description.toLowerCase())) {
    return [
      "direct_opportunity",
      "business_lead",
      "channel_partner_lead",
      "customer_lead",
      "association_directory",
      "watch_signal",
      "reference_case",
      "rejected",
    ];
  }
  return ["direct_opportunity", "business_lead", "watch_signal", "reference_case", "rejected"];
}

export function buildRadarVersionSpec(params: {
  spec: RadarRequirementSpec;
  description: string;
  profileSummary?: RadarProfileSummary;
  strategyDraft?: ExtractedOpportunityStrategy;
}): RadarVersionSpec {
  const { spec, description, profileSummary, strategyDraft } = params;
  const version = revisionVersion(description);
  const draftedQueryFamilies = queryFamiliesFromStrategyDraft(strategyDraft);
  const queryFamilies = draftedQueryFamilies.length >= 2
    ? draftedQueryFamilies
    : inferQueryFamilies(spec, description, profileSummary);
  const draftedSourceArchetypes = unique(strategyDraft?.source_archetypes ?? [], 10);
  const draftedHighValueCriteria = unique(strategyDraft?.high_value_criteria ?? [], 8);
  return {
    version,
    oneSentencePositioning: inferPositioning(spec, description, profileSummary),
    targetUser: profileSummary?.identity || firstNonEmpty(spec.client_profile?.business_type, spec.client_profile?.client_type, spec.client_profile?.industry),
    businessContext: inferBusinessContext(spec, description, profileSummary),
    opportunityIntents: inferOpportunityIntents(spec, description),
    highValueCriteria: draftedHighValueCriteria.length > 0 ? draftedHighValueCriteria : inferHighValueCriteria(description),
    exclusionRules: inferExclusions(spec, description),
    prioritySourceArchetypes: draftedSourceArchetypes.length > 0 ? draftedSourceArchetypes : inferSourceArchetypes(spec, description),
    queryFamilies,
    scoringRules: [
      { key: "contactability", label: "可联系 / 可进入入口", weight: 35, highScoreRule: "有官方联系人、邮箱、报名表单、供应商入口、商务配对或合作入口。" },
      { key: "fit", label: "画像匹配度", weight: 25, highScoreRule: "与用户身份、机会类型、地区和行动目的高度一致。" },
      { key: "source_authority", label: "来源可信度", weight: 15, highScoreRule: "来自官网、协会、政府、主办方、平台招商页或可核验机构。" },
      { key: "timeliness", label: "时效性", weight: 10, highScoreRule: "本周或未来30-60天能形成下一步动作。" },
      { key: "strategic_value", label: "业务价值", weight: 10, highScoreRule: "能带来客户、渠道、申报、曝光、报名或合作价值。" },
      { key: "risk_clarity", label: "风险清晰度", weight: 5, highScoreRule: "费用、资格、版权、截止和执行成本风险可复核。" },
    ],
    reportTemplate: [
      "本轮结论",
      "重点机会卡",
      "可行动线索",
      "观察信号",
      "参考案例",
      "淘汰 / 降权项",
      "来源与证据状态",
      "推荐打法 / 包装角度",
      "材料缺口与准备清单",
      "风险提醒",
      "本周建议动作",
      "下一轮监控关键词",
    ],
    missingConfig: inferMissingConfig(spec, description),
    defaultAssumptions: inferDefaultAssumptions(spec, description, profileSummary),
    revisionNotes: inferRevisionNotes(description),
    resultBuckets: inferResultBuckets(description, strategyDraft),
  };
}
