import type { RequirementClarity } from "./lead";

export type JobStatus = "open" | "closed" | "unknown";

export type JobObservationStatus = "NEW_JOB" | "ONGOING_JOB" | "REPOSTED_JOB" | "CLOSED_JOB" | "REOPENED_JOB";

export interface Job {
  job_id: string;
  company_id: string;
  canonical_title: string;
  original_titles: string[];
  location: string | null;
  role_family: string | null;
  license_requirement: RequirementClarity;
  ra1_clarity: RequirementClarity;
  cantonese_clarity: RequirementClarity;
  employment_type: string | null;
  first_seen_at: string;
  last_seen_at: string;
  current_status: JobStatus;
  source_urls: string[];
}

export interface JobObservation {
  observation_id: string;
  job_id: string;
  observed_at: string;
  source: string;
  source_url: string;
  title_raw: string;
  location_raw: string | null;
  description_excerpt: string | null;
  is_open: boolean | null;
  salary: string | null;
  headcount_signal: number | null;
  content_hash: string | null;
  observation_status: JobObservationStatus;
}

export function isJobStatus(value: string): value is JobStatus {
  return ["open", "closed", "unknown"].includes(value);
}
