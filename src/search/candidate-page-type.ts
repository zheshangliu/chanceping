import type { RadarRequirementSpec } from "../schema/radar-requirement-spec";
import type { OpportunityKind } from "../schema/radar-mvp-contracts";
import type { SearchResult } from "./types";

export type CandidatePageType =
  | "official_notice"
  | "tender_notice"
  | "open_call"
  | "registration_page"
  | "exhibitor_application"
  | "supplier_onboarding"
  | "partner_program"
  | "application_form"
  | "company_careers_page"
  | "official_event_detail"
  | "homepage"
  | "about_us"
  | "institution_profile"
  | "category_page"
  | "department_index"
  | "information_disclosure"
  | "xls_summary"
  | "pdf_summary_without_action"
  | "pdf_policy_material"
  | "template_page"
  | "platform_intro"
  | "trend_article"
  | "news_article"
  | "calendar_page"
  | "faq_page"
  | "policy_plan"
  | "generic_procurement_column"
  | "directory_page"
  | "aggregator_page"
  | "unknown";

export type CandidatePageFit = "fit" | "partial" | "mismatch" | "unknown";
export type CandidatePageIntent = "opportunity_entry" | "lead_resource" | "navigation" | "information" | "weak_action" | "unknown";
export type CandidatePageEligibility = "eligible" | "downgrade" | "reject";

export interface CandidatePageTypeAssessment {
  pageType: CandidatePageType;
  pageIntentFit: CandidatePageIntent;
  actionEntryFit: CandidatePageFit;
  beneficiaryFit: CandidatePageFit;
  keyCardEligibility: CandidatePageEligibility;
  reasonCodes: string[];
  reason: string;
  basis: "search_result_and_radar_version";
  assessedAt: string;
}

export interface CandidatePageTypeOptions {
  now?: Date;
}

export interface CandidatePageTypeGateResult {
  eligible: SearchResult[];
  downgraded: SearchResult[];
  rejected: SearchResult[];
  assessedResults: SearchResult[];
}

const ACTION_ENTRY_RE = /报名|申请|申报|提交|投标|投稿|征集|招募|入驻|供应商|入库|展商|展位|摊位|合作|联系|职位|招聘|registration|register|apply|application|submit|tender|rfp|procurement|supplier|vendor|partner|exhibitor|booth|career|careers|job|vacancy/i;
const NEGATED_ACTION_ENTRY_RE = /未(?:提供|明确|找到).{0,20}(报名|申请|申报|提交|投标|投稿|征集|招募|入驻|采购|招标|供应商|入库|合作|联系|入口)|没有(?:提供|明确|找到)?.{0,20}(报名|申请|申报|提交|投标|投稿|征集|招募|入驻|采购|招标|供应商|入库|合作|联系|入口)|不(?:提供|含|包含).{0,20}(报名|申请|申报|提交|投标|投稿|征集|招募|入驻|采购|招标|供应商|入库|合作|联系|入口)|no .{0,30}(application|registration|contact|entry|supplier|partner|procurement|tender)/i;
const DIRECT_NOTICE_RE = /公告|通知|公示|notice|announcement/i;
const TENDER_RE = /招标|投标|采购公告|询价|竞争性磋商|中标|tender|rfp|procurement|bidding/i;
const OPEN_CALL_RE = /公开征集|作品征集|征稿|投稿|open call|submission|call for/i;
const REGISTRATION_RE = /报名|参赛|注册|报名入口|registration|register|entry form/i;
const EXHIBITOR_RE = /展商|展位|摊位|参展申请|exhibitor|booth/i;
const SUPPLIER_RE = /供应商|入库|vendor|supplier|onboarding/i;
const PARTNER_RE = /合作伙伴|渠道|代理|经销|伙伴计划|partner program|reseller|distributor/i;
const FORM_RE = /申请表|报名表|提交表单|application form|submit form/i;
const CAREERS_RE = /招聘|岗位|职位|careers?|jobs?|vacanc/i;
const EVENT_DETAIL_RE = /赛事|公开赛|锦标赛|大会|活动详情|event detail|tournament|championship/i;

const XLS_RE = /\.xls[x]?(?:$|\?)|汇总表|excel/i;
const PDF_SUMMARY_RE = /\.pdf(?:$|\?)|pdf/i;
const TEMPLATE_RE = /模板|表格模板|template/i;
const TREND_RE = /趋势|白皮书|市场规模|行业报告|trend|white paper|market report/i;
const NEWS_RE = /新闻|报道|快讯|转载|news|press release|media/i;
const ABOUT_US_RE = /关于我们|机构介绍|组织介绍|公司简介|about us|about-us|who we are/i;
const INSTITUTION_PROFILE_RE = /机构主页|机构概况|机构简介|学院|研究院|共享平台|institution profile|organization profile/i;
const INFORMATION_DISCLOSURE_RE = /信息公开|公开信息|news information|information disclosure|public information/i;
const PLATFORM_INTRO_RE = /平台介绍|平台能力|平台注册须知|平台操作指南|platform intro|platform introduction|platform overview/i;
const CALENDAR_RE = /日历|赛历|calendar|schedule/i;
const FAQ_RE = /faq|常见问题|问答|帮助中心/i;
const POLICY_RE = /行动方案|规划|政策解读|指导意见|plan|roadmap|policy/i;
const DEPARTMENT_RE = /下属单位|机构职能|组织机构|内设机构|部门列表|department|organization/i;
const CATEGORY_RE = /栏目|列表|频道|专题|category|list|index/i;
const DIRECTORY_RE = /目录|名录|会员|成员|协会成员|directory|member list|members/i;
const AGGREGATOR_RE = /聚合|招标采购信息|采购与招标网|招标网|招标信息网站|推荐公告|采招网|必联网|bidcenter|chinabidding|qianlima|indeed|linkedin|猎聘|智联|boss直聘|job board/i;

const DIRECT_KEY_TYPES = new Set<OpportunityKind>([
  "direct_opportunity",
  "business_lead",
  "channel_partner_lead",
  "customer_lead",
]);

function normalize(value: unknown): string {
  return String(value ?? "").normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

function urlPath(url: string): string {
  try {
    return new URL(url).pathname.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

function textOf(result: SearchResult): string {
  return normalize(`${result.title} ${result.snippet} ${result.url}`);
}

function specText(spec: RadarRequirementSpec): string {
  const radar = spec.radar_version;
  return normalize([
    radar?.targetUser,
    radar?.businessContext,
    ...(radar?.opportunityIntents ?? []),
    ...(radar?.highValueCriteria ?? []),
    ...(radar?.queryFamilies ?? []).flatMap((family) => [family.familyName, family.sourceArchetype, ...(family.queries ?? [])]),
    spec.client_profile?.business_type,
    spec.core_goals?.primary_goal,
    ...(spec.opportunity_scope?.primary_opportunity_types ?? []),
  ].filter(Boolean).join(" "));
}

function isLikelyHomepage(result: SearchResult): boolean {
  const path = urlPath(result.url).replace(/\/+$/, "");
  if (path === "" || path === "/") return true;
  return /\/(?:home|index)(?:\.html?)?$/.test(path);
}

function wantsLeadResource(spec: RadarRequirementSpec): boolean {
  const text = specText(spec);
  return /线索|客户|渠道|代理|经销|会员目录|名录|联系人|招聘需求|外联|lead|partner|reseller|distributor|directory|contact|careers?/i.test(text);
}

function hasDirectActionEntry(text: string): boolean {
  if (NEGATED_ACTION_ENTRY_RE.test(text)) return false;
  return ACTION_ENTRY_RE.test(text) || TENDER_RE.test(text) || OPEN_CALL_RE.test(text) || SUPPLIER_RE.test(text);
}

function classifyPageType(result: SearchResult, text: string): CandidatePageType {
  if (XLS_RE.test(text)) return "xls_summary";
  if (TEMPLATE_RE.test(text)) return "template_page";
  if (FAQ_RE.test(text)) return "faq_page";
  if (ABOUT_US_RE.test(text)) return "about_us";
  if (INFORMATION_DISCLOSURE_RE.test(text)) return "information_disclosure";
  if (INSTITUTION_PROFILE_RE.test(text) && !hasDirectActionEntry(text)) return "institution_profile";
  if (PLATFORM_INTRO_RE.test(text)) return "platform_intro";
  if (DEPARTMENT_RE.test(text)) return "department_index";
  if (isLikelyHomepage(result)) return "homepage";
  if (POLICY_RE.test(text) && !hasDirectActionEntry(text)) return "policy_plan";
  if (AGGREGATOR_RE.test(text)) return "aggregator_page";
  if (PDF_SUMMARY_RE.test(text) && POLICY_RE.test(text)) return "pdf_policy_material";
  if (PDF_SUMMARY_RE.test(text) && !hasDirectActionEntry(text)) return "pdf_summary_without_action";
  if (TREND_RE.test(text)) return "trend_article";
  if (CALENDAR_RE.test(text) && !REGISTRATION_RE.test(text)) return "calendar_page";
  if (NEWS_RE.test(text) && !hasDirectActionEntry(text)) return "news_article";
  if (DIRECTORY_RE.test(text) && PARTNER_RE.test(text)) return "partner_program";
  if (DIRECTORY_RE.test(text)) return "directory_page";
  if (SUPPLIER_RE.test(text)) return "supplier_onboarding";
  if (TENDER_RE.test(text)) return "tender_notice";
  if (OPEN_CALL_RE.test(text)) return "open_call";
  if (REGISTRATION_RE.test(text)) return "registration_page";
  if (EXHIBITOR_RE.test(text)) return "exhibitor_application";
  if (PARTNER_RE.test(text)) return "partner_program";
  if (FORM_RE.test(text)) return "application_form";
  if (CAREERS_RE.test(text)) return "company_careers_page";
  if (EVENT_DETAIL_RE.test(text) && DIRECT_NOTICE_RE.test(text)) return "official_event_detail";
  if (CATEGORY_RE.test(text) && !hasDirectActionEntry(text)) return "category_page";
  return "unknown";
}

function assessmentFor(pageType: CandidatePageType, result: SearchResult, spec: RadarRequirementSpec, text: string, now: Date): CandidatePageTypeAssessment {
  const reasonCodes: string[] = [];
  const actionEntry = hasDirectActionEntry(text);
  let pageIntentFit: CandidatePageIntent = "unknown";
  let actionEntryFit: CandidatePageFit = actionEntry ? "fit" : "unknown";
  let beneficiaryFit: CandidatePageFit = "unknown";
  let keyCardEligibility: CandidatePageEligibility = "downgrade";

  const directOpportunityTypes: CandidatePageType[] = [
    "official_notice",
    "tender_notice",
    "open_call",
    "registration_page",
    "exhibitor_application",
    "supplier_onboarding",
    "partner_program",
    "application_form",
    "company_careers_page",
    "official_event_detail",
  ];
  const hardWeakTypes: CandidatePageType[] = ["xls_summary", "template_page"];
  const navigationTypes: CandidatePageType[] = ["homepage", "category_page", "department_index", "calendar_page", "generic_procurement_column", "information_disclosure", "institution_profile", "platform_intro"];
  const informationTypes: CandidatePageType[] = ["about_us", "trend_article", "news_article", "faq_page", "policy_plan", "pdf_summary_without_action", "pdf_policy_material"];

  if (directOpportunityTypes.includes(pageType)) {
    pageIntentFit = "opportunity_entry";
    beneficiaryFit = "partial";
    keyCardEligibility = actionEntry ? "eligible" : "downgrade";
    reasonCodes.push(actionEntry ? "direct_action_entry" : "entry_page_without_clear_action");
  } else if (hardWeakTypes.includes(pageType)) {
    pageIntentFit = "information";
    actionEntryFit = "mismatch";
    beneficiaryFit = "unknown";
    keyCardEligibility = "reject";
    reasonCodes.push(`${pageType}_not_action_entry`);
  } else if (navigationTypes.includes(pageType)) {
    pageIntentFit = "navigation";
    actionEntryFit = actionEntry ? "partial" : "mismatch";
    keyCardEligibility = "downgrade";
    reasonCodes.push("navigation_page_not_key_entry");
  } else if (informationTypes.includes(pageType)) {
    pageIntentFit = "information";
    actionEntryFit = actionEntry ? "partial" : "mismatch";
    keyCardEligibility = "downgrade";
    reasonCodes.push("information_page_not_key_entry");
  } else if (pageType === "directory_page") {
    pageIntentFit = wantsLeadResource(spec) ? "lead_resource" : "navigation";
    actionEntryFit = wantsLeadResource(spec) ? "partial" : actionEntryFit;
    beneficiaryFit = wantsLeadResource(spec) ? "partial" : "unknown";
    keyCardEligibility = "downgrade";
    reasonCodes.push(wantsLeadResource(spec) ? "directory_lead_resource_pending_contact" : "directory_not_direct_entry");
  } else if (pageType === "aggregator_page") {
    pageIntentFit = "weak_action";
    actionEntryFit = actionEntry ? "partial" : "mismatch";
    beneficiaryFit = "partial";
    keyCardEligibility = "downgrade";
    reasonCodes.push("aggregator_requires_original_source");
  } else {
    pageIntentFit = actionEntry ? "weak_action" : "unknown";
    actionEntryFit = actionEntry ? "partial" : "unknown";
    beneficiaryFit = "unknown";
    keyCardEligibility = actionEntry && result.semantic_type && DIRECT_KEY_TYPES.has(result.semantic_type) ? "eligible" : "downgrade";
    reasonCodes.push(actionEntry ? "unknown_page_with_action_signal" : "unknown_page_without_action_signal");
  }

  return {
    pageType,
    pageIntentFit,
    actionEntryFit,
    beneficiaryFit,
    keyCardEligibility,
    reasonCodes,
    reason: reasonCodes.join("、"),
    basis: "search_result_and_radar_version",
    assessedAt: now.toISOString(),
  };
}

export function assessCandidatePageType(
  result: SearchResult,
  spec: RadarRequirementSpec,
  options: CandidatePageTypeOptions = {},
): CandidatePageTypeAssessment {
  const now = options.now ?? new Date();
  const text = textOf(result);
  const pageType = classifyPageType(result, text);
  return assessmentFor(pageType, result, spec, text, now);
}

export function isKeyPageEligible(assessment: CandidatePageTypeAssessment): boolean {
  return assessment.keyCardEligibility === "eligible";
}

export function applyCandidatePageTypeGate(
  results: SearchResult[],
  spec: RadarRequirementSpec,
  options: CandidatePageTypeOptions = {},
): CandidatePageTypeGateResult {
  const eligible: SearchResult[] = [];
  const downgraded: SearchResult[] = [];
  const rejected: SearchResult[] = [];
  const assessedResults = results.map((result) => {
    const pageTypeAssessment = assessCandidatePageType(result, spec, options);
    const nextSemanticType: OpportunityKind | undefined = pageTypeAssessment.keyCardEligibility === "reject"
      ? "rejected"
      : pageTypeAssessment.keyCardEligibility === "downgrade" && result.semantic_type !== "association_directory"
        ? "watch_signal"
        : result.semantic_type;
    const assessed: SearchResult = {
      ...result,
      original_semantic_type: result.original_semantic_type ?? result.semantic_type,
      page_type_assessment: pageTypeAssessment,
      semantic_type: nextSemanticType,
    };
    if (pageTypeAssessment.keyCardEligibility === "eligible") eligible.push(assessed);
    else if (pageTypeAssessment.keyCardEligibility === "reject") rejected.push(assessed);
    else downgraded.push(assessed);
    return assessed;
  });
  return { eligible, downgraded, rejected, assessedResults };
}
