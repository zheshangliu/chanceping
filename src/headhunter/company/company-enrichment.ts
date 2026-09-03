import { join } from "node:path";
import type { Company } from "../model/company";
import { defaultHeadHunterDataDir, JsonCollectionStore } from "../stores";

const CACHE_TTL_MS = 60 * 24 * 60 * 60 * 1000;

/**
 * Normalized company profile returned by an approved public-source adapter.
 *
 * This type deliberately has no vendor-specific contract. Finance Radar
 * company identity is primarily established by the resolver and public
 * evidence; enrichment is an optional cache fill, never a required provider.
 */
export interface CompanyProfile {
  canonical_name?: string;
  industry?: string;
  country?: string;
  region?: string;
  city?: string;
  website?: string;
  linkedin_company_url?: string;
  employee_count?: number;
  raw: unknown;
}

export type CompanyProfileProviderName = "official_website" | "search_index";

export interface CompanyProfileProvider {
  provider: CompanyProfileProviderName;
  getCompanyProfile(company: Company): Promise<CompanyProfile>;
}

interface CacheEntry {
  company_id: string;
  fetched_at: string;
  expires_at: string;
  profile: CompanyProfile;
}

export interface CompanyEnrichmentResult {
  status: "enriched" | "cached" | "unavailable";
  company_id: string;
  profile: CompanyProfile | null;
  cost: number | null;
  cost_status: "known" | "unknown";
  reason?: string;
}

export interface EnrichmentOptions {
  dataDir?: string;
  now?: Date;
}

const ALLOWED_PROFILE_PROVIDERS: ReadonlySet<CompanyProfileProviderName> = new Set(["official_website", "search_index"]);

export async function enrichCompany(company: Company, provider: CompanyProfileProvider | null, options: EnrichmentOptions = {}): Promise<CompanyEnrichmentResult> {
  if (!provider || !ALLOWED_PROFILE_PROVIDERS.has(provider.provider) || !company.website) {
    return { status: "unavailable", company_id: company.company_id, profile: null, cost: null, cost_status: "unknown", reason: "Approved public company profile provider or official website unavailable" };
  }
  const store = new JsonCollectionStore<CacheEntry>({ filePath: join(options.dataDir ?? defaultHeadHunterDataDir(), "company-enrichment-cache.json"), keyOf: (v) => v.company_id });
  const now = options.now ?? new Date();
  const cached = await store.getByKey(company.company_id);
  if (cached && new Date(cached.expires_at).getTime() > now.getTime()) return { status: "cached", company_id: company.company_id, profile: cached.profile, cost: 0, cost_status: "known" };
  try {
    const profile = await provider.getCompanyProfile(company);
    const fetchedAt = now.toISOString();
    await store.upsert({ company_id: company.company_id, fetched_at: fetchedAt, expires_at: new Date(now.getTime() + CACHE_TTL_MS).toISOString(), profile });
    return { status: "enriched", company_id: company.company_id, profile, cost: null, cost_status: "unknown" };
  } catch (error) {
    return { status: "unavailable", company_id: company.company_id, profile: null, cost: null, cost_status: "unknown", reason: error instanceof Error ? error.message : "provider error" };
  }
}
