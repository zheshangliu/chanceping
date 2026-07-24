import type { BusinessEditionId } from "./edition-config";
import type { OpportunityCategory } from "./opportunity";

export interface BusinessSource {
  id: string; name: string; officialUrl: string; editions: BusinessEditionId[]; categories: OpportunityCategory[];
  coverage: string; refreshCadence: "daily" | "weekly"; admissionPolicy: string;
}

/** Official portals only. A portal is a discovery source, not public opportunity data by itself. */
export const BUSINESS_SOURCES: BusinessSource[] = [
  { id: "china-government-procurement", name: "中国政府采购网", officialUrl: "https://www.ccgp.gov.cn/", editions: ["guangzhou", "tianhe", "shaoguan"], categories: ["procurement"], coverage: "全国及地方政府采购公告", refreshCadence: "daily", admissionPolicy: "仅采纳可回到项目原文、采购状态可判断且与目标企业相关的公告。" },
  { id: "guangzhou-government", name: "广州市人民政府门户网站", officialUrl: "https://www.gz.gov.cn/", editions: ["guangzhou", "tianhe"], categories: ["policy", "procurement", "competition", "exhibition"], coverage: "广州市政策、通知与公开信息", refreshCadence: "daily", admissionPolicy: "仅采纳明确面向企业、可申报或可参与的官方通知。" },
  { id: "guangzhou-industry-information", name: "广州市工业和信息化局", officialUrl: "https://gxj.gz.gov.cn/", editions: ["guangzhou", "tianhe"], categories: ["policy", "competition", "procurement"], coverage: "中小企业、制造业与产业创新申报", refreshCadence: "daily", admissionPolicy: "优先采纳仍在申报期、面向中小企业且有明确材料或平台入口的通知。" },
  { id: "guangzhou-science-technology", name: "广州市科学技术局", officialUrl: "https://kjj.gz.gov.cn/", editions: ["guangzhou", "tianhe"], categories: ["policy", "competition"], coverage: "科技企业认定与科技项目申报", refreshCadence: "daily", admissionPolicy: "仅采纳申报批次未截止、适用对象和申报流程明确的官方通知。" },
  { id: "tianhe-government", name: "广州市天河区人民政府门户网站", officialUrl: "https://www.thnet.gov.cn/", editions: ["tianhe", "guangzhou"], categories: ["policy", "procurement", "competition"], coverage: "天河区政策、通知与公开信息", refreshCadence: "daily", admissionPolicy: "优先采纳天河区主体可行动且仍在有效期内的公告。" },
  { id: "shaoguan-government", name: "韶关市人民政府门户网站", officialUrl: "https://www.sg.gov.cn/", editions: ["shaoguan"], categories: ["policy", "procurement", "exhibition", "channel"], coverage: "韶关市政策、通知与公开信息", refreshCadence: "daily", admissionPolicy: "仅采纳具备明确受众、申报入口或项目行动信息的公告。" },
];

export function sourcesForEdition(edition: BusinessEditionId): BusinessSource[] { return BUSINESS_SOURCES.filter((source) => source.editions.includes(edition)); }
