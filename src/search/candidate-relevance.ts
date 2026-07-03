import type { RadarRequirementSpec } from "../schema/radar-requirement-spec";
import type { SourceArchetypeId } from "../schema/radar-mvp-contracts";
import { normalizeSourceArchetype } from "./opportunity-strategy";
import type { SearchResult } from "./types";

export type CandidateFitStatus = "match" | "mismatch" | "unknown";
export type CandidateRelevanceDecision = "accept" | "downgrade_to_watch_signal" | "reject";

export interface CandidateFitDimension {
  status: CandidateFitStatus;
  score: number;
  basis: string[];
}

export interface CandidateRelevanceAssessment {
  subjectFit: CandidateFitDimension;
  targetFit: CandidateFitDimension;
  actionFit: CandidateFitDimension;
  sourceFit: CandidateFitDimension;
  freshnessFit: CandidateFitDimension;
  regionFit: CandidateFitDimension;
  opportunityFit: CandidateFitDimension;
  decision: CandidateRelevanceDecision;
  reasonCodes: string[];
  evidenceBasis: "search_result_and_radar_version";
  assessedAt: string;
}

export interface CandidateRelevanceOptions {
  now?: Date;
}

export interface CandidateRelevanceGateResult {
  accepted: SearchResult[];
  downgraded: SearchResult[];
  rejected: SearchResult[];
  assessedResults: SearchResult[];
}

type ActionClass = "registration" | "procurement" | "partnership" | "employment" | "submission" | "grant" | "market_access";

const ACTION_PATTERNS: Record<ActionClass, RegExp> = {
  registration: /报名|参赛|注册|entry|entries|registration|register|apply|application|応募|募集/i,
  procurement: /招标|投标|采购|供应商|入库|征集供应商|tender|procurement|supplier|vendor/i,
  partnership: /合作|伙伴|代理|渠道|经销|分销|联名|赞助|partner|reseller|distributor|collaboration|sponsor/i,
  employment: /招聘|岗位|职位|猎头|用人|hiring|career|careers|job|jobs|vacancy|recruit/i,
  submission: /投稿|征稿|征集|公开征集|submit|submission|open call|作品募集/i,
  grant: /申报|补贴|资助|扶持|grant|subsidy|funding|accelerator/i,
  market_access: /参展|展商|展位|摊位|入驻|市集|快闪|曝光|exhibitor|booth|marketplace|pop-up/i,
};

const GENERIC_TERMS = new Set([
  "机会", "项目", "寻找", "相关", "近期", "未来", "国内外", "官网", "官方", "页面", "平台", "公司", "企业", "选手", "供应商",
  "报名", "申请", "申报", "征集", "招募", "招标", "采购", "投稿", "合作", "联系", "入口", "公开", "活动", "通知", "公告",
  "改造", "范围", "采购范围", "材料", "方式", "参与", "面向", "提供", "仍可", "具体",
  "opportunity", "official", "company", "business", "application", "registration", "apply", "contact", "partner", "supplier", "vendor",
  "hong", "kong", "china", "singapore", "asia", "guangdong", "guangzhou", "2025", "2026", "2027",
]);

const DOMAIN_EQUIVALENTS: Array<[RegExp, string[]]> = [
  [/围棋/i, ["围棋", "go tournament", "go championship"]],
  [/乒乓球/i, ["乒乓球", "table tennis", "ittf", "wtt"]],
  [/财务|税务|资金|内控/i, ["财务", "税务", "资金", "内控", "finance", "financial", "tax", "treasury", "controller", "internal control"]],
  [/零售|商品交易/i, ["零售", "商品交易", "retail", "fmcg", "supermarket", "convenience store", "pos", "erp", "wholesale"]],
  [/摄影/i, ["摄影", "photo", "photography", "写真"]],
];

const INFORMATIONAL_RE = /历史|规则介绍|指南|趋势|市场规模|报告分析|名录|目录|directory|guide|history|highlights?|回顾|百科|科普/i;
const HARD_NOISE_RE = /系统升级|系统维护|重新登录|常见问题|faq|教程|登录说明/i;
const JOB_RE = /招聘|岗位|职位|投递简历|hiring|career|careers|job|jobs|vacancy/i;
const LOW_ACTION_MEDIA_RE = /视频|集锦|highlights?|watch the best|直播回放/i;
const NEGATED_ACTION_RE = /\b(?:no|without)\b.{0,80}\b(?:partner|exhibitor|application|registration|contact|supplier)\b.{0,40}\b(?:route|entry|program)\b|不提供.{0,12}(?:报名|申请|合作|采购|投稿|入口)|没有.{0,12}(?:报名|申请|合作|采购|投稿|入口)/i;
const EXCLUSION_FAMILIES: RegExp[] = [
  /培训|训练|课程|course|training/i,
  /视频|集锦|回放|video|highlights?/i,
  /广告|加盟|招商广告|advertisement/i,
  /百科|科普|历史介绍|规则介绍|encyclopedia|explainer/i,
];

function normalize(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

function fit(status: CandidateFitStatus, basis: string[] = []): CandidateFitDimension {
  return { status, score: status === "match" ? 100 : status === "mismatch" ? 0 : 50, basis };
}

function valuesFromSpec(spec: RadarRequirementSpec): string[] {
  const radar = spec.radar_version;
  return [
    radar?.targetUser,
    radar?.businessContext,
    ...(radar?.opportunityIntents ?? []),
    ...(radar?.highValueCriteria ?? []),
    ...(radar?.queryFamilies ?? []).flatMap((family) => [family.familyName, family.whyThisFamily, ...(family.queries ?? [])]),
    spec.client_profile?.business_type,
    spec.core_goals?.primary_goal,
    ...(spec.opportunity_scope?.primary_opportunity_types ?? []),
  ].filter((value): value is string => Boolean(value));
}

function splitTerms(value: string): string[] {
  const normalized = normalize(value).replace(/^site:\S+\s*/i, "");
  const terms = normalized
    .split(/[\s,，、/|:：;；()（）【】]+/)
    .map((term) => term.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter((term) => term.length >= 2 && term.length <= 32)
    .filter((term) => !GENERIC_TERMS.has(term) && !/^\d+$/.test(term));
  const expanded = new Set(terms);
  for (const term of terms) {
    if (!/^[\p{Script=Han}]{4,16}$/u.test(term)) continue;
    for (const size of [2, 3, 4]) {
      for (let index = 0; index <= term.length - size; index += 1) {
        const part = term.slice(index, index + size);
        if (!GENERIC_TERMS.has(part)) expanded.add(part);
      }
    }
  }
  return Array.from(expanded);
}

function domainTerms(spec: RadarRequirementSpec): string[] {
  const radar = spec.radar_version;
  const values = [
    radar?.targetUser,
    radar?.businessContext,
    ...(radar?.opportunityIntents ?? []),
    ...(radar?.queryFamilies ?? []).flatMap((family) => [family.familyName, ...(family.queries ?? [])]),
    spec.client_profile?.business_type,
    spec.core_goals?.primary_goal,
    ...(spec.opportunity_scope?.primary_opportunity_types ?? []),
  ].filter((value): value is string => Boolean(value));
  const terms = new Set(values.flatMap(splitTerms));
  const combined = normalize(values.join(" "));
  for (const [pattern, equivalents] of DOMAIN_EQUIVALENTS) {
    if (pattern.test(combined)) equivalents.forEach((term) => terms.add(term));
  }
  return Array.from(terms).filter((term) => {
    if (GENERIC_TERMS.has(term)) return false;
    return !Object.values(ACTION_PATTERNS).some((pattern) => pattern.test(term));
  });
}

function matchingTerms(text: string, terms: string[]): string[] {
  return terms.filter((term) => text.includes(normalize(term))).slice(0, 6);
}

function matchingExclusion(text: string, exclusions: string[]): string | undefined {
  const literal = exclusions.find((term) => text.includes(term));
  if (literal) return literal;
  const configuredText = exclusions.join(" ");
  const family = EXCLUSION_FAMILIES.find((pattern) => pattern.test(configuredText) && pattern.test(text));
  return family?.source;
}

function actionClasses(text: string): ActionClass[] {
  return (Object.entries(ACTION_PATTERNS) as Array<[ActionClass, RegExp]>)
    .filter(([, pattern]) => pattern.test(text))
    .map(([name]) => name);
}

function targetFitFor(resultText: string, spec: RadarRequirementSpec, desiredActions: ActionClass[]): CandidateFitDimension {
  if (!JOB_RE.test(resultText)) return fit("unknown", ["候选没有明确受众身份声明"]);
  if (!desiredActions.includes("employment")) return fit("mismatch", ["候选面向求职者，但雷达并不寻找招聘需求"]);

  const targetTerms = splitTerms(spec.radar_version?.targetUser ?? spec.client_profile?.business_type ?? "");
  const isHiringRadarOperator = targetTerms.some((term) => resultText.includes(term) && /招聘|hiring|job|vacancy/i.test(resultText));
  if (isHiringRadarOperator) return fit("mismatch", ["候选招聘的是雷达用户自身角色，不是用户寻找的客户需求"]);
  return fit("match", ["候选是公司岗位或招聘信号，与雷达招聘意图一致"]);
}

function sourceFitFor(result: SearchResult, spec: RadarRequirementSpec): CandidateFitDimension {
  if (!result.source_archetype) return fit("unknown", ["搜索结果没有来源类型"]);
  const desired = new Set<SourceArchetypeId>([
    ...(spec.radar_version?.prioritySourceArchetypes ?? []).map(normalizeSourceArchetype),
    ...(spec.radar_version?.queryFamilies ?? []).map((family) => normalizeSourceArchetype(family.sourceArchetype)),
  ]);
  if (desired.has(result.source_archetype)) return fit("match", [`来源类型 ${result.source_archetype} 在雷达优先来源中`]);
  if (result.source_archetype === "reference_case_source") return fit("mismatch", ["参考资料来源不是当前优先行动入口"]);
  return fit("unknown", [`来源类型 ${result.source_archetype} 未被雷达明确列为优先来源`]);
}

function parseExplicitDeadline(text: string, now: Date): Date | null {
  const match = text.match(/(?:截止(?:时间|日期)?(?:为|至|到)?|deadline\s*(?:is|:)?)[^\d]{0,8}(20\d{2})[年\-/\.](\d{1,2})[月\-/\.](\d{1,2})日?/i);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 23, 59, 59);
  return Number.isNaN(date.getTime()) ? null : date;
}

function freshnessFitFor(result: SearchResult, text: string, now: Date): { fit: CandidateFitDimension; expired: boolean; stale: boolean } {
  const deadline = parseExplicitDeadline(text, now);
  if (deadline && deadline.getTime() < now.getTime()) {
    return { fit: fit("mismatch", [`明确截止日期 ${deadline.toISOString().slice(0, 10)} 已过期`]), expired: true, stale: false };
  }
  if (deadline) return { fit: fit("match", [`明确截止日期 ${deadline.toISOString().slice(0, 10)} 尚未到期`]), expired: false, stale: false };

  const years = Array.from(text.matchAll(/\b(20\d{2})\b/g)).map((match) => Number(match[1]));
  if (result.published_at) {
    const published = new Date(result.published_at);
    if (!Number.isNaN(published.getTime())) years.push(published.getFullYear());
  }
  const currentYear = now.getFullYear();
  if (years.length > 0 && Math.max(...years) < currentYear) {
    return { fit: fit("mismatch", [`页面只出现早于 ${currentYear} 的年份，时效性不足`]), expired: false, stale: true };
  }
  if (years.some((year) => year >= currentYear)) {
    return { fit: fit("match", [`页面包含 ${currentYear} 或未来年份`]), expired: false, stale: false };
  }
  return { fit: fit("unknown", ["没有足够日期证据"]), expired: false, stale: false };
}

function regionFitFor(text: string, spec: RadarRequirementSpec): CandidateFitDimension {
  const excluded = spec.region_scope?.excluded_regions ?? [];
  const excludedMatch = excluded.find((region) => text.includes(normalize(region)));
  if (excludedMatch) return fit("mismatch", [`命中排除地域 ${excludedMatch}`]);
  const included = [
    ...(spec.region_scope?.primary_regions ?? []),
    ...(spec.region_scope?.secondary_regions ?? []),
  ];
  const includedMatch = included.find((region) => text.includes(normalize(region)));
  if (includedMatch) return fit("match", [`命中目标地域 ${includedMatch}`]);
  return fit("unknown", ["候选没有足够地域证据"]);
}

export function assessCandidateRelevance(
  result: SearchResult,
  spec: RadarRequirementSpec,
  options: CandidateRelevanceOptions = {},
): CandidateRelevanceAssessment {
  const now = options.now ?? new Date();
  const text = normalize(`${result.title} ${result.snippet}`);
  const specText = normalize(valuesFromSpec(spec).join(" "));
  const terms = domainTerms(spec);
  const overlaps = matchingTerms(text, terms);
  const desiredActions = actionClasses(specText);
  const candidateActions = actionClasses(text);
  const sharedActions = candidateActions.filter((action) => desiredActions.includes(action));
  const exclusions = [
    ...(spec.filter_rules?.must_exclude ?? []),
    ...(spec.radar_version?.exclusionRules ?? []),
  ].map(normalize).filter(Boolean);
  const exclusion = matchingExclusion(text, exclusions);

  const subjectFit = overlaps.length > 0
    ? fit("match", [`命中雷达主题词：${overlaps.join("、")}`])
    : fit("mismatch", ["候选正文未命中雷达版本的行业或机会主题"]);
  const targetFit = targetFitFor(text, spec, desiredActions);
  const actionFit = NEGATED_ACTION_RE.test(text)
    ? fit("mismatch", ["候选明确说明没有可用行动入口"])
    : sharedActions.length > 0
    ? fit("match", [`候选行动类型与雷达一致：${sharedActions.join("、")}`])
    : candidateActions.length > 0
      ? fit("mismatch", [`候选行动类型 ${candidateActions.join("、")} 与雷达目标不一致`])
      : fit("unknown", ["未找到明确报名、采购、合作、投稿或招聘动作"]);
  const sourceFit = sourceFitFor(result, spec);
  const freshness = freshnessFitFor(result, text, now);
  const regionFit = regionFitFor(text, spec);
  const semanticKey = result.semantic_type === "direct_opportunity" ||
    result.semantic_type === "business_lead" ||
    result.semantic_type === "channel_partner_lead" ||
    result.semantic_type === "customer_lead";
  const opportunityFit = semanticKey && subjectFit.status === "match" && actionFit.status === "match"
    ? fit("match", ["语义分桶、主题和行动信号共同支持机会判断"])
    : semanticKey
      ? fit("unknown", ["搜索语义分桶存在，但缺少主题或行动证据交叉支持"])
      : fit("mismatch", [`语义分桶 ${result.semantic_type ?? "unknown"} 不属于重点机会类型`]);

  const reasonCodes: string[] = [];
  let decision: CandidateRelevanceDecision;

  if (exclusion) {
    decision = "reject";
    reasonCodes.push("explicit_exclusion");
  } else if (freshness.expired) {
    decision = "reject";
    reasonCodes.push("expired_deadline");
  } else if ((INFORMATIONAL_RE.test(text) && opportunityFit.status !== "match") || sourceFit.status === "mismatch") {
    decision = "downgrade_to_watch_signal";
    reasonCodes.push(sourceFit.status === "mismatch" ? "source_mismatch" : "generic_information");
  } else if (HARD_NOISE_RE.test(text) || LOW_ACTION_MEDIA_RE.test(text) || NEGATED_ACTION_RE.test(text)) {
    decision = "reject";
    reasonCodes.push("low_action_noise");
  } else if (targetFit.status === "mismatch") {
    decision = "reject";
    reasonCodes.push("target_mismatch");
  } else if (subjectFit.status === "mismatch") {
    decision = "reject";
    reasonCodes.push("subject_mismatch");
  } else if (freshness.stale) {
    decision = "downgrade_to_watch_signal";
    reasonCodes.push("stale_or_uncertain");
  } else if (actionFit.status !== "match" || opportunityFit.status !== "match") {
    decision = "downgrade_to_watch_signal";
    reasonCodes.push("insufficient_action_evidence");
  } else {
    decision = "accept";
    reasonCodes.push("matched_radar_strategy");
  }

  if (subjectFit.status === "mismatch" && !reasonCodes.includes("subject_mismatch")) reasonCodes.push("subject_mismatch");
  if (actionFit.status === "mismatch" && !reasonCodes.includes("target_mismatch")) reasonCodes.push("action_mismatch");
  if (sourceFit.status === "mismatch" && !reasonCodes.includes("source_mismatch")) reasonCodes.push("source_mismatch");

  return {
    subjectFit,
    targetFit,
    actionFit,
    sourceFit,
    freshnessFit: freshness.fit,
    regionFit,
    opportunityFit,
    decision,
    reasonCodes,
    evidenceBasis: "search_result_and_radar_version",
    assessedAt: now.toISOString(),
  };
}

export function applyCandidateRelevanceGate(
  results: SearchResult[],
  spec: RadarRequirementSpec,
  options: CandidateRelevanceOptions = {},
): CandidateRelevanceGateResult {
  const accepted: SearchResult[] = [];
  const downgraded: SearchResult[] = [];
  const rejected: SearchResult[] = [];
  const assessedResults = results.map((result) => {
    const relevanceAssessment = assessCandidateRelevance(result, spec, options);
    const preserveObservationBucket = result.semantic_type === "association_directory" ||
      result.semantic_type === "reference_case" ||
      result.semantic_type === "watch_signal";
    const assessed: SearchResult = {
      ...result,
      relevance_assessment: relevanceAssessment,
      ...(relevanceAssessment.decision === "downgrade_to_watch_signal" && !preserveObservationBucket
        ? { semantic_type: "watch_signal" as const }
        : {}),
      ...(relevanceAssessment.decision === "reject" ? { semantic_type: "rejected" as const } : {}),
    };
    if (relevanceAssessment.decision === "accept") accepted.push(assessed);
    else if (relevanceAssessment.decision === "downgrade_to_watch_signal") downgraded.push(assessed);
    else rejected.push(assessed);
    return assessed;
  });
  return { accepted, downgraded, rejected, assessedResults };
}
