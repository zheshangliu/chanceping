import type { RadarRequirementSpec } from "../schema/radar-requirement-spec";
import type { SearchIntentType } from "../schema/radar-mvp-contracts";

export interface SearchTheme {
  id: string;
  themeName: string;
  intentType: SearchIntentType;
  sourceArchetype: string;
  queryExamples: string[];
  whyThisTheme: string;
}

export interface SearchQueryFamilyItem {
  query: string;
  language: string;
  region?: string;
  sourceDomain?: string;
  themeName: string;
  intentType: SearchIntentType;
  sourceArchetype: string;
  queryFamily: "broad_discovery" | "official_source" | "action_keyword" | "region_language" | "source_hint";
}

export interface SearchIntentPlan {
  searchThemes: SearchTheme[];
  queries: SearchQueryFamilyItem[];
}

const MAX_THEMES = 5;
const MAX_QUERIES_PER_THEME = 3;

function compactTerms(terms: Array<string | undefined>, limit: number): string[] {
  return Array.from(new Set(
    terms
      .map((term) => String(term ?? "").trim())
      .filter(Boolean),
  )).slice(0, limit);
}

function joinTerms(terms: string[], fallback: string): string {
  const text = compactTerms(terms, 5).join(" ");
  return text || fallback;
}

function detectQueryLanguage(query: string): string {
  const hasZh = /[\u4e00-\u9fff]/.test(query);
  const hasKana = /[\u3040-\u30ff]/.test(query);
  const hasHangul = /[\uac00-\ud7af]/.test(query);
  const hasEn = /[a-z]/i.test(query);
  if ((hasZh || hasKana || hasHangul) && hasEn) return "mixed";
  if (hasKana) return "ja";
  if (hasHangul) return "ko";
  if (hasEn) return "en";
  return "zh";
}

function sourceDomain(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function buildQuery(
  theme: Omit<SearchTheme, "queryExamples">,
  query: string,
  queryFamily: SearchQueryFamilyItem["queryFamily"],
  region?: string,
  sourceUrl?: string,
): SearchQueryFamilyItem {
  return {
    query: query.replace(/\s+/g, " ").trim(),
    language: detectQueryLanguage(query),
    ...(region ? { region } : {}),
    ...(sourceUrl ? { sourceDomain: sourceDomain(sourceUrl) } : {}),
    themeName: theme.themeName,
    intentType: theme.intentType,
    sourceArchetype: theme.sourceArchetype,
    queryFamily,
  };
}

function uniqueQueries(items: SearchQueryFamilyItem[]): SearchQueryFamilyItem[] {
  const seen = new Set<string>();
  const out: SearchQueryFamilyItem[] = [];
  for (const item of items) {
    const key = item.query.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function buildSearchIntentPlan(spec: RadarRequirementSpec, baseQuery: string): SearchIntentPlan {
  const identity = spec.client_profile?.business_type || spec.client_profile?.industry || spec.client_profile?.client_type || "用户";
  const primaryGoal = spec.core_goals?.primary_goal || baseQuery || "机会";
  const opportunityTypes = compactTerms(spec.opportunity_scope?.primary_opportunity_types ?? [], 4);
  const actions = compactTerms(spec.core_goals?.action_intent ?? [], 4);
  const zhKeywords = compactTerms(spec.keyword_strategy?.core_keywords_zh ?? [], 5);
  const enKeywords = compactTerms(spec.keyword_strategy?.core_keywords_en ?? [], 4);
  const regions = compactTerms([
    ...(spec.region_scope?.primary_regions ?? []),
    ...(spec.client_profile?.regions ?? []),
  ], 3);
  const manualSources = compactTerms(spec.source_strategy?.manual_sources ?? [], 4);
  const userSources = (spec.source_strategy?.user_supplied_sources ?? [])
    .map((source) => ({
      name: source.source_name || source.source_url,
      url: source.source_url,
    }))
    .filter((source) => source.name || source.url)
    .slice(0, 3);

  const topic = joinTerms([identity, ...opportunityTypes, ...zhKeywords], primaryGoal);
  const actionText = joinTerms([...actions, ...opportunityTypes], "报名 申请 合作 采购");
  const regionText = regions.join(" ") || "全国";
  const enText = joinTerms(enKeywords, topic);

  const themeSeeds: Array<Omit<SearchTheme, "queryExamples"> & { queries: SearchQueryFamilyItem[] }> = [];

  const directTheme = {
    id: "theme_direct_opportunity",
    themeName: "直接机会入口",
    intentType: "direct_opportunity" as const,
    sourceArchetype: "官方公告 / 报名申请 / 招采入口",
    whyThisTheme: "优先寻找能直接报名、申报、投稿、投标或申请的页面。",
  };
  themeSeeds.push({
    ...directTheme,
    queries: [
      buildQuery(directTheme, `${topic} ${actionText} 官方公告`, "broad_discovery", regions[0]),
      buildQuery(directTheme, `${topic} 报名 申请 招标 采购 截止`, "action_keyword", regions[0]),
      buildQuery(directTheme, `${regionText} ${topic} 机会 通知`, "region_language", regions[0]),
    ],
  });

  const leadTheme = {
    id: "theme_business_lead",
    themeName: "可行动线索",
    intentType: "business_lead" as const,
    sourceArchetype: "采购合作 / 供应商入库 / 招聘与 BD 入口",
    whyThisTheme: "很多行业机会不是公开报名页，而是需要联系确认的采购、合作、招聘或客户线索。",
  };
  themeSeeds.push({
    ...leadTheme,
    queries: [
      buildQuery(leadTheme, `${identity} ${topic} 供应商 入库 合作 联系`, "broad_discovery", regions[0]),
      buildQuery(leadTheme, `${topic} 客户线索 采购 合作 伙伴 招募`, "action_keyword", regions[0]),
      buildQuery(leadTheme, `${regionText} ${topic} 招商 合作 contact partner`, "region_language", regions[0]),
    ],
  });

  const watchTheme = {
    id: "theme_watch_signal",
    themeName: "观察信号",
    intentType: "watch_signal" as const,
    sourceArchetype: "协会日历 / 新闻公告 / 趋势和计划信号",
    whyThisTheme: "保留短期不能直接行动但能提示下一轮监控方向的来源。",
  };
  themeSeeds.push({
    ...watchTheme,
    queries: [
      buildQuery(watchTheme, `${topic} 日历 计划 趋势 2026`, "broad_discovery", regions[0]),
      buildQuery(watchTheme, `${topic} 协会 公告 活动 观察`, "official_source", regions[0]),
      buildQuery(watchTheme, `${enText} calendar events trends`, "region_language", regions[0]),
    ],
  });

  const referenceTheme = {
    id: "theme_reference_case",
    themeName: "参考案例与规则",
    intentType: "reference_case" as const,
    sourceArchetype: "往届案例 / 规则费用 / 获奖名单 / 方案参考",
    whyThisTheme: "用参考案例、费用规则和往届信息帮助用户改材料、定打法和避风险。",
  };
  themeSeeds.push({
    ...referenceTheme,
    queries: [
      buildQuery(referenceTheme, `${topic} 案例 往届 获奖名单`, "broad_discovery", regions[0]),
      buildQuery(referenceTheme, `${topic} 规则 费用 资格 条款`, "action_keyword", regions[0]),
      buildQuery(referenceTheme, `${enText} case rules fee eligibility`, "region_language", regions[0]),
    ],
  });

  const firstUserSource = userSources[0];
  const firstManualSource = manualSources[0];
  if (firstUserSource || firstManualSource) {
    const sourceTheme = {
      id: "theme_configured_source",
      themeName: "指定来源复核",
      intentType: "direct_opportunity" as const,
      sourceArchetype: "用户指定官网 / 平台 / 协会来源",
      whyThisTheme: "用户指定的信号源优先复核，但只代表搜索发现，不代表字段已核验。",
    };
    const sourceName = firstUserSource?.name || firstManualSource || "指定来源";
    const sourceUrl = firstUserSource?.url || "";
    themeSeeds.push({
      ...sourceTheme,
      queries: [
        buildQuery(sourceTheme, `${sourceName} ${topic}`, "source_hint", regions[0], sourceUrl),
        buildQuery(sourceTheme, `${sourceName} ${actionText}`, "official_source", regions[0], sourceUrl),
        buildQuery(sourceTheme, `${sourceName} announcement application`, "region_language", regions[0], sourceUrl),
      ],
    });
  }

  const selected = themeSeeds.slice(0, MAX_THEMES);
  const searchThemes: SearchTheme[] = selected.map((theme) => ({
    id: theme.id,
    themeName: theme.themeName,
    intentType: theme.intentType,
    sourceArchetype: theme.sourceArchetype,
    queryExamples: theme.queries.slice(0, MAX_QUERIES_PER_THEME).map((item) => item.query),
    whyThisTheme: theme.whyThisTheme,
  }));
  const queries = uniqueQueries(selected.flatMap((theme) => theme.queries.slice(0, MAX_QUERIES_PER_THEME))).slice(0, MAX_THEMES * MAX_QUERIES_PER_THEME);
  return { searchThemes, queries };
}
