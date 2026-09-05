import fs from "node:fs";
import path from "node:path";
import { assessIchCandidateQuality, type IchCandidateQualityAssessment } from "../src/ich/candidate-quality-v1";
import { sha256 } from "../src/ich/discovery-runtime-v1";
import type { IchCandidateSample } from "../src/ich/source-adapters-v1";

interface DiscoveryFile { source_runs: Array<{ candidates: IchCandidateSample[] }> }
interface QualityRun {
  schema_version: "ich-ds3-candidate-quality.v1";
  run_id: string;
  ran_at: string;
  readonly: true;
  formal_store_write: false;
  formal_store_path: string;
  formal_store_before_sha256: string;
  input_candidate_count: number;
  assessment_count: number;
  approved_count: 0;
  review_required_count: number;
  rejected_count: number;
  assessments: IchCandidateQualityAssessment[];
  gate: "pass" | "fail";
}

const inputPath = path.resolve(process.argv.includes("--input") ? process.argv[process.argv.indexOf("--input") + 1] : "docs/ich/DS2-只读发现运行记录_V1.0.json");
const outputPath = path.resolve(process.argv.includes("--output") ? process.argv[process.argv.indexOf("--output") + 1] : "docs/ich/DS3-候选质量运行记录_V1.0.json");
const storePath = path.resolve(process.env.CHANCEPING_ICH_STORE_PATH ?? "data/ich-opportunities.json");
const discovery = JSON.parse(fs.readFileSync(inputPath, "utf8")) as DiscoveryFile;
const samples = discovery.source_runs.flatMap((sourceRun) => sourceRun.candidates);
const existingUrls = new Set((JSON.parse(fs.readFileSync(storePath, "utf8")) as { entries: Array<{ sources: Array<{ url: string }> }> }).entries.flatMap((entry) => entry.sources.map((source) => source.url.replace(/#.*$/, "").replace(/\/$/, ""))));
const assessments = samples.map((sample) => assessIchCandidateQuality(sample, existingUrls));
const run: QualityRun = { schema_version: "ich-ds3-candidate-quality.v1", run_id: `ich-ds3-quality-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`, ran_at: new Date().toISOString(), readonly: true, formal_store_write: false, formal_store_path: path.relative(process.cwd(), storePath), formal_store_before_sha256: sha256(fs.readFileSync(storePath)), input_candidate_count: samples.length, assessment_count: assessments.length, approved_count: 0, review_required_count: assessments.filter((assessment) => assessment.decision === "review_required").length, rejected_count: assessments.filter((assessment) => assessment.decision === "reject").length, assessments, gate: assessments.length === samples.length && assessments.every((assessment) => assessment.formal_publish_blocked) ? "pass" : "fail" };
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(run, null, 2)}\n`);
console.log(JSON.stringify({ output: path.relative(process.cwd(), outputPath), input_candidate_count: run.input_candidate_count, assessment_count: run.assessment_count, review_required_count: run.review_required_count, rejected_count: run.rejected_count, approved_count: run.approved_count, formal_store_write: run.formal_store_write, gate: run.gate }, null, 2));
if (run.gate === "fail") process.exitCode = 1;
