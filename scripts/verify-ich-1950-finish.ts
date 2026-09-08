import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ichPagesRoutes } from "../src/api/routes/ich-pages";
import { isLikelyGenericNavigationItem, parseGenericListing } from "../src/ich/aggregation/adapters/generic-listing";
import { extractDeadlineText, parseDateText } from "../src/ich/aggregation/adapters/common";
import { buildOpportunityV2Display, createOpportunityV2Translation, createTranslatedOpportunityV2Translation, filterOpportunityV2Radar, isPublicIp, mergeOpportunityV2, opportunityStatus, readOpportunityV2Pool, runOpportunityV2, writeOpportunityV2Sources } from "../src/opportunity-v2";
import type { OpportunityV2, OpportunityV2Source } from "../src/opportunity-v2/types";

const now = new Date("2026-09-08T00:00:00.000Z");
const source = (id: string, status: OpportunityV2Source["status"] = "ACTIVE"): OpportunityV2Source => ({ id, name: id, url: `https://${id}.example.com/list`, region: "GLOBAL", priority: "P0", types: ["competition"], radars: ["ich"], enabled: status !== "PAUSED", status, last_fetch_at: null });
const item = (id: string, overrides: Partial<OpportunityV2> = {}): OpportunityV2 => ({ id, title: `Craft opportunity ${id}`, summary: "International craft open call", source_id: "fixture", source_name: "Fixture", source_url: "https://fixture.example.com/list", detail_url: `https://fixture.example.com/${id}`, category: "competition", region: "GLOBAL", tags: ["craft"], deadline: "2026-12-20T23:59:00.000Z", status: "CURRENT", first_seen_at: now.toISOString(), last_seen_at: now.toISOString(), discovered_by_sources: ["fixture"], radar_relevance: "RELEVANT", ...overrides });

async function main(): Promise<void> {
  assert.equal(isPublicIp("::ffff:127.0.0.1"), false);
  assert.equal(isPublicIp("::ffff:7f00:1"), false);
  assert.equal(isPublicIp("::ffff:8.8.8.8"), true);
  assert.equal(isLikelyGenericNavigationItem("hello@example.com", "mailto:hello@example.com"), true);
  assert.equal(isLikelyGenericNavigationItem("Podcast", "https://example.com/podcast"), true);

  const deadlineCases = [
    ["2026比赛【截稿至7月5日】", "2026-07-05T23:59:00.000Z"],
    ["2026比赛【截稿至 8月20日】", "2026-08-20T23:59:00.000Z"],
    ["比赛｜申请截止：2026年08月28日", "2026-08-28T23:59:00.000Z"],
    ["比赛｜申请截止：2026-08-28", "2026-08-28T23:59:00.000Z"],
    ["比赛｜申请截止：2026‑08‑28", "2026-08-28T23:59:00.000Z"],
    ["比赛｜截止10月20日", "2026-10-20T23:59:00.000Z"],
  ] as const;
  for (const [text, expected] of deadlineCases) {
    const parsed = parseDateText(extractDeadlineText(text), now, text);
    assert.equal(parsed, expected, text);
    assert.equal(opportunityStatus(parsed, now), expected < now.toISOString() ? "EXPIRED" : "CURRENT", text);
  }
  assert.equal(parseDateText("2026-02-30", now, "比赛｜截止2026-02-30"), null);
  assert.equal(opportunityStatus("not-a-date", now), "UNKNOWN_DEADLINE");

  const loewe = item("loewe", { title: "LOEWE FOUNDATION Craft Prize 2027", summary: "€50,000 prize for contemporary craft" });
  const pending = buildOpportunityV2Display(loewe, [createOpportunityV2Translation(loewe, now)]);
  assert.equal(pending.translated, false);
  assert.equal(pending.title, loewe.title);
  const translated = createTranslatedOpportunityV2Translation(loewe, { title_zh: "LOEWE 基金会 2027 工艺奖", summary_zh: "当代工艺奖项，奖金 €50,000。" }, now);
  assert.equal(translated.status, "translated");
  assert.equal(buildOpportunityV2Display(loewe, [translated]).translated, true);

  const fixtureSources = [source("fixture"), source("online")];
  const future = item("future", { starts_at: "2026-12-01T00:00:00.000Z" });
  const unknown = item("unknown", { deadline: null, status: "UNKNOWN_DEADLINE", participation_mode: "unspecified" });
  const online = item("online", { source_id: "online", participation_mode: "online" });
  assert.equal(filterOpportunityV2Radar([future], fixtureSources, { now }).length, 1, "browse includes future-start opportunities");
  assert.equal(filterOpportunityV2Radar([future], fixtureSources, { status: "current", now }).length, 0, "current excludes future-start opportunities");
  assert.equal(filterOpportunityV2Radar([future], fixtureSources, { status: "closing_soon", now }).length, 0, "closing excludes future-start opportunities");
  assert.deepEqual(new Set(filterOpportunityV2Radar([unknown, online], fixtureSources, { now }).map((entry) => entry.id)), new Set(["unknown", "online"]));

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "chanceping-ich-1950-finish-"));
  const sourcesPath = path.join(temp, "sources.json");
  const poolPath = path.join(temp, "pool.json");
  const healthPath = path.join(temp, "health.json");
  const pagedSource = { ...source("cfw-cultural-ip", "PENDING"), region: "CN" as const, url: "https://cfw-cultural-ip.example.com/list?page=1" };
  writeOpportunityV2Sources([pagedSource], sourcesPath);
  fs.writeFileSync(poolPath, JSON.stringify({ schema_version: "chanceping-opportunity-v2.v1", updated_at: now.toISOString(), opportunities: [] }));
  const paged = await runOpportunityV2({ sourcesPath, poolPath, healthPath, now, fetcher: async (url) => {
    if (url.includes("page=2")) throw new Error("simulated middle-page failure");
    return { status: 200, final_url: url, text: `<a href="https://cfw-cultural-ip.example.com/call/1">Craft call 2027</a><a href="https://cfw-cultural-ip.example.com/list?page=2">Next</a>` };
  }});
  assert.equal(paged.successful_sources, 1);
  assert.equal(paged.source_health[0]?.partial, true);
  assert.equal(paged.source_health[0]?.next_page, 2);

  const pages = ichPagesRoutes({ opportunityV2: true, opportunityV2SourcesPath: sourcesPath, opportunityV2PoolPath: poolPath });
  const page = await pages.request("http://localhost/?q=craft&direction=craft_arts&region=overseas");
  const html = await page.text();
  assert.equal(page.status, 200);
  assert.match(html, /name="category"/u);
  assert.match(html, /name="direction" value="craft_arts"/u);
  assert.match(html, /name="region" value="overseas"/u);
  const memo = await pages.request("http://localhost/memo");
  assert.equal(memo.status, 200);
  assert.match(await memo.text(), /赛事备忘录/u);
  console.log(JSON.stringify({ ok: true, checks: ["date-forms-and-invalid-date", "mapped-ipv6-ssrf", "no-fake-translation-fallback", "browse-current-closing-semantics", "partial-pagination-health", "search-condition-preservation", "memo-route" ] }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
