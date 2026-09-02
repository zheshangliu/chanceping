import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { loadLocalApiEnv } from "../src/config/local-env";
import { resolveProviders } from "../src/headhunter/search/routing";
import { runHeadhunterRadar } from "../src/headhunter/pipeline/radar-pipeline";
import { buildWeeklySnapshot } from "../src/headhunter/reports/weekly-report";

interface QueryCase { segment: "hk_finance" | "gba_company" | "outbound_manufacturing"; scope: "hk_global" | "mainland"; query: string; }
const QUERY_CASES: QueryCase[] = [
  { segment: "hk_finance", scope: "hk_global", query: "Hong Kong financial services expansion hiring HR" },
  { segment: "gba_company", scope: "mainland", query: "Guangzhou Huangpu GBA company expansion hiring HR" },
  { segment: "outbound_manufacturing", scope: "mainland", query: "China company Vietnam factory expansion hiring" },
];

async function main(): Promise<void> {
  if (process.env.CHANCEPING_RUN_HEADHUNTER_LIVE !== "true") throw new Error("CHANCEPING_RUN_HEADHUNTER_LIVE=true is required; live E2E refuses implicit execution");
  const envFile = process.env.CHANCEPING_API_ENV_PATH;
  loadLocalApiEnv({ enabled: true, envFile: envFile ?? "api.env" });
  const required = ["DOUBAO_SEARCH_API_KEY", "SERPER_API_KEY"];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(JSON.stringify({ status: "BLOCKED_BY_KEYS", missing }));
    process.exitCode = 2;
    return;
  }
  if (process.env.DATA_MODE === "mock" || process.env.LLM_MODE === "mock") throw new Error("Live E2E refuses DATA_MODE/LLM_MODE mock");
  const { providerRegistry } = await import("../src/search/provider-registry");
  const runId = `headhunter-live-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
  const usage = new Map<string, { requests: number; results: number; failures: number; known_cost: number | null }>();
  const rawResults: Array<{ segment: string; provider: string; query: string; title: string; url: string }> = [];
  const errors: string[] = [];
  for (const queryCase of QUERY_CASES) {
    const providers = resolveProviders({ intent_type: "DISCOVER_COMPANY", scope: queryCase.scope, query: queryCase.query }).providers;
    for (const providerName of providers) {
      const provider = providerRegistry.get(providerName);
      if (!provider?.enabled) { errors.push(`${providerName}: unavailable`); continue; }
      const record = usage.get(providerName) ?? { requests: 0, results: 0, failures: 0, known_cost: null };
      record.requests += 1; usage.set(providerName, record);
      try {
        const results = await provider.search(queryCase.query, { max_results: 5, region: queryCase.scope === "mainland" ? "cn" : "hk" });
        record.results += results.length;
        for (const result of results) rawResults.push({ segment: queryCase.segment, provider: providerName, query: queryCase.query, title: result.title, url: result.url });
        if (results.length > 0) break;
      } catch (error) { record.failures += 1; errors.push(`${providerName}:${error instanceof Error ? error.message : "search failed"}`); }
    }
  }
  assert.ok(rawResults.length >= 0);
  const companyEntries = rawResults.slice(0, 20).map((result, index) => [result.url, {
    company_id: `live-${index + 1}`,
    canonical_name: result.title.slice(0, 120), name_cn: null, name_en: result.title.slice(0, 120), aliases: [] as string[], industry: null, sub_industry: null, country: null, region: null, city: null, company_type: null,
    website: result.url, linkedin_company_url: null, official_domains: [] as string[], target_segment: result.segment as "hk_finance" | "gba_company" | "outbound_manufacturing", parent_company_id: null, entity_scope: "operating_entity" as const,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(), last_verified_at: null, status: "unknown" as const,
  }] as const);
  const companies = [...new Map(companyEntries).values()];
  const radar = await runHeadhunterRadar({ radar_run_id: runId, week_key: weekKey(new Date()), companies, signals: [], jobs: [], people: [], contacts: [], trends: [] });
  const snapshot = buildWeeklySnapshot(radar);
  const artifact = { run_id: runId, status: errors.length === 0 ? "success" : "partial", live: true, query_cases: QUERY_CASES, provider_usage: [...usage.entries()].map(([provider, value]) => ({ provider, ...value, cost_status: value.known_cost === null ? "unknown" : "known" })), errors, result_count: rawResults.length, candidate_company_count: companies.length, a_count: snapshot.leads.filter((lead) => lead.lead_pool === "A_ACTIONABLE").length, b_count: snapshot.leads.filter((lead) => lead.lead_pool === "B_ENRICHMENT").length, trend_count: snapshot.trends.length, weekly_snapshot: snapshot, raw_results: rawResults };
  const artifactDir = join(process.cwd(), "data", "headhunter", "live-runs");
  await mkdir(artifactDir, { recursive: true });
  const artifactPath = join(artifactDir, `${runId}.json`);
  await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  console.log(JSON.stringify({ run_id: runId, status: artifact.status, provider_usage: artifact.provider_usage, result_count: artifact.result_count, candidate_company_count: artifact.candidate_company_count, a_count: artifact.a_count, b_count: artifact.b_count, artifact_path: artifactPath }));
}

function weekKey(date: Date): string { const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date); const year = Number(parts.find((p) => p.type === "year")?.value); const month = Number(parts.find((p) => p.type === "month")?.value); const day = Number(parts.find((p) => p.type === "day")?.value); const utc = new Date(Date.UTC(year, month - 1, day)); const weekday = utc.getUTCDay() || 7; utc.setUTCDate(utc.getUTCDate() + 4 - weekday); const start = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1)); return `${utc.getUTCFullYear()}-W${String(Math.ceil((((utc.getTime() - start.getTime()) / 86400000) + 1) / 7)).padStart(2, "0")}`; }

void main();
