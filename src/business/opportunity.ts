import fs from "node:fs";
import path from "node:path";
import type { BusinessEditionId } from "./edition-config";

export type OpportunityCategory = "competition" | "exhibition" | "procurement" | "channel" | "policy" | "international";
export type OpportunityStatus = "open" | "rolling" | "historical" | "closed" | "pending_verification";
export type VerificationStatus = "field_verified" | "status_verified" | "fully_verified" | "pending_verification";
export type RecommendationLevel = "high" | "medium" | "observe";
export type DeadlineType = "fixed" | "rolling" | "long_term" | "unknown";

export interface BusinessOpportunity {
  id: string;
  /** Optional stable registry link; legacy records remain valid without migration. */
  sourceId?: string;
  slug: string;
  title: string;
  shortTitle?: string;
  summary: string;
  category: OpportunityCategory;
  subCategory?: string;
  keywords: string[];
  industries: string[];
  regions: string[];
  editions: BusinessEditionId[];
  organizer: string;
  sourceName: string;
  sourceType: "government" | "official" | "organization";
  officialUrl: string;
  publishedAt?: string;
  deadline?: string;
  deadlineType: DeadlineType;
  timezone: "Asia/Shanghai";
  status: OpportunityStatus;
  verificationStatus: VerificationStatus;
  verifiedAt: string;
  verificationNotes: string;
  targetAudience: string[];
  eligibilitySummary: string;
  eligibilityRequirements: string[];
  rewardSummary: string;
  recommendationLevel: RecommendationLevel;
  recommendationReasons: string[];
  risks: string[];
  nextActions: string[];
  featured: boolean;
  sourceDiscoveredAt: string;
  createdAt: string;
  updatedAt: string;
  dataOwner: string;
}

export const CATEGORY_LABELS: Record<OpportunityCategory, string> = {
  competition: "赛事", exhibition: "展会", procurement: "采购", channel: "渠道", policy: "政策", international: "国际",
};
export const VERIFICATION_LABELS: Record<VerificationStatus, string> = {
  field_verified: "字段已核验", status_verified: "状态已核验", fully_verified: "完整核验", pending_verification: "待核验",
};
export const RECOMMENDATION_LABELS: Record<RecommendationLevel, string> = { high: "优先关注", medium: "建议关注", observe: "观察" };

const categories = new Set<OpportunityCategory>(Object.keys(CATEGORY_LABELS) as OpportunityCategory[]);
const statuses = new Set<OpportunityStatus>(["open", "rolling", "historical", "closed", "pending_verification"]);
const verificationStates = new Set<VerificationStatus>(["field_verified", "status_verified", "fully_verified", "pending_verification"]);
const recommendations = new Set<RecommendationLevel>(["high", "medium", "observe"]);
const deadlines = new Set<DeadlineType>(["fixed", "rolling", "long_term", "unknown"]);

function issue(message: string): never { throw new Error(`Business opportunity validation failed: ${message}`); }
function requiredText(value: unknown, field: string): string { if (typeof value !== "string" || !value.trim()) issue(`${field} is required`); return value.trim(); }
function arrayOfText(value: unknown, field: string): string[] { if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) issue(`${field} must be a string array`); return value; }
function validUrl(value: string, field: string): void { try { const url = new URL(value); if (url.protocol !== "https:") throw new Error(); } catch { issue(`${field} must be an https URL`); } }
function validIso(value: string, field: string): void { if (Number.isNaN(new Date(value).getTime())) issue(`${field} must be an ISO date`); }

/** Lightweight in-repo JSON-schema equivalent: validates P0 fields before any public rendering. */
export function validateBusinessOpportunities(value: unknown): BusinessOpportunity[] {
  if (!Array.isArray(value)) issue("root must be an array");
  const ids = new Set<string>(); const slugs = new Set<string>();
  return value.map((raw, index) => {
    if (!raw || typeof raw !== "object") issue(`row ${index + 1} must be an object`);
    const item = raw as Record<string, unknown>;
    const id = requiredText(item.id, `row ${index + 1}.id`);
    const slug = requiredText(item.slug, `row ${index + 1}.slug`);
    if (ids.has(id) || slugs.has(slug)) issue(`row ${index + 1} has duplicate id or slug`);
    ids.add(id); slugs.add(slug);
    const category = requiredText(item.category, `row ${index + 1}.category`) as OpportunityCategory;
    const status = requiredText(item.status, `row ${index + 1}.status`) as OpportunityStatus;
    const verificationStatus = requiredText(item.verificationStatus, `row ${index + 1}.verificationStatus`) as VerificationStatus;
    const recommendationLevel = requiredText(item.recommendationLevel, `row ${index + 1}.recommendationLevel`) as RecommendationLevel;
    const deadlineType = requiredText(item.deadlineType, `row ${index + 1}.deadlineType`) as DeadlineType;
    if (!categories.has(category) || !statuses.has(status) || !verificationStates.has(verificationStatus) || !recommendations.has(recommendationLevel) || !deadlines.has(deadlineType)) issue(`row ${index + 1} has an unsupported enum value`);
    const officialUrl = requiredText(item.officialUrl, `row ${index + 1}.officialUrl`); validUrl(officialUrl, `row ${index + 1}.officialUrl`);
    const editions = arrayOfText(item.editions, `row ${index + 1}.editions`) as BusinessEditionId[];
    if (editions.length === 0 || editions.some((edition) => !["guangzhou", "tianhe", "shaoguan"].includes(edition))) issue(`row ${index + 1}.editions is invalid`);
    const dateFields = ["verifiedAt", "sourceDiscoveredAt", "createdAt", "updatedAt"] as const;
    for (const field of dateFields) validIso(requiredText(item[field], `row ${index + 1}.${field}`), `row ${index + 1}.${field}`);
    if (item.deadline) validIso(requiredText(item.deadline, `row ${index + 1}.deadline`), `row ${index + 1}.deadline`);
    return {
      id, slug, title: requiredText(item.title, `row ${index + 1}.title`), shortTitle: typeof item.shortTitle === "string" ? item.shortTitle : undefined,
      summary: requiredText(item.summary, `row ${index + 1}.summary`), category, subCategory: typeof item.subCategory === "string" ? item.subCategory : undefined,
      keywords: arrayOfText(item.keywords, `row ${index + 1}.keywords`), industries: arrayOfText(item.industries, `row ${index + 1}.industries`), regions: arrayOfText(item.regions, `row ${index + 1}.regions`), editions,
      organizer: requiredText(item.organizer, `row ${index + 1}.organizer`), sourceName: requiredText(item.sourceName, `row ${index + 1}.sourceName`), sourceType: requiredText(item.sourceType, `row ${index + 1}.sourceType`) as BusinessOpportunity["sourceType"], officialUrl,
      publishedAt: typeof item.publishedAt === "string" ? item.publishedAt : undefined, deadline: typeof item.deadline === "string" ? item.deadline : undefined, deadlineType, timezone: "Asia/Shanghai", status, verificationStatus,
      verifiedAt: requiredText(item.verifiedAt, `row ${index + 1}.verifiedAt`), verificationNotes: requiredText(item.verificationNotes, `row ${index + 1}.verificationNotes`), targetAudience: arrayOfText(item.targetAudience, `row ${index + 1}.targetAudience`), eligibilitySummary: requiredText(item.eligibilitySummary, `row ${index + 1}.eligibilitySummary`), eligibilityRequirements: arrayOfText(item.eligibilityRequirements, `row ${index + 1}.eligibilityRequirements`), rewardSummary: requiredText(item.rewardSummary, `row ${index + 1}.rewardSummary`), recommendationLevel, recommendationReasons: arrayOfText(item.recommendationReasons, `row ${index + 1}.recommendationReasons`), risks: arrayOfText(item.risks, `row ${index + 1}.risks`), nextActions: arrayOfText(item.nextActions, `row ${index + 1}.nextActions`), featured: Boolean(item.featured), sourceDiscoveredAt: requiredText(item.sourceDiscoveredAt, `row ${index + 1}.sourceDiscoveredAt`), createdAt: requiredText(item.createdAt, `row ${index + 1}.createdAt`), updatedAt: requiredText(item.updatedAt, `row ${index + 1}.updatedAt`), dataOwner: requiredText(item.dataOwner, `row ${index + 1}.dataOwner`),
    };
  });
}

export function loadBusinessOpportunities(filePath = process.env.CHANCEPING_BUSINESS_OPPORTUNITIES_PATH ?? "src/business/opportunities.recorded.json"): BusinessOpportunity[] {
  const absolute = path.resolve(process.cwd(), filePath);
  return validateBusinessOpportunities(JSON.parse(fs.readFileSync(absolute, "utf8")));
}

export function lifecycleStatus(item: BusinessOpportunity, now = new Date()): "current" | "historical" | "closing_soon" | "rolling" {
  if (item.status === "historical" || item.status === "closed") return "historical";
  if (item.deadlineType === "rolling" || item.deadlineType === "long_term") return "rolling";
  if (!item.deadline) return "current";
  const days = Math.ceil((new Date(item.deadline).getTime() - now.getTime()) / 86_400_000);
  return days < 0 ? "historical" : days <= 7 ? "closing_soon" : "current";
}
