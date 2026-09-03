import type { Company } from "../model/company";
import type { ContactEntry } from "../model/contact";
import type { RawEvidence, EvidenceRecord } from "../model/evidence";
import type { Job } from "../model/job";
import type { NeedInference, WeeklyLeadSnapshot } from "../model/lead";
import type { Person } from "../model/person";
import type { CompanySignal } from "../model/signal";
import type { LeadEvidenceView, LeadContactView, OfficialContactEntryView } from "../model/lead";

export interface LeadPresentationInput {
  lead: WeeklyLeadSnapshot;
  company: Company;
  signals: CompanySignal[];
  jobs: Job[];
  people: Person[];
  contacts: ContactEntry[];
  evidences: Array<RawEvidence | EvidenceRecord>;
  needs?: NeedInference[];
}

/**
 * Build the persisted/read-model fields used by both the Finance web page and
 * the Markdown export. Raw evidence is copied by value and never rewritten.
 */
export function buildLeadPresentation(input: LeadPresentationInput): WeeklyLeadSnapshot {
  const { lead, company } = input;
  const primary = choosePrimarySignal(input.signals);
  const evidenceViews = input.evidences.map(toEvidenceView);
  const evidenceGroups = unique(evidenceViews.map((item) => sourceGroup(item.source_url, item.source_name)));
  for (const evidence of evidenceViews) evidence.cross_verified = evidenceGroups.length >= 2;
  const contactViews = input.contacts.map((entry) => toContactView(entry, input.people, company.canonical_name));
  const officialEntries = input.contacts.filter(isOfficialEntry).map((entry) => toOfficialEntry(entry));
  const roleNames = unique([
    ...input.jobs.map((job) => job.canonical_title || job.role_family || ""),
    ...(input.needs ?? []).map((need) => roleLabelZh(need.role_family)),
  ]);
  const roleText = roleNames.length ? roleNames.slice(0, 4).join("、") : "招聘负责人、业务负责人及相关职能岗位";
  const triggerLabel = primary ? signalLabelZh(primary.signal_type) : input.jobs.length ? "招聘变化" : "近期经营变化";
  const eventDate = primary?.event_date ?? input.jobs.map((job) => job.last_seen_at).sort().at(-1)?.slice(0, 10) ?? null;
  const evidenceSource = primary ? input.evidences.find((item) => item.evidence_id === primary.primary_source_id) ?? input.evidences[0] : input.evidences[0];
  const evidenceGatePassed = evidenceViews.some((item) => item.is_first_party) || evidenceViews.filter((item) => item.source_type === "reliable_media" || item.source_type === "regulator").map((item) => sourceGroup(item.source_url, item.source_name)).filter((v, i, a) => a.indexOf(v) === i).length >= 2;
  const hasContact = contactViews.length > 0;
  const contactText = contactViews.find((item) => item.name)?.name ?? officialEntries[0]?.label ?? "官方公司入口";
  const interpretation = buildInterpretation(company, triggerLabel, eventDate, roleText, contactText, primary?.fact_summary ?? null, input.jobs.length > 0);
  return {
    ...lead,
    company_name: company.canonical_name,
    industry: company.industry ?? company.sub_industry,
    region: company.region ?? company.city ?? company.country,
    primary_trigger: primary ? { title: primary.title, summary: primary.fact_summary, event_date: primary.event_date, source_name: evidenceSource?.source_name ?? null, source_url: evidenceSource?.source_url ?? null } : null,
    trigger_summary_zh: interpretation.trigger_summary_zh,
    why_now_zh: interpretation.why_now_zh,
    talent_need_zh: interpretation.talent_need_zh,
    service_wedge_zh: interpretation.service_wedge_zh,
    bd_action_zh: interpretation.bd_action_zh,
    first_touch_script_zh: interpretation.first_touch_script_zh,
    fact_summary_zh: primary ? `事实：${primary.fact_summary}` : null,
    inference_summary_zh: input.jobs.length || (input.needs?.length ?? 0) ? `系统判断：${interpretation.talent_need_zh}` : null,
    evidence_count: evidenceViews.length,
    evidence_ids: evidenceViews.map((item) => item.evidence_id),
    evidences: evidenceViews,
    contacts: contactViews,
    official_contact_entries: officialEntries,
    evidence_gate_status: evidenceGatePassed ? "pass" : "fail",
    contact_gate_status: hasContact ? "pass" : "fail",
  };
}

function buildInterpretation(company: Company, trigger: string, date: string | null, roleText: string, contactText: string, rawFact: string | null, hasJobs: boolean): Record<string, string> {
  const dateText = date ? `${date} ` : "近期 ";
  const factText = rawFact ? `，公开资料显示“${rawFact}”` : "，公开资料出现了相关变化";
  const why = hasJobs
    ? `${company.canonical_name}在${dateText}出现${trigger}${factText}，说明相关团队仍在补充或扩张，本周适合直接验证招聘优先级。`
    : `${company.canonical_name}在${dateText}出现${trigger}${factText}。这不是已确认的招聘事实，但值得本周从官方入口核实组织和人才计划。`;
  const wedge = company.target_segment === "hk_finance"
    ? "可从香港金融中高端岗位和合规/财富管理人才地图切入，先用小范围市场反馈验证外部猎头需求。"
    : company.target_segment === "outbound_manufacturing"
      ? "可从海外工厂、供应链及本地管理岗位切入，提供目标市场人才地图和候选人搜寻支持。"
      : "可从近期业务变化对应的关键岗位切入，先提供针对性的候选人市场反馈，再确认是否需要外部交付。";
  const action = `本周联系${contactText}，围绕${trigger}确认${roleText}的优先级，并提出一次低摩擦的人才市场反馈。`;
  const script = `${contactText.includes("官方") ? "招聘负责人" : contactText}您好，我们留意到${company.canonical_name}近期出现${trigger}。这类变化可能带来${roleText}的人才补充需求；维优可以先提供相关市场的候选人反馈。方便的话，想在本周了解贵司当前最优先的岗位方向。`;
  return { trigger_summary_zh: `${dateText}${trigger}${factText}。`, why_now_zh: why, talent_need_zh: hasJobs ? `潜在需求：${roleText}，优先核实岗位数量、地点和招聘时限。` : `潜在需求：${roleText}，目前属于基于经营变化的推断，需进一步核实。`, service_wedge_zh: wedge, bd_action_zh: action, first_touch_script_zh: script };
}

function choosePrimarySignal(signals: CompanySignal[]): CompanySignal | null {
  return [...signals].sort((a, b) => `${b.impact_level}|${b.last_seen_at}`.localeCompare(`${a.impact_level}|${a.last_seen_at}`))[0] ?? null;
}

function toEvidenceView(item: RawEvidence | EvidenceRecord): LeadEvidenceView {
  const isFirstParty = item.source_type === "official" || item.source_type === "regulator";
  return { evidence_id: item.evidence_id, title: item.title, summary: item.excerpt, source_name: item.source_name, source_type: item.source_type, source_url: item.source_url, published_at: item.published_at, evidence_level: isFirstParty ? "first_party" : item.source_type === "reliable_media" ? "reliable_secondary" : "discovery", is_first_party: isFirstParty, cross_verified: false };
}

function toContactView(entry: ContactEntry, people: Person[], companyName: string): LeadContactView {
  const person = entry.person_id ? people.find((item) => item.person_id === entry.person_id) : undefined;
  const kind = entry.kind;
  const value = normalizeContactValue(kind, entry.value);
  return { contact_id: entry.contact_id, name: person?.name ?? null, title: person?.current_title ?? entry.label, organization: companyName, contact_type: kind, url: kind === "linkedin_profile" || kind === "website" || kind === "official_website" ? value : null, email: kind.includes("email") ? value : null, phone: kind.includes("phone") || kind === "phone" ? value : null, verification_status: entry.public_verified ? "verified_public" : "unverified" };
}

function isOfficialEntry(entry: ContactEntry): boolean { return ["corporate_email", "corporate_phone", "company_contact_form", "careers_form", "careers_entry", "email", "phone", "contact_form"].includes(entry.kind) && entry.public_verified && entry.professional; }
function toOfficialEntry(entry: ContactEntry): OfficialContactEntryView { const base = { type: entry.kind, label: entry.label ?? entry.kind }; if (entry.kind.includes("email")) return { ...base, email: normalizeContactValue(entry.kind, entry.value) }; if (entry.kind.includes("phone")) return { ...base, phone: normalizeContactValue(entry.kind, entry.value) }; return { ...base, url: normalizeContactValue(entry.kind, entry.value) }; }
function normalizeContactValue(kind: string, value: string): string { if (kind.includes("email")) return value.trim().toLowerCase(); if (kind.includes("phone")) return value.trim().replace(/[^+\d]/g, ""); try { return new URL(value).toString(); } catch { return value.trim(); } }
function sourceGroup(url: string, name: string): string { try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase(); } catch { return name.trim().toLowerCase(); } }
function unique(values: string[]): string[] { return [...new Set(values.map((value) => value.trim()).filter(Boolean))]; }
function signalLabelZh(type: CompanySignal["signal_type"]): string { return ({ hiring: "招聘扩张", funding: "融资变化", ipo: "上市进展", ma: "并购变化", new_license: "牌照/业务变化", new_business: "新业务", new_market: "新市场布局", factory_build: "新工厂建设", factory_expand: "工厂扩产", capacity_transfer: "产能转移", large_order: "重大订单", regional_hq: "区域总部变化", treasury_center: "资金中心变化", leadership_change: "管理层变化", restructuring: "组织调整", layoff: "裁员/重组", closure: "业务收缩", government_agreement: "政府合作", contact_enrichment: "联系人变化", other: "经营变化" } as Record<string, string>)[type] ?? "经营变化"; }
function roleLabelZh(role: string): string { return ({ TA: "人才招聘", Recruiter: "招聘负责人", HRBP: "HRBP", HRD: "HRD", Compliance: "合规", AML: "反洗钱", Risk: "风险管理", Institutional: "机构业务", Wealth: "财富管理", "Country Manager": "国家/海外负责人" } as Record<string, string>)[role] ?? role; }
