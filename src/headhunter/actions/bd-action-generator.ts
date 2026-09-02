import type { RoleCategory } from "../model/person";
import type { NeedBasis } from "../model/lead";

export interface BdActionContext {
  company_name: string;
  role_category: RoleCategory | "official_entry";
  trigger_summary: string;
  need_basis: NeedBasis | null;
  contact_label?: string | null;
}

export interface BdAction {
  action_type: "linkedin" | "email" | "phone" | "research";
  role_category: BdActionContext["role_category"];
  title: string;
  next_step: string;
  basis: NeedBasis | null;
}

export function generateBdAction(context: BdActionContext): BdAction {
  const action_type = context.role_category === "official_entry" ? "email" : context.role_category === "ta" || context.role_category === "recruiter" || context.role_category === "hrbp" || context.role_category === "hrd" ? "linkedin" : "email";
  const contact = context.contact_label ? `（入口：${context.contact_label}）` : "";
  return {
    action_type,
    role_category: context.role_category,
    title: `联系${roleLabel(context.role_category)}${contact}`,
    next_step: context.need_basis === "explicit_hiring" ? `围绕公开岗位与交付能力，向${roleLabel(context.role_category)}确认优先招聘需求。` : `围绕“${context.trigger_summary}”向${roleLabel(context.role_category)}确认近期是否有团队筹备计划。`,
    basis: context.need_basis,
  };
}

export function roleLabel(role: BdActionContext["role_category"]): string {
  return ({ ta: "Talent Acquisition / 招聘负责人", recruiter: "Recruiter / 招聘负责人", hrbp: "HRBP", hrd: "HRD", business_leader: "业务负责人", finance_leader: "财务负责人", country_manager: "国家/海外负责人", ceo: "CEO", coo: "COO", official_entry: "官方公司入口", other: "相关负责人" } as Record<BdActionContext["role_category"], string>)[role];
}
