import assert from "node:assert/strict";
import { extractOfficialContacts } from "../src/headhunter/pipeline/official-contact-extractor";
import { discoverContactEntries } from "../src/headhunter/contacts/contact-resolver";
import { ContactSearchBudget } from "../src/headhunter/contacts/contact-search-budget";

const hkib = extractOfficialContacts({
  company: { website: "https://www.hkib.org", official_domains: ["www.hkib.org"] },
  source_url: "https://www.hkib.org/careers",
  title: "Careers and Recruitment",
  snippet: "For recruitment enquiries please email recruit@hkib.org or visit our careers page.",
});
assert.equal(hkib.first_party, true);
assert.equal(hkib.entries.some((entry) => entry.value === "recruit@hkib.org" && entry.contact_role === "recruitment"), true);
console.log("PASS HKIB recruit@hkib.org: recruitment contact");

const gba = extractOfficialContacts({
  company: { website: "https://www.gba-group-pharma.com", official_domains: [] },
  source_url: "https://www.gba-group-pharma.com/en/contact",
  title: "Business Development Contact",
  inline_content: "For business development and partnerships, contact group@gba-pharma.com.",
});
assert.equal(gba.entries.some((entry) => entry.value === "group@gba-pharma.com" && entry.contact_role === "business"), true);
console.log("PASS GBA Pharma group@gba-pharma.com: business contact");

const guarded = extractOfficialContacts({
  source_url: "https://example.com/contact",
  title: "Contact",
  snippet: "privacy@example.com webmaster@example.com support@example.com media@example.com info@example.com",
});
assert.equal(guarded.entries.some((entry) => entry.value === "info@example.com"), true);
assert.equal(guarded.entries.some((entry) => /^(privacy|webmaster|support|media)@/i.test(entry.value)), false);
assert.equal(guarded.rejected.length >= 4, true);
console.log("PASS precision mailbox guard: privacy/webmaster/support/media rejected");

const budget = new ContactSearchBudget({ serper: 1, exa: 0, official_site: 1 });
const persisted = discoverContactEntries({ company_id: "hkib", provider: "official_site", entries: hkib.entries }, budget);
assert.equal(persisted.some((entry) => entry.kind === "corporate_email" && entry.value === "recruit@hkib.org"), true);
assert.equal(persisted.length > 0, true);
assert.equal(budget.consume("official_site"), false);
console.log("PASS bounded official contact budget");
console.log("headhunter V1.2.1 official contact verification: PASS");
