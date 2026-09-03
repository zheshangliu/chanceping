import { createHash, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { resolveProviders } from "../src/headhunter/search/routing";
import { providerRegistry } from "../src/search/provider-registry";
import type { SearchResult } from "../src/search/types";
import { createHeadHunterStores } from "../src/headhunter/stores";
import type { Company } from "../src/headhunter/model/company";
import type { EvidenceRecord } from "../src/headhunter/model/evidence";
import { runHeadhunterRadar } from "../src/headhunter/pipeline/radar-pipeline";
import { buildWeeklySnapshot } from "../src/headhunter/reports/weekly-report";
import { publishScheduledSnapshot } from "../src/headhunter/pipeline/weekly-publisher";
import { computeWeekKey } from "../src/headhunter/model/weekly-snapshot";
import type { SearchScope } from "../src/headhunter/search/intents";

const QUERY_CASES: Array<{ segment: "hk_finance" | "gba_company" | "outbound_manufacturing"; scope: SearchScope; query: string }> = [
  { segment: "hk_finance" as const, scope: "hk_global", query: "Hong Kong financial services expansion hiring HR" },
  { segment: "gba_company" as const, scope: "mainland", query: "Guangzhou Huangpu GBA company expansion hiring HR" },
  { segment: "outbound_manufacturing" as const, scope: "mainland", query: "China company Vietnam factory expansion hiring" },
];

async function main(): Promise<void> {
  const stores = createHeadHunterStores();
  const runId = `headhunter-initial-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
  const now = new Date();
  const weekKey = computeWeekKey(now);
  const usage = new Map<string, { requests: number; results: number; failures: number }>();
  const found: Array<{ result: SearchResult; segment: (typeof QUERY_CASES)[number]["segment"] }> = [];
  const errors: string[] = [];

  for (const queryCase of QUERY_CASES) {
    const providers = resolveProviders({ intent_type: "DISCOVER_COMPANY", scope: queryCase.scope, query: queryCase.query }).providers;
    let queryHadResults = false;
    for (const providerName of providers) {
      const provider = providerRegistry.get(providerName);
      if (!provider?.enabled) continue;
      const record = usage.get(providerName) ?? { requests: 0, results: 0, failures: 0 };
      record.requests += 1;
      usage.set(providerName, record);
      try {
        const results = await provider.search(queryCase.query, { max_results: 5, region: queryCase.scope === "mainland" ? "cn" : "hk" });
        record.results += results.length;
        for (const result of results) found.push({ result, segment: queryCase.segment });
        if (results.length > 0) { queryHadResults = true; break; }
      } catch (error) {
        record.failures += 1;
        errors.push(`${providerName}: ${error instanceof Error ? error.message : "search failed"}`);
      }
    }
    if (!queryHadResults) errors.push(`no results for ${queryCase.query}`);
  }

  const unique = [...new Map(found.map((item) => [item.result.url, item])).values()];
  if (unique.length === 0) throw new Error(`Initial discovery returned no results: ${errors.join("; ")}`);

  const companies: Company[] = unique.map(({ result, segment }) => {
    const timestamp = now.toISOString();
    const companyId = `initial-${createHash("sha256").update(result.url).digest("hex").slice(0, 16)}`;
    return {
      company_id: companyId,
      canonical_name: result.title.slice(0, 120),
      name_cn: null,
      name_en: result.title.slice(0, 120),
      aliases: [],
      industry: null,
      sub_industry: null,
      country: null,
      region: null,
      city: null,
      company_type: null,
      website: result.url,
      linkedin_company_url: null,
      official_domains: [],
      target_segment: segment,
      parent_company_id: null,
      entity_scope: "operating_entity",
      created_at: timestamp,
      updated_at: timestamp,
      last_verified_at: null,
      status: "unknown",
    };
  });

  for (const company of companies) await stores.companies.upsert(company);
  for (const { result } of unique) {
    const evidenceId = `search-${createHash("sha256").update(result.url).digest("hex").slice(0, 20)}`;
    const existing = await stores.evidence.get(evidenceId);
    if (existing) continue;
    const evidence: EvidenceRecord = { evidence_id: evidenceId, source_url: result.url, source_name: result.source_provider, source_type: "search", title: result.title, excerpt: result.snippet, published_at: result.published_at ?? null, observed_at: now.toISOString(), content_hash: null, immutable: true, human_override: null };
    await stores.evidence.insert(evidence);
  }

  const radar = await runHeadhunterRadar({ radar_run_id: runId, week_key: weekKey, companies, signals: [], jobs: [], people: [], contacts: [], trends: [], now });
  for (const lead of radar.leads) await stores.leads.upsertWeekly(lead);
  const snapshot = buildWeeklySnapshot(radar);
  await publishScheduledSnapshot(snapshot, stores.weeklySnapshots, { run_status: "success", core_provider_available: true, lead_engine_complete: true, persistence_complete: true });
  await stores.runs.upsert({ radar_run_id: runId, trigger_type: "scheduled", started_at: now.toISOString(), finished_at: new Date().toISOString(), status: "success", queries: QUERY_CASES.map((item) => item.query), provider_usage: [...usage.entries()].map(([provider, value]) => ({ provider, request_count: value.requests, success_count: value.results > 0 ? 1 : 0, failure_count: value.failures, known_cost: null, unknown_cost: true })), cost_summary: { known_cost: 0, unknown_cost: true, unknown_providers: [...usage.keys()], currency: "USD" }, company_count: companies.length, signal_count: 0, lead_count: radar.leads.length });
  await mkdir(process.env.CHANCEPING_HEADHUNTER_DATA_DIR ?? "data/headhunter", { recursive: true });
  console.log(JSON.stringify({ run_id: runId, week_key: weekKey, status: "success", providers: [...usage.entries()], discovered_companies: companies.length, leads: radar.leads.length, a_count: radar.leads.filter((lead) => lead.lead_pool === "A_ACTIONABLE").length, b_count: radar.leads.filter((lead) => lead.lead_pool === "B_ENRICHMENT").length, errors }));
}

main().catch((error: unknown) => { console.error(JSON.stringify({ status: "failed", error: error instanceof Error ? error.message : String(error) })); process.exitCode = 1; });
