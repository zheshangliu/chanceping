import type { RadarRequirementSpec } from "../schema/radar-requirement-spec";
import type { OpportunityKind } from "../schema/radar-mvp-contracts";
import type { SearchResult } from "./types";

export type CandidatePageAudience =
  | "current_user"
  | "buyer"
  | "seller"
  | "job_seeker"
  | "student"
  | "organizer"
  | "general_public"
  | "unclear";

export type CurrentUserActionMode =
  | "apply"
  | "register"
  | "bid"
  | "contact"
  | "sell_to_this_lead"
  | "observe_only"
  | "not_actionable"
  | "unclear";

export type OpportunityRoleForUser =
  | "direct_opportunity"
  | "procurement_opportunity"
  | "sales_lead"
  | "channel_lead"
  | "hiring_signal"
  | "watch_signal"
  | "reference_case"
  | "reject";

export type CandidateOwnershipDecision =
  | "accept"
  | "downgrade_to_watch_signal"
  | "reject";

export interface CandidateOwnershipAssessment {
  pageAudience: CandidatePageAudience;
  currentUserActionMode: CurrentUserActionMode;
  opportunityRoleForUser: OpportunityRoleForUser;
  ownershipDecision: CandidateOwnershipDecision;
  ownershipReason: string;
  reasonCodes: string[];
  basis: "deterministic_rule_on_search_evidence";
  assessedAt: string;
}

export interface CandidateOwnershipOptions {
  now?: Date;
}

export interface CandidateOwnershipGateResult {
  accepted: SearchResult[];
  downgraded: SearchResult[];
  rejected: SearchResult[];
  assessedResults: SearchResult[];
}

const KEY_OPPORTUNITY_TYPES = new Set<OpportunityKind>([
  "direct_opportunity",
  "business_lead",
  "channel_partner_lead",
  "customer_lead",
]);

const DIRECT_ACTION_RE = /报名|報名|参赛|參賽|申请|申請|申报|申報|提交|entry|entries|entry form|registration|register|apply|application|submit/i;
const BID_ACTION_RE = /招标|投标|采购公告|竞争性磋商|询价|供应商|入库|废气治理|污水处理|除尘设备|环保设备|tender|rfp|procurement|supplier|vendor|bid/i;
const CONTACT_ACTION_RE = /联系|官网招聘|公司招聘|careers?|contact|jobs?|vacanc|hiring/i;
const CALENDAR_OR_NEWS_RE = /日历|赛历|赛程|calendar|schedule|新闻|报道|公示|视频|集锦|news|highlights/i;
const NO_ENTRY_RE = /没有|未(?:提供|明确|找到)|不(?:提供|含|包含)|no .{0,30}(entry|registration|application|apply|contact)/i;
const ATHLETE_RE = /选手|运动员|player|athlete/i;
const TABLE_TENNIS_RE = /乒乓球|table tennis|wtt|ittf/i;
const HEADHUNTER_RE = /猎头|headhunter|recruiter|recruitment consultant/i;
const SELF_HEADHUNTER_JOB_RE = /猎头顾问|招聘顾问|recruitment consultant|headhunter jobs?|recruiter jobs?|talent acquisition/i;
const FINANCE_ROLE_RE = /财务|资金|税务|内控|finance|treasury|tax|controller|internal control|audit/i;
const NEGATED_HEADHUNTER_SIGNAL_RE = /(?:没有|未|不|无).{0,36}(可识别企业|跨境财务|财务岗位|资金岗位|税务岗位|内控岗位|招聘扩张|岗位需求)|no .{0,60}(finance role|treasury role|tax role|hiring signal|identifiable employer)/i;
const GENERIC_APPLICATION_HELP_RE = /申请帮助|求职申请帮助|application help|how to apply|apply help/i;
const RECRUITMENT_AGENCY_BRAND_RE = /robert walters|michael page|pagegroup|米高蒲志|hays|randstad|robert half|korn ferry|hudson|manpower|adecco/i;
const JOB_AGGREGATOR_RE = /indeed|jobsdb|glassdoor|linkedin|zhaopin|猎聘|智联|前程无忧|boss直聘|job board|职位聚合|招聘平台/i;
const ENVIRONMENT_VENDOR_RE = /工业环保|环保设备|废气|废水|污水|除尘|环保治理|environmental equipment|dust collector|waste gas|wastewater/i;
const ENVIRONMENT_EQUIPMENT_SCOPE_RE = /环保设备|废气治理|废水治理|污水处理|除尘|环保治理|节能改造|绿色改造|industrial environmental|environmental equipment|dust collector|waste gas|wastewater/i;
const NEGATED_ENVIRONMENT_SCOPE_RE = /(?:没有|未|不|无).{0,28}(环保设备|废气治理|废水治理|污水处理|除尘|环保治理|设备采购|招标|供应商|投标)|no .{0,50}(environmental equipment|dust collector|waste gas|wastewater|tender|procurement|supplier)/i;
const POLICY_OR_INFO_RE = /政策|规划|行动方案|实施方案|认定|新闻|栏目|首页|机构介绍|信息公开|policy|plan|roadmap|news|about us|information/i;
const GREENING_OR_RENOVATION_RE = /绿化|景观|保洁|环卫|装修|翻新|家具|renovation|greening|landscape|sanitation/i;
const GREEN_CERTIFICATION_APPLICATION_RE = /绿色工厂|绿色园区|绿色制造|绿色低碳|green factory|green park|green manufacturing/i;
const CERTIFICATION_APPLICATION_ACTION_RE = /申报|认证|认定|申请|提交材料|certification|application/i;

function normalize(value: unknown): string {
  return String(value ?? "").normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
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
    ...(radar?.exclusionRules ?? []),
    ...(radar?.prioritySourceArchetypes ?? []),
    ...(radar?.queryFamilies ?? []).flatMap((family) => [family.familyName, family.sourceArchetype, ...(family.queries ?? [])]),
    spec.client_profile?.business_type,
    spec.core_goals?.primary_goal,
    ...(spec.opportunity_scope?.primary_opportunity_types ?? []),
  ].filter(Boolean).join(" "));
}

function nowIso(options: CandidateOwnershipOptions): string {
  return (options.now ?? new Date()).toISOString();
}

function assessment(
  input: Omit<CandidateOwnershipAssessment, "basis" | "assessedAt">,
  options: CandidateOwnershipOptions,
): CandidateOwnershipAssessment {
  return {
    ...input,
    basis: "deterministic_rule_on_search_evidence",
    assessedAt: nowIso(options),
  };
}

function hasCurrentKeyIntent(result: SearchResult): boolean {
  return Boolean(result.semantic_type && KEY_OPPORTUNITY_TYPES.has(result.semantic_type));
}

export function assessCandidateOwnership(
  result: SearchResult,
  spec: RadarRequirementSpec,
  options: CandidateOwnershipOptions = {},
): CandidateOwnershipAssessment {
  const radarText = specText(spec);
  const text = textOf(result);
  const judge = result.candidate_judge_assessment;

  if (TABLE_TENNIS_RE.test(radarText) && ATHLETE_RE.test(radarText)) {
    if (CALENDAR_OR_NEWS_RE.test(text) && (!DIRECT_ACTION_RE.test(text) || NO_ENTRY_RE.test(text))) {
      return assessment({
        pageAudience: "general_public",
        currentUserActionMode: "observe_only",
        opportunityRoleForUser: "watch_signal",
        ownershipDecision: "downgrade_to_watch_signal",
        ownershipReason: "该页面是赛事日历、新闻或赛程信息，未显示选手可报名、参赛提交或 entry 路径。",
        reasonCodes: ["athlete_calendar_without_registration"],
      }, options);
    }
    if (DIRECT_ACTION_RE.test(text) && !NO_ENTRY_RE.test(text)) {
      return assessment({
        pageAudience: "current_user",
        currentUserActionMode: /报名|報名|参赛|參賽|entry|registration|register/i.test(text) ? "register" : "apply",
        opportunityRoleForUser: "direct_opportunity",
        ownershipDecision: "accept",
        ownershipReason: "页面显示选手可报名、参赛或提交 entry，当前用户是直接行动主体。",
        reasonCodes: ["athlete_can_register"],
      }, options);
    }
    if (BID_ACTION_RE.test(text)) {
      return assessment({
        pageAudience: "unclear",
        currentUserActionMode: "observe_only",
        opportunityRoleForUser: "watch_signal",
        ownershipDecision: "downgrade_to_watch_signal",
        ownershipReason: "当前用户是乒乓球选手，页面没有明确选手报名或参赛路径，不能按供应商投标机会处理。",
        reasonCodes: ["athlete_not_supplier_bid"],
      }, options);
    }
  }

  if (HEADHUNTER_RE.test(radarText)) {
    if (SELF_HEADHUNTER_JOB_RE.test(text) && /招聘|职位|jobs?|careers?|vacanc/i.test(text)) {
      return assessment({
        pageAudience: "job_seeker",
        currentUserActionMode: "not_actionable",
        opportunityRoleForUser: "reject",
        ownershipDecision: "reject",
        ownershipReason: "该职位面向猎头或招聘顾问本人求职，不是猎头顾问可外联的客户招聘需求。",
        reasonCodes: ["headhunter_self_job"],
      }, options);
    }
    if (JOB_AGGREGATOR_RE.test(text)) {
      return assessment({
        pageAudience: "job_seeker",
        currentUserActionMode: "observe_only",
        opportunityRoleForUser: "watch_signal",
        ownershipDecision: "downgrade_to_watch_signal",
        ownershipReason: "招聘聚合页可作观察线索，但不能压过公司官网招聘页或企业扩张信号。",
        reasonCodes: ["headhunter_job_aggregator_observation"],
      }, options);
    }
    if (RECRUITMENT_AGENCY_BRAND_RE.test(text)) {
      return assessment({
        pageAudience: "seller",
        currentUserActionMode: "observe_only",
        opportunityRoleForUser: "watch_signal",
        ownershipDecision: "downgrade_to_watch_signal",
        ownershipReason: "该页面来自招聘服务机构或猎头同行，更像竞品/二级线索，不是可识别目标雇主的跨境财务岗位需求。",
        reasonCodes: ["headhunter_agency_brand_not_employer"],
      }, options);
    }
    if (GENERIC_APPLICATION_HELP_RE.test(text)) {
      return assessment({
        pageAudience: "job_seeker",
        currentUserActionMode: "observe_only",
        opportunityRoleForUser: "watch_signal",
        ownershipDecision: "downgrade_to_watch_signal",
        ownershipReason: "该页面是求职申请帮助或泛申请说明，未显示可外联的目标企业、跨境财务岗位或招聘扩张信号。",
        reasonCodes: ["headhunter_generic_application_help"],
      }, options);
    }
    if (FINANCE_ROLE_RE.test(text) && CONTACT_ACTION_RE.test(text) && !NEGATED_HEADHUNTER_SIGNAL_RE.test(text)) {
      return assessment({
        pageAudience: "job_seeker",
        currentUserActionMode: "contact",
        opportunityRoleForUser: "hiring_signal",
        ownershipDecision: "accept",
        ownershipReason: "公司官网或可识别企业页面显示跨境财务相关岗位，猎头可作为 hiring signal 外联确认。",
        reasonCodes: ["headhunter_company_hiring_signal"],
      }, options);
    }
    if (hasCurrentKeyIntent(result)) {
      return assessment({
        pageAudience: "unclear",
        currentUserActionMode: "observe_only",
        opportunityRoleForUser: "watch_signal",
        ownershipDecision: "downgrade_to_watch_signal",
        ownershipReason: "当前摘要未能确认这是目标雇主的跨境财务、资金、税务或内控招聘信号，只保留为观察线索。",
        reasonCodes: ["headhunter_employer_signal_unclear"],
      }, options);
    }
  }

  if (ENVIRONMENT_VENDOR_RE.test(radarText)) {
    if (GREENING_OR_RENOVATION_RE.test(text) && !ENVIRONMENT_EQUIPMENT_SCOPE_RE.test(text)) {
      return assessment({
        pageAudience: "seller",
        currentUserActionMode: "not_actionable",
        opportunityRoleForUser: "reject",
        ownershipDecision: "reject",
        ownershipReason: "项目范围是绿化、装修、保洁或普通环境整治，未显示环保设备、废气、污水、除尘或治理服务采购。",
        reasonCodes: ["environment_scope_mismatch"],
      }, options);
    }
    if (POLICY_OR_INFO_RE.test(text) && (NEGATED_ENVIRONMENT_SCOPE_RE.test(text) || !BID_ACTION_RE.test(text) || !ENVIRONMENT_EQUIPMENT_SCOPE_RE.test(text))) {
      return assessment({
        pageAudience: "general_public",
        currentUserActionMode: "observe_only",
        opportunityRoleForUser: "watch_signal",
        ownershipDecision: "downgrade_to_watch_signal",
        ownershipReason: "该页面更像政策、栏目、新闻或机构信息，未显示环保设备供应商可投标或提交材料的动作。",
        reasonCodes: ["environment_policy_or_info_only"],
      }, options);
    }
    if (GREEN_CERTIFICATION_APPLICATION_RE.test(text) && CERTIFICATION_APPLICATION_ACTION_RE.test(text) && !BID_ACTION_RE.test(text)) {
      return assessment({
        pageAudience: "buyer",
        currentUserActionMode: "observe_only",
        opportunityRoleForUser: "watch_signal",
        ownershipDecision: "downgrade_to_watch_signal",
        ownershipReason: "绿色工厂、绿色园区或绿色制造认证申报面向被认定企业，不是工业环保设备供应商可投标的设备采购或治理项目。",
        reasonCodes: ["environment_green_certification_not_supplier_project"],
      }, options);
    }
    if (BID_ACTION_RE.test(text) && ENVIRONMENT_EQUIPMENT_SCOPE_RE.test(text) && !NEGATED_ENVIRONMENT_SCOPE_RE.test(text)) {
      return assessment({
        pageAudience: "seller",
        currentUserActionMode: "bid",
        opportunityRoleForUser: "procurement_opportunity",
        ownershipDecision: "accept",
        ownershipReason: "页面显示环保设备、废气、污水、除尘或治理服务采购范围，当前供应商可投标或准备材料。",
        reasonCodes: ["environment_vendor_can_bid"],
      }, options);
    }
    if (BID_ACTION_RE.test(text)) {
      return assessment({
        pageAudience: "buyer",
        currentUserActionMode: "not_actionable",
        opportunityRoleForUser: "reject",
        ownershipDecision: "reject",
        ownershipReason: "该页面虽然包含采购或招标动作，但采购范围未匹配工业环保设备、废气、污水、除尘或环保治理服务。",
        reasonCodes: ["environment_procurement_scope_mismatch"],
      }, options);
    }
  }

  if (judge?.decision === "reject") {
    return assessment({
      pageAudience: "unclear",
      currentUserActionMode: "not_actionable",
      opportunityRoleForUser: "reject",
      ownershipDecision: "reject",
      ownershipReason: `沿用候选裁判拒绝：${judge.reason}`,
      reasonCodes: ["judge_rejected"],
    }, options);
  }

  if (judge?.decision === "downgrade_to_watch_signal") {
    return assessment({
      pageAudience: "general_public",
      currentUserActionMode: "observe_only",
      opportunityRoleForUser: "watch_signal",
      ownershipDecision: "downgrade_to_watch_signal",
      ownershipReason: `候选裁判已降级为观察信号：${judge.reason}`,
      reasonCodes: ["judge_downgraded"],
    }, options);
  }

  if (!hasCurrentKeyIntent(result)) {
    return assessment({
      pageAudience: "unclear",
      currentUserActionMode: "observe_only",
      opportunityRoleForUser: result.semantic_type === "reference_case" ? "reference_case" : "watch_signal",
      ownershipDecision: "downgrade_to_watch_signal",
      ownershipReason: "候选不是直接机会或可行动线索，保留为观察或参考。",
      reasonCodes: ["not_key_semantic_type"],
    }, options);
  }

  if (result.semantic_type === "direct_opportunity") {
    if (BID_ACTION_RE.test(text)) {
      return assessment({
        pageAudience: "seller",
        currentUserActionMode: "bid",
        opportunityRoleForUser: "procurement_opportunity",
        ownershipDecision: "accept",
        ownershipReason: "页面包含采购、招标、供应商或投标动作，当前用户可作为供应方行动，但仍需复核资格。",
        reasonCodes: ["generic_supplier_can_bid"],
      }, options);
    }
    if (DIRECT_ACTION_RE.test(text) && !NO_ENTRY_RE.test(text)) {
      return assessment({
        pageAudience: "current_user",
        currentUserActionMode: /报名|報名|参赛|參賽|entry|registration|register/i.test(text) ? "register" : "apply",
        opportunityRoleForUser: "direct_opportunity",
        ownershipDecision: "accept",
        ownershipReason: "页面包含申请、报名、提交或参赛动作，当前用户可能是直接行动主体。",
        reasonCodes: ["generic_direct_action"],
      }, options);
    }
  }

  if (result.semantic_type === "business_lead" || result.semantic_type === "customer_lead") {
    return assessment({
      pageAudience: "buyer",
      currentUserActionMode: "sell_to_this_lead",
      opportunityRoleForUser: "sales_lead",
      ownershipDecision: "accept",
      ownershipReason: "候选可作为业务线索，当前用户可外联确认需求；不得视为已确认采购或合作机会。",
      reasonCodes: ["generic_sales_lead_pending_contact"],
    }, options);
  }

  if (result.semantic_type === "channel_partner_lead") {
    return assessment({
      pageAudience: "seller",
      currentUserActionMode: "contact",
      opportunityRoleForUser: "channel_lead",
      ownershipDecision: "accept",
      ownershipReason: "候选可作为渠道或伙伴线索，当前用户可外联确认合作条件。",
      reasonCodes: ["generic_channel_lead_pending_contact"],
    }, options);
  }

  return assessment({
    pageAudience: "unclear",
    currentUserActionMode: "observe_only",
    opportunityRoleForUser: "watch_signal",
    ownershipDecision: "downgrade_to_watch_signal",
    ownershipReason: "搜索摘要不足以确认当前用户是行动主体，降级为观察信号。",
    reasonCodes: ["ownership_unclear"],
  }, options);
}

export function applyCandidateOwnershipGate(
  results: SearchResult[],
  spec: RadarRequirementSpec,
  options: CandidateOwnershipOptions = {},
): CandidateOwnershipGateResult {
  const accepted: SearchResult[] = [];
  const downgraded: SearchResult[] = [];
  const rejected: SearchResult[] = [];

  const assessedResults = results.map((result) => {
    const ownership = assessCandidateOwnership(result, spec, options);
    const nextSemanticType: OpportunityKind | undefined = ownership.ownershipDecision === "reject"
      ? "rejected"
      : ownership.ownershipDecision === "downgrade_to_watch_signal"
        ? "watch_signal"
        : result.original_semantic_type && KEY_OPPORTUNITY_TYPES.has(result.original_semantic_type)
          ? result.original_semantic_type
          : result.semantic_type;
    const assessed: SearchResult = {
      ...result,
      original_semantic_type: result.original_semantic_type ?? result.semantic_type,
      ownership_assessment: ownership,
      semantic_type: nextSemanticType,
    };
    if (ownership.ownershipDecision === "accept") accepted.push(assessed);
    else if (ownership.ownershipDecision === "reject") rejected.push(assessed);
    else downgraded.push(assessed);
    return assessed;
  });

  return { accepted, downgraded, rejected, assessedResults };
}
