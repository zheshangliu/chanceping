import { hasProcurementDomainTag, isCraftRelevantProcurement } from "./procurement";
import { opportunityV2LiveStatus } from "./radar-view";
import { publicOpportunityV2Deadline } from "./public-deadline";
import type { OpportunityV2 } from "./types";

export type WorkbenchLane = "current" | "early" | "research" | "excluded";
export type BusinessFit = "HIGH" | "MEDIUM" | "LOW" | "REVIEW";
export type EligibilityStatus = "NOT_ASSESSED" | "NEEDS_REVIEW" | "POTENTIALLY_ELIGIBLE" | "INELIGIBLE";

export interface FieldEvidence {
  field: string;
  source_url: string;
  extracted_at: string;
  raw_excerpt: string;
  status: "source_stated" | "derived" | "unknown";
}

export interface ProcurementBusinessProfile {
  profile_id?: string;
  approved_domain_tags?: string[];
  core_capabilities?: string[];
  adjacent_capabilities?: string[];
  geo_preferences?: { onsite_first?: string[]; onsite_secondary?: string[]; goods_shipping_preferred?: string[]; cross_border_watch?: string[]; treat_preference_as_legal_eligibility?: boolean };
  qualification_facts?: { verified_licenses?: string[]; verified_turnover?: number | null; verified_large_contract_experience?: boolean | null; foreign_local_delivery_partners?: string[]; default_eligibility?: EligibilityStatus };
  hard_negative_domains?: string[];
  weights?: { domain?: number; delivery_geo?: number; delivery_form?: number; evidence?: number; stage?: number };
}

export interface WorkbenchAssessment {
  opportunity_id: string;
  profile_id: string;
  lane: WorkbenchLane;
  business_fit: BusinessFit;
  fit_score: number | null;
  eligibility_status: EligibilityStatus;
  fit_reasons: string[];
  missing_requirements: string[];
  delivery_caveats: string[];
  next_action: string;
  evidence: FieldEvidence[];
  assessed_at: string;
  rules_version: string;
  opportunity: OpportunityV2;
}

const RULES_VERSION = "procurement-workbench.v1";

function text(item: OpportunityV2): string {
  return `${item.title} ${item.summary} ${item.tags.join(" ")} ${item.procurement?.buyer_name ?? ""}`.replace(/\s+/gu, " ").trim();
}

function isExcluded(item: OpportunityV2, profile: ProcurementBusinessProfile): boolean {
  const value = text(item);
  const negatives = profile.hard_negative_domains ?? [];
  if (/(?:建筑工程|工程施工|施工总承包|装修(?:工程|项目)?|土建工程|普通IT|软件运维|硬件设备|保洁|餐饮服务|安保|呼叫中心|电话营销|催收|一般工业生产|原材料|\b(?:construction|software|hardware|cleaning|catering|security)\b)/iu.test(value)) return true;
  return negatives.some((negative) => negative && value.includes(negative));
}

function evidenceFor(item: OpportunityV2, now: Date): FieldEvidence[] {
  const sourceUrl = item.detail_url || item.source_url;
  const evidence: FieldEvidence[] = [
    { field: "title", source_url: sourceUrl, extracted_at: now.toISOString(), raw_excerpt: item.title.slice(0, 240), status: "source_stated" },
    { field: "summary", source_url: sourceUrl, extracted_at: now.toISOString(), raw_excerpt: item.summary.slice(0, 500), status: item.summary ? "source_stated" : "unknown" },
  ];
  if (item.procurement?.buyer_name) evidence.push({ field: "buyer", source_url: sourceUrl, extracted_at: now.toISOString(), raw_excerpt: item.procurement.buyer_name, status: "source_stated" });
  if (item.deadline) evidence.push({ field: "deadline", source_url: item.deadline_source_url || sourceUrl, extracted_at: now.toISOString(), raw_excerpt: item.deadline_raw_text || item.deadline, status: "source_stated" });
  if (item.procurement?.budget_amount != null) evidence.push({ field: "budget", source_url: sourceUrl, extracted_at: now.toISOString(), raw_excerpt: `${item.procurement.budget_amount} ${item.procurement.budget_currency ?? ""}`.trim(), status: "source_stated" });
  return evidence;
}

function locationScore(item: OpportunityV2, profile: ProcurementBusinessProfile): { points: number; reason: string; caveat?: string } {
  const location = `${item.event_location ?? ""} ${item.procurement?.country_code ?? ""} ${item.procurement?.country_name ?? ""}`.toLowerCase();
  const first = profile.geo_preferences?.onsite_first ?? [];
  const secondary = profile.geo_preferences?.onsite_secondary ?? [];
  const goods = profile.geo_preferences?.goods_shipping_preferred ?? [];
  if (first.some((value) => location.includes(value.toLowerCase()))) return { points: 25, reason: "履约地点命中首选区域" };
  if (secondary.some((value) => location.includes(value.toLowerCase()))) return { points: 18, reason: "履约地点命中次选区域" };
  if (goods.some((value) => location.includes(value.toLowerCase()))) return { points: 15, reason: "货物/远程交付区域可覆盖" };
  if (item.region === "GLOBAL" || item.participation_mode === "onsite") return { points: 5, reason: "地区或交付方式仍需确认", caveat: "境外/现场履约需当地合作方或交付能力核验" };
  return { points: 8, reason: "公告未提供足够履约地点信息", caveat: "履约地点未确认" };
}

export function assessProcurement(item: OpportunityV2, profile: ProcurementBusinessProfile, options: { now?: Date } = {}): WorkbenchAssessment {
  const now = options.now ?? new Date();
  const value = text(item);
  const procurement = item.procurement;
  const domainTags = item.tags.filter((tag) => (profile.approved_domain_tags ?? []).includes(tag));
  const hardExcluded = item.category !== "procurement_project" || !procurement || procurement.direction === "seller_offer" || isExcluded(item, profile) || !hasProcurementDomainTag(item.tags) || !isCraftRelevantProcurement(value);
  const live = opportunityV2LiveStatus(item, now);
  const publicDeadline = publicOpportunityV2Deadline(item);
  const expiredOrClosed = live === "EXPIRED" || ["awarded", "closed", "cancelled"].includes(procurement?.stage ?? "");
  const earlyStage = ["planned", "prequalification", "ongoing_intake"].includes(procurement?.stage ?? "") || procurement?.direction === "market_engagement";
  const lane: WorkbenchLane = hardExcluded ? "excluded" : expiredOrClosed ? "research" : earlyStage ? "early" : "current";
  const reasons: string[] = [];
  const caveats: string[] = [];
  const missing: string[] = [];
  const evidence = evidenceFor(item, now);
  if (domainTags.length) reasons.push(`领域匹配：${domainTags.join("、")}`);
  else if (!hardExcluded) { reasons.push("公告涉及文化/创意采购，但具体领域仍需人工确认"); missing.push("具体交付内容未完全获取"); }
  const location = locationScore(item, profile);
  reasons.push(location.reason);
  if (location.caveat) caveats.push(location.caveat);
  if (item.participation_mode === "onsite") reasons.push("交付形式包含现场服务");
  else if (item.participation_mode === "online") reasons.push("交付形式可线上完成");
  else { reasons.push("交付形式未明确"); missing.push("交付形式"); }
  if (procurement?.buyer_name) reasons.push(`买方：${procurement.buyer_name}`);
  else missing.push("买方联系人/主体");
  if (item.procurement?.budget_amount == null) caveats.push("公告未明确预算或币种");
  if (!publicDeadline.deadline && !item.is_long_term) caveats.push("截止日期未确认");
  if (item.deadline_conflict_unsafe) caveats.push("截止日期存在冲突，不能按精确日期决策");
  if (!item.application_url && !item.detail_url) missing.push("报名/响应入口");
  missing.push("资格条款与附件");
  if (!procurement?.milestones?.some((milestone) => milestone.kind === "submission")) missing.push("响应截止时间证据");
  const weights = profile.weights ?? {};
  const max = (weights.domain ?? 40) + (weights.delivery_geo ?? 25) + (weights.delivery_form ?? 15) + (weights.evidence ?? 10) + (weights.stage ?? 10);
  const rawScore = (domainTags.length ? (weights.domain ?? 40) : Math.round((weights.domain ?? 40) / 2)) + location.points + (item.participation_mode ? (weights.delivery_form ?? 15) : Math.round((weights.delivery_form ?? 15) / 2)) + Math.min(weights.evidence ?? 10, evidence.length * 2) + (procurement?.stage === "open" ? (weights.stage ?? 10) : Math.round((weights.stage ?? 10) / 2));
  const fitScore = hardExcluded ? 0 : Math.max(0, Math.min(100, Math.round((rawScore / Math.max(max, 1)) * 100)));
  const fit: BusinessFit = hardExcluded ? "LOW" : fitScore >= 75 ? "HIGH" : fitScore >= 50 ? "MEDIUM" : fitScore > 0 ? "LOW" : "REVIEW";
  const qualification = profile.qualification_facts?.default_eligibility ?? "NEEDS_REVIEW";
  const eligibility: EligibilityStatus = hardExcluded ? "INELIGIBLE" : qualification === "POTENTIALLY_ELIGIBLE" && (profile.qualification_facts?.verified_licenses?.length ?? 0) > 0 ? "POTENTIALLY_ELIGIBLE" : "NEEDS_REVIEW";
  const nextAction = lane === "current" ? "打开官方公告，核验资格与附件后准备响应" : lane === "early" ? "跟踪正式公告并准备入库/资格资料" : lane === "research" ? "作为买方周期参考，不按当前订单跟进" : "保留在池内复核，不进入经营跟进";
  return {
    opportunity_id: item.id,
    profile_id: profile.profile_id ?? "default-procurement-profile",
    lane,
    business_fit: fit,
    fit_score: hardExcluded ? null : fitScore,
    eligibility_status: eligibility,
    fit_reasons: reasons,
    missing_requirements: [...new Set(missing)],
    delivery_caveats: [...new Set(caveats)],
    next_action: nextAction,
    evidence,
    assessed_at: now.toISOString(),
    rules_version: RULES_VERSION,
    opportunity: item,
  };
}

export function publicWorkbenchAssessment(assessment: WorkbenchAssessment): Omit<WorkbenchAssessment, "opportunity"> & { opportunity: Omit<OpportunityV2, "deadline_conflicts" | "deadline_source_url" | "deadline_raw_text" | "deadline_checked_at"> } {
  const { opportunity, ...rest } = assessment;
  const publicDeadline = publicOpportunityV2Deadline(opportunity);
  if (!publicDeadline.unsafe) return { ...rest, opportunity: { ...opportunity, deadline: publicDeadline.deadline, deadline_text: publicDeadline.deadline_text, status: publicDeadline.status } };
  const { deadline_conflicts: _conflicts, deadline_source_url: _sourceUrl, deadline_raw_text: _rawText, deadline_checked_at: _checkedAt, ...safeOpportunity } = opportunity;
  return { ...rest, opportunity: { ...safeOpportunity, deadline: null, deadline_text: publicDeadline.deadline_text, status: publicDeadline.status } };
}
