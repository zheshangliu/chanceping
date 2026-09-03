/**
 * Finance Radar provider contract.
 *
 * Keep this allow-list intentionally small and explicit. TikHub is not a
 * provider of the HeadHunter Finance Radar; a route that introduces an
 * unknown adapter must fail closed instead of silently becoming a paid call.
 */
export const HEADHUNTER_PROVIDER_CONTRACT = {
  mainland_discovery: ["doubao_search", "serper"],
  hk_global_discovery: ["serper", "doubao_search"],
  people_discovery: ["serper", "exa"],
  company_identity: ["company_resolver", "official_website"],
} as const;

export type HeadHunterSearchProvider =
  | (typeof HEADHUNTER_PROVIDER_CONTRACT.mainland_discovery)[number]
  | (typeof HEADHUNTER_PROVIDER_CONTRACT.hk_global_discovery)[number]
  | (typeof HEADHUNTER_PROVIDER_CONTRACT.people_discovery)[number];

const ALLOWED_SEARCH_PROVIDERS: ReadonlySet<string> = new Set([
  ...HEADHUNTER_PROVIDER_CONTRACT.mainland_discovery,
  ...HEADHUNTER_PROVIDER_CONTRACT.hk_global_discovery,
  ...HEADHUNTER_PROVIDER_CONTRACT.people_discovery,
]);

/**
 * Guard the Finance Radar execution path at the provider boundary.
 *
 * The assertion is deliberately runtime-safe: a future route change cannot
 * introduce an unreviewed or vendor-specific provider by string alone.
 */
export function assertHeadHunterProviderAllowed(provider: string): asserts provider is HeadHunterSearchProvider {
  if (!ALLOWED_SEARCH_PROVIDERS.has(provider)) {
    throw new Error(`Finance Radar provider is not allowed: ${provider}`);
  }
}

export function isHeadHunterProviderAllowed(provider: string): provider is HeadHunterSearchProvider {
  return ALLOWED_SEARCH_PROVIDERS.has(provider);
}
