import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProviderRegistry, type SearchProvider } from "../src/search/provider-registry";
import type { SearchResult } from "../src/search/types";
import { createHeadHunterStores } from "../src/headhunter/stores";
import { runHeadHunterWeeklyPipeline } from "../src/headhunter/pipeline/weekly-pipeline";

const assert = (condition: unknown, message: string): void => { if (!condition) throw new Error(`FAIL ${message}`); console.log(`PASS ${message}`); };
let discoveryCount = 0;

function fixtureProvider(name: string): SearchProvider {
  return {
    name, display_name: `Fixture ${name}`, source_type: "web", reliability: "B", enabled: true, radar_types: ["custom"],
    async healthCheck() { return true; },
    async search(query: string): Promise<SearchResult[]> {
      const companyMatch = query.match(/company(\d+)/i);
      const index = companyMatch ? Number(companyMatch[1]) : 1;
      const domain = `company${String(index).padStart(2, "0")}.cn`;
      if (/LinkedIn/i.test(query)) return [{ title: `Talent Acquisition Lead - Company${index}`, url: `https://www.linkedin.com/in/company${index}-ta`, snippet: `Talent Acquisition Lead at Company${index}`, source_provider: name, source_type: "web" }];
      if (/site:.*careers.*contact/i.test(query)) return [{ title: `Company${index} Careers`, url: `https://${domain}/careers`, snippet: "Recruitment contact and careers entry", source_provider: name, source_type: "web" }];
      if (/careers jobs hiring/i.test(query)) return [{ title: `HR Director Company${index}`, url: `https://${domain}/careers/hr-director`, snippet: `Company${index} is hiring an HR Director`, source_provider: name, source_type: "web" }];
      if (/hiring expansion funding license factory overseas headquarters recruitment/i.test(query)) return [{ title: `Company${index} announces hiring expansion`, url: `https://${domain}/news/hiring-expansion`, snippet: `Company${index} announced recruitment expansion and a new business line`, source_provider: name, source_type: "web", published_at: "2026-09-01" }];
      const themeIndex = ++discoveryCount;
      return [{ title: `Company${themeIndex} official expansion announcement`, url: `https://company${String(themeIndex).padStart(2, "0")}.cn/news`, snippet: "Official company expansion and hiring announcement", source_provider: name, source_type: "web", published_at: "2026-09-01" }];
    },
  };
}

async function main(): Promise<void> {
  const dataDir = await mkdtemp(join(tmpdir(), "chanceping-v12-"));
  try {
    const providers = new ProviderRegistry(); providers.register(fixtureProvider("serper")); providers.register(fixtureProvider("doubao_search")); providers.register(fixtureProvider("exa"));
    const stores = createHeadHunterStores(dataDir);
    const first = await runHeadHunterWeeklyPipeline({ providers, stores, maxThemes: 24, maxCompanies: 24, weekKey: "2026-W36", radarRunId: "golden-v12-week-1" });
    const second = await runHeadHunterWeeklyPipeline({ providers, stores, maxThemes: 24, maxCompanies: 24, weekKey: "2026-W37", radarRunId: "golden-v12-week-2" });
    assert(first.run.candidate_url_count! >= 20, "Stage 1 keeps at least 20 candidate URLs");
    assert(first.run.company_candidate_count! >= 20, "Stage 2 extracts company candidates");
    assert(first.run.company_resolved_count! >= 20, "Stage 3 resolves verified companies");
    assert(first.run.signal_count! > 0, "Stage 4 executes signal discovery");
    assert(first.run.job_count! > 0, "Stage 5 executes job discovery");
    assert(first.run.person_candidate_count! > 0, "Stage 6 executes people discovery");
    assert(first.run.contact_count! > 0, "Stage 6 executes official contact discovery");
    assert(first.run.need_count! > 0, "Stage 7 infers needs");
    assert(first.run.stage_metrics?.a_count !== undefined && first.run.stage_metrics?.b_count !== undefined, "Stage 8-9 persist A/B metrics");
    assert(second.run.radar_run_id === "golden-v12-week-2", "20-company x 2-week golden run completes");
    assert(first.snapshot.funnel_metrics?.candidate_url_count === first.run.candidate_url_count, "Weekly snapshot exposes funnel metrics");
    assert(first.snapshot.leads.every((lead) => lead.evidences?.every((evidence) => evidence.source_url.startsWith("https://"))), "Lead evidence URLs are real clickable URLs");
    assert(first.snapshot.leads.filter((lead) => lead.lead_pool === "A_ACTIONABLE").every((lead) => lead.contact_gate_status === "pass" && lead.evidence_gate_status === "pass" && (lead.business_score ?? 0) >= 70), "No lead bypasses A gate");
    console.log(JSON.stringify({ status: "PASS", first_run: first.run.radar_run_id, second_run: second.run.radar_run_id, first_metrics: first.stage_metrics, second_metrics: second.stage_metrics }));
  } finally { await rm(dataDir, { recursive: true, force: true }); }
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
