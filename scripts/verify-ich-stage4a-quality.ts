import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getIchSourceRegistryV2 } from "../src/ich/source-registry-v2";

const root = process.cwd();
const reportPath = path.resolve(root, "docs/ich/stage4a-quality-simulation.json");
const report = JSON.parse(fs.readFileSync(reportPath, "utf8")) as {
  stage: string;
  readonly: boolean;
  formal_store_write: boolean;
  input_count: number;
  current_active: number;
  formal_store_sha256: string;
  optimized: { review_required: number; rejected: number };
};
const registry = getIchSourceRegistryV2();

assert.equal(report.stage, "4A");
assert.equal(report.readonly, true);
assert.equal(report.formal_store_write, false);
assert.equal(report.input_count, 47);
assert.equal(report.current_active, 13);
const currentFormalStoreSha256 = crypto.createHash("sha256").update(fs.readFileSync(path.resolve(root, "data/ich-opportunities.json"))).digest("hex");
assert.equal(report.formal_store_sha256, currentFormalStoreSha256);
assert.equal(report.optimized.review_required, 33);
assert.equal(report.optimized.rejected, 14);
assert(registry.query_packs.some((pack) => pack.id === "ich-cn-quality-v3"));
assert(registry.query_packs.some((pack) => pack.id === "ich-intl-quality-v3"));
assert(fs.readFileSync(path.resolve(root, "src/ich/applicant-fit.ts"), "utf8").includes("eligible_profiles"));
for (const file of [
  "stage4a-failure-analysis.md",
  "stage4a-query-report.md",
  "stage4a-ranking-report.md",
]) {
  assert(fs.existsSync(path.resolve(root, "docs/ich", file)), `${file} missing`);
}

console.log(JSON.stringify({ gate: "pass", readonly: true, formal_store_write: false, input_count: report.input_count, current_active: report.current_active, reports: 3 }, null, 2));
