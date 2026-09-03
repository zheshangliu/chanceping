import assert from "node:assert/strict";
import { evaluateEntityRelation } from "../src/headhunter/pipeline/entity-relation-filter";
import type { Company } from "../src/headhunter/model/company";

const company = (canonical_name: string, aliases: string[], region = "Hong Kong"): Company => ({
  company_id: canonical_name.toLowerCase().replace(/\W+/g, "-"), canonical_name, name_cn: null, name_en: canonical_name, aliases,
  industry: null, sub_industry: null, country: region === "Hong Kong" ? "Hong Kong" : "China", region, city: region,
  company_type: null, website: `https://${canonical_name.toLowerCase().replace(/\W+/g, "")}.example.com`, linkedin_company_url: null,
  official_domains: [], target_segment: "hk_finance", parent_company_id: null, entity_scope: "operating_entity",
  created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z", last_verified_at: "2026-09-01T00:00:00Z", status: "active",
});
const checkReject = (name: string, target_company: Company, candidate: Parameters<typeof evaluateEntityRelation>[0]["candidate"]): void => {
  const decision = evaluateEntityRelation({ target_company, candidate, candidate_type: "job" });
  assert.equal(decision.accepted, false, `${name}: accepted unexpectedly`);
  console.log(`PASS ${name}: rejected (${decision.reasons.join("; ")})`);
};

checkReject("HKEX is not HK Express", company("Hong Kong Exchanges and Clearing", ["HKEX"]), { employer_name: "HK Express", title: "HR Manager", location: "Hong Kong", url: "https://jobs.example/hkexpress" });
checkReject("HKEX title cannot substring-match HK Express", company("Hong Kong Exchanges and Clearing", ["HKEX"]), { title: "HK Express HR Manager", snippet: "HK Express hiring", location: "Hong Kong", url: "https://jobs.example/hkexpress" });
checkReject("Bank of Communications is not BOCHK", company("Bank of Communications", ["Bankcomm"]), { employer_name: "BOCHK", title: "Recruiter", location: "Hong Kong", url: "https://jobs.example/bochk" });
checkReject("HSBC China is not HSBC India", company("HSBC", ["HSBC Hong Kong"]), { employer_name: "HSBC India", title: "HR Director", location: "Mumbai, India", url: "https://jobs.example/hsbc-india" });
checkReject("Protiviti HK is not Protiviti India", company("Protiviti", []), { employer_name: "Protiviti", title: "Talent Acquisition", location: "Bengaluru, India", url: "https://jobs.example/protiviti-india" });

const accepted = evaluateEntityRelation({ target_company: company("Hong Kong Exchanges and Clearing", ["HKEX"]), candidate: { title: "Careers", snippet: "Hong Kong role", location: "Hong Kong", url: "https://hongkongexchangesandclearing.example.com/careers" }, candidate_type: "job" });
assert.equal(accepted.accepted, true);
console.log("PASS official domain + geography binding");
console.log("headhunter V1.2.1 entity relation verification: PASS");
