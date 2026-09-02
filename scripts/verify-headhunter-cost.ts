import assert from "node:assert/strict";
import { ProviderRegistry, type SearchProvider } from "../src/search/provider-registry";
import { executeHeadhunterIntent } from "../src/headhunter/search/headhunter-search";
import { resolveProviders } from "../src/headhunter/search/routing";
import { planHeadhunterSearch } from "../src/headhunter/search/theme-planner";
import { CostLedger } from "../src/headhunter/observability/cost-ledger";

const provider = (name: string, results: number): SearchProvider => ({ name, display_name: name, source_type: "web", reliability: "B", enabled: true, radar_types: ["headhunter"], async search() { return Array.from({ length: results }, (_, index) => ({ title: `${name}-${index}`, url: `https://${name}.example/${index}`, snippet: "result", source_provider: name, source_type: "web" as const })); }, async healthCheck() { return true; } });
const registry = new ProviderRegistry();
registry.register(provider("serper", 0));
registry.register(provider("exa", 1));
registry.register(provider("doubao", 1));
assert.deepEqual(resolveProviders({ intent_type: "DISCOVER_COMPANY", scope: "mainland", query: "x" }).providers, ["doubao", "serper"]);
assert.deepEqual(resolveProviders({ intent_type: "DISCOVER_PERSON", scope: "people", query: "x", serper_found_relevant_people: true }).providers, ["serper"]);
assert.deepEqual(resolveProviders({ intent_type: "DISCOVER_PERSON", scope: "people", query: "x", serper_found_relevant_people: false }).providers, ["serper", "exa"]);
const plan = planHeadhunterSearch({ scope: "hk_global", companyNames: Array.from({ length: 20 }, (_, index) => `Company ${index}`) });
assert.equal(plan.intents.length, 20);
async function main(): Promise<void> {
  const outcome = await executeHeadhunterIntent({ intent_type: "DISCOVER_PERSON", scope: "people", query: "HR", serper_found_relevant_people: false }, registry, { serper: { cost_per_request: 0.01 }, exa: { cost_per_request: null } });
  assert.deepEqual(outcome.providers_attempted, ["serper", "exa"]);
  assert.equal(outcome.known_cost, 0.01);
  assert.equal(outcome.unknown_cost, true);
  const stopped = await executeHeadhunterIntent({ intent_type: "VERIFY_EVIDENCE", scope: "hk_global", query: "x", evidence_gate_passed: true }, registry);
  assert.equal(stopped.stopped_after_evidence_gate, true);
  const ledger = new CostLedger();
  ledger.record("serper", 0.01);
  ledger.record("exa", null);
  const summary = ledger.summarize();
  assert.equal(summary.known_total, 0.01);
  assert.deepEqual(summary.unknown_providers, ["exa"]);
  console.log("headhunter search routing and cost guard verification: PASS");
}
void main();
