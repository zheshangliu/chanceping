import assert from "node:assert/strict";
import { buildWelfareFeed, loadRecordedWelfareOpportunities, mergeWelfareRecords, renderWelfareMarkdown } from "../src/public/welfare-opportunities";

const initial = loadRecordedWelfareOpportunities();
let records = initial;
for (let run = 0; run < 14; run += 1) records = mergeWelfareRecords(records, initial);
assert.equal(records.length, initial.length, "14 scheduled re-runs must remain idempotent");
const expired = records.map((item) => ({ ...item, deadline: "2026-07-01T18:00:00+08:00" }));
assert.equal(buildWelfareFeed(expired, { now: "2026-07-12T00:00:00+08:00" }).items.length, 0, "expired cards must leave current list");
const report = renderWelfareMarkdown([], "2026-07-12T00:00:00.000Z");
assert.match(report, /本轮无新增合格机会/);
console.log("PASS verify:welfare:shadow-run (14-run simulation)");
