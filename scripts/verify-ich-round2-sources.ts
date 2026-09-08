import assert from "node:assert/strict";
import { parseCnyisaiListing, parse1zjListing, parseChuangyisaiListing, parseZjmtListing } from "../src/ich/aggregation/adapters/round2-domestic";
import { getAggregationAdapter } from "../src/ich/aggregation/adapters";

const cnyisai = `<a class="card c-dom reveal" href="/event/1.html"><div class="card-body"><div class="host">文化和旅游局</div><h3>2026非遗文创产品设计大赛</h3><p class="card-sum">面向社会征集非遗文创作品</p><div class="chip">征稿中</div><span class="cd-mini" data-deadline="2026-10-20T23:59:00"></span></div></a><a class="card c-dom is-ended-card" href="/event/2.html"><h3>赛事获奖公布</h3><span class="chip ended">已结束</span></a>`;
const onezj = `<div class="list-items"><a class="list-item" href="/2026/WenChuang/1.html"><span class="list-item-title">2026非遗文创设计征集</span><span class="list-item-price"><em>¥</em>3000</span><span class="list-item-time"><span class="red">20</span>天后截止</span></a><a class="list-item" href="/2026/WenChuang/2.html"><span class="list-item-title">设计揭晓中心</span><span class="list-item-time">已结束</span></a></div><div class="page-items"><a href="?page=2">下一页</a></div>`;
const chuangyisai = `<a href="/zjds/gycp/wcsj/1.html">2026非遗文创产品设计大赛｜截稿时间：2026年10月20日</a><a href="/hotinfo/1.html">赛事新闻</a>`;
const zjmt = `<a href="/zjxx/chanpin/1.html">2026城市礼物文创产品征集</a><a href="/zjxx/chanpin/2.html">2026陶瓷设计大赛｜截止日期：2026-11-01</a><a href="/zjxx/result/3.html">结果公示</a>`;

function main(): void {
  const c = parseCnyisaiListing(cnyisai, "https://www.cnyisai.com/calls.html");
  assert.equal(c.length, 1);
  assert.equal(c[0].deadline_at, "2026-10-20T23:59:00.000Z");
  assert.equal(c[0].organizer, "文化和旅游局");
  const z = parse1zjListing(onezj, "https://www.1zj.com/index.php?a=mlists&catid=85&cid=91&page=1");
  assert.equal(z.length, 1);
  assert.match(z[0].raw_text, /3000/u);
  assert.equal(parseChuangyisaiListing(chuangyisai, "https://www.chuangyisai.com/zjds/gycp/wcsj").length, 1);
  assert.equal(parseZjmtListing(zjmt, "https://www.zjmtcn.com/zjxx/chanpin/index.html").length, 2);
  for (const id of ["cnyisai-competition", "1zj-cultural-competition", "chuangyisai-cultural", "zjmtcn-product-competition"]) assert.doesNotThrow(() => getAggregationAdapter(id));
  console.log(JSON.stringify({ cnyisai: c.length, onezj: z.length, chuangyisai: 1, zjmt: 2, noise_filtered: "PASS", adapter_registry: "PASS" }, null, 2));
}

main();
