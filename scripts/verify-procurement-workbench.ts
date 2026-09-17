import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Hono } from "hono";
import { assessProcurement } from "../src/opportunity-v2/procurement-workbench";
import { buildProcurementChangeEvents } from "../src/opportunity-v2/procurement-change-feed";
import { createProcurementFollowupStore } from "../src/opportunity-v2/procurement-followup-store";
import { renderProcurementCsv } from "../src/opportunity-v2/procurement-export";
import { procurementWorkbenchRoutes } from "../src/api/routes/procurement-workbench";
import { procurementWorkbenchPageRoutes } from "../src/api/routes/procurement-workbench-pages";
import type { OpportunityV2, OpportunityV2Source } from "../src/opportunity-v2/types";

const now = new Date("2026-09-15T00:00:00.000Z");
const source: OpportunityV2Source = {
  id: "proc-cn-ccgp", name: "中国政府采购网", url: "https://www.ccgp.gov.cn/", region: "CN", priority: "P0",
  types: ["procurement"], radars: ["ich"], enabled: true, status: "ACTIVE", last_fetch_at: null,
};

function opportunity(overrides: Partial<OpportunityV2> = {}): OpportunityV2 {
  return {
    id: "opp-proc-1", title: "非遗文创礼赠设计采购项目", summary: "公开采购非遗文创礼品及包装设计", source_id: source.id,
    source_item_id: "notice-1", source_name: source.name, source_url: source.url, detail_url: "https://example.com/notice-1",
    category: "procurement_project", region: "CN", tags: ["文创产品", "礼赠"], deadline: "2026-10-01", deadline_text: "投标截止 2026-10-01",
    status: "CURRENT", first_seen_at: "2026-09-01T00:00:00.000Z", last_seen_at: "2026-09-15T00:00:00.000Z", discovered_by_sources: [source.id], radar_relevance: "RELEVANT",
    procurement: { direction: "buyer_demand", stage: "open", notice_type: "tender", project_id: "notice-1", buyer_name: "文化馆", milestones: [{ kind: "submission", date: "2026-10-01" }] },
    ...overrides,
  };
}

const profile = { profile_id: "fixture-profile", approved_domain_tags: ["文创产品", "非遗活动", "礼赠"],
  geo_preferences: { onsite_first: ["广州"], goods_shipping_preferred: ["CN"] },
  qualification_facts: { default_eligibility: "NEEDS_REVIEW" as const, verified_licenses: [] }, hard_negative_domains: ["普通IT"] };

async function main(): Promise<void> {
const assessed = assessProcurement(opportunity(), profile, { now });
assert.equal(assessed.lane, "current");
assert.equal(assessed.eligibility_status, "NEEDS_REVIEW");
assert.ok(assessed.fit_score !== null && assessed.fit_score >= 0 && assessed.fit_score <= 100);
assert.ok(assessed.next_action.length > 0);
assert.ok(assessed.evidence.length > 0);

const expired = opportunity({ id: "opp-expired", deadline: "2026-08-01", status: "EXPIRED" });
assert.equal(assessProcurement(expired, profile, { now }).lane, "research");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "chanceping-workbench-test-"));
const followups = createProcurementFollowupStore(path.join(tempDir, "followups.json"));
await followups.upsert({ owner_id: "owner-a", opportunity_id: "opp-proc-1", status: "reviewing", note: "联系采购人确认样品", next_followup_at: "2026-09-20" });
assert.equal((await followups.get("owner-a", "opp-proc-1"))?.note, "联系采购人确认样品");
assert.equal(await followups.get("owner-b", "opp-proc-1"), null);

const before = opportunity({ deadline: "2026-09-30", procurement: { ...opportunity().procurement!, budget_amount: 10000, budget_currency: "CNY" } });
const after = opportunity({ deadline: "2026-10-01", procurement: { ...opportunity().procurement!, budget_amount: 12000, budget_currency: "CNY" } });
const events = buildProcurementChangeEvents([before], [after], now.toISOString());
assert.deepEqual(new Set(events.map((event) => event.event_type)), new Set(["deadline_changed", "budget_changed"]));
assert.equal(buildProcurementChangeEvents([after], [after], now.toISOString()).length, 0);

const csv = renderProcurementCsv([assessed]);
assert.ok(csv.includes("\"'=-1+1\"") === false);
assert.ok(csv.includes("非遗文创礼赠设计采购项目"));
const malicious = renderProcurementCsv([{ ...assessed, opportunity: opportunity({ title: "=HYPERLINK(\"https://evil.example\",\"click\")" }) }]);
assert.ok(malicious.includes("'=HYPERLINK"));

const route = new Hono();
route.route("/workbench", procurementWorkbenchRoutes({ opportunities: [opportunity()], sources: [source], profile, changeFeedPath: path.join(tempDir, "change-feed.json") }));
const publicResponse = await route.request("http://localhost/workbench/opportunities");
assert.equal(publicResponse.status, 200);
const publicBody = await publicResponse.json() as { opportunities: Array<Record<string, unknown>> };
assert.equal(publicBody.opportunities.length, 1);
assert.equal(publicBody.opportunities[0].private_followup, undefined);
const privateResponse = await route.request("http://localhost/workbench/followups/opp-proc-1");
assert.equal(privateResponse.status, 401);
const page = new Hono();
page.route("/ich", procurementWorkbenchPageRoutes({ opportunities: [opportunity()], sources: [source], profile }));
const pageResponse = await page.request("http://localhost/ich/procurement");
assert.equal(pageResponse.status, 200);
assert.match(await pageResponse.text(), /采购机会工作台/u);
const detailResponse = await page.request("http://localhost/ich/procurement/opp-proc-1");
assert.equal(detailResponse.status, 200);
assert.match(await detailResponse.text(), /保存私有跟进/u);
const changesResponse = await route.request("http://localhost/workbench/changes");
assert.equal(changesResponse.status, 200);
assert.deepEqual(((await changesResponse.json()) as { events: unknown[] }).events, []);
const changesPageResponse = await page.request("http://localhost/ich/procurement/changes");
assert.equal(changesPageResponse.status, 200);
assert.match(await changesPageResponse.text(), /采购机会变更摘要/u);

fs.rmSync(tempDir, { recursive: true, force: true });
console.log("PROCUREMENT_WORKBENCH: PASS");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
