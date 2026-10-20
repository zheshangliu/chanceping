import crypto from "node:crypto";
import { buildOpportunityV2Display, isReusableOpportunityV2Translation } from "../../opportunity-v2/display";
import { filterOpportunityV2Radar, opportunityV2LiveStatus } from "../../opportunity-v2/radar-view";
import { publicOpportunityV2Deadline } from "../../opportunity-v2/public-deadline";
import { isOpportunityV2PublicSummaryAllowed, publicOpportunityV2DiscoverySources } from "../../opportunity-v2/source-governance";
import { isOpportunityV2PublicSummarySafe, isOpportunityV2PublicTitleSafe } from "../../opportunity-v2/public-text";
import { cleanOpportunityDisplayText } from "../../opportunity-v2/display";
import type { OpportunityV2, OpportunityV2Source } from "../../opportunity-v2/types";
import type { IchAgentConstraints, IchAgentEvidence, IchAgentFact, IchAgentResult } from "./contracts";
import { interpretIchAgentRequest } from "./intent";

const TYPE_LABELS: Record<string, string> = { competition: "赛事 / 征集", procurement_project: "采购 / 订单", exhibition_market: "市集 / 展销", channel_collaboration: "渠道 / 合作", policy_funding: "资助 / 扶持", international: "研修 / 国际交流" };
const CANCELLED = /(?:已取消|取消征集|项目取消|活动取消|cancelled|canceled|call withdrawn)/iu;

function normalized(text: string): string { return text.normalize("NFKC").toLowerCase().replace(/[\p{P}\p{S}\s]+/gu, ""); }
function safeSummary(item: OpportunityV2): string { return isOpportunityV2PublicSummaryAllowed(item.source_id) && isOpportunityV2PublicSummarySafe(item) ? cleanOpportunityDisplayText(item.summary) : ""; }
const CRAFT_TERM_ALIASES: Record<string, string[]> = {
  "手工艺": ["craft", "crafts", "handcraft", "handcrafted", "handmade", "artisan", "artisanal", "陶艺", "陶瓷", "漆艺", "木雕", "藤编", "剪纸", "皮影", "刺绣", "扎染", "蜡染", "编织", "织锦", "银饰", "玉雕"],
  "非遗": ["intangible cultural heritage", "heritage craft", "traditional craft"],
  "竹编": ["bamboo weaving", "bamboo craft", "basketry", "basketwork"],
};
const GENERIC_DOMAIN_TAGS = new Set(["craft", "crafts", "heritage craft", "maker", "makers", "competition", "artist", "artists"]);
function matchesCraftTerm(text: string, term: string): boolean {
  const key = normalized(term);
  return text.includes(key) || (CRAFT_TERM_ALIASES[term] ?? []).some((alias) => text.includes(normalized(alias)));
}
function isNavigationNoise(item: OpportunityV2): boolean {
  const title = normalized(item.title);
  const summary = normalized(safeSummary(item));
  const combined = `${title} ${summary}`;
  const navigationMarkers = ["archives", "search", "login", "becomeamember", "about", "whatwedo", "whoweare", "ourstories", "faqs", "partners", "contactus"];
  const markerCount = navigationMarkers.filter((marker) => combined.includes(marker)).length;
  const opportunitySignals = /(?:opencall|application|applynow|deadline|submission|submit|competition|contest|award|grant|fellowship|residency|festival|fair|market|exhibition|征集|报名|参赛|申请|大赛|竞赛|市集|展览|展销|招募)/iu;
  return markerCount >= 4 && !opportunitySignals.test(`${item.title} ${safeSummary(item)}`);
}
function opportunityContent(item: OpportunityV2, translations: Parameters<typeof buildOpportunityV2Display>[1]): string {
  const tags = item.tags.filter((tag) => !GENERIC_DOMAIN_TAGS.has(tag.toLowerCase()));
  const summary = isNavigationNoise(item) ? "" : safeSummary(item);
  return normalized([item.title, buildOpportunityV2Display(item, translations).title, summary, ...tags, item.event_location ?? ""].join(" "));
}
function effectiveCategory(item: OpportunityV2, translations: Parameters<typeof buildOpportunityV2Display>[1]): string {
  const title = `${item.title} ${buildOpportunityV2Display(item, translations).title}`;
  if (/(?:procurement|tender|request for proposals|采购|订单|招标|投标)/iu.test(title)) return "procurement_project";
  if (/(?:grant|funding|fellowship|资助|补贴|基金|扶持)/iu.test(title)) return "policy_funding";
  if (/(?:residency|workshop|training|exchange|retreat|immersive tour|study tour|研修|驻地|培训|交流|研学|沉浸式之旅)/iu.test(title)
    && !/(?:competition|contest|大赛|竞赛|比赛)/iu.test(title)) return "international";
  if (/(?:market|fair|festival|exhibition|exhibit|市集|展销|展会|展览|博览)/iu.test(title)
    && !/(?:competition|contest|大赛|竞赛|比赛)/iu.test(title)) return "exhibition_market";
  return item.category;
}
function evidenceFact(evidenceId: string | undefined, value: string | null, status: IchAgentFact["status"]): IchAgentFact { return { value, status, evidence_refs: evidenceId ? [evidenceId] : [] }; }

export function evidenceForPublishedOpportunity(item: OpportunityV2, now: Date, translations: Parameters<typeof buildOpportunityV2Display>[1], sources: OpportunityV2Source[] = []): IchAgentEvidence[] {
  const display = buildOpportunityV2Display(item, translations);
  const recordedAt = item.last_seen_at || item.first_seen_at;
  const sourceUrl = item.detail_url || item.source_url;
  const evidence: IchAgentEvidence[] = [
    { evidence_id: `pool-${item.id}-title`, field: "title", value: display.title, status: "pool_record", source_url: sourceUrl, recorded_at: recordedAt },
    { evidence_id: `pool-${item.id}-source`, field: "source", value: `${item.source_name}${item.discovered_by_sources.length ? `；发现来源：${publicOpportunityV2DiscoverySources(item.discovered_by_sources).map((id) => sources.find((source) => source.id === id)?.name ?? id).join("、")}` : ""}`, status: "pool_record", source_url: sourceUrl, recorded_at: recordedAt },
  ];
  const deadline = publicOpportunityV2Deadline(item);
  if (deadline.deadline && !deadline.unsafe) evidence.push({ evidence_id: `pool-${item.id}-deadline`, field: "deadline", value: deadline.deadline, status: "pool_record", source_url: item.deadline_source_url || sourceUrl, recorded_at: item.deadline_checked_at || recordedAt });
  const summary = safeSummary(item);
  if (summary) evidence.push({ evidence_id: `pool-${item.id}-summary`, field: "summary", value: summary, status: "pool_record", source_url: sourceUrl, recorded_at: recordedAt });
  void now;
  return evidence;
}

function lifecycle(item: OpportunityV2, now: Date): IchAgentResult["lifecycle"] {
  if (item.deadline_conflict_unsafe) return "conflict";
  if (CANCELLED.test(`${item.title} ${item.summary}`)) return "cancelled";
  if (item.starts_at && Number.isFinite(Date.parse(item.starts_at)) && Date.parse(item.starts_at) > now.getTime()) return "upcoming";
  const status = opportunityV2LiveStatus(item, now);
  if (status === "EXPIRED") return "historical";
  return status === "CURRENT" ? "current" : "unknown";
}

function matchesHardConstraints(item: OpportunityV2, constraints: IchAgentConstraints, now: Date, translations: Parameters<typeof buildOpportunityV2Display>[1]): boolean {
  if (isNavigationNoise(item) || lifecycle(item, now) === "historical" || lifecycle(item, now) === "cancelled") return false;
  if (constraints.region !== "all" && item.region !== constraints.region) return false;
  if (constraints.opportunity_types.length && !constraints.opportunity_types.includes(effectiveCategory(item, translations))) return false;
  if (constraints.within_days !== null && item.deadline && !item.deadline_conflict_unsafe) {
    const time = Date.parse(item.deadline);
    if (Number.isFinite(time) && time > now.getTime() + constraints.within_days * 86400_000) return false;
  }
  const text = opportunityContent(item, translations);
  if (constraints.craft_terms.length && !constraints.craft_terms.some((term) => matchesCraftTerm(text, term))) return false;
  if (constraints.explicit_exclusions.some((term) => term && text.includes(normalized(term)))) return false;
  return true;
}

function relevance(item: OpportunityV2, constraints: IchAgentConstraints, translations: Parameters<typeof buildOpportunityV2Display>[1]): number {
  const text = opportunityContent(item, translations);
  let points = item.radar_relevance === "RELEVANT" ? 1 : 0;
  for (const term of constraints.craft_terms) if (matchesCraftTerm(text, term)) points += 5;
  for (const location of constraints.location_terms) if (text.includes(normalized(location))) points += 2;
  if (constraints.opportunity_types.includes(effectiveCategory(item, translations))) points += 5;
  if (constraints.online_only && item.participation_mode === "online") points += 3;
  if (constraints.online_only && item.participation_mode !== "online") points -= 2;
  if (constraints.budget_preference === "free_only" && /(?:免费|免报名费|无报名费|free entry|no application fee)/iu.test(safeSummary(item))) points += 1;
  return points;
}

function keyGap(item: OpportunityV2, constraints: IchAgentConstraints): string {
  if (constraints.budget_preference === "free_only") return "费用未被明确确认；不能按免费机会推荐";
  if (item.deadline_conflict_unsafe) return "截止日期存在冲突，暂不显示精确日期";
  if (!publicOpportunityV2Deadline(item).deadline && !item.is_long_term) return "截止日期尚未核实";
  return "申请资格、费用与作品要求仍应以主办方原文确认";
}

export function retrievePublishedIchOpportunities(input: {
  message: string; constraints?: IchAgentConstraints; opportunities: OpportunityV2[]; sources: OpportunityV2Source[]; now?: Date; translations?: Parameters<typeof buildOpportunityV2Display>[1]; maxResults?: number;
}): IchAgentResult[] {
  const now = input.now ?? new Date();
  const translations = input.translations ?? [];
  const constraints = input.constraints ?? interpretIchAgentRequest({ message: input.message }).constraints;
  const eligible = filterOpportunityV2Radar(input.opportunities, input.sources, { include_irrelevant: true, status: "browse", now })
    .filter(isOpportunityV2PublicTitleSafe)
    .filter((item) => matchesHardConstraints(item, constraints, now, translations));
  const ranked = eligible.map((item) => ({ item, points: relevance(item, constraints, translations) }))
    .filter(({ points }) => constraints.craft_terms.length === 0 && constraints.location_terms.length === 0 || points > 0)
    .sort((a, b) => b.points - a.points || a.item.first_seen_at.localeCompare(b.item.first_seen_at));
  const max = input.maxResults ?? 5;
  const selectedIds = new Set<string>();
  for (const category of constraints.opportunity_types) {
    const bestForCategory = ranked.find(({ item }) => effectiveCategory(item, translations) === category);
    if (bestForCategory && selectedIds.size < max) selectedIds.add(bestForCategory.item.id);
  }
  for (const { item } of ranked) {
    if (selectedIds.size >= max) break;
    selectedIds.add(item.id);
  }
  return ranked.filter(({ item }) => selectedIds.has(item.id)).slice(0, max).map(({ item }) => {
    const display = buildOpportunityV2Display(item, translations);
    const originalTitle = display.translated ? display.original_title ?? item.title : undefined;
    const titleId = `pool-${item.id}-title`;
    const deadline = publicOpportunityV2Deadline(item);
    const deadlineId = `pool-${item.id}-deadline`;
    const deadlineEvidence = deadline.deadline && !deadline.unsafe ? deadlineId : undefined;
    const sourceUrl = item.detail_url || item.source_url;
    const type = effectiveCategory(item, translations);
    const category = TYPE_LABELS[type] ?? type;
    const feeUnknown = true; // V2 currently has no general application-fee field.
    return {
      result_ref: `ref-${crypto.randomBytes(12).toString("base64url")}`,
      opportunity_id: item.id,
      source_kind: "library",
      title_zh: display.title,
      ...(originalTitle ? { original_title: originalTitle } : {}),
      title_translation: display.translated ? "translated" : "original",
      opportunity_type: category,
      lifecycle: lifecycle(item, now),
      region: item.event_location || (item.region === "CN" ? "国内来源" : "海外来源"),
      deadline_fact: deadline.unsafe ? evidenceFact(undefined, "截止日期存在冲突；精确日期待核", "conflict") : deadline.deadline ? evidenceFact(deadlineEvidence, deadline.deadline, "recorded") : evidenceFact(undefined, item.is_long_term ? "长期开放（库内标记）" : null, item.is_long_term ? "recorded" : "unknown"),
      money_facts: [evidenceFact(undefined, null, "unknown")],
      eligibility_facts: [evidenceFact(undefined, null, "unknown")],
      work_requirements: [evidenceFact(undefined, null, "unknown")],
      fit_reason: constraints.craft_terms.length ? `库内分类或标签与“${constraints.craft_terms.join("、")}”相关；这不代表资格确认。` : "该记录来自当前可浏览的机会库；适配细节请核对原文。",
      key_gap: feeUnknown && constraints.budget_preference === "free_only" ? keyGap(item, constraints) : keyGap(item, constraints),
      next_action: "打开来源原文，先核对申请资格、费用和作品要求。",
      detail_url: `/ich/opportunities/${encodeURIComponent(item.id)}`,
      original_url: sourceUrl,
      evidence_refs: [titleId, ...(deadlineEvidence ? [deadlineId] : []), `pool-${item.id}-source`],
      verification_state: "已收录；本轮依据机会库记录，关键申请条件仍需回到来源核对",
    } satisfies IchAgentResult;
  });
}

export function matchExistingPublishedOpportunity(title: string, opportunities: OpportunityV2[], sources: OpportunityV2Source[], now = new Date()): OpportunityV2 | undefined {
  const key = normalized(title);
  if (!key) return undefined;
  return filterOpportunityV2Radar(opportunities, sources, { include_irrelevant: true, status: "browse", now }).find((item) => normalized(item.title) === key);
}

export function reusableTranslationFor(item: OpportunityV2, translations: Parameters<typeof buildOpportunityV2Display>[1]): boolean {
  const entry = (translations ?? []).find((row) => row.opportunity_id === item.id);
  return isReusableOpportunityV2Translation(item, entry);
}
