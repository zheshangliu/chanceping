import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createApp } from "../src/api/app";
import { opportunityV2NextRunAt, opportunityV2ShouldRun, readOpportunityV2Pool, readOpportunityV2Sources, runOpportunityV2, validateOpportunityV2Sources } from "../src/opportunity-v2";

async function main(): Promise<void> {
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "chanceping-opportunity-v2-"));
const sourcesPath = path.join(temp, "sources.json");
const poolPath = path.join(temp, "opportunities.json");
const healthPath = path.join(temp, "source-health.json");
fs.copyFileSync(path.resolve("data/opportunity-v2/sources.json"), sourcesPath);
fs.writeFileSync(poolPath, JSON.stringify({ schema_version: "chanceping-opportunity-v2.v1", updated_at: new Date(0).toISOString(), opportunities: [] }));

const fixtureBySource: Record<string, string> = {
  "https://www.shejijingsai.com/liebiao": `<table><tr><td>传统工艺</td><td><a href="https://www.shejijingsai.com/detail/heritage">非遗传统工艺文创设计征集</a></td><td>2027年3月3日</td></tr><tr><td>摄影</td><td><a href="https://www.shejijingsai.com/detail/photo">纯摄影比赛</a></td><td>2027年3月4日</td></tr></table>`,
  "https://www.xiacansai.com/mrjs.html": `<a class="tl-card" data-url-pc="https://www.chuangsaiyun.com/#/article/details?id=1"><div class="tl-header"><span>报名中</span></div><div class="tl-title">非遗传统工艺文创设计征集</div><div class="tl-meta">截止时间：2027-03-03 · 设计竞赛</div></a>`,
  "https://www.contestwatchers.com/feed/": `<rss><channel><item><title>Heritage Craft Open Call</title><link>https://contestwatchers.com/heritage</link><description>Open call for cultural heritage craft makers, deadline March 30, 2027</description><pubDate>Sun, 06 Sep 2026 00:00:00 GMT</pubDate></item></channel></rss>`,
  "https://www.craftscouncil.org.uk/sector-support/opportunities": `<a href="https://www.craftscouncil.org.uk/opportunities/heritage">Heritage Craft Residency</a>`,
  "https://www.artconnect.com/opportunities": `<a href="https://www.artconnect.com/opportunities/heritage-craft">Heritage Craft Open Call</a>`,
  "https://competitions.archi/registration-ending-latest/": `<div class="competition-item"><a href="https://competitions.archi/heritage-craft"><h2 class="title">Traditional Craft Museum Competition</h2><span class="type"><span>Cultural heritage</span></span><span class="submission"><span>March 30, 2027</span></span></a></div>`,
};

const result = await runOpportunityV2({
  now: new Date("2026-09-06T00:00:00.000Z"),
  sourcesPath,
  poolPath,
  healthPath,
  fetcher: async (url) => ({ status: 200, final_url: url, text: fixtureBySource[url] ?? "" }),
});
assert.equal(validateOpportunityV2Sources(readOpportunityV2Sources(sourcesPath)).length, 0);
assert.equal(result.fetched_sources, 6);
assert.equal(result.successful_sources, 6);
assert.ok(result.raw_items >= 6, "all six adapters should contribute at least one parsed item");
assert.ok(result.pool_items < result.raw_items, "cross-source duplicate should collapse into one opportunity");
assert.ok(result.radar_items > 0, "radar view must contain relevant current opportunities");
assert.equal(result.radar_opportunities.some((item) => item.title === "纯摄影比赛"), false);
const merged = result.radar_opportunities.find((item) => item.title === "非遗传统工艺文创设计征集");
assert.ok(merged);
assert.ok(merged.discovered_by_sources.includes("shejijingsai-list"));
assert.ok(merged.discovered_by_sources.includes("chuangsaiyun-competition-list"));
assert.equal(merged.source_name, "设计竞赛网");
assert.equal(merged.status, "CURRENT");
assert.equal(merged.radar_relevance, "RELEVANT");

const preservedCount = readOpportunityV2Pool(poolPath).opportunities.length;
const failed = await runOpportunityV2({ sourcesPath, poolPath, healthPath, fetcher: async () => ({ status: 503, final_url: "", text: "" }) });
assert.equal(failed.successful_sources, 0);
assert.equal(readOpportunityV2Pool(poolPath).opportunities.length, preservedCount, "failed fetches must not erase the opportunity pool");

const oldEnv = { sources: process.env.CHANCEPING_OPPORTUNITY_V2_SOURCES_PATH, pool: process.env.CHANCEPING_OPPORTUNITY_V2_POOL_PATH };
process.env.CHANCEPING_OPPORTUNITY_V2_SOURCES_PATH = sourcesPath;
process.env.CHANCEPING_OPPORTUNITY_V2_POOL_PATH = poolPath;
const app = createApp();
const apiResponse = await app.request("http://localhost/api/opportunity-v2/radar");
assert.equal(apiResponse.status, 200);
const api = await apiResponse.json() as { total: number; opportunities: Array<{ source_name: string }> };
assert.equal(api.total, result.radar_items);
assert.ok(api.opportunities.every((item) => item.source_name));
const pageResponse = await app.request("http://localhost/opportunity-v2");
assert.equal(pageResponse.status, 200);
const page = await pageResponse.text();
assert.match(page, /非遗机会雷达/);
assert.match(page, /来源：/);
const slashPageResponse = await app.request("http://localhost/opportunity-v2/");
assert.equal(slashPageResponse.status, 200);
if (oldEnv.sources === undefined) delete process.env.CHANCEPING_OPPORTUNITY_V2_SOURCES_PATH; else process.env.CHANCEPING_OPPORTUNITY_V2_SOURCES_PATH = oldEnv.sources;
if (oldEnv.pool === undefined) delete process.env.CHANCEPING_OPPORTUNITY_V2_POOL_PATH; else process.env.CHANCEPING_OPPORTUNITY_V2_POOL_PATH = oldEnv.pool;

assert.equal(opportunityV2ShouldRun(null, new Date("2026-09-06T00:00:00.000Z")), true);
assert.equal(opportunityV2ShouldRun("2026-09-06T00:00:00.000Z", new Date("2026-09-08T23:59:59.000Z")), false);
assert.equal(opportunityV2ShouldRun("2026-09-06T00:00:00.000Z", new Date("2026-09-09T00:00:00.000Z")), true);
assert.equal(opportunityV2NextRunAt("2026-09-06T00:00:00.000Z"), "2026-09-09T00:00:00.000Z");
assert.ok(fs.existsSync(healthPath));
console.log(JSON.stringify({ gate: "pass", raw_items: result.raw_items, pool_items: result.pool_items, radar_items: result.radar_items, duplicate_collapsed: result.raw_items - result.pool_items, failed_run_preserved_pool: true, scheduler_interval_hours: 72 }, null, 2));
}

void main();
