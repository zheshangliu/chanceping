/**
 * T10 搜索编排器（search orchestrator）
 *
 * 来源：Task 019d 第 4.4 节。
 *
 * 串联 T10 三层筛选：
 *   1. 根据 spec 雷达类型从 providerRegistry 获取 providers
 *   2. 并行调用各 provider 的 search()，合并搜索结果
 *   3. 第一层：ruleFilter 规则粗筛
 *   4. 第二层：aiFilter AI 精筛（enableContentFetch=false 时跳过，relevance 固定 50）
 *   5. 第三层：scoreOpportunities 机会评分
 *   6. 返回 SearchOrchestratorResult
 *
 * 错误隔离：
 *   - provider 调用失败 → errors 记录，不影响其他 provider
 *   - 无可用 provider → 返回空结果 + errors 记录
 *   - 整个流程不因单步失败而中断
 *
 * Mock 模式：全部走 Mock（SerperProvider Mock + QwenAdapter Mock），端到端可测试。
 */

import type { ScoredOpportunity, SearchResult, CleanedContent, RawCandidateAudit, SearchOptions } from "./types";
import type { SearchProvider } from "./provider-registry";
import type { RadarRequirementSpec } from "../schema/radar-requirement-spec";
import type { ProviderRouting } from "../schema/radar";
import type { LLMAdapter } from "../agents/llm-adapter";
import type { DataMode } from "../demo/data-mode";
import type { SourceCandidate } from "../schema/source-candidate";
import type { EvidenceItem } from "../schema/evidence-item";
import type { OpportunityCard } from "../schema/opportunity-card";
import type { CandidateAccounting, FieldEvidenceItem, OpportunityKind, RadarSearchPlan, SearchExecutionLog, SearchIntentType, SourceCoverageItem } from "../schema/radar-mvp-contracts";
import type { RadarType, OpportunityStore } from "../agents/opportunity-store";
import { computeDedupKey } from "../agents/opportunity-store";
import { normalizeUrl } from "../utils/url-normalizer";
import { providerRegistry } from "./provider-registry";
import { ruleFilter } from "./rule-filter";
import { aiFilter, type AIFilterItem } from "./ai-filter";
import { scoreOpportunities } from "./opportunity-scorer";
import { deduplicateByUrL } from "./radar-router";
import { loadDemoSearchResults } from "../demo";
import { classifySources } from "./source-classifier";
import { extractEvidenceBatch } from "./evidence-extractor";
import { applyAiEventConcreteEntryGuard, mapToCard, sortOpportunityCardsForDisplay } from "./opportunity-card-mapper";
import {
  buildMockSourceHintChecks,
  buildManualSourceSearches,
  buildNameOnlySourceChecks,
  buildSourceHintSearches,
  extractSourceDomain,
  getManualSourceNames,
  getUserSuppliedUrlSources,
  type SourceHintCheck,
} from "./source-hints";
import { buildUnopenedFieldEvidence, fetchLiveEvidence, type LiveEvidenceFetchResult } from "./live-evidence";
import { buildSearchIntentPlan, type SearchIntentPlan, type SearchQueryFamilyItem } from "./search-intent-planner";
import { normalizeOpportunityIntent } from "./opportunity-strategy";
import { getSearchCostLimits, normalizeSearchQuery, type SearchCostLimits } from "./search-cost-guard";
import { buildKeywordPack } from "./keyword-pack";
import { applyCandidateRelevanceGate } from "./candidate-relevance";
import { applyCandidatePageTypeGate } from "./candidate-page-type";
import { applyCandidateJudgeGate } from "./candidate-llm-judge";
import { applyCandidateOwnershipGate } from "./candidate-ownership";
import { rankCandidateResults } from "./candidate-ranking";
import { buildPrimarySourceRecoveryQueries } from "./primary-source-recovery";
import { prioritizeEvidenceReadCandidates } from "./evidence-read-priority";

/** 搜索编排器配置 */
export interface SearchOrchestratorConfig {
  /** LLM 适配器（Mock 或真实） */
  llmAdapter: LLMAdapter;
  /** 每个 provider 最大结果数，默认 10 */
  maxResultsPerProvider?: number;
  /** AI 精筛阈值，默认 50 */
  minRelevance?: number;
  /** 是否抓取正文，默认 true */
  enableContentFetch?: boolean;
  /** Jina Reader 抓取模式：true=Mock内容（默认），false=真实抓取 */
  mockContent?: boolean;
  /**
   * 数据模式（Task 036）：
   *   - "mock"：加载 Mock Demo 数据，跳过真实搜索
   *   - "recorded"：加载 Recorded 录制数据，跳过真实搜索
   *   - "live"：（默认）使用真实搜索 Provider
   * 未设置时默认 "live"，以保护现有测试不依赖环境变量。
   */
  dataMode?: DataMode;
  /**
   * V1.6-07 新增：机会库引用（可选，用于增量标签复用）。
   *
   * 传入后，AI 精筛前会检查 store 中是否已有同 dedupKey 且 incremental=true 的条目：
   *   - 命中：跳过 AI 精筛，复用 store 中的 card.ai_analysis 构造 AIFilterItem
   *   - 未命中：调用 aiFilter 正常精筛
   *
   * 不传入时行为不变（向后兼容）。
   */
  opportunityStore?: OpportunityStore;
}

/** 搜索编排器结果 */
export interface SearchOrchestratorResult {
  /** 原始搜索结果数 */
  total_raw: number;
  /** 规则粗筛通过数 */
  total_rule_passed: number;
  /** AI 精筛通过数 */
  total_ai_passed: number;
  /** 评分完成数 */
  total_scored: number;
  /** 最终机会列表 */
  opportunities: ScoredOpportunity[];
  /** 错误信息 */
  errors: string[];
  /** 总耗时（毫秒） */
  duration_ms: number;
  // ============================================================
  // V1.3 新增字段（来源透明，全部 optional）
  // ============================================================
  /** V1.3 新增：来源候选列表（每个搜索结果对应的来源分类） */
  sourceCandidates?: SourceCandidate[];
  /** V1.3 新增：证据项列表（从清洗内容中提取的字段级证据） */
  evidenceItems?: EvidenceItem[];
  /** V1.3 新增：机会卡片列表（映射后的 OpportunityCard，含 S 级硬规则） */
  opportunityCards?: OpportunityCard[];
  /** MVP source hints：客户指定来源检查状态 */
  sourceHintChecks?: SourceHintCheck[];
  /** Chat-first MVP：本次搜索计划，不包含虚构执行结果 */
  searchPlan?: RadarSearchPlan;
  /** Chat-first MVP：实际 provider 调用日志；未真实打开网页时 openedUrls 为空 */
  executionLog?: SearchExecutionLog;
  /** Chat-first MVP：客户指定来源覆盖状态 */
  sourceCoverage?: SourceCoverageItem[];
  /** Chat-first MVP：候选数量统一账本 */
  candidateAccounting?: CandidateAccounting;
  /** Chat-first MVP：原始候选审计摘要 */
  rawCandidates?: RawCandidateAudit[];
  // ============================================================
  // V1.6-06 新增字段（Watch Rules 过滤指标）
  // ============================================================
  /** V1.6-06 新增：Watch Rules 过滤前数量（未配置规则时与 total_scored 相同） */
  watch_rules_before?: number;
  /** V1.6-06 新增：Watch Rules 过滤后数量（未配置规则时与 total_scored 相同） */
  watch_rules_after?: number;
  /** V1.6-06 新增：Watch Rules 被过滤掉的数量 */
  watch_rules_filtered_out?: number;
  // ============================================================
  // V1.6-07 新增字段（增量标签复用指标）
  // ============================================================
  /** V1.6-07 新增：因 incremental=true 跳过 AI 精筛的数量（复用上次分析） */
  ai_filter_skipped?: number;
  /** V1.6-07 新增：实际调用 AI 精筛的数量（fresh 未命中缓存） */
  ai_filter_executed?: number;
  // ============================================================
  // V1.6-08 新增字段（providerRouting fallback 降级信息）
  // ============================================================
  /** V1.6-08 新增：provider 降级信息（primary 全失败时记录 fallback 触发情况） */
  providerDegradation?: {
    /** 是否触发了 fallback */
    fallbackUsed: boolean;
    /** primary provider 的错误记录（provider name → 错误信息） */
    primaryErrors: Record<string, string>;
    /** V1.6b 新增：fallback provider 的错误记录（provider name → 错误信息） */
    fallbackErrors: Record<string, string>;
    /** 实际被调用的 fallback provider 名称列表 */
    fallbackProviders: string[];
  };
}

/** 默认每个 provider 最大结果数 */
const DEFAULT_MAX_RESULTS_PER_PROVIDER = 10;

/** 默认 AI 精筛阈值 */
const DEFAULT_MIN_RELEVANCE = 50;

/** 跳过内容抓取时的固定相关度 */
const SKIP_FETCH_RELEVANCE = 50;

/** 默认数据模式（未显式配置时使用 live，保护现有测试） */
const DEFAULT_DATA_MODE: DataMode = "live";

/**
 * 从 spec 推断雷达类型。
 * spec 没有 radar_type 字段，从 opportunity_scope.primary_opportunity_types 推断：
 *   - 明确 AI / 黑客松 / 算法赛事 → "ai_competition"
 *   - 含 "政策"/"补贴" → "opc_policy"
 *   - 含 "文创"/"非遗" → "cultural_heritage"
 *   - 默认 → "custom"
 */
function inferRadarType(spec: RadarRequirementSpec): RadarType {
  const types = spec?.opportunity_scope?.primary_opportunity_types ?? [];
  const text = [
    ...types,
    ...(spec?.keyword_strategy?.core_keywords_zh ?? []),
    spec?.core_goals?.primary_goal ?? "",
    spec?.client_profile?.business_type ?? "",
  ].join(" ");
  if (/AI|人工智能|算法|黑客松|Kaggle|天池/i.test(text)) {
    return "ai_competition";
  }
  if (/政策|补贴|扶持|申报/.test(text)) {
    return "opc_policy";
  }
  if (/文创|非遗|文化/.test(text)) {
    return "cultural_heritage";
  }
  return "custom";
}

/**
 * 从 spec 拼接查询词。
 * 优先使用 core_keywords_zh，其次 core_keywords_en。
 */
function buildQueryFromSpec(spec: RadarRequirementSpec): string {
  const zh = spec?.keyword_strategy?.core_keywords_zh ?? [];
  const en = spec?.keyword_strategy?.core_keywords_en ?? [];
  if (zh.length > 0) {
    return zh.slice(0, 3).join(" ");
  }
  if (en.length > 0) {
    return en.slice(0, 3).join(" ");
  }
  return spec?.core_goals?.primary_goal || spec?.opportunity_scope?.primary_opportunity_types?.join(" ") || "机会";
}

function isTableTennisRadar(spec: RadarRequirementSpec, query: string): boolean {
  const text = [
    query,
    ...(spec?.keyword_strategy?.core_keywords_zh ?? []),
    ...(spec?.keyword_strategy?.core_keywords_en ?? []),
    ...(spec?.opportunity_scope?.primary_opportunity_types ?? []),
    spec?.client_profile?.business_type ?? "",
    spec?.core_goals?.primary_goal ?? "",
  ].join(" ");
  return /乒乓球|WTT|ITTF|table\s*tennis/i.test(text);
}

function mockDemoUrl(category: string, index: number, _topic?: string): string {
  return `https://mock.chanceping.local/${encodeURIComponent(category)}/opportunity-${index}`;
}

function buildTableTennisMockResults(): SearchResult[] {
  return [
    {
      title: "乒乓球公开赛报名窗口演示样例",
      url: mockDemoUrl("table-tennis", 1, "乒乓球公开赛"),
      snippet: "【演示数据，未真实核验】面向国内外乒乓球选手的公开赛报名信号样例，报名截止 2026-07-28，需接入真实搜索后核验资格和入口。",
      source_provider: "mock",
      source_type: "web",
      published_at: "2026-07-28",
    },
    {
      title: "国际乒乓球赛事日历演示样例",
      url: mockDemoUrl("table-tennis", 2, "国际乒乓球赛事"),
      snippet: "【演示数据，未真实核验】国际乒乓球比赛和公开赛日历样例，用于验证雷达流程，未真实打开 ITTF 或 WTT 页面。",
      source_provider: "mock",
      source_type: "web",
      published_at: "2026-08-05",
    },
    {
      title: "国内乒乓球比赛报名通知演示样例",
      url: mockDemoUrl("table-tennis", 3, "国内乒乓球比赛"),
      snippet: "【演示数据，未真实核验】国内乒乓球比赛、公开赛和报名窗口信号样例，适合选手持续关注，但本条不是已核验真实机会。",
      source_provider: "mock",
      source_type: "web",
      published_at: "2026-07-20",
    },
  ];
}

function buildCustomMockResults(spec: RadarRequirementSpec, query: string): SearchResult[] {
  const legacyCoreKeywords = Array.isArray((spec as unknown as { core_keywords?: unknown }).core_keywords)
    ? ((spec as unknown as { core_keywords: string[] }).core_keywords ?? []).join(" ")
    : "";
  const target = spec.opportunity_scope?.primary_opportunity_types?.[0]
    || spec.core_goals?.primary_goal
    || query
    || legacyCoreKeywords
    || "自定义机会";
  const region = spec.region_scope?.primary_regions?.[0] || spec.client_profile?.regions?.[0] || "全国";
  const queryFamilies = spec.radar_version?.queryFamilies ?? [];
  const primaryKind = normalizeOpportunityIntent(queryFamilies[0]?.resultBucket || queryFamilies[0]?.intentType || "direct_opportunity");
  const leadFamily = queryFamilies.find((family) => {
    const kind = normalizeOpportunityIntent(family.resultBucket || family.intentType);
    return kind === "business_lead" || kind === "channel_partner_lead" || kind === "customer_lead";
  });
  const secondaryKind = leadFamily
    ? normalizeOpportunityIntent(leadFamily.resultBucket || leadFamily.intentType)
    : primaryKind;
  return [
    {
      title: `${region}${target}机会演示样例`,
      url: mockDemoUrl("custom", 1, target),
      snippet: `【演示数据，未真实核验】${target}相关机会信号样例，包含演示报名、申请或合作入口，仅用于验证当前雷达流程。`,
      source_provider: "mock",
      source_type: "web",
      published_at: "2026-07-15",
      semantic_type: primaryKind,
    },
    {
      title: `${target}公开信号演示样例`,
      url: mockDemoUrl("custom", 2, target),
      snippet: `【演示数据，未真实核验】围绕${target}的可联系线索样例，真实需求、合作条件、联系人和行动价值均需后续核验。`,
      source_provider: "mock",
      source_type: "web",
      published_at: "2026-07-22",
      semantic_type: secondaryKind,
    },
  ];
}

function isMockSearchResult(result: SearchResult): boolean {
  return result.source_provider === "mock" || result.url.includes("mock.chanceping.local");
}

function demoCardReason(result: SearchResult, fallback: string): string {
  const cleanFallback = fallback.replace(/^Mock 模式[:：]\s*/, "演示数据：");
  return cleanFallback.includes("演示数据")
    ? cleanFallback
    : `演示数据：${result.title}与当前雷达画像语义相关，用于验证 MVP 搜索和报告链路，未真实核验。`;
}

function applyMockSafeCardMark(card: OpportunityCard, result: SearchResult): OpportunityCard {
  if (!isMockSearchResult(result)) return card;
  const disclaimer = "演示 / 测试数据，未真实核验；不可当作真实报名、申报或合作机会直接行动。";
  card.title = result.title;
  card.organizer = card.organizer || "演示数据";
  card.deadline = card.deadline || result.published_at || "";
  card.match_reason = demoCardReason(result, card.match_reason || result.snippet || "");
  card.next_action = "先保存雷达验证流程；接入真实搜索后再复核来源、截止时间和行动要求。";
  card.official_source_url = "";
  card.application_url = "";
  card.contact_info = "";
  card.risk_note = disclaimer;
  card.sourceConfidence = "E5";
  card.verificationStatus = "unverified";
  card.sourceBadges = ["演示数据", "未核验"];
  card.evidence_status = "needs_review";
  card.is_demo_data = true;
  card.data_mode = "mock";
  card.source_disclaimer = disclaimer;
  if (card.assessment) {
    card.assessment.evidenceStatus = "needs_review";
    card.assessment.scoreItems = card.assessment.scoreItems.map((item) => ({
      ...item,
      basis: "model_judgment",
      evidenceIds: [],
      reason: card.match_reason,
    }));
  }
  return card;
}

function applyLiveSearchCardMark(card: OpportunityCard, result: SearchResult, fieldEvidence?: FieldEvidenceItem[]): OpportunityCard {
  if (isMockSearchResult(result)) return card;
  const disclaimer = "搜索发现来源，字段待复核；未确认报名资格、报名费用、截止日期、联系人、版权义务或其他行动条件。";
  card.data_mode = "live";
  card.source_disclaimer = disclaimer;
  card.verificationStatus = "unverified";
  card.evidence_status = "needs_review";
  const hasFetchedEvidence = (fieldEvidence ?? []).some((item) => item.basis === "fetched_content" && item.status !== "failed");
  card.field_evidence = fieldEvidence ?? buildUnopenedFieldEvidence(result);
  card.sourceBadges = Array.from(new Set([
    ...(card.sourceBadges ?? []),
    "搜索发现",
    hasFetchedEvidence ? "有限读取" : "待复核",
    "待复核",
  ]));
  card.risk_note = card.risk_note || disclaimer;
  card.next_action = card.next_action || "打开搜索发现来源，逐项复核报名资格、费用、截止日期和行动要求。";
  if (card.assessment) {
    card.assessment.evidenceStatus = "needs_review";
    card.assessment.scoreItems = card.assessment.scoreItems.map((item) => ({
      ...item,
      basis: "model_judgment",
      evidenceIds: [],
      reason: card.match_reason,
    }));
  }
  return card;
}

function semanticKindLabel(kind: OpportunityKind | undefined): string {
  const labels: Record<OpportunityKind, string> = {
    direct_opportunity: "直接机会",
    business_lead: "可行动线索",
    channel_partner_lead: "渠道合作线索",
    customer_lead: "潜在客户线索",
    association_directory: "协会 / 会员目录",
    watch_signal: "观察信号",
    reference_case: "参考案例",
    rejected: "已降权来源",
  };
  return kind ? labels[kind] : "机会";
}

function applySemanticCardMark(card: OpportunityCard, result: SearchResult): OpportunityCard {
  const kind = result.semantic_type ?? card.opportunity_kind ?? "direct_opportunity";
  const actionableLead = kind === "business_lead" || kind === "channel_partner_lead" || kind === "customer_lead";
  card.opportunity_kind = kind;
  card.type = semanticKindLabel(kind);
  if (card.assessment) {
    card.assessment.kind = kind;
    card.assessment.actionStatus = actionableLead ? "prepare" : card.assessment.actionStatus;
    card.action_status = card.assessment.actionStatus;
  }
  if (actionableLead) {
    const leadLabel = semanticKindLabel(kind);
    const disclaimer = `类型：${leadLabel}；状态：需联系确认；不能当作采购、招聘、报名、客户需求或合作机会已经成立。`;
    card.sourceBadges = Array.from(new Set([...(card.sourceBadges ?? []), leadLabel, "需联系确认", "待复核"]));
    card.next_action = `联系来源方确认真实需求、合作条件和行动入口；${card.next_action || "先复核来源与行动入口。"}`;
    card.risk_note = card.risk_note ? `${card.risk_note} ${disclaimer}` : disclaimer;
    card.source_disclaimer = card.source_disclaimer
      ? `${card.source_disclaimer} ${disclaimer}`
      : disclaimer;
    if (card.assessment) {
      card.assessment.scoreItems = card.assessment.scoreItems.map((item) => ({
        ...item,
        basis: "model_judgment",
        reason: `${item.reason}；${disclaimer}`,
      }));
    }
  }
  if (kind === "association_directory") {
    const disclaimer = "类型：线索资源；状态：待复核 / 需联系确认；协会或会员目录不代表已确认采购、合作或客户需求。";
    card.sourceBadges = Array.from(new Set([...(card.sourceBadges ?? []), "线索资源", "协会 / 会员目录", "待复核"]));
    card.next_action = `从目录中筛选潜在合作对象，逐一联系确认真实需求、合作条件和下一步入口；${card.next_action || "先复核来源与行动入口。"}`;
    card.risk_note = card.risk_note ? `${card.risk_note} ${disclaimer}` : disclaimer;
    card.source_disclaimer = card.source_disclaimer
      ? `${card.source_disclaimer} ${disclaimer}`
      : disclaimer;
    if (card.assessment) {
      card.assessment.scoreItems = card.assessment.scoreItems.map((item) => ({
        ...item,
        basis: "model_judgment",
        reason: `${item.reason}；${disclaimer}`,
      }));
    }
  }
  return card;
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function normalizeSourceToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[\/\s_-]+/g, "")
    .replace(/官方网站|官网|协会|federation|association/gi, "")
    .trim();
}

function resultText(result: SearchResult): string {
  return `${result.title} ${result.snippet} ${domainOf(result.url)}`.toLowerCase();
}

interface CandidateQuality {
  status: "actionable" | "low_action" | "unknown";
  reason: string;
}

const BUSINESS_LEAD_RE = /客户线索|销售线索|潜在客户|合作入口|合作机会|供应商|入库|招商|渠道|伙伴|联系|contact|partner|supplier|vendor|careers|招聘|岗位|BD|商机|采购部门|征集.*供应商/i;
const CHANNEL_PARTNER_RE = /渠道伙伴|渠道合作|经销商|代理商|实施伙伴|channel partner|reseller|distributor partner|implementation partner/i;
const CUSTOMER_LEAD_RE = /潜在客户|客户线索|目标客户|需求单位|采购方|customer lead|prospect|buyer lead/i;
const ASSOCIATION_DIRECTORY_RE = /协会.{0,12}(会员|成员).{0,8}目录|会员目录|成员目录|association.{0,20}member.{0,12}directory|member directory/i;
const WATCH_SIGNAL_RE = /观察|趋势|计划|日历|排期|预告|即将|未来|动态|动向|预算|需求上升|calendar|trend|roadmap|pipeline|upcoming|watch/i;
const REFERENCE_CASE_RE = /案例|复盘|往届|获奖名单|规则|费用|条款|资格|指南|白皮书|报告|reference|case|rules|fee|eligibility|winner|shortlist|guideline/i;
const DIRECT_ACTION_RE = /报名|申报|申请|参赛|赛事通知|赛程|采购公告|招标公告|询价公告|投标|投稿|征集|申请入口|报名入口|官方公告|公开赛|锦标赛|大会|摊位|展位|供应商招募|イベント|棋戦|calendar|event|events|tournament|championship|registration|entry|apply|application|tender|rfp|procurement|submission|open call|join\s+(?:hackathon|challenge|contest|competition)|join\s+the\s+(?:hackathon|challenge|contest|competition)|(?:hackathon|challenge|contest|competition|比赛|竞赛|大赛|马拉松).{0,80}(?:compete|prizes?|cash|cloud credits?|tracks?|requirements)|(?:compete|prizes?|cash|cloud credits?|tracks?|requirements).{0,80}(?:hackathon|challenge|contest|competition|比赛|竞赛|大赛|马拉松)/i;
const REJECTED_RE = /视频|集锦|youtube|playlist|百科|维基|wikipedia|baike|新闻转载|转载|综合新闻|news roundup|培训广告|培训班|训练营|课程|camp|course|知乎|专栏|博客|科普|入门|指南|升段|升级|zhihu|column|blog|guide|explainer|新浪|搜狐|网易|腾讯新闻|今日头条|澎湃|凤凰网|sports\.sina|sohu|163\.com|qq\.com|toutiao|thepaper|ifeng/i;

function semanticTypeForResult(result: SearchResult): OpportunityKind {
  if (result.semantic_type) return result.semantic_type;
  const text = resultText(result);
  if (REJECTED_RE.test(text)) return "rejected";
  if (ASSOCIATION_DIRECTORY_RE.test(text)) return "association_directory";
  if (REFERENCE_CASE_RE.test(text)) return "reference_case";
  if (CHANNEL_PARTNER_RE.test(text)) return "channel_partner_lead";
  if (CUSTOMER_LEAD_RE.test(text)) return "customer_lead";
  if (BUSINESS_LEAD_RE.test(text) && !/采购公告|招标公告|询价公告|投标|报名入口|申请入口|registration|tender|rfp/i.test(text)) {
    return "business_lead";
  }
  if (DIRECT_ACTION_RE.test(text)) return "direct_opportunity";
  if (WATCH_SIGNAL_RE.test(text)) return "watch_signal";
  if (
    result.intent_type === "business_lead" ||
    result.intent_type === "channel_partner_lead" ||
    result.intent_type === "customer_lead" ||
    result.intent_type === "association_directory" ||
    result.intent_type === "reference_case" ||
    result.intent_type === "watch_signal"
  ) return result.intent_type;
  return "watch_signal";
}

function candidateQuality(result: SearchResult): CandidateQuality {
  const text = resultText(result);
  const lowActionPatterns = [
    { pattern: /视频|集锦|youtube|playlist/i, reason: "视频/集锦页面，通常不是行动入口" },
    { pattern: /百科|维基|wikipedia|baike/i, reason: "百科页面，通常不是报名或申请入口" },
    { pattern: /规则|历史|history|rules/i, reason: "规则/历史介绍页面，行动性不足" },
    { pattern: /新闻转载|转载|综合新闻|news roundup/i, reason: "新闻转载或泛资讯页面，需人工再追踪原始公告" },
    { pattern: /培训广告|培训班|训练营|课程|camp|course/i, reason: "培训广告或课程页面，不是本轮重点机会" },
    { pattern: /知乎|专栏|博客|科普|入门|指南|升段|升级|zhihu|column|blog|guide|explainer/i, reason: "专栏/科普/指南类页面，通常不是报名或申请入口" },
    { pattern: /新浪|搜狐|网易|腾讯新闻|今日头条|澎湃|凤凰网|sports\.sina|sohu|163\.com|qq\.com|toutiao|thepaper|ifeng/i, reason: "门户或社区资讯页面，需人工追踪原始公告" },
  ];
  const matchedLowAction = lowActionPatterns.find((item) => item.pattern.test(text));
  if (matchedLowAction) {
    return { status: "low_action", reason: matchedLowAction.reason };
  }
  const semanticType = semanticTypeForResult(result);
  if (semanticType === "direct_opportunity") {
    return { status: "actionable", reason: "包含报名、赛程、公告或申请入口等行动信号" };
  }
  if (semanticType === "business_lead" || semanticType === "channel_partner_lead" || semanticType === "customer_lead") {
    return { status: "actionable", reason: "包含合作、客户线索、供应商入库或联系确认信号" };
  }
  return { status: "unknown", reason: "未识别到明确行动入口，保留为观察候选" };
}

function isKeyCandidate(result: SearchResult): boolean {
  const semanticType = semanticTypeForResult(result);
  return semanticType === "direct_opportunity" ||
    semanticType === "business_lead" ||
    semanticType === "channel_partner_lead" ||
    semanticType === "customer_lead";
}

function sourcePriorityScore(result: SearchResult, spec: RadarRequirementSpec): number {
  const text = resultText(result);
  const domain = domainOf(result.url).toLowerCase();
  const sourceDomains = getUserSuppliedUrlSources(spec).map((source) => extractSourceDomain(source.source_url));
  const sourceNames = [
    ...getManualSourceNames(spec),
    ...((spec.source_strategy?.user_supplied_sources ?? []).map((source) => source.source_name).filter(Boolean)),
  ];
  const sourceTokens = sourceNames.map(normalizeSourceToken).filter((token) => token.length >= 2);
  let score = 0;

  if (sourceDomains.some((sourceDomain) => domain === sourceDomain || domain.endsWith(`.${sourceDomain}`))) {
    score += 120;
  }
  if (sourceNames.some((name) => name && text.includes(name.toLowerCase()))) {
    score += 80;
  }
  if (sourceTokens.some((token) => token && normalizeSourceToken(text).includes(token))) {
    score += 45;
  }
  if (/报名|申报|申请|参赛|赛事|比赛|公开赛|锦标赛|日程|赛程|大会|イベント|棋戦|calendar|event|events|tournament|championship|champions|registration|entry|hackathon|challenge|contest|compete|prizes?|cloud credits?|tracks?/i.test(text)) {
    score += 30;
  }
  if (candidateQuality(result).status === "low_action") {
    score -= 80;
  }
  return score;
}

function sortLiveResultsBySourcePriority(results: SearchResult[], spec: RadarRequirementSpec): SearchResult[] {
  return results
    .map((result, index) => ({ result, index, score: sourcePriorityScore(result, spec) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((item) => item.result);
}

function detectQueryLanguage(query: string): string {
  const hasZh = /[\u4e00-\u9fff]/.test(query);
  const hasEn = /[a-z]/i.test(query);
  if (hasZh && hasEn) return "mixed";
  if (hasEn) return "en";
  return "zh";
}

function configuredSourcesFromSpec(spec: RadarRequirementSpec): string[] {
  const manualSources = spec.source_strategy?.manual_sources ?? [];
  const userSuppliedSources = (spec.source_strategy?.user_supplied_sources ?? [])
    .map((source) => source.source_url)
    .filter(Boolean);
  return Array.from(new Set([...manualSources, ...userSuppliedSources]));
}

function fallbackQueryItem(query: string): SearchQueryFamilyItem {
  return {
    query,
    language: detectQueryLanguage(query),
    themeName: "基础查询",
    intentType: "direct_opportunity",
    sourceArchetype: "official_event_site",
    sourceArchetypeLabel: "通用机会来源",
    queryFamily: "basic discovery",
    queryVariant: "broad_discovery",
  };
}

function buildSearchPlan(
  spec: RadarRequirementSpec,
  query: string,
  maxCandidates: number,
  intentPlan: SearchIntentPlan,
): RadarSearchPlan {
  const queries = intentPlan.queries.length > 0 ? intentPlan.queries : [fallbackQueryItem(query)];
  return {
    id: `plan_${Date.now().toString(36)}`,
    themes: intentPlan.searchThemes.length > 0
      ? intentPlan.searchThemes.map((theme) => theme.themeName)
      : (spec.opportunity_scope?.primary_opportunity_types ?? []),
    searchThemes: intentPlan.searchThemes,
    queries,
    ...(intentPlan.opportunityStrategy ? {
      opportunityStrategy: {
        radarVersion: intentPlan.opportunityStrategy.radarVersion,
        sourceArchetypes: intentPlan.opportunityStrategy.sourceArchetypes,
        resultBucketPolicy: intentPlan.opportunityStrategy.resultBucketPolicy,
        evidenceReadPriority: intentPlan.opportunityStrategy.evidenceReadPriority,
      },
    } : {}),
    configuredSources: configuredSourcesFromSpec(spec),
    exclusions: spec.filter_rules?.must_exclude ?? [],
    maxCandidates,
  };
}

function queryItemKey(item: Pick<SearchQueryFamilyItem, "query" | "sourceDomain">): string {
  return normalizeSearchQuery(item.sourceDomain ? `${item.query} site:${item.sourceDomain}` : item.query);
}

function limitSearchIntentPlan(plan: SearchIntentPlan, limits: SearchCostLimits): SearchIntentPlan {
  const searchThemes = plan.searchThemes.slice(0, limits.maxThemesPerRun);
  const themeNames = new Set(searchThemes.map((theme) => theme.themeName));
  const seen = new Set<string>();
  const queries: SearchQueryFamilyItem[] = [];
  for (const item of plan.queries) {
    if (themeNames.size > 0 && !themeNames.has(item.themeName)) continue;
    const key = queryItemKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    queries.push(item);
    if (queries.length >= limits.maxQueriesPerRun) break;
  }

  const opportunityStrategy = plan.opportunityStrategy
    ? {
      ...plan.opportunityStrategy,
      searchThemes,
      queries,
      evidenceReadPriority: plan.opportunityStrategy.evidenceReadPriority.slice(0, limits.maxReadUrlsPerRun),
    }
    : undefined;
  return { searchThemes, queries, ...(opportunityStrategy ? { opportunityStrategy } : {}) };
}

function reserveLiveSourceHintSlots(limits: SearchCostLimits, spec: RadarRequirementSpec, dataMode: DataMode): SearchCostLimits {
  if (dataMode !== "live") return limits;
  const sourceHintCount = buildSourceHintSearches(spec, "").length + buildManualSourceSearches(spec, "").length;
  const recoverySlotCount = spec.radar_version ? 2 : 0;
  const reservedSlots = Math.min(5, sourceHintCount + recoverySlotCount, Math.max(0, limits.maxQueriesPerRun - 1));
  if (reservedSlots <= 0) return limits;
  return {
    ...limits,
    maxQueriesPerRun: Math.max(1, limits.maxQueriesPerRun - reservedSlots),
  };
}

function mapSourceCoverage(checks: SourceHintCheck[]): SourceCoverageItem[] {
  return checks.map((check) => ({
    sourceName: check.sourceName,
    sourceUrl: check.sourceUrl || undefined,
    status: check.status === "checked"
      ? "checked_with_results"
      : check.status === "no_results"
        ? "checked_no_results"
        : check.status === "failed" || check.status === "invalid_url"
          ? "failed"
          : "not_checked",
    resultCount: check.resultCount,
    ...(check.error ? { error: check.error } : {}),
  }));
}

function buildRawCandidateAudits(results: SearchResult[], query: string): RawCandidateAudit[] {
  return results.map((result, index) => {
    const quality = candidateQuality(result);
    const finalSemanticType = semanticTypeForResult(result);
    const semanticType = result.original_semantic_type ?? finalSemanticType;
    return {
      id: `raw_${index + 1}`,
      query: result.search_query || query,
      title: result.title,
      url: result.url,
      snippet: result.snippet,
      sourceDomain: domainOf(result.url),
      sourceType: result.source_type ?? "search_snippet",
      status: finalSemanticType === "rejected" ? "rejected" : "raw",
      qualityStatus: quality.status,
      qualityReason: quality.reason,
      semanticType,
      finalSemanticType,
      themeName: result.search_theme,
      intentType: result.intent_type,
      sourceArchetype: result.source_archetype,
      sourceArchetypeLabel: result.source_archetype_label,
      queryFamily: result.query_family,
      queryVariant: result.query_variant,
      relevanceAssessment: result.relevance_assessment,
      pageTypeAssessment: result.page_type_assessment,
      candidateJudgeAssessment: result.candidate_judge_assessment,
      candidateRankingAssessment: result.candidate_ranking_assessment,
      ownershipAssessment: result.ownership_assessment,
    };
  });
}

function buildCandidateAccounting(
  rawProviderResultCount: number,
  rawResults: SearchResult[],
  opportunities: ScoredOpportunity[],
  opportunityCards?: OpportunityCard[],
): CandidateAccounting {
  const acceptedCount = opportunityCards?.length ?? opportunities.length;
  return {
    rawCount: rawProviderResultCount || rawResults.length,
    deduplicatedCount: rawResults.length,
    assessedCount: Math.max(opportunities.length, acceptedCount),
    acceptedCount,
    rejectedCount: Math.max(0, rawResults.length - acceptedCount),
  };
}

function queryMeta(item: SearchQueryFamilyItem): Pick<SearchExecutionLog["queryExecutions"][number], "themeName" | "intentType" | "sourceArchetype" | "sourceArchetypeLabel" | "queryFamily" | "queryVariant"> {
  return {
    themeName: item.themeName,
    intentType: item.intentType,
    sourceArchetype: item.sourceArchetype,
    sourceArchetypeLabel: item.sourceArchetypeLabel,
    queryFamily: item.queryFamily,
    queryVariant: item.queryVariant,
  };
}

function annotateResultsWithQueryMeta(results: SearchResult[], item: SearchQueryFamilyItem): SearchResult[] {
  return results.map((result) => {
    const annotated: SearchResult = {
      ...result,
      search_query: item.query,
      search_theme: item.themeName,
      intent_type: item.intentType,
      source_archetype: item.sourceArchetype,
      source_archetype_label: item.sourceArchetypeLabel,
      query_family: item.queryFamily,
      query_variant: item.queryVariant,
    };
    annotated.semantic_type = semanticTypeForResult(annotated);
    annotated.original_semantic_type = annotated.semantic_type;
    return annotated;
  });
}

function isRetryableProviderError(message: string): boolean {
  return /fetch failed|network|timeout|ECONNRESET|ETIMEDOUT|ENOTFOUND/i.test(message);
}

function providerMockModeError(provider: SearchProvider): string | null {
  if (process.env.CHANCEPING_ENABLE_LOCAL_LIVE_SEARCH !== "true") return null;
  const mockMode = (provider as SearchProvider & { mockMode?: unknown }).mockMode;
  if (mockMode !== true) return null;
  return `LIVE_PROVIDER_MOCK_MODE_BLOCKED: provider ${provider.name} 处于 mockMode，已阻断真实搜索，避免把演示数据当作 live 结果。`;
}

async function searchProviderWithRetry(
  provider: SearchProvider,
  item: SearchQueryFamilyItem,
  options: SearchOptions,
): Promise<{
  provider: string;
  results: SearchResult[];
  error: string | null;
  log: SearchExecutionLog["queryExecutions"][number];
}> {
  const startedAt = new Date().toISOString();
  const mockModeError = providerMockModeError(provider);
  if (mockModeError) {
    return {
      provider: provider.name,
      results: [],
      error: mockModeError,
      log: {
        query: item.query,
        provider: provider.name,
        startedAt,
        status: "failed",
        rawResultCount: 0,
        error: mockModeError,
        retryCount: 0,
        ...queryMeta(item),
      },
    };
  }
  let retryCount = 0;
  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const results = annotateResultsWithQueryMeta(await provider.search(item.query, options), item);
      return {
        provider: provider.name,
        results,
        error: null,
        log: {
          query: item.query,
          provider: provider.name,
          startedAt,
          status: results.length > 0 ? "succeeded" : "no_results",
          rawResultCount: results.length,
          retryCount,
          ...queryMeta(item),
        },
      };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      lastError = `provider ${provider.name} 调用失败: ${errMsg}`;
      if (attempt === 0 && isRetryableProviderError(errMsg)) {
        retryCount = 1;
        continue;
      }
      return {
        provider: provider.name,
        results: [],
        error: lastError,
        log: {
          query: item.query,
          provider: provider.name,
          startedAt,
          status: "failed",
          rawResultCount: 0,
          error: lastError,
          retryCount,
          ...queryMeta(item),
        },
      };
    }
  }
  return {
    provider: provider.name,
    results: [],
    error: lastError,
    log: {
      query: item.query,
      provider: provider.name,
      startedAt,
      status: "failed",
      rawResultCount: 0,
      error: lastError,
      retryCount,
      ...queryMeta(item),
    },
  };
}

/**
 * 构造跳过内容抓取时的 AIFilterItem（relevance 固定 50）。
 */
function buildSkipFetchItems(
  results: SearchResult[],
  contentsByUrl?: Map<string, CleanedContent>,
  markUnfetchedAsNotFetched = false,
): AIFilterItem[] {
  return results.map((result) => {
    const fetched = contentsByUrl?.get(result.url);
    const emptyContent: CleanedContent = fetched ?? {
      url: result.url,
      title: result.title,
      main_text: result.snippet ?? "",
      word_count: result.snippet?.length ?? 0,
      fetch_success: !markUnfetchedAsNotFetched,
      ...(markUnfetchedAsNotFetched ? { fetch_error: "本条未进入有限网页读取范围，只有搜索摘要可参考" } : {}),
    };
    return {
      result,
      content: emptyContent,
      relevance: SKIP_FETCH_RELEVANCE,
      reason: fetched?.fetch_success
        ? "已读取网页正文，正在按雷达画像判断机会价值；字段结论仍以官方页面复核为准"
        : markUnfetchedAsNotFetched
          ? "未读取正文，仅根据搜索摘要保留为待复核线索"
          : "跳过正文读取，先按搜索摘要进入初筛",
    };
  });
}

/**
 * V1.6b 修复 BUG-9.3：构造 AI 精筛降级 AIFilterItem（relevance=0，相关度未知）。
 *
 * AI 精筛失败时使用，确保流程不中断（fail-open）。与 scoreOpportunities 的
 * try/catch 降级策略一致。
 */
function buildDegradedAIFilterItems(results: SearchResult[]): AIFilterItem[] {
  return results.map((result) => {
    const emptyContent: CleanedContent = {
      url: result.url,
      title: result.title,
      main_text: result.snippet ?? "",
      word_count: result.snippet?.length ?? 0,
      fetch_success: false,
    };
    return {
      result,
      content: emptyContent,
      relevance: 0,
      reason: "AI 精筛降级：相关度未知",
    };
  });
}

/**
 * 搜索编排器：串联 T10 三层筛选。
 */
export class SearchOrchestrator {
  private readonly llmAdapter: LLMAdapter;
  private readonly maxResultsPerProvider: number;
  private readonly minRelevance: number;
  private readonly enableContentFetch: boolean;
  private readonly mockContent: boolean;
  private readonly dataMode: DataMode;
  /** V1.6-07：机会库引用（可选，用于增量标签复用） */
  private readonly opportunityStore?: OpportunityStore;

  constructor(config: SearchOrchestratorConfig) {
    this.llmAdapter = config.llmAdapter;
    this.maxResultsPerProvider = config.maxResultsPerProvider ?? DEFAULT_MAX_RESULTS_PER_PROVIDER;
    this.minRelevance = config.minRelevance ?? DEFAULT_MIN_RELEVANCE;
    this.enableContentFetch = config.enableContentFetch ?? true;
    this.mockContent = config.mockContent ?? true;
    this.dataMode = config.dataMode ?? DEFAULT_DATA_MODE;
    this.opportunityStore = config.opportunityStore;
  }

  /**
   * 执行搜索 + T10 三层筛选。
   *
   * @param spec 雷达需求规格
   * @param query 查询词（可选，为空时从 spec 拼接）
   * @param providerRouting Provider 路由（可选，V1.5 自检：优先于 inferRadarType）
   * @param watchRules Watch Rules DSL 规则列表（可选，V1.6-06 新增：搜索结果入库前过滤）
   * @returns SearchOrchestratorResult
   */
  async search(
    spec: RadarRequirementSpec,
    query?: string,
    providerRouting?: ProviderRouting,
    watchRules?: string[],
  ): Promise<SearchOrchestratorResult> {
    const startTime = Date.now();
    const durationMs = () => Math.max(1, Date.now() - startTime);
    const errors: string[] = [];
    const queryExecutions: SearchExecutionLog["queryExecutions"] = [];
    const openedUrls: SearchExecutionLog["openedUrls"] = [];
    let rawProviderResultCount = 0;
    let liveEvidence: LiveEvidenceFetchResult | undefined;
    // V1.6-08：provider 降级信息（live 模式下由 primary/fallback 逻辑写入）
    let _providerDegradation: SearchOrchestratorResult["providerDegradation"] | undefined;

    // 步骤 0：推断雷达类型（供 Demo 数据加载和真实搜索共用）
    const radarType = inferRadarType(spec);
    const searchQuery = query && query.trim() ? query.trim() : buildQueryFromSpec(spec);
    const searchCostLimits = getSearchCostLimits();
    const intentPlanLimits = reserveLiveSourceHintSlots(searchCostLimits, spec, this.dataMode);
    let intentPlan = limitSearchIntentPlan(buildSearchIntentPlan(spec, searchQuery), intentPlanLimits);
    const baseQueryItem = intentPlan.queries[0] ?? fallbackQueryItem(searchQuery);
    const reservedLiveQueryKeys = new Set(intentPlan.queries.map(queryItemKey));
    let sourceHintChecks: SourceHintCheck[] = [];
    const buildAuditPayload = (
      currentRawResults: SearchResult[],
      currentOpportunities: ScoredOpportunity[] = [],
      currentOpportunityCards?: OpportunityCard[],
    ): Pick<SearchOrchestratorResult, "searchPlan" | "executionLog" | "sourceCoverage" | "rawCandidates" | "candidateAccounting"> => ({
      searchPlan: buildSearchPlan(spec, searchQuery, this.maxResultsPerProvider, intentPlan),
      executionLog: { queryExecutions, openedUrls },
      sourceCoverage: mapSourceCoverage(sourceHintChecks),
      rawCandidates: buildRawCandidateAudits(currentRawResults, searchQuery),
      candidateAccounting: buildCandidateAccounting(
        rawProviderResultCount,
        currentRawResults,
        currentOpportunities,
        currentOpportunityCards,
      ),
    });

    // 步骤 1：根据数据模式获取原始搜索结果（Task 036）
    // - mock/recorded：加载 Demo 数据，跳过真实搜索
    // - live：调用真实搜索 Provider
    let rawResults: SearchResult[];

    if (this.dataMode === "mock" || this.dataMode === "recorded") {
      // Mock/Recorded 模式：加载 Demo 数据
      const startedAt = new Date().toISOString();
      try {
        rawResults = this.dataMode === "mock" && isTableTennisRadar(spec, searchQuery)
          ? buildTableTennisMockResults()
          : this.dataMode === "mock" && (radarType === "custom" || Boolean(spec.radar_version))
            ? buildCustomMockResults(spec, searchQuery)
            : loadDemoSearchResults(radarType, this.dataMode);
        rawResults = annotateResultsWithQueryMeta(rawResults, baseQueryItem);
        rawProviderResultCount = rawResults.length;
        queryExecutions.push({
          query: searchQuery,
          provider: this.dataMode,
          startedAt,
          status: rawResults.length > 0 ? "succeeded" : "no_results",
          rawResultCount: rawResults.length,
          retryCount: 0,
          ...queryMeta(baseQueryItem),
        });
        sourceHintChecks = buildMockSourceHintChecks(spec, searchQuery);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        errors.push(`加载 Demo 数据失败（mode=${this.dataMode}）: ${errMsg}`);
        queryExecutions.push({
          query: searchQuery,
          provider: this.dataMode,
          startedAt,
          status: "failed",
          rawResultCount: 0,
          error: errMsg,
          retryCount: 0,
          ...queryMeta(baseQueryItem),
        });
        return {
          total_raw: 0,
          total_rule_passed: 0,
          total_ai_passed: 0,
          total_scored: 0,
          opportunities: [],
          errors,
          duration_ms: durationMs(),
          sourceHintChecks,
          ...buildAuditPayload([]),
        };
      }
    } else {
      // Live 模式：获取适用 providers
      // V1.5 自检：优先使用 providerRouting，fallback 到 inferRadarType
      // V1.6-08：支持 primary 全失败时启用 fallback provider
      let primaryProviders: SearchProvider[] = [];
      let fallbackProviders: SearchProvider[] = [];
      let providerDegradation: SearchOrchestratorResult["providerDegradation"] | undefined;

      if (providerRouting && providerRouting.primary && providerRouting.primary.length > 0) {
        // V1.6-08：非法 provider 名称告警
        const invalidNames = providerRouting.primary.filter(
          (name) => !providerRegistry.get(name),
        );
        if (invalidNames.length > 0) {
          console.warn(`[V1.6-08] 非法 provider 名称: ${invalidNames.join(", ")}`);
        }
        primaryProviders = providerRegistry.getByNames(providerRouting.primary);
        // V1.6-08：预取 fallback providers（primary 全失败时启用）
        if (providerRouting.fallback && providerRouting.fallback.length > 0) {
          const invalidFallbackNames = providerRouting.fallback.filter(
            (name) => !providerRegistry.get(name),
          );
          if (invalidFallbackNames.length > 0) {
            console.warn(`[V1.6-08] 非法 fallback provider 名称: ${invalidFallbackNames.join(", ")}`);
          }
          fallbackProviders = providerRegistry.getByNames(providerRouting.fallback);
        }
      } else {
        primaryProviders = radarType === "custom"
          ? providerRegistry.getByNames(["serper", "bocha", "exa", "google_cse"]).filter((p) => p.enabled)
          : providerRegistry.getByRadarType(radarType).filter((p) => p.enabled);
      }

      if (primaryProviders.length === 0 && fallbackProviders.length === 0) {
        errors.push(`无可用搜索 provider（radar_type=${radarType}）`);
        return {
          total_raw: 0,
          total_rule_passed: 0,
          total_ai_passed: 0,
          total_scored: 0,
          opportunities: [],
          errors,
          duration_ms: durationMs(),
          sourceHintChecks,
          ...buildAuditPayload([]),
        };
      }

      // 步骤 2：并行调用各 primary provider 的 search()
      const searchOptions = {
        max_results: this.dataMode === "live"
          ? Math.min(this.maxResultsPerProvider, searchCostLimits.maxResultsPerQuery)
          : this.maxResultsPerProvider,
      };
      const liveQueryItems = this.dataMode === "live" && providerRouting
        ? intentPlan.queries
        : [baseQueryItem];

      const primaryResults = await Promise.all(
        primaryProviders.flatMap((provider) => liveQueryItems.map(async (queryItem) => {
          const result = await searchProviderWithRetry(provider, queryItem, searchOptions);
          queryExecutions.push(result.log);
          return { provider: result.provider, results: result.results, error: result.error };
        })),
      );
      rawProviderResultCount += primaryResults.reduce((sum, item) => sum + item.results.length, 0);

      // 收集 primary 错误
      const primaryErrors: Record<string, string> = {};
      // V1.6b 修复 BUG-9：fallback 错误单独收集，不再污染 primaryErrors
      const fallbackErrors: Record<string, string> = {};
      for (const r of primaryResults) {
        if (r.error) {
          errors.push(r.error);
          primaryErrors[r.provider] = r.error;
        }
      }

      // 合并 primary 搜索结果
      let allResults = deduplicateByUrL(primaryResults.flatMap((r) => r.results));

      // V1.6-08：primary 全失败（无结果）时启用 fallback
      // V1.6b 自检修复:移除 primaryProviders.length > 0 条件,允许 primary 全 disabled 时触发 fallback
      let fallbackUsed = false;
      const fallbackProviderNames: string[] = [];
      if (
        allResults.length === 0 &&
        fallbackProviders.length > 0
      ) {
        fallbackUsed = true;
        const fallbackResults = await Promise.all(
          fallbackProviders.map(async (provider) => {
            fallbackProviderNames.push(provider.name);
            const result = await searchProviderWithRetry(provider, baseQueryItem, searchOptions);
            const fallbackLog = result.error
              ? { ...result.log, error: `[fallback] ${result.error}` }
              : result.log;
            queryExecutions.push(fallbackLog);
            return {
              provider: result.provider,
              results: result.results,
              error: result.error ? `[fallback] ${result.error}` : null,
            };
          }),
        );
        rawProviderResultCount += fallbackResults.reduce((sum, item) => sum + item.results.length, 0);

        for (const r of fallbackResults) {
          if (r.error) {
            errors.push(r.error);
            fallbackErrors[r.provider] = r.error;
          }
        }

        allResults = deduplicateByUrL(fallbackResults.flatMap((r) => r.results));
        errors.push(
          `[V1.6-08] primary providers 全失败，已降级到 fallback: ${fallbackProviderNames.join(", ")}`,
        );
      }

      // V1.6-08：记录降级信息（仅在配置了 fallback 时才输出，即使未触发）
      if (providerRouting?.fallback && providerRouting.fallback.length > 0) {
        providerDegradation = {
          fallbackUsed,
          primaryErrors,
          fallbackErrors,
          fallbackProviders: fallbackProviderNames,
        };
      }

      sourceHintChecks = buildNameOnlySourceChecks(spec);
      const sourceHintSearches = [
        ...buildSourceHintSearches(spec, searchQuery),
        ...(this.dataMode === "live" ? buildManualSourceSearches(spec, searchQuery) : []),
      ];
      const sourceHintProvider = primaryProviders[0] ?? fallbackProviders[0];
      if (sourceHintSearches.length > 0 && sourceHintProvider) {
        const sourceHintQueryItems: Array<{ hint: (typeof sourceHintSearches)[number]; queryItem: SearchQueryFamilyItem }> = [];
        for (const hint of sourceHintSearches) {
          const hintQueryItem: SearchQueryFamilyItem = {
            query: hint.query,
            language: detectQueryLanguage(hint.query),
            ...(hint.siteFilter ? { sourceDomain: hint.siteFilter } : {}),
            themeName: "指定来源复核",
            intentType: "direct_opportunity",
            sourceArchetype: "official_event_site",
            sourceArchetypeLabel: hint.siteFilter ? `指定站点：${hint.siteFilter}` : "用户指定来源",
            queryFamily: "configured source review",
            queryVariant: "source_hint",
          };
          const key = queryItemKey(hintQueryItem);
          if (reservedLiveQueryKeys.has(key)) {
            sourceHintChecks.push({
              sourceName: hint.sourceName,
              sourceUrl: hint.sourceUrl,
              status: "name_only",
              resultCount: 0,
              error: "Search Cost Guard：本轮已有相同 query，未重复调用搜索 provider",
            });
            continue;
          }
          if (reservedLiveQueryKeys.size >= searchCostLimits.maxQueriesPerRun) {
            sourceHintChecks.push({
              sourceName: hint.sourceName,
              sourceUrl: hint.sourceUrl,
              status: "name_only",
              resultCount: 0,
              error: "Search Cost Guard：本轮 query 数已达上限，未继续调用搜索 provider",
            });
            continue;
          }
          reservedLiveQueryKeys.add(key);
          sourceHintQueryItems.push({ hint, queryItem: hintQueryItem });
        }
        const sourceHintResults = await Promise.all(
          sourceHintQueryItems.map(async ({ hint, queryItem }) => {
            const result = await searchProviderWithRetry(sourceHintProvider, queryItem, {
              max_results: Math.min(this.maxResultsPerProvider, searchCostLimits.maxResultsPerQuery),
              ...(hint.siteFilter ? { site_filter: hint.siteFilter } : {}),
            });
            queryExecutions.push(result.log);
            return { hint, results: result.results, error: result.error ?? "" };
          }),
        );
        rawProviderResultCount += sourceHintResults.reduce((sum, item) => sum + item.results.length, 0);

        for (const item of sourceHintResults) {
          sourceHintChecks.push({
            sourceName: item.hint.sourceName,
            sourceUrl: item.hint.sourceUrl,
            status: item.error ? "failed" : item.results.length > 0 ? "checked" : "no_results",
            resultCount: item.results.length,
            ...(item.error ? { error: item.error } : {}),
          });
        }

        const hintedResults = sourceHintResults.flatMap((item) => item.results);
        allResults = this.dataMode === "live"
          ? deduplicateByUrL([...hintedResults, ...allResults])
          : deduplicateByUrL([...allResults, ...hintedResults]);
      }

      const recoveryProvider = primaryProviders[0] ?? fallbackProviders[0];
      const recoveryCapacity = Math.min(2, Math.max(0, searchCostLimits.maxQueriesPerRun - reservedLiveQueryKeys.size));
      const recoveryQueryItems = recoveryProvider && spec.radar_version
        ? buildPrimarySourceRecoveryQueries(allResults, spec, recoveryCapacity)
          .filter((item) => !reservedLiveQueryKeys.has(queryItemKey(item)))
        : [];
      if (recoveryProvider && recoveryQueryItems.length > 0) {
        recoveryQueryItems.forEach((item) => reservedLiveQueryKeys.add(queryItemKey(item)));
        const recoveryResults = await Promise.all(recoveryQueryItems.map(async (queryItem) => {
          const result = await searchProviderWithRetry(recoveryProvider, queryItem, {
            max_results: Math.min(this.maxResultsPerProvider, searchCostLimits.maxResultsPerQuery),
          });
          queryExecutions.push(result.log);
          if (result.error) errors.push(`主来源反查失败: ${result.error}`);
          return result.results;
        }));
        rawProviderResultCount += recoveryResults.reduce((sum, items) => sum + items.length, 0);
        allResults = deduplicateByUrL([...recoveryResults.flat(), ...allResults]);
        const combinedQueries = [...intentPlan.queries, ...recoveryQueryItems];
        intentPlan = {
          ...intentPlan,
          queries: combinedQueries,
          ...(intentPlan.opportunityStrategy ? {
            opportunityStrategy: {
              ...intentPlan.opportunityStrategy,
              queries: combinedQueries,
            },
          } : {}),
        };
      }

      if (this.dataMode === "live" && providerRouting) {
        allResults = sortLiveResultsBySourcePriority(allResults, spec);
      }

      rawResults = allResults;

      // 将 providerDegradation 存入闭包变量，供最终 return 使用
      _providerDegradation = providerDegradation;
    }

    // 边界情况：无搜索结果
    if (rawResults.length === 0) {
      return {
        total_raw: 0,
        total_rule_passed: 0,
        total_ai_passed: 0,
        total_scored: 0,
        opportunities: [],
        errors,
        duration_ms: durationMs(),
        sourceHintChecks,
        // V1.6-08：即使在无结果时也输出降级信息（便于排查 primary 失败原因）
        providerDegradation: _providerDegradation,
        ...buildAuditPayload(rawResults),
      };
    }

    let candidateResults: SearchResult[];
    if (this.dataMode === "live" && providerRouting && spec.radar_version) {
      const relevanceGate = applyCandidateRelevanceGate(rawResults, spec);
      const pageTypeGate = applyCandidatePageTypeGate(relevanceGate.assessedResults, spec);
      const judgeGate = await applyCandidateJudgeGate(pageTypeGate.assessedResults, spec, this.llmAdapter);
      const ownershipGate = applyCandidateOwnershipGate(judgeGate.assessedResults, spec);
      const ranking = rankCandidateResults(ownershipGate.assessedResults, spec, {
        maxKeyCandidates: inferRadarType(spec) === "ai_competition" ? 16 : undefined,
      });
      rawResults = ranking.assessedResults;
      candidateResults = ranking.keyCandidates.filter(isKeyCandidate);
    } else {
      candidateResults = this.dataMode === "live" && providerRouting
        ? rawResults.filter(isKeyCandidate)
        : rawResults;
    }

    const evidenceReadCandidates = this.dataMode === "live" && providerRouting && this.enableContentFetch
      ? prioritizeEvidenceReadCandidates({
        keyCandidates: candidateResults,
        rawCandidates: rawResults,
        maxUrls: searchCostLimits.maxReadUrlsPerRun,
        spec,
      })
      : [];

    if (this.dataMode === "live" && providerRouting && this.enableContentFetch && evidenceReadCandidates.length > 0) {
      liveEvidence = await fetchLiveEvidence(evidenceReadCandidates, {
        maxUrls: evidenceReadCandidates.length,
        timeoutMs: 8000,
      });
      openedUrls.push(...liveEvidence.openedUrls);
    }

    if (candidateResults.length === 0) {
      return {
        total_raw: rawResults.length,
        total_rule_passed: 0,
        total_ai_passed: 0,
        total_scored: 0,
        opportunities: [],
        errors,
        duration_ms: durationMs(),
        sourceHintChecks,
        providerDegradation: _providerDegradation,
        ...buildAuditPayload(rawResults),
      };
    }

    // 步骤 3：第一层规则粗筛
    const ruleResult = ruleFilter(candidateResults, spec, this.dataMode === "live" && providerRouting && spec.radar_version
      ? {
        keywordPack: buildKeywordPack(spec),
        allowRadarVersionSemanticCandidates: true,
      }
      : undefined);

    // 边界情况：规则粗筛全部失败
    if (ruleResult.passed.length === 0) {
      return {
        total_raw: rawResults.length,
        total_rule_passed: 0,
        total_ai_passed: 0,
        total_scored: 0,
        opportunities: [],
        errors,
        duration_ms: durationMs(),
        sourceHintChecks,
        providerDegradation: _providerDegradation,
        ...buildAuditPayload(rawResults),
      };
    }

    // 步骤 4：第二层 AI 精筛
    // V1.6-07：增量标签复用 —— 如果 opportunityStore 已传入，先检查每条搜索结果是否在 store 中
    // 已有同 dedupKey 且 card.ai_analysis 非空（之前 AI 精筛过），命中则跳过 AI 精筛复用上次分析
    // 注：dedupKey 相同即视为同一机会（title+url 一致），复用上次 AI 分析；
    //     incremental/changeRatio 在入库阶段计算，作为统计指标，不作为复用判据
    let aiPassed: AIFilterItem[];
    let aiFilterSkipped = 0;
    let aiFilterExecuted = 0;
    if (this.dataMode === "mock") {
      // Demo candidates are intentionally synthetic. A live LLM may correctly
      // reject them as non-real opportunities, which would break the explicit
      // "演示数据查看流程" mode. Keep mock search deterministic; live search
      // continues through evidence-aware filtering below.
      aiPassed = buildSkipFetchItems(ruleResult.passed);
      if (this.opportunityStore) {
        for (const result of ruleResult.passed) {
          const normalizedGuid = normalizeUrl(result.url);
          const dedupKey = computeDedupKey(result.title, result.url, normalizedGuid);
          const existing = this.opportunityStore.getByDedupKey(dedupKey);
          if (existing?.card.ai_analysis) aiFilterSkipped += 1;
          else aiFilterExecuted += 1;
        }
      } else {
        aiFilterExecuted = ruleResult.passed.length;
      }
    } else if (this.dataMode === "live" && providerRouting) {
      aiPassed = buildSkipFetchItems(ruleResult.passed, liveEvidence?.contentsByUrl, this.enableContentFetch);
      aiFilterExecuted = ruleResult.passed.length;
    } else if (this.enableContentFetch) {
      if (this.opportunityStore) {
        // V1.6b 自检修复:dedupKey 计算需与入库时一致
        //   入库时 card.guid = scored.guid ?? normalizeUrl(url)
        //   scored.guid 优先用 rawData.guid/id,否则用 normalizeUrl(url)
        //   SearchResult 无 guid/raw_data,用 normalizeUrl(url) 匹配最常见的 fallback 路径
        const cached: AIFilterItem[] = [];
        const fresh: SearchResult[] = [];
        for (const result of ruleResult.passed) {
          const normalizedGuid = normalizeUrl(result.url);
          const dedupKey = computeDedupKey(result.title, result.url, normalizedGuid);
          const existing = this.opportunityStore.getByDedupKey(dedupKey);
          if (existing && existing.card.ai_analysis) {
            // 命中缓存：复用上次 AI 分析结果，构造 AIFilterItem
            const cachedContent: CleanedContent = {
              url: result.url,
              title: result.title,
              main_text: existing.card.match_reason || result.snippet || "",
              word_count: (existing.card.match_reason || "").length,
              fetch_success: true,
            };
            cached.push({
              result,
              content: cachedContent,
              relevance: 50, // 复用值，刚好通过阈值
              reason: existing.card.ai_analysis,
            });
          } else {
            fresh.push(result);
          }
        }
        aiFilterSkipped = cached.length;
        aiFilterExecuted = fresh.length;

        // 对 fresh 部分调用 AI 精筛
        let freshPassed: AIFilterItem[] = [];
        if (fresh.length > 0) {
          // V1.6b 修复 BUG-9.3：aiFilter 调用增加 try/catch，失败时降级（对比 scoreOpportunities 第 504-509 行）
          try {
            const aiResult = await aiFilter(fresh, spec, this.llmAdapter, {
              minRelevance: this.minRelevance,
              mockContent: this.mockContent,
            });
            freshPassed = aiResult.passed;
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            errors.push(`AI 精筛失败（fresh）: ${errMsg}`);
            // 降级：有缓存则仅返回缓存（丢弃无法分析的 fresh）；无缓存则全部 fresh（relevance=0）
            freshPassed = cached.length > 0 ? [] : buildDegradedAIFilterItems(fresh);
          }
        }
        aiPassed = [...cached, ...freshPassed];
      } else {
        // 未传入 store：走原逻辑（全量 AI 精筛）
        // V1.6b 修复 BUG-9.3：aiFilter 调用增加 try/catch，失败时降级返回全部结果（relevance=0）
        try {
          const aiResult = await aiFilter(ruleResult.passed, spec, this.llmAdapter, {
            minRelevance: this.minRelevance,
            mockContent: this.mockContent,
          });
          aiPassed = aiResult.passed;
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          errors.push(`AI 精筛失败: ${errMsg}`);
          // 降级：无缓存，返回全部结果（relevance=0，相关度未知）
          aiPassed = buildDegradedAIFilterItems(ruleResult.passed);
        }
        aiFilterExecuted = ruleResult.passed.length;
      }
    } else {
      // 跳过内容抓取，relevance 固定 50，全部通过
      aiPassed = buildSkipFetchItems(ruleResult.passed);
      aiFilterExecuted = ruleResult.passed.length;
    }

    // 边界情况：AI 精筛全部失败
    if (aiPassed.length === 0) {
      return {
        total_raw: rawResults.length,
        total_rule_passed: ruleResult.passed.length,
        total_ai_passed: 0,
        total_scored: 0,
        opportunities: [],
        errors,
        duration_ms: durationMs(),
        sourceHintChecks,
        providerDegradation: _providerDegradation,
        ...buildAuditPayload(rawResults),
      };
    }

    // 步骤 5：第三层机会评分
    let opportunities: ScoredOpportunity[] = [];
    try {
      opportunities = await scoreOpportunities(aiPassed, spec, this.llmAdapter);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      errors.push(`机会评分失败: ${errMsg}`);
    }

    // 步骤 6：V1.3 来源透明（来源分类 + 证据提取 + 卡片映射）
    let sourceCandidates: SourceCandidate[] | undefined;
    let evidenceItems: EvidenceItem[] | undefined;
    let opportunityCards: OpportunityCard[] | undefined;

    try {
      // 6.1 来源分类
      const scoredResults = opportunities.map((o) => o.search_result);
      sourceCandidates = classifySources(scoredResults);

      // 6.2 证据提取
      const cleanedContents = opportunities.map((o) => o.cleaned_content);
      const sourceIds = sourceCandidates.map((s) => s.sourceId);
      evidenceItems = extractEvidenceBatch(cleanedContents, sourceIds);

      // 6.3 卡片映射（含 S 级硬规则）
      // V1.6-07：构建 url → ai_analysis 映射，用于把 AI 精筛 reason 写入 card.ai_analysis
      // 这样下次运行时，store 中的 card.ai_analysis 可被增量标签复用逻辑读取
      const aiAnalysisByUrl = new Map<string, string>();
      for (const item of aiPassed) {
        aiAnalysisByUrl.set(item.result.url, item.reason);
      }
      opportunityCards = opportunities.map((opp) => {
        // 为每个机会找到对应的来源和证据
        const oppUrl = opp.search_result.url;
        const oppSources = sourceCandidates!.filter((s) => s.url === oppUrl);
        const oppSourceIds = oppSources.map((s) => s.sourceId);
        const oppEvidence = evidenceItems!.filter((e) => oppSourceIds.includes(e.sourceId));
        const radarId = radarType;
        const card = mapToCard(opp, oppSources, oppEvidence, radarId);
        applyMockSafeCardMark(card, opp.search_result);
        if (this.dataMode === "live") {
          const fieldEvidence = liveEvidence?.fieldEvidenceByUrl.get(oppUrl)
            ?? buildUnopenedFieldEvidence(opp.search_result);
          applyLiveSearchCardMark(card, opp.search_result, fieldEvidence);
        }
        applySemanticCardMark(card, opp.search_result);
        applyAiEventConcreteEntryGuard(card, oppSources);
        // V1.6-07：写入 AI 精筛 reason 到 card.ai_analysis（供下次增量复用）
        const aiAnalysis = aiAnalysisByUrl.get(oppUrl);
        if (aiAnalysis) {
          card.ai_analysis = card.is_demo_data ? demoCardReason(opp.search_result, aiAnalysis) : aiAnalysis;
        }
        return card;
      });
      opportunityCards = sortOpportunityCardsForDisplay(opportunityCards);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      errors.push(`来源透明处理失败: ${errMsg}`);
    }

    // 步骤 7：V1.6-06 Watch Rules 过滤（三层筛选之后，入库之前）
    let watchRulesBefore = opportunities.length;
    let watchRulesAfter = opportunities.length;
    let watchRulesFilteredOut = 0;
    if (watchRules && watchRules.length > 0 && opportunities.length > 0) {
      try {
        const { parseWatchRules } = await import("../watch/dsl-parser");
        const { filterByWatchRules } = await import("../watch/search-integration");
        const ruleSet = parseWatchRules(watchRules.join("\n"));
        // V1.6b 修复 BUG-4：解析错误记录到 errors（但不阻断过滤，保持 fail-open）
        if (ruleSet.errors.length > 0) {
          for (const parseErr of ruleSet.errors) {
            errors.push(
              `Watch Rules 解析错误（第 ${parseErr.line_number} 行）: ${parseErr.message}` +
                (parseErr.raw_line ? ` [${parseErr.raw_line}]` : ""),
            );
          }
        }
        // 仅在有有效规则时过滤（空规则集返回全部，避免误过滤）
        if (ruleSet.rules.length > 0) {
          const radarTypeCast = radarType as RadarType;
          const { filtered, filtered_out } = filterByWatchRules(
            opportunities,
            ruleSet,
            radarTypeCast,
          );
          watchRulesBefore = opportunities.length;
          watchRulesAfter = filtered.length;
          watchRulesFilteredOut = filtered_out;

          // 同步过滤 opportunityCards 和 sourceCandidates（按 url 对齐）
          const filteredUrls = new Set(filtered.map((o) => o.search_result.url));
          if (opportunityCards && opportunityCards.length > 0) {
            opportunityCards = opportunityCards.filter((card) =>
              filteredUrls.has(card.official_source_url),
            );
          }
          if (sourceCandidates && sourceCandidates.length > 0) {
            sourceCandidates = sourceCandidates.filter((s) => filteredUrls.has(s.url));
          }
          // evidenceItems 与 sourceId 关联，难以直接对齐，保留全部（不影响入库）
          opportunities = filtered;
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        errors.push(`Watch Rules 过滤失败: ${errMsg}`);
      }
    }

    return {
      total_raw: rawResults.length,
      total_rule_passed: ruleResult.passed.length,
      total_ai_passed: aiPassed.length,
      total_scored: opportunities.length,
      opportunities,
      errors,
      duration_ms: durationMs(),
      // V1.3 新增字段
      sourceCandidates,
      evidenceItems,
      opportunityCards,
      sourceHintChecks,
      // V1.6-06 新增字段
      watch_rules_before: watchRulesBefore,
      watch_rules_after: watchRulesAfter,
      watch_rules_filtered_out: watchRulesFilteredOut,
      // V1.6-07 新增字段（增量标签复用指标）
      ai_filter_skipped: aiFilterSkipped,
      ai_filter_executed: aiFilterExecuted,
      // V1.6-08 新增字段（provider 降级信息）
      providerDegradation: _providerDegradation,
      ...buildAuditPayload(rawResults, opportunities, opportunityCards),
    };
  }
}
