import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { ProviderRegistry, type SearchProvider } from "../src/search/provider-registry";
import type { SearchResult } from "../src/search/types";
import { enrichCompany, type CompanyProfileProvider } from "../src/headhunter/company/company-enrichment";
import { createHeadHunterStores } from "../src/headhunter/stores";
import { runHeadHunterWeeklyPipeline } from "../src/headhunter/pipeline/weekly-pipeline";

const assertPass = (condition: unknown, message: string): void => {
  assert.ok(condition, message);
  console.log(`PASS ${message}`);
};

async function main(): Promise<void> {
  await staticFinancePathAudit();

  let forbiddenSearchCalls = 0;
  let forbiddenHealthCalls = 0;
  const forbidden = {
    name: "tikhub",
    display_name: "forbidden provider",
    source_type: "web" as const,
    reliability: "F" as const,
    enabled: true,
    radar_types: ["headhunter"],
    async search(): Promise<SearchResult[]> {
      forbiddenSearchCalls += 1;
      throw new Error("TikHub must never be called by Finance Radar");
    },
    async healthCheck(): Promise<boolean> {
      forbiddenHealthCalls += 1;
      throw new Error("TikHub health check must never run in Finance Radar");
    },
  } satisfies SearchProvider;

  const providers = new ProviderRegistry();
  providers.register(forbidden);
  for (const name of ["serper", "doubao_search", "exa"]) providers.register(fixtureProvider(name));

  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async () => { throw new Error("Finance Radar no-TikHub verifier forbids network calls"); }) as typeof fetch;
  const dataDir = await mkdtemp(join(tmpdir(), "chanceping-headhunter-v121-no-tikhub-"));
  try {
    const result = await runHeadHunterWeeklyPipeline({
      providers,
      stores: createHeadHunterStores(dataDir),
      maxThemes: 1,
      maxCompanies: 1,
      weekKey: "2026-W36",
      radarRunId: "v121-no-tikhub-pipeline",
      publish: false,
    });
    assertPass(result.run.status === "success", "Weekly Pipeline completes with forbidden provider registered");
    assertPass(result.run.company_count === 1, "Company discovery and resolver execute without TikHub");
    assertPass(result.run.signal_count! > 0, "Signal discovery executes without TikHub");
    assertPass(result.run.job_count! > 0, "Job discovery executes without TikHub");
    assertPass(result.run.person_candidate_count! > 0, "People discovery executes without TikHub");
    assertPass(result.run.contact_count! > 0, "Contact discovery executes without TikHub");
    assertPass(forbiddenSearchCalls === 0, "Finance Radar TikHub search calls: 0");
    assertPass(forbiddenHealthCalls === 0, "Finance Radar TikHub health checks: 0");

    let enrichmentCalls = 0;
    const rogueProvider = {
      provider: "tikhub",
      async getCompanyProfile(): Promise<never> {
        enrichmentCalls += 1;
        throw new Error("forbidden provider was invoked");
      },
    } as unknown as CompanyProfileProvider;
    const enrichment = await enrichCompany(companyFixture(), rogueProvider, { dataDir });
    assertPass(enrichment.status === "unavailable", "Company enrichment rejects forbidden provider identity");
    assertPass(enrichmentCalls === 0, "Company enrichment TikHub calls: 0");
  } finally {
    globalThis.fetch = previousFetch;
    await rm(dataDir, { recursive: true, force: true });
  }

  console.log(JSON.stringify({ status: "PASS", finance_radar_tikhub_calls: 0, forbidden_search_calls: forbiddenSearchCalls, forbidden_health_checks: forbiddenHealthCalls }));
}

async function staticFinancePathAudit(): Promise<void> {
  const files = [
    "src/headhunter/company/company-enrichment.ts",
    "src/headhunter/pipeline/weekly-pipeline.ts",
    "src/headhunter/search/routing.ts",
    "src/headhunter/search/provider-contract.ts",
    "src/scheduler/triggers.ts",
    "scripts/run-headhunter-weekly.ts",
    "scripts/verify-headhunter-v12.ts",
    "scripts/verify-headhunter-golden-gates.ts",
    "scripts/verify-headhunter-production-smoke.ts",
  ];
  const forbiddenExecutionPatterns = [
    /TikhubClient/i,
    /\/api\/v1\/linkedin\/web/i,
    /provider\s*:\s*["']tikhub["']/i,
    /tikhub[_-](?:fallback|optional|emergency|provider)/i,
  ];
  for (const file of files) {
    const source = await readFile(resolve(file), "utf8");
    for (const pattern of forbiddenExecutionPatterns) assertPass(!pattern.test(source), `${file} has no TikHub execution path`);
  }
  assertPass(true, "Scheduler and production/golden entrypoints are covered by static no-TikHub audit");
}

function fixtureProvider(name: string): SearchProvider {
  return {
    name,
    display_name: `Fixture ${name}`,
    source_type: "web",
    reliability: "B",
    enabled: true,
    radar_types: ["headhunter"],
    async healthCheck(): Promise<boolean> { return true; },
    async search(query: string): Promise<SearchResult[]> {
      const base = { source_provider: name, source_type: "web" as const };
      if (/LinkedIn Talent Acquisition/i.test(query)) return [{ ...base, title: "Acme Finance - Talent Acquisition Lead", url: "https://www.linkedin.com/in/acme-finance-ta", snippet: "Talent Acquisition Lead at Acme Finance" }];
      if (/site:acmefinance\.test careers contact/i.test(query)) return [{ ...base, title: "Acme Finance Careers", url: "https://acmefinance.test/careers", snippet: "Acme Finance recruitment careers and contact" }];
      if (/careers jobs hiring/i.test(query)) return [{ ...base, title: "Acme Finance HR Director", url: "https://acmefinance.test/careers/hr-director", snippet: "Acme Finance is hiring an HR Director" }];
      if (/hiring expansion funding license factory overseas headquarters recruitment/i.test(query)) return [{ ...base, title: "Acme Finance hiring expansion", url: "https://acmefinance.test/news/hiring-expansion", snippet: "Acme Finance announced a recent hiring expansion", published_at: "2026-09-01" }];
      return [{ ...base, title: "Acme Finance | Acme Finance official website", url: "https://acmefinance.test", snippet: "Acme Finance official company website" }];
    },
  };
}

function companyFixture() {
  return {
    company_id: "company-v121-test",
    canonical_name: "Acme Finance",
    name_cn: null,
    name_en: "Acme Finance",
    aliases: [],
    industry: "finance",
    sub_industry: null,
    country: "Hong Kong",
    region: "Hong Kong",
    city: "Hong Kong",
    company_type: "operating",
    website: "https://acmefinance.test",
    linkedin_company_url: null,
    official_domains: ["acmefinance.test"],
    target_segment: "hk_finance" as const,
    parent_company_id: null,
    entity_scope: "operating_entity" as const,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    last_verified_at: "2026-09-01T00:00:00Z",
    status: "active" as const,
  };
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
