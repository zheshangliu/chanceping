import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { procurementDomainTags } from "../src/opportunity-v2/procurement";
import { isPublicProcurementOpportunity, parseProcurementSource } from "../src/opportunity-v2/procurement-sources";

type Fixture = { id: string; source_id: string; html?: string; json?: unknown; expected: Record<string, unknown> };
const fixturePath = path.resolve("config/procurement/phase1-1-fixtures.json");
const fixtures = JSON.parse(fs.readFileSync(fixturePath, "utf8")) as { cases: Fixture[] };
const now = new Date("2026-09-11T12:00:00+08:00");
const cases: Array<Record<string, unknown>> = [];

function parse(fixture: Fixture) {
  const payload = fixture.html ?? JSON.stringify(fixture.json);
  const items = parseProcurementSource(fixture.source_id, payload, `https://fixture.invalid/${fixture.id}`, now);
  assert.ok(items.length > 0, `${fixture.id}: expected at least one parsed item`);
  return items;
}

for (const fixture of fixtures.cases) {
  const items = parse(fixture);
  const expected = fixture.expected;
  if (fixture.id === "COUNTRY-CODES") {
    assert.deepEqual(items.map((item) => item.procurement?.country_code), expected.country_codes, fixture.id);
  } else if (fixture.id === "DOMAIN-TAGS") {
    const tags = procurementDomainTags(`${items[0].title} ${items[0].raw_text}`);
    assert.deepEqual(tags, expected.domain_tags, fixture.id);
  } else {
    const item = items[0];
    for (const [key, value] of Object.entries(expected)) {
      if (key === "public") assert.equal(isPublicProcurementOpportunity(item, now), value, `${fixture.id}: public`);
      else if (key === "deadline") assert.equal(item.deadline_at, value, `${fixture.id}: deadline`);
      else if (key === "published_at") assert.equal(item.published_at, value, `${fixture.id}: published_at`);
      else if (key === "buyer_name") assert.equal(item.procurement?.buyer_name, value, `${fixture.id}: buyer_name`);
      else if (key === "project_id") assert.equal(item.procurement?.project_id, value, `${fixture.id}: project_id`);
      else if (key === "procurement_method") assert.equal(item.procurement?.procurement_method, value, `${fixture.id}: procurement_method`);
      else if (key === "stage") assert.equal(item.procurement?.stage, value, `${fixture.id}: stage`);
    }
    if (fixture.id === "DATE-ONLY-NO-FAKE-TIME") assert.ok(!item.deadline_at?.includes("T"), `${fixture.id}: date-only value must not gain a clock`);
  }
  cases.push({ id: fixture.id, status: "PASS", parsed: items.length });
}

const exactCcgP = parse(fixtures.cases.find((fixture) => fixture.id === "CCGP-EXACT-FIELDS")!)[0];
assert.equal(exactCcgP.deadline_at, "2026-09-21T05:30:00.000Z", "CCGP exact Beijing clock must be preserved as UTC");
assert.equal(exactCcgP.procurement?.buyer_name, "苏州市文化广电和旅游局", "CCGP buyer must stop at the next label");
assert.equal(exactCcgP.procurement?.project_id, "JSZC-320500-SZCH-C2026-0043", "CCGP project id must stop at the next label");
assert.equal(exactCcgP.procurement?.procurement_method, "竞争性磋商", "CCGP method must stop at the next label");

const dateOnly = parse(fixtures.cases.find((fixture) => fixture.id === "DATE-ONLY-NO-FAKE-TIME")!)[0];
assert.equal(dateOnly.deadline_at, "2026-10-01", "date-only deadline must remain date-only");
assert.equal(isPublicProcurementOpportunity(dateOnly, now), true, "date-only current opportunity remains public");

console.log(JSON.stringify({
  fixture_file: fixturePath,
  fixture_count: fixtures.cases.length,
  cases,
  gates: {
    ccgp_exact_local_time: "PASS",
    ccgp_label_boundaries: "PASS",
    date_only_no_fake_time: "PASS",
    event_date_does_not_steal_submission_deadline: "PASS",
    worldbank_json_current_closed_awarded_construction: "PASS",
    domain_tags: "PASS",
    country_codes: "PASS",
    official_evidence_public_gate: "PASS",
  },
}, null, 2));
