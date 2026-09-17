import assert from "node:assert/strict";
import { Hono } from "hono";
import {
  assessOpportunityCoverage,
  buildOpportunityCoverageAssessments,
  publicOpportunityCoverageAssessment,
  type OpportunityCoverageProfile,
} from "../src/opportunity-v2/opportunity-coverage";
import { procurementWorkbenchRoutes } from "../src/api/routes/procurement-workbench";
import { procurementWorkbenchPageRoutes } from "../src/api/routes/procurement-workbench-pages";
import type { OpportunityV2, OpportunityV2Source } from "../src/opportunity-v2/types";

const now = new Date("2026-09-15T00:00:00.000Z");
const source: OpportunityV2Source = {
  id: "fixture-coverage", name: "Coverage Fixture", url: "https://fixture.example/", region: "GLOBAL", priority: "P1",
  types: ["open_call", "grant", "residency", "market"], radars: ["ich"], enabled: true, status: "ACTIVE", last_fetch_at: null,
};

function opportunity(id: string, text: string, overrides: Partial<OpportunityV2> = {}): OpportunityV2 {
  return {
    id, title: text, summary: text, source_id: source.id, source_item_id: id, source_name: source.name,
    source_url: source.url, detail_url: `https://fixture.example/${id}`, category: "other", region: "GLOBAL", tags: [],
    deadline: "2030-10-01T23:59:00.000Z", deadline_text: "Applications close 1 October 2030",
    status: "CURRENT", first_seen_at: now.toISOString(), last_seen_at: now.toISOString(), discovered_by_sources: [source.id], radar_relevance: "UNCERTAIN",
    ...overrides,
  };
}

async function main(): Promise<void> {
  const exhibition = assessOpportunityCoverage(opportunity("cat01", "Open call for a botanical art exhibition", { summary: "Submit works for curatorial selection; no prize competition." }), { now });
  assert.deepEqual(exhibition.view_types, ["exhibition_showcase"]);
  assert.ok(!exhibition.view_types.includes("competition_award"));
  assert.equal(exhibition.lane, "current");

  const fundedResidency = assessOpportunityCoverage(opportunity("cat02", "Funded craft residency: applications for artists; a stipend and studio provided."), { now });
  assert.deepEqual(new Set(fundedResidency.view_types), new Set(["residency_learning", "grant_funding"]));
  assert.equal(fundedResidency.money_flow, "receive");

  const procurement = assessOpportunityCoverage(opportunity("cat03", "公开采购非遗培训活动承办服务，供应商提交报价。", { category: "procurement_project", procurement: { direction: "buyer_demand", stage: "open", notice_type: "tender", project_id: "p1", milestones: [] } }), { now });
  assert.deepEqual(procurement.view_types, ["procurement_order"]);
  assert.equal(procurement.lane, "current");
  assert.ok(!procurement.view_types.includes("residency_learning"));

  const trainee = assessOpportunityCoverage(opportunity("cat04", "招收非遗技艺研修学员，请学员提交个人申请。"), { now });
  assert.deepEqual(trainee.view_types, ["residency_learning"]);

  const vague = assessOpportunityCoverage(opportunity("cat05", "Annual cultural program announced. Details to follow; no funding or applications described."), { now });
  assert.deepEqual(vague.view_types, []);
  assert.equal(vague.lane, "review");

  const channel = assessOpportunityCoverage(opportunity("cat06", "公开征集城市礼物产品供评审遴选，请企业提交产品介绍和销售资料；未承诺订单。"), { now });
  assert.deepEqual(channel.view_types, ["market_channel"]);
  assert.equal(channel.guaranteed_order, false);

  const incubator = assessOpportunityCoverage(opportunity("cat07", "文化创业孵化器接受新申请，录取后提供导师与共享空间；可能收取服务费。"), { now });
  assert.deepEqual(incubator.view_types, ["recognition_incubation"]);
  assert.equal(incubator.money_flow, "pay");
  assert.equal(incubator.fees.length, 1);

  const museumChannel = assessOpportunityCoverage(opportunity("dir02", "Museum retail operator seeks independent craft brands to supply botanical gifts."), { now, profile: { applicant_type: "company" } });
  assert.deepEqual(museumChannel.view_types, ["market_channel"]);
  assert.equal(museumChannel.eligibility_status, "NEEDS_REVIEW");

  const mixedInKind = assessOpportunityCoverage(opportunity("money03", "提供免费工作室，住宿与交通自理，不发放现金津贴。"), { now });
  assert.equal(mixedInKind.money_flow, "mixed");

  const equityIncubator = assessOpportunityCoverage(opportunity("money04", "录取企业有机会获得股权投资，需另签投资协议。"), { now });
  assert.deepEqual(equityIncubator.view_types, ["recognition_incubation"]);
  assert.equal(equityIncubator.money_flow, "receive");

  const result = assessOpportunityCoverage(opportunity("cat08", "非遗工坊拟认定名单公示，异议截止2030年10月10日。"), { now });
  assert.deepEqual(result.view_types, []);
  assert.equal(result.lane, "research");
  assert.equal(result.deadline, null);

  const seller = assessOpportunityCoverage(opportunity("dir01", "We manufacture handmade jewellery and seek distributors to sell our brand."), { now });
  assert.equal(seller.buyer_demand, false);
  assert.equal(seller.our_role, "potential_distributor_not_supplier");
  assert.deepEqual(seller.view_types, []);
  assert.equal(seller.lane, "research");

  const commission = assessOpportunityCoverage(opportunity("dir04", "公开征集艺术家共创社区壁画，入选艺术家获得酬劳，具体合同待协商。"), { now });
  assert.deepEqual(commission.view_types, ["partnership_commission"]);
  assert.equal(commission.money_flow, "receive");
  assert.equal(commission.guaranteed_contract, false);

  const eligibilityProfile: OpportunityCoverageProfile = { residency: "CN", applicant_type: "company" };
  assert.equal(assessOpportunityCoverage(opportunity("elig01", "Only artists resident in Scotland may apply."), { now, profile: eligibilityProfile }).eligibility_status, "INELIGIBLE");
  assert.equal(assessOpportunityCoverage(opportunity("elig03", "Women-founded cultural businesses may apply; ownership and registration years must meet the guide."), { now, profile: { verified_ownership: null } }).eligibility_status, "NEEDS_REVIEW");

  const rolling = assessOpportunityCoverage(opportunity("time05", "Applications are accepted on a rolling basis until further notice.", { deadline: null, deadline_text: null }), { now });
  assert.equal(rolling.rolling, true);
  assert.equal(rolling.lane, "current");
  assert.equal(rolling.deadline, null);

  const assessments = buildOpportunityCoverageAssessments([exhibition, fundedResidency].map((item) => item.opportunity), { now });
  assert.equal(new Set(assessments.map((item) => item.opportunity_id)).size, 2);
  const competitionLike = opportunity("cat09", "2026 craft competition open call", { category: "exhibition_market" });
  assert.equal(buildOpportunityCoverageAssessments([competitionLike], { now }).length, 0);
  const publicAssessment = publicOpportunityCoverageAssessment(fundedResidency);
  assert.equal(publicAssessment.opportunity.deadline, "2030-10-01T23:59:00.000Z");
  assert.equal((publicAssessment as Record<string, unknown>).private_followup, undefined);

  const route = new Hono();
  route.route("/workbench", procurementWorkbenchRoutes({ opportunities: [exhibition.opportunity, fundedResidency.opportunity], sources: [source] }));
  const response = await route.request("http://localhost/workbench/coverage?view_type=grant_funding");
  assert.equal(response.status, 200);
  const body = await response.json() as { total: number; opportunities: Array<{ view_types: string[] }> };
  assert.equal(body.total, 1);
  assert.ok(body.opportunities[0].view_types.includes("grant_funding"));

  const page = new Hono();
  page.route("/ich", procurementWorkbenchPageRoutes({ opportunities: [exhibition.opportunity], sources: [source] }));
  page.get("/ich/opportunities/:id", (c) => c.text(`legacy:${c.req.param("id")}`));
  const pageResponse = await page.request("http://localhost/ich/opportunities");
  assert.equal(pageResponse.status, 200);
  assert.match(await pageResponse.text(), /综合机会工作台/u);
  const legacyResponse = await page.request("http://localhost/ich/opportunities/legacy-competition");
  assert.equal(legacyResponse.status, 200);
  assert.equal(await legacyResponse.text(), "legacy:legacy-competition");
  console.log("OPPORTUNITY_COVERAGE: PASS");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
