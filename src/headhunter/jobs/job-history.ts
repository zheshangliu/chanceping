import type { JobObservation, JobObservationStatus } from "../model/job";
import { deriveJobStatus } from "./job-resolver";

export interface JobHistorySummary {
  status: JobObservationStatus;
  open_days: number;
  observation_count: number;
  distinct_open_jobs_7d: number;
}

export function summarizeJobHistory(observations: JobObservation[], now = new Date()): JobHistorySummary {
  const status = deriveJobStatus(observations);
  const firstOpen = observations.filter((item) => item.is_open !== false).map((item) => new Date(item.observed_at).getTime()).sort((a, b) => a - b)[0];
  const openDays = firstOpen === undefined ? 0 : Math.max(0, Math.floor((now.getTime() - firstOpen) / 86400000));
  const recentCutoff = now.getTime() - 7 * 86400000;
  const distinctOpenJobs = new Set(observations.filter((item) => item.is_open !== false && new Date(item.observed_at).getTime() >= recentCutoff).map((item) => item.job_id)).size;
  return { status, open_days: openDays, observation_count: observations.length, distinct_open_jobs_7d: distinctOpenJobs };
}
