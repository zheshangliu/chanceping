import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHeadHunterApi } from "../src/headhunter/api/headhunter-api";
import { createHeadHunterApiContext } from "../src/headhunter/api/context";
import { createHeadHunterStores } from "../src/headhunter/stores";
import type { Company } from "../src/headhunter/model/company";
import type { OpportunityRecord } from "../src/headhunter/model/opportunity";
import { renderFinancePage } from "../src/headhunter/ui/finance-page";

async function main(): Promise<void> {
  const dataDir = await mkdtemp(join(tmpdir(), "chanceping-v14-"));
  const previous = process.env.FINANCE_PUBLIC_MODE;
  process.env.FINANCE_PUBLIC_MODE = "true";
  try {
    const stores = createHeadHunterStores(dataDir);
    const now = new Date().toISOString();
    const company: Company = { company_id: "v14-company", canonical_name: "V1.4 Verification Holdings", name_cn: null, name_en: "V1.4 Verification Holdings", aliases: [], industry: "finance", sub_industry: null, country: "Hong Kong", region: "Hong Kong", city: "Hong Kong", company_type: "group", website: "https://example.org", linkedin_company_url: null, official_domains: ["example.org"], target_segment: "hk_finance", parent_company_id: null, entity_scope: "legal_entity", created_at: now, updated_at: now, last_verified_at: now, status: "active" };
    await stores.companies.upsert(company);
    const opportunity: OpportunityRecord = { opportunity_id: "v14-opportunity", company_id: company.company_id, weekly_snapshot_id: null, signal_ids: ["signal-1"], primary_signal_id: "signal-1", signal_type: "hiring", title: "New regional hiring", why_now: "Recent verified hiring trigger", business_driver: "Regional expansion", talent_need: "TA leader", recommended_contact_id: null, next_action: "Review evidence", evidence_ids: ["evidence-1"], status: "verified", score: 82, contactable: false, human_review_status: "pending", created_at: now, updated_at: now };
    await stores.opportunities.upsert(opportunity);
    const context = createHeadHunterApiContext({ stores, authConfig: { username: "", password_hash: "", session_secret: "public" } });
    const token = context.sessions.create("test");
    const watch = (await import("../src/headhunter/api/watchlist-routes")).watchlistRoutes(context);
    const watchResponse = await watch.request("http://finance.chanceping.com/", { method: "POST", headers: { host: "finance.chanceping.com", cookie: `finance_session=${token}`, "content-type": "application/json" }, body: JSON.stringify({ company_id: company.company_id, priority: "high" }) });
    assert.equal(watchResponse.status, 201);
    const api = createHeadHunterApi({ context });
    const opportunities = await api.request("http://finance.chanceping.com/opportunities", { headers: { host: "finance.chanceping.com" } });
    assert.equal(opportunities.status, 200);
    assert.equal((await opportunities.json() as OpportunityRecord[]).length, 1);
    const status = await api.request("http://finance.chanceping.com/opportunities/v14-opportunity/status", { method: "PATCH", headers: { host: "finance.chanceping.com", cookie: `finance_session=${token}`, "content-type": "application/json" }, body: JSON.stringify({ status: "ready_to_contact" }) });
    assert.equal(status.status, 200);
    const html = renderFinancePage("/weekly");
    for (const marker of ["Pacific Executive Brief", "WEEKLY BRIEF", "本周应该联系谁？", "finance-signal-ribbon", "Opportunity", "Watchlist"]) assert.ok(html.includes(marker), marker);
    assert.ok(!html.includes("TikHub"));
    console.log("headhunter V1.4 verification: PASS");
  } finally {
    await rm(dataDir, { recursive: true, force: true });
    if (previous === undefined) delete process.env.FINANCE_PUBLIC_MODE; else process.env.FINANCE_PUBLIC_MODE = previous;
  }
}
void main();
