import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Company } from "../src/headhunter/model/company";
import { enrichCompany } from "../src/headhunter/company/company-enrichment";
import { resolveCompany, type CompanyCandidate } from "../src/headhunter/company/company-resolver";

const now = "2026-09-02T00:00:00Z";
const company = (overrides: Partial<Company>): Company => ({ company_id: "c-1", canonical_name: "Kingfa Guangzhou", name_cn: "金发科技广州", name_en: "Kingfa Guangzhou", aliases: ["Kingfa"], industry: "manufacturing", sub_industry: null, country: "China", region: "Guangdong", city: "Guangzhou", company_type: "operating", website: "https://kingfa.com", linkedin_company_url: "https://linkedin.com/company/kingfa", official_domains: ["kingfa.com"], target_segment: "gba_company", parent_company_id: null, entity_scope: "operating_entity", created_at: now, updated_at: now, last_verified_at: now, status: "active", ...overrides });
const base = company({});

const usa = resolveCompany({ input_name: "Kingfa USA", country: "United States", region: "Michigan", industry: "manufacturing" }, [base]);
assert.equal(usa.status, "NEW_COMPANY");
const usaSameName = resolveCompany({ input_name: "Kingfa Guangzhou", country: "United States", region: "Michigan" }, [base]);
assert.equal(usaSameName.status, "CONFLICT");
const alias = resolveCompany({ input_name: "Kingfa", region: "Guangdong" }, [base]);
assert.equal(alias.status, "MATCHED");
const domainMatch = resolveCompany({ input_name: "Unknown local name", website: "https://kingfa.com", region: "Guangdong" }, [base]);
assert.equal(domainMatch.status, "MATCHED");
const c = resolveCompany({ input_name: "CICC Hong Kong", region: "Hong Kong" }, [company({ company_id: "cicc-bj", canonical_name: "CICC Beijing", region: "Beijing", city: "Beijing", website: "https://cicc.com" })]);
assert.notEqual(c.status, "MATCHED");

async function main(): Promise<void> {
  const dataDir = await mkdtemp(join(tmpdir(), "chanceping-headhunter-company-"));
  try {
    let calls = 0;
    const provider = { provider: "official_website" as const, async getCompanyProfile(): Promise<{ raw: unknown; canonical_name: string }> { calls += 1; return { canonical_name: "Kingfa Guangzhou", raw: { ok: true } }; } };
    const first = await enrichCompany(base, provider, { dataDir, now: new Date(now) });
    assert.equal(first.status, "enriched");
    assert.equal(calls, 1);
    const second = await enrichCompany(base, provider, { dataDir, now: new Date("2026-09-03T00:00:00Z") });
    assert.equal(second.status, "cached");
    assert.equal(calls, 1);
    const expired = await enrichCompany(base, provider, { dataDir, now: new Date("2026-11-02T00:00:01Z") });
    assert.equal(expired.status, "enriched");
    assert.equal(calls, 2);
    const failed = await enrichCompany(base, { provider: "search_index", async getCompanyProfile(): Promise<never> { throw new Error("provider unavailable"); } }, { dataDir, now: new Date("2027-01-02T00:00:00Z") });
    assert.equal(failed.status, "unavailable");
    assert.equal(failed.cost, null);
    console.log("headhunter company resolver/enrichment verification: PASS");
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
}
void main();
