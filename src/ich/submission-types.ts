export const ICH_SUBMISSION_SCHEMA_VERSION = "1.0" as const;

export const ICH_SUBMISSION_STATUSES = [
  "pending",
  "accepted",
  "rejected",
  "duplicate",
  "spam",
] as const;

export type IchSourceSubmissionStatus = typeof ICH_SUBMISSION_STATUSES[number];

export interface IchSourceSubmission {
  id: string;
  source_url: string;
  title_hint: string | null;
  note: string | null;
  contact_email: string | null;
  status: IchSourceSubmissionStatus;
  normalized_url_hash: string;
  created_at: string;
  updated_at: string;
  reviewed_at: string | null;
  reviewer: string | null;
  review_reason: string | null;
  opportunity_id: string | null;
  request_fingerprint: string;
}

export interface IchSourceSubmissionFile {
  schema_version: typeof ICH_SUBMISSION_SCHEMA_VERSION;
  updated_at: string;
  entries: IchSourceSubmission[];
}

export interface IchSubmissionAcceptTransaction {
  schema_version: "1.0";
  submission_id: string;
  opportunity_slug: string;
  started_at: string;
}
