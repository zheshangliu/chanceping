import assert from "node:assert/strict";
import { resolvePersonCandidate } from "../src/headhunter/contacts/person-resolver";
import { discoverContactEntries } from "../src/headhunter/contacts/contact-resolver";
import { ContactSearchBudget } from "../src/headhunter/contacts/contact-search-budget";
import { evaluateContactGate } from "../src/headhunter/contacts/contact-gate";

assert.equal(evaluateContactGate({ person: null, entries: [{ type: "corporate_email", public_verified: true }] }).passed, true);
const person = resolvePersonCandidate({ name: "Alex Chen", current_company_id: "c1", current_title: "HRD" }, "c1");
assert.equal(person.employment_status, "verified_current");
assert.equal(evaluateContactGate({ person, entries: [] }).passed, false);
assert.equal(evaluateContactGate({ person: null, entries: [{ type: "website", public_verified: true }] }).passed, false);

const budget = new ContactSearchBudget();
for (let index = 0; index < 3; index += 1) assert.equal(budget.consume("serper"), true);
assert.equal(budget.consume("serper"), false);
assert.equal(budget.consume("exa"), true);
const contacts = discoverContactEntries({ company_id: "c1", person, provider: "official_site", entries: [
  { type: "corporate_email", value: "hr@example.com", source_url: "https://example.com/careers", public_verified: true },
  { type: "linkedin_profile", value: "https://linkedin.com/in/alex", source_url: "https://linkedin.com/in/alex", public_verified: true },
  { type: "other", value: "private WeChat: abc", source_url: "https://example.com", public_verified: true },
] }, budget);
assert.equal(contacts.length, 2);
console.log("headhunter people and contact gate verification: PASS");
