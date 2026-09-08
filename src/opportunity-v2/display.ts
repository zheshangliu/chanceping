import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { OpportunityV2 } from "./types";

export const OPPORTUNITY_V2_DISPLAY_STRATEGY = "deterministic-zh-v1.2";

export interface OpportunityV2Translation {
  opportunity_id: string;
  source_hash: string;
  target_language: "zh-CN";
  strategy_version: typeof OPPORTUNITY_V2_DISPLAY_STRATEGY;
  title_zh: string;
  summary_zh: string;
  status: "translated" | "pending" | "failed";
  updated_at: string;
}

export interface OpportunityV2TranslationFile {
  schema_version: "chanceping-opportunity-v2.translation.v1";
  updated_at: string;
  translations: OpportunityV2Translation[];
}

export interface OpportunityV2Display {
  title: string;
  original_title: string | null;
  summary: string;
  original_summary: string | null;
  translated: boolean;
}

function translationPath(filePath?: string): string {
  return path.resolve(filePath ?? process.env.CHANCEPING_OPPORTUNITY_V2_TRANSLATION_PATH ?? "data/opportunity-v2/translations.json");
}

function sourceHash(item: Pick<OpportunityV2, "title" | "summary">): string {
  return crypto.createHash("sha256").update(`${item.title}\n${item.summary}`, "utf8").digest("hex");
}

export function readOpportunityV2Translations(filePath?: string): OpportunityV2Translation[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(translationPath(filePath), "utf8")) as OpportunityV2TranslationFile;
    return Array.isArray(parsed.translations) ? parsed.translations : [];
  } catch {
    return [];
  }
}

export function writeOpportunityV2Translations(translations: OpportunityV2Translation[], filePath?: string): void {
  const target = translationPath(filePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify({
    schema_version: "chanceping-opportunity-v2.translation.v1",
    updated_at: new Date().toISOString(),
    translations,
  }, null, 2)}\n`, "utf8");
  fs.renameSync(temp, target);
}

const SOURCE_ZH: Record<string, string> = {
  "loewe-craft-prize": "LOEWE基金会工艺奖",
  "craft-scotland-opportunities": "苏格兰工艺机会",
  "heritage-crafts-opportunities": "英国传统工艺机会",
  "asef-culture360-opportunities": "亚洲—欧洲基金会文化360机会",
  "homo-faber-calls": "Homo Faber工艺机会",
  "craft-council-bc-calls": "不列颠哥伦比亚工艺协会机会",
  "crafts-council-opportunities": "英国工艺协会机会",
  "contest-watchers-open": "Contest Watchers国际竞赛机会",
  "artconnect-opportunities": "ArtConnect艺术机会",
  "competitions-archi": "Competitions.archi设计竞赛",
};

const PHRASES: Array<[RegExp, string]> = [
  [/\bcall for site-responsive proposals\b/giu, "场域响应提案征集"],
  [/\bcall for entries?\b/giu, "参赛征集"],
  [/\bopen call\b/giu, "公开征集"],
  [/\bapplication(s)?\b/giu, "申请"],
  [/\bparticipation\b/giu, "参与"],
  [/\bproposal(s)?\b/giu, "提案"],
  [/\bopportunit(y|ies)\b/giu, "机会"],
  [/\baward(s)?\b/giu, "奖项"],
  [/\bprize\b/giu, "奖"],
  [/\bcompetition(s)?\b/giu, "竞赛"],
  [/\bcontest(s)?\b/giu, "比赛"],
  [/\bgrant(s)?\b/giu, "资助"],
  [/\bresidenc(y|ies)\b/giu, "驻留"],
  [/\bfellowship(s)?\b/giu, "研修"],
  [/\bexhibition(s)?\b/giu, "展览"],
  [/\bmarket(s)?\b/giu, "市集"],
  [/\bfestival(s)?\b/giu, "艺术节"],
  [/\bcraft(s|smanship)?\b/giu, "工艺"],
  [/\bheritage\b/giu, "传统文化"],
  [/\bdesign(er|ers)?\b/giu, "设计"],
  [/\bart(ist|ists)?\b/giu, "艺术家"],
  [/\bdigital artwork\b/giu, "数字艺术作品"],
  [/\bphotography\b/giu, "摄影"],
  [/\bceramics?\b/giu, "陶瓷"],
  [/\bclay\b/giu, "陶土"],
  [/\btextile(s)?\b/giu, "纺织"],
  [/\bjewel(l)?ery\b/giu, "珠宝"],
  [/\bprogram(me)?\b/giu, "计划"],
  [/\bscheme\b/giu, "计划"],
  [/\bculture\b/giu, "文化"],
  [/\bglobal\b/giu, "全球"],
  [/\binternational\b/giu, "国际"],
];

function hasCjk(value: string): boolean { return /[\u3400-\u9fff]/u.test(value); }
function hasForeignText(value: string): boolean { return /[A-Za-z]{3,}|[\uac00-\ud7af]/u.test(value); }

function titleTranslation(item: OpportunityV2): string {
  const lower = item.title.toLowerCase();
  if (lower.includes("loewe foundation") && lower.includes("craft prize")) return "LOEWE基金会工艺奖 2027";
  if (lower.includes("tokyo biennale")) return "东京双年展 2027｜场域响应提案征集";
  if (lower.includes("everyday photography")) return "日常摄影 2026 资助计划";
  if (lower.includes("white rabbit gallery")) return "白兔画廊 2026 数字艺术作品征集";
  if (lower.includes("greece") && lower.includes("residency")) return "希腊｜陶土与陶瓷艺术教育者驻留";
  let translated = item.title;
  for (const [pattern, replacement] of PHRASES) translated = translated.replace(pattern, replacement);
  translated = translated.replace(/\s{2,}/gu, " ").replace(/\s+([｜：])/gu, "$1").trim();
  const source = SOURCE_ZH[item.source_id];
  if (!hasCjk(translated) || /[A-Za-z]{8,}/u.test(translated)) {
    return `${source ?? "海外机会"}｜${translated}`;
  }
  return translated;
}

function summaryTranslation(item: OpportunityV2): string {
  const original = item.summary.trim();
  const compact = original
    .replace(/20\d{2}[./-]\d{1,2}[./-]\d{1,2}(?:\s*[-至]\s*(?:20\d{2}[./-])?\d{1,2}[./-]\d{1,2})?/gu, " ")
    .replace(/(?:报名中|截止时间?\s*[:：]?|申请截止|截稿至|截至|截止)[^|｜;；]{0,32}/gu, " ")
    .replace(/[|｜]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  const residual = compact.replace(/[\d\s.,:;!?()（）\[\]【】/\\-]/gu, "");
  const mostlyEnglish = (original.match(/[A-Za-z]/gu) ?? []).length > 20 && (original.match(/[\u3400-\u9fff]/gu) ?? []).length < 12;
  const navigationNoise = /\b(how to participate|winners?|finalists?|jury|experts?|intro|previous|next|menu|about)\b/iu.test(original);
  if (hasCjk(original) && !mostlyEnglish && !navigationNoise && residual.length >= 8 && !/\b(the|for|call|application|deadline|open)\b/iu.test(original)) return compact;
  const source = SOURCE_ZH[item.source_id] ?? item.source_name;
  const action = /grant|fund/iu.test(`${item.title} ${original}`) ? "资助申请" : /residen|fellowship/iu.test(`${item.title} ${original}`) ? "驻留或研修申请" : /market|festival/iu.test(`${item.title} ${original}`) ? "市集或活动参与" : "赛事、公开征集或作品申请";
  const deadline = item.deadline ? `，已列明截止日期为 ${item.deadline.slice(0, 10)}` : "，截止日期待从来源原文确认";
  return `来自${source}的${action}信息${deadline}。参赛范围、材料与提交方式请以来源原文为准。`;
}

export function isForeignLanguageOpportunity(item: OpportunityV2): boolean {
  return hasForeignText(item.title) && !hasCjk(item.title);
}

export function createOpportunityV2Translation(item: OpportunityV2, now = new Date()): OpportunityV2Translation {
  return {
    opportunity_id: item.id,
    source_hash: sourceHash(item),
    target_language: "zh-CN",
    strategy_version: OPPORTUNITY_V2_DISPLAY_STRATEGY,
    title_zh: titleTranslation(item),
    summary_zh: summaryTranslation(item),
    status: "translated",
    updated_at: now.toISOString(),
  };
}

export function buildOpportunityV2Display(item: OpportunityV2, translations: OpportunityV2Translation[] = []): OpportunityV2Display {
  const cached = translations.find((entry) => entry.opportunity_id === item.id && entry.source_hash === sourceHash(item) && entry.target_language === "zh-CN" && entry.strategy_version === OPPORTUNITY_V2_DISPLAY_STRATEGY && entry.status === "translated");
  if (cached && isForeignLanguageOpportunity(item)) {
    return { title: cached.title_zh, original_title: item.title, summary: cached.summary_zh, original_summary: item.summary || null, translated: true };
  }
  if (isForeignLanguageOpportunity(item)) {
    return { title: titleTranslation(item), original_title: item.title, summary: summaryTranslation(item), original_summary: item.summary || null, translated: true };
  }
  return { title: item.title, original_title: null, summary: summaryTranslation(item), original_summary: null, translated: false };
}

export function isLikelyForeignText(value: string): boolean { return hasForeignText(value) && !hasCjk(value); }
