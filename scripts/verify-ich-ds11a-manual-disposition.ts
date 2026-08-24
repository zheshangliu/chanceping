import assert from "node:assert/strict";
import fs from "node:fs";

const audit = JSON.parse(fs.readFileSync("docs/ich/DS11-A-DS8首批人工处置确认_V1.0.json", "utf8")) as Record<string, unknown>;
assert.equal(audit.stage, "DS11-A");
assert.equal(audit.formal_store_write, false);
assert.equal(audit.formal_store_unchanged, true);
assert.equal(audit.publish_count, 0);
assert.equal(audit.gate, "pass_with_followups");
assert.equal(audit.selected_count, 4);
assert.equal(audit.confirmed_count, 4);
const resolutions = audit.resolutions as Array<Record<string, unknown>>;
assert.equal(resolutions.length, 4);
assert.ok(resolutions.every((item) => item.resolution === "confirmed_existing_record_no_change"));
assert.ok(resolutions.every((item) => item.formal_publish_blocked === false));
assert.ok(resolutions.every((item) => (item.source_recheck as Record<string, unknown>).accessible === true));
assert.ok(resolutions.every((item) => (item.source_recheck as Record<string, unknown>).title_match === true));
console.log(JSON.stringify({ stage: audit.stage, gate: audit.gate, selected_count: audit.selected_count, confirmed_count: audit.confirmed_count, formal_store_write: audit.formal_store_write, publish_count: audit.publish_count }, null, 2));
