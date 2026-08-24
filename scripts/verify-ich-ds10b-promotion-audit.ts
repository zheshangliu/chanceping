import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const audit = JSON.parse(fs.readFileSync(path.resolve("docs/ich/DS10-B-来源晋级批次_V1.0.json"), "utf8")) as { gate: string; source_count: number; formal_store_write: boolean; promotion_decision: string; global_safety_checks: { ds1c_template_contamination: number; ds1c_duplicates: number; ds3_approved_count: number; store_hash_matches_ds2: boolean; store_hash_matches_ds3: boolean }; sources: Array<{ checks: Record<string, boolean>; sample_count: number; readonly_candidate_count: number }> };
assert.equal(audit.gate, "pass_with_followups");
assert.equal(audit.source_count, 3);
assert.equal(audit.formal_store_write, false);
assert.equal(audit.promotion_decision, "adapter_ready_with_formal_publish_blocked");
assert.equal(audit.global_safety_checks.ds1c_template_contamination, 0);
assert.equal(audit.global_safety_checks.ds1c_duplicates, 0);
assert.equal(audit.global_safety_checks.ds3_approved_count, 0);
assert.equal(audit.global_safety_checks.store_hash_matches_ds2, true);
assert.equal(audit.global_safety_checks.store_hash_matches_ds3, true);
assert(audit.sources.every((source) => source.sample_count >= 3 && source.readonly_candidate_count >= 3 && Object.values(source.checks).every(Boolean)));
console.log(JSON.stringify({ gate: "pass", source_count: audit.source_count, adapters_verified: audit.source_count, formal_publish_blocked: true, formal_store_write: false }, null, 2));
