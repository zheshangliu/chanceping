import type { RadarRequirementSpec } from "../schema/radar-requirement-spec";
import type { SearchIntentType, SourceArchetypeId } from "../schema/radar-mvp-contracts";
import type { SearchQueryFamilyItem } from "./opportunity-strategy";
import type { SearchResult } from "./types";

export type CandidateSourceIntegrityKind =
  | "trusted_primary"
  | "credible_secondary"
  | "weak_aggregator"
  | "weak_social"
  | "weak_reference"
  | "generic_document"
  | "unknown";

export interface CandidateSourceIntegrityAssessment {
  kind: CandidateSourceIntegrityKind;
  reasonCodes: string[];
  basis: "search_result_metadata";
}

const WEAK_AGGREGATOR_DOMAIN_RE = /(?:^|\.)(?:glassdoor|indeed|jobsdb|zhaopin|zhipin|liepin|51job|linkedin|gaoxiaojob|bidcenter|chinabidding|qianlima|caizhaowang|onezh|hnzbcgxxw)\./i;
const WEAK_SOCIAL_DOMAIN_RE = /(?:^|\.)(?:douyin|tiktok|xiaohongshu|weibo|bilibili|facebook|instagram|youtube)\./i;
const NEWS_OR_REFERENCE_DOMAIN_RE = /(?:^|\.)(?:news|sina|sohu|163|qq|toutiao|thepaper|ifeng|zhihu|medium|xinhuanet)\./i;
const TRUSTED_PRIMARY_DOMAIN_RE = /\.gov(?:\.cn)?$|\.edu(?:\.cn)?$|\.ac\.cn$|(?:^|\.)(?:ccgp|mofcom|chinatax|customs|wtt|ittf|nihonkiin|baduk)\./i;
const GENERIC_DOCUMENT_TITLE_RE = /^(?:\[pdf\]\s*)?(?:(?:[\u4e00-\u9fff]{2,12})(?:省|市|县))?(?:政府采购)?(?:项目)?(?:公开)?(?:招标|采购)(?:文件|需求书)(?:\s*[-—]\s*[\u4e00-\u9fff]{2,16})?$/i;
const GENERIC_LIST_TITLE_RE = /\b\d+\s+[^|]{0,40}jobs? in\b|\bjobs? in\b|招聘职位列表|职位列表|岗位汇总|job listings?|glassdoor/i;
const NAMED_ACTION_RE = /征集|大赛|精品展|展览|展会|交易会|赛事|公开赛|项目|招标|采购|供应商|报名|投稿|open call|submission|competition|tournament|trade fair|tender|procurement|supplier/i;

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

function cleanCandidateTitle(title: string): string {
  return normalize(title)
    .replace(/^\[pdf\]\s*/i, "")
    .replace(/\s*[-|｜—]\s*(?:抖音|douyin|小红书|xiaohongshu|微博|weibo|glassdoor|indeed|linkedin|知乎|zhihu).*$/i, "")
    .replace(/\s*[-|｜—]\s*(?:第一展会网|[^-|｜—]{0,16}招标采购[^-|｜—]{0,12}(?:平台|公共服务平台|信息网)|[^-|｜—]{0,12}(?:展会网|招标网|采购网))\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isGenericDocumentTitle(title: string): boolean {
  return GENERIC_DOCUMENT_TITLE_RE.test(normalize(title));
}

export function assessCandidateSourceIntegrity(result: SearchResult): CandidateSourceIntegrityAssessment {
  const domain = domainOf(result.url);
  if (isGenericDocumentTitle(result.title)) {
    return { kind: "generic_document", reasonCodes: ["generic_action_document_without_subject"], basis: "search_result_metadata" };
  }
  if (WEAK_SOCIAL_DOMAIN_RE.test(domain)) {
    return { kind: "weak_social", reasonCodes: ["social_post_requires_original_source"], basis: "search_result_metadata" };
  }
  if (WEAK_AGGREGATOR_DOMAIN_RE.test(domain)) {
    return { kind: "weak_aggregator", reasonCodes: ["aggregator_requires_original_source"], basis: "search_result_metadata" };
  }
  if (TRUSTED_PRIMARY_DOMAIN_RE.test(domain)) {
    return { kind: "trusted_primary", reasonCodes: ["trusted_primary_domain"], basis: "search_result_metadata" };
  }
  if (NEWS_OR_REFERENCE_DOMAIN_RE.test(domain)) {
    return { kind: "weak_reference", reasonCodes: ["secondary_reference_requires_original_source"], basis: "search_result_metadata" };
  }
  return { kind: "unknown", reasonCodes: ["source_integrity_unknown"], basis: "search_result_metadata" };
}

function recoverySourceArchetype(title: string): SourceArchetypeId {
  if (/招标|采购|供应商|投标|tender|procurement|supplier/i.test(title)) return "procurement_or_supplier_portal";
  if (/征集|投稿|作品|open call|submission/i.test(title)) return "open_call_submission_page";
  if (/招聘|职位|岗位|career|job/i.test(title)) return "company_careers_or_contact";
  return "official_event_site";
}

function recoveryIntent(result: SearchResult): SearchIntentType {
  const intent = result.intent_type ?? result.original_semantic_type ?? result.semantic_type;
  if (
    intent === "direct_opportunity" ||
    intent === "business_lead" ||
    intent === "channel_partner_lead" ||
    intent === "customer_lead" ||
    intent === "association_directory" ||
    intent === "watch_signal" ||
    intent === "reference_case"
  ) return intent;
  return "direct_opportunity";
}

function hasSpecificRecoverableTitle(result: SearchResult): boolean {
  const title = cleanCandidateTitle(result.title);
  if (title.length < 8 || GENERIC_LIST_TITLE_RE.test(title) || isGenericDocumentTitle(title)) return false;
  return NAMED_ACTION_RE.test(title) || /[“"][^”"]{2,}[”"]/.test(title);
}

export function buildPrimarySourceRecoveryQueries(
  results: SearchResult[],
  _spec: RadarRequirementSpec,
  maxQueries = 2,
): SearchQueryFamilyItem[] {
  const limit = Math.max(0, Math.min(maxQueries, 2));
  const seen = new Set<string>();
  const queries: SearchQueryFamilyItem[] = [];
  for (const result of results) {
    const integrity = assessCandidateSourceIntegrity(result);
    if (integrity.kind !== "weak_social" && integrity.kind !== "weak_aggregator" && integrity.kind !== "weak_reference") continue;
    if (!hasSpecificRecoverableTitle(result)) continue;
    const title = cleanCandidateTitle(result.title);
    const query = /[\u4e00-\u9fff]/.test(title)
      ? `${title} 主办方 官方 原始公告`
      : `${title} official original source`;
    const key = query.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const sourceArchetype = recoverySourceArchetype(title);
    queries.push({
      query,
      language: /[\u4e00-\u9fff]/.test(query) ? "zh" : "en",
      themeName: "可信主来源反查",
      intentType: recoveryIntent(result),
      sourceArchetype,
      sourceArchetypeLabel: "候选对应的主办方、发布方或采购方原始页面",
      queryFamily: "primary source recovery",
      queryVariant: "official_source",
    });
    if (queries.length >= limit) break;
  }
  return queries;
}
