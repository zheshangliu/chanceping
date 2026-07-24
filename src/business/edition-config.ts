export const BUSINESS_EDITION_IDS = ["guangzhou", "tianhe", "shaoguan"] as const;

export type BusinessEditionId = typeof BUSINESS_EDITION_IDS[number];

export interface BusinessEditionConfig {
  id: BusinessEditionId;
  route: `/${BusinessEditionId}`;
  name: string;
  shortName: string;
  headline: string;
  subheadline: string;
  tagline: string;
  audienceDescription: string;
  featuredCategories: string[];
  exampleScenario: string;
  aiEntry: { source: "business-radar"; edition: BusinessEditionId; prompt: string };
  seo: { title: string; description: string; canonicalPath: string };
  footerNote: string;
}

export const BUSINESS_COMMON_CONFIG = {
  productName: "ChancePing 城市企业机会雷达",
  brandName: "ChancePing",
  primaryCtaLabel: "查看最新机会",
  aiCtaLabel: "让 AI 帮我筛选",
  sourceCtaLabel: "信息来源",
  disclaimer: "ChancePing 提供公开机会信息的整理与决策辅助，不代替主办方正式规则。报名、申报或合作前，请以官方最新通知为准。",
  categoryOrder: ["competition", "exhibition", "procurement", "channel", "policy", "international"],
} as const;

export const BUSINESS_EDITIONS: Record<BusinessEditionId, BusinessEditionConfig> = {
  guangzhou: {
    id: "guangzhou", route: "/guangzhou", name: "ChancePing 广州企业机会雷达", shortName: "广州企业机会",
    headline: "让一个人也拥有企业机会部",
    subheadline: "持续发现适合广州 OPC 与中小企业的政策、赛事、采购、展会和产业合作机会。",
    tagline: "一个创业者，一支 AI 机会团队。", audienceDescription: "广州 OPC、创业者、初创团队与中小企业",
    featuredCategories: ["competition", "policy", "procurement"],
    exampleScenario: "我是广州一家非遗文创企业，希望寻找未来三个月适合参加的比赛、展会和渠道合作机会。",
    aiEntry: { source: "business-radar", edition: "guangzhou", prompt: "我是广州的一名 OPC 或中小企业负责人。请根据我的企业、项目、行业和目标，帮我寻找未来三个月适合参加的比赛、政策、采购、展会、渠道合作和产业机会，并说明推荐理由、风险和下一步行动。" },
    seo: { title: "ChancePing 广州企业机会雷达｜OPC 与中小企业机会发现", description: "持续整理适合广州 OPC 与中小企业的政策、赛事、采购、展会、渠道与产业合作机会。", canonicalPath: "/guangzhou" }, footerNote: "广州企业机会版本",
  },
  tianhe: {
    id: "tianhe", route: "/tianhe", name: "盯一下·天河企业机会雷达", shortName: "天河企业机会",
    headline: "让天河企业更早发现下一次机会",
    subheadline: "为天河中小企业与创业者持续整理政策、赛事、采购、渠道及产业合作机会。",
    tagline: "让一个人也拥有企业机会部。", audienceDescription: "天河区 OPC、创业者、产业园企业与中小企业",
    featuredCategories: ["policy", "competition", "procurement", "channel"],
    exampleScenario: "我是天河区的一名 OPC，希望寻找本地政策、创业比赛和企业服务采购机会。",
    aiEntry: { source: "business-radar", edition: "tianhe", prompt: "我是天河区的一名 OPC。请帮我寻找未来三个月适合参加的天河本地政策、广州创业比赛、企业服务采购、渠道合作和产业资源机会，并说明推荐理由、风险和下一步行动。" },
    seo: { title: "盯一下·天河企业机会雷达｜天河 OPC 与中小企业机会", description: "为天河 OPC、创业者和中小企业持续整理本地政策、赛事、采购、渠道与产业合作机会。", canonicalPath: "/tianhe" }, footerNote: "天河企业机会版本",
  },
  shaoguan: {
    id: "shaoguan", route: "/shaoguan", name: "ChancePing 韶关产业机会雷达", shortName: "韶关产业机会",
    headline: "让产业机会成为可以被发现、理解和行动的数据",
    subheadline: "面向韶关 OPC 与中小企业的产业机会发现、数据整理与智能决策平台。",
    tagline: "用 AI 降低超级个体与中小企业获取产业机会的门槛。", audienceDescription: "韶关 OPC、特色产业主体、创业团队与中小企业",
    featuredCategories: ["policy", "procurement", "exhibition", "international"],
    exampleScenario: "我是韶关一家特色产业小微企业，希望寻找产业扶持、展销、采购和全国合作机会。",
    aiEntry: { source: "business-radar", edition: "shaoguan", prompt: "我是韶关一家特色产业小微企业或 OPC。请帮我寻找未来三个月适合的产业扶持、政策资金、展会展销、采购项目、渠道合作和全国性产业机会，并说明适合条件、风险和下一步行动。" },
    seo: { title: "ChancePing 韶关产业机会雷达｜OPC 与中小企业产业机会", description: "面向韶关 OPC 与中小企业整理政策、采购、展会、产业合作和全国机会。", canonicalPath: "/shaoguan" }, footerNote: "韶关产业机会版本",
  },
};

export function isBusinessEditionId(value: string | undefined): value is BusinessEditionId {
  return Boolean(value && BUSINESS_EDITION_IDS.includes(value as BusinessEditionId));
}

export function getBusinessEdition(value: string | undefined): BusinessEditionConfig | null {
  return isBusinessEditionId(value) ? BUSINESS_EDITIONS[value] : null;
}
