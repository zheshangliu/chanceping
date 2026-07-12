import type { RadarRequirementSpec } from "../schema/radar-requirement-spec";
import type {
  OpportunityKind,
  SearchIntentType,
  SearchQueryVariant,
  SourceArchetypeId,
} from "../schema/radar-mvp-contracts";
import type { RadarVersionQueryFamily } from "../schema/radar-version-spec";

export interface SearchTheme {
  id: string;
  themeName: string;
  intentType: SearchIntentType;
  sourceArchetype: SourceArchetypeId;
  sourceArchetypeLabel: string;
  queryFamily: string;
  queryExamples: string[];
  whyThisTheme: string;
  priority: number;
}

export interface SearchQueryFamilyItem {
  query: string;
  language: string;
  region?: string;
  sourceDomain?: string;
  themeName: string;
  intentType: SearchIntentType;
  sourceArchetype: SourceArchetypeId;
  sourceArchetypeLabel: string;
  queryFamily: string;
  queryVariant: SearchQueryVariant;
}

export interface OpportunityStrategy {
  radarVersion: string;
  searchThemes: SearchTheme[];
  queries: SearchQueryFamilyItem[];
  sourceArchetypes: Array<{ id: SourceArchetypeId; label: string }>;
  resultBucketPolicy: Record<OpportunityKind, "key_opportunity" | "actionable_lead" | "lead_resource" | "observation" | "reference" | "audit_only">;
  evidenceReadPriority: string[];
}

const MAX_THEMES = 5;
const MAX_QUERIES_PER_THEME = 3;

const ACTION_RE = /报名|申请|申报|招标|采购|投稿|投标|入驻|注册|联系|合作|registration|application|apply|tender|procurement|submission|supplier|contact|partner/i;
const SOURCE_RE = /官方|官网|协会|目录|平台|portal|directory|association|official|marketplace|agency|chamber/i;
const REGION_RE = /中国|广东|广州|深圳|香港|新加坡|马来西亚|泰国|越南|印尼|日本|韩国|东南亚|国际|asean|southeast asia|singapore|malaysia|thailand|vietnam|indonesia|japan|korea/i;
const GENERIC_SEARCH_TOPIC_RE = /^(?:机会|项目|采购|招标|投标|合作|联系|报名|申请|公告|官方|客户|线索|服务|公司|企业|活动|供应商|入库|供应|维护|管理|改造|建设|技术|工程|系统|平台|设备)$/i;

function normalizedKey(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function aiEventStrategyText(spec: RadarRequirementSpec, families: RadarVersionQueryFamily[]): string {
  return [
    spec.client_profile?.client_type,
    spec.client_profile?.industry,
    spec.client_profile?.business_type,
    spec.core_goals?.primary_goal,
    spec.core_goals?.success_definition,
    ...(spec.core_goals?.action_intent ?? []),
    ...(spec.opportunity_scope?.primary_opportunity_types ?? []),
    ...(spec.opportunity_scope?.secondary_opportunity_types ?? []),
    ...(spec.opportunity_scope?.must_have_conditions ?? []),
    ...(spec.opportunity_scope?.nice_to_have_conditions ?? []),
    ...(spec.region_scope?.primary_regions ?? []),
    ...(spec.region_scope?.secondary_regions ?? []),
    ...(spec.keyword_strategy?.core_keywords_zh ?? []),
    ...(spec.keyword_strategy?.core_keywords_en ?? []),
    ...(spec.keyword_strategy?.expanded_keywords_zh ?? []),
    ...(spec.keyword_strategy?.expanded_keywords_en ?? []),
    ...(spec.source_strategy?.official_sites ?? []),
    ...(spec.source_strategy?.platforms ?? []),
    ...(spec.source_strategy?.manual_sources ?? []),
    ...(spec.radar_version?.opportunityIntents ?? []),
    ...(spec.radar_version?.highValueCriteria ?? []),
    ...(spec.radar_version?.prioritySourceArchetypes ?? []),
    spec.radar_version?.oneSentencePositioning,
    spec.radar_version?.targetUser,
    spec.radar_version?.businessContext,
    ...families.flatMap((family) => [
      family.familyName,
      family.intentType,
      family.sourceArchetype,
      family.whyThisFamily,
      ...(family.queries ?? []),
      ...(family.queryVariants ?? []).map((item) => item.query),
    ]),
  ].filter(Boolean).join(" ");
}

function shouldApplyAiEventHeroExpansion(spec: RadarRequirementSpec, families: RadarVersionQueryFamily[]): boolean {
  const text = aiEventStrategyText(spec, families);
  const hasAiSubject = /(?:^|[^a-z])ai(?:[^a-z]|$)|人工智能|大模型|agent|aigc|llm|qwen|通义|trae|developer|cloud/i.test(text);
  const hasDeveloperAiProxy = /OPC|个人开发者|开发者|独立开发者|创业者/i.test(text)
    && /云资源|上架|展示|提交作品|开发者挑战|hackathon|challenge|developer contest|developer competition/i.test(text);
  const hasEventIntent = /比赛|赛事|大赛|竞赛|马拉松|黑客松|hackathon|challenge|contest|competition|game jam|创作赛|开发者挑战/i.test(text);
  const hasParticipantSignal = /报名|参加|参赛|提交|投稿|申请|作品|奖金|云资源|展示|opportunity|apply|application|registration|entry|submit|prize|credits|showcase|OPC|个人开发者|创业者/i.test(text);
  return (hasAiSubject || hasDeveloperAiProxy) && hasEventIntent && hasParticipantSignal;
}

function aiEventRegionLabel(spec: RadarRequirementSpec): string {
  const regions = [
    ...(spec.region_scope?.primary_regions ?? []),
    ...(spec.region_scope?.secondary_regions ?? []),
  ].map((item) => item.trim()).filter(Boolean);
  if (regions.some((item) => /大湾区|湾区|广州|深圳|香港|澳门|广东/.test(item))) return "大湾区";
  if (regions.length > 0) return regions.slice(0, 2).join(" / ");
  if (spec.region_scope?.overseas_allowed || spec.region_scope?.global_allowed) return "大湾区及海外";
  return "全球";
}

function aiEventHeroFamilies(spec: RadarRequirementSpec): RadarVersionQueryFamily[] {
  const region = aiEventRegionLabel(spec);
  return [
    {
      familyName: `${region} AI 赛事直接入口`,
      intentType: "direct_opportunity",
      sourceArchetype: "official event site / organizer announcement",
      queries: [
        `${region} AI Hackathon 报名 AI 马拉松 开发者挑战 2026`,
        `${region} 人工智能 创新大赛 报名 AI 比赛 2026`,
        `Greater Bay Area AI hackathon registration developer challenge 2026`,
      ],
      queryVariants: [
        { query: `${region} AI Hackathon 报名 AI 马拉松 开发者挑战 2026`, variant: "region_language" },
        { query: `${region} 人工智能 创新大赛 报名 AI 比赛 2026`, variant: "action_keyword" },
        { query: "Greater Bay Area AI hackathon registration developer challenge 2026", variant: "region_language" },
      ],
      whyThisFamily: "把用户说的 AI 马拉松 / AI 比赛翻译成 Hackathon、开发者挑战和官方报名入口，优先保留地域相关机会。",
      resultBucket: "direct_opportunity",
    },
    {
      familyName: "Qwen Cloud / Devpost Hackathon",
      intentType: "direct_opportunity",
      sourceArchetype: "official event site / hackathon platform",
      queries: [
        "Qwen Cloud Hackathon Devpost official application",
        "site:devpost.com Qwen Cloud Hackathon",
        "Devpost AI hackathon registration Qwen Cloud 2026",
      ],
      queryVariants: [
        { query: "Qwen Cloud Hackathon Devpost official application", variant: "official_source" },
        { query: "site:devpost.com Qwen Cloud Hackathon", variant: "source_archetype" },
        { query: "Devpost AI hackathon registration Qwen Cloud 2026", variant: "action_keyword" },
      ],
      whyThisFamily: "Devpost、Qwen Cloud 这类具体赛事页通常直接包含报名、提交作品和奖项信息，是 AI 赛事雷达的高价值入口。",
      resultBucket: "direct_opportunity",
    },
    {
      familyName: "TRAE / AI IDE / Vibe Coding 赛事",
      intentType: "direct_opportunity",
      sourceArchetype: "developer challenge page",
      queries: [
        "site:forum.trae.cn TRAE AI 创造力大赛 报名",
        "TRAE AI 创造力大赛 官方 报名 规则",
        "AI IDE Vibe Coding Hackathon registration cloud credits",
      ],
      queryVariants: [
        { query: "site:forum.trae.cn TRAE AI 创造力大赛 报名", variant: "official_source" },
        { query: "TRAE AI 创造力大赛 官方 报名 规则", variant: "action_keyword" },
        { query: "AI IDE Vibe Coding Hackathon registration cloud credits", variant: "source_archetype" },
      ],
      whyThisFamily: "AI IDE、Vibe Coding、TRAE 类比赛更贴近 OPC / 个人开发者展示产品、提交作品和争取云资源的目标。",
      resultBucket: "direct_opportunity",
    },
    {
      familyName: "DoraHacks / Lablab / AI Agent Hackathon",
      intentType: "direct_opportunity",
      sourceArchetype: "hackathon platform / AI agent challenge page",
      queries: [
        "DoraHacks AI hackathon registration cloud credits",
        "Lablab AI Agent Hackathon registration",
        "AI Agent Hackathon developer challenge registration 2026",
      ],
      queryVariants: [
        { query: "DoraHacks AI hackathon registration cloud credits", variant: "source_archetype" },
        { query: "Lablab AI Agent Hackathon registration", variant: "official_source" },
        { query: "AI Agent Hackathon developer challenge registration 2026", variant: "action_keyword" },
      ],
      whyThisFamily: "Hackathon 平台和 AI Agent 赛事常有可报名、可提交作品、可拿资源的短周期机会。",
      resultBucket: "direct_opportunity",
    },
    {
      familyName: "云厂商开发者挑战与 AI 创业扶持",
      intentType: "direct_opportunity",
      sourceArchetype: "cloud vendor developer program / startup showcase",
      queries: [
        "AWS Google Cloud Microsoft Azure AI developer challenge registration cloud credits",
        "Kaggle GitHub Hugging Face AI competition developer challenge registration",
        "Product Hunt AI Grant startup showcase 阿里云 腾讯云 AI 开发者大赛 报名 云资源",
      ],
      queryVariants: [
        { query: "AWS Google Cloud Microsoft Azure AI developer challenge registration cloud credits", variant: "official_source" },
        { query: "Kaggle GitHub Hugging Face AI competition developer challenge registration", variant: "source_archetype" },
        { query: "Product Hunt AI Grant startup showcase 阿里云 腾讯云 AI 开发者大赛 报名 云资源", variant: "action_keyword" },
      ],
      whyThisFamily: "云厂商挑战赛、开发者平台、AI Grant 和产品展示平台往往提供奖金、云资源、产品展示或上架机会，适合作为 AI 赛事雷达的主线来源。",
      resultBucket: "direct_opportunity",
    },
  ];
}

function expandAiEventHeroFamilies(spec: RadarRequirementSpec, families: RadarVersionQueryFamily[]): RadarVersionQueryFamily[] {
  if (!shouldApplyAiEventHeroExpansion(spec, families)) return families;
  const seen = new Set<string>();
  const expanded: RadarVersionQueryFamily[] = [];
  for (const family of aiEventHeroFamilies(spec)) {
    const key = normalizedKey(family.familyName);
    if (seen.has(key)) continue;
    seen.add(key);
    expanded.push(family);
  }
  for (const family of families) {
    const key = normalizedKey(family.familyName);
    if (seen.has(key)) continue;
    seen.add(key);
    expanded.push(family);
  }
  return expanded.slice(0, MAX_THEMES);
}

function uniqueText(values: Array<string | undefined>, limit: number): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const text = String(value ?? "").trim();
    const key = normalizedKey(text);
    if (!text || seen.has(key)) continue;
    seen.add(key);
    output.push(text);
    if (output.length >= limit) break;
  }
  return output;
}

/**
 * A revision can fall back to deterministic logic when a live model is slow.
 * Keep a structured-spec query family ahead of the revision prose so the
 * search still starts from the user's actual industry, not generic action terms.
 */
function structuredTopicTerms(spec: RadarRequirementSpec): string[] {
  const terms = uniqueText([
    ...(spec.keyword_strategy?.core_keywords_zh ?? []),
    ...(spec.keyword_strategy?.expanded_keywords_zh ?? []),
  ], 8);
  // The compiler preserves the customer's full description for explainability,
  // but search needs the atomic industry phrases that were derived from it.
  // Prefer these over a long "A、B 和 C" sentence when both are available.
  const atomicTerms = terms.filter((term) =>
    !/[、，,；;]|(?:和|及|与)/.test(term) && !GENERIC_SEARCH_TOPIC_RE.test(term),
  );
  const selected = atomicTerms.length > 0 ? atomicTerms : terms;
  const searchable = selected.flatMap((term) => {
    const chineseSubjects = term.match(/[\u3400-\u9fff]{3,}/g) ?? [];
    // Put the source-page-friendly Chinese subject first for mixed labels such
    // as "供应链金融 SaaS", while retaining the full product label as a fallback.
    return [...chineseSubjects, term];
  });
  return uniqueText(searchable, 4);
}

function splitStructuredScopeTerms(values: string[]): string[] {
  return uniqueText(values.flatMap((value) => String(value ?? "")
    .split(/[、，,；;。]|以及|或者|或|和|与/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 3 && item.length <= 18 && !GENERIC_SEARCH_TOPIC_RE.test(item))), 6);
}

function structuredSearchTerms(spec: RadarRequirementSpec): string[] {
  const industryTerms = structuredTopicTerms(spec);
  const scopeTerms = splitStructuredScopeTerms([
    ...(spec.opportunity_scope?.primary_opportunity_types ?? []),
    ...(spec.opportunity_scope?.secondary_opportunity_types ?? []),
    ...(spec.opportunity_scope?.must_have_conditions ?? []),
    ...(spec.opportunity_scope?.nice_to_have_conditions ?? []),
    ...(spec.core_goals?.primary_goal ? [spec.core_goals.primary_goal] : []),
    ...(spec.core_goals?.success_definition ? [spec.core_goals.success_definition] : []),
  ]);
  // The first query remains anchored on the user's offering. Subsequent
  // queries deliberately target the buyers, institutions or project forms the
  // user named, rather than repeating a long prose requirement.
  return uniqueText([
    industryTerms[0],
    ...scopeTerms,
    ...industryTerms.slice(1),
  ], 5);
}

function structuredRegion(spec: RadarRequirementSpec): string {
  return uniqueText([
    ...(spec.region_scope?.primary_regions ?? []),
    ...(spec.client_profile?.regions ?? []),
  ], 2).join(" ");
}

function structuredActionText(spec: RadarRequirementSpec, topicTerms: string[]): string {
  const strategyText = [
    ...topicTerms,
    ...(spec.core_goals?.action_intent ?? []),
    ...(spec.opportunity_scope?.must_have_conditions ?? []),
    ...(spec.radar_version?.highValueCriteria ?? []),
  ].join(" ");
  return /采购|招标|投标|供应商|入库|项目/.test(strategyText)
    ? "招标 采购 项目公告 供应商"
    : /合作|渠道|代理|入驻|联名|客户/.test(strategyText)
      ? "合作 伙伴 入驻 供应商 联系"
      : "官方公告 申请 报名 合作";
}

function buildStructuredCoverageFamily(spec: RadarRequirementSpec): RadarVersionQueryFamily | null {
  const topicTerms = structuredSearchTerms(spec);
  if (topicTerms.length === 0) return null;
  const region = structuredRegion(spec);
  const actions = structuredActionText(spec, topicTerms);
  const coverageQueries = uniqueText(topicTerms.slice(0, MAX_QUERIES_PER_THEME).map((term) =>
    `${region ? `${region} ` : ""}${term} ${actions}`,
  ), MAX_QUERIES_PER_THEME);
  return {
    familyName: "当前行业直接机会",
    intentType: "direct_opportunity",
    sourceArchetype: "official procurement / tender / partner page",
    queries: coverageQueries,
    queryVariants: coverageQueries.map((query, index) => ({
      query,
      variant: (index === 0 ? "broad_discovery" : region ? "region_language" : "action_keyword") as SearchQueryVariant,
    })),
    whyThisFamily: "直接使用雷达结构化行业词、地区与行动条件，避免修订文本回退时丢失行业主体。",
    resultBucket: "direct_opportunity",
  };
}

function buildStructuredOfficialSourceFamily(spec: RadarRequirementSpec): RadarVersionQueryFamily | null {
  const topicTerms = structuredSearchTerms(spec);
  if (topicTerms.length === 0) return null;
  const region = structuredRegion(spec);
  const actions = structuredActionText(spec, topicTerms);
  const queries = uniqueText(topicTerms.slice(0, MAX_QUERIES_PER_THEME).map((term) =>
    `${region ? `${region} ` : ""}${term} ${actions} 官方 site:gov.cn`,
  ), MAX_QUERIES_PER_THEME);
  return {
    familyName: "当前行业官方项目源",
    intentType: "direct_opportunity",
    sourceArchetype: "government grant page / official procurement notice",
    queries,
    queryVariants: queries.map((query) => ({ query, variant: "official_source" as const })),
    whyThisFamily: "优先检查政府、园区、主办方的具体公告与采购入口，不把泛政策法规当成项目机会。",
    resultBucket: "direct_opportunity",
  };
}

function buildStructuredPartnershipFamily(spec: RadarRequirementSpec): RadarVersionQueryFamily | null {
  const topicTerms = structuredSearchTerms(spec);
  if (topicTerms.length === 0) return null;
  const strategyText = [
    ...topicTerms,
    ...(spec.core_goals?.action_intent ?? []),
    ...(spec.opportunity_scope?.primary_opportunity_types ?? []),
    ...(spec.opportunity_scope?.must_have_conditions ?? []),
    ...(spec.radar_version?.opportunityIntents ?? []),
    ...(spec.radar_version?.highValueCriteria ?? []),
  ].join(" ");
  if (!/合作|渠道|代理|伙伴|核心企业|金融机构|平台|客户|生态|入驻|招商/.test(strategyText)) return null;
  const region = structuredRegion(spec);
  const queries = uniqueText(topicTerms.slice(0, MAX_QUERIES_PER_THEME).map((term) =>
    `${region ? `${region} ` : ""}${term} 合作 伙伴 平台 联系`,
  ), MAX_QUERIES_PER_THEME);
  return {
    familyName: "当前行业合作与渠道入口",
    intentType: "business_lead",
    sourceArchetype: "partner directory / company contact page",
    queries,
    queryVariants: queries.map((query) => ({ query, variant: "action_keyword" as const })),
    whyThisFamily: "当用户同时寻找客户、渠道、平台或核心企业合作时，单独搜索可联系的合作入口，不让招采查询挤占配额。",
    resultBucket: "business_lead",
  };
}

function familyContainsTopic(family: RadarVersionQueryFamily, topicTerms: string[]): boolean {
  const text = [family.familyName, family.whyThisFamily, ...(family.queries ?? [])].join(" ").toLowerCase();
  return topicTerms.some((term) => text.includes(term.toLowerCase()));
}

function enrichFamiliesWithStructuredCoverage(spec: RadarRequirementSpec, families: RadarVersionQueryFamily[]): RadarVersionQueryFamily[] {
  if (shouldApplyAiEventHeroExpansion(spec, families)) return families;
  const coverage = buildStructuredCoverageFamily(spec);
  if (!coverage) return families;
  const official = buildStructuredOfficialSourceFamily(spec);
  const partnership = buildStructuredPartnershipFamily(spec);
  const topicTerms = structuredTopicTerms(spec);
  const covered = new Set([
    normalizedKey(coverage.familyName),
    normalizedKey(official?.familyName ?? ""),
    normalizedKey(partnership?.familyName ?? ""),
  ]);
  const relevantExisting = families.filter((family) =>
    !covered.has(normalizedKey(family.familyName)) && familyContainsTopic(family, topicTerms),
  );
  const existingWithRecovery = relevantExisting.filter((family) => recoveryVariants(family).length > 0);
  const otherExisting = relevantExisting.filter((family) => !existingWithRecovery.includes(family));
  return [coverage, ...(official ? [official] : []), ...existingWithRecovery, ...(partnership ? [partnership] : []), ...otherExisting]
    .slice(0, MAX_THEMES);
}

export const RESULT_BUCKET_POLICY: OpportunityStrategy["resultBucketPolicy"] = {
  direct_opportunity: "key_opportunity",
  business_lead: "actionable_lead",
  channel_partner_lead: "actionable_lead",
  customer_lead: "actionable_lead",
  association_directory: "lead_resource",
  watch_signal: "observation",
  reference_case: "reference",
  rejected: "audit_only",
};

export function normalizeOpportunityIntent(value: RadarVersionQueryFamily["intentType"] | string | undefined): SearchIntentType {
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

export function normalizeSourceArchetype(label: string): SourceArchetypeId {
  const text = label.toLowerCase();
  if (/open call|submission|征集|投稿/.test(text)) return "open_call_submission_page";
  if (/exhibitor|sponsor|展商|赞助/.test(text)) return "exhibitor_sponsor_page";
  if (/business matching|商务配对/.test(text)) return "business_matching_platform";
  if (/supplier portal|vendor portal|procurement|采购|供应商/.test(text)) return "procurement_or_supplier_portal";
  if (/marketplace/.test(text)) return "marketplace_partner_page";
  if (/reseller|pos|erp|partner|合作|渠道|代理|实施伙伴/.test(text)) return "reseller_partner_page";
  if (/distributor|wholesaler|分销|批发/.test(text)) return "distributor_directory";
  if (/association|member directory|协会|会员目录|chamber/.test(text)) return "association_member_directory";
  if (/grant|government|政府|补贴|扶持|investment agency/.test(text)) return "government_grant_page";
  if (/career|招聘|contact|联系人/.test(text)) return "company_careers_or_contact";
  if (/case|winner|rule|reference|案例|往届|规则/.test(text)) return "reference_case_source";
  return "official_event_site";
}

function detectQueryLanguage(query: string): string {
  const hasZh = /[\u4e00-\u9fff]/.test(query);
  const hasKana = /[\u3040-\u30ff]/.test(query);
  const hasHangul = /[\uac00-\ud7af]/.test(query);
  const hasEn = /[a-z]/i.test(query);
  if ((hasZh || hasKana || hasHangul) && hasEn) return "mixed";
  if (hasKana) return "ja";
  if (hasHangul) return "ko";
  if (hasEn) return "en";
  return "zh";
}

function inferQueryVariant(query: string): SearchQueryVariant {
  if (ACTION_RE.test(query)) return "action_keyword";
  if (SOURCE_RE.test(query)) return "official_source";
  if (REGION_RE.test(query)) return "region_language";
  return "broad_discovery";
}

function recoveryVariants(family: RadarVersionQueryFamily): Array<{ query: string; variant: SearchQueryVariant }> {
  const text = [
    family.familyName,
    family.intentType,
    family.sourceArchetype,
    family.whyThisFamily,
    ...(family.queries ?? []),
  ].join(" ").toLowerCase();
  const variants: Array<{ query: string; variant: SearchQueryVariant }> = [];

  if (/ai|agent|hackathon|developer|startup|cloud|accelerator|创业|开发者|云厂商|大赛|黑客松/.test(text)) {
    variants.push(
      { query: "AI Agent Hackathon developer challenge AI application contest application 2026", variant: "action_keyword" },
      { query: "Qwen Alibaba Cloud AWS Google Cloud Microsoft for Startups cloud credits startup program accelerator application 2026", variant: "source_archetype" },
    );
  }
  if (/seller|marketplace|cross-border|ecommerce|e-commerce|fulfillment|warehouse|平台|卖家|跨境电商|平台招商|大促|海外仓|履约/.test(text)) {
    variants.push(
      { query: "marketplace seller center seller centre campaign registration supplier portal vendor registration 2026", variant: "action_keyword" },
      { query: "Shopee Lazada TikTok Shop Amazon Global Selling seller registration marketplace partner fulfillment overseas warehouse", variant: "source_archetype" },
    );
  }
  if (/围棋|棋院|baduk|(?:^|\s)igo(?:\s|$)|\bgo (?:tournament|championship)|职业定段赛|围棋公开赛|围棋协会/.test(text)) {
    variants.push(
      { query: "go tournament entry competition regulations association notice registration 2026", variant: "action_keyword" },
      { query: "中国围棋协会 日本棋院 Nihon Kiin Korea Baduk Association IGO tournament entry", variant: "official_source" },
    );
  }
  if (/headhunter|猎头|finance|financial|treasury|tax|controller|internal control|ipo|careers?|招聘|岗位|职位|财务|资金|税务|内控/.test(text)) {
    variants.push(
      { query: "company careers official careers career page contact page treasury controller tax manager internal control hiring", variant: "official_source" },
      { query: "IPO expansion overseas expansion finance treasury tax internal control hiring Hong Kong Singapore Guangzhou", variant: "action_keyword" },
    );
  }
  if (/少儿编程|青少年编程|儿童编程|kids coding|k12|steam|课后服务|课程采购|学校合作|科创活动|承办|招生/.test(text)) {
    variants.push(
      { query: "少儿编程 学校 科创 活动 承办 课程采购 招标", variant: "action_keyword" },
      { query: "课后服务 教育局 采购 少儿编程 课程合作 after-school course procurement", variant: "source_archetype" },
    );
  }
  return variants;
}

function explicitVariants(family: RadarVersionQueryFamily): Array<{ query: string; variant: SearchQueryVariant }> {
  const supplied = family.queryVariants?.filter((item) => item.query.trim()) ?? [];
  const base = supplied.length > 0 ? supplied : family.queries
    .filter((query) => query.trim())
    .map((query) => ({ query, variant: inferQueryVariant(query) }));
  const seen = new Set<string>();
  // Keep established recovery routes (official associations, company careers,
  // marketplace seller centres) ahead of generic prose queries. They exist to
  // prevent known no-card cases, so they must not be crowded out by a family
  // that already supplies three draft variants.
  return [...recoveryVariants(family), ...base]
    .filter((item) => {
      const key = item.query.toLowerCase().replace(/\s+/g, " ").trim();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_QUERIES_PER_THEME);
}

function uniqueSourceArchetypes(labels: string[]): Array<{ id: SourceArchetypeId; label: string }> {
  const seen = new Set<string>();
  const result: Array<{ id: SourceArchetypeId; label: string }> = [];
  for (const label of labels) {
    const cleanLabel = String(label ?? "").trim();
    if (!cleanLabel) continue;
    const id = normalizeSourceArchetype(cleanLabel);
    const key = `${id}:${cleanLabel.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ id, label: cleanLabel });
  }
  return result;
}

export function buildOpportunityStrategy(spec: RadarRequirementSpec): OpportunityStrategy | null {
  const radarVersion = spec.radar_version;
  const rawFamilies = radarVersion?.queryFamilies ?? [];
  const families = enrichFamiliesWithStructuredCoverage(spec, expandAiEventHeroFamilies(spec, rawFamilies));
  if (!radarVersion || families.length === 0) return null;

  const searchThemes: SearchTheme[] = families.map((family, index) => {
    const variants = explicitVariants(family);
    return {
      id: `theme_radar_version_${index + 1}`,
      themeName: family.familyName,
      intentType: normalizeOpportunityIntent(family.resultBucket || family.intentType),
      sourceArchetype: normalizeSourceArchetype(family.sourceArchetype),
      sourceArchetypeLabel: family.sourceArchetype,
      queryFamily: family.familyName,
      queryExamples: variants.map((item) => item.query),
      whyThisTheme: family.whyThisFamily,
      priority: index + 1,
    };
  });

  const queries = families.flatMap((family, index) => {
    const theme = searchThemes[index];
    return explicitVariants(family).map((item) => ({
      query: item.query.replace(/\s+/g, " ").trim(),
      language: detectQueryLanguage(item.query),
      themeName: theme.themeName,
      intentType: theme.intentType,
      sourceArchetype: theme.sourceArchetype,
      sourceArchetypeLabel: theme.sourceArchetypeLabel,
      queryFamily: family.familyName,
      queryVariant: item.variant,
    }));
  }).slice(0, MAX_THEMES * MAX_QUERIES_PER_THEME);

  const sourceArchetypes = uniqueSourceArchetypes([
    ...(radarVersion.prioritySourceArchetypes ?? []),
    ...families.map((family) => family.sourceArchetype),
  ]);

  return {
    radarVersion: radarVersion.version,
    searchThemes,
    queries,
    sourceArchetypes,
    resultBucketPolicy: RESULT_BUCKET_POLICY,
    evidenceReadPriority: searchThemes.slice(0, 3).map((theme) => theme.id),
  };
}
