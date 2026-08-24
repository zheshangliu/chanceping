import fs from "node:fs";
import path from "node:path";
import { sha256, type IchDs2ReadonlyDiscoveryRun } from "../src/ich/discovery-runtime-v1";

const inputPath = path.resolve(process.argv.includes("--input") ? process.argv[process.argv.indexOf("--input") + 1] : "docs/ich/DS2-只读发现运行记录_V1.0.json");
const report = JSON.parse(fs.readFileSync(inputPath, "utf8")) as IchDs2ReadonlyDiscoveryRun;
const errors: string[] = [];
if (report.schema_version !== "ich-ds2-readonly-discovery.v1") errors.push("unsupported DS2 schema");
if (!report.readonly || report.formal_store_write) errors.push("DS2 must be readonly and formal_store_write=false");
if (report.source_count !== report.source_runs.length || report.source_count < 3) errors.push("source run count is incomplete");
if (report.candidate_count !== report.source_runs.reduce((sum, sourceRun) => sum + sourceRun.candidate_count, 0)) errors.push("candidate count mismatch");
for (const sourceRun of report.source_runs) {
  if (!sourceRun.raw_snapshot_hash || !/^[a-f0-9]{64}$/u.test(sourceRun.raw_snapshot_hash)) errors.push(`${sourceRun.source_id}: listing snapshot hash missing`);
  if (sourceRun.candidate_count !== sourceRun.candidates.length) errors.push(`${sourceRun.source_id}: candidate count mismatch`);
  if (sourceRun.candidate_count > 3) errors.push(`${sourceRun.source_id}: max sample limit exceeded`);
  for (const candidate of sourceRun.candidates) {
    if (candidate.review_state !== "candidate_only") errors.push(`${candidate.candidate_id}: not candidate_only`);
    if (!candidate.source_url.startsWith("https://")) errors.push(`${candidate.candidate_id}: source URL must use HTTPS`);
    if (!/^[a-f0-9]{64}$/u.test(candidate.raw_snapshot_hash)) errors.push(`${candidate.candidate_id}: detail snapshot hash missing`);
  }
}
const storePath = path.resolve(report.formal_store_path);
if (!fs.existsSync(storePath)) errors.push(`formal store missing: ${report.formal_store_path}`);
else if (sha256(fs.readFileSync(storePath)) !== report.formal_store_before_sha256) errors.push("formal store changed after DS2 run");
console.log(JSON.stringify({ input: path.relative(process.cwd(), inputPath), source_count: report.source_count, candidate_count: report.candidate_count, readonly: report.readonly, formal_store_write: report.formal_store_write, formal_store_unchanged: errors.every((error) => !error.includes("formal store")), gate: errors.length === 0 ? "pass" : "fail", errors }, null, 2));
if (errors.length > 0) process.exitCode = 1;
