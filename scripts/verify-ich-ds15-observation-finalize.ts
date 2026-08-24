import assert from "node:assert/strict";
import fs from "node:fs";
const audit = JSON.parse(fs.readFileSync("docs/ich/DS15-三日观察收口审计_V1.0.json", "utf8")) as Record<string, any>;
assert.equal(audit.stage, "DS15");
assert.equal(audit.gate, "complete");
assert.equal(audit.formal_store_write, false);
assert.equal(audit.half_automatic_update_decision, "allow_readonly_candidate_refresh_keep_manual_formal_import");
assert.ok(audit.checks.every((check: Record<string, unknown>) => check.ok === true));
console.log(JSON.stringify({ stage: audit.stage, gate: audit.gate, checks: audit.checks.length, half_automatic_update_decision: audit.half_automatic_update_decision }, null, 2));
