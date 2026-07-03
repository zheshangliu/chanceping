import type { RadarRequirementSpec } from "../schema/radar-requirement-spec";

export interface KeywordPack {
  literalKeywords: string[];
  matchKeywords: string[];
  actionKeywords: string[];
  sourceKeywords: string[];
}

const ACTION_KEYWORDS = [
  "报名",
  "申请",
  "申报",
  "征集",
  "招募",
  "招标",
  "采购",
  "入驻",
  "参展",
  "投稿",
  "联系",
  "合作",
  "供应商",
  "展位",
  "摊位",
  "寄售",
  "评选",
  "遴选",
  "apply",
  "application",
  "registration",
  "register",
  "submit",
  "submission",
  "tender",
  "procurement",
  "vendor",
  "supplier",
  "partner",
  "reseller",
  "distributor",
  "contact",
  "careers",
  "jobs",
  "応募",
  "募集",
];

const SOURCE_KEYWORDS = [
  "官网",
  "官方",
  "协会",
  "平台",
  "目录",
  "采购网",
  "供应商入口",
  "招聘页",
  "展会",
  "活动页",
  "联系页",
  "商家中心",
  "official",
  "association",
  "portal",
  "directory",
  "marketplace",
  "supplier portal",
  "vendor portal",
  "partner page",
  "careers",
  "contact",
  "expo",
  "conference",
  "fair",
  "grant",
  "accelerator",
];

const STOP_TERMS = new Set([
  "2024",
  "2025",
  "2026",
  "2027",
  "site",
  "www",
  "com",
  "cn",
  "org",
  "net",
  "the",
  "and",
  "for",
  "with",
  "from",
  "this",
  "that",
]);

function normalizeText(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function cleanTerm(value: string): string {
  return normalizeText(value)
    .replace(/^site:/, "")
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[()（）【】"'“”‘’]/g, "")
    .trim();
}

function termParts(value: string): string[] {
  const clean = cleanTerm(value);
  if (!clean) return [];
  const parts = clean
    .split(/[\s,，、/|:：;；!！?？]+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 2 && part.length <= 48)
    .filter((part) => !STOP_TERMS.has(part))
    .filter((part) => !/^\d+$/.test(part));
  return parts.length > 0 ? parts : [clean];
}

function addTerms(target: Set<string>, values: Array<string | undefined>): void {
  for (const value of values) {
    const clean = cleanTerm(String(value ?? ""));
    if (!clean) continue;
    target.add(clean);
    for (const part of termParts(clean)) {
      target.add(part);
    }
  }
}

function arrayFromSet(set: Set<string>, limit = 160): string[] {
  return Array.from(set)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, limit);
}

export function buildKeywordPack(spec: RadarRequirementSpec): KeywordPack {
  const literal = new Set<string>();
  const match = new Set<string>();
  const action = new Set<string>();
  const source = new Set<string>();
  const radarVersion = spec.radar_version;
  const queryFamilies = radarVersion?.queryFamilies ?? [];
  const userSources = spec.source_strategy?.user_supplied_sources ?? [];

  addTerms(literal, [
    ...(spec.keyword_strategy?.core_keywords_zh ?? []),
    ...(spec.keyword_strategy?.core_keywords_en ?? []),
    ...(spec.opportunity_scope?.primary_opportunity_types ?? []),
    ...(radarVersion?.opportunityIntents ?? []),
  ]);

  addTerms(match, [
    ...literal,
    spec.client_profile?.business_type,
    spec.client_profile?.industry,
    spec.core_goals?.primary_goal,
    ...(radarVersion?.highValueCriteria ?? []),
    ...(radarVersion?.opportunityIntents ?? []),
  ]);

  for (const family of queryFamilies) {
    addTerms(match, [
      family.familyName,
      family.whyThisFamily,
      family.sourceArchetype,
      ...(family.queries ?? []),
      ...(family.queryVariants ?? []).map((item) => item.query),
    ]);
    addTerms(source, [family.sourceArchetype]);
  }

  addTerms(source, [
    ...(radarVersion?.prioritySourceArchetypes ?? []),
    ...(spec.source_strategy?.manual_sources ?? []),
    ...userSources.map((item) => item.source_name),
    ...userSources.map((item) => item.source_url),
  ]);

  addTerms(action, ACTION_KEYWORDS);
  addTerms(source, SOURCE_KEYWORDS);

  return {
    literalKeywords: arrayFromSet(literal),
    matchKeywords: arrayFromSet(match),
    actionKeywords: arrayFromSet(action),
    sourceKeywords: arrayFromSet(source),
  };
}

export function keywordPackMatches(text: string, pack: KeywordPack): boolean {
  const haystack = normalizeText(text);
  if (!haystack) return false;
  const candidates = [
    ...pack.matchKeywords,
    ...pack.actionKeywords,
    ...pack.sourceKeywords,
  ].map(cleanTerm).filter((item) => item.length >= 2);
  return candidates.some((keyword) => haystack.includes(keyword));
}
