import type { NeedBasis } from "../model/lead";
import type { RoleCategory } from "../model/person";
import { roleLabel, type BdAction } from "./bd-action-generator";

export interface OutreachContext {
  company_name: string;
  recipient_name?: string | null;
  role_category: RoleCategory | "official_entry";
  trigger_summary: string;
  need_basis: NeedBasis | null;
  capability_hint?: string | null;
}

export interface OutreachDraft {
  role_category: OutreachContext["role_category"];
  subject: string;
  body: string;
  inference_language: boolean;
}

export function generateOutreach(context: OutreachContext): OutreachDraft {
  const recipient = context.recipient_name ? `${context.recipient_name} 您好，` : `${roleLabel(context.role_category)}您好，`;
  const capability = context.capability_hint ?? "相关岗位与团队搭建";
  const inferred = context.need_basis !== "explicit_hiring";
  const body = inferred
    ? `${recipient}\n\n留意到${context.company_name}${context.trigger_summary}。这类变化可能带来${capability}需求；如贵司近期正在筹备当地核心团队，我们可以按岗位方向提供市场映射和候选人支持。\n\n如方向合适，欢迎告知贵司当前优先级。`
    : `${recipient}\n\n留意到${context.company_name}公开发布了与${capability}相关的岗位。我们专注于该类岗位的候选人搜寻与交付，如方便，希望了解贵司当前的招聘优先级并提供一份针对性的市场简报。\n\n谢谢。`;
  return { role_category: context.role_category, subject: `${context.company_name}｜${capability}支持`, body, inference_language: inferred };
}

export function displayAction(manualAction: string | null, generatedAction: BdAction): string {
  return manualAction ?? generatedAction.next_step;
}

export function displayOutreach(manualOutreach: string | null, generatedOutreach: OutreachDraft): string {
  return manualOutreach ?? generatedOutreach.body;
}
