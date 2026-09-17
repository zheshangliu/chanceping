import assert from "node:assert/strict";
import {
  assessOpportunityCoverage,
  isCreativeCompetitionOrSolicitation,
} from "../src/opportunity-v2/opportunity-coverage";
import {
  getOpportunitySourceProfile,
  parseOpportunitySourceProfile,
  validateOpportunitySourceProfile,
} from "../src/opportunity-v2/source-onboarding";
import type { OpportunityV2 } from "../src/opportunity-v2/types";

const NOW = new Date("2026-09-17T00:00:00.000Z");

function item(overrides: Partial<OpportunityV2>): OpportunityV2 {
  return {
    id: "fixture-v12",
    title: "Fixture opportunity",
    summary: "Open application for craft makers.",
    source_id: "fixture-source",
    source_name: "Fixture Source",
    source_url: "https://example.com/listing",
    detail_url: "https://example.com/opportunity/fixture",
    category: "exhibition_market",
    region: "GLOBAL",
    tags: ["craft"],
    deadline: "2026-12-01",
    deadline_text: "Deadline: 1 December 2026",
    status: "CURRENT",
    first_seen_at: NOW.toISOString(),
    last_seen_at: NOW.toISOString(),
    discovered_by_sources: ["fixture-source"],
    radar_relevance: "RELEVANT",
    ...overrides,
  };
}

function run(): void {
  const designSolicitation = item({
    title: "城市礼物 LOGO 设计征集",
    summary: "公开征集品牌 LOGO 设计方案，设一等奖并由专家评审。",
  });
  assert.equal(isCreativeCompetitionOrSolicitation(designSolicitation), true);
  const designAssessment = assessOpportunityCoverage(designSolicitation, { now: NOW });
  assert.deepEqual(designAssessment.view_types, []);

  const vendor = item({
    title: "Museum shop vendor application",
    summary: "博物馆商店招募文创供货品牌，申请摊位并提交产品目录。",
  });
  assert.ok(assessOpportunityCoverage(vendor, { now: NOW }).view_types.includes("market_channel"));

  const profile = getOpportunitySourceProfile("on-the-move-open-calls");
  assert.ok(profile);
  assert.deepEqual(validateOpportunitySourceProfile(profile!), []);
  const htmlItems = parseOpportunitySourceProfile(profile!, `<!doctype html><a href="/news/camargo-fellowship">Camargo Fellowship — applications deadline 30 September 2026</a>`, profile!.listing_url);
  assert.equal(htmlItems.length, 1);
  assert.match(htmlItems[0].title, /Camargo Fellowship/u);

  const rssProfile = { ...profile!, id: "fixture-rss", transport: "RSS" as const, listing_url: "https://example.com/feed.xml" };
  const rssItems = parseOpportunitySourceProfile(rssProfile, `<rss><channel><item><title>Craft residency call</title><link>https://example.com/residency</link><description>Apply by 30 September 2026</description></item></channel></rss>`);
  assert.equal(rssItems.length, 1);
  assert.equal(rssItems[0].detail_url, "https://example.com/residency");

  const jsonProfile = { ...profile!, id: "fixture-json", transport: "JSON" as const, listing_url: "https://example.com/api" };
  const jsonItems = parseOpportunitySourceProfile(jsonProfile, JSON.stringify([{ title: "Craft grant", url: "https://example.com/grant", description: "Apply for funding by 2026-10-01" }]));
  assert.equal(jsonItems.length, 1);
  assert.equal(jsonItems[0].detail_url, "https://example.com/grant");

  console.log("opportunity v1.2 classifier/onboarding fixtures: PASS (6 checks)");
}

run();
