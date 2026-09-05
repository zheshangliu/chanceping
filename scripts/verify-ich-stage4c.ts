import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getIchSourceRegistryV2 } from "../src/ich/source-registry-v2";
import { ICH_OPPORTUNITY_STAGES } from "../src/ich/opportunity-intelligence";

const root = process.cwd();
const summary = JSON.parse(fs.readFileSync(path.resolve(root, "docs/ich/stage4c-summary.json"), "utf8")) as {
  stage: string;
  readonly: boolean;
  formal_store_write: boolean;
  formal_store_sha256: string;
  input_candidate_count: number;
  reclassified_count: number;
  qualified_count: number;
  high_quality_count: number;
  target_qualified_count: number;
  target_high_quality_count: number;
};
const registry = getIchSourceRegistryV2();
const storeSha256 = crypto.createHash("sha256").update(fs.readFileSync(path.resolve(root, "data/ich-opportunities.json"))).digest("hex");

assert.equal(summary.stage, "4C-A");
assert.equal(summary.readonly, true);
assert.equal(summary.formal_store_write, false);
assert.equal(summary.formal_store_sha256, storeSha256);
assert.equal(summary.input_candidate_count, 193);
assert.equal(summary.reclassified_count, summary.input_candidate_count);
assert.equal(summary.qualified_count, 12);
assert.equal(summary.high_quality_count, 0);
assert(summary.qualified_count < summary.target_qualified_count);
assert(summary.high_quality_count < summary.target_high_quality_count);
assert.equal(registry.sources.length, 100);
assert(registry.sources.every((source) => ["opportunity_source", "information_source", "discovery_source"].includes(source.source_role)));
assert.deepEqual(ICH_OPPORTUNITY_STAGES, ["open_application", "open_call", "project_invitation", "policy_program", "announcement_only", "historical_record"]);
for (const file of ["stage4c-reclassification-report.md", "source-role-audit-report.md"]) {
  assert(fs.existsSync(path.resolve(root, "docs/ich", file)), `${file} missing`);
}

console.log(JSON.stringify({ gate: "pass_with_followups", readonly: true, formal_store_write: false, input_candidate_count: summary.input_candidate_count, qualified_count: summary.qualified_count, high_quality_count: summary.high_quality_count, next_action: "补齐机会源适配器后再进入 Stage5" }, null, 2));
