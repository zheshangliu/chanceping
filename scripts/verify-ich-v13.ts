import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { extractDeadlineText, parseDateText } from "../src/ich/aggregation/adapters/common";
import { isLikelyGenericNavigationItem, parseGenericListing } from "../src/ich/aggregation/adapters/generic-listing";
import { paginationStartPage, runOpportunityV2 } from "../src/opportunity-v2/pipeline";
import { ichPagesRoutes } from "../src/api/routes/ich-pages";
import { isRealCompetitionMemoItem } from "../src/opportunity-v2/memo";
import type { OpportunityV2, OpportunityV2Source } from "../src/opportunity-v2/types";

const NOW = new Date("2026-09-09T00:00:00.000Z");

function dateDay(value: string | null): string | null {
  return value ? value.slice(0, 10) : null;
}

function source(id = "fixture-source", region: "CN" | "GLOBAL" = "GLOBAL"): OpportunityV2Source {
  return { id, name: "Fixture source", url: "https://example.com/opportunities", region, priority: "P0", types: ["competition"], radars: ["ich"], enabled: true, status: "ACTIVE", last_fetch_at: NOW.toISOString() };
}

function item(id: string, title: string, overrides: Partial<OpportunityV2> = {}): OpportunityV2 {
  return {
    id, title, summary: "A real judged opportunity for makers.", source_id: "fixture-source", source_name: "Fixture source", source_url: "https://example.com/opportunities", detail_url: `https://example.com/opportunities/${id}`, category: "competition", region: "GLOBAL", tags: ["craft"], deadline: "2026-12-01T23:59:00.000Z", status: "CURRENT", first_seen_at: NOW.toISOString(), last_seen_at: NOW.toISOString(), discovered_by_sources: ["fixture-source"], radar_relevance: "RELEVANT", ...overrides,
  };
}

async function main(): Promise<void> {
  const deadlineCases: Array<[string, string, string]> = [
    ["2026比赛【截稿至7月5日】", "2026比赛【截稿至7月5日】", "2026-07-05"],
    ["2026比赛【截稿至 8月20日】", "2026比赛【截稿至 8月20日】", "2026-08-20"],
    ["比赛｜申请截止：2026年08月28日", "申请截止：2026年08月28日", "2026-08-28"],
    ["比赛｜申请截止：2026-08-28", "申请截止：2026-08-28", "2026-08-28"],
    ["比赛｜截止10月20日", "比赛｜截止10月20日", "2026-10-20"],
    ["征集时间范围", "征集时间：2026-07-01至2026-10-15", "2026-10-15"],
  ];
  for (const [label, raw, expected] of deadlineCases) {
    const extracted = extractDeadlineText(raw);
    assert.ok(extracted, `${label}: deadline text should be extracted`);
    assert.equal(dateDay(parseDateText(extracted, NOW, raw)), expected, `${label}: parsed deadline`);
  }

  const listing = parseGenericListing(`
    <a href="mailto:hello@example.com">hello@example.com</a>
    <a href="https://example.com/privacy">Privacy Policy</a>
    <a href="https://example.com/news/real-competition">2026非遗文创设计大赛【截稿时间：2026-10-15】</a>
  `, "https://example.com/opportunities", [], "fixture-generic");
  assert.equal(listing.length, 1, "generic listing keeps one real opportunity");
  assert.equal(dateDay(listing[0].deadline_at), "2026-10-15", "generic listing parses explicit deadline");
  assert.equal(isLikelyGenericNavigationItem("hello@example.com", "mailto:hello@example.com"), true, "mailto is navigation noise");
  assert.equal(isLikelyGenericNavigationItem("Privacy Policy", "https://example.com/privacy"), true, "privacy is navigation noise");
  assert.equal(isLikelyGenericNavigationItem("2026非遗文创设计大赛", "https://example.com/news/real-competition"), false, "real competition under /news is retained");

  const falseTitles = ["Privacy Policy", "Terms of use", "Press & Media", "Renew my Membership", "Submit a listing", "Advertising", "Archives", "中文 zh", "Artist-in-Residence – Glen Arbor Arts Center"];
  for (const title of falseTitles) assert.equal(isRealCompetitionMemoItem(item(`false-${title}`, title, { detail_url: "https://example.com/about" })), false, `${title} is not a competition`);
  assert.equal(isRealCompetitionMemoItem(item("oak", "The Oak Moon Pavilion", { detail_url: "https://example.com/events/craft-design-competition-2027" })), true, "real event competition is retained");
  assert.equal(isRealCompetitionMemoItem(item("news-real", "2026非遗文创设计大赛", { detail_url: "https://example.com/news/real-competition" })), true, "real /news competition is retained");

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "chanceping-ich-v13-"));
  const healthPath = path.join(temp, "source-health.json");
  fs.writeFileSync(healthPath, JSON.stringify({ sources: [
    { source_id: "cfw-cultural-ip", fetched_at: NOW.toISOString(), ok: true, http_status: 200, items_seen: 4, error: null, format: "HTML_LISTING", partial: true, next_page: 13 },
    { source_id: "1zj-cultural-competition", fetched_at: NOW.toISOString(), ok: true, http_status: 200, items_seen: 4, error: null, format: "HTML_LISTING", partial: true, next_page: 66 },
  ] }));
  assert.equal(paginationStartPage({ ...source("cfw-cultural-ip"), url: "https://example.com/cfw" }, healthPath), 13, "CFW resumes after its budget");
  assert.equal(paginationStartPage({ ...source("1zj-cultural-competition"), url: "https://example.com/1zj" }, healthPath), 66, "1zj resumes after its budget");

  const runSource = source("fixture-run-source");
  const sourcesPath = path.join(temp, "sources.json");
  const poolPath = path.join(temp, "opportunities.json");
  const runHealthPath = path.join(temp, "run-health.json");
  fs.writeFileSync(sourcesPath, JSON.stringify({ schema_version: "chanceping-opportunity-v2.sources.v1", updated_at: NOW.toISOString(), sources: [runSource] }));
  fs.writeFileSync(poolPath, JSON.stringify({ schema_version: "chanceping-opportunity-v2.v1", updated_at: NOW.toISOString(), opportunities: [] }));
  const fetcher = async (url: string) => url.includes("/events/real-competition")
    ? { status: 200, final_url: url, text: "<html><title>Real Craft Competition</title><p>Application deadline: 15 Oct 2026</p></html>" }
    : { status: 200, final_url: url, text: '<a href="https://example.com/events/real-competition">Real Craft Competition 2026</a>' };
  const run = await runOpportunityV2({ now: NOW, fetcher, sourcesPath, poolPath, healthPath: runHealthPath });
  assert.equal(run.pool_items, 1, "detail enrichment inserts one item");
  const enriched = JSON.parse(fs.readFileSync(poolPath, "utf8")).opportunities[0] as OpportunityV2;
  assert.equal(dateDay(enriched.deadline), "2026-10-15", "detail enrichment backfills deadline");
  assert.ok(["found", "found_detail"].includes(enriched.deadline_resolution ?? ""), "detail enrichment records resolution");

  const apiSource = source();
  const apiSourcesPath = path.join(temp, "api-sources.json");
  const apiPoolPath = path.join(temp, "api-pool.json");
  const apiItems = [
    item("craft", "Craft Arts Competition", { directions: ["craft_arts"], work_formats: ["material_craft"] }),
    item("design", "Cultural Design Competition", { directions: ["cultural_creative"], work_formats: ["graphic_ip"] }),
    item("unknown", "Competition Without Deadline", { deadline: null, status: "UNKNOWN_DEADLINE", directions: ["craft_arts"] }),
    item("policy", "Funding Programme", { category: "policy_funding" }),
    item("locationless", "Real Competition Without Location", { event_location: null }),
  ];
  fs.writeFileSync(apiSourcesPath, JSON.stringify({ schema_version: "chanceping-opportunity-v2.sources.v1", updated_at: NOW.toISOString(), sources: [apiSource] }));
  fs.writeFileSync(apiPoolPath, JSON.stringify({ schema_version: "chanceping-opportunity-v2.v1", updated_at: NOW.toISOString(), opportunities: apiItems }));
  const app = ichPagesRoutes({ opportunityV2: true, opportunityV2SourcesPath: apiSourcesPath, opportunityV2PoolPath: apiPoolPath, now: () => NOW });
  const filtered = await app.request("http://local/memo?direction=craft_arts&work_format=material_craft&sort=nearest");
  assert.equal(filtered.status, 200, "filtered memo responds");
  const filteredHtml = await filtered.text();
  assert.deepEqual([...filteredHtml.matchAll(/data-opportunity-id="([^"]+)"/gu)].map((match) => match[1]), ["craft"], "direction and format filters apply together");
  assert.equal(filteredHtml.includes("赛事所在地"), false, "memo location column removed");
  assert.equal(filteredHtml.includes("地点待补充"), false, "memo location placeholder removed");
  assert.match(filteredHtml, /清空全部筛选/gu);
  assert.match(filteredHtml, /direction=craft_arts/gu);
  assert.match(filteredHtml, /work_format=material_craft/gu);
  const jsonResponse = await app.request("http://local/memo.json?direction=craft_arts&work_format=material_craft&sort=nearest");
  assert.equal(jsonResponse.status, 200, "memo JSON responds");
  const json = await jsonResponse.json() as { items: Array<{ id: string }> };
  const markdownResponse = await app.request("http://local/memo.md?direction=craft_arts&work_format=material_craft&sort=nearest");
  assert.equal(markdownResponse.status, 200, "memo Markdown responds");
  const markdown = await markdownResponse.text();
  assert.deepEqual(json.items.map((entry) => entry.id), ["craft"], "JSON uses same filtered item");
  assert.match(markdown, /\|\s*craft\s*\|/gu);
  const detail = await app.request("http://local/opportunities/craft");
  assert.equal(detail.status, 200, "memo item link opens detail");
  const invalidLocation = await app.request("http://local/memo?event_region=overseas");
  assert.equal(invalidLocation.status, 400, "unsupported location filter is rejected");
  const home = await app.request("http://local/");
  assert.equal(home.status, 200, "home page responds");
  const homeHtml = await home.text();
  assert.equal(homeHtml.includes("赛事所在地"), false, "home has no unsupported location filter");

  console.log(JSON.stringify({
    deadline_cases: deadlineCases.length,
    generic_listing: { kept: listing.length, mailto_blocked: true, navigation_blocked: true, deadline: listing[0].deadline_at?.slice(0, 10) },
    noise_titles_blocked: falseTitles.length,
    pagination_resume: { cfw: 13, one_zj: 66 },
    detail_deadline_backfill: enriched.deadline?.slice(0, 10),
    memo_filters: { ids: json.items.map((entry) => entry.id), location_column_removed: true, json_markdown_consistent: true, detail_click: true, invalid_location_rejected: true },
  }, null, 2));
}

void main();
