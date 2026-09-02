import type { ContactEntry } from "../model/contact";
import { isContactGateEligible } from "../model/contact";
import type { Person } from "../model/person";

export interface ContactGateInput {
  person: Person | null;
  entries: Array<ContactEntry | { type: string; public_verified: boolean; professional?: boolean }>;
}

export interface ContactGateResult {
  passed: boolean;
  reason: string;
}

export function evaluateContactGate(input: ContactGateInput): ContactGateResult {
  const eligible = input.entries.some((entry) => isEligible(entry));
  if (eligible) return { passed: true, reason: "public verified professional contact entry" };
  if (input.person?.employment_status === "verified_current") return { passed: false, reason: "verified person has no public contact entry" };
  return { passed: false, reason: "no public verified professional contact entry" };
}

function isEligible(entry: ContactEntry | { type: string; public_verified: boolean; professional?: boolean }): boolean {
  if ("kind" in entry) return isContactGateEligible(entry);
  return entry.public_verified && entry.professional !== false && ["corporate_email", "corporate_phone", "company_contact_form", "careers_entry", "email", "phone", "contact_form", "careers_form"].includes(entry.type);
}
