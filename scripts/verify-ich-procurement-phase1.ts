import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { deduplicateOpportunityV2 } from "../src/opportunity-v2/opportunity-pool";
import { isPublicProcurementOpportunity, parseProcurementSource } from "../src/opportunity-v2/procurement-sources";
import { readProcurementSourceRegistry, validateProcurementSourceRegistry } from "../src/opportunity-v2/procurement-registry";

type Fixture = { id: string; source_id: string; kind: string; html?: string; json?: unknown; items?: unknown[]; expected: Record<string, unknown> };
const fixtures = JSON.parse(fs.readFileSync(path.resolve("config/procurement/phase1-fixtures.json"), "utf8")) as { cases: Fixture[] };
const now = new Date("2026-09-11T12:00:00+08:00");
const result: Record<string, unknown> = { fixture_count: fixtures.cases.length, cases: [], source_registry: "PASS" };
const caseResults: Array<Record<string, unknown>> = [];

for (const fixture of fixtures.cases) {
  if (fixture.kind === "dedup") {
    const deduped = deduplicateOpportunityV2(fixture.items as never[]);
    assert.equal(deduped.opportunities.length, fixture.expected.merged, fixture.id);
    assert.equal(deduped.opportunities[0]?.discovered_by_sources.length, fixture.expected.discovered_by_sources, fixture.id);
    caseResults.push({ id: fixture.id, status: "PASS", merged: deduped.opportunities.length });
    continue;
  }
  const payload = fixture.html ?? JSON.stringify(fixture.json);
  const items = parseProcurementSource(fixture.source_id, payload, `https://fixture.invalid/${fixture.id}`, now);
  assert.equal(items.length, 1, `${fixture.id}: one parsed record`);
  const item = items[0];
  const publicValue = isPublicProcurementOpportunity(item, now);
  assert.equal(publicValue, fixture.expected.public, `${fixture.id}: public gate`);
  if (fixture.expected.direction) assert.equal(item.procurement?.direction, fixture.expected.direction, fixture.id);
  if (fixture.expected.stage) assert.equal(item.procurement?.stage, fixture.expected.stage, fixture.id);
  if (fixture.expected.deadline) assert.equal(item.deadline_at?.slice(0, 10), fixture.expected.deadline, fixture.id);
  if (fixture.expected.budget !== undefined) assert.equal(item.procurement?.budget_amount, fixture.expected.budget, fixture.id);
  caseResults.push({ id: fixture.id, status: "PASS", source_id: fixture.source_id, public: publicValue, stage: item.procurement?.stage, deadline: item.deadline_at?.slice(0, 10) ?? null });
}

const registry = readProcurementSourceRegistry();
const registryErrors = validateProcurementSourceRegistry(registry);
assert.deepEqual(registryErrors, []);
result.cases = caseResults;
result.registry_source_count = registry.sources.length;
console.log(JSON.stringify(result, null, 2));
