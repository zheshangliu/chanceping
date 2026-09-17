import { extractDeadlineEvidence, htmlToText, identityHash, normalizeUrl, parseDateText, type ParsedAggregationItem } from "../ich/aggregation/adapters/common";
import { parseGenericListing } from "../ich/aggregation/adapters/generic-listing";
import { parseRssItems } from "../ich/aggregation/adapters/rss";
import type { OpportunityCoverageType } from "./opportunity-coverage";

export type OpportunitySourceTransport = "HTML" | "RSS" | "JSON";
export type OpportunitySourceRegion = "CN" | "GLOBAL";

export interface OpportunitySourceProfile {
  id: string;
  family: string;
  listing_url: string;
  transport: OpportunitySourceTransport;
  region: OpportunitySourceRegion;
  include_patterns: string[];
  exclude_patterns: string[];
  type_hints: OpportunityCoverageType[];
  detail_mode: "NONE" | "FOLLOW_DETAIL";
  canonical_evidence: "LISTING_URL" | "DETAIL_URL" | "OFFICIAL_DETAIL_REQUIRED";
}

/**
 * Profiles describe discovery only. The normal OpportunityV2 pipeline still
 * applies identity, deadline safety, encoding, relevance and public gates.
 */
export const OPPORTUNITY_SOURCE_PROFILES: OpportunitySourceProfile[] = [
  {
    id: "on-the-move-open-calls", family: "On the Move", listing_url: "https://on-the-move.org/news/deadlines", transport: "HTML", region: "GLOBAL",
    include_patterns: ["deadline", "call", "residen", "fellowship", "fund", "mobility", "opportunit"], exclude_patterns: ["podcast", "archive", "contact"],
    type_hints: ["residency_learning", "grant_funding", "exhibition_showcase"], detail_mode: "FOLLOW_DETAIL", canonical_evidence: "DETAIL_URL",
  },
  {
    id: "artconnect-opportunities", family: "ArtConnect", listing_url: "https://www.artconnect.com/opportunities", transport: "HTML", region: "GLOBAL",
    include_patterns: ["opportunity", "open call", "residen", "exhibition", "fellowship", "grant"], exclude_patterns: ["podcast", "archive", "contact"],
    type_hints: ["exhibition_showcase", "residency_learning", "grant_funding"], detail_mode: "FOLLOW_DETAIL", canonical_evidence: "DETAIL_URL",
  },
  {
    id: "curatorspace-opportunities", family: "CuratorSpace", listing_url: "https://www.curatorspace.com/opportunities?orderBy=latest", transport: "HTML", region: "GLOBAL",
    include_patterns: ["opportunit", "exhibition", "artist", "call", "submission"], exclude_patterns: ["podcast", "archive", "contact"],
    type_hints: ["exhibition_showcase", "market_channel"], detail_mode: "FOLLOW_DETAIL", canonical_evidence: "DETAIL_URL",
  },
  {
    id: "asef-culture360-opportunities", family: "ASEF Culture360", listing_url: "https://culture360.asef.org/opportunities/", transport: "HTML", region: "GLOBAL",
    include_patterns: ["opportunit", "residen", "fellowship", "grant", "exhibition", "call"], exclude_patterns: ["podcast", "archive", "contact", "news"],
    type_hints: ["residency_learning", "grant_funding", "exhibition_showcase"], detail_mode: "FOLLOW_DETAIL", canonical_evidence: "DETAIL_URL",
  },
  {
    id: "cnaf-guides", family: "CNAF", listing_url: "https://www.cnaf.cn/guide.html", transport: "HTML", region: "CN",
    include_patterns: ["guide", "申报", "资助", "基金"], exclude_patterns: ["result", "结果", "archive", "news"],
    type_hints: ["grant_funding"], detail_mode: "FOLLOW_DETAIL", canonical_evidence: "OFFICIAL_DETAIL_REQUIRED",
  },
  {
    id: "craft-scotland-opportunities", family: "Craft Scotland", listing_url: "https://www.craftscotland.org/community", transport: "HTML", region: "GLOBAL",
    include_patterns: ["opportunit", "market", "vendor", "exhibition", "residen", "award", "grant", "call"], exclude_patterns: ["podcast", "archive", "contact"],
    type_hints: ["market_channel", "exhibition_showcase", "residency_learning"], detail_mode: "FOLLOW_DETAIL", canonical_evidence: "DETAIL_URL",
  },
];

const profileMap = new Map(OPPORTUNITY_SOURCE_PROFILES.map((profile) => [profile.id, profile]));

export function getOpportunitySourceProfile(sourceId: string): OpportunitySourceProfile | null {
  return profileMap.get(sourceId) ?? null;
}

export function validateOpportunitySourceProfile(profile: OpportunitySourceProfile): string[] {
  const errors: string[] = [];
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/u.test(profile.id)) errors.push("id must be a lowercase slug");
  if (!profile.family.trim()) errors.push("family is required");
  try {
    const url = new URL(profile.listing_url);
    if (!/^https?:$/u.test(url.protocol)) errors.push("listing_url must use HTTP(S)");
  } catch { errors.push("listing_url must be a valid URL"); }
  if (!profile.include_patterns.length) errors.push("at least one include pattern is required");
  if (!profile.type_hints.length) errors.push("at least one type hint is required");
  if (new Set(profile.include_patterns).size !== profile.include_patterns.length) errors.push("include patterns must be unique");
  if (new Set(profile.exclude_patterns).size !== profile.exclude_patterns.length) errors.push("exclude patterns must be unique");
  return errors;
}

function patternMatches(patterns: string[], value: string): boolean {
  return patterns.some((pattern) => {
    try { return new RegExp(pattern, "iu").test(value); } catch { return value.toLocaleLowerCase().includes(pattern.toLocaleLowerCase()); }
  });
}

function genericItemFromJson(value: Record<string, unknown>, listingUrl: string, profile: OpportunitySourceProfile): ParsedAggregationItem | null {
  const title = String(value.title ?? value.name ?? "").replace(/\s+/gu, " ").trim();
  const href = String(value.detail_url ?? value.url ?? value.link ?? "").trim();
  const detailUrl = normalizeUrl(href, listingUrl);
  if (!title || !detailUrl) return null;
  const summary = htmlToText(String(value.summary ?? value.description ?? value.excerpt ?? ""));
  const rawText = `${title} ${summary}`.trim();
  if (!patternMatches(profile.include_patterns, rawText) || patternMatches(profile.exclude_patterns, rawText)) return null;
  const evidence = extractDeadlineEvidence(rawText).find((candidate) => candidate.deadline_at) ?? null;
  const explicitDeadline = String(value.deadline ?? value.closing_date ?? value.application_deadline ?? "").trim();
  const deadlineText = explicitDeadline || evidence?.text || null;
  return {
    source_item_id: identityHash(detailUrl), title, source_category: profile.type_hints[0] ?? null, detail_url: detailUrl, source_url: listingUrl,
    published_at: parseDateText(String(value.published_at ?? value.date ?? "")) ?? null,
    deadline_text: deadlineText, deadline_at: parseDateText(deadlineText, new Date(), rawText), deadline_source_url: deadlineText ? listingUrl : null,
    deadline_raw_text: evidence?.raw_text ?? deadlineText, deadline_checked_at: deadlineText ? new Date().toISOString() : null,
    deadline_resolution: deadlineText ? "found_listing" : "not_attempted", deadline_kind: evidence?.kind ?? null,
    organizer: String(value.organizer ?? value.organization ?? "") || null, application_url: detailUrl, raw_text: rawText.slice(0, 8000),
    participation_scope: profile.region === "GLOBAL" ? "global" : "nationwide", participation_mode: "online",
  };
}

function parseJsonListing(body: string, listingUrl: string, profile: OpportunitySourceProfile): ParsedAggregationItem[] {
  let parsed: unknown;
  try { parsed = JSON.parse(body); } catch { return []; }
  const values: unknown[] = Array.isArray(parsed) ? parsed : parsed && typeof parsed === "object" && Array.isArray((parsed as Record<string, unknown>).items) ? (parsed as Record<string, unknown>).items as unknown[] : [];
  return values.filter((value): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value))).map((value) => genericItemFromJson(value, listingUrl, profile)).filter((value): value is ParsedAggregationItem => Boolean(value));
}

export function parseOpportunitySourceProfile(profile: OpportunitySourceProfile, body: string, listingUrl = profile.listing_url): ParsedAggregationItem[] {
  const errors = validateOpportunitySourceProfile(profile);
  if (errors.length) throw new Error(errors.join("; "));
  if (profile.transport === "RSS") return parseRssItems(body, listingUrl)
    .filter((item) => patternMatches(profile.include_patterns, `${item.title} ${item.raw_text}`))
    .filter((item) => !patternMatches(profile.exclude_patterns, `${item.title} ${item.raw_text}`));
  if (profile.transport === "JSON") return parseJsonListing(body, listingUrl, profile);
  return parseGenericListing(body, listingUrl, [], profile.id)
    .filter((item) => patternMatches(profile.include_patterns, `${item.title} ${item.raw_text}`))
    .filter((item) => !patternMatches(profile.exclude_patterns, `${item.title} ${item.raw_text}`));
}
