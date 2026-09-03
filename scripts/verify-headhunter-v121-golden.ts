import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProviderRegistry, type SearchProvider } from "../src/search/provider-registry";
import type { SearchResult } from "../src/search/types";
import { createHeadHunterStores } from "../src/headhunter/stores";
import { runHeadHunterWeeklyPipeline } from "../src/headhunter/pipeline/weekly-pipeline";

/** Offline 20-company acceptance sample. It deliberately has no TikHub adapter. */
async function main(): Promise<void> {
  const dataDir = await mkdtemp(join(tmpdir(), "chanceping-headhunter-v121-golden-"));
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async () => { throw new Error("V1.2.1 golden verifier forbids network calls"); }) as typeof fetch;
  try {
    const providers = new ProviderRegistry();
    for (const name of ["serper", "doubao_search", "exa"]) providers.register(fixtureProvider(name));
    const result = await runHeadHunterWeeklyPipeline({ providers, stores: createHeadHunterStores(dataDir), maxThemes: 24, maxCompanies: 20, weekKey: "2026-W37", radarRunId: "v121-golden-20", publish: false });
    const metrics = result.stage_metrics ?? {};
    assert.equal(result.run.status, "success");
    assert.equal(metrics.company_resolved_count, 20);
    assert.equal(result.snapshot.leads.length, 20);
    assert.ok((metrics.signal_count ?? 0) > 0);
    assert.ok((metrics.job_count ?? 0) > 0);
    assert.ok((metrics.person_candidate_count ?? 0) > 0);
    assert.ok((metrics.contact_count ?? 0) > 0);
    assert.ok(result.snapshot.leads.every((lead) => lead.business_review_status === "machine_candidate"));
    console.log(JSON.stringify({ status: "PASS", run_id: result.run.radar_run_id, companies: metrics.company_resolved_count, signals: metrics.signal_count, jobs: metrics.job_count, people: metrics.person_candidate_count, contacts: metrics.contact_count, a_candidates: metrics.a_count, b_candidates: metrics.b_count, tikhub_requests: 0 }));
  } finally {
    globalThis.fetch = previousFetch;
    await rm(dataDir, { recursive: true, force: true });
  }
}

let fixtureDiscovery = 0;
function fixtureProvider(name: string): SearchProvider {
  return {
    name, display_name: `V1.2.1 fixture ${name}`, source_type: "web", reliability: "B", enabled: true, radar_types: ["headhunter"],
    async healthCheck() { return true; },
    async search(query: string): Promise<SearchResult[]> {
      const match = query.match(/company(\d+)/i);
      const index = match ? Number(match[1]) : (++fixtureDiscovery);
      const company = `Company${index}`;
      const domain = `company${String(index).padStart(2, "0")}.cn`;
      const base = { source_provider: name, source_type: "web" as const };
      if (/LinkedIn Talent Acquisition/i.test(query)) return [{ ...base, title: `${company} Talent Acquisition Lead`, url: `https://www.linkedin.com/in/company${index}-ta`, snippet: `Talent Acquisition Lead at ${company}` }];
      if (/site:.*careers.*contact/i.test(query)) return [{ ...base, title: `${company} Careers`, url: `https://${domain}/careers`, snippet: `${company} recruitment careers and contact` }];
      if (/careers jobs hiring/i.test(query)) return [{ ...base, title: `${company} HR Director`, url: `https://${domain}/careers/hr-director`, snippet: `${company} is hiring an HR Director` }];
      if (/hiring expansion funding license factory overseas headquarters recruitment/i.test(query)) return [{ ...base, title: `${company} hiring expansion`, url: `https://${domain}/news/hiring-expansion`, snippet: `${company} announced a recent hiring expansion`, published_at: "2026-09-01" }];
      return [{ ...base, title: `${company} official expansion announcement`, url: `https://${domain}/news`, snippet: `${company} official expansion and hiring announcement`, published_at: "2026-09-01" }];
    },
  };
}

void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
