import type { V2OpportunityDirection, V2ParticipationMode, V2ParticipationScope, V2RadarRelevance, V2WorkFormat } from "./types";

const STRONG_TERMS = [
  "非遗", "非物质文化遗产", "传统文化", "传统工艺", "传统技艺", "手工艺", "工艺美术", "传统艺术",
  "文创", "文化创意", "文博", "博物馆", "文旅", "文化旅游", "城市礼物", "地方礼物", "伴手礼", "旅游商品", "文化ip", "国潮",
  "陶瓷", "陶艺", "刺绣", "织染", "漆艺", "竹编", "木雕", "剪纸", "雕刻", "金工", "传统纹样",
  "craft", "craftsmanship", "heritage craft", "traditional craft", "artisan", "handmade", "maker", "cultural heritage",
  "applied arts", "decorative arts", "material craft", "fiber art", "fibre art", "textile art", "textile craft",
  "ceramics", "ceramic art", "pottery", "glass art", "glassmaking", "jewellery", "jewelry", "silversmith", "goldsmith",
  "metalwork", "woodwork", "woodworking", "basketry", "weaving", "embroidery", "printmaking", "folk art", "folk craft",
  "traditional making", "material practice", "designer-maker", "designer maker", "makers",
];
const GENERIC_TERMS = ["open call", "competition", "contest", "award", "residency", "exhibition", "grant", "market", "fair", "征集", "竞赛", "比赛", "展览"];
const NEGATIVE_TERMS = ["纯摄影", "摄影比赛", "普通建筑竞赛", "汽车设计", "机械设计", "程序设计", "算法比赛", "纯ui", "纯 UI", "软件界面"];

function hits(value: string, terms: string[]): string[] {
  const lower = value.toLowerCase();
  return terms.filter((term) => lower.includes(term.toLowerCase()));
}

export function classifyV2RadarRelevance(title: string, summary: string, sourceCategory = ""): { relevance: V2RadarRelevance; tags: string[] } {
  const value = `${title} ${summary} ${sourceCategory}`;
  const strong = hits(value, STRONG_TERMS);
  const generic = hits(value, GENERIC_TERMS);
  const negative = hits(value, NEGATIVE_TERMS);
  if (negative.length > 0 && strong.length === 0) return { relevance: "IRRELEVANT", tags: [...new Set([...negative, ...generic])] };
  if (strong.length > 0) return { relevance: "RELEVANT", tags: [...new Set([...strong, ...generic])].slice(0, 8) };
  if (generic.length > 0) return { relevance: "UNCERTAIN", tags: generic.slice(0, 8) };
  return { relevance: "IRRELEVANT", tags: [] };
}

const DIRECTION_RULES: Array<[V2OpportunityDirection, RegExp]> = [
  ["aigc_digital", /aigc|生成式\s*ai|人工智能创作|ai创作|数字创作/iu],
  ["ich_innovation", /非遗|非物质文化遗产|传统文化|传统技艺|传承/u],
  ["cultural_creative", /文创|文化创意|城市礼物|地方礼物|伴手礼|国潮|文化ip|文博文旅/u],
  ["craft_arts", /工艺美术|手工艺|craft|craftsmanship|artisan|handmade|ceramic|陶瓷|刺绣|织染|漆艺|竹编|木雕|珠宝|jewellery|jewelry/iu],
  ["museum_tourism", /博物馆|文物|文旅|文化旅游|旅游商品/u],
  ["integrated_cultural_design", /综合文化|综合设计|文化设计|文化艺术/iu],
];

const WORK_FORMAT_RULES: Array<[V2WorkFormat, RegExp]> = [
  ["material_craft", /实物工艺|材料工艺|陶瓷|陶艺|木雕|竹编|刺绣|织染|漆艺|金工/iu],
  ["product_design", /产品设计|文创产品|伴手礼|旅游商品|product design/iu],
  ["graphic_ip", /平面|插画|视觉|海报|ip形象|吉祥物|logo|graphic|illustration/iu],
  ["packaging", /包装设计|包装|packaging/iu],
  ["fashion_jewellery", /服饰|首饰|珠宝|服装|jewellery|jewelry|fashion/iu],
  ["video_animation", /视频|动画|短片|影像|video|animation|film/iu],
  ["interaction_game", /交互|互动|游戏|interaction|game|体验设计/iu],
  ["mixed_media", /综合媒介|综合材料|mixed media|跨媒介/iu],
];

export function classifyV2Dimensions(title: string, summary: string, category: string): {
  directions: V2OpportunityDirection[];
  work_formats: V2WorkFormat[];
  event_location: string | null;
  participation_scope: V2ParticipationScope;
  participation_mode: V2ParticipationMode;
} {
  const value = `${title} ${summary}`;
  const directions = DIRECTION_RULES.filter(([, pattern]) => pattern.test(value)).map(([key]) => key);
  if (directions.length === 0 && category === "competition" && /文化|艺术|设计/u.test(value)) directions.push("integrated_cultural_design");
  const work_formats = WORK_FORMAT_RULES.filter(([, pattern]) => pattern.test(value)).map(([key]) => key);
  const eventMatch = value.match(/(?:举办地|活动地点|展出地点|赛事地点|地点|地址)\s*[:：]?\s*([^，。；;\n]{2,48})/iu);
  const scope: V2ParticipationScope = /面向全球|全球征集|全球可投|international open/iu.test(value)
      ? "global"
    : /面向全国|全国征集|全国可投|全国范围/iu.test(value)
      ? "nationwide"
      : /限(?:于|定)?[^，。；;\n]{2,20}(?:地区|省|市|境内)/iu.test(value) ? "regional" : "unspecified";
  const mode: V2ParticipationMode = /线上提交|在线提交|网上报名|online submission|online application/iu.test(value)
    ? "online"
    : /实物寄送|邮寄作品|需到场|现场提交|in person|onsite/iu.test(value)
      ? (/需到场|现场提交|in person|onsite/iu.test(value) ? "onsite" : "physical")
      : "unspecified";
  return { directions, work_formats, event_location: eventMatch?.[1]?.trim() ?? null, participation_scope: scope, participation_mode: mode };
}
