import { hasProcurementDomainTag, isCraftRelevantProcurement } from "./procurement";
import { isPublicProcurementText } from "./procurement-sources";
import { opportunityV2LiveStatus } from "./radar-view";
import { filterOpportunityV2Radar } from "./radar-view";
import { buildOpportunityV2Display, cleanOpportunityDisplayText, readOpportunityV2Translations } from "./display";
import { publicOpportunityV2Deadline, serializeOpportunityV2Public } from "./public-deadline";
import { isOpportunityV2PublicTitleSafe } from "./public-text";
import { readOpportunityV2Pool } from "./opportunity-pool";
import { readOpportunityV2Sources } from "./source-pool";
import { isOpportunityV2PublicCopyAllowed, isOpportunityV2PublicSummaryAllowed, isOpportunityV2SourceCollectionAllowed, publicOpportunityV2DiscoverySources } from "./source-governance";
import { buildCanonicalOpportunityDisplayGroups } from "./canonical-display-groups";
import { assessOpportunityCoverage, filterOpportunityCoverage, publicOpportunityCoverageAssessment, type OpportunityCoverageAssessment, type OpportunityCoverageQuery } from "./opportunity-coverage";
import type { OpportunityV2, OpportunityV2Source } from "./types";

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
  const hardExcluded = item.category !== "procurement_project" || !procurement || procurement.direction === "seller_offer" || isExcluded(item, profile) || !hasProcurementDomainTag(item.tags) || !isCraftRelevantProcurement(`${item.title} ${item.summary}`);
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
  const publicOpportunity = serializeOpportunityV2Public(opportunity) as Omit<OpportunityV2, "deadline_conflicts" | "deadline_source_url" | "deadline_raw_text" | "deadline_checked_at">;
  const evidence = isOpportunityV2PublicSummaryAllowed(opportunity.source_id)
    ? assessment.evidence
    : assessment.evidence.map((entry) => ({ ...entry, raw_excerpt: "" }));
  return { ...rest, evidence, opportunity: { ...publicOpportunity, deadline: publicDeadline.deadline, deadline_text: publicDeadline.deadline_text, status: publicDeadline.status } };
}

interface ProcurementWorkbenchRouteOptions {
  opportunities?: OpportunityV2[];
  sources?: OpportunityV2Source[];
  now?: Date;
}

function escapeHtml(value: unknown): string { return String(value ?? "").replace(/[&<>"']/gu, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] ?? char)); }
function secureFollowupHtml(html: string, opportunityId: string, authenticated: boolean): string {
  if (!authenticated) return html.replace(/<h2>保存私有跟进<\/h2>[\s\S]*?<\/script>/u, "<section class=\"pw-private-followup\"><h2>私有跟进</h2><p>当前环境尚未接入服务端登录身份，私有跟进暂不可用。公开页面不会接受自填用户标识，也不会显示他人的备注。</p></section>");
  const id = escapeHtml(opportunityId);
  const form = `<section class="pw-private-followup"><h2>私有跟进</h2><form id="followup-form"><label>状态 <select name="status"><option>new</option><option>reviewing</option><option>preparing</option><option>submitted</option><option>ignored</option><option>won</option><option>lost</option></select></label><label>备注 <textarea name="note" maxlength="4000"></textarea></label><label>下次跟进 <input type="date" name="next_followup_at"></label><button>保存跟进</button><span id="followup-result" role="status"></span></form><script>(()=>{const id=${JSON.stringify(id)},form=document.getElementById('followup-form'),result=document.getElementById('followup-result');fetch('/api/opportunity-v2/workbench/followups/'+encodeURIComponent(id)).then(r=>r.ok?r.json():null).then(d=>{const x=d&&d.followup;if(!x)return;form.elements.status.value=x.status;form.elements.note.value=x.note;form.elements.next_followup_at.value=x.next_followup_at||''}).catch(()=>{});form.addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(form),r=await fetch('/api/opportunity-v2/workbench/followups',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({opportunity_id:id,status:f.get('status'),note:f.get('note'),next_followup_at:f.get('next_followup_at')||null})});result.textContent=r.ok?'已保存':r.status===401?'登录状态已失效，请重新登录':'保存失败'});})();</script></section>`;
  return html.replace(/<h2>保存私有跟进<\/h2>[\s\S]*?<\/script>/u, form);
}
function pageStyle(): string { return ".pw-wrap{max-width:1120px;margin:0 auto;padding:32px 22px;color:#2d2925;background:#f5f0e7;font-family:Georgia,\"Songti SC\",serif}.pw-hero{display:grid;grid-template-columns:auto 1fr auto;gap:24px;align-items:center;border-bottom:1px solid #b9aa98;padding-bottom:28px}.pw-hero img{width:auto;height:42px;object-fit:contain}.pw-kicker{color:#8d4f35;letter-spacing:.08em}.pw-hero h1{margin:4px 0;font-size:clamp(30px,5vw,54px);font-weight:500}.pw-hero p{color:#6c625a}.pw-export{color:#173f5f}.pw-filter{display:flex;gap:10px;margin:22px 0;flex-wrap:wrap}.pw-filter input,.pw-filter select,.pw-filter button,.pw-detail input,.pw-detail select,.pw-detail textarea,.pw-detail button{padding:11px;border:1px solid #b9aa98;background:#fffdf7}.pw-section{margin:30px 0}.pw-section>div{display:flex;gap:18px;align-items:baseline;border-bottom:1px solid #d5c9b9}.pw-hint,.pw-empty{color:#746b62}.pw-card{padding:18px 0;border-bottom:1px solid #d5c9b9}.pw-card h2{margin:8px 0;font-size:24px;overflow-wrap:anywhere}.pw-card a,.pw-detail a{color:#173f5f;overflow-wrap:anywhere;word-break:break-word}.pw-card p,.pw-detail p{max-width:800px;line-height:1.6;overflow-wrap:anywhere}.pw-meta{display:flex;flex-wrap:wrap;gap:18px;color:#6c625a;font-size:14px}.pw-lane{color:#8d4f35;font-size:13px;letter-spacing:.06em}.pw-next{color:#385b4a}.pw-detail{border-top:1px solid #b9aa98;padding-top:22px}.pw-detail h1{font-size:clamp(30px,5vw,54px);font-weight:500;overflow-wrap:anywhere}.pw-detail-list{display:grid;grid-template-columns:150px 1fr;gap:0;border-top:1px solid #d5c9b9}.pw-detail-list dt,.pw-detail-list dd{margin:0;padding:12px 0;border-bottom:1px solid #d5c9b9;overflow-wrap:anywhere}.pw-detail-list dt{color:#8d4f35}.pw-detail form{display:grid;gap:10px;max-width:560px}.pw-detail label{display:grid;gap:5px}.pw-detail textarea{min-height:100px}.pw-detail button{width:max-content}.pw-detail [role=status]{margin-left:10px}@media(max-width:680px){.pw-wrap{padding:20px 14px}.pw-hero{grid-template-columns:1fr;gap:12px}.pw-hero img{height:32px}.pw-meta{display:grid;gap:5px}.pw-detail-list{grid-template-columns:1fr}.pw-detail-list dt{border-bottom:0;padding-bottom:3px}.pw-detail-list dd{padding-top:0}}"; }
const COVERAGE_TYPE_LABELS: Record<string, string> = { grant_funding: "资助扶持", exhibition_showcase: "展览展示", market_channel: "展销渠道", residency_learning: "驻留研修", partnership_commission: "合作委托", recognition_incubation: "认定孵化" };

function coverageItems(options: ProcurementWorkbenchRouteOptions, query: OpportunityCoverageQuery = {}): OpportunityCoverageAssessment[] {
  const opportunities = options.opportunities ?? readOpportunityV2Pool().opportunities;
  const sources = options.sources ?? readOpportunityV2Sources();
  const activeSourceIds = new Set(sources.filter((source) => source.enabled && isOpportunityV2SourceCollectionAllowed(source.id) && !["PAUSED", "NEEDS_ADAPTER"].includes(source.status)).map((source) => source.id));
  return filterOpportunityCoverage(opportunities.filter((item) => activeSourceIds.has(item.source_id) && isOpportunityV2PublicCopyAllowed(item) && isOpportunityV2PublicTitleSafe(item)), query, { now: options.now });
}

export interface WeeklyOpportunityAction {
  opportunity_id: string;
  alias_ids: string[];
  display_group_id: string | null;
  title: string;
  original_title: string | null;
  title_translation_status: "translated" | "failed" | "pending" | "not_needed";
  summary: string;
  source_name: string;
  discovered_by_source_names: string[];
  type_labels: string[];
  lane: "current" | "early" | "review";
  deadline: string | null;
  deadline_text: string;
  application_url: string | null;
  evidence_url: string;
  evidence_label: string;
  evidence_grade: "A" | "B" | "C" | "UNAVAILABLE";
  evidence_grade_text: string;
  evidence_state: "OFFICIAL_LINK_PRESENT" | "DISCOVERY_ONLY" | "UNAVAILABLE";
  evidence_state_text: string;
  evidence_excerpt: string;
  last_seen_at: string;
  source_last_fetch_at: string | null;
  freshness: "FRESH" | "STALE" | "NEVER_SUCCEEDED";
  eligibility_summary: string;
  risk_flags: string[];
  money_fact: { kind: "prize" | "grant" | "procurement_budget"; amount: number; currency: string | null; label: string; evidence_excerpt: string } | null;
  match_reason: string;
  first_check: string;
  next_action: string;
  discovered_by_sources: string[];
}

function safePublicHttpUrl(value: string | null | undefined): string | null {
  try {
    const url = new URL(value ?? "");
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch { return null; }
}

function weeklyMoneyFact(item: OpportunityV2): WeeklyOpportunityAction["money_fact"] {
  if (item.category === "procurement_project") {
    const amount = item.procurement?.budget_amount ?? null;
    const currency = item.procurement?.budget_currency ?? null;
    return amount === null ? null : { kind: "procurement_budget", amount, currency, label: `结构化采购预算：${amount}${currency ? ` ${currency}` : ""}`, evidence_excerpt: `${amount}${currency ? ` ${currency}` : ""}` };
  }
  const body = `${item.title} ${item.summary}`;
  const currencyAmount = String.raw`(?:£|€|\$|¥|￥)\s?\d[\d,.]*|\b\d[\d,.]*\s?(?:USD|EUR|GBP|CNY|RMB)\b`;
  const makeFact = (kind: "prize" | "grant", pattern: RegExp, label: string): WeeklyOpportunityAction["money_fact"] => {
    const match = body.match(pattern);
    const amountText = match?.[1] ?? match?.[2];
    if (!amountText) return null;
    const currency = amountText.match(/^(£|€|\$|¥|￥)/u)?.[1] ?? amountText.match(/\b(USD|EUR|GBP|CNY|RMB)\b/iu)?.[1]?.toUpperCase() ?? null;
    const numeric = Number(amountText.replace(/[^\d.]/gu, ""));
    if (!Number.isFinite(numeric)) return null;
    return { kind, amount: numeric, currency, label: `${label}：${amountText}`, evidence_excerpt: match?.[0] ?? amountText };
  };
  if (item.category === "competition") return makeFact("prize", new RegExp(String.raw`(?:prize|award|奖金|奖项|奖励)[^\n。；;]{0,48}(${currencyAmount})|(${currencyAmount})[^\n。；;]{0,48}(?:prize|award|奖金|奖项|奖励)`, "iu"), "来源原文提及奖项金额");
  if (item.category === "policy_funding") return makeFact("grant", new RegExp(String.raw`(?:grant|funding|资助|扶持|基金)[^\n。；;]{0,48}(${currencyAmount})|(${currencyAmount})[^\n。；;]{0,48}(?:grant|funding|资助|扶持|基金)`, "iu"), "来源原文提及资助金额");
  return null;
}

function weeklyEligibilitySummary(item: OpportunityV2): string {
  const scope = item.participation_scope;
  if (scope === "nationwide") return "来源标记为全国范围；申请资格仍需查看原文";
  if (scope === "global") return "来源标记为全球范围；申请资格仍需查看原文";
  if (scope === "regional") return "来源标记为地区性范围；具体地区及资格需查看原文";
  if (item.category === "procurement_project") return "供应商资格未由通用列表推断；请核对招标资格条款";
  return "适用范围尚未结构化；请核对主办方资格条款";
}

function weeklyFreshness(lastFetchAt: string | null, now: Date): "FRESH" | "STALE" | "NEVER_SUCCEEDED" {
  if (!lastFetchAt) return "NEVER_SUCCEEDED";
  const seen = Date.parse(lastFetchAt);
  return Number.isFinite(seen) && seen <= now.getTime() && now.getTime() - seen <= 78 * 60 * 60 * 1000 ? "FRESH" : "STALE";
}

function weeklyDomainPriority(item: OpportunityV2, labels: string[]): number {
  const value = `${item.title} ${item.summary} ${item.tags.join(" ")}`;
  const strongDomain = (item.directions ?? []).some((direction) => ["ich_innovation", "cultural_creative", "craft_arts", "museum_tourism", "integrated_cultural_design"].includes(direction))
    || (item.work_formats ?? []).some((format) => ["material_craft", "product_design", "mixed_media"].includes(format))
    || /非遗|手工艺|工艺美术|传统工艺|文创|文化采购|cultural heritage|intangible cultural|traditional craft|craft arts/iu.test(value);
  if (labels.includes("采购 / 订单")) return 0;
  if (!labels.includes("赛事 / 征集")) return strongDomain ? 0 : 1;
  if (strongDomain) return 2;
  if (/(?:logo|logotype|visual identity|brand identity|吉祥物|品牌形象|标识设计)/iu.test(value)) return 5;
  return 4;
}

function isWeeklyCompetition(action: WeeklyOpportunityAction): boolean {
  return action.type_labels.includes("赛事 / 征集");
}

function isWeeklyHardBlockedNotice(item: OpportunityV2): boolean {
  const value = `${item.title} ${item.summary}`;
  if (/(?:cancelled|canceled|withdrawn|已取消|已撤销|征集终止)/iu.test(value)) return true;
  const resultOnly = /(?:winners? (?:announced|released)|results? (?:announced|released|published)|awardees|selected list|shortlist|finalists? announced|获奖名单|结果公示|名单公示|获奖结果|评审结果|入选名单)/iu.test(value);
  const activeCall = /(?:open call|call for entries|applications? (?:are )?open|submit|submission|deadline|apply now|报名|申请|征集|征稿|截稿|提交作品|开放申请)/iu.test(value);
  return resultOnly && !activeCall;
}

/** Deterministic public shortlist; no private profile, fit score, or model call is applied. */
export function buildWeeklyOpportunityActions(options: ProcurementWorkbenchRouteOptions = {}, limit = 10): WeeklyOpportunityAction[] {
  const now = options.now ?? new Date();
  const pool = options.opportunities ?? readOpportunityV2Pool().opportunities;
  const sources = options.sources ?? readOpportunityV2Sources();
  const publicItems = pool.filter((item) => isOpportunityV2PublicCopyAllowed(item) && isOpportunityV2PublicTitleSafe(item));
  const activeSourceIds = new Set(sources.filter((source) => source.enabled && isOpportunityV2SourceCollectionAllowed(source.id) && !["PAUSED", "NEEDS_ADAPTER"].includes(source.status)).map((source) => source.id));
  const activePublicItems = publicItems.filter((item) => activeSourceIds.has(item.source_id));
  const candidates = new Map<string, { item: OpportunityV2; lane: "current" | "early" | "review"; types: string[]; whyRelevant: string; firstCheck: string; nextAction: string }>();
  const currentCompetitions = filterOpportunityV2Radar(activePublicItems, sources, { now, status: "current" }).filter((item) => item.category === "competition" && item.deadline_conflict_unsafe !== true && !isWeeklyHardBlockedNotice(item));
  const longTermCompetitions = filterOpportunityV2Radar(activePublicItems, sources, { now, status: "long_term" }).filter((item) => item.category === "competition" && !isWeeklyHardBlockedNotice(item));
  for (const item of currentCompetitions) candidates.set(item.id, { item, lane: "current", types: ["赛事 / 征集"], whyRelevant: "来源记录为当前赛事/征集；具体资格与报名条件以原文为准", firstCheck: "核对主办方资格、提交材料与作品要求", nextAction: "打开主办方申请条款，确认申请资格和提交入口" });
  for (const item of longTermCompetitions) {
    const unsafe = item.deadline_conflict_unsafe === true;
    candidates.set(item.id, {
      item,
      lane: unsafe ? "review" : "early",
      types: ["赛事 / 征集"],
      whyRelevant: "来源记录为长期赛事/征集；需确认本期仍开放及具体条款",
      firstCheck: unsafe ? "截止日期存在冲突，先核对来源原文；不按精确日期安排" : "确认长期征集的本期规则与仍开放的提交入口",
      nextAction: unsafe ? "对照日期证据及主办方更正，再决定是否跟进" : "查看主办方当前申报说明，再按自身计划安排",
    });
  }
  for (const assessment of coverageItems(options)) {
    if (assessment.lane !== "current" && assessment.lane !== "early") continue;
    const item = assessment.opportunity;
    const unsafe = item.deadline_conflict_unsafe === true;
    candidates.set(item.id, { item, lane: unsafe ? "review" : assessment.lane, types: assessment.view_types.map((type) => COVERAGE_TYPE_LABELS[type] ?? type), whyRelevant: assessment.fit_basis.join("；") || "符合公开机会线索分类，仍需核对来源原文", firstCheck: unsafe ? "截止日期存在冲突，先核对来源原文；不按精确日期安排" : assessment.qualification_gaps[0] ?? "资格、费用与附件尚待核验", nextAction: unsafe ? "对照日期证据及主办方更正，再决定是否跟进" : assessment.next_action });
  }
  // Procurement projects are intentionally excluded from the broad coverage
  // taxonomy. Include only buyer-side, domain-tagged opportunities here, and
  // assess them without a personal business profile or fit score.
  const procurementActions = activePublicItems.filter((item) => item.category === "procurement_project"
    && !item.encoding_error
    && item.procurement?.direction !== "seller_offer"
    && !["awarded", "closed", "cancelled"].includes(item.procurement?.stage ?? "")
    && isPublicProcurementText(`${item.title} ${item.summary}`, item.procurement, item.deadline, now)
    && hasProcurementDomainTag(item.tags)
    && isCraftRelevantProcurement(`${item.title} ${item.summary}`));
  for (const item of procurementActions) {
    const assessment = assessOpportunityCoverage(item, { now });
    if (assessment.lane !== "current" && assessment.lane !== "early") continue;
    const unsafe = item.deadline_conflict_unsafe === true;
    candidates.set(item.id, {
      item,
      lane: unsafe ? "review" : assessment.lane,
      types: ["采购 / 订单"],
      whyRelevant: "买方侧公告通过文创/非遗领域正文核验；未使用个人画像或匹配评分",
      firstCheck: unsafe ? "截止日期存在冲突，先核对来源原文；不按精确日期安排" : "核对采购方向、资格、响应材料与买方信息",
      nextAction: unsafe ? "对照日期证据及采购方更正，再决定是否跟进" : assessment.next_action,
    });
  }
  const grouped = buildCanonicalOpportunityDisplayGroups(publicItems);
  const cards = grouped.cards.filter((item) => candidates.has(item.id));
  const translations = readOpportunityV2Translations();
  const result = cards.map((item) => {
    const candidate = candidates.get(item.id)!;
    const deadline = publicOpportunityV2Deadline(item);
    const display = buildOpportunityV2Display(item, translations);
    const officialUrl = safePublicHttpUrl(item.official_url);
    const detailUrl = safePublicHttpUrl(item.detail_url);
    const sourceUrl = safePublicHttpUrl(item.source_url);
    const evidenceUrl = officialUrl ?? detailUrl ?? sourceUrl ?? "";
    const evidenceGrade: WeeklyOpportunityAction["evidence_grade"] = officialUrl ? "A" : detailUrl ? "B" : sourceUrl ? "C" : "UNAVAILABLE";
    const evidenceGradeText = evidenceGrade === "A" ? "主办方 / 官方公告" : evidenceGrade === "B" ? "机会详情页" : evidenceGrade === "C" ? "来源目录页" : "来源链接缺失";
    const evidenceState: WeeklyOpportunityAction["evidence_state"] = officialUrl ? "OFFICIAL_LINK_PRESENT" : detailUrl || sourceUrl ? "DISCOVERY_ONLY" : "UNAVAILABLE";
    const sourceLastFetchAt = sources.find((source) => source.id === item.source_id)?.last_fetch_at ?? null;
    const sourceNames = publicOpportunityV2DiscoverySources(item.discovered_by_sources)
      .map((id) => sources.find((source) => source.id === id)?.name)
      .filter((name): name is string => Boolean(name));
    const riskFlags: string[] = [];
    if (deadline.unsafe) riskFlags.push("截止日期存在冲突；先查看日期证据，不按精确日期决策");
    else if (!deadline.deadline && !item.is_long_term) riskFlags.push("截止日期尚未确认");
    if (!officialUrl) riskFlags.push("仅有发现来源链接；官方条件待核");
    if (item.category !== "procurement_project" && (!item.participation_scope || item.participation_scope === "unspecified")) riskFlags.push("适用范围尚未结构化");
    if (!item.application_url && !item.detail_url) riskFlags.push("报名或行动入口尚未结构化");
    return {
      opportunity_id: item.id,
      alias_ids: item.canonical_alias_ids ?? [],
      display_group_id: item.canonical_display_group_id ?? null,
      title: display.title,
      original_title: display.original_title,
      title_translation_status: display.translation_status,
      summary: display.summary,
      source_name: item.source_name,
      discovered_by_source_names: [...new Set(sourceNames)],
      type_labels: candidate.types.length ? candidate.types : ["待确认"],
      lane: candidate.lane,
      deadline: deadline.deadline,
      deadline_text: item.is_long_term && !deadline.unsafe ? "长期征集（仍需确认本期开放）" : deadline.deadline_text ?? "截止时间待确认",
      application_url: safePublicHttpUrl(item.application_url),
      evidence_url: evidenceUrl,
      evidence_label: evidenceGrade === "A" ? "主办方 / 官方公告" : evidenceGrade === "B" ? "机会详情页（官方条件待核）" : evidenceGrade === "C" ? "来源目录页（官方条件待核）" : "来源链接不可用",
      evidence_grade: evidenceGrade,
      evidence_grade_text: evidenceGradeText,
      evidence_state: evidenceState,
      evidence_state_text: evidenceState === "OFFICIAL_LINK_PRESENT" ? "已记录主办方/官方链接（仍应核验当前条款）" : evidenceState === "DISCOVERY_ONLY" ? "仅有发现来源链接；官方条件待核" : "没有可用来源链接",
      evidence_excerpt: display.summary || cleanOpportunityDisplayText(item.title).slice(0, 240),
      last_seen_at: item.last_seen_at,
      source_last_fetch_at: sourceLastFetchAt,
      freshness: weeklyFreshness(sourceLastFetchAt, now),
      eligibility_summary: weeklyEligibilitySummary(item),
      risk_flags: riskFlags,
      money_fact: weeklyMoneyFact(item),
      match_reason: candidate.whyRelevant,
      first_check: candidate.firstCheck,
      next_action: candidate.nextAction,
      discovered_by_sources: publicOpportunityV2DiscoverySources(item.discovered_by_sources),
    } satisfies WeeklyOpportunityAction;
  });
  const laneOrder = { current: 0, early: 1, review: 2 };
  result.sort((a, b) => laneOrder[a.lane] - laneOrder[b.lane]
    || weeklyDomainPriority(candidates.get(a.opportunity_id)!.item, a.type_labels) - weeklyDomainPriority(candidates.get(b.opportunity_id)!.item, b.type_labels)
    || ({ A: 0, B: 1, C: 2, UNAVAILABLE: 3 }[a.evidence_grade] - { A: 0, B: 1, C: 2, UNAVAILABLE: 3 }[b.evidence_grade])
    || (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999")
    || a.opportunity_id.localeCompare(b.opportunity_id));
  const maxItems = Math.max(0, Math.min(10, Math.floor(limit)));
  const hasHighQualityNonContest = result.some((action) => !isWeeklyCompetition(action) && action.lane === "current" && (action.evidence_grade === "A" || action.evidence_grade === "B"));
  if (!hasHighQualityNonContest) return result.slice(0, maxItems);
  const selected: WeeklyOpportunityAction[] = [];
  let competitions = 0;
  for (const action of result) {
    if (isWeeklyCompetition(action) && competitions >= 6) continue;
    if (isWeeklyCompetition(action)) competitions += 1;
    selected.push(action);
    if (selected.length >= maxItems) break;
  }
  return selected;
}

export function weeklyOpportunityActionsContent(options: ProcurementWorkbenchRouteOptions = {}): string {
  const actions = buildWeeklyOpportunityActions(options, 10);
  const dateText = (value: string): string => {
    const date = new Date(value);
    return Number.isFinite(date.getTime())
      ? new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "long", day: "numeric" }).format(date)
      : "时间未知";
  };
  const cards = actions.map((action) => {
    const detail = `/ich/opportunities/${encodeURIComponent(action.opportunity_id)}`;
    const evidence = safePublicHttpUrl(action.evidence_url);
    const application = safePublicHttpUrl(action.application_url);
    const original = action.original_title ? `<details><summary>查看原文标题</summary><p>${escapeHtml(action.original_title)}</p></details>` : "";
    const summary = action.summary ? `<p class="weekly-summary">${escapeHtml(action.summary)}</p>` : "";
    const sources = action.discovered_by_source_names.length ? `；共同发现：${escapeHtml(action.discovered_by_source_names.join("、"))}` : "";
    const freshness = action.freshness === "FRESH" ? "78小时内" : action.freshness === "STALE" ? "超过78小时，待刷新" : "暂无成功抓取记录";
    const sourceFetchedAt = action.source_last_fetch_at ? dateText(action.source_last_fetch_at) : "无成功抓取记录";
    const moneyFact = action.money_fact ? `<section><h3>${escapeHtml(action.money_fact.kind === "prize" ? "奖项金额" : action.money_fact.kind === "grant" ? "资助金额" : "采购预算")}</h3><p>${escapeHtml(action.money_fact.label)}；证据：${escapeHtml(action.money_fact.evidence_excerpt)}</p></section>` : "";
    return `<article class="weekly-card"><div class="weekly-heading"><span class="ich-category">${escapeHtml(action.lane === "current" ? "当前可行动" : action.lane === "early" ? "提前关注" : "待核验")} · ${escapeHtml(action.type_labels.join("、"))}</span><span class="weekly-title-status">${escapeHtml(action.title_translation_status === "translated" ? "中文标题" : action.title_translation_status === "failed" ? "翻译失败 · 暂显原文" : action.title_translation_status === "pending" ? "中文待补 · 暂显原文" : "中文标题")}</span></div><h2><a href="${detail}">${escapeHtml(action.title)}</a></h2>${original}${summary}<p><strong>为什么值得看：</strong>${escapeHtml(action.match_reason)}</p><div class="ich-card-meta"><span>来源：${escapeHtml(action.source_name)}${sources}</span><span>截止：${escapeHtml(action.deadline_text)}</span><span>来源最近抓取：${escapeHtml(sourceFetchedAt)} · ${freshness}</span></div><section><h3>适用资格</h3><p>${escapeHtml(action.eligibility_summary)}</p></section>${moneyFact}<section><h3>来源证据 · ${escapeHtml(action.evidence_grade)}级 · ${escapeHtml(action.evidence_grade_text)} · ${escapeHtml(action.evidence_state_text)}</h3><p>${escapeHtml(action.evidence_excerpt)}</p><p>${evidence ? `<a rel="nofollow noopener" href="${escapeHtml(evidence)}">查看来源原文</a>` : "来源链接不可用"}${application ? ` · <a rel="nofollow noopener" href="${escapeHtml(application)}">申请 / 响应入口</a>` : ""}</p></section><section class="weekly-risks"><h3>风险与待核</h3>${action.risk_flags.length ? `<ul>${action.risk_flags.map((risk) => `<li>${escapeHtml(risk)}</li>`).join("")}</ul>` : "<p>当前结构化字段未发现额外提示；申请前仍应复核原文。</p>"}</section><p><strong>先核对：</strong>${escapeHtml(action.first_check)}</p><p class="ich-next"><strong>下一步：</strong>${escapeHtml(action.next_action)}</p></article>`;
  }).join("");
  return `<main class="ich-weekly"><section class="ich-hero"><div class="ich-hero-copy"><p class="ich-kicker">盯非遗 · 每周行动清单</p><h1>本周值得看</h1><p>按当前开放与可行动线索整理，最多10条；每条都保留来源证据、待核风险与下一步。没有足够证据时明确标注，不补造资格、金额或状态。</p><div class="ich-meta"><span>本周行动：${actions.length} 条</span><span>未满10条时不补位</span></div></div></section>${cards || `<section class="ich-notice"><h2>本周暂无可行动线索</h2><p>不会以过期赛事、结果公示或来源待适配内容补足数量。</p></section>`}</main>`;
}

export function coverageWorkbenchPage(options: ProcurementWorkbenchRouteOptions = {}, rawQuery: Record<string, string> = {}): string {
  const viewTypes = ["grant_funding", "exhibition_showcase", "market_channel", "residency_learning", "partnership_commission", "recognition_incubation"] as const;
  const query: OpportunityCoverageQuery = {
    ...(rawQuery.q ? { q: rawQuery.q } : {}),
    ...(viewTypes.includes(rawQuery.view_type as typeof viewTypes[number]) ? { view_type: rawQuery.view_type as typeof viewTypes[number] } : {}),
    ...(rawQuery.lane && ["current", "early", "review", "research"].includes(rawQuery.lane) ? { lane: rawQuery.lane as OpportunityCoverageQuery["lane"] } : {}),
    ...(rawQuery.region === "CN" || rawQuery.region === "GLOBAL" ? { region: rawQuery.region } : {}),
  };
  const items = coverageItems(options, query);
  const weeklyActions = buildWeeklyOpportunityActions(options);
  const exportQuery = new URLSearchParams({ ...(query.q ? { q: query.q } : {}), ...(query.view_type ? { view_type: query.view_type } : {}), ...(query.lane ? { lane: query.lane } : {}), ...(query.region ? { region: query.region } : {}), format: "markdown" }).toString();
  const filters = `<form class="pw-filter" method="get"><input name="q" value="${escapeHtml(query.q ?? "")}" placeholder="搜索机会、关键词或来源"><select name="view_type"><option value="">全部类型</option>${viewTypes.map((type) => `<option value="${type}" ${query.view_type === type ? "selected" : ""}>${COVERAGE_TYPE_LABELS[type]}</option>`).join("")}</select><select name="lane"><option value="">全部分区</option><option value="current" ${query.lane === "current" ? "selected" : ""}>当前可行动</option><option value="early" ${query.lane === "early" ? "selected" : ""}>提前关注</option><option value="review" ${query.lane === "review" ? "selected" : ""}>待复核</option><option value="research" ${query.lane === "research" ? "selected" : ""}>研究参考</option></select><select name="region"><option value="">全部地区</option><option value="CN" ${query.region === "CN" ? "selected" : ""}>国内</option><option value="GLOBAL" ${query.region === "GLOBAL" ? "selected" : ""}>海外</option></select><button>筛选</button><a class="pw-export" href="/api/opportunity-v2/workbench/coverage/export?${exportQuery}">导出 Markdown</a></form>`;
  const section = (lane: "current" | "early" | "review" | "research", heading: string, hint: string) => {
    const rows = items.filter((item) => item.lane === lane).slice(0, 30).map((assessment) => {
      const publicAssessment = publicOpportunityCoverageAssessment(assessment);
      const item = publicAssessment.opportunity;
      const types = assessment.view_types.map((type) => COVERAGE_TYPE_LABELS[type] ?? type).join("、") || "待复核";
      return `<article class="pw-card"><span class="pw-lane">${escapeHtml(types)} · ${escapeHtml(assessment.money_flow)}</span><h2><a href="/ich/opportunities/${encodeURIComponent(assessment.opportunity_id)}">${escapeHtml(String(item.title ?? ""))}</a></h2><p>${escapeHtml(String(item.summary ?? "来源正文未审核复用；请打开原文查看"))}</p><div class="pw-meta"><span>地区：${escapeHtml(String(item.event_location || item.region || "待确认"))}</span><span>截止：${escapeHtml(assessment.deadline_text || assessment.deadline || "待确认")}</span><span>来源：${escapeHtml(String(item.source_name || "待确认"))}</span></div><p class="pw-next">下一步：${escapeHtml(assessment.next_action)}</p></article>`;
    }).join("");
    return `<section class="pw-section"><div><p class="pw-kicker">${heading}</p><p class="pw-hint">${hint}</p></div>${rows || `<p class="pw-empty">当前没有可展示记录。</p>`}</section>`;
  };
  const weekly = weeklyActions.map((action) => `<article class="pw-card"><span class="pw-lane">${escapeHtml(action.lane === "current" ? "当前" : action.lane === "early" ? "提前关注" : "待核冲突")} · ${escapeHtml(action.type_labels.join("、"))}</span><h2><a href="/ich/opportunities/${encodeURIComponent(action.opportunity_id)}">${escapeHtml(action.title)}</a></h2><div class="pw-meta"><span>来源：${escapeHtml(action.source_name)}</span><span>截止：${escapeHtml(action.deadline_text)}</span>${action.alias_ids.length ? `<span>同届归组：另有 ${action.alias_ids.length} 个来源记录保留</span>` : ""}</div><p>${escapeHtml(action.match_reason)}；优先核验：${escapeHtml(action.first_check)}</p><p class="pw-next">下一步：${escapeHtml(action.next_action)}</p></article>`).join("");
  const weeklySection = `<section class="pw-section" id="weekly-actions"><div><p class="pw-kicker">本周值得先看</p><p class="pw-hint">确定性规则排序，最多10条；不使用私人企业画像或机会评分，数量不足时不补位。</p></div>${weekly || `<p class="pw-empty">当前没有满足条件的公开行动项；不以研究或已过期内容补数。</p>`}</section>`;
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>综合机会工作台｜盯非遗</title><style>${pageStyle()}</style></head><body><main class="pw-wrap"><header class="pw-hero"><a href="/ich"><img src="/assets/dingfeiyi-logo.png" alt="盯非遗"></a><div><p class="pw-kicker">盯非遗 · 综合机会</p><h1>综合机会工作台</h1><p>把资助、展览、渠道、研修、合作与认定放在同一条可核验的工作流里；类型和行动分区分开记录。</p></div><a class="pw-export" href="/ich/procurement">采购工作台</a></header>${weeklySection}${filters}<p class="pw-hint">当前 ${items.length} 条旁路机会评估；赛事和采购原始记录保持原身份，信息不足的记录进入待复核。</p>${section("current", "当前可行动", "已有来源行动入口，先回到原文核验资格、材料、费用和截止日期。")}${section("early", "提前关注", "已有方向但仍需等待正式指南或开放时间。")}${section("review", "待复核", "来源有机会线索，但类型或行动证据尚不充分。")}${section("research", "研究参考", "结果、历史或不适合直接跟进的记录，不写成当前开放机会。")}</main></body></html>`;
}

function coverageWorkbenchDetailPageRaw(options: ProcurementWorkbenchRouteOptions = {}, opportunityId: string): string {
  const assessment = coverageItems(options).find((item) => item.opportunity_id === opportunityId);
  if (!assessment) return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>综合机会不存在</title><body><main class="pw-wrap"><h1>综合机会不存在</h1><p><a href="/ich/opportunities">返回综合机会工作台</a></p></main></body></html>`;
  const publicAssessment = publicOpportunityCoverageAssessment(assessment);
  const item = publicAssessment.opportunity;
  const types = assessment.view_types.map((type) => COVERAGE_TYPE_LABELS[type] ?? type).join("、") || "待复核";
  const source = String(item.detail_url || item.source_url || "");
  const evidence = (publicAssessment.evidence as OpportunityCoverageAssessment["evidence"]).map((row) => `<li>${escapeHtml(row.field)}${row.raw_excerpt ? `：${escapeHtml(row.raw_excerpt)}` : "（正文摘录未公开）"} · <a rel="nofollow noopener" href="${escapeHtml(row.source_url)}">来源</a></li>`).join("");
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(String(item.title ?? ""))}｜综合机会｜盯非遗</title><style>${pageStyle()}</style></head><body><main class="pw-wrap"><p><a href="/ich/opportunities">← 返回综合机会工作台</a></p><article class="pw-detail"><p class="pw-kicker">${escapeHtml(types)} · ${escapeHtml(assessment.lane)}</p><h1>${escapeHtml(String(item.title ?? ""))}</h1><p>${escapeHtml(String(item.summary ?? "来源正文未审核复用；请打开原文查看"))}</p><dl class="pw-detail-list"><dt>类型</dt><dd>${escapeHtml(types)}</dd><dt>地区</dt><dd>${escapeHtml(String(item.event_location || item.region || "待确认"))}</dd><dt>截止</dt><dd>${escapeHtml(publicAssessment.deadline_text || publicAssessment.deadline || "待确认")}</dd><dt>钱的方向</dt><dd>${escapeHtml(assessment.money_flow)}${assessment.fees.length ? `；费用：${escapeHtml(assessment.fees.join("；"))}` : ""}${assessment.funding.length ? `；资助：${escapeHtml(assessment.funding.join("；"))}` : ""}</dd><dt>资格状态</dt><dd>${escapeHtml(assessment.eligibility_status)}；${escapeHtml(assessment.qualification_gaps.join("、") || "待核验")}</dd><dt>来源</dt><dd>${escapeHtml(String(item.source_name || "待确认"))}</dd></dl><h2>证据与待核验项</h2><ul>${evidence || "<li>来源正文证据待补齐</li>"}</ul><p><strong>下一步：</strong>${escapeHtml(assessment.next_action)}</p><p><a rel="nofollow noopener" href="${escapeHtml(source)}">打开来源原文</a></p><h2>保存私有跟进</h2><p>继续使用已有授权工作台 API 保存，不在公共机会卡片中展示备注。</p><form id="followup-form"><label>用户标识 <input name="owner" required autocomplete="username"></label><label>状态 <select name="status"><option>new</option><option>reviewing</option><option>preparing</option><option>submitted</option><option>ignored</option><option>won</option><option>lost</option></select></label><label>备注 <textarea name="note" maxlength="4000"></textarea></label><label>下次跟进 <input type="date" name="next_followup_at"></label><button>保存跟进</button><span id="followup-result" role="status"></span></form><script>document.getElementById('followup-form').addEventListener('submit',async(e)=>{e.preventDefault();const f=new FormData(e.currentTarget),owner=String(f.get('owner')||'').trim();const r=await fetch('/api/opportunity-v2/workbench/followups',{method:'POST',headers:{'content-type':'application/json','x-business-user':owner},body:JSON.stringify({opportunity_id:${JSON.stringify(opportunityId)},status:f.get('status'),note:f.get('note'),next_followup_at:f.get('next_followup_at')||null})});document.getElementById('followup-result').textContent=r.ok?'已保存':'保存失败，请检查授权';});</script></article></main></body></html>`;
}

export function coverageWorkbenchDetailPage(options: ProcurementWorkbenchRouteOptions = {}, opportunityId: string, authenticated = false): string {
  return secureFollowupHtml(coverageWorkbenchDetailPageRaw(options, opportunityId), opportunityId, authenticated);
}
