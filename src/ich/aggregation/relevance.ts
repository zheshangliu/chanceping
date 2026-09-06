import type { AggregationItem, AggregationRelevance } from "./types";
import { classifyCategory } from "./adapters/common";

const CORE_TERMS = ["非遗", "非物质文化遗产", "传统文化", "传统工艺", "传统技艺", "文化遗产", "工艺美术", "手工艺", "heritage craft", "traditional craft", "craftsmanship", "artisan", "folk craft"];
const ADJACENT_TERMS = ["文创", "文化创意", "文博", "博物馆", "文旅", "旅游商品", "伴手礼", "城市礼物", "地方礼物", "国潮", "文化ip", "ip文创", "陶瓷", "陶艺", "漆艺", "刺绣", "织染", "竹编", "木雕", "石雕", "剪纸", "金工", "珐琅", "museum", "museum shop", "cultural product", "craft fair", "maker market", "maker", "handmade", "folk art"];
const EXTENSION_TERMS = ["乡村振兴", "地方文化", "地域文化", "文化品牌", "历史经典产业", "文化旅游", "文化商品", "文化产品", "创意产品", "特色产品", "传统材料", "地方特色", "文化空间", "文物ip", "open call", "award", "prize", "competition", "selling", "market", "fair", "residency", "grant", "commission"];
const NEGATIVE_TERMS = ["普通摄影", "摄影比赛", "纯平面", "ui", "ux", "软件界面", "汽车设计", "建筑施工", "房地产", "纯室内", "机械设计", "电子产品", "算法比赛", "程序设计", "普通广告", "student essay", "software design"];

function countTerms(value: string, terms: string[]): number {
  const lower = value.toLowerCase();
  return terms.reduce((count, term) => count + (lower.includes(term.toLowerCase()) ? 1 : 0), 0);
}

export function scoreAggregationRelevance(title: string, sourceCategory: string | null, rawText: string): { rule_relevance: number; relevance: AggregationRelevance; category: ReturnType<typeof classifyCategory> } {
  const value = `${title} ${sourceCategory ?? ""} ${rawText}`;
  const core = countTerms(value, CORE_TERMS);
  const adjacent = countTerms(value, ADJACENT_TERMS);
  const extension = countTerms(value, EXTENSION_TERMS);
  const negative = countTerms(value, NEGATIVE_TERMS);
  let score = Math.min(100, core * 35 + adjacent * 18 + extension * 7 - negative * 20);
  if (/非遗|非物质文化遗产|heritage craft|traditional craft/iu.test(title)) score += 20;
  score = Math.max(0, Math.min(100, score));
  const relevance: AggregationRelevance = core > 0 ? "CORE_ICH" : adjacent > 0 ? "ICH_ADJACENT" : extension > 0 ? "GENERAL_CREATIVE" : "IRRELEVANT";
  return { rule_relevance: score, relevance, category: classifyCategory(sourceCategory, title) };
}

export function semanticRelevance(item: Pick<AggregationItem, "title" | "raw_text" | "relevance">): number {
  if (item.relevance === "CORE_ICH") return 90;
  if (item.relevance === "ICH_ADJACENT") return 70;
  if (item.relevance === "GENERAL_CREATIVE") return 35;
  return 0;
}

export function isLikelyCurrent(deadlineAt: string | null, now = new Date()): boolean {
  return !deadlineAt || new Date(deadlineAt).getTime() >= now.getTime();
}
