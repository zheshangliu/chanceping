import type { IchOpportunity } from "./types";

export type IchDuplicateDecision = "duplicate" | "possible_duplicate" | "not_duplicate";

export interface IchDuplicateResult {
  decision: IchDuplicateDecision;
  reason: string;
}

function normalizeText(value: string | null | undefined): string {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, "");
}

function normalizeUrl(value: string | null | undefined): string {
  if (!value) return "";
  try {
    const url = new URL(value);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|spm$|from$|source$)/i.test(key)) url.searchParams.delete(key);
    }
    return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, "")}${url.search}`;
  } catch {
    return value.trim().replace(/\/+$/, "").toLowerCase();
  }
}

function primaryUrl(opportunity: IchOpportunity): string {
  return normalizeUrl(opportunity.sources.find((source) => source.is_primary)?.url);
}

function titleYear(opportunity: IchOpportunity): string | null {
  return opportunity.title.match(/\b(20\d{2}|19\d{2})\b/)?.[1] ?? null;
}

export function compareIchOpportunities(
  left: Readonly<IchOpportunity>,
  right: Readonly<IchOpportunity>,
): IchDuplicateResult {
  if (left.id === right.id) return { decision: "duplicate", reason: "same id" };
  const leftYear = titleYear(left);
  const rightYear = titleYear(right);
  if (leftYear && rightYear && leftYear !== rightYear) return { decision: "not_duplicate", reason: "different year" };

  if (left.external_id && right.external_id && left.external_id === right.external_id) {
    return { decision: "duplicate", reason: "same external_id" };
  }
  const leftPrimaryUrl = primaryUrl(left);
  const rightPrimaryUrl = primaryUrl(right);
  if (leftPrimaryUrl && leftPrimaryUrl === rightPrimaryUrl) return { decision: "duplicate", reason: "same primary official URL" };

  const sameOrganizer = normalizeText(left.organizer.name) === normalizeText(right.organizer.name);
  const leftApplicationUrl = normalizeUrl(left.application.application_url);
  const rightApplicationUrl = normalizeUrl(right.application.application_url);
  if (sameOrganizer && leftApplicationUrl && leftApplicationUrl === rightApplicationUrl) {
    return { decision: "duplicate", reason: "same application URL and organizer" };
  }

  const differentIndependentCities =
    left.location.city &&
    right.location.city &&
    normalizeText(left.location.city) !== normalizeText(right.location.city) &&
    leftApplicationUrl &&
    rightApplicationUrl &&
    leftApplicationUrl !== rightApplicationUrl;
  if (differentIndependentCities) return { decision: "not_duplicate", reason: "independent city applications" };

  const sameTitle = normalizeText(left.title) === normalizeText(right.title);
  if (sameTitle && sameOrganizer) return { decision: "duplicate", reason: "same normalized title and organizer" };

  const sameDeadline = Boolean(left.dates.deadline_at && left.dates.deadline_at === right.dates.deadline_at);
  const similarTitle = normalizeText(left.title).includes(normalizeText(right.title)) ||
    normalizeText(right.title).includes(normalizeText(left.title));
  if ((similarTitle && sameOrganizer) || (sameOrganizer && sameDeadline)) {
    return { decision: "possible_duplicate", reason: "weak title/organizer/deadline match" };
  }
  return { decision: "not_duplicate", reason: "no duplicate signal" };
}
