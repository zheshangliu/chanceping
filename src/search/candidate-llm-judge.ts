import type { LLMAdapter, LLMRequest } from "../agents/llm-adapter";
import type { RadarRequirementSpec } from "../schema/radar-requirement-spec";
import type { OpportunityKind } from "../schema/radar-mvp-contracts";
import { parseJsonWithRepair } from "../utils/json-repair";
import type { CandidateRelevanceDecision } from "./candidate-relevance";
import type { SearchResult } from "./types";

export type CandidateJudgeType =
  | "key_opportunity"
  | "actionable_lead"
  | "watch_signal"
  | "reference_case"
  | "reject";

export type CandidateJudgeFit =
  | "fit"
  | "partial"
  | "mismatch"
  | "unknown";

export type CandidateFreshnessFit =
  | "valid"
  | "stale"
  | "uncertain"
  | "unknown";

export type CandidateJudgeDecision =
  | "accept"
  | "downgrade_to_watch_signal"
  | "reject";

export interface CandidateJudgeAssessment {
  candidate_type: CandidateJudgeType;
  beneficiary_fit: CandidateJudgeFit;
  action_fit: CandidateJudgeFit;
  source_fit: CandidateJudgeFit;
  freshness_fit: CandidateFreshnessFit;
  relevance_score: number;
  decision: CandidateJudgeDecision;
  reason: string;
  basis: "llm_judgment_on_search_evidence" | "deterministic_fallback" | "hard_rule";
  assessedAt: string;
}

export interface CandidateJudgeOptions {
  mode?: "auto" | "llm" | "fallback";
  now?: Date;
  maxCandidates?: number;
}

export interface CandidateJudgeGateResult {
  accepted: SearchResult[];
  downgraded: SearchResult[];
  rejected: SearchResult[];
  assessedResults: SearchResult[];
}

interface ParsedJudgeItem {
  url?: unknown;
  candidate_type?: unknown;
  beneficiary_fit?: unknown;
  action_fit?: unknown;
  source_fit?: unknown;
  freshness_fit?: unknown;
  relevance_score?: unknown;
  decision?: unknown;
  reason?: unknown;
}

interface ParsedJudgeResponse {
  candidates?: ParsedJudgeItem[];
}

const DEFAULT_MAX_CANDIDATES = 12;

const KEY_OPPORTUNITY_TYPES = new Set<OpportunityKind>([
  "direct_opportunity",
  "business_lead",
  "channel_partner_lead",
  "customer_lead",
]);

const CANDIDATE_TYPES = new Set<CandidateJudgeType>([
  "key_opportunity",
  "actionable_lead",
  "watch_signal",
  "reference_case",
  "reject",
]);
const FITS = new Set<CandidateJudgeFit>(["fit", "partial", "mismatch", "unknown"]);
const FRESHNESS_FITS = new Set<CandidateFreshnessFit>(["valid", "stale", "uncertain", "unknown"]);
const DECISIONS = new Set<CandidateJudgeDecision>(["accept", "downgrade_to_watch_signal", "reject"]);

const STUDENT_ONLY_RE = /大学生|高校学生|学生参赛|高校参赛队伍|college student|university student/i;
const KIDS_CODING_RE = /少儿编程|青少年编程|儿童编程|k12|steam|科创活动|学校合作|课程采购/i;
const KIDS_CONTEXT_RE = /少儿编程|青少年|儿童|k12|中小学|小学|学校合作|教育局|课后服务|课程采购|课程合作|科创活动|编程课程|机器人|scratch|steam/i;
const GENERIC_PROGRAMMING_CONTEST_RE = /程序设计竞赛|编程大赛|算法大赛|hackathon|algorithm contest|coding competition|programming contest|icpc|acm/i;
const KIDS_OR_ORG_ACTION_RE = /少儿|青少年|儿童|k12|中小学|小学|培训机构|学校合作|课程采购|承办|招生|scratch|steam|机器人/i;
const NEGATED_KIDS_ORG_RE = /(?:未|不|没有).{0,18}(少儿编程机构|培训机构|机构).{0,18}(承办|招生|课程|合作)|no .{0,40}(kids coding|training institution|school partner)/i;
const NEGATED_KIDS_CONTEXT_RE = /(?:未|不|没有|无).{0,40}(少儿编程|培训机构|学校|课程|课后服务|青少年|儿童|k12|承办|招生|合作)|no .{0,60}(kids|school|course|after-school|training institution)/i;
const RENOVATION_RE = /装修|翻新|家具安装|室内改造|装修改造|renovation|furniture installation/i;
const GREENING_OR_GENERIC_ENV_RE = /绿化|环境整治|环境提升|景观改造|保洁|环卫|greening|landscape|sanitation/i;
const ENVIRONMENT_EQUIPMENT_RE = /环保设备|除尘|废气治理|污水处理|环保项目|绿色改造|节能环保设备|环保治理|废水治理|industrial environmental/i;
const NEGATED_ENVIRONMENT_EQUIPMENT_RE = /(?:不|未)(?:包含|含|涉及|明确).{0,12}(环保设备|除尘|废气治理|污水处理|环保治理)|without.{0,30}(environmental equipment|dust collector|waste gas treatment)/i;
const GENERIC_PLATFORM_FLOW_RE = /注册流程|账号登录|平台操作|使用说明|登录步骤|registration flow|login steps/i;
const PDF_REFERENCE_RE = /\.pdf|^\[pdf\]|pdf 材料|pdf报告|白皮书|经验|指南|协商/i;
const JOB_AGGREGATOR_RE = /招聘平台|聚合招聘|jobsdb|boss直聘|indeed|linkedin|猎聘|智联|前程无忧|job board|job listing aggregator/i;
const NEWS_OR_REFERENCE_RE = /趋势|指南|规则|历史|案例|新闻|报道|分析|报告|百科|reference|case|guide|news|history|wikipedia/i;
const WEDDING_CONTEXT_RE = /婚庆|婚礼|婚宴|wedding/i;
const WEDDING_ACTION_RE = /酒店|会所|宴会厅|品牌合作|异业合作|供应商招募|婚礼供应商|venue|hotel|supplier|partner/i;
const DIRECT_ACTION_RE = /报名|申请|申报|征集|招标|投标|采购|供应商|入库|投稿|展位|参展|合作|招募|registration|application|apply|tender|procurement|supplier|vendor|submit|exhibitor|partner/i;
const EXPLICIT_NO_ACTION_RE = /不提供.{0,12}(报名|申请|合作|采购|投稿|入口)|没有.{0,12}(报名|申请|合作|采购|投稿|入口)|no .{0,40}(application|registration|contact|entry)/i;

function normalize(value: unknown): string {
  return String(value ?? "").normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

function clampScore(value: unknown, fallback: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function textOf(result: SearchResult): string {
  return `${result.title} ${result.snippet} ${result.url}`.trim();
}

function specText(spec: RadarRequirementSpec): string {
  const radar = spec.radar_version;
  return [
    radar?.targetUser,
    radar?.businessContext,
    ...(radar?.opportunityIntents ?? []),
    ...(radar?.highValueCriteria ?? []),
    ...(radar?.exclusionRules ?? []),
    ...(radar?.prioritySourceArchetypes ?? []),
    ...(radar?.queryFamilies ?? []).flatMap((family) => [family.familyName, family.whyThisFamily, ...(family.queries ?? [])]),
    spec.client_profile?.business_type,
    spec.core_goals?.primary_goal,
    ...(spec.opportunity_scope?.primary_opportunity_types ?? []),
  ].filter(Boolean).join(" ");
}

function nowIso(options: CandidateJudgeOptions): string {
  return (options.now ?? new Date()).toISOString();
}

function hardRejectAssessment(reason: string, options: CandidateJudgeOptions): CandidateJudgeAssessment {
  return {
    candidate_type: "reject",
    beneficiary_fit: "mismatch",
    action_fit: "mismatch",
    source_fit: "unknown",
    freshness_fit: "unknown",
    relevance_score: 0,
    decision: "reject",
    reason,
    basis: "hard_rule",
    assessedAt: nowIso(options),
  };
}

function fallbackJudge(result: SearchResult, spec: RadarRequirementSpec, options: CandidateJudgeOptions): CandidateJudgeAssessment {
  const radarText = normalize(specText(spec));
  const text = normalize(textOf(result));
  const q6A = result.relevance_assessment;

  if (q6A?.decision === "reject" && (
    q6A.reasonCodes.includes("expired_deadline") ||
    q6A.reasonCodes.includes("explicit_exclusion") ||
    q6A.reasonCodes.includes("subject_mismatch")
  )) {
    return hardRejectAssessment(`沿用 Q.6-A 硬拒绝：${q6A.reasonCodes.join("、") || "候选不匹配"}`, options);
  }
  if (q6A?.reasonCodes.includes("expired_deadline")) {
    return hardRejectAssessment("明确过期候选不得被 LLM 升级", options);
  }
  if (q6A?.reasonCodes.includes("explicit_exclusion")) {
    return hardRejectAssessment("命中排除条件的候选不得被 LLM 升级", options);
  }
  if (EXPLICIT_NO_ACTION_RE.test(text)) {
    return hardRejectAssessment("页面明确缺少可执行入口", options);
  }

  const page = result.page_type_assessment;
  if (page?.keyCardEligibility === "reject") {
    return hardRejectAssessment(`页面类型 ${page.pageType} 不是可执行机会入口：${page.reason}`, options);
  }

  const kidsCodingRadar = KIDS_CODING_RE.test(radarText);
  if (kidsCodingRadar && STUDENT_ONLY_RE.test(text) && (!KIDS_CODING_RE.test(text) || NEGATED_KIDS_ORG_RE.test(text))) {
    return hardRejectAssessment("该机会面向大学生个人参赛者，不是少儿编程机构的招生、课程采购或承办合作机会。", options);
  }
  if (kidsCodingRadar && GENERIC_PROGRAMMING_CONTEST_RE.test(text) && (!KIDS_OR_ORG_ACTION_RE.test(text) || NEGATED_KIDS_ORG_RE.test(text))) {
    return hardRejectAssessment("该编程赛事未显示面向少儿编程机构、学校合作、课程采购、承办或招生动作。", options);
  }
  if (kidsCodingRadar && DIRECT_ACTION_RE.test(text) && (!KIDS_CONTEXT_RE.test(text) || NEGATED_KIDS_CONTEXT_RE.test(text))) {
    return hardRejectAssessment("该候选有报名、入驻或合作动作，但未显示面向少儿编程机构、学校课程采购、课后服务或青少年科创活动。", options);
  }

  const environmentRadar = ENVIRONMENT_EQUIPMENT_RE.test(radarText);
  if (environmentRadar && GENERIC_PLATFORM_FLOW_RE.test(text) && (NEGATED_ENVIRONMENT_EQUIPMENT_RE.test(text) || !/(招标|采购|项目|tender|procurement|rfp)/i.test(text))) {
    return hardRejectAssessment("该页面只是平台注册或登录流程，未明确环保设备、废气治理、污水处理、除尘设备采购或具体招标项目。", options);
  }
  if (environmentRadar && (RENOVATION_RE.test(text) || GREENING_OR_GENERIC_ENV_RE.test(text)) && (NEGATED_ENVIRONMENT_EQUIPMENT_RE.test(text) || !ENVIRONMENT_EQUIPMENT_RE.test(text))) {
    return hardRejectAssessment("采购范围是普通装修或家具安装，不是工业环保设备、废气治理或园区绿色改造项目。", options);
  }

  if (PDF_REFERENCE_RE.test(text) && /(不是|未|不含|没有).{0,18}(采购公告|供应商|入库|招标|投标|报名|合作|入口)/.test(text)) {
    return {
      candidate_type: "reference_case",
      beneficiary_fit: "partial",
      action_fit: "unknown",
      source_fit: "partial",
      freshness_fit: "uncertain",
      relevance_score: 36,
      decision: "downgrade_to_watch_signal",
      reason: "该 PDF 更像报告、经验材料或参考资料，缺少采购公告、供应商入库、投标或合作入口。",
      basis: "deterministic_fallback",
      assessedAt: nowIso(options),
    };
  }

  if (page?.keyCardEligibility === "downgrade" && page.pageType !== "directory_page") {
    return {
      candidate_type: page.pageType === "trend_article" || page.pageType === "news_article" ? "reference_case" : "watch_signal",
      beneficiary_fit: page.beneficiaryFit === "mismatch" ? "mismatch" : "partial",
      action_fit: page.actionEntryFit === "fit" ? "partial" : "unknown",
      source_fit: "partial",
      freshness_fit: "uncertain",
      relevance_score: 42,
      decision: "downgrade_to_watch_signal",
      reason: `页面类型 ${page.pageType} 更像导航、资讯、模板或弱入口，暂不进入重点机会卡。`,
      basis: "deterministic_fallback",
      assessedAt: nowIso(options),
    };
  }

  const weddingRadar = WEDDING_CONTEXT_RE.test(radarText);
  if (weddingRadar && NEWS_OR_REFERENCE_RE.test(text) && !WEDDING_ACTION_RE.test(text)) {
    return {
      candidate_type: "reference_case",
      beneficiary_fit: "partial",
      action_fit: "unknown",
      source_fit: "partial",
      freshness_fit: "uncertain",
      relevance_score: 38,
      decision: "downgrade_to_watch_signal",
      reason: "该页面更像婚庆趋势、城市宣传或新闻参考，缺少酒店会所、品牌合作或供应商招募入口。",
      basis: "deterministic_fallback",
      assessedAt: nowIso(options),
    };
  }

  const isLead = result.semantic_type === "business_lead" ||
    result.semantic_type === "channel_partner_lead" ||
    result.semantic_type === "customer_lead";
  if (isLead && JOB_AGGREGATOR_RE.test(text)) {
    return {
      candidate_type: "watch_signal",
      beneficiary_fit: "partial",
      action_fit: "partial",
      source_fit: "partial",
      freshness_fit: "uncertain",
      relevance_score: 55,
      decision: "downgrade_to_watch_signal",
      reason: "聚合招聘页可作为观察线索，但不等于公司官网招聘需求或已确认委托机会。",
      basis: "deterministic_fallback",
      assessedAt: nowIso(options),
    };
  }

  if (NEWS_OR_REFERENCE_RE.test(text) && result.source_archetype === "reference_case_source") {
    return {
      candidate_type: "reference_case",
      beneficiary_fit: "partial",
      action_fit: "unknown",
      source_fit: "partial",
      freshness_fit: "uncertain",
      relevance_score: 45,
      decision: "downgrade_to_watch_signal",
      reason: "该来源更像资讯、指南或参考案例，缺少当前可执行入口。",
      basis: "deterministic_fallback",
      assessedAt: nowIso(options),
    };
  }

  if (q6A?.decision === "downgrade_to_watch_signal") {
    return {
      candidate_type: result.semantic_type === "reference_case" ? "reference_case" : "watch_signal",
      beneficiary_fit: q6A.targetFit.status === "mismatch" ? "mismatch" : "partial",
      action_fit: q6A.actionFit.status === "match" ? "partial" : "unknown",
      source_fit: q6A.sourceFit.status === "mismatch" ? "partial" : "unknown",
      freshness_fit: q6A.freshnessFit.status === "mismatch" ? "stale" : "uncertain",
      relevance_score: 50,
      decision: "downgrade_to_watch_signal",
      reason: `Q.6-A 证据不足或需观察：${q6A.reasonCodes.join("、") || "缺少行动证据"}`,
      basis: "deterministic_fallback",
      assessedAt: nowIso(options),
    };
  }

  const hasAction = DIRECT_ACTION_RE.test(text);
  const actionableLead = result.semantic_type === "business_lead" ||
    result.semantic_type === "channel_partner_lead" ||
    result.semantic_type === "customer_lead";
  if (result.semantic_type === "direct_opportunity" && hasAction) {
    return {
      candidate_type: "key_opportunity",
      beneficiary_fit: "fit",
      action_fit: "fit",
      source_fit: result.source_archetype === "reference_case_source" ? "partial" : "fit",
      freshness_fit: "valid",
      relevance_score: 82,
      decision: "accept",
      reason: "候选包含与雷达目标一致的直接行动入口，适合作为重点机会继续复核。",
      basis: "deterministic_fallback",
      assessedAt: nowIso(options),
    };
  }
  if (actionableLead && hasAction) {
    return {
      candidate_type: "actionable_lead",
      beneficiary_fit: "partial",
      action_fit: "fit",
      source_fit: result.source_archetype === "reference_case_source" ? "partial" : "fit",
      freshness_fit: "uncertain",
      relevance_score: 70,
      decision: "accept",
      reason: "候选可作为可行动线索，但仍需联系确认真实需求和行动条件。",
      basis: "deterministic_fallback",
      assessedAt: nowIso(options),
    };
  }

  return {
    candidate_type: "watch_signal",
    beneficiary_fit: "unknown",
    action_fit: "unknown",
    source_fit: "unknown",
    freshness_fit: "unknown",
    relevance_score: 45,
    decision: "downgrade_to_watch_signal",
    reason: "仅从搜索摘要无法确认这是当前用户可执行的重点机会，降级为观察信号。",
    basis: "deterministic_fallback",
    assessedAt: nowIso(options),
  };
}

function normalizeParsedItem(item: ParsedJudgeItem | undefined, fallback: CandidateJudgeAssessment, options: CandidateJudgeOptions): CandidateJudgeAssessment {
  if (!item || typeof item !== "object") return fallback;
  const candidateType = CANDIDATE_TYPES.has(item.candidate_type as CandidateJudgeType)
    ? item.candidate_type as CandidateJudgeType
    : fallback.candidate_type;
  const beneficiaryFit = FITS.has(item.beneficiary_fit as CandidateJudgeFit)
    ? item.beneficiary_fit as CandidateJudgeFit
    : fallback.beneficiary_fit;
  const actionFit = FITS.has(item.action_fit as CandidateJudgeFit)
    ? item.action_fit as CandidateJudgeFit
    : fallback.action_fit;
  const sourceFit = FITS.has(item.source_fit as CandidateJudgeFit)
    ? item.source_fit as CandidateJudgeFit
    : fallback.source_fit;
  const freshnessFit = FRESHNESS_FITS.has(item.freshness_fit as CandidateFreshnessFit)
    ? item.freshness_fit as CandidateFreshnessFit
    : fallback.freshness_fit;
  const decision = DECISIONS.has(item.decision as CandidateJudgeDecision)
    ? item.decision as CandidateJudgeDecision
    : fallback.decision;
  const score = clampScore(item.relevance_score, fallback.relevance_score);
  return {
    candidate_type: decision === "reject" ? "reject" : candidateType,
    beneficiary_fit: beneficiaryFit,
    action_fit: actionFit,
    source_fit: sourceFit,
    freshness_fit: freshnessFit,
    relevance_score: score,
    decision,
    reason: typeof item.reason === "string" && item.reason.trim()
      ? item.reason.trim().slice(0, 180)
      : fallback.reason,
    basis: "llm_judgment_on_search_evidence",
    assessedAt: nowIso(options),
  };
}

function parsedCandidates(parsed: unknown): ParsedJudgeItem[] {
  if (Array.isArray(parsed)) return parsed as ParsedJudgeItem[];
  if (parsed && typeof parsed === "object") {
    const obj = parsed as ParsedJudgeResponse;
    if (Array.isArray(obj.candidates)) return obj.candidates;
  }
  return [];
}

function buildJudgeRequest(results: SearchResult[], spec: RadarRequirementSpec): LLMRequest {
  const radar = spec.radar_version;
  const payload = {
    radar: {
      targetUser: radar?.targetUser ?? spec.client_profile?.business_type ?? "",
      businessContext: radar?.businessContext ?? spec.core_goals?.primary_goal ?? "",
      opportunityIntents: radar?.opportunityIntents ?? spec.opportunity_scope?.primary_opportunity_types ?? [],
      highValueCriteria: radar?.highValueCriteria ?? [],
      exclusionRules: [
        ...(radar?.exclusionRules ?? []),
        ...(spec.filter_rules?.must_exclude ?? []),
      ],
      sourceArchetypes: radar?.prioritySourceArchetypes ?? [],
    },
    candidates: results.map((result, index) => ({
      index,
      url: result.url,
      title: result.title,
      domain: safeDomain(result.url),
      snippet: result.snippet,
      semanticType: result.semantic_type,
      sourceArchetype: result.source_archetype,
      pageType: result.page_type_assessment?.pageType,
      pageIntentFit: result.page_type_assessment?.pageIntentFit,
      actionEntryFit: result.page_type_assessment?.actionEntryFit,
      publishedAt: result.published_at,
      q6aDecision: result.relevance_assessment?.decision,
      q6aReasons: result.relevance_assessment?.reasonCodes ?? [],
    })),
  };
  return {
    messages: [
      {
        role: "system",
        content: [
          "你是 ChancePing 的候选机会二次裁判。只基于输入的搜索摘要和雷达画像判断，不得编造事实。",
          "你的任务是判断候选是否真正服务当前用户、动作是否是当前用户可执行动作、来源是否像直接机会入口。",
          "必须同时判断 beneficiary_fit、action_fit、source_fit、pageIntentFit 和 actionEntryFit；页面是首页、栏目、模板、XLS、趋势文章、政策规划或弱聚合页时，通常降级或拒绝。",
          "禁止编造截止时间、费用、资格、联系人、采购意向、招聘委托、报名状态或版权义务。",
          "如果只是聚合页、资讯、参考案例、目录或受益人不是当前用户，降级或拒绝。",
          "只返回 JSON，格式：{\"candidates\":[{\"url\":\"...\",\"candidate_type\":\"key_opportunity|actionable_lead|watch_signal|reference_case|reject\",\"beneficiary_fit\":\"fit|partial|mismatch|unknown\",\"action_fit\":\"fit|partial|mismatch|unknown\",\"source_fit\":\"fit|partial|mismatch|unknown\",\"freshness_fit\":\"valid|stale|uncertain|unknown\",\"relevance_score\":0,\"decision\":\"accept|downgrade_to_watch_signal|reject\",\"reason\":\"一句中文理由\"}]}",
        ].join("\n"),
      },
      {
        role: "user",
        content: JSON.stringify(payload),
      },
    ],
    response_format: "json",
    temperature: 0,
  };
}

function safeDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function shouldJudge(result: SearchResult): boolean {
  if (result.relevance_assessment?.decision === "reject") return false;
  if (result.original_semantic_type && KEY_OPPORTUNITY_TYPES.has(result.original_semantic_type)) return true;
  return result.semantic_type === "direct_opportunity" ||
    result.semantic_type === "business_lead" ||
    result.semantic_type === "channel_partner_lead" ||
    result.semantic_type === "customer_lead" ||
    result.relevance_assessment?.decision === "downgrade_to_watch_signal";
}

export async function judgeCandidateBatch(
  results: SearchResult[],
  spec: RadarRequirementSpec,
  llmAdapter: LLMAdapter,
  options: CandidateJudgeOptions = {},
): Promise<CandidateJudgeAssessment[]> {
  const maxCandidates = Math.max(1, Math.min(options.maxCandidates ?? DEFAULT_MAX_CANDIDATES, 20));
  const selected = results.slice(0, maxCandidates);
  const fallback = selected.map((result) => fallbackJudge(result, spec, options));
  if (options.mode === "fallback" || selected.length === 0) return fallback;

  try {
    const response = await llmAdapter.chat(buildJudgeRequest(selected, spec));
    const parsed = response.parsed ?? parseJsonWithRepair(response.content ?? "");
    const items = parsedCandidates(parsed);
    if (items.length === 0) return fallback;
    return selected.map((result, index) => {
      const item = items.find((entry) => entry.url === result.url) ?? items[index];
      const normalized = normalizeParsedItem(item, fallback[index], options);
      if (fallback[index].basis === "hard_rule") {
        return fallback[index];
      }
      const page = result.page_type_assessment;
      if (page?.keyCardEligibility === "downgrade" && page.pageType !== "directory_page") {
        return fallback[index];
      }
      if (fallback[index].decision === "downgrade_to_watch_signal" && /PDF|报告、经验材料|参考资料/.test(fallback[index].reason)) {
        return fallback[index];
      }
      if (result.relevance_assessment?.decision === "reject") {
        return hardRejectAssessment(`沿用 Q.6-A 硬拒绝：${result.relevance_assessment.reasonCodes.join("、") || "候选不匹配"}`, options);
      }
      if (result.relevance_assessment?.reasonCodes.includes("expired_deadline") && normalized.decision !== "reject") {
        return hardRejectAssessment("明确过期候选不得被 LLM 升级", options);
      }
      if (result.relevance_assessment?.reasonCodes.includes("explicit_exclusion") && normalized.decision !== "reject") {
        return hardRejectAssessment("命中排除条件的候选不得被 LLM 升级", options);
      }
      return normalized;
    });
  } catch {
    return fallback;
  }
}

export async function applyCandidateJudgeGate(
  results: SearchResult[],
  spec: RadarRequirementSpec,
  llmAdapter: LLMAdapter,
  options: CandidateJudgeOptions = {},
): Promise<CandidateJudgeGateResult> {
  const accepted: SearchResult[] = [];
  const downgraded: SearchResult[] = [];
  const rejected: SearchResult[] = [];
  const toJudgeIndexes: number[] = [];
  const assessmentsByIndex = new Map<number, CandidateJudgeAssessment>();

  results.forEach((result, index) => {
    if (shouldJudge(result)) toJudgeIndexes.push(index);
    else assessmentsByIndex.set(index, fallbackJudge(result, spec, options));
  });

  const maxCandidates = Math.max(1, Math.min(options.maxCandidates ?? DEFAULT_MAX_CANDIDATES, 20));
  const selectedIndexes = toJudgeIndexes.slice(0, maxCandidates);
  const selectedResults = selectedIndexes.map((index) => results[index]);
  const selectedAssessments = await judgeCandidateBatch(selectedResults, spec, llmAdapter, {
    ...options,
    maxCandidates,
  });
  selectedIndexes.forEach((index, offset) => assessmentsByIndex.set(index, selectedAssessments[offset]));

  for (const index of toJudgeIndexes.slice(maxCandidates)) {
    assessmentsByIndex.set(index, fallbackJudge(results[index], spec, options));
  }

  const assessedResults = results.map((result, index) => {
    const assessment = assessmentsByIndex.get(index) ?? fallbackJudge(result, spec, options);
    const restoredKeySemantic = result.original_semantic_type && KEY_OPPORTUNITY_TYPES.has(result.original_semantic_type)
      ? result.original_semantic_type
      : undefined;
    const nextSemanticType: OpportunityKind = assessment.decision === "reject"
      ? "rejected"
      : assessment.decision === "downgrade_to_watch_signal"
        ? "watch_signal"
        : restoredKeySemantic ?? result.semantic_type ?? (assessment.candidate_type === "key_opportunity" ? "direct_opportunity" : "business_lead");
    const assessed: SearchResult = {
      ...result,
      original_semantic_type: result.original_semantic_type ?? result.semantic_type,
      candidate_judge_assessment: assessment,
      semantic_type: nextSemanticType,
    };
    if (assessment.decision === "accept") accepted.push(assessed);
    else if (assessment.decision === "downgrade_to_watch_signal") downgraded.push(assessed);
    else rejected.push(assessed);
    return assessed;
  });

  return { accepted, downgraded, rejected, assessedResults };
}
