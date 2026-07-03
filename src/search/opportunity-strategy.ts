import type { RadarRequirementSpec } from "../schema/radar-requirement-spec";
import type {
  OpportunityKind,
  SearchIntentType,
  SearchQueryVariant,
  SourceArchetypeId,
} from "../schema/radar-mvp-contracts";
import type { RadarVersionQueryFamily } from "../schema/radar-version-spec";

export interface SearchTheme {
  id: string;
  themeName: string;
  intentType: SearchIntentType;
  sourceArchetype: SourceArchetypeId;
  sourceArchetypeLabel: string;
  queryFamily: string;
  queryExamples: string[];
  whyThisTheme: string;
  priority: number;
}

export interface SearchQueryFamilyItem {
  query: string;
  language: string;
  region?: string;
  sourceDomain?: string;
  themeName: string;
  intentType: SearchIntentType;
  sourceArchetype: SourceArchetypeId;
  sourceArchetypeLabel: string;
  queryFamily: string;
  queryVariant: SearchQueryVariant;
}

export interface OpportunityStrategy {
  radarVersion: string;
  searchThemes: SearchTheme[];
  queries: SearchQueryFamilyItem[];
  sourceArchetypes: Array<{ id: SourceArchetypeId; label: string }>;
  resultBucketPolicy: Record<OpportunityKind, "key_opportunity" | "actionable_lead" | "lead_resource" | "observation" | "reference" | "audit_only">;
  evidenceReadPriority: string[];
}

const MAX_THEMES = 5;
const MAX_QUERIES_PER_THEME = 3;

const ACTION_RE = /报名|申请|申报|招标|采购|投稿|投标|入驻|注册|联系|合作|registration|application|apply|tender|procurement|submission|supplier|contact|partner/i;
const SOURCE_RE = /官方|官网|协会|目录|平台|portal|directory|association|official|marketplace|agency|chamber/i;
const REGION_RE = /中国|广东|广州|深圳|香港|新加坡|马来西亚|泰国|越南|印尼|日本|韩国|东南亚|国际|asean|southeast asia|singapore|malaysia|thailand|vietnam|indonesia|japan|korea/i;

export const RESULT_BUCKET_POLICY: OpportunityStrategy["resultBucketPolicy"] = {
  direct_opportunity: "key_opportunity",
  business_lead: "actionable_lead",
  channel_partner_lead: "actionable_lead",
  customer_lead: "actionable_lead",
  association_directory: "lead_resource",
  watch_signal: "observation",
  reference_case: "reference",
  rejected: "audit_only",
};

export function normalizeOpportunityIntent(value: RadarVersionQueryFamily["intentType"] | string | undefined): SearchIntentType {
  if (value === "retail_customer_lead") return "customer_lead";
  if (
    value === "direct_opportunity" ||
    value === "business_lead" ||
    value === "channel_partner_lead" ||
    value === "customer_lead" ||
    value === "association_directory" ||
    value === "watch_signal" ||
    value === "reference_case"
  ) return value;
  return "business_lead";
}

export function normalizeSourceArchetype(label: string): SourceArchetypeId {
  const text = label.toLowerCase();
  if (/open call|submission|征集|投稿/.test(text)) return "open_call_submission_page";
  if (/exhibitor|sponsor|展商|赞助/.test(text)) return "exhibitor_sponsor_page";
  if (/business matching|商务配对/.test(text)) return "business_matching_platform";
  if (/supplier portal|vendor portal|procurement|采购|供应商/.test(text)) return "procurement_or_supplier_portal";
  if (/marketplace/.test(text)) return "marketplace_partner_page";
  if (/reseller|pos|erp|partner|合作|渠道|代理|实施伙伴/.test(text)) return "reseller_partner_page";
  if (/distributor|wholesaler|分销|批发/.test(text)) return "distributor_directory";
  if (/association|member directory|协会|会员目录|chamber/.test(text)) return "association_member_directory";
  if (/grant|government|政府|补贴|扶持|investment agency/.test(text)) return "government_grant_page";
  if (/career|招聘|contact|联系人/.test(text)) return "company_careers_or_contact";
  if (/case|winner|rule|reference|案例|往届|规则/.test(text)) return "reference_case_source";
  return "official_event_site";
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

function inferQueryVariant(query: string): SearchQueryVariant {
  if (ACTION_RE.test(query)) return "action_keyword";
  if (SOURCE_RE.test(query)) return "official_source";
  if (REGION_RE.test(query)) return "region_language";
  return "broad_discovery";
}

function recoveryVariants(family: RadarVersionQueryFamily): Array<{ query: string; variant: SearchQueryVariant }> {
  const text = [
    family.familyName,
    family.intentType,
    family.sourceArchetype,
    family.whyThisFamily,
    ...(family.queries ?? []),
  ].join(" ").toLowerCase();
  const variants: Array<{ query: string; variant: SearchQueryVariant }> = [];

  if (/ai|agent|hackathon|developer|startup|cloud|accelerator|创业|开发者|云厂商|大赛|黑客松/.test(text)) {
    variants.push(
      { query: "AI Agent Hackathon developer challenge application 2026", variant: "action_keyword" },
      { query: "cloud startup program startup credits accelerator application 2026", variant: "source_archetype" },
    );
  }
  if (/seller|marketplace|cross-border|ecommerce|e-commerce|fulfillment|warehouse|平台|卖家|跨境电商|平台招商|大促|海外仓|履约/.test(text)) {
    variants.push(
      { query: "marketplace seller program platform campaign application 2026", variant: "action_keyword" },
      { query: "marketplace partner fulfillment partner overseas warehouse partner", variant: "source_archetype" },
    );
  }
  return variants;
}

function explicitVariants(family: RadarVersionQueryFamily): Array<{ query: string; variant: SearchQueryVariant }> {
  const supplied = family.queryVariants?.filter((item) => item.query.trim()).slice(0, MAX_QUERIES_PER_THEME) ?? [];
  if (supplied.length > 0) return supplied;
  const base = family.queries
    .filter((query) => query.trim())
    .map((query) => ({ query, variant: inferQueryVariant(query) }));
  const seen = new Set<string>();
  return [...base, ...recoveryVariants(family)]
    .filter((item) => {
      const key = item.query.toLowerCase().replace(/\s+/g, " ").trim();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_QUERIES_PER_THEME);
}

function uniqueSourceArchetypes(labels: string[]): Array<{ id: SourceArchetypeId; label: string }> {
  const seen = new Set<string>();
  const result: Array<{ id: SourceArchetypeId; label: string }> = [];
  for (const label of labels) {
    const cleanLabel = String(label ?? "").trim();
    if (!cleanLabel) continue;
    const id = normalizeSourceArchetype(cleanLabel);
    const key = `${id}:${cleanLabel.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ id, label: cleanLabel });
  }
  return result;
}

export function buildOpportunityStrategy(spec: RadarRequirementSpec): OpportunityStrategy | null {
  const radarVersion = spec.radar_version;
  const families = radarVersion?.queryFamilies?.slice(0, MAX_THEMES) ?? [];
  if (!radarVersion || families.length === 0) return null;

  const searchThemes: SearchTheme[] = families.map((family, index) => {
    const variants = explicitVariants(family);
    return {
      id: `theme_radar_version_${index + 1}`,
      themeName: family.familyName,
      intentType: normalizeOpportunityIntent(family.resultBucket || family.intentType),
      sourceArchetype: normalizeSourceArchetype(family.sourceArchetype),
      sourceArchetypeLabel: family.sourceArchetype,
      queryFamily: family.familyName,
      queryExamples: variants.map((item) => item.query),
      whyThisTheme: family.whyThisFamily,
      priority: index + 1,
    };
  });

  const queries = families.flatMap((family, index) => {
    const theme = searchThemes[index];
    return explicitVariants(family).map((item) => ({
      query: item.query.replace(/\s+/g, " ").trim(),
      language: detectQueryLanguage(item.query),
      themeName: theme.themeName,
      intentType: theme.intentType,
      sourceArchetype: theme.sourceArchetype,
      sourceArchetypeLabel: theme.sourceArchetypeLabel,
      queryFamily: family.familyName,
      queryVariant: item.variant,
    }));
  }).slice(0, MAX_THEMES * MAX_QUERIES_PER_THEME);

  const sourceArchetypes = uniqueSourceArchetypes([
    ...(radarVersion.prioritySourceArchetypes ?? []),
    ...families.map((family) => family.sourceArchetype),
  ]);

  return {
    radarVersion: radarVersion.version,
    searchThemes,
    queries,
    sourceArchetypes,
    resultBucketPolicy: RESULT_BUCKET_POLICY,
    evidenceReadPriority: searchThemes.slice(0, 3).map((theme) => theme.id),
  };
}
