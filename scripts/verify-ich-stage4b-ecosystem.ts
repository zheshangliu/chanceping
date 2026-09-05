import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getIchSourceRegistryV2 } from "../src/ich/source-registry-v2";
import { ICH_RADAR_PROFILE } from "../src/ich/profile";

const root = process.cwd();
const summaryPath = path.resolve(root, "docs/ich/stage4b-summary.json");
const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8")) as {
  stage: string;
  readonly: boolean;
  formal_store_write: boolean;
  formal_store_sha256: string;
  source_count: number;
  candidate_count: number;
  unique_candidate_count: number;
  duplicate_url_count: number;
  target_candidate_count: number;
  shortfall_to_target: number;
  high_quality_count: number;
};
const registry = getIchSourceRegistryV2();
const currentStoreSha256 = crypto.createHash("sha256").update(fs.readFileSync(path.resolve(root, "data/ich-opportunities.json"))).digest("hex");

assert.equal(summary.stage, "4B");
assert.equal(summary.readonly, true);
assert.equal(summary.formal_store_write, false);
assert.equal(summary.formal_store_sha256, currentStoreSha256);
assert.equal(summary.source_count, 19);
assert(summary.candidate_count > 0);
assert.equal(summary.unique_candidate_count, summary.candidate_count);
assert.equal(summary.duplicate_url_count, 0);
assert.equal(summary.shortfall_to_target, Math.max(0, summary.target_candidate_count - summary.candidate_count));
assert(registry.query_packs.some((pack) => pack.id === "ich-heritage-program-v4"));
assert(registry.query_packs.some((pack) => pack.id === "ich-museum-collaboration-v4"));
assert(registry.query_packs.some((pack) => pack.id === "ich-commercial-channel-v4"));
assert(registry.query_packs.some((pack) => pack.id === "ich-craft-market-v4"));
assert(registry.query_packs.some((pack) => pack.id === "ich-residency-v4"));
assert(ICH_RADAR_PROFILE.lanes.includes("heritage_program"));
for (const file of ["candidate-batch-report.md", "source-performance-report.md", "stage4b-query-pack-report.md"]) {
  assert(fs.existsSync(path.resolve(root, "docs/ich", file)), `${file} missing`);
}

console.log(JSON.stringify({ gate: summary.shortfall_to_target === 0 ? "pass" : "pass_with_followups", readonly: true, formal_store_write: false, source_count: summary.source_count, candidate_count: summary.candidate_count, high_quality_count: summary.high_quality_count, shortfall_to_target: summary.shortfall_to_target }, null, 2));
