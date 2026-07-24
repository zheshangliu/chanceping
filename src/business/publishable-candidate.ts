import type { CandidateRecord, EvidenceRecord } from "./data-pipeline";
import { loadSourceRegistry } from "./data-pipeline";
import { isFixedDeadlineCurrent } from "./data-quality";

export interface PublishableCandidate {
  candidateId: string;
  title: string;
  category: "procurement";
  officialUrl: string;
  organizer: string;
  regions: ["guangdong"];
  editions: ["guangzhou", "tianhe", "shaoguan"];
  publishedAt: string;
  deadline: string;
  deadlineType: "fixed";
  status: "open";
  verificationStatus: "fully_verified";
  reviewState: "FULLY_VERIFIED";
  targetAudience: ["supplier", "enterprise"];
  eligibilitySummary: string;
  eligibilityRequirements: string[];
  rewardSummary: string;
  recommendationLevel: "medium";
  risks: string[];
  nextActions: string[];
  evidence: EvidenceRecord;
}

export interface PublishableOfficialCandidate extends Omit<PublishableCandidate, "category" | "regions" | "editions" | "targetAudience"> {
  category: "policy" | "competition" | "exhibition" | "international";
  sourceName: string;
  sourceType: "government" | "official";
  regions: ["guangdong"];
  editions: ["guangzhou", "tianhe", "shaoguan"];
  targetAudience: ["enterprise"];
}

function oneLine(value: string): string { return value.replace(/\s+/g, " ").trim(); }
function between(text: string, start: RegExp, end: RegExp): string | undefined {
  const from = text.search(start); if (from < 0) return undefined;
  const chunk = text.slice(from).replace(start, "");
  const to = chunk.search(end);
  return oneLine((to < 0 ? chunk : chunk.slice(0, to)).slice(0, 240));
}
function procurementUnit(text: string): string | undefined {
  const value = between(text, /采购单位\s*/, /(?:行政区域|公告时间|采购代理机构|项目概况|联系人及联系方式)/);
  return value?.replace(/采购单位$/, "").trim();
}
function projectTitle(candidate: CandidateRecord): string {
  const fromBody = between(candidate.rawBodyExcerpt ?? "", /采购项目名称\s*/, /(?:品目|采购单位|行政区域|公告时间)/);
  return fromBody && fromBody.length >= 6 ? fromBody : candidate.rawTitle.replace(/\.\.\.$/, "");
}
function eligibility(text: string): string {
  const value = between(text, /潜在投标人应/, /(?:提交投标文件截止时间|投标截止时间|开标时间|一、项目基本情况)/);
  return value ? `潜在投标人应${value}`.slice(0, 300) : "潜在投标人须按官方公告要求获取招标文件并提交投标文件。";
}

/** Converts only direct Guangdong procurement facts that already pass the non-negotiable publication gates. */
export function toPublishableGuangdongProcurement(candidate: CandidateRecord, now = new Date()): PublishableCandidate | undefined {
  const text = candidate.rawBodyExcerpt ?? "";
  if (candidate.sourceId !== "src_ccgp_national" || candidate.categoryHint !== "procurement" || !candidate.canonicalUrl?.startsWith("https://www.ccgp.gov.cn/") || !candidate.rawPublishedAt || !candidate.rawDeadlineText || !isFixedDeadlineCurrent(candidate.rawDeadlineText, now) || !/行政区域\s*广东省/.test(text) || !(candidate.actionSignals ?? []).some((signal) => ["投标", "响应", "采购", "招标"].includes(signal))) return undefined;
  const organizer = procurementUnit(text);
  const title = projectTitle(candidate);
  if (!organizer || organizer.length < 2 || !title || title.length < 6) return undefined;
  const requirement = eligibility(text);
  const capturedAt = now.toISOString();
  return {
    candidateId: candidate.candidateId, title, category: "procurement", officialUrl: candidate.canonicalUrl, organizer,
    regions: ["guangdong"], editions: ["guangzhou", "tianhe", "shaoguan"], publishedAt: candidate.rawPublishedAt, deadline: candidate.rawDeadlineText, deadlineType: "fixed", status: "open", verificationStatus: "fully_verified", reviewState: "FULLY_VERIFIED",
    targetAudience: ["supplier", "enterprise"], eligibilitySummary: requirement, eligibilityRequirements: ["按官方公告要求获取招标文件", "在公告规定的截止时间前提交投标或响应文件"], rewardSummary: "采购预算、品目及合同要求以官方公告为准。", recommendationLevel: "medium",
    risks: ["资格条件、采购文件要求和补充公告以官方原文为准", "临近截止前应复核采购公告是否有更正或延期"], nextActions: ["打开官方公告核对采购文件与资格条件", "在截止日前完成报名、文件获取和投标准备"],
    evidence: { candidateId: candidate.candidateId, sourceId: candidate.sourceId, discoveryUrl: candidate.discoveryUrl, officialUrl: candidate.canonicalUrl, fetchedAt: candidate.updatedAt, lastVerifiedAt: capturedAt, documentHash: candidate.contentHash, originalSummary: text.slice(0, 500), fieldEvidence: { organizer: [{ url: candidate.canonicalUrl, locator: "公告概要/采购单位", capturedAt }], deadline: [{ url: candidate.canonicalUrl, locator: "公告概要/开标时间或投标截止时间", capturedAt }], eligibilitySummary: [{ url: candidate.canonicalUrl, locator: "项目概况/潜在投标人", capturedAt }] } },
  };
}

/**
 * A conservative conversion path for non-procurement official notices.  It is
 * deliberately limited to notices with an extracted future fixed deadline;
 * evergreen policy interpretation pages and discovered-only sources stay out
 * of the public opportunity pool.
 */
export function toPublishableOfficialOpportunity(candidate: CandidateRecord, now = new Date()): PublishableOfficialCandidate | undefined {
  const source = loadSourceRegistry().sources.find((item) => item.sourceId === candidate.sourceId);
  const category = candidate.categoryHint;
  if (!source || source.role !== "official_fact" || source.finalAllowed !== "是" || !["policy", "competition", "exhibition", "international"].includes(category ?? "") || !candidate.canonicalUrl?.startsWith("https://") || !candidate.rawPublishedAt || !isFixedDeadlineCurrent(candidate.rawDeadlineText, now)) return undefined;
  const url = new URL(candidate.canonicalUrl);
  if (url.hostname !== source.officialDomain && !url.hostname.endsWith(`.${source.officialDomain}`)) return undefined;
  const title = candidate.rawTitle.replace(/\.\.\.$/, "").trim();
  if (title.length < 8) return undefined;
  const capturedAt = now.toISOString();
  const action = category === "competition" ? "报名参赛" : category === "exhibition" ? "申报参展" : "提交申报材料";
  return {
    candidateId: candidate.candidateId, title, category: category as PublishableOfficialCandidate["category"], sourceName: source.name, sourceType: /(?:人民政府|商务厅|商务局|财政部|部委|机关)/.test(source.authority) ? "government" : "official",
    officialUrl: candidate.canonicalUrl, organizer: source.name, regions: ["guangdong"], editions: ["guangzhou", "tianhe", "shaoguan"], publishedAt: candidate.rawPublishedAt, deadline: candidate.rawDeadlineText!, deadlineType: "fixed", status: "open", verificationStatus: "fully_verified", reviewState: "FULLY_VERIFIED", targetAudience: ["enterprise"],
    eligibilitySummary: `面向符合官方通知要求的企业或申报主体；请按公告要求${action}。`, eligibilityRequirements: ["核对官方通知列明的申报条件、材料与提交渠道", `在固定截止日前完成${action}`], rewardSummary: "支持标准、奖项或权益以官方通知及附件为准。", recommendationLevel: "medium",
    risks: ["资格条件、附件和补充通知以官方原文为准", "提交前应复核截止时间及线上系统状态"], nextActions: ["打开官方通知核对适用条件和材料清单", `在截止日前完成${action}`],
    evidence: { candidateId: candidate.candidateId, sourceId: candidate.sourceId, discoveryUrl: candidate.discoveryUrl, officialUrl: candidate.canonicalUrl, fetchedAt: candidate.updatedAt, lastVerifiedAt: capturedAt, documentHash: candidate.contentHash, originalSummary: (candidate.rawBodyExcerpt ?? "").slice(0, 500), fieldEvidence: { organizer: [{ url: candidate.canonicalUrl, locator: "官方通知发布机构", capturedAt }], deadline: [{ url: candidate.canonicalUrl, locator: "通知正文中的申报/报名截止日期", capturedAt }], eligibilitySummary: [{ url: candidate.canonicalUrl, locator: "通知正文中的申报对象、条件或材料要求", capturedAt }] } },
  };
}
