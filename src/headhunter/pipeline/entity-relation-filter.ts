import type { Company } from "../model/company";

export interface EntityRelationDecision {
  company_match: boolean;
  region_match: boolean | null;
  employer_match: boolean | null;
  accepted: boolean;
  reasons: string[];
}

export interface EntityRelationInput {
  target_company: Pick<Company, "canonical_name" | "name_en" | "name_cn" | "aliases" | "website" | "official_domains" | "region" | "country" | "city"> | Company;
  candidate: {
    title?: string | null;
    snippet?: string | null;
    url?: string | null;
    employer_name?: string | null;
    company_name?: string | null;
    location?: string | null;
    region?: string | null;
  };
  /** Jobs require an employer binding; other evidence does not. */
  candidate_type?: "job" | "signal" | "person" | "company";
  expected_region?: string | null;
}

/**
 * Post-filter a search result after retrieval. Search relevance alone is not
 * sufficient to attach a job or signal to a Company: names, domains and
 * geography are checked independently so similarly named entities (HKEX / HK
 * Express, Bankcomm / BOCHK) cannot be silently mixed.
 */
export function evaluateEntityRelation(input: EntityRelationInput): EntityRelationDecision {
  const target = input.target_company;
  const candidate = input.candidate;
  const text = [candidate.title, candidate.snippet, candidate.employer_name, candidate.company_name].filter(Boolean).join(" ");
  const names = [target.canonical_name, target.name_en, target.name_cn, ...target.aliases].filter((v): v is string => Boolean(v));
  const explicitEmployer = candidate.employer_name ?? candidate.company_name;
  const officialDomain = urlMatchesCompany(candidate.url, target);
  const nameInText = names.some((name) => containsEntityName(text, name));
  const explicitNameMatch = explicitEmployer ? names.some((name) => namesEqual(explicitEmployer, name)) : null;
  const companyMatch = explicitEmployer ? Boolean(explicitNameMatch || officialDomain) : Boolean(officialDomain || nameInText);

  const candidateRegion = canonicalRegion(candidate.location ?? candidate.region) ?? inferRegion(text);
  const expectedRegion = canonicalRegion(input.expected_region ?? target.city ?? target.region);
  const regionMatch = expectedRegion && candidateRegion ? regionsCompatible(expectedRegion, candidateRegion) : null;
  const employerMatch = input.candidate_type === "job" ? Boolean(explicitNameMatch || officialDomain) : null;
  const reasons: string[] = [];
  if (companyMatch) reasons.push(officialDomain ? "official company domain matches" : "company/entity name matches");
  else reasons.push("company/entity name or official domain does not match");
  if (regionMatch === false) reasons.push(`geography mismatch: expected ${expectedRegion}, found ${candidateRegion}`);
  else if (regionMatch === true) reasons.push("geography matches target scope");
  else reasons.push("geography not stated; retained as unknown");
  if (input.candidate_type === "job") {
    if (employerMatch) reasons.push("job employer is explicitly bound to target company");
    else reasons.push("job has no verified employer binding");
  }
  const accepted = companyMatch && regionMatch !== false && employerMatch !== false;
  return { company_match: companyMatch, region_match: regionMatch, employer_match: employerMatch, accepted, reasons };
}

export const filterEntityRelation = evaluateEntityRelation;

export function isOfficialCompanyDomain(url: string | null | undefined, company: Pick<Company, "website" | "official_domains">): boolean {
  return urlMatchesCompany(url, company);
}

export function isJobBoundToCompany(input: Omit<EntityRelationInput, "candidate_type">): EntityRelationDecision {
  return evaluateEntityRelation({ ...input, candidate_type: "job" });
}

export function extractCandidateLocation(title: string, snippet = ""): string | null {
  const text = `${title} ${snippet}`;
  const known = text.match(/(?:Hong Kong|香港|Mumbai|孟买|Delhi|New Delhi|Bengaluru|Bangalore|Gurugram|India|印度|Guangzhou|广州|Shenzhen|深圳|Dongguan|东莞|Singapore|新加坡)/i)?.[0];
  return known ?? null;
}

function urlMatchesCompany(url: string | null | undefined, company: Pick<Company, "website" | "official_domains">): boolean {
  if (!url) return false;
  try {
    const candidateHost = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    const domains = [company.website, ...company.official_domains].filter((v): v is string => Boolean(v)).map((value) => {
      try { return new URL(value).hostname.replace(/^www\./, "").toLowerCase(); } catch { return value.replace(/^https?:\/\//, "").split("/")[0].replace(/^www\./, "").toLowerCase(); }
    });
    return domains.some((domain) => candidateHost === domain || candidateHost.endsWith(`.${domain}`));
  } catch { return false; }
}

function containsEntityName(text: string, name: string): boolean {
  const normalizedText = normalizeName(text);
  const normalizedName = normalizeName(name);
  if (!normalizedName || normalizedName.length < 3) return false;
  if (normalizedName.length >= 6 && normalizedText.includes(normalizedName)) return true;
  // Acronyms and short names need token boundaries. This prevents “HKEX”
  // from matching “HK Express”, while still matching “HKEX Group”.
  return new RegExp(`(^|[^a-z0-9])${escapeRegex(name.trim())}([^a-z0-9]|$)`, "i").test(text);
}

function namesEqual(left: string, right: string): boolean {
  const a = normalizeName(left);
  const b = normalizeName(right);
  return a === b || (a.length >= 5 && (a.includes(b) || b.includes(a)) && !hasConflictingName(left, right));
}

function hasConflictingName(left: string, right: string): boolean {
  const conflicting = ["express", "india", "china", "hong kong", "bank of china"];
  const a = left.toLowerCase();
  const b = right.toLowerCase();
  return conflicting.some((word) => a.includes(word) !== b.includes(word));
}

type Region = "hong_kong" | "india" | "gba" | "china" | "singapore" | string;

function canonicalRegion(value: string | null | undefined): Region | null {
  if (!value) return null;
  const text = value.toLowerCase();
  if (/hong\s*kong|香港|\bhk\b/.test(text)) return "hong_kong";
  if (/india|印度|mumbai|孟买|delhi|new delhi|bengaluru|bangalore|gurugram/.test(text)) return "india";
  if (/guangzhou|广州|shenzhen|深圳|dongguan|东莞|g\s*b\s*a|大湾区/.test(text)) return "gba";
  if (/singapore|新加坡/.test(text)) return "singapore";
  if (/china|中国|mainland|大陆/.test(text)) return "china";
  return text.trim().replace(/\s+/g, "_") || null;
}

function inferRegion(text: string): Region | null {
  // Prefer a specific locality/country over a broad “China” mention.
  return canonicalRegion(extractCandidateLocation("", text)) ?? null;
}

function regionsCompatible(expected: Region, candidate: Region): boolean {
  if (expected === candidate) return true;
  if (expected === "china" && candidate === "gba") return true;
  if (expected === "gba" && candidate === "china") return true;
  return false;
}

function normalizeName(value: string): string { return value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, ""); }
function escapeRegex(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
