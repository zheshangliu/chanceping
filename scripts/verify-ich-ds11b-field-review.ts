import assert from "node:assert/strict";
import fs from "node:fs";

const audit = JSON.parse(fs.readFileSync("docs/ich/DS11-B-DS8字段复核首批_V1.0.json", "utf8")) as Record<string, unknown>;
assert.equal(audit.stage, "DS11-B");
assert.equal(audit.selected_count, 5);
assert.equal(audit.formal_store_write, false);
assert.equal(audit.formal_store_unchanged, true);
assert.equal(audit.publish_count, 0);
assert.equal(audit.gate, "pass_with_followups");
const reviews = audit.reviews as Array<Record<string, unknown>>;
assert.equal(reviews.length, 5);
assert.equal(reviews.filter((item) => item.manual_decision === "confirmed_existing_record_no_change").length, 1);
assert.equal(reviews.filter((item) => item.manual_decision === "field_patch_ready_hold_write").length, 2);
assert.ok(reviews.filter((item) => String(item.manual_decision).startsWith("hold_")).length === 2);
assert.ok(reviews.every((item) => item.formal_store_write_required === false));
console.log(JSON.stringify({ stage: audit.stage, gate: audit.gate, selected_count: audit.selected_count, confirmed_no_change_count: audit.confirmed_no_change_count, patch_ready_count: audit.patch_ready_count, formal_store_write: audit.formal_store_write, publish_count: audit.publish_count }, null, 2));
