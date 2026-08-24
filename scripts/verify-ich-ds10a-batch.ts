import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const audit = JSON.parse(fs.readFileSync(path.resolve("docs/ich/DS10-A-首批人工确认批次_V1.0.json"), "utf8")) as {
  gate: string;
  selected_count: number;
  batch_limit: number;
  manual_approval_required: boolean;
  formal_store_write: boolean;
  formal_store_before_sha256: string;
  formal_store_after_sha256: string;
  formal_store_matches_ds8: boolean;
  all_sources_accessible: boolean;
  all_titles_match: boolean;
  publishable_count: number;
  records: Array<{ approval_state: string; formal_publish_blocked: boolean; publish_decision: string; source_recheck: { accessible: boolean; title_match: boolean | null; status: number | null } }>;
};

assert.equal(audit.gate, "pass_with_followups");
assert(audit.selected_count > 0 && audit.selected_count <= audit.batch_limit && audit.batch_limit <= 10);
assert.equal(audit.manual_approval_required, true);
assert.equal(audit.formal_store_write, false);
assert.equal(audit.formal_store_before_sha256, audit.formal_store_after_sha256);
assert.equal(audit.formal_store_matches_ds8, true);
assert.equal(audit.all_sources_accessible, true);
assert.equal(audit.all_titles_match, true);
assert.equal(audit.publishable_count, 0);
assert(audit.records.every((record) => record.approval_state === "pending_manual_approval"));
assert(audit.records.every((record) => record.formal_publish_blocked && record.publish_decision === "hold"));
assert(audit.records.every((record) => record.source_recheck.accessible && (record.source_recheck.status ?? 0) >= 200 && (record.source_recheck.status ?? 0) < 400 && record.source_recheck.title_match === true));
console.log(JSON.stringify({ gate: "pass", selected_count: audit.selected_count, all_sources_accessible: true, all_titles_match: true, manual_approval_required: true, formal_store_write: false, publishable_count: 0 }, null, 2));
