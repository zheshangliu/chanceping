import type { RadarRequirementSpec } from "../schema/radar-requirement-spec";
import type { OpportunityKind, SourceArchetypeId } from "../schema/radar-mvp-contracts";
import type { SearchResult } from "./types";

export type CandidateAuthorityTier =
  | "official_or_primary"
  | "credible_secondary"
  | "aggregator"
  | "reference_or_news"
  | "unknown";

export type CandidateCapStatus =
  | "included"
  | "excluded_by_cap"
  | "not_key_candidate";

export interface CandidateRankingAssessment {
  authorityTier: CandidateAuthorityTier;
  authorityScore: number;
  relevanceScore: number;
  freshnessScore: number;
  semanticScore: number;
  totalScore: number;
  capStatus: CandidateCapStatus;
  reasonCodes: string[];
  rankedAt: string;
}

export interface CandidateRankingOptions {
  maxKeyCandidates?: number;
  now?: Date;
}

export interface CandidateRankingResult {
  assessedResults: SearchResult[];
  keyCandidates: SearchResult[];
  overflowCandidates: SearchResult[];
}

const DEFAULT_MAX_KEY_CANDIDATES = 5;

const KEY_SEMANTIC_TYPES = new Set<OpportunityKind>([
  "direct_opportunity",
  "business_lead",
  "channel_partner_lead",
  "customer_lead",
]);

const HIGH_AUTHORITY_SOURCE_TYPES = new Set<SourceArchetypeId>([
  "official_event_site",
  "government_grant_page",
  "procurement_or_supplier_portal",
  "company_careers_or_contact",
  "open_call_submission_page",
  "exhibitor_sponsor_page",
]);

const MID_AUTHORITY_SOURCE_TYPES = new Set<SourceArchetypeId>([
  "business_matching_platform",
  "association_member_directory",
  "reseller_partner_page",
  "distributor_directory",
  "marketplace_partner_page",
]);

const AGGREGATOR_DOMAIN_RE = /bidcenter|zhaobiao|chinabidding|qianlima|caizhaowang|采购与招标网|采招|jobsdb|indeed|boss|zhipin|liepin|51job|linkedin|facebook/i;
const NEWS_DOMAIN_RE = /news|sina|sohu|163\.com|qq\.com|toutiao|thepaper|ifeng|medium|blog|zhihu|wikipedia|baike/i;
const GOV_OR_INSTITUTION_DOMAIN_RE = /\.gov(?:\.cn)?$|gov\.cn$|\.edu(?:\.cn)?$|\.org$|ac\.cn$|org\.cn$/i;
const DIRECT_OFFICIAL_DOMAIN_RE = /(wtt|ittf|nihonkiin|baduk|go\.or|gov\.cn|ccgp|mofcom|chinatax|customs|hkpc|enterprise|procurement)/i;

function normalize(value: unknown): string {
  return String(value ?? "").normalize("NFKC").toLowerCase();
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function textOf(result: SearchResult): string {
  return normalize(`${result.title} ${result.snippet} ${domainOf(result.url)}`);
}

function normalizedTitle(result: SearchResult): string {
  return normalize(result.title)
    .replace(/[\[\]【】()（）「」『』“”"'`·.,，。:：;；!?！？|｜\-_—–\s]+/g, "")
    .replace(/\b20\d{2}\b/g, "")
    .replace(/(新闻|报道|转载|来源|官网|官方网站|网站|页面)$/g, "")
    .trim();
}

function sameTopicTitle(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const aTailNumber = a.match(/(\d{1,3})$/)?.[1];
  const bTailNumber = b.match(/(\d{1,3})$/)?.[1];
  if (aTailNumber && bTailNumber && aTailNumber !== bTailNumber) return false;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length > b.length ? a : b;
  if (shorter.length >= 14 && longer.includes(shorter)) return true;
  const grams = new Set<string>();
  for (let i = 0; i <= shorter.length - 2; i += 1) grams.add(shorter.slice(i, i + 2));
  if (grams.size === 0) return false;
  let overlap = 0;
  for (const gram of grams) {
    if (longer.includes(gram)) overlap += 1;
  }
  return shorter.length >= 12 && overlap / grams.size >= 0.86;
}

function specSourceText(spec: RadarRequirementSpec): string {
  const radar = spec.radar_version;
  return normalize([
    ...(radar?.prioritySourceArchetypes ?? []),
    ...(radar?.queryFamilies ?? []).map((family) => family.sourceArchetype),
    ...(spec.source_strategy?.manual_sources ?? []),
    ...(spec.source_strategy?.user_supplied_sources ?? []).flatMap((source) => [source.source_name, source.source_url]),
  ].filter(Boolean).join(" "));
}

function sourceAuthority(result: SearchResult, spec: RadarRequirementSpec): Pick<CandidateRankingAssessment, "authorityTier" | "authorityScore" | "reasonCodes"> {
  const domain = domainOf(result.url);
  const text = textOf(result);
  const sourceText = specSourceText(spec);
  const reasonCodes: string[] = [];
  let score = 30;
  let tier: CandidateAuthorityTier = "unknown";

  if (result.source_archetype && HIGH_AUTHORITY_SOURCE_TYPES.has(result.source_archetype)) {
    score += 35;
    tier = "credible_secondary";
    reasonCodes.push("high_authority_source_archetype");
  } else if (result.source_archetype && MID_AUTHORITY_SOURCE_TYPES.has(result.source_archetype)) {
    score += 20;
    tier = "credible_secondary";
    reasonCodes.push("mid_authority_source_archetype");
  } else if (result.source_archetype === "reference_case_source") {
    score -= 25;
    tier = "reference_or_news";
    reasonCodes.push("reference_source");
  }

  if (GOV_OR_INSTITUTION_DOMAIN_RE.test(domain) || DIRECT_OFFICIAL_DOMAIN_RE.test(domain)) {
    score += 45;
    tier = "official_or_primary";
    reasonCodes.push("official_or_institution_domain");
  }
  if (sourceText && sourceText.length > 0) {
    const sourceTokens = sourceText
      .split(/[\s,，、/|:：;；()（）【】]+/)
      .filter((token) => token.length >= 3);
    if (sourceTokens.some((token) => text.includes(token))) {
      score += 20;
      if (tier === "unknown") tier = "credible_secondary";
      reasonCodes.push("matches_priority_source_text");
    }
  }
  if (AGGREGATOR_DOMAIN_RE.test(domain) || /聚合|招标平台|招聘平台|综合列表/.test(text)) {
    score -= 45;
    tier = "aggregator";
    reasonCodes.push("aggregator_or_platform");
  }
  if (NEWS_DOMAIN_RE.test(domain) || /新闻|报道|趋势|指南|百科|历史|规则/.test(text)) {
    score -= 35;
    tier = tier === "aggregator" ? tier : "reference_or_news";
    reasonCodes.push("news_or_reference");
  }
  const page = result.page_type_assessment;
  if (page?.keyCardEligibility === "reject") {
    score -= 80;
    reasonCodes.push("page_type_rejected");
  } else if (page?.keyCardEligibility === "downgrade") {
    score -= page.pageType === "directory_page" ? 20 : 55;
    reasonCodes.push(`page_type_${page.pageType}_downgraded`);
  } else if (page?.keyCardEligibility === "eligible") {
    score += 10;
    reasonCodes.push(`page_type_${page.pageType}_eligible`);
  }

  return {
    authorityTier: tier,
    authorityScore: Math.max(0, Math.min(100, score)),
    reasonCodes,
  };
}

function freshnessScore(result: SearchResult, now: Date): Pick<CandidateRankingAssessment, "freshnessScore" | "reasonCodes"> {
  const text = textOf(result);
  const years = Array.from(text.matchAll(/\b(20\d{2})\b/g)).map((match) => Number(match[1]));
  if (years.length === 0 && result.published_at) {
    const published = new Date(result.published_at);
    if (!Number.isNaN(published.getTime())) years.push(published.getFullYear());
  }
  const currentYear = now.getFullYear();
  if (years.length === 0) {
    return { freshnessScore: 45, reasonCodes: ["freshness_unknown"] };
  }
  const maxYear = Math.max(...years);
  if (maxYear < currentYear) {
    return { freshnessScore: 10, reasonCodes: ["stale_year_only"] };
  }
  if (years.some((year) => year > currentYear)) {
    return { freshnessScore: 90, reasonCodes: ["future_year_signal"] };
  }
  return { freshnessScore: 75, reasonCodes: ["current_year_signal"] };
}

function semanticScore(result: SearchResult): Pick<CandidateRankingAssessment, "semanticScore" | "reasonCodes"> {
  switch (result.semantic_type) {
    case "direct_opportunity":
      return { semanticScore: 90, reasonCodes: ["direct_opportunity"] };
    case "business_lead":
    case "channel_partner_lead":
    case "customer_lead":
      return { semanticScore: 68, reasonCodes: ["actionable_lead"] };
    case "association_directory":
      return { semanticScore: 50, reasonCodes: ["lead_resource"] };
    case "reference_case":
      return { semanticScore: 35, reasonCodes: ["reference_case"] };
    case "watch_signal":
      return { semanticScore: 30, reasonCodes: ["watch_signal"] };
    case "rejected":
      return { semanticScore: 0, reasonCodes: ["rejected"] };
    default:
      return { semanticScore: 25, reasonCodes: ["unknown_semantic_type"] };
  }
}

function isAcceptedKeyCandidate(result: SearchResult): boolean {
  if (result.candidate_judge_assessment && result.candidate_judge_assessment.decision !== "accept") return false;
  if (result.page_type_assessment && result.page_type_assessment.keyCardEligibility !== "eligible") return false;
  return Boolean(result.semantic_type && KEY_SEMANTIC_TYPES.has(result.semantic_type));
}

function assessRanking(result: SearchResult, spec: RadarRequirementSpec, options: Required<Pick<CandidateRankingOptions, "now">>): CandidateRankingAssessment {
  const authority = sourceAuthority(result, spec);
  const freshness = freshnessScore(result, options.now);
  const semantic = semanticScore(result);
  const relevanceScore = result.candidate_judge_assessment?.relevance_score
    ?? (result.relevance_assessment?.decision === "accept" ? 75 : result.relevance_assessment?.decision === "downgrade_to_watch_signal" ? 50 : 25);
  const totalScore = Math.round(
    authority.authorityScore * 0.35 +
    relevanceScore * 0.30 +
    freshness.freshnessScore * 0.20 +
    semantic.semanticScore * 0.15,
  );
  return {
    authorityTier: authority.authorityTier,
    authorityScore: authority.authorityScore,
    relevanceScore,
    freshnessScore: freshness.freshnessScore,
    semanticScore: semantic.semanticScore,
    totalScore,
    capStatus: isAcceptedKeyCandidate(result) ? "included" : "not_key_candidate",
    reasonCodes: [...authority.reasonCodes, ...freshness.reasonCodes, ...semantic.reasonCodes],
    rankedAt: options.now.toISOString(),
  };
}

export function rankCandidateResults(
  results: SearchResult[],
  spec: RadarRequirementSpec,
  options: CandidateRankingOptions = {},
): CandidateRankingResult {
  const maxKeyCandidates = Math.max(1, Math.min(options.maxKeyCandidates ?? DEFAULT_MAX_KEY_CANDIDATES, 10));
  const now = options.now ?? new Date();
  const assessed = results.map((result, index) => ({
    result,
    index,
    assessment: assessRanking(result, spec, { now }),
  }));

  const sorted = assessed
    .slice()
    .sort((a, b) => b.assessment.totalScore - a.assessment.totalScore || a.index - b.index);

  const keyUrls = new Set<string>();
  const overflowUrls = new Set<string>();
  const includedTitles: string[] = [];
  const duplicateUrls = new Set<string>();
  for (const item of sorted) {
    if (!isAcceptedKeyCandidate(item.result)) continue;
    const titleKey = normalizedTitle(item.result);
    const duplicate = includedTitles.some((included) => sameTopicTitle(included, titleKey));
    if (duplicate) {
      duplicateUrls.add(item.result.url);
      overflowUrls.add(item.result.url);
      continue;
    }
    if (keyUrls.size < maxKeyCandidates) {
      keyUrls.add(item.result.url);
      includedTitles.push(titleKey);
    } else {
      overflowUrls.add(item.result.url);
    }
  }

  const assessedResults = sorted.map((item) => {
    const capStatus: CandidateCapStatus = keyUrls.has(item.result.url)
      ? "included"
      : overflowUrls.has(item.result.url)
        ? "excluded_by_cap"
        : "not_key_candidate";
    const candidate_ranking_assessment: CandidateRankingAssessment = {
      ...item.assessment,
      capStatus,
      reasonCodes: capStatus === "excluded_by_cap"
        ? [
          ...item.assessment.reasonCodes,
          duplicateUrls.has(item.result.url) ? "near_duplicate_key_candidate" : "key_card_cap_exceeded",
        ]
        : item.assessment.reasonCodes,
    };
    const semantic_type: OpportunityKind | undefined = capStatus === "excluded_by_cap"
      ? "watch_signal"
      : item.result.semantic_type;
    return {
      ...item.result,
      original_semantic_type: item.result.original_semantic_type ?? item.result.semantic_type,
      semantic_type,
      candidate_ranking_assessment,
    };
  });

  const keyCandidates = assessedResults.filter((result) => result.candidate_ranking_assessment?.capStatus === "included" && isAcceptedKeyCandidate(result));
  const overflowCandidates = assessedResults.filter((result) => result.candidate_ranking_assessment?.capStatus === "excluded_by_cap");
  return { assessedResults, keyCandidates, overflowCandidates };
}
