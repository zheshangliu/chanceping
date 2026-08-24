import fs from "node:fs";
import path from "node:path";
import { sha256 } from "../src/ich/discovery-runtime-v1";
import type { IchCandidateQualityAssessment } from "../src/ich/candidate-quality-v1";

interface QualityRun { schema_version: string; readonly: boolean; formal_store_write: boolean; formal_store_path: string; formal_store_before_sha256: string; input_candidate_count: number; assessment_count: number; approved_count: number; assessments: IchCandidateQualityAssessment[] }
const inputPath = path.resolve(process.argv.includes("--input") ? process.argv[process.argv.indexOf("--input") + 1] : "docs/ich/DS3-候选质量运行记录_V1.0.json");
const run = JSON.parse(fs.readFileSync(inputPath, "utf8")) as QualityRun;
const errors: string[] = [];
if (run.schema_version !== "ich-ds3-candidate-quality.v1") errors.push("unsupported DS3 schema");
if (!run.readonly || run.formal_store_write) errors.push("DS3 must be readonly");
if (run.input_candidate_count !== run.assessment_count || run.assessment_count !== run.assessments.length) errors.push("assessment count mismatch");
if (run.approved_count !== 0) errors.push("DS3 must not auto-approve candidates");
if (run.assessments.some((assessment) => !assessment.formal_publish_blocked || !["review_required", "reject"].includes(assessment.decision))) errors.push("assessment bypassed formal publish block");
const storePath = path.resolve(run.formal_store_path);
if (!fs.existsSync(storePath) || sha256(fs.readFileSync(storePath)) !== run.formal_store_before_sha256) errors.push("formal store changed or missing");
console.log(JSON.stringify({ input: path.relative(process.cwd(), inputPath), candidates: run.input_candidate_count, assessments: run.assessment_count, approved_count: run.approved_count, formal_store_write: run.formal_store_write, gate: errors.length === 0 ? "pass" : "fail", errors }, null, 2));
if (errors.length) process.exitCode = 1;
