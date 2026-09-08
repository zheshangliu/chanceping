import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ichPagesRoutes } from "../src/api/routes/ich-pages";
import { opportunityV2Routes } from "../src/api/routes/opportunity-v2";
import { buildOpportunityV2Display, createOpportunityV2Translation, createTranslatedOpportunityV2Translation, filterOpportunityV2Radar, isPublicHttpUrl, isPublicIp, testOpportunityV2Source, writeOpportunityV2Sources } from "../src/opportunity-v2";
import type { OpportunityV2, OpportunityV2Source } from "../src/opportunity-v2/types";

const source = (id: string, status: OpportunityV2Source["status"] = "ACTIVE"): OpportunityV2Source => ({ id, name: id, url: `https://${id}.example.com/list`, region: "CN", priority: "P0", types: ["competition"], radars: ["ich"], enabled: status !== "PAUSED", status, last_fetch_at: null });
const item = (id: string, overrides: Partial<OpportunityV2> = {}): OpportunityV2 => ({ id, title: `非遗文创赛事 ${id}`, summary: "面向全国，线上提交", source_id: "fixture-a", source_name: "Fixture A", source_url: "https://fixture-a.example.com/list", detail_url: `https://fixture-a.example.com/${id}`, category: "competition", region: "CN", tags: ["非遗"], deadline: "2026-12-20T23:59:00.000Z", status: "CURRENT", first_seen_at: "2026-09-08T00:00:00.000Z", last_seen_at: "2026-09-08T00:00:00.000Z", discovered_by_sources: ["fixture-a"], radar_relevance: "RELEVANT", ...overrides });

async function main(): Promise<void> {
  assert.equal(isPublicHttpUrl("http://[::1]:8080"), false);
  assert.equal(isPublicHttpUrl("http://[fc00::1]"), false);
  assert.equal(isPublicHttpUrl("http://169.254.169.254"), false);
  assert.equal(isPublicIp("fe80::1"), false);
  assert.equal(isPublicIp("10.0.0.1"), false);
  assert.equal(isPublicIp("::ffff:127.0.0.1"), false);

  const geo = [item("jp", { event_location: "Tokyo, Japan" }), item("unknown", { event_location: null }), item("cn", { event_location: "广州，中国大陆" })];
  const sources = [source("fixture-a")];
  assert.equal(filterOpportunityV2Radar(geo, sources, { event_region: "overseas" }).map((entry) => entry.id).join(","), "jp");
  assert.equal(filterOpportunityV2Radar(geo, sources, { event_region: "unknown" }).map((entry) => entry.id).join(","), "unknown");
  assert.equal(filterOpportunityV2Radar([item("future", { starts_at: "2026-12-01T00:00:00.000Z" })], sources, { status: "current", now: new Date("2026-09-08T00:00:00.000Z") }).length, 0);

  const loewe = item("loewe", { title: "LOEWE FOUNDATION Craft Prize 2027", summary: "€50,000 prize", source_id: "loewe-craft-prize", source_name: "LOEWE FOUNDATION Craft Prize", region: "GLOBAL", discovered_by_sources: ["loewe-craft-prize"] });
  const pending = buildOpportunityV2Display(loewe, [createOpportunityV2Translation(loewe)]);
  assert.equal(pending.translated, false);
  assert.equal(pending.title, loewe.title);
  const translated = createTranslatedOpportunityV2Translation(loewe, { title_zh: "LOEWE 基金会 2027 工艺奖", summary_zh: "奖金 €50,000。" });
  assert.equal(buildOpportunityV2Display(loewe, [translated]).translated, true);

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "chanceping-ich-v11-"));
  const sourcesPath = path.join(temp, "sources.json");
  const poolPath = path.join(temp, "pool.json");
  const many = Array.from({ length: 205 }, (_, index) => item(`memo-${index}`));
  writeOpportunityV2Sources([source("fixture-a")], sourcesPath);
  fs.writeFileSync(poolPath, JSON.stringify({ schema_version: "chanceping-opportunity-v2.v1", updated_at: new Date().toISOString(), opportunities: many }));
  const pages = ichPagesRoutes({ opportunityV2: true, opportunityV2SourcesPath: sourcesPath, opportunityV2PoolPath: poolPath });
  const memoResponse = await pages.request("http://localhost/memo");
  const memoHtml = await memoResponse.text();
  assert.equal(memoResponse.status, 200);
  assert.match(memoHtml, /赛事备忘录/u);
  assert.equal((memoHtml.match(/<tr>/gu) ?? []).length, 206, "memo loads the full 205-row fixture plus header row");
  assert.doesNotMatch(memoHtml, /加载更多|第 2 页/u);
  const detailResponse = await pages.request("http://localhost/opportunities/memo-0");
  const detailHtml = await detailResponse.text();
  assert.equal(detailResponse.status, 200);
  assert.match(detailHtml, /赛事信息/u);
  assert.match(detailHtml, /来源原文/u);

  const healthPath = path.join(temp, "health.json");
  const healthSourcesPath = path.join(temp, "health-sources.json");
  writeOpportunityV2Sources([source("fixture-a"), source("fixture-b")], healthSourcesPath);
  const rss = "<rss><channel><item><title>Craft open call</title><link>https://example.com/call</link><description>Deadline 20 October 2026</description></item></channel></rss>";
  const fetcher = async () => ({ status: 200, final_url: "https://example.com/list", text: rss });
  await testOpportunityV2Source({ sourceId: "fixture-a", sourcesPath: healthSourcesPath, healthPath, fetcher });
  await testOpportunityV2Source({ sourceId: "fixture-b", sourcesPath: healthSourcesPath, healthPath, fetcher });
  const health = JSON.parse(fs.readFileSync(healthPath, "utf8")) as { sources: Array<{ source_id: string }> };
  assert.deepEqual(health.sources.map((row) => row.source_id).sort(), ["fixture-a", "fixture-b"]);

  const denied = opportunityV2Routes({ sourcesPath, poolPath, adminRequired: true });
  const deniedResponse = await denied.request("http://localhost/sources", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Denied", url: "https://example.com", region: "CN", priority: "P0", types: ["competition"], radars: ["ich"] }) });
  assert.equal(deniedResponse.status, 503);
  const adminPage = await (await (await import("../src/api/routes/opportunity-v2-pages")).opportunityV2PagesRoutes().request("http://localhost/admin/sources")).text();
  assert.match(adminPage, /管理员凭据/u);
  console.log(JSON.stringify({ ok: true, checks: ["fail-closed-admin", "ipv4-ipv6-ssrf", "event-geo", "browse-current-status", "memo-205-full-load", "detail-route", "health-ledger-merge", "no-fake-foreign-fallback"], translation_provider_required: true }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
