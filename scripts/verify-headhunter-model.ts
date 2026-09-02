import assert from "node:assert/strict";

import {
  computeWeekKey,
  createTestWeeklyLeadSnapshot,
  isLeadPool,
  type WeeklyLeadSnapshot,
} from "../src/headhunter/model";

assert.equal(computeWeekKey(new Date("2026-09-07T00:00:00+08:00")), "2026-W37");

const lead: WeeklyLeadSnapshot = createTestWeeklyLeadSnapshot();
assert.equal(lead.lead_pool, "B_ENRICHMENT");
assert.ok(!isLeadPool("C_TREND"));
assert.ok(isLeadPool("A_ACTIONABLE"));
assert.equal(lead.manual_action, null);
assert.equal(lead.action_manually_edited, false);
assert.equal(lead.manual_outreach, null);
assert.equal(lead.outreach_manually_edited, false);

console.log("headhunter domain model verification: PASS");
