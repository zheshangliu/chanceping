import assert from "node:assert/strict";
import { parseCnyisaiListing, parse1zjListing, parseChuangyisaiListing, parseZjmtListing } from "../src/ich/aggregation/adapters/round2-domestic";
import { getAggregationAdapter } from "../src/ich/aggregation/adapters";
import { normalizeOpportunityV2 } from "../src/opportunity-v2/opportunity-pool";
import { filterOpportunityV2Radar } from "../src/opportunity-v2/radar-view";
import { classifyV2RadarRelevance } from "../src/opportunity-v2/keywords";

const onezjBoundary = [
  '<div class="list-items">',
  '<a class="list-item" href="/2026/WenChuang/closed.html"><span class="list-item-title">2026非遗文创设计征集</span><span class="list-item-time">投稿已经截止</span></a>',
  '<a class="list-item" href="/2026/WenChuang/plain.html"><span class="list-item-title">2026非遗文创设计征集</span><span class="list-item-time">20天后投稿截止</span></a>',
  '<a class="list-item" href="/2026/WenChuang/nested.html"><span class="list-item-title">2026非遗文创设计征集</span><span class="list-item-time"><span class="red">20</span>天后投稿截止</span></a>',
  '<a class="list-item" href="/2026/WenChuang/open.html"><span class="list-item-title">2026非遗文创设计征集</span><span class="list-item-time">投稿尚未截止</span></a>',
  '</div>',
].join("");

const cnyisai = `<a class="card c-dom reveal" href="/event/1.html"><div class="card-body"><div class="host">文化和旅游局</div><h3>2026非遗文创产品设计大赛</h3><p class="card-sum">面向社会征集非遗文创作品</p><div class="chip">征稿中</div><span class="cd-mini" data-deadline="2026-10-20T23:59:00"></span></div></a><a class="card c-dom is-ended-card" href="/event/2.html"><h3>赛事获奖公布</h3><span class="chip ended">已结束</span></a>`;
const onezj = `<div class="list-items"><a class="list-item" href="/2026/WenChuang/1.html"><span class="list-item-title">2026非遗文创设计征集</span><span class="list-item-price"><em>¥</em>3000</span><span class="list-item-time"><span class="red">20</span>天后截止</span></a><a class="list-item" href="/2026/WenChuang/2.html"><span class="list-item-title">设计揭晓中心</span><span class="list-item-time">已结束</span></a></div><div class="page-items"><a href="?page=2">下一页</a></div>`;
const chuangyisai = `<a href="/zjds/gycp/wcsj/1.html">2026非遗文创产品设计大赛｜截稿时间：2026年10月20日</a><a href="/hotinfo/1.html">赛事新闻</a>`;
const zjmt = `<a href="/zjxx/chanpin/1.html">2026城市礼物文创产品征集</a><a href="/zjxx/chanpin/2.html">2026陶瓷设计大赛｜截止日期：2026-11-01</a><a href="/zjxx/chanpin/3.html">2026 AI创业大赛</a><a href="/zjxx/taoci/4.html">2026陶瓷工艺大赛</a><a href="/zjxx/result/5.html">结果公示</a>`;

const fixtureSource = { id: "fixture", name: "Fixture", region: "CN" as const };
const fixtureSources = [{ ...fixtureSource, enabled: true, status: "ACTIVE" as const, url: "https://fixture.test", region: "CN" as const, priority: "P0" as const, types: ["competition"], radars: ["ich"], last_fetch_at: null }];

function fixtureItem(title: string, sourceStatus: string, sourceCategory = "文创设计") {
  return normalizeOpportunityV2({
    source_item_id: title,
    title,
    source_category: sourceCategory,
    source_status: sourceStatus,
    detail_url: `https://fixture.test/${encodeURIComponent(title)}`,
    source_url: "https://fixture.test",
    published_at: null,
    deadline_text: null,
    deadline_at: null,
    organizer: null,
    application_url: null,
    raw_text: title,
  }, fixtureSource, new Date("2026-09-08T00:00:00.000Z"));
}

function main(): void {
  const c = parseCnyisaiListing(cnyisai, "https://www.cnyisai.com/calls.html");
  assert.equal(c.length, 1);
  assert.equal(c[0].deadline_at, "2026-10-20T23:59:00.000Z");
  assert.equal(c[0].organizer, "文化和旅游局");
  const z = parse1zjListing(onezj, "https://www.1zj.com/index.php?a=mlists&catid=85&cid=91&page=1");
  assert.equal(z.length, 1);
  assert.match(z[0].raw_text, /3000/u);
  const boundaryParsed = parse1zjListing(onezjBoundary, "https://www.1zj.com/index.php?a=mlists&catid=85&cid=91&page=1");
  assert.equal(boundaryParsed.length, 4);
  assert.deepEqual(boundaryParsed.map((item) => item.source_status), ["EXPIRED", "CURRENT_OR_UNKNOWN", "CURRENT_OR_UNKNOWN", "CURRENT_OR_UNKNOWN"]);
  assert.match(boundaryParsed[2].raw_text, /20\s*天后投稿截止/u);
  const boundaryNormalized = boundaryParsed.map((item) => normalizeOpportunityV2(item, fixtureSource, new Date("2026-09-08T00:00:00.000Z")));
  assert.equal(boundaryNormalized[0].status, "EXPIRED");
  assert.equal(boundaryNormalized[1].status, "UNKNOWN_DEADLINE");
  assert.equal(boundaryNormalized[1].status, boundaryNormalized[2].status);
  assert.equal(boundaryNormalized[3].status, "UNKNOWN_DEADLINE");
  assert.equal(filterOpportunityV2Radar(boundaryNormalized, fixtureSources, { status: "browse", now: new Date("2026-09-08T00:00:00.000Z") }).length, 3);
  assert.equal(parseChuangyisaiListing(chuangyisai, "https://www.chuangyisai.com/zjds/gycp/wcsj").length, 1);
  const zjm = parseZjmtListing(zjmt, "https://www.zjmtcn.com/zjxx/chanpin/index.html");
  assert.equal(zjm.length, 4);
  assert.equal(zjm.find((item) => item.title.includes("AI创业"))?.source_category, "产品征集");
  assert.equal(zjm.find((item) => item.title.includes("陶瓷工艺"))?.source_category, "陶瓷");
  for (const id of ["cnyisai-competition", "1zj-cultural-competition", "chuangyisai-cultural", "zjmtcn-product-competition"]) assert.doesNotThrow(() => getAggregationAdapter(id));

  const ended1zj = fixtureItem("非遗文创设计大赛", "EXPIRED");
  assert.equal(ended1zj.status, "EXPIRED");
  assert.equal(filterOpportunityV2Radar([ended1zj], fixtureSources, { status: "browse", now: new Date("2026-09-08T00:00:00.000Z") }).length, 0);

  const endedCnyisai = fixtureItem("林芝礼物文创大赛", "已结束", "国内赛事");
  assert.equal(endedCnyisai.status, "EXPIRED");
  assert.equal(filterOpportunityV2Radar([endedCnyisai], fixtureSources, { status: "browse", now: new Date("2026-09-08T00:00:00.000Z") }).length, 0);

  const genericAi = fixtureItem("2026 AI创业大赛", "CURRENT_OR_UNKNOWN", "产品征集");
  const museumCraft = fixtureItem("博物馆文创设计大赛", "征稿中", "产品征集");
  assert.notEqual(genericAi.radar_relevance, "RELEVANT");
  assert.equal(museumCraft.radar_relevance, "RELEVANT");
  assert.equal(filterOpportunityV2Radar([genericAi, museumCraft], fixtureSources, { status: "browse", now: new Date("2026-09-08T00:00:00.000Z") }).length, 1);
  assert.equal(classifyV2RadarRelevance("普通摄影大赛", "", "文创设计").relevance, "IRRELEVANT");
  assert.equal(classifyV2RadarRelevance("非遗影像摄影大赛", "", "文创设计").relevance, "RELEVANT");
  assert.equal(c.find((item) => item.title.includes("2026非遗文创产品"))?.participation_scope, "unspecified");

  console.log(JSON.stringify({ cnyisai: c.length, onezj: z.length, onezj_boundary: "PASS", chuangyisai: 1, zjmt: zjm.length, noise_filtered: "PASS", source_status_to_display: "PASS", zjmt_precision: "PASS", participation_scope: "PASS", adapter_registry: "PASS" }, null, 2));
}

main();
