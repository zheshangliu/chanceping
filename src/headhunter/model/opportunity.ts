export type OpportunityWorkflowStatus = "discovered" | "verified" | "ready_to_contact" | "contacted" | "in_follow_up" | "completed" | "archived";
export type OpportunitySignalType = "hiring" | "expansion" | "leadership" | "investment" | "regulatory";

/** V1.4 decision object. A Signal is evidence; an Opportunity is the reviewed business unit. */
export interface OpportunityRecord {
  opportunity_id: string;
  company_id: string;
  weekly_snapshot_id: string | null;
  signal_ids: string[];
  primary_signal_id: string | null;
  signal_type: OpportunitySignalType;
  title: string;
  why_now: string;
  business_driver: string;
  talent_need: string;
  recommended_contact_id: string | null;
  next_action: string;
  evidence_ids: string[];
  status: OpportunityWorkflowStatus;
  score: number;
  contactable: boolean;
  human_review_status: "pending" | "approved" | "rejected";
  follow_up_notes?: Array<{ text: string; created_at: string }>;
  created_at: string;
  updated_at: string;
}

export function isOpportunityWorkflowStatus(value: string): value is OpportunityWorkflowStatus {
  return ["discovered", "verified", "ready_to_contact", "contacted", "in_follow_up", "completed", "archived"].includes(value);
}
