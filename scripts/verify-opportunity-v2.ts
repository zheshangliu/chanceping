import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createApp } from "../src/api/app";
import { opportunityV2Routes } from "../src/api/routes/opportunity-v2";
import { filterOpportunityV2Radar, opportunityV2NextRunAt, opportunityV2ShouldRun, readOpportunityV2Pool, readOpportunityV2Sources, runOpportunityV2, validateOpportunityV2Sources, writeOpportunityV2Sources } from "../src/opportunity-v2";

async function jsonRequest(app: ReturnType<typeof opportunityV2Routes>, url: string, method: string, body?: Record<string, unknown>): Promise<{ status: number; data: any }> {
  const response = await app.request(`http://localhost${url}`, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, data: await response.json() };
}

async function main(): Promise<void> {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "chanceping-opportunity-v21-"));
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
    "https://www.artconnect.com/opportunities": `<a href="https://www.artconnect.com/opportunity/heritage-craft">Heritage Craft Open Call</a>`,
    "https://competitions.archi/registration-ending-latest/": `<div class="competition-item"><a href="https://competitions.archi/heritage-craft"><h2 class="title">Traditional Craft Museum Competition</h2><span class="type"><span>Cultural heritage</span></span><span class="submission"><span>March 30, 2027</span></span></a></div>`,
    "https://example.com/markets": `<html><body><a href="/markets/heritage-craft">非遗手工艺市集征集</a></body></html>`,
    "https://example.com/rss": `<rss><channel><item><title>Heritage Market Open Call</title><link>https://example.com/rss/heritage-market</link><description>Craft market opportunity for cultural heritage makers</description></item></channel></rss>`,
    "https://example.com/unparseable": `<html><body><h1>Welcome</h1><p>About our company</p></body></html>`,
    "https://craftprize.loewe.com/zh/craftprize2027": `<html><body><h1>Craft Prize 2027</h1><p>请于2027年3月30日之前提交您的申请。</p></body></html>`,
  };
  const fetcher = async (url: string) => ({ status: 200, final_url: url, text: fixtureBySource[url] ?? "" });
  const initialSources = readOpportunityV2Sources(sourcesPath);
  assert.equal(initialSources.length, 7);
  const result = await runOpportunityV2({ now: new Date("2026-09-06T00:00:00.000Z"), sourcesPath, poolPath, healthPath, fetcher });
  assert.equal(validateOpportunityV2Sources(readOpportunityV2Sources(sourcesPath)).length, 0);
  assert.equal(result.fetched_sources, 7);
  assert.equal(result.successful_sources, 7);
  assert.ok(result.raw_items >= 6);
  assert.ok(result.pool_items < result.raw_items);
  assert.ok(result.radar_items > 0);
  assert.equal(result.radar_opportunities.some((item) => item.title === "纯摄影比赛"), false);
  assert.equal(readOpportunityV2Pool(poolPath).opportunities.some((item) => item.source_id === "artconnect-opportunities" && /\/opportunities\//u.test(item.detail_url)), false);
  const baselineRadar = new Map(filterOpportunityV2Radar(readOpportunityV2Pool(poolPath).opportunities, readOpportunityV2Sources(sourcesPath)).map((item) => [item.id, JSON.stringify(item)]));

  const failedSourcesPath = path.join(temp, "failed-sources.json");
  const failedPoolPath = path.join(temp, "failed-pool.json");
  fs.copyFileSync(sourcesPath, failedSourcesPath);
  fs.copyFileSync(poolPath, failedPoolPath);
  const failed = await runOpportunityV2({ sourcesPath: failedSourcesPath, poolPath: failedPoolPath, healthPath: path.join(temp, "failed-health.json"), fetcher: async () => ({ status: 503, final_url: "", text: "" }) });
  assert.equal(failed.successful_sources, 0);
  assert.equal(readOpportunityV2Pool(failedPoolPath).opportunities.length, result.pool_items, "failed sources must not erase the opportunity pool");

  const manager = opportunityV2Routes({ sourcesPath, poolPath, healthPath, fetcher });
  const created = await jsonRequest(manager, "/sources", "POST", { id: "test-custom-source", name: "某非遗市集平台", url: "https://example.com/markets", region: "CN", priority: "P0", types: ["market"], radars: ["ich"] });
  assert.equal(created.status, 200);
  assert.equal(created.data.source.id, "test-custom-source");
  assert.equal(created.data.source.status, "ACTIVE");
  assert.equal(created.data.test.ok, true);
  assert.equal(created.data.test.format, "HTML_LISTING");
  assert.ok(created.data.run.raw_items > 0);
  assert.equal(readOpportunityV2Sources(sourcesPath).length, 8);
  assert.equal(validateOpportunityV2Sources(readOpportunityV2Sources(sourcesPath)).length, 0, "arbitrary source IDs are legal");

  const edited = await jsonRequest(manager, "/sources/test-custom-source", "PUT", { name: "某非遗市集平台（已编辑）", url: "https://example.com/markets", region: "CN", priority: "P1", types: ["market", "open_call"], radars: ["ich"] });
  assert.equal(edited.status, 200);
  assert.equal(edited.data.source.name, "某非遗市集平台（已编辑）");
  const paused = await jsonRequest(manager, "/sources/test-custom-source/pause", "POST");
  assert.equal(paused.data.source.enabled, false);
  assert.equal(paused.data.source.status, "PAUSED");
  const enabled = await jsonRequest(manager, "/sources/test-custom-source/enable", "POST");
  assert.equal(enabled.data.source.enabled, true);
  assert.equal(enabled.data.source.status, "ACTIVE");
  const tested = await jsonRequest(manager, "/sources/test-custom-source/test", "POST");
  assert.equal(tested.data.ok, true);
  assert.equal(tested.data.format, "HTML_LISTING");
  const ran = await jsonRequest(manager, "/sources/test-custom-source/run", "POST");
  assert.equal(ran.status, 200);
  assert.ok(ran.data.raw_items > 0);
  assert.ok(readOpportunityV2Pool(poolPath).opportunities.some((item) => item.source_id === "test-custom-source"));

  const rss = await jsonRequest(manager, "/sources", "POST", { id: "test-rss-source", name: "RSS 测试来源", url: "https://example.com/rss", region: "GLOBAL", priority: "P1", types: ["market"], radars: ["ich"] });
  assert.equal(rss.status, 200);
  assert.equal(rss.data.test.ok, true);
  assert.equal(rss.data.test.format, "RSS");
  assert.ok(readOpportunityV2Pool(poolPath).opportunities.some((item) => item.source_id === "test-rss-source"));
  const unparseable = await jsonRequest(manager, "/sources", "POST", { id: "test-unparseable-source", name: "无法识别的来源", url: "https://example.com/unparseable", region: "CN", priority: "P1", types: ["market"], radars: ["ich"] });
  assert.equal(unparseable.status, 200);
  assert.equal(unparseable.data.source.status, "NEEDS_ADAPTER");
  assert.equal(unparseable.data.test.ok, false);

  const schedulerSourcesPath = path.join(temp, "scheduler-sources.json");
  const schedulerPoolPath = path.join(temp, "scheduler-pool.json");
  writeOpportunityV2Sources([readOpportunityV2Sources(sourcesPath).find((source) => source.id === "test-custom-source")!], schedulerSourcesPath);
  fs.writeFileSync(schedulerPoolPath, JSON.stringify({ schema_version: "chanceping-opportunity-v2.v1", updated_at: new Date(0).toISOString(), opportunities: [] }));
  const scheduled = await runOpportunityV2({ sourcesPath: schedulerSourcesPath, poolPath: schedulerPoolPath, healthPath: path.join(temp, "scheduler-health.json"), fetcher });
  assert.equal(scheduled.fetched_sources, 1);
  assert.equal(scheduled.successful_sources, 1);

  const retrySourcesPath = path.join(temp, "retry-sources.json");
  const retryPoolPath = path.join(temp, "retry-pool.json");
  writeOpportunityV2Sources([
    { ...initialSources[0], status: "FAILED" },
    { ...initialSources[1], status: "PENDING" },
    { ...initialSources[2], status: "PAUSED", enabled: false },
    { ...initialSources[3], status: "NEEDS_ADAPTER" },
  ], retrySourcesPath);
  fs.writeFileSync(retryPoolPath, JSON.stringify({ schema_version: "chanceping-opportunity-v2.v1", updated_at: new Date(0).toISOString(), opportunities: [] }));
  const retry = await runOpportunityV2({ sourcesPath: retrySourcesPath, poolPath: retryPoolPath, healthPath: path.join(temp, "retry-health.json"), fetcher });
  assert.equal(retry.fetched_sources, 2, "scheduler retries FAILED and PENDING but excludes PAUSED and NEEDS_ADAPTER");
  assert.equal(retry.successful_sources, 2);
  assert.ok(retry.sources.filter((source) => source.status === "ACTIVE").length >= 2);

  const currentRadar = new Map(filterOpportunityV2Radar(readOpportunityV2Pool(poolPath).opportunities, readOpportunityV2Sources(sourcesPath)).map((item) => [item.id, JSON.stringify(item)]));
  for (const [id, serialized] of baselineRadar) assert.equal(currentRadar.get(id), serialized, `existing V2 radar item changed: ${id}`);
  const oldEnv = { sources: process.env.CHANCEPING_OPPORTUNITY_V2_SOURCES_PATH, pool: process.env.CHANCEPING_OPPORTUNITY_V2_POOL_PATH };
  process.env.CHANCEPING_OPPORTUNITY_V2_SOURCES_PATH = sourcesPath;
  process.env.CHANCEPING_OPPORTUNITY_V2_POOL_PATH = poolPath;
  const app = createApp();
  assert.equal((await app.request("http://localhost/ich")).status, 200);
  const ichPage = await (await app.request("http://localhost/ich")).text();
  const radarResponse = await app.request("http://localhost/api/opportunity-v2/radar");
  const radarApi = await radarResponse.json() as { total: number };
  const displayedTotal = Number(ichPage.match(/当前机会：\s*(\d+) 条/u)?.[1] ?? -1);
  assert.equal(displayedTotal, radarApi.total, "public /ich total must match the V2 radar API");
  assert.match(ichPage, /来源：/);
  assert.match(ichPage, /ich-paper-atlas-hero\.png/);
  assert.match(ichPage, /赛事 \/ 征集/);
  assert.match(ichPage, /海外/);
  assert.doesNotMatch(ichPage, /OPPORTUNITY V2|SOURCE → FETCH → DEDUP → FILTER|RELEVANT|CURRENT|UNKNOWN_DEADLINE|Source Manager/);
  assert.doesNotMatch(ichPage, /纯摄影比赛/);
  const overseasPage = await (await app.request("http://localhost/ich?region=overseas")).text();
  assert.match(overseasPage, /LOEWE FOUNDATION Craft Prize/);
  assert.match(overseasPage, /https:\/\/craftprize\.loewe\.com\/zh\/craftprize2027/);
  const pageTwo = await (await app.request("http://localhost/ich?page=2")).text();
  assert.match(pageTwo, /ich-pagination/);
  assert.equal((await app.request("http://localhost/opportunity-v2/admin/sources")).status, 200);
  const page = await (await app.request("http://localhost/opportunity-v2/admin/sources")).text();
  assert.match(page, /Source Manager/);
  if (oldEnv.sources === undefined) delete process.env.CHANCEPING_OPPORTUNITY_V2_SOURCES_PATH; else process.env.CHANCEPING_OPPORTUNITY_V2_SOURCES_PATH = oldEnv.sources;
  if (oldEnv.pool === undefined) delete process.env.CHANCEPING_OPPORTUNITY_V2_POOL_PATH; else process.env.CHANCEPING_OPPORTUNITY_V2_POOL_PATH = oldEnv.pool;

  assert.equal(opportunityV2ShouldRun(null, new Date("2026-09-06T00:00:00.000Z")), true);
  assert.equal(opportunityV2ShouldRun("2026-09-06T00:00:00.000Z", new Date("2026-09-08T23:59:59.000Z")), false);
  assert.equal(opportunityV2ShouldRun("2026-09-06T00:00:00.000Z", new Date("2026-09-09T00:00:00.000Z")), true);
  assert.equal(opportunityV2NextRunAt("2026-09-06T00:00:00.000Z"), "2026-09-09T00:00:00.000Z");
  console.log(JSON.stringify({ gate: "pass", sources_before: 7, sources_after_test: 8, generic_html: true, generic_rss: true, needs_adapter: true, artconnect_navigation_removed: true, loewe_adapter: true, existing_radar_items_unchanged: true, scheduler_interval_hours: 72 }, null, 2));
}

void main();
