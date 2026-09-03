export type EvidenceSourceType = "official" | "regulator" | "reliable_media" | "search" | "social" | "other";

export interface RawEvidence {
  evidence_id: string;
  source_url: string;
  source_name: string;
  source_type: EvidenceSourceType;
  title: string;
  excerpt: string;
  published_at: string | null;
  observed_at: string;
  content_hash: string | null;
  /** Optional publisher grouping used to collapse syndicated repost chains. */
  source_group?: string;
  immutable: true;
  /** Stable aliases used by the V1.1 display contract. */
  raw_title?: string;
  raw_excerpt?: string;
  first_seen_at?: string;
  fetched_at?: string;
}

export interface HumanEvidenceOverride {
  corrected_summary?: string;
  corrected_event_date?: string;
  corrected_category?: string;
  fact_assessment?: string;
  note?: string;
  edited_at: string;
}

export interface EvidenceRecord extends RawEvidence {
  human_override: HumanEvidenceOverride | null;
}

export function isEvidenceSourceType(value: string): value is EvidenceSourceType {
  return ["official", "regulator", "reliable_media", "search", "social", "other"].includes(value);
}
