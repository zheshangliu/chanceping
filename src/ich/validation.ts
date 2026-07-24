import {
  ICH_OPPORTUNITY_STATUSES,
  ICH_PRIMARY_CATEGORIES,
  ICH_SCHEMA_VERSION,
  type IchOpportunity,
  type IchOpportunityFile,
} from "./types";

export interface IchValidationResult<T> {
  valid: boolean;
  value?: T;
  errors: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isHttpUrl(value: unknown): value is string {
  if (!isNonEmptyString(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function validateIchOpportunity(value: unknown): IchValidationResult<IchOpportunity> {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ["entry must be an object"] };

  for (const field of ["id", "slug", "title", "summary"] as const) {
    if (!isNonEmptyString(value[field])) errors.push(`${field} is required`);
  }
  if (!ICH_PRIMARY_CATEGORIES.includes(value.primary_category as never)) errors.push("primary_category is invalid");
  if (!ICH_OPPORTUNITY_STATUSES.includes(value.status as never)) errors.push("status is invalid");
  if (!["high", "medium", "low"].includes(String(value.classification_confidence))) errors.push("classification_confidence is invalid");
  if (!["confirmed", "pending_review", "rejected"].includes(String(value.classification_status))) errors.push("classification_status is invalid");
  if (typeof value.is_published !== "boolean") errors.push("is_published must be boolean");
  if (value.is_published === true && value.classification_status !== "confirmed") errors.push("unreviewed entry cannot be published");

  const organizer = isRecord(value.organizer) ? value.organizer : null;
  if (!organizer || !isNonEmptyString(organizer.name) || !isNonEmptyString(organizer.type)) errors.push("organizer name and type are required");
  const location = isRecord(value.location) ? value.location : null;
  if (!location || !Array.isArray(location.region_groups) || !isNonEmptyString(location.participation_scope)) errors.push("location contract is invalid");
  const dates = isRecord(value.dates) ? value.dates : null;
  if (!dates || typeof dates.deadline_text !== "string" || !isNonEmptyString(dates.date_status)) errors.push("dates contract is invalid");
  const eligibility = isRecord(value.eligibility) ? value.eligibility : null;
  if (!eligibility || !isNonEmptyString(eligibility.eligibility_text)) errors.push("eligibility_text is required");
  const benefits = isRecord(value.benefits) ? value.benefits : null;
  if (!benefits || !isNonEmptyString(benefits.benefit_text)) errors.push("benefit_text is required");
  const costs = isRecord(value.costs) ? value.costs : null;
  if (!costs || !isNonEmptyString(costs.cost_text)) errors.push("cost_text is required");
  const requirements = isRecord(value.requirements) ? value.requirements : null;
  if (!requirements || !isNonEmptyString(requirements.requirements_text)) errors.push("requirements_text is required");

  const sources = Array.isArray(value.sources) ? value.sources : [];
  if (sources.length === 0) errors.push("at least one source is required");
  const validSources = sources.filter(isRecord);
  if (validSources.some((source) => !isHttpUrl(source.url))) errors.push("source URL must use http or https");
  if (validSources.filter((source) => source.is_primary === true).length !== 1) errors.push("exactly one primary source is required");

  const verification = isRecord(value.verification) ? value.verification : null;
  if (!verification || !isNonEmptyString(verification.verification_status)) errors.push("verification_status is required");
  const metadata = isRecord(value.metadata) ? value.metadata : null;
  if (!metadata || !isNonEmptyString(metadata.created_at) || !isNonEmptyString(metadata.updated_at) || !isNonEmptyString(metadata.last_checked_at)) {
    errors.push("metadata timestamps are required");
  }

  return errors.length === 0
    ? { valid: true, value: value as unknown as IchOpportunity, errors }
    : { valid: false, errors };
}

export function validateIchOpportunityFile(value: unknown): IchValidationResult<IchOpportunityFile> {
  if (!isRecord(value)) return { valid: false, errors: ["store file must be an object"] };
  const errors: string[] = [];
  if (value.schema_version !== ICH_SCHEMA_VERSION) errors.push(`unsupported schema_version: ${String(value.schema_version)}`);
  if (!isNonEmptyString(value.updated_at)) errors.push("updated_at is required");
  if (!Array.isArray(value.entries)) errors.push("entries must be an array");
  return errors.length === 0
    ? { valid: true, value: value as unknown as IchOpportunityFile, errors }
    : { valid: false, errors };
}
