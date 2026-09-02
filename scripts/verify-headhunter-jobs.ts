import assert from "node:assert/strict";
import type { Job, JobObservation } from "../src/headhunter/model/job";
import { classifyCantoneseClarity, classifyRa1Clarity } from "../src/headhunter/jobs/literal-requirements";
import { deriveJobStatus } from "../src/headhunter/jobs/job-resolver";
import { detectHiringSignals } from "../src/headhunter/jobs/job-signal-detector";

assert.equal(classifyRa1Clarity("securities experience required"), "not_mentioned");
assert.equal(classifyRa1Clarity("must hold SFC Type 1 / RA1"), "explicit_required");
assert.equal(classifyCantoneseClarity("Hong Kong based role"), "not_mentioned");
assert.equal(classifyCantoneseClarity("Cantonese is preferred"), "explicit_preferred");

const job: Job = { job_id: "c:job-1", company_id: "c", canonical_title: "HR Director", original_titles: ["HR Director"], location: "Hong Kong", role_family: "HR", license_requirement: "not_mentioned", ra1_clarity: "not_mentioned", cantonese_clarity: "not_mentioned", employment_type: "full-time", first_seen_at: "2026-07-01T00:00:00Z", last_seen_at: "2026-09-02T00:00:00Z", current_status: "open", source_urls: ["https://example.com/job"] };
const observations: JobObservation[] = [
  { observation_id: "o1", job_id: job.job_id, observed_at: "2026-07-01T00:00:00Z", source: "official", source_url: "https://example.com/job", title_raw: "HR Director", location_raw: "Hong Kong", description_excerpt: "", is_open: true, salary: null, headcount_signal: null, content_hash: "h1", observation_status: "NEW_JOB" },
  { observation_id: "o2", job_id: job.job_id, observed_at: "2026-08-15T00:00:00Z", source: "official", source_url: "https://example.com/job", title_raw: "HR Director", location_raw: "Hong Kong", description_excerpt: "", is_open: true, salary: null, headcount_signal: null, content_hash: "h1", observation_status: "REPOSTED_JOB" },
  { observation_id: "o3", job_id: job.job_id, observed_at: "2026-09-02T00:00:00Z", source: "official", source_url: "https://example.com/job", title_raw: "HR Director", location_raw: "Hong Kong", description_excerpt: "", is_open: true, salary: null, headcount_signal: null, content_hash: "h2", observation_status: "ONGOING_JOB" },
];
assert.equal(deriveJobStatus(observations), "REPOSTED_JOB");
assert.ok(detectHiringSignals(job, observations, new Date("2026-09-02T00:00:00Z")).includes("ONGOING_HARD_TO_FILL"));
assert.ok(detectHiringSignals(job, [
  ...observations,
  { ...observations[2], observation_id: "o4", job_id: "c:job-2", title_raw: "Recruiter", content_hash: "h3" },
  { ...observations[2], observation_id: "o5", job_id: "c:job-3", title_raw: "HRBP", content_hash: "h4" },
], new Date("2026-09-02T00:00:00Z")).includes("HIRING_EXPANSION"));
console.log("headhunter job intelligence verification: PASS");
