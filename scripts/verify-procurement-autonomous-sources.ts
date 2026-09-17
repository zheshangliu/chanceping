import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DEFAULT_OPPORTUNITY_V2_SOURCES } from "../src/opportunity-v2/source-pool";
import { parseProcurementSource, procurementFetchOptions, procurementSourceListingUrl } from "../src/opportunity-v2/procurement-sources";
import { runOpportunityV2 } from "../src/opportunity-v2/pipeline";

const now = new Date("2026-09-15T00:00:00.000Z");
const expected = new Map([
  ["proc-cn-gzsun", "https://www.gzsun.com.cn/"],
  ["proc-cn-csg", "https://www.bidding.csg.cn/"],
  ["proc-cn-gz-wglj", "https://wglj.gz.gov.cn/tzgg/zbcg/"],
  ["proc-uk-contracts-finder", "https://www.contractsfinder.service.gov.uk/Published/Notices/OCDS/Search?limit=100&stages=planning,tender"],
]);
for (const [id, url] of expected) assert.equal(procurementSourceListingUrl(id), url);
for (const id of expected.keys()) {
  const source = DEFAULT_OPPORTUNITY_V2_SOURCES.find((candidate) => candidate.id === id);
  assert.ok(source, `${id} is registered`);
  assert.equal(source?.enabled, false);
  assert.equal(source?.status, "PENDING");
}

const gzsun = `<html><body><a href="/cgdt/001002/001002001/20260915/a.html">广州非遗文创礼赠设计采购公告</a><a href="/about">关于平台</a></body></html>`;
const csg = `<html><body><a href="/zbgg/1200440187.jhtml">广东文化活动展陈与宣传物料采购公告</a><a href="/zbcg/index.jhtml">采购公告</a></body></html>`;
const wglj = `<html><body><a href="/tzgg/zbcg/content/post_10820415.html">广州非遗文化交流活动服务采购公告</a><a href="/tzgg/other.html">通知</a></body></html>`;
assert.equal(parseProcurementSource("proc-cn-gzsun", gzsun, expected.get("proc-cn-gzsun"), now).length, 1);
assert.equal(parseProcurementSource("proc-cn-csg", csg, expected.get("proc-cn-csg"), now).length, 1);
assert.equal(parseProcurementSource("proc-cn-gz-wglj", wglj, expected.get("proc-cn-gz-wglj"), now).length, 1);

const contractsFinder = JSON.stringify({ releases: [{ ocid: "ocds-b5fd17-demo", id: "demo-1", date: "2026-09-15T00:00:00Z", tender: { title: "Cultural heritage exhibition design services", description: "Craft and museum display design", tenderPeriod: { endDate: "2026-10-15T12:00:00Z" }, documents: [{ url: "https://www.contractsfinder.service.gov.uk/Notice/demo-1" }] }, buyer: { name: "Cultural Trust", address: { countryName: "United Kingdom" } } }] });
const cfItems = parseProcurementSource("proc-uk-contracts-finder", contractsFinder, expected.get("proc-uk-contracts-finder"), now);
assert.equal(cfItems.length, 1);
assert.equal(cfItems[0].detail_url, "https://www.contractsfinder.service.gov.uk/Notice/demo-1");
assert.equal(procurementFetchOptions("proc-uk-contracts-finder").headers?.accept, "application/json");

console.log(JSON.stringify({ pass: true, registered_new_sources: expected.size, fixture_items: { gzsun: 1, csg: 1, gz_wglj: 1, contracts_finder: cfItems.length } }, null, 2));

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "chanceping-csg-navigation-test-"));
const sourcesPath = path.join(temp, "sources.json");
const poolPath = path.join(temp, "opportunities.json");
const healthPath = path.join(temp, "health.json");
fs.writeFileSync(sourcesPath, JSON.stringify({ sources: [{ ...DEFAULT_OPPORTUNITY_V2_SOURCES.find((source) => source.id === "proc-cn-csg"), enabled: true, status: "ACTIVE" }] }));
fs.writeFileSync(poolPath, JSON.stringify({ schema_version: "chanceping-opportunity-v2.v1", updated_at: now.toISOString(), opportunities: [] }));
fs.writeFileSync(healthPath, JSON.stringify({ sources: [] }));
void (async () => {
  const calls: string[] = [];
  const listingUrl = "https://www.bidding.csg.cn/zbgg/index.jhtml";
  const result = await runOpportunityV2({ sourcesPath, poolPath, healthPath, now, fetcher: async (url) => {
    calls.push(url);
    if (url === expected.get("proc-cn-csg")) return { status: 200, final_url: url, text: `<a href="${listingUrl}">采购公告栏目</a>` };
    if (url === listingUrl) return { status: 200, final_url: url, text: csg };
    return { status: 200, final_url: url, text: `<title>广东文化活动展陈与宣传物料采购公告</title><p>投标截止时间：2026-10-15</p>` };
  } });
  assert.equal(result.raw_items, 1, "CSG home must follow its official notice listing");
  assert.equal(calls[1], listingUrl);
  fs.rmSync(temp, { recursive: true, force: true });
  console.log("CSG_NAVIGATION: PASS");
})().catch((error) => { console.error(error); process.exitCode = 1; });
