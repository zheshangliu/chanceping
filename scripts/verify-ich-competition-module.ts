import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Hono } from "hono";
import { classifyCategory } from "../src/ich/aggregation/adapters/common";
import { classifyV2Dimensions } from "../src/opportunity-v2/keywords";
import { deduplicateOpportunityV2 } from "../src/opportunity-v2/opportunity-pool";
import { filterOpportunityV2Radar } from "../src/opportunity-v2/radar-view";
import { buildOpportunityV2SourceOverview } from "../src/opportunity-v2/source-overview";
import { isPublicHttpUrl } from "../src/opportunity-v2/source-pool";
import type { OpportunityV2, OpportunityV2Source } from "../src/opportunity-v2/types";
import { ichPagesRoutes } from "../src/api/routes/ich-pages";
import { opportunityV2Routes } from "../src/api/routes/opportunity-v2";

const source: OpportunityV2Source = { id: "fixture", name: "Fixture", url: "https://example.com", region: "CN", priority: "P0", types: ["competition"], radars: ["ich"], enabled: true, status: "ACTIVE", last_fetch_at: null };
function item(overrides: Partial<OpportunityV2> = {}): OpportunityV2 { return { id: "fixture-item", title: "非遗文创赛事", summary: "面向全国在线提交", source_id: source.id, source_name: source.name, source_url: source.url, detail_url: "https://example.com/item", category: "competition", region: "CN", tags: ["非遗"], deadline: null, status: "UNKNOWN_DEADLINE", first_seen_at: "2026-09-01T00:00:00.000Z", last_seen_at: "2026-09-08T00:00:00.000Z", discovered_by_sources: [source.id], radar_relevance: "RELEVANT", ...overrides }; }

async function main(): Promise<void> {
assert.equal(classifyCategory(null, "LOEWE Craft Prize 2027 Open Call"), "competition");
assert.equal(classifyCategory(null, "国际工艺驻地 fellowship"), "international");
assert.equal(classifyCategory(null, "国际设计大赛"), "competition");
const dimensions = classifyV2Dimensions("非遗文创产品设计大赛", "面向全国，线上提交", "competition");
assert(dimensions.directions.includes("ich_innovation"));
assert(dimensions.directions.includes("cultural_creative"));
assert(dimensions.work_formats.includes("product_design"));
assert.equal(dimensions.participation_scope, "nationwide");
assert.equal(dimensions.participation_mode, "online");

const now = new Date("2026-09-08T00:00:00+08:00");
assert.equal(filterOpportunityV2Radar([item({ deadline: "2026-09-07T23:59:00+08:00" })], [source], { now }).length, 0);
assert.equal(filterOpportunityV2Radar([item({ deadline: "2026-09-20T23:59:00+08:00" })], [source], { status: "closing_soon", now }).length, 1);
assert.equal(filterOpportunityV2Radar([item({ is_long_term: true })], [source], { status: "long_term", now }).length, 1);
assert.equal(filterOpportunityV2Radar([item({ event_location: "广州" })], [source], { event_region: "mainland", now }).length, 1);

const loeweA = item({ id: "a", title: "LOEWE FOUNDATION Craft Prize 2027", source_id: "loewe-craft-prize", source_name: "LOEWE", discovered_by_sources: ["loewe-craft-prize"] });
const loeweB = item({ id: "b", title: "Loewe Foundation 2027 Craft Prize", source_id: "asef-culture360-opportunities", source_name: "ASEF", discovered_by_sources: ["asef-culture360-opportunities"] });
const merged = deduplicateOpportunityV2([loeweA, loeweB]);
assert.equal(merged.opportunities.length, 1);
assert.deepEqual(new Set(merged.opportunities[0].discovered_by_sources), new Set(["loewe-craft-prize", "asef-culture360-opportunities"]));
assert.equal(isPublicHttpUrl("http://127.0.0.1:8080"), false);
assert.equal(isPublicHttpUrl("https://example.com"), true);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "chanceping-ich-module-"));
const sourcesPath = path.join(dir, "sources.json");
const poolPath = path.join(dir, "opportunities.json");
const healthPath = path.join(dir, "source-health.json");
fs.writeFileSync(sourcesPath, JSON.stringify({ sources: [source] }));
fs.writeFileSync(poolPath, JSON.stringify({ schema_version: "chanceping-opportunity-v2.v1", updated_at: now.toISOString(), opportunities: [item()] }));
fs.writeFileSync(healthPath, JSON.stringify({ sources: [{ source_id: source.id, fetched_at: now.toISOString(), ok: true, http_status: 200, items_seen: 1, error: null, format: "HTML_LISTING" }] }));
const overview = buildOpportunityV2SourceOverview({ sourcesPath, poolPath, healthPath });
assert.equal(overview.summary.registered, 1);
assert.equal(overview.rows[0].current_contribution, 1);

const api = opportunityV2Routes({ sourcesPath, poolPath, healthPath, adminToken: "secret" });
const denied = await api.request("http://localhost/sources", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Bad", url: "https://example.com", region: "CN", priority: "P0", types: ["competition"], radars: ["ich"] }) });
assert.equal(denied.status, 403);
const overviewResponse = await api.request("http://localhost/sources/overview");
assert.equal(overviewResponse.status, 200);

const pages = ichPagesRoutes({ opportunityV2: true, opportunityV2SourcesPath: sourcesPath, opportunityV2PoolPath: poolPath });
const page = await pages.request("http://localhost/?direction=ich_innovation");
const html = await page.text();
assert.equal(page.status, 200);
assert.match(html, /盯非遗/);
assert.match(html, /文创、非遗、手工艺比赛，一站看见/);
assert.match(html, /AIGC \/ 数字创作/);
assert.match(html, /按 72 小时周期更新/);

console.log(JSON.stringify({ ok: true, checks: ["category", "dimensions", "live status", "cross-source dedup", "ssrf guard", "source overview", "admin write guard", "public old-ui view"] }));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
