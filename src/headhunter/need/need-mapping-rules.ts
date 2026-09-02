export const NEED_RULES = {
  factory_build: ["Factory Manager", "Overseas HR", "Finance", "Tax", "Quality", "Supply Chain"],
  new_license_finance: ["RO", "RA", "Compliance", "AML", "Risk", "Institutional", "Wealth"],
  regional_hq: ["Finance", "Treasury", "HR", "Legal / Compliance", "Regional Business"],
} as const;

export type NeedRuleKey = keyof typeof NEED_RULES;
