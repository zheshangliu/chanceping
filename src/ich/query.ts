import {
  ICH_PRIMARY_CATEGORIES,
  type IchOpportunity,
  type IchOpportunityStatus,
  type IchPrimaryCategory,
} from "./types";
import { computeIchOpportunityStatus } from "./status";

export const ICH_REGIONS = [
  "all",
  "guangzhou",
  "guangdong",
  "greater_bay_area",
  "nationwide",
  "hong_kong_macao_taiwan",
  "overseas",
  "online_or_unrestricted",
] as const;
export const ICH_FILTER_STATUSES = ["current", "closing_soon", "long_term", "history"] as const;
export const ICH_SORTS = ["default", "deadline", "newest", "updated"] as const;

export type IchRegionFilter = typeof ICH_REGIONS[number];
export type IchStatusFilter = typeof ICH_FILTER_STATUSES[number];
export type IchSort = typeof ICH_SORTS[number];

export interface IchQuery {
  q: string;
  category: "all" | IchPrimaryCategory;
  region: IchRegionFilter;
  status: IchStatusFilter;
  sort: IchSort;
  page: number;
  page_size: number;
}

export interface PublicIchOpportunity {
  slug: string;
  title: string;
  title_original: string | null;
  summary: string;
  description: string | null;
  opportunity_value_text: string | null;
  primary_category: IchPrimaryCategory;
  secondary_tags: string[];
  status: IchOpportunityStatus;
  organizer: Pick<IchOpportunity["organizer"], "name" | "name_en" | "type" | "official_website">;
  location: IchOpportunity["location"];
  participation_mode: IchOpportunity["participation_mode"];
  dates: IchOpportunity["dates"];
  eligibility: IchOpportunity["eligibility"];
  benefits: IchOpportunity["benefits"];
  costs: IchOpportunity["costs"];
  requirements: IchOpportunity["requirements"];
  application: IchOpportunity["application"];
  sources: Array<Omit<IchOpportunity["sources"][number], "notes">>;
  verification: Pick<IchOpportunity["verification"], "verification_status" | "verified_at" | "needs_recheck" | "recheck_after">;
  seo: IchOpportunity["seo"];
  published_at: string | null;
  updated_at: string;
}

export interface IchQueryResult {
  items: PublicIchOpportunity[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
  filters: Omit<IchQuery, "page" | "page_size">;
  facets: {
    categories: Record<string, number>;
    regions: Record<string, number>;
    statuses: Record<string, number>;
  };
  last_updated_at: string | null;
}

const HISTORY_STATUSES = new Set<IchOpportunityStatus>(["expired", "ended", "cancelled", "source_unavailable"]);

function normalize(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("zh-CN");
}

function publicOpportunity(entry: IchOpportunity, now: Date): PublicIchOpportunity {
  return {
    slug: entry.slug,
    title: entry.title,
    title_original: entry.title_original,
    summary: entry.summary,
    description: entry.description,
    opportunity_value_text: entry.opportunity_value_text,
    primary_category: entry.primary_category,
    secondary_tags: [...entry.secondary_tags],
    status: computeIchOpportunityStatus(entry, now),
    organizer: {
      name: entry.organizer.name,
      name_en: entry.organizer.name_en,
      type: entry.organizer.type,
      official_website: entry.organizer.official_website,
    },
    location: { ...entry.location, region_groups: [...entry.location.region_groups], eligible_regions: [...entry.location.eligible_regions] },
    participation_mode: { ...entry.participation_mode },
    dates: { ...entry.dates },
    eligibility: { ...entry.eligibility, eligible_applicant_types: [...entry.eligibility.eligible_applicant_types] },
    benefits: { ...entry.benefits, value_types: [...entry.benefits.value_types] },
    costs: { ...entry.costs },
    requirements: { ...entry.requirements, documents_required: [...entry.requirements.documents_required] },
    application: { ...entry.application, application_steps: [...entry.application.application_steps] },
    sources: entry.sources.map(({ notes: _notes, ...source }) => ({ ...source })),
    verification: {
      verification_status: entry.verification.verification_status,
      verified_at: entry.verification.verified_at,
      needs_recheck: entry.verification.needs_recheck,
      recheck_after: entry.verification.recheck_after,
    },
    seo: entry.seo ? { ...entry.seo } : null,
    published_at: entry.metadata.published_at,
    updated_at: entry.metadata.updated_at,
  };
}

export function isPublicIchOpportunity(entry: IchOpportunity): boolean {
  return entry.is_published &&
    entry.classification_status !== "rejected" &&
    entry.verification.verification_status !== "rejected";
}

function regionMatches(entry: IchOpportunity, region: IchRegionFilter): boolean {
  if (region === "all") return true;
  const fields = [
    entry.location.city,
    entry.location.province_state,
    ...entry.location.region_groups,
  ].filter((value): value is string => Boolean(value)).map(normalize);
  if (region === "online_or_unrestricted") {
    return entry.location.is_online || entry.location.participation_scope === "unrestricted";
  }
  const aliases: Record<Exclude<IchRegionFilter, "all" | "online_or_unrestricted">, string[]> = {
    guangzhou: ["guangzhou", "广州"],
    guangdong: ["guangdong", "广东"],
    greater_bay_area: ["greater_bay_area", "greater bay area", "大湾区", "粤港澳"],
    nationwide: ["nationwide", "全国"],
    hong_kong_macao_taiwan: ["hong_kong_macao_taiwan", "港澳台", "香港", "澳门", "台湾"],
    overseas: ["overseas", "海外", "international", "国际"],
  };
  return fields.some((field) => aliases[region].some((alias) => field.includes(normalize(alias))));
}

function searchableText(entry: IchOpportunity): string {
  return normalize([
    entry.title,
    entry.title_original,
    entry.summary,
    entry.organizer.name,
    entry.location.country_name,
    entry.location.province_state,
    entry.location.city,
    entry.location.district,
    entry.location.venue_text,
    entry.primary_category,
    ...entry.secondary_tags,
  ].filter(Boolean).join(" "));
}

function dateValue(value: string | null): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
}

export function queryIchOpportunities(
  entries: IchOpportunity[],
  query: IchQuery,
  now: Date,
  lastUpdatedAt: string | null,
): IchQueryResult {
  const published = entries.filter(isPublicIchOpportunity);
  let filtered = published.filter((entry) => {
    const computed = computeIchOpportunityStatus(entry, now);
    if (query.status === "history") return HISTORY_STATUSES.has(computed);
    if (query.status === "closing_soon") return computed === "closing_soon";
    if (query.status === "long_term") return computed === "long_term";
    return !HISTORY_STATUSES.has(computed);
  });
  if (query.category !== "all") filtered = filtered.filter((entry) => entry.primary_category === query.category);
  if (query.region !== "all") filtered = filtered.filter((entry) => regionMatches(entry, query.region));
  if (query.q) {
    const needle = normalize(query.q);
    filtered = filtered.filter((entry) => searchableText(entry).includes(needle));
  }
  filtered.sort((a, b) => {
    if (query.sort === "deadline") return dateValue(a.dates.deadline_at) - dateValue(b.dates.deadline_at);
    if (query.sort === "newest") return dateValue(b.metadata.published_at) - dateValue(a.metadata.published_at);
    if (query.sort === "updated") return dateValue(b.metadata.updated_at) - dateValue(a.metadata.updated_at);
    return Number(b.is_featured) - Number(a.is_featured) ||
      dateValue(a.dates.deadline_at) - dateValue(b.dates.deadline_at) ||
      a.slug.localeCompare(b.slug);
  });

  const statuses: Record<string, number> = {};
  const categories: Record<string, number> = Object.fromEntries(ICH_PRIMARY_CATEGORIES.map((category) => [category, 0]));
  const regions: Record<string, number> = Object.fromEntries(ICH_REGIONS.filter((region) => region !== "all").map((region) => [region, 0]));
  published.forEach((entry) => {
    const status = computeIchOpportunityStatus(entry, now);
    statuses[status] = (statuses[status] ?? 0) + 1;
    categories[entry.primary_category] = (categories[entry.primary_category] ?? 0) + 1;
    for (const region of ICH_REGIONS) {
      if (region !== "all" && regionMatches(entry, region)) regions[region] += 1;
    }
  });

  const total = filtered.length;
  const start = (query.page - 1) * query.page_size;
  return {
    items: filtered.slice(start, start + query.page_size).map((entry) => publicOpportunity(entry, now)),
    page: query.page,
    page_size: query.page_size,
    total,
    total_pages: total === 0 ? 0 : Math.ceil(total / query.page_size),
    filters: { q: query.q, category: query.category, region: query.region, status: query.status, sort: query.sort },
    facets: { categories, regions, statuses },
    last_updated_at: lastUpdatedAt,
  };
}

export function getPublicIchOpportunity(entries: IchOpportunity[], slug: string, now: Date): PublicIchOpportunity | null {
  const entry = entries.find((candidate) => candidate.slug === slug);
  return entry && isPublicIchOpportunity(entry) ? publicOpportunity(entry, now) : null;
}
