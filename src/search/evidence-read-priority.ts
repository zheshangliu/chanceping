import type { RadarRequirementSpec } from "../schema/radar-requirement-spec";
import type { SearchResult } from "./types";

interface PrioritizeEvidenceReadInput {
  keyCandidates: SearchResult[];
  rawCandidates: SearchResult[];
  /** Fallback budget for non-priority key candidates. Priority sources are read without this cap. */
  maxUrls: number;
  spec?: RadarRequirementSpec;
}

function normalize(value: unknown): string {
  return String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function textOf(result: SearchResult): string {
  return normalize(`${result.title} ${result.snippet} ${result.url}`).toLowerCase();
}

function specText(spec?: RadarRequirementSpec): string {
  const radar = spec?.radar_version;
  return normalize([
    radar?.targetUser,
    radar?.businessContext,
    ...(radar?.opportunityIntents ?? []),
    ...(radar?.highValueCriteria ?? []),
    ...(radar?.prioritySourceArchetypes ?? []),
    ...(radar?.queryFamilies ?? []).flatMap((family) => [family.familyName, family.sourceArchetype, ...(family.queries ?? [])]),
    spec?.core_goals?.primary_goal,
    ...(spec?.opportunity_scope?.primary_opportunity_types ?? []),
  ].filter(Boolean).join(" ")).toLowerCase();
}

function isGovCnDomain(domain: string): boolean {
  return domain === "gov.cn" || domain.endsWith(".gov.cn") || domain.endsWith(".gov.com.cn");
}

function isConcreteDevpostEventPage(result: SearchResult): boolean {
  try {
    const url = new URL(result.url);
    const domain = url.hostname.replace(/^www\./, "").toLowerCase();
    const path = url.pathname.toLowerCase().replace(/\/+$/, "");
    return domain.endsWith(".devpost.com") &&
      domain !== "devpost.com" &&
      (path === "" || path === "/" || /^\/(?:rules|resources|submissions?|updates)$/.test(path));
  } catch {
    return false;
  }
}

function isTraeCompetitionPage(result: SearchResult): boolean {
  const text = textOf(result);
  try {
    const url = new URL(result.url);
    const domain = url.hostname.replace(/^www\./, "").toLowerCase();
    if (domain !== "forum.trae.cn") return false;
  } catch {
    return false;
  }
  return /trae/i.test(text) && /ai|创造力|创作|vibe|coding|比赛|大赛|竞赛|报名|提交|规则|challenge|contest|competition/i.test(text);
}

export function isOfficialGovernmentNews(result: SearchResult): boolean {
  const domain = domainOf(result.url);
  if (!isGovCnDomain(domain)) return false;
  const text = textOf(result);
  return /新闻|报道|快讯|发布会|通知|公告|news|press|media/.test(text);
}

function hasAiEventClue(result: SearchResult, spec?: RadarRequirementSpec): boolean {
  const text = textOf(result);
  const radarText = specText(spec);
  if (!/(?:^|[^a-z])ai(?:[^a-z]|$)|人工智能|大模型|agent|智能|qwen|通义|hackathon|马拉松|开发者|挑战赛|比赛|竞赛|大赛/i.test(`${text} ${radarText}`)) {
    return false;
  }
  return /hackathon|马拉松|competition|challenge|contest|比赛|竞赛|大赛|developer|开发者|qwen|通义|cloud|云资源/.test(text);
}

function hasActionSignal(result: SearchResult): boolean {
  return /报名|申请|参赛|提交|作品|入口|截止|奖金|云资源|扶持|registration|register|apply|application|submit|submission|deadline|prize|credits|grant|entry/i.test(textOf(result));
}

function isLowPriorityReadSource(result: SearchResult): boolean {
  const text = textOf(result);
  const domain = domainOf(result.url);
  if (isConcreteDevpostEventPage(result) || isTraeCompetitionPage(result)) return false;
  return /(?:^|\.)(?:x|twitter|youtube|instagram|facebook|reddit|tiktok|douyin|xiaohongshu|weibo|bilibili|linkedin|zhihu)\./i.test(domain) ||
    /(?:^|\.)(?:linkedin|zhihu)\.com$/i.test(domain) ||
    /\/(?:pulse|discover\/what-is|what-is|blog|guide|guides|learn|resources\/what-is)(?:[-/?#]|$)/i.test(text) ||
    /视频|集锦|百科|维基|规则介绍|历史活动|往届|回顾|培训广告|培训班|课程|泛资讯|论坛讨论|youtube|playlist|wikipedia|baike|rules|history|recap/i.test(text);
}

function isAggregateOrCategoryPage(result: SearchResult): boolean {
  const text = textOf(result);
  try {
    const url = new URL(result.url);
    const domain = url.hostname.replace(/^www\./, "").toLowerCase();
    const path = url.pathname.toLowerCase();
    if (domain === "devpost.com" && (/^\/c\//.test(path) || /^\/hackathons?\/?$/.test(path) || /^\/software\/?$/.test(path))) return true;
    if (domain === "dorahacks.io" && (/^\/hackathon\/?$/.test(path) || /^\/hackathons?\/?$/.test(path))) return true;
    if (domain === "lablab.ai" && (/^\/?$/.test(path) || /^\/ai-hackathons?\/?$/.test(path) || /^\/event\/?$/.test(path) || /^\/events\/?$/.test(path))) return true;
  } catch {
    // fall through to text heuristics
  }
  return /分类|合集|列表|目录|category|collection|directory|all hackathons|browse/i.test(text) && !hasActionSignal(result);
}

function isGenericNonGovernmentNews(result: SearchResult): boolean {
  if (isOfficialGovernmentNews(result)) return false;
  const domain = domainOf(result.url);
  const text = textOf(result);
  return /(?:^|\.)(?:news|sina|sohu|163|qq|toutiao|thepaper|ifeng|zhihu|medium|linkedin)\./i.test(domain) ||
    /新闻|报道|快讯|转载|news roundup|press release|media report/i.test(text);
}

function isConcreteEventPlatformPage(result: SearchResult, spec?: RadarRequirementSpec): boolean {
  const domain = domainOf(result.url);
  if (isConcreteDevpostEventPage(result)) return hasAiEventClue(result, spec) || hasActionSignal(result);
  if (!/(?:^|\.)(?:devpost|dorahacks|lablab|kaggle|hackathon|eventbrite)\./i.test(domain)) return false;
  if (isAggregateOrCategoryPage(result)) return false;
  return hasAiEventClue(result, spec) || hasActionSignal(result);
}

function isOfficialActionSource(result: SearchResult): boolean {
  const text = textOf(result);
  const domain = domainOf(result.url);
  const officialLike = isGovCnDomain(domain) ||
    /\.edu(?:\.cn)?$|\.ac\.cn$|\.org$|org\.cn$/i.test(domain) ||
    /(?:^|\.)(?:alibabacloud|aliyun|qwen|aws|googlecloud|cloud\.google|microsoft|azure|tencentcloud|huaweicloud|baidu|volcengine|trae)\./i.test(domain) ||
    isConcreteDevpostEventPage(result) ||
    isTraeCompetitionPage(result);
  return officialLike && hasActionSignal(result) && !isAggregateOrCategoryPage(result);
}

function isSpecificOfficialEventPage(result: SearchResult, spec?: RadarRequirementSpec): boolean {
  if (isTraeCompetitionPage(result) || isConcreteDevpostEventPage(result)) return hasAiEventClue(result, spec) || hasActionSignal(result);
  return result.source_archetype === "official_event_site" &&
    hasAiEventClue(result, spec) &&
    !isAggregateOrCategoryPage(result) &&
    !isGenericNonGovernmentNews(result);
}

function isPlannedActionEntry(result: SearchResult): boolean {
  const plannedActionSources = new Set([
    "official_event_site",
    "open_call_submission_page",
    "government_grant_page",
    "procurement_or_supplier_portal",
    "exhibitor_sponsor_page",
    "business_matching_platform",
    "reseller_partner_page",
    "marketplace_partner_page",
  ]);
  const eligiblePage = result.page_type_assessment?.keyCardEligibility === "eligible";
  return hasActionSignal(result) && !isAggregateOrCategoryPage(result) &&
    (plannedActionSources.has(result.source_archetype ?? "") || eligiblePage);
}

export function isHighPriorityEvidenceSource(result: SearchResult, spec?: RadarRequirementSpec): boolean {
  if (isLowPriorityReadSource(result) && !isOfficialGovernmentNews(result)) return false;
  if (isGenericNonGovernmentNews(result) && !isOfficialGovernmentNews(result)) return false;
  if (isAggregateOrCategoryPage(result) && !isConcreteDevpostEventPage(result) && !isTraeCompetitionPage(result)) return false;
  return isOfficialGovernmentNews(result) ||
    isConcreteEventPlatformPage(result, spec) ||
    isSpecificOfficialEventPage(result, spec) ||
    isOfficialActionSource(result) ||
    isPlannedActionEntry(result) ||
    (/qwen\s*cloud|qwencloud|通义|阿里云|alibaba cloud/i.test(textOf(result)) && hasActionSignal(result) && !isAggregateOrCategoryPage(result));
}

function evidencePriorityScore(result: SearchResult, isKeyCandidate: boolean, spec?: RadarRequirementSpec): number {
  const text = textOf(result);
  const domain = domainOf(result.url);
  let score = isKeyCandidate ? 100 : 0;

  if (isLowPriorityReadSource(result) && !isOfficialGovernmentNews(result)) score -= 140;
  if (isAggregateOrCategoryPage(result)) score -= 90;
  if (isHighPriorityEvidenceSource(result, spec)) score += 180;
  if (isOfficialGovernmentNews(result)) score += 115;
  if (isConcreteEventPlatformPage(result, spec)) score += 105;
  if (/qwen\s*cloud|qwencloud|通义|阿里云|alibaba cloud/i.test(text) && /hackathon|马拉松|比赛|竞赛|challenge|contest/i.test(text)) score += 120;
  if (hasActionSignal(result)) score += 55;
  if (/official|官网|主办方|官方|organizer|application|registration/i.test(text)) score += 35;
  if (/(?:^|\.)(?:sina|sohu|163|qq|toutiao|thepaper|ifeng|zhihu|medium)\./i.test(domain)) score -= 80;
  if (/视频|集锦|百科|维基|培训广告|培训班|课程|youtube|playlist|wikipedia|baike/i.test(text)) score -= 90;

  return score;
}

export function prioritizeEvidenceReadCandidates(input: PrioritizeEvidenceReadInput): SearchResult[] {
  const fallbackMaxUrls = Math.max(0, input.maxUrls);

  const keyUrls = new Set(input.keyCandidates.map((item) => item.url).filter(Boolean));
  const candidates = [...input.keyCandidates, ...input.rawCandidates.filter((item) => !keyUrls.has(item.url))];
  const seen = new Set<string>();
  const sorted = candidates
    .map((result, index) => ({
      result,
      index,
      score: evidencePriorityScore(result, keyUrls.has(result.url), input.spec),
      priority: isHighPriorityEvidenceSource(result, input.spec),
    }))
    .filter((item) => item.result.url && item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .filter((item) => {
      const key = item.result.url;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  const priorityItems = sorted.filter((item) => item.priority);
  const fallbackKeyItems = sorted
    .filter((item) => !item.priority && keyUrls.has(item.result.url) && !isLowPriorityReadSource(item.result))
    .slice(0, fallbackMaxUrls);
  const mergedSeen = new Set<string>();
  return [...priorityItems, ...fallbackKeyItems]
    .filter((item) => {
      if (mergedSeen.has(item.result.url)) return false;
      mergedSeen.add(item.result.url);
      return true;
    })
    .map((item) => item.result);
}
