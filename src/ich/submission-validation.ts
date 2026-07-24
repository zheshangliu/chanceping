import crypto from "crypto";
import {
  ICH_SUBMISSION_SCHEMA_VERSION,
  ICH_SUBMISSION_STATUSES,
  type IchSourceSubmission,
  type IchSourceSubmissionFile,
} from "./submission-types";

export interface IchSubmissionInput {
  source_url: string;
  title_hint?: string | null;
  note?: string | null;
  contact_email?: string | null;
}

export interface IchSubmissionValidationResult {
  valid: boolean;
  errors: string[];
  value?: IchSubmissionInput;
}

function optionalText(value: unknown, max: number, field: string, errors: string[]): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") {
    errors.push(`${field} 必须是字符串`);
    return null;
  }
  const cleaned = value.trim();
  if (cleaned.length > max) errors.push(`${field} 最多允许 ${max} 个字符`);
  return cleaned || null;
}

export function normalizeIchSubmissionUrl(raw: string): string {
  const parsed = new URL(raw);
  if (parsed.protocol !== "https:") throw new Error("source_url 只允许 HTTPS");
  if (parsed.username || parsed.password) throw new Error("source_url 不得包含用户名或密码");
  if (parsed.port && parsed.port !== "443") throw new Error("source_url 不得使用非标准端口");
  parsed.hash = "";
  parsed.hostname = parsed.hostname.toLowerCase();
  if (parsed.pathname !== "/") parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  parsed.searchParams.sort();
  return parsed.toString();
}

export function hashIchSubmissionUrl(normalizedUrl: string): string {
  return crypto.createHash("sha256").update(normalizedUrl).digest("hex");
}

export function validateIchSubmissionInput(input: unknown): IchSubmissionValidationResult {
  const errors: string[] = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { valid: false, errors: ["提交内容必须是对象"] };
  }
  const object = input as Record<string, unknown>;
  const sourceUrl = typeof object.source_url === "string" ? object.source_url.trim() : "";
  if (!sourceUrl) errors.push("source_url 不能为空");
  if (sourceUrl.length > 2048) errors.push("source_url 最多允许 2048 个字符");
  let normalized = sourceUrl;
  if (sourceUrl && sourceUrl.length <= 2048) {
    try {
      normalized = normalizeIchSubmissionUrl(sourceUrl);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "source_url 无效");
    }
  }
  const titleHint = optionalText(object.title_hint, 300, "title_hint", errors);
  const note = optionalText(object.note, 2000, "note", errors);
  const contactEmail = optionalText(object.contact_email, 254, "contact_email", errors);
  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) errors.push("contact_email 格式无效");
  if (errors.length > 0) return { valid: false, errors };
  return {
    valid: true,
    errors: [],
    value: {
      source_url: normalized,
      title_hint: titleHint,
      note,
      contact_email: contactEmail,
    },
  };
}

export function validateIchSourceSubmission(input: unknown): input is IchSourceSubmission {
  if (!input || typeof input !== "object" || Array.isArray(input)) return false;
  const value = input as Record<string, unknown>;
  return typeof value.id === "string" &&
    typeof value.source_url === "string" &&
    (value.title_hint === null || typeof value.title_hint === "string") &&
    (value.note === null || typeof value.note === "string") &&
    (value.contact_email === null || typeof value.contact_email === "string") &&
    ICH_SUBMISSION_STATUSES.includes(value.status as never) &&
    typeof value.normalized_url_hash === "string" &&
    /^[a-f0-9]{64}$/.test(value.normalized_url_hash) &&
    typeof value.created_at === "string" &&
    typeof value.updated_at === "string" &&
    (value.reviewed_at === null || typeof value.reviewed_at === "string") &&
    (value.reviewer === null || typeof value.reviewer === "string") &&
    (value.review_reason === null || typeof value.review_reason === "string") &&
    (value.opportunity_id === null || typeof value.opportunity_id === "string") &&
    typeof value.request_fingerprint === "string" &&
    /^[a-f0-9]{64}$/.test(value.request_fingerprint);
}

export function validateIchSourceSubmissionFile(input: unknown): input is IchSourceSubmissionFile {
  if (!input || typeof input !== "object" || Array.isArray(input)) return false;
  const value = input as Record<string, unknown>;
  return value.schema_version === ICH_SUBMISSION_SCHEMA_VERSION &&
    typeof value.updated_at === "string" &&
    Array.isArray(value.entries) &&
    value.entries.every(validateIchSourceSubmission);
}
