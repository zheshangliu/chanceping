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

export interface DiscoveryTheme {
  segment: "hk_finance" | "gba_company" | "outbound_manufacturing";
  scope: "mainland" | "hk_global";
  theme: string;
  query: string;
}

/** V1.2 Stage 0: bounded, segment-specific discovery themes. */
export function planV12DiscoveryThemes(): DiscoveryTheme[] {
  const groups: Array<{ segment: DiscoveryTheme["segment"]; scope: DiscoveryTheme["scope"]; subject: string; themes: string[] }> = [
    { segment: "hk_finance", scope: "hk_global", subject: "Hong Kong financial services company", themes: ["hiring recruitment expansion", "new license new business wealth management brokerage", "office branch expansion management hire", "funding IPO acquisition", "compliance AML risk treasury finance transformation", "institutional banking talent", "new team senior management appointment"] },
    { segment: "gba_company", scope: "mainland", subject: "广州 黄埔 科学城 GBA company", themes: ["new project expansion", "new headquarters regional headquarters", "financing funding", "new production line capacity", "major order new business", "recruitment hiring expansion", "government industry park cooperation", "official website manufacturing investment project hiring", "黄埔区 新能源 制造 企业 扩产 招聘 官网", "广州 科学城 industrial park company factory expansion careers"] },
    { segment: "outbound_manufacturing", scope: "mainland", subject: "China manufacturing company", themes: ["Vietnam Thailand Malaysia Indonesia Mexico factory", "overseas production capacity transfer", "new overseas plant expansion", "Country Manager factory HR finance supply chain", "local management team global hiring", "overseas recruitment expansion", "overseas subsidiary management hiring", "China manufacturer official website overseas factory investment hiring", "中国制造企业 越南 工厂 扩建 招聘 官网", "China manufacturing company ASEAN plant project careers"] },
  ];
  return groups.flatMap((group) => group.themes.map((theme) => ({ ...group, theme, query: `${group.subject} ${theme}` })));
}

export function planHeadhunterSearch(context: SearchPlanContext): SearchPlan {
  const names = context.companyNames.slice(0, 20);
  const intents: HeadhunterSearchIntent[] = names.map((name) => ({ intent_type: "DISCOVER_COMPANY", scope: context.scope, query: name }));
  return { themes: HEADHUNTER_SEARCH_THEMES, intents };
}
