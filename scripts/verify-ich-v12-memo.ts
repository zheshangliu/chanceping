import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ichPagesRoutes } from "../src/api/routes/ich-pages";
import { isRealCompetitionMemoItem } from "../src/opportunity-v2";
import type { OpportunityV2, OpportunityV2Source } from "../src/opportunity-v2";

const source: OpportunityV2Source = {
  id: "fixture-source",
  name: "Fixture competition board",
  url: "https://example.com/opportunities",
  region: "GLOBAL",
  priority: "P0",
  types: ["competition"],
  radars: ["ich"],
  enabled: true,
  status: "ACTIVE",
  last_fetch_at: "2026-09-09T00:00:00.000Z",
};

function item(id: string, title: string, deadline: string | null, overrides: Partial<OpportunityV2> = {}): OpportunityV2 {
  return {
    id,
    title,
    summary: "A real judged opportunity for makers.",
    source_id: source.id,
    source_name: source.name,
    source_url: source.url,
    detail_url: `https://example.com/opportunities/${id}`,
    category: "competition",
    region: "GLOBAL",
    tags: ["craft"],
    deadline,
    status: deadline && deadline < "2026-09-09" ? "EXPIRED" : "CURRENT",
    first_seen_at: "2026-09-09T00:00:00.000Z",
    last_seen_at: "2026-09-09T00:00:00.000Z",
    discovered_by_sources: [source.id],
    radar_relevance: "IRRELEVANT",
    event_location: "Scotland",
    ...overrides,
  };
}

async function main(): Promise<void> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "chanceping-ich-v12-"));
  const sourcesPath = path.join(root, "sources.json");
  const poolPath = path.join(root, "opportunities.json");
  const healthPath = path.join(root, "source-health.json");
  const opportunities = [
    item("future-2027", "Future Craft Prize 2027", "2027-03-03T23:59:00.000Z"),
    item("future-2026", "Future Craft Prize 2026", "2026-12-31T23:59:00.000Z"),
    item("future-oct", "Future Craft Prize October", "2026-10-15T23:59:00.000Z"),
    item("event-page", "Craft Design Competition 2027", "2027-01-15T23:59:00.000Z", { detail_url: "https://example.com/events/craft-design-competition-2027" }),
    item("unknown", "Craft Open Call Without Deadline", null),
    item("expired", "Expired Craft Prize", "2026-08-01T23:59:00.000Z", { status: "EXPIRED" }),
    item("directory", "National craft directory", null, { detail_url: "https://example.com/national-directory" }),
  ];
  fs.writeFileSync(sourcesPath, JSON.stringify({ schema_version: "chanceping-opportunity-v2.sources.v1", updated_at: "2026-09-09T00:00:00.000Z", sources: [source] }));
  fs.writeFileSync(poolPath, JSON.stringify({ schema_version: "chanceping-opportunity-v2.v1", updated_at: "2026-09-09T00:00:00.000Z", opportunities }));
  fs.writeFileSync(healthPath, JSON.stringify({ schema_version: "chanceping-opportunity-v2.source-health.v1", updated_at: "2026-09-09T00:00:00.000Z", sources: [{ source_id: source.id, fetched_at: "2026-09-09T00:00:00.000Z", ok: true, http_status: 200, items_seen: 5, error: null, format: "HTML_LISTING", partial: false, next_page: null }] }));
  process.env.CHANCEPING_OPPORTUNITY_V2_HEALTH_PATH = healthPath;

  assert.equal(isRealCompetitionMemoItem(opportunities[0]), true);
  assert.equal(isRealCompetitionMemoItem(opportunities[3]), true);
  assert.equal(isRealCompetitionMemoItem(opportunities[6]), false);
  const app = ichPagesRoutes({ opportunityV2: true, opportunityV2SourcesPath: sourcesPath, opportunityV2PoolPath: poolPath });

  const memo = await app.request("http://local/memo");
  assert.equal(memo.status, 200);
  const html = await memo.text();
  const ids = [...html.matchAll(/data-opportunity-id="([^"]+)"/gu)].map((match) => match[1]);
  assert.deepEqual(ids, ["future-2027", "event-page", "future-2026", "future-oct", "unknown"]);
  assert.equal((html.match(/<table class="ich-memo-table"/gu) ?? []).length, 1);
  assert.equal(html.includes("ich-memo-mobile"), false);
  assert.equal(html.includes("历史机会"), false);
  assert.match(html, /截止日期未注明 · 查看原文/gu);
  assert.match(html, /scope|赛事备忘录/gu);

  const jsonResponse = await app.request("http://local/memo.json");
  assert.equal(jsonResponse.status, 200);
  const json = await jsonResponse.json() as { snapshot_id: string; scope: string; total: number; returned_count: number; truncated: boolean; items: Array<{ id: string }> };
  assert.equal(json.scope, "all_competitions");
  assert.equal(json.total, 5);
  assert.equal(json.returned_count, 5);
  assert.equal(json.truncated, false);
  assert.deepEqual(json.items.map((entry) => entry.id), ids);

  const markdownResponse = await app.request("http://local/memo.md");
  assert.equal(markdownResponse.status, 200);
  const markdown = await markdownResponse.text();
  assert.match(markdown, new RegExp(`snapshot_id: ${json.snapshot_id}`));
  assert.deepEqual([...markdown.matchAll(/\|\s*(future-[^|\s]+|event-page|unknown)\s*\|/gu)].map((match) => match[1]), ids);

  const detail = await app.request("http://local/opportunities/future-2027");
  assert.equal(detail.status, 200);
  const detailHtml = await detail.text();
  assert.match(detailHtml, /打开赛事来源页面/gu);
  assert.equal(detailHtml.includes("https://example.com/opportunities\""), false);
  assert.equal((detailHtml.match(/ich-source-primary/gu) ?? []).length, 1);

  const sitemap = await app.request("http://local/sitemap.xml");
  assert.equal(sitemap.status, 200);
  const sitemapText = await sitemap.text();
  assert.match(sitemapText, /\/ich\/memo\.json/gu);
  assert.match(sitemapText, /\/ich\/opportunities\/future-2027/gu);
  assert.equal(sitemapText.includes("data/ich-opportunities"), false);

  console.log(JSON.stringify({ memo_rows: ids.length, default_order: ids, json_markdown_snapshot: json.snapshot_id, no_duplicate_dom: true, detail_deep_link: true, sitemap_v2: true }, null, 2));
}

void main();
