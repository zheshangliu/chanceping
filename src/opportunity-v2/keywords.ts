import type { V2RadarRelevance } from "./types";

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
