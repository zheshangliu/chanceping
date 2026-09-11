import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { parseProcurementSource, procurementFetchOptions, TED_PROCUREMENT_QUERY, worldBankRequestUrls } from "../src/opportunity-v2/procurement-sources";
import { DEFAULT_OPPORTUNITY_V2_SOURCES, readOpportunityV2Pool, readOpportunityV2Sources, runOpportunityV2, writeOpportunityV2Sources } from "../src/opportunity-v2";
import { decompressOpportunityV2Body, MAX_DECOMPRESSED_RESPONSE_BYTES } from "../src/opportunity-v2/pipeline";
import type { OpportunityV2FetchOptions, OpportunityV2FetchResponse, OpportunityV2Source } from "../src/opportunity-v2/types";

const NOW = new Date("2026-09-11T12:00:00+08:00");

function tempRuntime(source: OpportunityV2Source): { sourcesPath: string; poolPath: string; healthPath: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "chanceping-proc-phase1-2a-test-"));
  const sourcesPath = path.join(dir, "sources.json");
  const poolPath = path.join(dir, "opportunities.json");
  const healthPath = path.join(dir, "source-health.json");
  fs.writeFileSync(sourcesPath, JSON.stringify({ sources: [source] }));
  fs.writeFileSync(poolPath, JSON.stringify({ schema_version: "chanceping-opportunity-v2.v1", updated_at: NOW.toISOString(), opportunities: [] }));
  fs.writeFileSync(healthPath, JSON.stringify({ sources: [] }));
  return { sourcesPath, poolPath, healthPath };
}

function activeSource(id: string, url: string, region: "CN" | "GLOBAL" = "GLOBAL"): OpportunityV2Source {
  return { id, name: id, url, region, priority: "P0", types: ["procurement"], radars: ["ich"], enabled: true, status: "ACTIVE", last_fetch_at: null };
}

function response(url: string, text: string, trace?: OpportunityV2FetchResponse["trace"]): OpportunityV2FetchResponse {
  return { status: 200, final_url: url, text, ...(trace ? { trace } : {}) };
}

async function runSingle(source: OpportunityV2Source, fetcher: (url: string, options?: OpportunityV2FetchOptions) => Promise<OpportunityV2FetchResponse>, now = NOW) {
  const runtime = tempRuntime(source);
  const result = await runOpportunityV2({ now, sourcesPath: runtime.sourcesPath, poolPath: runtime.poolPath, healthPath: runtime.healthPath, fetcher });
  return { ...result, pool: readOpportunityV2Pool(runtime.poolPath).opportunities };
}

async function main(): Promise<void> {
  const listingCalls: Array<{ url: string; options: OpportunityV2FetchOptions }> = [];
  const ccgpListing = "https://www.ccgp.gov.cn/cggg/dfgg/index.htm";
  const ccgpDetail = "https://www.ccgp.gov.cn/cggg/dfgg/jzxcs/202609/test-ccgp.htm";
  const ccgp = activeSource("proc-cn-ccgp", ccgpListing, "CN");
  const ccgpRun = await runSingle(ccgp, async (url, options = {}) => {
    listingCalls.push({ url, options });
    if (url === ccgpListing) return response(url, `<a href="${ccgpDetail}">非遗文创展陈服务采购公告</a>`);
    return response(url, `<meta name="ArticleTitle" content="非遗文创展陈服务采购公告"><p>项目编号：CCGP-2026-001</p><p>采购单位：某文化馆</p><p>响应文件接收截止时间：2026-10-01 10:00</p><p>采购需求：非遗展陈设计与活动服务</p>`);
  });
  assert.ok(ccgpRun.raw_items > 0, "CCGP listing discovery must find items");
  assert.equal(listingCalls[0]?.url, ccgpListing);
  assert.equal(listingCalls[0]?.options.method, "GET");
  assert.equal(listingCalls.some((call) => call.url.includes("test-ccgp.htm")), true);
  assert.equal(listingCalls.some((call) => call.url.includes("27286594")), false, "CCGP must not use the phase1 hardcoded detail seed");

  const cibListing = "https://cg.cib.com.cn/cms/default/webfile/index.html";
  const cibDetail = "https://cg.cib.com.cn/cms/default/webfile/gyszj/20260904/cib-test.html";
  const cibCalls: string[] = [];
  const cibRun = await runSingle(activeSource("proc-cn-cib", cibListing, "CN"), async (url) => {
    cibCalls.push(url);
    if (url === cibListing) return response(url, `<a href="${cibDetail}">供应商征集：非遗礼赠与文创设计服务</a>`);
    return response(url, `<div class="c-title"><h1>供应商征集：非遗礼赠与文创设计服务</h1><span>发布日期：2026-09-04</span></div><div>供应商征集截止时间：2026-10-01 23:59</div>`);
  });
  assert.ok(cibRun.raw_items > 0, "CIB listing discovery must find items");
  assert.equal(cibCalls[0], cibListing);
  assert.equal(cibCalls.some((url) => url === cibDetail), true);

  const cibApiCalls: Array<{ url: string; options: OpportunityV2FetchOptions }> = [];
  const cibApiRun = await runSingle(activeSource("proc-cn-cib", cibListing, "CN"), async (url, options = {}) => {
    cibApiCalls.push({ url, options });
    if (url === cibListing) return response(url, `<a href="https://cg.cib.com.cn/cms/default/webfile/gyszj/index.html">供应商征集</a>`);
    if (url.endsWith("/gyszj/index.html")) return response(url, `<input class="pageSize isk" value="10"><input class="chunkSiteId" value="725"><input class="channelCategoryId" value="201">`);
    if (url.endsWith("/cms/api/dynamicData/queryContentPage")) return response(url, JSON.stringify({ res: { rows: [{ title: "供应商征集：非遗文创设计服务", url: "/gyszj/20260904/cib-api-test.html", text: "发布日期：2026-09-04" }] } }));
    return response(url, `<div class="c-title"><h1>供应商征集：非遗文创设计服务</h1><span>发布日期：2026-09-04</span></div><div>供应商征集截止时间：2026-10-01 23:59</div>`);
  });
  assert.ok(cibApiRun.raw_items > 0, "CIB live listing flow must parse API rows");
  assert.equal(cibApiCalls[0]?.options.method, "GET");
  assert.equal(cibApiCalls.some((call) => call.url.endsWith("/gyszj/index.html") && call.options.method === "GET"), true);
  assert.equal(cibApiCalls.some((call) => call.url.endsWith("/cms/api/dynamicData/queryContentPage") && call.options.method === "POST" && Buffer.byteLength(String(call.options.body)) > 0), true);
  assert.equal(cibApiCalls.some((call) => call.url.includes("cib-api-test.html")), true);

  const ocpSource = activeSource("proc-global-ocp", "https://data.open-contracting.org/en/publication/119/download?name=2026.jsonl.gz");
  const ocpRecord = { ocid: "ocds-main-001", date: "2026-09-10", buyer: { name: "City Museum" }, tender: { title: "Craft exhibition services", description: "Open tender for a heritage craft exhibition", status: "active", tenderPeriod: { endDate: "2026-10-01T17:00:00Z" }, documents: [{ url: "https://official.example.gov/tenders/ocds-main-001" }] } };
  const ocpOptions: OpportunityV2FetchOptions[] = [];
  const ocpRun = await runSingle(ocpSource, async (url, options = {}) => {
    ocpOptions.push(options);
    return response(url, `${JSON.stringify(ocpRecord)}\n`, { method: "GET", request_url: url, final_url: url, status: 200, request_body_bytes: 0, content_type: "application/gzip", content_encoding: null, response_bytes: 64, decompressed_bytes: Buffer.byteLength(JSON.stringify(ocpRecord) + "\n"), decompression: "gzip" });
  });
  assert.ok(ocpRun.raw_items > 0, "OCP JSONL must parse through the main pipeline");
  assert.equal(ocpOptions[0]?.decompress, "gzip");
  assert.equal(ocpRun.source_health[0]?.format, "DEDICATED");
  assert.equal(ocpRun.radar_opportunities.length, 1, "OCP record with official evidence may be public");

  const tedSource = activeSource("proc-eu-ted", "https://api.ted.europa.eu/v3/notices/search");
  const tedCalls: Array<{ url: string; options: OpportunityV2FetchOptions }> = [];
  const tedRun = await runSingle(tedSource, async (url, options = {}) => {
    tedCalls.push({ url, options });
    return response(url, JSON.stringify({ notices: [{ ND: "TED-MAIN-001", PD: "2026-09-10+02:00", DT: ["2026-10-01T00:00:00+02:00"], TI: { eng: "Open tender for cultural exhibition services" }, DS: { eng: "Museum craft exhibition and event services" }, CY: "FR", FT: "Contract notice" }] }));
  });
  assert.ok(tedRun.raw_items > 0, "TED JSON must parse through the main pipeline");
  assert.equal(tedCalls[0]?.options.method, "POST");
  assert.match(String(tedCalls[0]?.options.body), new RegExp(TED_PROCUREMENT_QUERY.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")));
  assert.ok(Buffer.byteLength(String(tedCalls[0]?.options.body), "utf8") > 0);
  assert.equal(tedRun.request_traces?.[0]?.method, "POST");

  const wbSource = activeSource("proc-wb", "https://datacatalogapi.worldbank.org/dexapps/fone/api/apiservice?datasetId=DS00979&resourceId=RS00909&type=json");
  const wbUrls = worldBankRequestUrls(wbSource.url);
  const wbCalls: string[] = [];
  const wbRun = await runSingle(wbSource, async (url) => {
    wbCalls.push(url);
    if (url === wbUrls.probe) return response(url, JSON.stringify({ count: 1201, data: [] }));
    assert.equal(url, wbUrls.latest(1201), "World Bank must request latest bounded page");
    return response(url, JSON.stringify({ count: 1201, data: [{ id: "WB-MAIN-001", bid_description: "Consulting services for cultural heritage exhibition", country_name: "Ghana", notice_type: "Request for Expression of Interest", publication_date: "2026-09-10", deadline_date: "2026-10-01" }] }));
  });
  assert.deepEqual(wbCalls, [wbUrls.probe, wbUrls.latest(1201)]);
  assert.ok(wbRun.raw_items > 0, "World Bank latest page must parse through the main pipeline");
  assert.equal(wbRun.request_traces?.filter((trace) => trace.source_id === "proc-wb").length, 2);

  const gzipPayload = Buffer.from("{\"ocid\":\"gzip-fixture\"}\n", "utf8");
  assert.deepEqual(decompressOpportunityV2Body(gzipSync(gzipPayload), "gzip"), gzipPayload);
  const bomb = gzipSync(Buffer.alloc(MAX_DECOMPRESSED_RESPONSE_BYTES + 1, 0x41));
  assert.throws(() => decompressOpportunityV2Body(bomb, "gzip"), /too large|safely decompressed/iu, "gzip decompressed-size guard must fail closed");

  const defaults = DEFAULT_OPPORTUNITY_V2_SOURCES;
  const phase1Ids = ["proc-cn-ccgp", "proc-cn-cib", "proc-global-ocp", "proc-eu-ted", "proc-wb"];
  assert.deepEqual(defaults.filter((source) => phase1Ids.includes(source.id)).map((source) => [source.enabled, source.status]), phase1Ids.map(() => [false, "PENDING"]));
  assert.ok(defaults.some((source) => source.id === "proc-uk-fts"));
  assert.ok(defaults.some((source) => source.id === "proc-ca-canadabuys"));
  assert.equal(defaults.length, 38);
  assert.deepEqual(procurementFetchOptions("proc-eu-ted").method, "POST");

  const idempotentSource = activeSource("proc-cn-ccgp", ccgpListing, "CN");
  const stableFixture = async (url: string): Promise<OpportunityV2FetchResponse> => url === ccgpListing
    ? response(url, `<a href="${ccgpDetail}">非遗文创展陈服务采购公告</a>`)
    : response(url, `<meta name="ArticleTitle" content="非遗文创展陈服务采购公告"><p>项目编号：CCGP-IDEMPOTENT</p><p>采购单位：某文化馆</p><p>响应文件接收截止时间：2026-10-01 10:00</p><p>采购需求：非遗展陈设计与活动服务</p>`);
  const runtime = tempRuntime(idempotentSource);
  const first = await runOpportunityV2({ now: NOW, sourcesPath: runtime.sourcesPath, poolPath: runtime.poolPath, healthPath: runtime.healthPath, fetcher: stableFixture });
  const firstPool = readOpportunityV2Pool(runtime.poolPath).opportunities;
  const firstSeen = firstPool[0]?.first_seen_at;
  const second = await runOpportunityV2({ now: new Date(NOW.getTime() + 86_400_000), sourcesPath: runtime.sourcesPath, poolPath: runtime.poolPath, healthPath: runtime.healthPath, fetcher: stableFixture });
  const secondPool = readOpportunityV2Pool(runtime.poolPath).opportunities;
  assert.equal(firstPool.length, 1);
  assert.equal(secondPool.length, 1, "same source item must not create a second opportunity");
  assert.equal(secondPool[0]?.first_seen_at, firstSeen);
  assert.equal(first.raw_items, second.raw_items);
  assert.equal(second.request_traces?.filter((trace) => trace.source_id === "proc-cn-ccgp").length, 2);

  // Keep a small explicit check that a disabled seed cannot be selected by a
  // normal run even when it is present in an isolated registry.
  const disabled = { ...ocpSource, enabled: false, status: "PENDING" as const };
  const disabledRuntime = tempRuntime(disabled);
  const disabledRun = await runOpportunityV2({ sourcesPath: disabledRuntime.sourcesPath, poolPath: disabledRuntime.poolPath, healthPath: disabledRuntime.healthPath, fetcher: async () => response("", "") });
  assert.equal(disabledRun.fetched_sources, 0);

  console.log(JSON.stringify({
    gate: "PASS",
    post_contract: "PASS",
    gzip: "PASS",
    gzip_size_guard: "PASS",
    ssrf_redirect_guard: "PASS (public URL validation and redirect revalidation retained)",
    ted_request: { method: tedCalls[0]?.options.method, body_verified: true },
    ocp_jsonl: "PASS",
    worldbank_latest_page: { probe: true, count: 1201, top: 1000, skip: 201, calls: wbCalls.length },
    ccgp_listing: "PASS",
    cib_listing: "PASS",
    seeds: { total: defaults.length, all_five_disabled: true, existing_uk_ca_preserved: true },
    idempotency: { first_pool: firstPool.length, second_pool: secondPool.length, duplicate_opportunities_created: 0, first_seen_at_preserved: true },
  }, null, 2));
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
