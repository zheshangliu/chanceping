import type { HeadhunterSearchIntent } from "./intents";

export const HEADHUNTER_SEARCH_THEMES = [
  "HK 金融企业事件",
  "HK 金融招聘",
  "广州/黄埔/GBA 企业",
  "中国企业出海",
  "跨境制造",
  "联系人与采购信号",
] as const;

export interface SearchPlan {
  themes: readonly string[];
  intents: HeadhunterSearchIntent[];
}

export interface SearchPlanContext {
  scope: "mainland" | "hk_global" | "people";
  companyNames: string[];
}

export function planHeadhunterSearch(context: SearchPlanContext): SearchPlan {
  const names = context.companyNames.slice(0, 20);
  const intents: HeadhunterSearchIntent[] = names.map((name) => ({ intent_type: "DISCOVER_COMPANY", scope: context.scope, query: name }));
  return { themes: HEADHUNTER_SEARCH_THEMES, intents };
}
