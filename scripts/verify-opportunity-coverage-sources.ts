import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseCnafGuidesListing, parseEenPartneringListing } from "../src/ich/aggregation/adapters/coverage-sources";
import { getAggregationAdapter } from "../src/ich/aggregation/adapters";
import { assessOpportunityCoverage } from "../src/opportunity-v2/opportunity-coverage";
import { readOpportunityV2Pool } from "../src/opportunity-v2/opportunity-pool";
import { runOpportunityV2 } from "../src/opportunity-v2/pipeline";
import type { OpportunityV2Source } from "../src/opportunity-v2/types";

const cnaf = `<div class="item"><div class="text"><div class="t1"><a href="/guide_detail/5546.html">国家艺术基金（一般项目）2027年度美术创作资助项目申报指南</a></div><div class="t2">面向社会受理美术创作资助项目申报。</div><div class="t3">2026.03.24</div></div></div>`;
const een = `<article class="ecl-card"><div class="ecl-content-block"><ul><li class="ecl-content-block__primary-meta-item">Business Request</li><li class="ecl-content-block__primary-meta-item">BRGR20260914016</li></ul><div class="ecl-content-block__title"><a href="/partnering-opportunities/cultural-design-request"><span>A cultural design studio is looking for craft collaboration partners</span></a></div><div class="ecl-content-block__description"><div><p>A studio seeks partners for cultural product collaboration and distribution.</p></div></div></div></article>`;

const cnafItems = parseCnafGuidesListing(cnaf, "https://www.cnaf.cn/guide.html");
assert.equal(cnafItems.length, 1);
assert.equal(cnafItems[0].source_category, "grant_funding");
assert.match(cnafItems[0].detail_url, /guide_detail\/5546\.html/u);
assert.deepEqual(assessOpportunityCoverage({
  id: "cnaf-fixture", title: cnafItems[0].title, summary: "面向社会受理美术创作资助项目申报。", source_id: "cnaf-guides", source_name: "国家艺术基金申报指南", source_url: cnafItems[0].source_url, detail_url: cnafItems[0].detail_url, category: "policy_funding", region: "CN", tags: [], deadline: null, status: "UNKNOWN_DEADLINE", first_seen_at: "2026-09-15T00:00:00.000Z", last_seen_at: "2026-09-15T00:00:00.000Z", discovered_by_sources: ["cnaf-guides"], radar_relevance: "UNCERTAIN",
}, { now: new Date("2026-09-15T00:00:00.000Z") }).view_types, ["grant_funding"]);

const eenItems = parseEenPartneringListing(een, "https://een.ec.europa.eu/partnering-opportunities");
assert.equal(eenItems.length, 1);
assert.equal(eenItems[0].source_item_id, "BRGR20260914016");
assert.match(eenItems[0].raw_text, /cultural design/u);
assert.deepEqual(assessOpportunityCoverage({
  id: "een-fixture", title: eenItems[0].title, summary: eenItems[0].raw_text, source_id: "een-partnering", source_name: "EEN合作机会", source_url: eenItems[0].source_url, detail_url: eenItems[0].detail_url, category: "channel_collaboration", region: "GLOBAL", tags: [], deadline: null, status: "UNKNOWN_DEADLINE", first_seen_at: "2026-09-15T00:00:00.000Z", last_seen_at: "2026-09-15T00:00:00.000Z", discovered_by_sources: ["een-partnering"], radar_relevance: "UNCERTAIN",
}, { now: new Date("2026-09-15T00:00:00.000Z") }).view_types, ["partnership_commission"]);

assert.equal(getAggregationAdapter("cnaf-guides").adapter_id, "cnaf-guides-v1");
assert.equal(getAggregationAdapter("een-partnering").adapter_id, "een-partnering-v1");
assert.equal(getAggregationAdapter("cnaf-guides").parseListing(cnaf, "https://www.cnaf.cn/guide.html").length, 1);
assert.equal(getAggregationAdapter("een-partnering").parseListing(een, "https://een.ec.europa.eu/partnering-opportunities").length, 1);

async function main(): Promise<void> {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "chanceping-opportunity-coverage-"));
  try {
    const sourcesPath = path.join(fixtureDir, "sources.json");
    const poolPath = path.join(fixtureDir, "opportunities.json");
    const healthPath = path.join(fixtureDir, "source-health.json");
    const changeFeedPath = path.join(fixtureDir, "procurement-change-feed.json");
    const pipelineSource: OpportunityV2Source = {
      id: "cnaf-guides",
      name: "国家艺术基金申报指南",
      url: "https://www.cnaf.cn/guide.html",
      region: "CN",
      priority: "P0",
      types: ["grant", "funding", "official_listing"],
      radars: ["ich"],
      enabled: true,
      status: "ACTIVE",
      last_fetch_at: null,
    };
    fs.writeFileSync(sourcesPath, JSON.stringify({ schema_version: "chanceping-opportunity-v2.sources.v1", sources: [pipelineSource] }));
    const fixtureFetcher = async (url: string) => ({
      status: 200,
      final_url: url,
      text: cnaf,
    });
    const run = await runOpportunityV2({
      now: new Date("2026-09-15T00:00:00.000Z"),
      sourcesPath,
      poolPath,
      healthPath,
      changeFeedPath,
      fetcher: fixtureFetcher,
    });
    assert.equal(run.fetched_sources, 1);
    assert.equal(run.successful_sources, 1);
    assert.ok(run.raw_items > 0);
    assert.equal(run.sources[0]?.status, "ACTIVE");
    assert.ok(readOpportunityV2Pool(poolPath).opportunities.length > 0);
  } finally {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  }

  console.log("OPPORTUNITY_COVERAGE_SOURCES: PASS");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
