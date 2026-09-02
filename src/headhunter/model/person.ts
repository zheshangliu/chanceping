import type { EmploymentStatus } from "./lead";

export type RoleCategory =
  | "ta"
  | "recruiter"
  | "hrbp"
  | "hrd"
  | "business_leader"
  | "finance_leader"
  | "country_manager"
  | "ceo"
  | "coo"
  | "other";

export interface Person {
  person_id: string;
  name: string;
  linkedin_url: string | null;
  current_company_id: string | null;
  current_title: string | null;
  role_category: RoleCategory;
  employment_status: EmploymentStatus;
  employment_verified_at: string | null;
  source_urls: string[];
}

export function isRoleCategory(value: string): value is RoleCategory {
  return ["ta", "recruiter", "hrbp", "hrd", "business_leader", "finance_leader", "country_manager", "ceo", "coo", "other"].includes(value);
}
