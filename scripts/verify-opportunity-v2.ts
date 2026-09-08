import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createApp } from "../src/api/app";
import { opportunityV2Routes } from "../src/api/routes/opportunity-v2";
import { isLikelySourceListingNoise, parseCfwDetailDate, parseGenericListing } from "../src/ich/aggregation/adapters/generic-listing";
import { extractDeadlineText, parseCfwDateRange, parseDateText } from "../src/ich/aggregation/adapters/common";
import { canonicalOpportunityTitle, filterOpportunityV2Radar, mergeOpportunityV2, normalizeOpportunityV2, opportunityStatus, opportunityV2NextRunAt, opportunityV2ShouldRun, readOpportunityV2Pool, readOpportunityV2Sources, runOpportunityV2, validateOpportunityV2Sources, writeOpportunityV2Sources } from "../src/opportunity-v2";

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
    "https://example.com/deadline-listing": `<html><body><a href="https://example.com/deadline-opportunity">Craft residency — Closing date: 29 Oct 2026</a><a href="mailto:hello@example.com">hello@example.com</a><a href="tel:+8613800000000">+86 138 0000 0000</a></body></html>`,
    "https://www.kcdf.or.kr/main": `<html><body><a href="https://www.kcdf.or.kr/brd/board/337/L/menu/284?bbIdx=1">사업공모 2026 전통문화 지원사업 공모</a><a href="https://www.kcdf.or.kr/brd/board/335/L/menu/331?bbIdx=2">공예문화(Craft Culture) 71호</a></body></html>`,
    "https://www.homofaber.com/en/news/cfp": `<html><body><a href="https://www.homofaber.com/en/nextgen/fellowship">Homo Faber Fellowship</a><a href="https://www.homofaber.com/en/nextgen/young-ambassadors">Young Ambassadors Programme</a><a href="https://www.homofaber.com/en/news/seasonsgreetings">Wishing you a happy, restful and well-crafted holiday season</a><a href="https://www.homofaber.com/en/info/artisan-how-to-apply">Artisan: how to apply?</a></body></html>`,
    "https://craftcouncilbc.ca/call-for-entry/": `<html><body><a href="https://craftcouncilbc.ca/mactaquac-craft">Call for Vendors: Mactaquac Craft Festival 2026</a><a href="mailto:contact_us@craftcouncilbc.ca">contact_us@craftcouncilbc.ca</a><a href="https://craftcouncilbc.ca/in-craft">CCBC blog</a></body></html>`,
    "https://culture360.org/opportunities/": `<html><body><a href="https://culture360.org/opportunities/loewe-foundation-2027-craft-prize">Loewe Foundation 2027 Craft Prize</a></body></html>`,
    "https://craftprize.loewe.com/zh/craftprize2027": `<html><body><h1>Craft Prize 2027</h1><p>请于2027年3月30日之前提交您的申请。</p></body></html>`,
    "https://dasai.cfw.cn/compete/search?categoryCode=0400&ordernum=0&page=1": `<html><body><a href="https://dasai.cfw.cn/ds/1321.html">2026“山东手造·齐品淄博”城市礼物创意设计大赛</a><a href="https://dasai.cfw.cn/compete/search?page=2&ordernum=0&categoryCode=0400">2</a></body></html>`,
    "https://dasai.cfw.cn/compete/search?categoryCode=0400&ordernum=0&page=2": `<html><body><a href="https://dasai.cfw.cn/ds/1329.html">2026国文奖两岸青年非遗文创设计大赛</a></body></html>`,
  };
  const fetcher = async (url: string) => ({ status: 200, final_url: url, text: fixtureBySource[url] ?? "" });
  const initialSources = readOpportunityV2Sources(sourcesPath);
  assert.equal(initialSources.length, 30);
  assert.deepEqual(initialSources.slice(7, 21).map((source) => source.id), [
    "opencall-radar-craft", "opencalls-ai", "american-craft-council-opportunities", "craft-scotland-opportunities",
    "kcdf-opportunities", "heritage-crafts-opportunities", "homo-faber-calls", "asef-culture360-opportunities",
    "on-the-move-open-calls", "curatorspace-opportunities", "cafe-call-for-entry", "artshub-craft-opportunities",
    "craft-council-bc-calls", "craft-council-nl-opportunities",
  ]);
  assert.deepEqual(initialSources.slice(21).map((source) => source.id), [
    "cfw-cultural-ip", "whaleideas-competition", "1zj-cultural-competition", "chuangyisai-cultural", "zcool-challenges",
    "zjmtcn-product-competition", "iuben-cultural-competition", "everyart-competition", "gtn9-competition",
  ]);
  writeOpportunityV2Sources(initialSources.map((source) => ["kcdf-opportunities", "homo-faber-calls"].includes(source.id) ? { ...source, status: "ACTIVE" } : source), sourcesPath);
  const result = await runOpportunityV2({ now: new Date("2026-09-06T00:00:00.000Z"), sourcesPath, poolPath, healthPath, fetcher });
  assert.equal(validateOpportunityV2Sources(readOpportunityV2Sources(sourcesPath)).length, 0);
  assert.equal(result.fetched_sources, initialSources.filter((source) => source.enabled && source.status !== "PAUSED" && source.status !== "NEEDS_ADAPTER").length);
  assert.ok(result.successful_sources >= 1);
  assert.ok(result.raw_items >= 6);
  assert.ok(result.pool_items < result.raw_items);
  assert.ok(result.radar_items > 0);
  assert.equal(result.radar_opportunities.some((item) => item.title === "纯摄影比赛"), false);
  const resultPool = readOpportunityV2Pool(poolPath).opportunities;
  assert.equal(resultPool.some((item) => item.source_id === "artconnect-opportunities" && /\/opportunities\//u.test(item.detail_url)), false);
  assert.equal(resultPool.some((item) => item.title === "공예문화(Craft Culture) 71호"), false);
  assert.equal(resultPool.some((item) => item.title.includes("holiday season")), false);
  assert.equal(resultPool.some((item) => item.source_id === "craft-council-bc-calls" && /(?:blog|podcast|archive|contact_us|mailto:)/iu.test(`${item.title} ${item.detail_url}`)), false);
  assert.equal(resultPool.filter((item) => /loewe foundation.*craft prize|craft prize.*loewe foundation/iu.test(item.title)).length, 1);
  assert.deepEqual(resultPool.find((item) => /loewe foundation.*craft prize|craft prize.*loewe foundation/iu.test(item.title))?.discovered_by_sources.sort(), ["asef-culture360-opportunities", "loewe-craft-prize"]);
  assert.equal(result.source_health.find((row) => row.source_id === "cfw-cultural-ip")?.items_seen, 2);
  const cfwCards = parseGenericListing(
    `<ul class="competition-data"><li><a href="/ds/1195.html" class="name">2026第九届金茶花国际文创设计大赛征稿通知</a><p class="pt15 c6">2026.03.20-08.31</p></li><li><a href="/ds/1198.html" class="name">2026“车城深汕”文创设计大赛</a><p class="pt15 c6">2026.03.26-2026.04.28</p></li></ul>`,
    "https://dasai.cfw.cn/compete/search?categoryCode=0400&ordernum=0&page=1",
    [],
    "cfw-cultural-ip",
  );
  assert.equal(cfwCards.length, 2);
  assert.equal(cfwCards.find((item) => item.detail_url.endsWith("/1195.html"))?.deadline_at, "2026-08-31T23:59:00.000Z");
  assert.equal(cfwCards.find((item) => item.detail_url.endsWith("/1198.html"))?.deadline_at, "2026-04-28T23:59:00.000Z");
  assert.deepEqual(parseCfwDateRange("2026.03.20-08.31"), { raw: "2026.03.20-08.31", deadlineAt: "2026-08-31T23:59:00.000Z" });
  assert.deepEqual(parseCfwDateRange("2026.03.26-2026.04.28"), { raw: "2026.03.26-2026.04.28", deadlineAt: "2026-04-28T23:59:00.000Z" });
  assert.deepEqual(parseCfwDetailDate(`<p class="pt10 c6">2026.03.20-08.31</p>`), { raw: "2026.03.20-08.31", deadlineAt: "2026-08-31T23:59:00.000Z" });
  const deadlineNow = new Date("2026-09-07T00:00:00+08:00");
  const cfwStablePrior = { ...cfwCards[0], deadline_at: null };
  const cfwStableIncoming = { ...cfwCards[0], title: `${cfwCards[0].title}（延期）`, deadline_at: "2026-10-31T23:59:00.000Z" };
  const stablePrior = normalizeOpportunityV2(cfwStablePrior, { id: "cfw-cultural-ip", name: "CFW", region: "CN" }, deadlineNow);
  const stableIncoming = normalizeOpportunityV2(cfwStableIncoming, { id: "cfw-cultural-ip", name: "CFW", region: "CN" }, deadlineNow);
  const stableMerged = mergeOpportunityV2([stablePrior], [stableIncoming], deadlineNow);
  assert.equal(stableMerged.length, 1, "CFW detail URL backfill must not duplicate a renamed card");
  assert.equal(stableMerged[0].deadline, "2026-10-31T23:59:00.000Z");
  assert.equal(canonicalOpportunityTitle("2026“山东手造·齐品淄博”城市礼物创意设计大赛"), canonicalOpportunityTitle("山东手造·齐品淄博 2026 城市礼物创意设计大赛"));
  const genericDeadline = parseGenericListing(fixtureBySource["https://example.com/deadline-listing"], "https://example.com/deadline-listing");
  assert.equal(genericDeadline.length, 1);
  assert.equal(genericDeadline[0].deadline_at, "2026-10-29T23:59:00.000Z");
  const deadlineCases = [
    ["2026比赛【截稿至7月5日】", "2026-07-05T23:59:00.000Z", "EXPIRED"],
    ["2026比赛【截稿至 8月20日】", "2026-08-20T23:59:00.000Z", "EXPIRED"],
    ["比赛｜申请截止：2026年08月28日", "2026-08-28T23:59:00.000Z", "EXPIRED"],
    ["比赛｜申请截止：2026-08-28", "2026-08-28T23:59:00.000Z", "EXPIRED"],
    ["比赛｜申请截止：2026‑08‑28", "2026-08-28T23:59:00.000Z", "EXPIRED"],
    ["比赛｜截止10月20日", "2026-10-20T23:59:00.000Z", "CURRENT"],
  ] as const;
  for (const [text, expected, expectedStatus] of deadlineCases) {
    const deadlineText = extractDeadlineText(text);
    const deadline = parseDateText(deadlineText, deadlineNow, text);
    assert.equal(deadline, expected, `deadline parsed: ${text}`);
    assert.equal(opportunityStatus(deadline, deadlineNow), expectedStatus, `deadline status: ${text}`);
  }
  const iubenDeadline = parseGenericListing(
    `<article><a href="https://iuben.cn/collect/detail-1.html">2026非遗文创设计征集</a><p>投稿截止：2026-10-20</p></article>`,
    "https://iuben.cn/collect/",
    [],
    "iuben-cultural-competition",
  );
  assert.equal(iubenDeadline.length, 1);
  assert.equal(iubenDeadline[0].deadline_at, "2026-10-20T23:59:00.000Z");
  assert.equal(isLikelySourceListingNoise("cfw-cultural-ip", "2025文创设计大赛", "https://dasai.cfw.cn/ds/1000.html"), true);
  assert.equal(isLikelySourceListingNoise("craft-council-bc-calls", "contact_us[@]craftcouncilbc[.]ca", "mailto:contact_us@craftcouncilbc.ca"), true);
  assert.equal(isLikelySourceListingNoise("kcdf-opportunities", "공예문화(Craft Culture) 71호", "https://www.kcdf.or.kr/article"), true);
  assert.equal(isLikelySourceListingNoise("homo-faber-calls", "Wishing you a happy, restful and well-crafted holiday season", "https://www.homofaber.com/en/news/seasonsgreetings"), true);
  assert.equal(isLikelySourceListingNoise("craft-council-bc-calls", "Call for Vendors: Mactaquac Craft Festival 2026", "https://craftcouncilbc.ca/mactaquac-craft"), false);

  const wideSourcesPath = path.join(temp, "wide-sources.json");
  const widePoolPath = path.join(temp, "wide-pool.json");
  writeOpportunityV2Sources([{ ...initialSources[0], id: "wide-listing-source", url: "https://example.com/wide", status: "PENDING" }], wideSourcesPath);
  fs.writeFileSync(widePoolPath, JSON.stringify({ schema_version: "chanceping-opportunity-v2.v1", updated_at: new Date(0).toISOString(), opportunities: [] }));
  const wideHtml = Array.from({ length: 205 }, (_, index) => `<a href="https://example.com/wide/${index}">Craft opportunity ${index}</a>`).join("");
  const wide = await runOpportunityV2({ sourcesPath: wideSourcesPath, poolPath: widePoolPath, healthPath: path.join(temp, "wide-health.json"), fetcher: async () => ({ status: 200, final_url: "https://example.com/wide", text: wideHtml }) });
  assert.equal(wide.raw_items, 205, "discovery must not silently truncate at 200 items");
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
  assert.equal(readOpportunityV2Sources(sourcesPath).length, 31);
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
  const displayedTotal = Number(ichPage.match(/(?:当前机会|可浏览赛事)：\s*(\d+) 条/u)?.[1] ?? -1);
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
  assert.match(page, /现有数据源后台总览/);
  if (oldEnv.sources === undefined) delete process.env.CHANCEPING_OPPORTUNITY_V2_SOURCES_PATH; else process.env.CHANCEPING_OPPORTUNITY_V2_SOURCES_PATH = oldEnv.sources;
  if (oldEnv.pool === undefined) delete process.env.CHANCEPING_OPPORTUNITY_V2_POOL_PATH; else process.env.CHANCEPING_OPPORTUNITY_V2_POOL_PATH = oldEnv.pool;

  assert.equal(opportunityV2ShouldRun(null, new Date("2026-09-06T00:00:00.000Z")), true);
  assert.equal(opportunityV2ShouldRun("2026-09-06T00:00:00.000Z", new Date("2026-09-08T23:59:59.000Z")), false);
  assert.equal(opportunityV2ShouldRun("2026-09-06T00:00:00.000Z", new Date("2026-09-09T00:00:00.000Z")), true);
  assert.equal(opportunityV2NextRunAt("2026-09-06T00:00:00.000Z"), "2026-09-09T00:00:00.000Z");
  console.log(JSON.stringify({ gate: "pass", sources_before: 21, sources_after_test: 22, generic_html: true, generic_rss: true, deadline_hygiene: true, needs_adapter: true, artconnect_navigation_removed: true, loewe_adapter: true, existing_radar_items_unchanged: true, scheduler_interval_hours: 72 }, null, 2));
}

void main();
