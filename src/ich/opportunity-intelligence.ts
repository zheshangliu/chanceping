import type { IchCandidateSample } from "./source-adapters-v1";
import type { IchApplicantFit } from "./applicant-fit";
import type { IchSourceRegistryV2Entry } from "./source-registry-v2";

export const ICH_OPPORTUNITY_STAGES = [
  "open_application",
  "open_call",
  "project_invitation",
  "policy_program",
  "announcement_only",
  "historical_record",
] as const;

export type IchOpportunityStage = typeof ICH_OPPORTUNITY_STAGES[number];

export interface IchOpportunityIntelligence {
  opportunity_stage: IchOpportunityStage;
  actionability_score: number;
  actionability_reasons: string[];
  qualified_candidate: boolean;
  high_quality_candidate: boolean;
}

const ACTION_RE = /报名|申请|申报|征集|招募|开放|合作|采购|招标|展销|参展|驻地|资助|入驻|联名|apply|application|open call|submission|supplier|procurement|residency|grant|fellowship|collaboration|partnership/i;
const APPLICATION_RE = /报名|申请|申报|招募|开放报名|apply|application|open call|submission/i;
const PROJECT_RE = /合作|采购|招标|供应商|入驻|联名|项目承接|commission|supplier|procurement|collaboration|partnership/i;
const POLICY_RE = /扶持|资助|基金|项目申报|保护项目|振兴|传承人计划|人才培养|grant|fund|fellowship|heritage program/i;
const OPEN_CALL_RE = /征集|公开征集|作品征集|开放征集|open call|submission/i;
const ANNOUNCEMENT_RE = /公布|公示|名单|通知|新闻|会议|讲话|报道|回顾|总结|活动预告|收官|结果公告|结果公示|获奖|评估结果|announcement|news|report|winners|past exhibition/i;
const HISTORICAL_RE = /往届|历届|202[0-4]|历史|回顾|past|archive|historical/i;
const BENEFIT_RE = /奖金|奖项|资助|基金|采购|供应商|展销|销售|渠道|合作|补贴|prize|award|grant|funding|supplier|market|commission|benefit/i;
const HERITAGE_RE = /非遗|非物质文化遗产|传统工艺|传统技艺|工艺美术|手工艺|传承人|文化遗产|heritage craft|traditional craft|artisan|craftsmanship/i;
const IRRELEVANT_PROCUREMENT_RE = /设备|服务器|机柜|医疗|交通|道路|桥梁|装修|工程施工|软件开发|信息系统|网络安全|保洁|物业|车辆|食堂|制服|IDC|IT|hardware|software|healthcare|traffic|construction|property/i;

export function classifyIchOpportunityStage(candidate: IchCandidateSample): IchOpportunityStage {
  const text = `${candidate.title} ${candidate.organizer ?? ""}`;
  if (HISTORICAL_RE.test(text)) return "historical_record";
  if (PROJECT_RE.test(text)) return "project_invitation";
  if (POLICY_RE.test(text)) return "policy_program";
  if (OPEN_CALL_RE.test(text)) return "open_call";
  if (APPLICATION_RE.test(text)) return "open_application";
  if (ANNOUNCEMENT_RE.test(text)) return "announcement_only";
  return "announcement_only";
}

export function scoreIchCandidateActionability(
  candidate: IchCandidateSample,
  source: IchSourceRegistryV2Entry | undefined,
  applicantFit: IchApplicantFit,
): IchOpportunityIntelligence {
  const text = `${candidate.title} ${candidate.organizer ?? ""}`;
  const stage = classifyIchOpportunityStage(candidate);
  const reasons: string[] = [];
  let score = 0;
  if (APPLICATION_RE.test(text)) { score += 20; reasons.push("有申请/报名/开放入口信号"); }
  if (candidate.deadline_text) { score += 15; reasons.push("详情页提取到截止字段"); }
  if (applicantFit.matched_profiles.length > 0) { score += 15; reasons.push("标题或主办方出现明确申请主体信号"); }
  if (BENEFIT_RE.test(text)) { score += 15; reasons.push("出现收益、采购、资助或合作价值信号"); }
  if (source?.source_role === "opportunity_source" && ["L1", "L2"].includes(source.evidence_level)) { score += 20; reasons.push("来源登记为机会源且为 L1/L2"); }
  if (HERITAGE_RE.test(text)) { score += 15; reasons.push("出现非遗/传统工艺强相关信号"); }
  if (!ACTION_RE.test(text)) reasons.push("未发现明确行动动词");
  if (ANNOUNCEMENT_RE.test(text) && !ACTION_RE.test(text)) score = Math.max(0, score - 30);
  if (stage === "historical_record") score = Math.max(0, score - 30);
  if (source?.categories.includes("procurement_project") && IRRELEVANT_PROCUREMENT_RE.test(text) && !HERITAGE_RE.test(text) && !/文旅|文化|博物馆|美术馆|展览|研学|文创/i.test(text)) {
    score = Math.max(0, score - 30);
    reasons.push("采购标题命中设备/工程/IT/医疗等非文化领域，降权");
  }
  const actionability_score = Math.min(100, Math.max(0, score));
  const qualified_candidate = source?.source_role === "opportunity_source" && ["open_application", "open_call", "project_invitation", "policy_program"].includes(stage) && actionability_score >= 50;
  const high_quality_candidate = qualified_candidate && actionability_score >= 75;
  return { opportunity_stage: stage, actionability_score, actionability_reasons: reasons, qualified_candidate, high_quality_candidate };
}
