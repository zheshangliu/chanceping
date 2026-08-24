import { getIchSourceRegistryV2 } from "./source-registry-v2";
import type { IchCandidateSample } from "./source-adapters-v1";

export type IchCandidateQualityDecision = "review_required" | "reject";
export type IchCandidateQualityBand = "high" | "medium" | "low";

export interface IchCandidateQualityAssessment {
  candidate_id: string;
  source_id: string;
  score: number;
  band: IchCandidateQualityBand;
  decision: IchCandidateQualityDecision;
  formal_publish_blocked: true;
  checks: Record<string, boolean>;
  reasons: string[];
}

function isDetailPage(sample: IchCandidateSample): boolean {
  try {
    const source = new URL(sample.source_url);
    const discovery = new URL(sample.discovery_url);
    return source.pathname !== discovery.pathname && /(?:post_|t\d+_\d+|content\/|\/(?:guide_detail|work_notice_detail|normal_detail|fund_work_detail|policy_detail|newslncb_detail|news_2_details|single_detail|event\/detail)\/\d+(?:\.html)?$|\/82\/\d{6}\/\d+\.html$|\/cn\/col51\/\d+$)/u.test(source.pathname);
  } catch { return false; }
}

function qualityBand(score: number): IchCandidateQualityBand {
  if (score >= 75) return "high";
  if (score >= 50) return "medium";
  return "low";
}

function relevanceSignal(title: string): boolean {
  return /非遗|传统工艺|工艺美术|文创|文旅|博物|文化|手工|民俗|展陈|展览|消费券|揭榜/u.test(title);
}

function actionSignal(title: string): boolean {
  return /采购|招标|征选|征集|比选|遴选|邀标|揭榜|报名/u.test(title) && !/结果公示|中选结果|中标公告|获奖名单|结果公告/u.test(title);
}

export function assessIchCandidateQuality(sample: IchCandidateSample, existingUrls: Set<string> = new Set()): IchCandidateQualityAssessment {
  const source = getIchSourceRegistryV2().sources.find((entry) => entry.id === sample.source_id);
  const checks = {
    detail_page: isDetailPage(sample),
    title_confirmed: sample.field_provenance.title.confirmed && sample.title.trim().length > 0,
    organizer_confirmed: sample.field_provenance.organizer.confirmed,
    deadline_confirmed: sample.field_provenance.deadline_text.confirmed && Boolean(sample.deadline_text),
    geography_confirmed: sample.field_provenance.geography.confirmed,
    category_confirmed: sample.field_provenance.category_hint.confirmed,
    snapshot_hash: /^[a-f0-9]{64}$/u.test(sample.raw_snapshot_hash),
    primary_or_secondary_source: source?.role === "primary" || source?.role === "secondary",
    relevance_signal: relevanceSignal(sample.title),
    action_signal: actionSignal(sample.title),
    known_template_marker_absent: !["第十一届广东省非遗创意设计大赛", "gdsfycyds@qq.com"].some((marker) => JSON.stringify(sample).includes(marker)),
    duplicate_url_absent: !existingUrls.has(sample.source_url.replace(/#.*$/, "").replace(/\/$/, "")),
  };
  const weights: Record<string, number> = { detail_page: 20, title_confirmed: 15, organizer_confirmed: 15, deadline_confirmed: 15, geography_confirmed: 10, category_confirmed: 5, snapshot_hash: 10, primary_or_secondary_source: 5, relevance_signal: 3, action_signal: 2 };
  let score = Object.entries(weights).reduce((sum, [key, weight]) => sum + (checks[key as keyof typeof checks] ? weight : 0), 0);
  if (!checks.action_signal) score = Math.max(0, score - 20);
  if (!checks.relevance_signal) score = Math.max(0, score - 5);
  if (!checks.known_template_marker_absent || !checks.duplicate_url_absent) score = 0;
  const reasons: string[] = [];
  if (!checks.relevance_signal) reasons.push("标题未提供明确非遗/传统工艺相关性，需人工确认");
  if (!checks.action_signal) reasons.push("标题可能是结果/更正或未体现当前行动窗口");
  if (!checks.deadline_confirmed) reasons.push("截止字段未被详情页确认");
  if (!checks.geography_confirmed) reasons.push("地区字段未被详情页确认");
  if (!checks.category_confirmed) reasons.push("分类仍是适配器提示，未逐条确认");
  if (!checks.known_template_marker_absent) reasons.push("检测到 DS0 已知模板标记");
  if (!checks.duplicate_url_absent) reasons.push("候选详情 URL 重复");
  const hardBlock = !checks.detail_page || !checks.snapshot_hash || !checks.known_template_marker_absent || !checks.duplicate_url_absent;
  return { candidate_id: sample.candidate_id, source_id: sample.source_id, score, band: qualityBand(score), decision: hardBlock ? "reject" : "review_required", formal_publish_blocked: true, checks, reasons };
}
