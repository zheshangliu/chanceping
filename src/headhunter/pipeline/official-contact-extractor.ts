import type { Company } from "../model/company";
import type { ContactKind } from "../model/contact";

export type OfficialContactRole = "recruitment" | "business" | "general";

export interface OfficialContactExtractionInput {
  company?: Pick<Company, "website" | "official_domains"> | null;
  company_id?: string;
  source_url: string;
  title?: string | null;
  snippet?: string | null;
  excerpt?: string | null;
  inline_content?: string | null;
  content?: string | null;
  /** Set false when the caller has already determined that this is not first-party. */
  first_party?: boolean;
}

export interface ExtractedOfficialContact {
  type: ContactKind;
  value: string;
  source_url: string;
  public_verified: true;
  professional: true;
  label: string;
  contact_role: OfficialContactRole;
  context: string;
}

export interface OfficialContactExtractionResult {
  entries: ExtractedOfficialContact[];
  rejected: Array<{ value: string; reason: string; source_url: string }>;
  first_party: boolean;
}

export const OFFICIAL_EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_PATTERN = /(?<![\d-])(?:\+?\d[\d\s().-]{6,}\d)(?![\d-])/g;
const URL_PATTERN = /https?:\/\/[^\s<>'"`]+/gi;
const RECRUITMENT_CONTEXT = /recruit(?:ment|ing)?|talent acquisition|human resources?|\bhr\b|careers?|jobs?|vacanc(?:y|ies)|hiring|招募|招聘|人力资源|职位|岗位/i;
const BUSINESS_CONTEXT = /business development|\bbd\b|partnerships?|commercial|sales|investor relations|corporate affairs|业务发展|商务合作|市场合作|投资者关系|商业合作/i;
const REJECTED_MAILBOX = /^(?:privacy|webmaster|support|no-?reply|noreply|donotreply|media|press|marketing|abuse|security)(?:[+._-].*)?$/i;

/**
 * Extract only publicly visible, first-party contact entries. The result keeps
 * rejected mailbox diagnostics so callers can audit false-negative/false-
 * positive tradeoffs without treating a technical address as a BD contact.
 */
export function extractOfficialContacts(input: OfficialContactExtractionInput): OfficialContactExtractionResult {
  const sourceUrl = input.source_url;
  const firstParty = input.first_party !== false && isFirstPartyUrl(sourceUrl, input.company);
  if (!firstParty) return { entries: [], rejected: [{ value: sourceUrl, reason: "source is not a first-party company page", source_url: sourceUrl }], first_party: false };
  const text = [input.title, input.snippet, input.excerpt, input.inline_content, input.content].filter(Boolean).join(" ");
  const entries: ExtractedOfficialContact[] = [];
  const rejected: OfficialContactExtractionResult["rejected"] = [];
  const seen = new Set<string>();
  for (const email of uniqueMatches(text, OFFICIAL_EMAIL_PATTERN).map((value) => value.toLowerCase())) {
    const mailbox = email.split("@", 1)[0] ?? email;
    const context = nearbyContext(text, email);
    if (REJECTED_MAILBOX.test(mailbox)) {
      rejected.push({ value: email, reason: `non-actionable mailbox prefix: ${mailbox}`, source_url: sourceUrl });
      continue;
    }
    const role = classifyRole(context);
    const key = `email:${email}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({ type: "corporate_email", value: email, source_url: sourceUrl, public_verified: true, professional: true, label: roleLabel(role), contact_role: role, context });
  }
  for (const phone of uniqueMatches(text, PHONE_PATTERN).map(normalizePhone).filter(isPlausiblePhone)) {
    const key = `phone:${phone}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const context = nearbyContext(text, phone);
    const role = classifyRole(context);
    entries.push({ type: "corporate_phone", value: phone, source_url: sourceUrl, public_verified: true, professional: true, label: roleLabel(role), contact_role: role, context });
  }
  const sourceAndTextUrls = [sourceUrl, ...uniqueMatches(text, URL_PATTERN).map(stripTrailingPunctuation)];
  for (const url of sourceAndTextUrls) {
    if (!isFirstPartyUrl(url, input.company) || !/(?:contact|career|recruit|job|hr|人才|招聘|联系)/i.test(url)) continue;
    const kind: ContactKind = /career|recruit|job|hr|人才|招聘/i.test(url) ? "careers_entry" : "company_contact_form";
    const role: OfficialContactRole = kind === "careers_entry" ? "recruitment" : classifyRole(`${input.title ?? ""} ${text}`);
    const key = `${kind}:${url.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({ type: kind, value: url, source_url: sourceUrl, public_verified: true, professional: true, label: roleLabel(role), contact_role: role, context: nearbyContext(text, url) });
  }
  return { entries, rejected, first_party: true };
}

/** Compatibility alias for callers that use singular “contact”. */
export const extractOfficialContactEntries = extractOfficialContacts;

function classifyRole(context: string): OfficialContactRole {
  if (RECRUITMENT_CONTEXT.test(context)) return "recruitment";
  if (BUSINESS_CONTEXT.test(context)) return "business";
  return "general";
}

function roleLabel(role: OfficialContactRole): string {
  return role === "recruitment" ? "招聘/人才入口" : role === "business" ? "Business Development / 商务入口" : "官方联系入口";
}

function uniqueMatches(text: string, pattern: RegExp): string[] {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const matcher = new RegExp(pattern.source, flags);
  return [...text.matchAll(matcher)].map((match) => match[0]).filter((value, index, all) => all.indexOf(value) === index);
}

function nearbyContext(text: string, needle: string): string {
  const index = text.toLowerCase().indexOf(needle.toLowerCase());
  if (index < 0) return text.slice(0, 240);
  return text.slice(Math.max(0, index - 120), Math.min(text.length, index + needle.length + 120));
}

function normalizePhone(value: string): string { return value.trim().replace(/[^+\d]/g, ""); }
function isPlausiblePhone(value: string): boolean { return value.replace(/\D/g, "").length >= 8 && value.replace(/\D/g, "").length <= 15; }
function stripTrailingPunctuation(value: string): string { return value.replace(/[),.;:!?]+$/, ""); }

function isFirstPartyUrl(url: string, company?: Pick<Company, "website" | "official_domains"> | null): boolean {
  if (!company) return true;
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    const domains = [company.website, ...company.official_domains].filter((v): v is string => Boolean(v)).map((value) => {
      try { return new URL(value).hostname.replace(/^www\./, "").toLowerCase(); } catch { return value.replace(/^https?:\/\//, "").split("/")[0].replace(/^www\./, "").toLowerCase(); }
    });
    return domains.length === 0 || domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
  } catch { return false; }
}
