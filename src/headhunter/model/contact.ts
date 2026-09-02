export type ContactKind = "email" | "phone" | "corporate_email" | "corporate_phone" | "contact_form" | "company_contact_form" | "careers_form" | "careers_entry" | "official_website" | "website" | "linkedin_profile" | "other";

export interface ContactEntry {
  contact_id: string;
  company_id: string;
  person_id: string | null;
  kind: ContactKind;
  value: string;
  label: string | null;
  source_url: string;
  public_verified: boolean;
  professional: boolean;
  verified_at: string | null;
  notes: string | null;
}

export function isContactKind(value: string): value is ContactKind {
  return ["email", "phone", "corporate_email", "corporate_phone", "contact_form", "company_contact_form", "careers_form", "careers_entry", "official_website", "website", "linkedin_profile", "other"].includes(value);
}

export function isContactGateEligible(entry: ContactEntry): boolean {
  return entry.public_verified && entry.professional && ["email", "phone", "corporate_email", "corporate_phone", "contact_form", "company_contact_form", "careers_form", "careers_entry"].includes(entry.kind);
}
