import type { Company, CompanyResolution } from "../model/company";

export interface CompanyCandidate {
  input_name: string;
  name_cn?: string | null;
  name_en?: string | null;
  aliases?: string[];
  industry?: string | null;
  country?: string | null;
  region?: string | null;
  city?: string | null;
  website?: string | null;
  linkedin_company_url?: string | null;
  parent_company_id?: string | null;
  entity_scope?: Company["entity_scope"];
}

export function resolveCompany(candidate: CompanyCandidate, companies: Company[]): CompanyResolution {
  const normalizedInput = normalize(candidate.input_name);
  const exact = companies.filter((company) => {
    const names = [company.canonical_name, company.name_cn, company.name_en, ...company.aliases]
      .filter((value): value is string => Boolean(value))
      .map(normalize);
    return names.includes(normalizedInput);
  });
  const candidateWebsite = candidate.website;
  const domainMatches = candidateWebsite ? companies.filter((company) => domainsOverlap(candidateWebsite, company)) : [];
  const linkedinMatches = candidate.linkedin_company_url
    ? companies.filter((company) => normalizeUrl(candidate.linkedin_company_url) === normalizeUrl(company.linkedin_company_url))
    : [];
  const candidates = uniqueCompanies([...exact, ...domainMatches, ...linkedinMatches]);
  if (candidates.length === 0) return newResolution(candidate, null, "NEW_COMPANY", false, null, null, null, ["no identity evidence"]);

  const scored = candidates.map((company) => ({ company, score: scoreCandidate(candidate, company) })).sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best) return newResolution(candidate, null, "NEW_COMPANY", false, null, null, null, ["no candidate"]);
  const conflict = hasEntityConflict(candidate, best.company);
  if (conflict.length > 0) return newResolution(candidate, best.company, "CONFLICT", nameMatches(candidate, best.company), industryMatches(candidate, best.company), regionMatches(candidate, best.company), websiteMatches(candidate, best.company), conflict);
  const matched = nameMatches(candidate, best.company) || (websiteMatches(candidate, best.company) && regionMatches(candidate, best.company) === true) || linkedinMatches.includes(best.company);
  const status = matched ? "MATCHED" : "NEEDS_REVIEW";
  return newResolution(candidate, best.company, status, nameMatches(candidate, best.company), industryMatches(candidate, best.company), regionMatches(candidate, best.company), websiteMatches(candidate, best.company), [`identity score=${best.score}`]);
}

function newResolution(candidate: CompanyCandidate, company: Company | null, status: CompanyResolution["status"], nameMatch: boolean, industryMatch: boolean | null, regionMatch: boolean | null, websiteMatch: boolean | null, notes: string[]): CompanyResolution {
  return { company_id: company?.company_id ?? null, input_name: candidate.input_name, matched_name: company?.canonical_name ?? null, status, name_match: nameMatch, industry_match: industryMatch, region_match: regionMatch, official_website_match: websiteMatch, reviewed_at: new Date().toISOString(), notes };
}

function scoreCandidate(candidate: CompanyCandidate, company: Company): number {
  let score = 0;
  if (nameMatches(candidate, company)) score += 5;
  if (websiteMatches(candidate, company)) score += 4;
  if (candidate.linkedin_company_url && normalizeUrl(candidate.linkedin_company_url) === normalizeUrl(company.linkedin_company_url)) score += 4;
  if (industryMatches(candidate, company)) score += 2;
  if (regionMatches(candidate, company)) score += 2;
  return score;
}

function nameMatches(candidate: CompanyCandidate, company: Company): boolean {
  const input = normalize(candidate.input_name);
  return [company.canonical_name, company.name_cn, company.name_en, ...company.aliases].filter((value): value is string => Boolean(value)).map(normalize).includes(input)
    || [candidate.name_cn, candidate.name_en, ...(candidate.aliases ?? [])].filter((value): value is string => Boolean(value)).map(normalize).some((value) => [company.canonical_name, company.name_cn, company.name_en, ...company.aliases].filter((item): item is string => Boolean(item)).map(normalize).includes(value));
}

function industryMatches(candidate: CompanyCandidate, company: Company): boolean | null {
  if (!candidate.industry || !company.industry) return null;
  return normalize(candidate.industry) === normalize(company.industry) || normalize(candidate.industry).includes(normalize(company.industry)) || normalize(company.industry).includes(normalize(candidate.industry));
}

function regionMatches(candidate: CompanyCandidate, company: Company): boolean | null {
  const values = [candidate.country, candidate.region, candidate.city].filter((value): value is string => Boolean(value)).map(normalize);
  const companyValues = [company.country, company.region, company.city].filter((value): value is string => Boolean(value)).map(normalize);
  if (values.length === 0 || companyValues.length === 0) return null;
  return values.some((value) => companyValues.includes(value));
}

function websiteMatches(candidate: CompanyCandidate, company: Company): boolean | null {
  if (!candidate.website) return null;
  const candidateDomain = domain(candidate.website);
  const domains = [company.website, ...company.official_domains].filter((value): value is string => Boolean(value)).map(domain);
  return candidateDomain.length > 0 && domains.includes(candidateDomain);
}

function hasEntityConflict(candidate: CompanyCandidate, company: Company): string[] {
  const notes: string[] = [];
  if (candidate.entity_scope && candidate.entity_scope !== company.entity_scope && (candidate.entity_scope === "group" || company.entity_scope === "group")) notes.push("entity scope conflict");
  if (regionMatches(candidate, company) === false) notes.push("country/region/city conflict");
  if (candidate.parent_company_id && company.parent_company_id && candidate.parent_company_id !== company.parent_company_id) notes.push("parent company conflict");
  return notes;
}

function uniqueCompanies(companies: Company[]): Company[] { return [...new Map(companies.map((company) => [company.company_id, company])).values()]; }
function normalize(value: string): string { return value.toLowerCase().replace(/[。、，,.'’`]/g, "").replace(/\s+/g, "").trim(); }
function normalizeUrl(value: string | null | undefined): string { return value ? value.trim().replace(/\/$/, "").toLowerCase() : ""; }
function domain(value: string): string { return normalizeUrl(value).replace(/^https?:\/\//, "").split("/")[0].replace(/^www\./, ""); }
function domainsOverlap(value: string, company: Company): boolean { const candidateDomain = domain(value); return [company.website, ...company.official_domains].filter((item): item is string => Boolean(item)).map(domain).includes(candidateDomain); }
