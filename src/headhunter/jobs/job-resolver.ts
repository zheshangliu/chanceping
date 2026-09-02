import type { Job, JobObservation, JobObservationStatus } from "../model/job";

export interface JobResolution {
  job: Job | null;
  status: "matched" | "new" | "needs_review";
  reason: string;
}

export function resolveJobObservation(observation: JobObservation, jobs: Job[]): JobResolution {
  const matches = jobs.filter((job) => job.company_id === observation.job_id.split(":")[0] || job.company_id === (observation as JobObservation & { company_id?: string }).company_id)
    .filter((job) => sameLocation(job.location, observation.location_raw) && similarRole(job, observation));
  const match = matches[0];
  if (match) return { job: match, status: "matched", reason: "company, location and role family align" };
  const companyMatches = jobs.filter((job) => (observation as JobObservation & { company_id?: string }).company_id === job.company_id);
  return { job: null, status: companyMatches.length > 0 ? "needs_review" : "new", reason: companyMatches.length > 0 ? "company matches but location or role differs" : "no compatible job entity" };
}

export function deriveJobStatus(observations: JobObservation[]): JobObservationStatus {
  if (observations.length === 0) return "NEW_JOB";
  const sorted = [...observations].sort((a, b) => new Date(a.observed_at).getTime() - new Date(b.observed_at).getTime());
  const latest = sorted[sorted.length - 1];
  const previous = sorted.slice(0, -1);
  if (latest?.is_open === false) return "CLOSED_JOB";
  if (latest?.is_open === true && previous.some((item) => item.is_open === false)) return "REOPENED_JOB";
  const hashes = sorted.filter((item) => item.content_hash).map((item) => item.content_hash as string);
  if (new Set(hashes).size < hashes.length) return "REPOSTED_JOB";
  return sorted.length > 1 ? "ONGOING_JOB" : "NEW_JOB";
}

function similarRole(job: Job, observation: JobObservation): boolean {
  const left = normalize(job.canonical_title);
  const right = normalize(observation.title_raw);
  return left === right || left.includes(right) || right.includes(left) || (job.role_family !== null && right.includes(normalize(job.role_family)));
}
function sameLocation(left: string | null, right: string | null): boolean {
  if (!left || !right) return left === right;
  return normalize(left) === normalize(right);
}
function normalize(value: string): string { return value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, ""); }
