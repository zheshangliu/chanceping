import { hasProcurementDomainTag, isCraftRelevantProcurement } from "./procurement";
import { opportunityV2LiveStatus } from "./radar-view";
import { publicOpportunityV2Deadline } from "./public-deadline";
import { readOpportunityV2Pool } from "./opportunity-pool";
import { readOpportunityV2Sources } from "./source-pool";
import { filterOpportunityCoverage, publicOpportunityCoverageAssessment, type OpportunityCoverageAssessment, type OpportunityCoverageQuery } from "./opportunity-coverage";
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

interface ProcurementWorkbenchRouteOptions {
  opportunities?: OpportunityV2[];
  sources?: OpportunityV2Source[];
  now?: Date;
}

function escapeHtml(value: unknown): string { return String(value ?? "").replace(/[&<>"']/gu, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] ?? char)); }
function pageStyle(): string { return ".pw-wrap{max-width:1120px;margin:0 auto;padding:32px 22px;color:#2d2925;background:#f5f0e7;font-family:Georgia,\"Songti SC\",serif}.pw-hero{display:grid;grid-template-columns:auto 1fr auto;gap:24px;align-items:center;border-bottom:1px solid #b9aa98;padding-bottom:28px}.pw-hero img{width:auto;height:42px;object-fit:contain}.pw-kicker{color:#8d4f35;letter-spacing:.08em}.pw-hero h1{margin:4px 0;font-size:clamp(30px,5vw,54px);font-weight:500}.pw-hero p{color:#6c625a}.pw-export{color:#173f5f}.pw-filter{display:flex;gap:10px;margin:22px 0;flex-wrap:wrap}.pw-filter input,.pw-filter select,.pw-filter button,.pw-detail input,.pw-detail select,.pw-detail textarea,.pw-detail button{padding:11px;border:1px solid #b9aa98;background:#fffdf7}.pw-section{margin:30px 0}.pw-section>div{display:flex;gap:18px;align-items:baseline;border-bottom:1px solid #d5c9b9}.pw-hint,.pw-empty{color:#746b62}.pw-card{padding:18px 0;border-bottom:1px solid #d5c9b9}.pw-card h2{margin:8px 0;font-size:24px}.pw-card a,.pw-detail a{color:#173f5f}.pw-card p,.pw-detail p{max-width:800px;line-height:1.6}.pw-meta{display:flex;flex-wrap:wrap;gap:18px;color:#6c625a;font-size:14px}.pw-lane{color:#8d4f35;font-size:13px;letter-spacing:.06em}.pw-next{color:#385b4a}.pw-detail{border-top:1px solid #b9aa98;padding-top:22px}.pw-detail h1{font-size:clamp(30px,5vw,54px);font-weight:500}.pw-detail-list{display:grid;grid-template-columns:150px 1fr;gap:0;border-top:1px solid #d5c9b9}.pw-detail-list dt,.pw-detail-list dd{margin:0;padding:12px 0;border-bottom:1px solid #d5c9b9}.pw-detail-list dt{color:#8d4f35}.pw-detail form{display:grid;gap:10px;max-width:560px}.pw-detail label{display:grid;gap:5px}.pw-detail textarea{min-height:100px}.pw-detail button{width:max-content}.pw-detail [role=status]{margin-left:10px}@media(max-width:680px){.pw-wrap{padding:20px 14px}.pw-hero{grid-template-columns:1fr;gap:12px}.pw-hero img{height:32px}.pw-meta{display:grid;gap:5px}.pw-detail-list{grid-template-columns:1fr}.pw-detail-list dt{border-bottom:0;padding-bottom:3px}.pw-detail-list dd{padding-top:0}}"; }
const COVERAGE_TYPE_LABELS: Record<string, string> = { grant_funding: "资助扶持", exhibition_showcase: "展览展示", market_channel: "展销渠道", residency_learning: "驻留研修", partnership_commission: "合作委托", recognition_incubation: "认定孵化" };

function coverageItems(options: ProcurementWorkbenchRouteOptions, query: OpportunityCoverageQuery = {}): OpportunityCoverageAssessment[] {
  const opportunities = options.opportunities ?? readOpportunityV2Pool().opportunities;
  const sources = options.sources ?? readOpportunityV2Sources();
  const activeSourceIds = new Set(sources.filter((source) => source.enabled && !["PAUSED", "NEEDS_ADAPTER"].includes(source.status)).map((source) => source.id));
  return filterOpportunityCoverage(opportunities.filter((item) => activeSourceIds.has(item.source_id)), query, { now: options.now });
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
  const exportQuery = new URLSearchParams({ ...(query.q ? { q: query.q } : {}), ...(query.view_type ? { view_type: query.view_type } : {}), ...(query.lane ? { lane: query.lane } : {}), ...(query.region ? { region: query.region } : {}), format: "markdown" }).toString();
  const filters = `<form class="pw-filter" method="get"><input name="q" value="${escapeHtml(query.q ?? "")}" placeholder="搜索机会、关键词或来源"><select name="view_type"><option value="">全部类型</option>${viewTypes.map((type) => `<option value="${type}" ${query.view_type === type ? "selected" : ""}>${COVERAGE_TYPE_LABELS[type]}</option>`).join("")}</select><select name="lane"><option value="">全部分区</option><option value="current" ${query.lane === "current" ? "selected" : ""}>当前可行动</option><option value="early" ${query.lane === "early" ? "selected" : ""}>提前关注</option><option value="review" ${query.lane === "review" ? "selected" : ""}>待复核</option><option value="research" ${query.lane === "research" ? "selected" : ""}>研究参考</option></select><select name="region"><option value="">全部地区</option><option value="CN" ${query.region === "CN" ? "selected" : ""}>国内</option><option value="GLOBAL" ${query.region === "GLOBAL" ? "selected" : ""}>海外</option></select><button>筛选</button><a class="pw-export" href="/api/opportunity-v2/workbench/coverage/export?${exportQuery}">导出 Markdown</a></form>`;
  const section = (lane: "current" | "early" | "review" | "research", heading: string, hint: string) => {
    const rows = items.filter((item) => item.lane === lane).slice(0, 30).map((assessment) => {
      const publicAssessment = publicOpportunityCoverageAssessment(assessment);
      const item = publicAssessment.opportunity;
      const types = assessment.view_types.map((type) => COVERAGE_TYPE_LABELS[type] ?? type).join("、") || "待复核";
      return `<article class="pw-card"><span class="pw-lane">${escapeHtml(types)} · ${escapeHtml(assessment.money_flow)}</span><h2><a href="/ich/opportunities/${encodeURIComponent(assessment.opportunity_id)}">${escapeHtml(String(item.title ?? ""))}</a></h2><p>${escapeHtml(String(item.summary ?? "来源未提供摘要"))}</p><div class="pw-meta"><span>地区：${escapeHtml(String(item.event_location || item.region || "待确认"))}</span><span>截止：${escapeHtml(assessment.deadline_text || assessment.deadline || "待确认")}</span><span>来源：${escapeHtml(String(item.source_name || "待确认"))}</span></div><p class="pw-next">下一步：${escapeHtml(assessment.next_action)}</p></article>`;
    }).join("");
    return `<section class="pw-section"><div><p class="pw-kicker">${heading}</p><p class="pw-hint">${hint}</p></div>${rows || `<p class="pw-empty">当前没有可展示记录。</p>`}</section>`;
  };
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>综合机会工作台｜盯非遗</title><style>${pageStyle()}</style></head><body><main class="pw-wrap"><header class="pw-hero"><a href="/ich"><img src="/assets/dingfeiyi-logo.png" alt="盯非遗"></a><div><p class="pw-kicker">盯非遗 · 综合机会</p><h1>综合机会工作台</h1><p>把资助、展览、渠道、研修、合作与认定放在同一条可核验的工作流里；类型和行动分区分开记录。</p></div><a class="pw-export" href="/ich/procurement">采购工作台</a></header>${filters}<p class="pw-hint">当前 ${items.length} 条旁路机会评估；赛事和采购原始记录保持原身份，信息不足的记录进入待复核。</p>${section("current", "当前可行动", "已有来源行动入口，先回到原文核验资格、材料、费用和截止日期。")}${section("early", "提前关注", "已有方向但仍需等待正式指南或开放时间。")}${section("review", "待复核", "来源有机会线索，但类型或行动证据尚不充分。")}${section("research", "研究参考", "结果、历史或不适合直接跟进的记录，不写成当前开放机会。")}</main></body></html>`;
}

export function coverageWorkbenchDetailPage(options: ProcurementWorkbenchRouteOptions = {}, opportunityId: string): string {
  const assessment = coverageItems(options).find((item) => item.opportunity_id === opportunityId);
  if (!assessment) return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>综合机会不存在</title><body><main class="pw-wrap"><h1>综合机会不存在</h1><p><a href="/ich/opportunities">返回综合机会工作台</a></p></main></body></html>`;
  const publicAssessment = publicOpportunityCoverageAssessment(assessment);
  const item = publicAssessment.opportunity;
  const types = assessment.view_types.map((type) => COVERAGE_TYPE_LABELS[type] ?? type).join("、") || "待复核";
  const source = String(item.detail_url || item.source_url || "");
  const evidence = assessment.evidence.map((row) => `<li>${escapeHtml(row.field)}：${escapeHtml(row.raw_excerpt)} · <a rel="nofollow noopener" href="${escapeHtml(row.source_url)}">来源</a></li>`).join("");
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(String(item.title ?? ""))}｜综合机会｜盯非遗</title><style>${pageStyle()}</style></head><body><main class="pw-wrap"><p><a href="/ich/opportunities">← 返回综合机会工作台</a></p><article class="pw-detail"><p class="pw-kicker">${escapeHtml(types)} · ${escapeHtml(assessment.lane)}</p><h1>${escapeHtml(String(item.title ?? ""))}</h1><p>${escapeHtml(String(item.summary ?? "来源未提供摘要"))}</p><dl class="pw-detail-list"><dt>类型</dt><dd>${escapeHtml(types)}</dd><dt>地区</dt><dd>${escapeHtml(String(item.event_location || item.region || "待确认"))}</dd><dt>截止</dt><dd>${escapeHtml(publicAssessment.deadline_text || publicAssessment.deadline || "待确认")}</dd><dt>钱的方向</dt><dd>${escapeHtml(assessment.money_flow)}${assessment.fees.length ? `；费用：${escapeHtml(assessment.fees.join("；"))}` : ""}${assessment.funding.length ? `；资助：${escapeHtml(assessment.funding.join("；"))}` : ""}</dd><dt>资格状态</dt><dd>${escapeHtml(assessment.eligibility_status)}；${escapeHtml(assessment.qualification_gaps.join("、") || "待核验")}</dd><dt>来源</dt><dd>${escapeHtml(String(item.source_name || "待确认"))}</dd></dl><h2>证据与待核验项</h2><ul>${evidence || "<li>来源正文证据待补齐</li>"}</ul><p><strong>下一步：</strong>${escapeHtml(assessment.next_action)}</p><p><a rel="nofollow noopener" href="${escapeHtml(source)}">打开来源原文</a></p><h2>保存私有跟进</h2><p>继续使用已有授权工作台 API 保存，不在公共机会卡片中展示备注。</p><form id="followup-form"><label>用户标识 <input name="owner" required autocomplete="username"></label><label>状态 <select name="status"><option>new</option><option>reviewing</option><option>preparing</option><option>submitted</option><option>ignored</option><option>won</option><option>lost</option></select></label><label>备注 <textarea name="note" maxlength="4000"></textarea></label><label>下次跟进 <input type="date" name="next_followup_at"></label><button>保存跟进</button><span id="followup-result" role="status"></span></form><script>document.getElementById('followup-form').addEventListener('submit',async(e)=>{e.preventDefault();const f=new FormData(e.currentTarget),owner=String(f.get('owner')||'').trim();const r=await fetch('/api/opportunity-v2/workbench/followups',{method:'POST',headers:{'content-type':'application/json','x-business-user':owner},body:JSON.stringify({opportunity_id:${JSON.stringify(opportunityId)},status:f.get('status'),note:f.get('note'),next_followup_at:f.get('next_followup_at')||null})});document.getElementById('followup-result').textContent=r.ok?'已保存':'保存失败，请检查授权';});</script></article></main></body></html>`;
}
