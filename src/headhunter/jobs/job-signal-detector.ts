import type { Job, JobObservation } from "../model/job";
import { summarizeJobHistory } from "./job-history";

export type HiringSignal = "NEW_JOB" | "ONGOING_JOB" | "REPOSTED_JOB" | "CLOSED_JOB" | "REOPENED_JOB" | "HIRING_EXPANSION" | "ONGOING_HARD_TO_FILL" | "REPEATED_HIRING";

export function detectHiringSignals(job: Job, observations: JobObservation[], now = new Date()): HiringSignal[] {
  const summary = summarizeJobHistory(observations, now);
  const signals = new Set<HiringSignal>([summary.status]);
  if (summary.distinct_open_jobs_7d >= 3) signals.add("HIRING_EXPANSION");
  if (summary.open_days >= 30 && observations.some((item) => item.is_open === true && new Date(item.observed_at).getTime() >= now.getTime() - 7 * 86400000)) signals.add("ONGOING_HARD_TO_FILL");
  const hashes = observations.filter((item) => item.content_hash).map((item) => item.content_hash as string);
  if (new Set(hashes).size < hashes.length || observations.filter((item) => item.title_raw === job.canonical_title).length > 1) signals.add("REPEATED_HIRING");
  return [...signals];
}
