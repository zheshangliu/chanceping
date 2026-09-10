import assert from "node:assert/strict";
import fs from "node:fs";
import { reconcileOpportunityV2Deadlines } from "../src/opportunity-v2/opportunity-pool";
import { filterOpportunityV2Radar, opportunityV2LiveStatus, publicOpportunityV2Deadline, serializeOpportunityV2Public } from "../src/opportunity-v2";
import type { OpportunityV2 } from "../src/opportunity-v2/types";

const unsafeFixture: OpportunityV2 = {
  id: "oppv2_58ab1be328f414b6c6ee937f",
  title: "2026年全国青年建筑与城市AI创意作品征集",
  summary: "【综合设计】 | | 2026年10月15日",
  source_id: "shejijingsai-list",
  source_name: "设计竞赛网",
  source_url: "https://www.shejijingsai.com/liebiao",
  detail_url: "https://www.shejijingsai.com/2026/08/1627353.html",
  category: "competition",
  region: "CN",
  tags: ["征集", "competition"],
  deadline: "2026-10-31T23:59:00.000Z",
  status: "UNKNOWN_DEADLINE",
  first_seen_at: "2026-09-06T07:57:12.839Z",
  last_seen_at: "2026-09-10T02:36:20.339Z",
  discovered_by_sources: ["shejijingsai-list"],
  radar_relevance: "RELEVANT",
  directions: ["integrated_cultural_design"],
  event_location: null,
  participation_scope: "unspecified",
  participation_mode: "unspecified",
  is_long_term: false,
  starts_at: null,
  work_formats: ["video_animation"],
  source_item_id: "6b265717e01f3afeff58166d",
  deadline_text: "2026年10月31日",
  deadline_source_url: "https://www.shejijingsai.com/2026/08/1627353.html",
  deadline_raw_text: "截止日期：2026年10月31日",
  deadline_checked_at: "2026-09-10T02:36:20.339Z",
  deadline_resolution: "date_conflict",
  deadline_kind: "deadline",
  deadline_conflict_unsafe: true,
  encoding_error: false,
  encoding_error_fields: [],
  deadline_conflicts: [],
};

const once = reconcileOpportunityV2Deadlines([unsafeFixture], new Date("2026-09-10T00:00:00.000Z"))[0];
const twice = reconcileOpportunityV2Deadlines([once], new Date("2026-09-10T00:00:00.000Z"))[0];

assert.equal(once.deadline_conflict_unsafe, true, "first reconciliation must preserve unsafe state");
assert.equal(twice.deadline_conflict_unsafe, true, "second reconciliation must preserve unsafe state");

const publicDeadline = publicOpportunityV2Deadline(twice);
assert.equal(publicDeadline.deadline, null, "unsafe public deadline must be null");
assert.equal(publicDeadline.deadline_text, "截止时间待核实", "unsafe public deadline text must be redacted");
assert.equal(publicDeadline.status, "UNKNOWN_DEADLINE", "unsafe public status must be unknown");
const serialized = serializeOpportunityV2Public(twice);
assert.equal(serialized.deadline, null, "public serializer must redact unsafe deadline");
assert.equal(serialized.deadline_text, "截止时间待核实", "public serializer must redact unsafe deadline text");
assert.equal(serialized.status, "UNKNOWN_DEADLINE", "public serializer must redact unsafe status");
assert.equal("deadline_conflicts" in serialized, false, "public serializer must not expose conflict evidence");

const fixtureSource = {
  id: unsafeFixture.source_id,
  name: unsafeFixture.source_name,
  url: unsafeFixture.source_url,
  region: "CN" as const,
  priority: "P0" as const,
  types: ["competition"],
  radars: ["ich"],
  enabled: true,
  status: "ACTIVE" as const,
  last_fetch_at: null,
};
assert.equal(opportunityV2LiveStatus(twice, new Date("2026-09-10T00:00:00.000Z")), "UNKNOWN_DEADLINE");
assert.equal(filterOpportunityV2Radar([twice], [fixtureSource], { include_irrelevant: true, status: "current", now: new Date("2026-09-10T00:00:00.000Z") }).length, 0, "unsafe date must not match current");
assert.equal(filterOpportunityV2Radar([twice], [fixtureSource], { include_irrelevant: true, status: "closing_soon", now: new Date("2026-09-10T00:00:00.000Z") }).length, 0, "unsafe date must not match closing soon");
assert.equal(filterOpportunityV2Radar([twice], [fixtureSource], { include_irrelevant: true, status: "deadline_tbd", now: new Date("2026-09-10T00:00:00.000Z") }).length, 1, "unsafe date must match deadline tbd");

async function runSavedRuntimeShadow(): Promise<void> {
const runtime = process.env.ICH_UNSAFE_DEADLINE_RUNTIME ?? "/tmp/chanceping-runtime-post-deploy-20260910";
const poolFile = JSON.parse(fs.readFileSync(`${runtime}/opportunities.json`, "utf8")) as { opportunities: OpportunityV2[] };
const realItem = poolFile.opportunities.find((item) => item.id === unsafeFixture.id);
assert.ok(realItem, "saved failed-deploy runtime must include the real fixture");
assert.equal(realItem?.deadline_conflict_unsafe, true, "saved failed-deploy fixture must be unsafe");

process.env.CHANCEPING_OPPORTUNITY_V2_POOL_PATH = `${runtime}/opportunities.json`;
process.env.CHANCEPING_OPPORTUNITY_V2_SOURCES_PATH = `${runtime}/sources.json`;
process.env.CHANCEPING_OPPORTUNITY_V2_HEALTH_PATH = `${runtime}/source-health.json`;
process.env.CHANCEPING_OPPORTUNITY_V2_TRANSLATIONS_PATH = `${runtime}/translations.json`;
process.env.NODE_ENV = "test";

const { createApp } = await import("../src/api/app");
const app = createApp();
const query = encodeURIComponent(unsafeFixture.title);
async function get(path: string): Promise<{ status: number; text: string; json: any }> {
  const response = await app.request(`http://localhost${path}`);
  const text = await response.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* html/markdown */ }
  return { status: response.status, text, json };
}

const home = await get(`/ich?q=${query}`);
assert.equal(home.status, 200);
const memoHtml = await get(`/ich/memo?q=${query}`);
const memoJson = await get(`/ich/memo.json?q=${query}`);
const memoMarkdown = await get(`/ich/memo.md?q=${query}`);
const detail = await get(`/ich/opportunities/${encodeURIComponent(unsafeFixture.id)}`);
const radarApi = await get(`/api/opportunity-v2/radar?include_uncertain=true&q=${query}`);
const opportunityApi = await get(`/api/opportunity-v2/opportunities?include_uncertain=true&q=${query}`);
const detailApi = await get(`/api/opportunity-v2/opportunities/${encodeURIComponent(unsafeFixture.id)}`);
const fullMemoHtml = await get("/ich/memo");
const fullMemoJson = await get("/ich/memo.json");
const fullMemoMarkdown = await get("/ich/memo.md");
const fullRadar = await get("/api/opportunity-v2/radar?category=competition");
const fullProcurement = await get("/api/opportunity-v2/radar?category=procurement_project");

for (const [name, result] of Object.entries({ memoHtml, memoJson, memoMarkdown, detail, radarApi, opportunityApi, detailApi, fullMemoHtml, fullMemoJson, fullMemoMarkdown, fullRadar, fullProcurement })) {
  assert.equal(result.status, 200, `${name} must be public and healthy`);
}
const memoItem = memoJson.json.items.find((item: any) => item.id === unsafeFixture.id);
assert.ok(memoItem, "unsafe fixture must remain in memo");
assert.equal(memoItem.deadline, null);
assert.equal(memoItem.deadline_text, "截止时间待核实");
assert.equal(memoItem.status, "UNKNOWN_DEADLINE");
const apiItem = opportunityApi.json.opportunities.find((item: any) => item.id === unsafeFixture.id);
assert.ok(apiItem, "unsafe fixture must be addressable by opportunity API query");
assert.equal(apiItem.deadline, null);
assert.equal(apiItem.deadline_text, "截止时间待核实");
assert.equal(detailApi.json.deadline, null);
assert.equal(detailApi.json.deadline_text, "截止时间待核实");
assert.equal(detailApi.json.status, "UNKNOWN_DEADLINE");

const publicExactDeadline = "2026-10-31";
const unsafeExact = (text: string): boolean => text.includes(publicExactDeadline) && !text.includes("截止时间待核实");
const structuredExact = (item: any): boolean => item?.deadline === "2026-10-31T23:59:00.000Z" || item?.deadline_text === "2026年10月31日";
const unsafeFlagged = poolFile.opportunities.filter((item) => item.deadline_conflict_unsafe === true).length;
const counts = {
  unsafe_flagged_items_total: unsafeFlagged,
  unsafe_exact_deadline_in_home: unsafeExact(home.text) ? 1 : 0,
  unsafe_exact_deadline_in_memo_html: unsafeExact(memoHtml.text) ? 1 : 0,
  unsafe_exact_deadline_in_memo_json: structuredExact(memoItem) ? 1 : 0,
  unsafe_exact_deadline_in_memo_markdown: unsafeExact(memoMarkdown.text) ? 1 : 0,
  unsafe_exact_deadline_in_detail: unsafeExact(detail.text) ? 1 : 0,
  unsafe_exact_deadline_in_radar_api: radarApi.json.opportunities.some(structuredExact) ? 1 : 0,
  unsafe_exact_deadline_in_opportunity_api: opportunityApi.json.opportunities.some(structuredExact) || structuredExact(detailApi.json) ? 1 : 0,
};
assert.deepEqual(counts, {
  unsafe_flagged_items_total: unsafeFlagged,
  unsafe_exact_deadline_in_home: 0,
  unsafe_exact_deadline_in_memo_html: 0,
  unsafe_exact_deadline_in_memo_json: 0,
  unsafe_exact_deadline_in_memo_markdown: 0,
  unsafe_exact_deadline_in_detail: 0,
  unsafe_exact_deadline_in_radar_api: 0,
  unsafe_exact_deadline_in_opportunity_api: 0,
});

const sourceFile = JSON.parse(fs.readFileSync(`${runtime}/sources.json`, "utf8")) as { sources: unknown[] };
const scheduler = JSON.parse(fs.readFileSync(`${runtime}/scheduler.json`, "utf8")) as { interval_hours?: number };
const fullMemoIds = fullMemoJson.json.items.map((item: any) => item.id);
const markdownIds = [...fullMemoMarkdown.text.matchAll(/^\|\s*(oppv2_[^|\s]+)\s*\|/gmu)].map((match) => match[1]);
const htmlIds = [...fullMemoHtml.text.matchAll(/data-opportunity-id="(oppv2_[^"]+)"/gu)].map((match) => match[1]);
const memoParity = fullMemoIds.length === markdownIds.length && fullMemoIds.every((id: string, index: number) => markdownIds[index] === id) && htmlIds.every((id, index) => fullMemoIds[index] === id);
const loeweCount = fullMemoJson.json.items.filter((item: any) => /loewe foundation.*craft prize|craft prize 2027/iu.test(item.title)).length;
const publicEncodingErrors = [home.text, memoHtml.text, memoMarkdown.text, detail.text].filter((text) => text.includes("�")).length;
const procurementLeakage = fullProcurement.json.total;
console.log(JSON.stringify({
  reconciliation_idempotence: "PASS",
  real_fixture: { internal_deadline: realItem?.deadline ?? null, internal_unsafe: realItem?.deadline_conflict_unsafe === true, public_memo_deadline: memoItem.deadline, public_radar_api_deadline: radarApi.json.opportunities.find((item: any) => item.id === unsafeFixture.id)?.deadline ?? null, public_detail_deadline: detailApi.json.deadline_text },
  ...counts,
  public_competition: fullRadar.json.total,
  memo_total: fullMemoJson.json.total,
  memo_parity: memoParity,
  loewe: loeweCount,
  encoding_public: publicEncodingErrors,
  procurement_public: procurementLeakage,
  sources: sourceFile.sources.length,
  scheduler_interval_hours: scheduler.interval_hours,
}, null, 2));
console.log("unsafe deadline public redaction regression: PASS");
}

runSavedRuntimeShadow().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
