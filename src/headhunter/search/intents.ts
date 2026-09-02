export type SearchIntentType = "DISCOVER_COMPANY" | "VERIFY_TRIGGER" | "DISCOVER_JOBS" | "DISCOVER_PERSON" | "DISCOVER_CONTACT" | "VERIFY_EVIDENCE";
export type SearchScope = "mainland" | "hk_global" | "people";

export interface HeadhunterSearchIntent {
  intent_type: SearchIntentType;
  scope: SearchScope;
  query: string;
  evidence_gate_passed?: boolean;
  serper_found_relevant_people?: boolean;
  relationship_confidence?: number;
  lead_value?: "normal" | "high";
  has_public_contact?: boolean;
  manual_contact_request?: boolean;
}
