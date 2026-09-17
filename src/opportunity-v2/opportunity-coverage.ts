import { extractDeadlineEvidence, hasEncodingCorruption } from "../ich/aggregation/adapters/common";
import { publicOpportunityV2Deadline, serializeOpportunityV2Public } from "./public-deadline";
import type { OpportunityV2, OpportunityV2Source } from "./types";

export const OPPORTUNITY_COVERAGE_RULES_VERSION = "opportunity-coverage.v1";

export const OPPORTUNITY_COVERAGE_TYPES = [
  "grant_funding",
  "exhibition_showcase",
  "market_channel",
  "residency_learning",
  "partnership_commission",
  "recognition_incubation",
] as const;

export type OpportunityCoverageType = typeof OPPORTUNITY_COVERAGE_TYPES[number] | "procurement_order" | "competition_award";
export type OpportunityCoverageLane = "current" | "early" | "review" | "research" | "excluded";
export type OpportunityCoverageMoneyFlow = "receive" | "pay" | "mixed" | "noncash" | "unknown";
export type OpportunityCoverageEligibility = "NOT_ASSESSED" | "NEEDS_REVIEW" | "POTENTIALLY_ELIGIBLE" | "INELIGIBLE";

export interface OpportunityCoverageProfile {
  residency?: string | null;
  applicant_type?: "individual" | "company" | null;
  verified_ownership?: boolean | null;
  verified_protection_unit?: boolean | null;
}

export interface OpportunityCoverageEvidence {
  field: "type" | "lane" | "deadline" | "fees" | "funding" | "eligibility" | "application_action";
  source_url: string;
  raw_excerpt: string;
  status: "source_stated" | "derived" | "unknown";
}

export interface OpportunityCoverageAssessment {
  opportunity_id: string;
  view_types: OpportunityCoverageType[];
  lane: OpportunityCoverageLane;
  money_flow: OpportunityCoverageMoneyFlow;
  fees: string[];
  funding: string[];
  deadline: string | null;
  deadline_text: string | null;
  deadline_status: "CURRENT" | "EXPIRED" | "UNKNOWN_DEADLINE";
  rolling: boolean;
  eligibility_status: OpportunityCoverageEligibility;
  qualification_gaps: string[];
  buyer_demand: boolean;
  guaranteed_order: boolean | null;
  guaranteed_contract: boolean | null;
  our_role: "applicant" | "potential_distributor_not_supplier" | "participant" | "research_only" | "unknown";
  fit_basis: string[];
  next_action: string;
  evidence: OpportunityCoverageEvidence[];
  assessed_at: string;
  rules_version: typeof OPPORTUNITY_COVERAGE_RULES_VERSION;
  opportunity: OpportunityV2;
}

export interface OpportunityCoverageQuery {
  q?: string;
  view_type?: OpportunityCoverageType;
  lane?: OpportunityCoverageLane;
  region?: "CN" | "GLOBAL";
  source_id?: string;
}

const ACTION = /(?:apply|application|applications|submit|submission|call|open|accept(?:ing)?|seek|register|participat(?:e|ion)|招募|申请|申报|报名|投稿|提交|征集|征稿|遴选|受理|招生|入选|共创|酬劳|provid(?:e|ed)|接受)/iu;
const RESULT = /(?:awarded|recipients?|selected list|shortlist|winners?|result(?:s)?|signed (?:an?|the) (?:agreement|partnership)|名单公示|结果公示|获资助|拟认定|已完成评审|已签署|holiday season|news(?:letter)?|podcast|archive|archives?|contact(?: us)?|privacy policy|terms of)/iu;
const SELLER_OFFER = /(?:we\s+(?:manufacture|produce|make)|seek\s+(?:distributors?|retailers?)|寻找经销商|招募经销商|我方(?:生产|制造).*(?:经销|分销))/iu;
const RELEVANT_HINT = /(?:opportunit(?:y|ies)|open call|call for entry|apply|application|grant|fund(?:ing)?|fellowship|residency|exhibition|market|vendor|commission|collaboration|partner|incubat|certif|accredit|资助|扶持|基金|展览|征集|招募|市集|摊主|驻留|研修|培训|工作坊|合作|共创|委托|孵化|认定|申报|申请)/iu;
const EARLY = /(?:pre[- ]?announcement|planned|expression of interest|意向|预告|拟开放|即将开放|长期征集)/iu;
const NO_ACTION = /(?:no\s+(?:funding|applications?|open calls?|submissions?)|无(?:资助|申请|报名|开放征集)|未(?:提供|描述).*(?:资助|申请|行动入口))/iu;
const EXPLICIT_COMPETITION_TITLE = /(?:competition|contest|award|prize|竞赛|比赛|大赛|奖项|大奖|奖)/iu;
const CREATIVE_SOLICITATION = /(?:logo|logotype|vi\b|visual identity|brand identity|\bip\b|ip形象|设计(?:方案|作品)?征集|创意方案征集|品牌形象(?:设计)?征集|包装(?:设计)?征集|(?:(?:城市礼物|地方礼物|伴手礼)[^。；;\n]{0,30}(?:设计|logo|vi\b|\bip\b)))/iu;
const COMPETITION_ACTION = /(?:competition|contest|award|prize|winner|jury|judg(?:e|ing)|cash prize|大赛|比赛|竞赛|奖项|奖金|一等奖|二等奖|评审|评委|获奖|赛道|入围)/iu;

function bodyOf(item: OpportunityV2): string {
  return `${item.title}\n${item.summary}\n${item.tags.join(" ")}`.replace(/\s+/gu, " ").trim();
}

/**
 * A design solicitation can look like an exhibition or market because it uses
 * words such as “征集” and “城市礼物”. Keep this predicate narrow: only a
 * competition signal or a recognisable design/brand solicitation is blocked.
 */
export function isCreativeCompetitionOrSolicitation(item: OpportunityV2, value = bodyOf(item)): boolean {
  const withoutNegatedCompetition = value.replace(/(?:no|without|not)\s+(?:[a-z]+\s+){0,3}(?:competition|contest|prize|award)/giu, "");
  const judgingSignal = /(?:评审|评委|入围|赛道|jury|judg(?:e|ing))/iu.test(withoutNegatedCompetition)
    && /(?:奖|作品|设计|竞赛|比赛|大赛|competition|contest|award|prize|winner)/iu.test(withoutNegatedCompetition);
  const directSignal = COMPETITION_ACTION.test(withoutNegatedCompetition.replace(/(?:评审|评委|入围|赛道|jury|judg(?:e|ing))/giu, ""));
  return directSignal || judgingSignal || CREATIVE_SOLICITATION.test(value);
}

function excerpt(value: string, pattern: RegExp, limit = 240): string {
  const match = value.match(pattern);
  if (!match || match.index === undefined) return value.slice(0, limit);
  return value.slice(Math.max(0, match.index - 80), match.index + Math.max(match[0].length, 160)).slice(0, limit);
}

function isProcurement(item: OpportunityV2, value: string): boolean {
  return item.category === "procurement_project" || Boolean(item.procurement) || /(?:^|\s)(?:procurement|tender|采购|招标)(?:\s|$)/iu.test(value);
}

function moneyFlow(value: string): { flow: OpportunityCoverageMoneyFlow; fees: string[]; funding: string[] } {
  const feeMatches = value.match(/(?:application|entry|submission|stall|service)\s+fee[^.;。；]*|(?:申请|报名|投稿|摊位|服务)费[^.;。；]*/giu) ?? [];
  const receiveMatches = value.match(/(?:grant|fund(?:ing)?|stipend|prize|honorar(?:ium)?|paid|investment|资助|扶持|基金|津贴|奖金|酬劳|投资)/giu) ?? [];
  const noncash = /(?:free studio|studio provided|shared space|accommodation|workspace|免费工作室|共享空间|住宿|交通)/iu.test(value);
  const selfPay = /(?:accommodation|travel|transport|lodging)\s+(?:and\s+)?(?:transport\s+)?self[- ]?funded|自理|自费|费用自负/iu.test(value);
  const hasPay = feeMatches.length > 0 || selfPay;
  const hasReceive = receiveMatches.length > 0;
  const flow = hasReceive && hasPay ? "mixed" : hasReceive ? "receive" : hasPay && noncash && selfPay ? "mixed" : hasPay ? "pay" : noncash ? "noncash" : "unknown";
  return { flow, fees: [...new Set(feeMatches.map((item) => item.trim()))], funding: [...new Set(receiveMatches.map((item) => item.trim()))] };
}

function eligibility(value: string, profile: OpportunityCoverageProfile): { status: OpportunityCoverageEligibility; gaps: string[] } {
  const gaps: string[] = [];
  if (/(?:only|仅限|只接受).*(?:resident|resident in|居住|本地区)/iu.test(value)) {
    const required = value.match(/(?:resident in|居住于|本地区)([^.。,，;；]+)/iu)?.[1]?.trim() ?? "来源限定地区";
    if (profile.residency && !value.toLocaleLowerCase().includes(profile.residency.toLocaleLowerCase())) return { status: "INELIGIBLE", gaps: [`不符合来源的地区限制：${required}`] };
    gaps.push(`需核验地区限制：${required}`);
  }
  if (/(?:only|仅限|只接受).*(?:individual artists?|个人艺术家)/iu.test(value)) {
    if (profile.applicant_type === "company") return { status: "INELIGIBLE", gaps: ["来源仅接受个人申请"] };
    if (profile.applicant_type !== "individual") gaps.push("需确认申请主体为个人");
  }
  if (/(?:women[- ]founded|female founders?|女性创办|女性创业)/iu.test(value) && profile.verified_ownership !== true) gaps.push("女性创办/持股条件待核验");
  if (/(?:protection unit|保护单位|列入名录)/iu.test(value) && profile.verified_protection_unit !== true) gaps.push("名录项目保护单位资格待核验");
  if (gaps.length) return { status: "NEEDS_REVIEW", gaps };
  return { status: "NOT_ASSESSED", gaps: [] };
}

function deadlineFor(item: OpportunityV2, value: string, now: Date, researchOnly: boolean): { deadline: string | null; text: string | null; status: "CURRENT" | "EXPIRED" | "UNKNOWN_DEADLINE"; rolling: boolean } {
  const rolling = /(?:rolling basis|rolling applications?|滚动(?:申请|征集)?|长期有效)/iu.test(value);
  if (researchOnly) return { deadline: null, text: null, status: "UNKNOWN_DEADLINE", rolling: false };
  const publicDeadline = publicOpportunityV2Deadline(item);
  if (publicDeadline.unsafe) return { deadline: null, text: publicDeadline.deadline_text, status: "UNKNOWN_DEADLINE", rolling: false };
  let deadline = publicDeadline.deadline;
  let text = publicDeadline.deadline_text;
  if (!deadline) {
    const evidence = extractDeadlineEvidence(value, now, item.title).find((candidate) => Boolean(candidate.deadline_at));
    deadline = evidence?.deadline_at ?? null;
    text = evidence?.raw_text ?? null;
  }
  if (!deadline) return { deadline: null, text, status: rolling ? "CURRENT" : "UNKNOWN_DEADLINE", rolling };
  const status = new Date(deadline).getTime() < now.getTime() ? "EXPIRED" : "CURRENT";
  return { deadline, text, status, rolling };
}

function viewTypes(item: OpportunityV2, value: string): { types: OpportunityCoverageType[]; evidence: OpportunityCoverageEvidence[] } {
  const sourceUrl = item.detail_url || item.source_url;
  if (isProcurement(item, value)) return { types: ["procurement_order"], evidence: [] };
  if (isCreativeCompetitionOrSolicitation(item, value)) return { types: [], evidence: [] };
  if (item.category === "competition" && !/(?:open call|call for entry|exhibition|residency|grant|market|commission|collaboration|孵化|驻留|研修|展览|市集|合作|资助|申请|招募)/iu.test(value)) return { types: [], evidence: [] };
  if (SELLER_OFFER.test(value)) return { types: [], evidence: [] };
  if (RESULT.test(value)) return { types: [], evidence: [] };
  if (NO_ACTION.test(value)) return { types: [], evidence: [] };
  const types: OpportunityCoverageType[] = [];
  const evidence: OpportunityCoverageEvidence[] = [];
  const add = (type: OpportunityCoverageType, pattern: RegExp): void => {
    if (!types.includes(type)) {
      types.push(type);
      evidence.push({ field: "type", source_url: sourceUrl, raw_excerpt: excerpt(value, pattern), status: "source_stated" });
    }
  };
  if (/(?:funded|fund(?:ing)?|grant|stipend|资助|扶持|基金)/iu.test(value) && ACTION.test(value)) add("grant_funding", /(?:funded|fund(?:ing)?|grant|stipend|资助|扶持|基金)/iu);
  if (/(?:exhibition|open call|call for entry|展览|作品(?:公开)?征集)/iu.test(value) && ACTION.test(value)) add("exhibition_showcase", /(?:exhibition|open call|call for entry|展览|作品(?:公开)?征集)/iu);
  if (/(?:vendor|stall|market|museum shop|retail|brand|city gift|城市礼物|礼品|选品|摊主|市集|入驻|推荐名录)/iu.test(value) && ACTION.test(value)) add("market_channel", /(?:vendor|stall|market|museum shop|retail|城市礼物|礼品|选品|摊主|市集|入驻)/iu);
  if (/(?:residency|fellowship|workshop|mentorship|驻留|研修|培训|工作坊)/iu.test(value) && ACTION.test(value)) add("residency_learning", /(?:residency|fellowship|workshop|mentorship|驻留|研修|培训|工作坊)/iu);
  if (/(?:commission|collaboration|partner(?:ship)?|co-create|共创|合作|委托)/iu.test(value) && ACTION.test(value)) add("partnership_commission", /(?:commission|collaboration|partner(?:ship)?|共创|合作|委托)/iu);
  if (/(?:incubat(?:or|ion)|accelerator|certif(?:ication)?|accredit(?:ation)?|孵化|认定|录取企业[^。；\n]{0,80}股权投资)/iu.test(value) && (ACTION.test(value) || /(?:录取|入孵|入选)/u.test(value))) add("recognition_incubation", /(?:incubat|accelerator|certif|accredit|孵化|认定|股权投资)/iu);
  return { types, evidence };
}

function nextAction(lane: OpportunityCoverageLane, typeCount: number): string {
  if (lane === "current") return typeCount ? "打开来源原文，核验资格、材料、费用与截止日期后再决定申请" : "打开来源原文确认是否存在真实行动入口";
  if (lane === "early") return "记录意向并跟踪正式指南或开放时间，不把预告写成已开放";
  if (lane === "research") return "保留为周期/结果研究，不按当前开放机会跟进";
  if (lane === "review") return "人工复核来源正文，补齐机会类型与行动证据";
  return "不进入经营跟进";
}

export function assessOpportunityCoverage(item: OpportunityV2, options: { now?: Date; profile?: OpportunityCoverageProfile } = {}): OpportunityCoverageAssessment {
  const now = options.now ?? new Date();
  const profile = options.profile ?? {};
  const value = bodyOf(item);
  const sourceUrl = item.detail_url || item.source_url;
  const resultOnly = RESULT.test(value);
  const seller = SELLER_OFFER.test(value);
  const classified = viewTypes(item, value);
  const types = classified.types.filter((type) => !(type === "market_channel" && seller));
  const money = moneyFlow(value);
  const baseEligibility = eligibility(value, profile);
  const eligible = classified.types.includes("market_channel") && baseEligibility.status === "NOT_ASSESSED"
    ? { status: "NEEDS_REVIEW" as const, gaps: ["供货/选品条件与申请主体待核验"] }
    : baseEligibility;
  const deadline = deadlineFor(item, value, now, resultOnly);
  const hints = RELEVANT_HINT.test(value);
  const hasEncoding = Boolean(item.encoding_error) || hasEncodingCorruption(item.title) || hasEncodingCorruption(item.summary);
  let lane: OpportunityCoverageLane;
  if (hasEncoding || resultOnly || seller || deadline.status === "EXPIRED") lane = "research";
  else if (types.length > 0) lane = EARLY.test(value) ? "early" : "current";
  else if (deadline.rolling) lane = "current";
  else if (hints) lane = "review";
  else lane = "excluded";
  const finalDeadline = lane === "research" && (resultOnly || seller || deadline.status === "EXPIRED") ? { deadline: null, text: null, status: resultOnly || seller ? "UNKNOWN_DEADLINE" as const : "EXPIRED" as const, rolling: false } : deadline;
  const sourceEvidence = [{ field: "lane" as const, source_url: sourceUrl, raw_excerpt: item.title.slice(0, 240), status: "derived" as const }];
  const evidence = [...classified.evidence, ...sourceEvidence];
  if (finalDeadline.deadline || finalDeadline.text) evidence.push({ field: "deadline", source_url: item.deadline_source_url || sourceUrl, raw_excerpt: finalDeadline.text || finalDeadline.deadline || "", status: item.deadline ? "source_stated" : "derived" });
  if (money.fees.length) evidence.push({ field: "fees", source_url: sourceUrl, raw_excerpt: money.fees.join("；").slice(0, 240), status: "source_stated" });
  if (money.funding.length) evidence.push({ field: "funding", source_url: sourceUrl, raw_excerpt: money.funding.join("；").slice(0, 240), status: "source_stated" });
  if (eligible.gaps.length) evidence.push({ field: "eligibility", source_url: sourceUrl, raw_excerpt: eligible.gaps.join("；").slice(0, 240), status: "derived" });
  if (types.length) evidence.push({ field: "application_action", source_url: sourceUrl, raw_excerpt: excerpt(value, ACTION), status: "source_stated" });
  const qualificationGaps = [...eligible.gaps];
  if (types.length && !ACTION.test(value)) qualificationGaps.push("行动入口未明确");
  const buyerDemand = types.includes("market_channel") && !seller;
  const guaranteedOrder = buyerDemand ? /(?:guaranteed order|保证订单|确定采购|签约供货)/iu.test(value) : null;
  const guaranteedContract = types.includes("partnership_commission") ? /(?:signed contract|guaranteed contract|正式合同|已签合同)/iu.test(value) : null;
  const ourRole = seller ? "potential_distributor_not_supplier" : resultOnly || lane === "research" ? "research_only" : types.includes("market_channel") ? "applicant" : types.length ? "participant" : "unknown";
  const fitBasis = types.map((type) => `正文行动证据映射到${type}`).concat(eligible.status === "INELIGIBLE" ? ["当前画像不满足来源显式资格"] : []);
  return {
    opportunity_id: item.id,
    view_types: types,
    lane,
    money_flow: money.flow,
    fees: money.fees,
    funding: money.funding,
    deadline: finalDeadline.deadline,
    deadline_text: finalDeadline.text,
    deadline_status: finalDeadline.status,
    rolling: finalDeadline.rolling,
    eligibility_status: eligible.status,
    qualification_gaps: [...new Set(qualificationGaps)],
    buyer_demand: buyerDemand,
    guaranteed_order: guaranteedOrder,
    guaranteed_contract: guaranteedContract,
    our_role: ourRole,
    fit_basis: fitBasis,
    next_action: nextAction(lane, types.length),
    evidence,
    assessed_at: now.toISOString(),
    rules_version: OPPORTUNITY_COVERAGE_RULES_VERSION,
    opportunity: item,
  };
}

export function buildOpportunityCoverageAssessments(items: OpportunityV2[], options: { now?: Date; profile?: OpportunityCoverageProfile } = {}): OpportunityCoverageAssessment[] {
  return items.map((item) => assessOpportunityCoverage(item, options)).filter((assessment) => assessment.opportunity.category !== "competition" && assessment.opportunity.category !== "procurement_project" && !isCreativeCompetitionOrSolicitation(assessment.opportunity) && !EXPLICIT_COMPETITION_TITLE.test(assessment.opportunity.title) && (assessment.view_types.length > 0 || assessment.lane === "review" || assessment.lane === "research"));
}

export function filterOpportunityCoverage(items: OpportunityV2[], query: OpportunityCoverageQuery = {}, options: { now?: Date; profile?: OpportunityCoverageProfile } = {}): OpportunityCoverageAssessment[] {
  const q = query.q?.trim().toLocaleLowerCase();
  return buildOpportunityCoverageAssessments(items, options)
    .filter((assessment) => !query.view_type || assessment.view_types.includes(query.view_type))
    .filter((assessment) => !query.lane || assessment.lane === query.lane)
    .filter((assessment) => !query.region || assessment.opportunity.region === query.region)
    .filter((assessment) => !query.source_id || assessment.opportunity.source_id === query.source_id)
    .filter((assessment) => !q || `${assessment.opportunity.title} ${assessment.opportunity.summary} ${assessment.opportunity.tags.join(" ")}`.toLocaleLowerCase().includes(q));
}

export function publicOpportunityCoverageAssessment(assessment: OpportunityCoverageAssessment): Omit<OpportunityCoverageAssessment, "opportunity"> & { opportunity: Record<string, unknown> } {
  const publicOpportunity = serializeOpportunityV2Public(assessment.opportunity);
  const publicDeadline = publicOpportunityV2Deadline(assessment.opportunity);
  return {
    ...assessment,
    deadline: publicDeadline.deadline,
    deadline_text: publicDeadline.deadline_text,
    deadline_status: publicDeadline.status,
    opportunity: publicOpportunity,
  };
}

export function publicOpportunityCoverageAssessments(assessments: OpportunityCoverageAssessment[]): Array<Omit<OpportunityCoverageAssessment, "opportunity"> & { opportunity: Record<string, unknown> }> {
  return assessments.map(publicOpportunityCoverageAssessment);
}
