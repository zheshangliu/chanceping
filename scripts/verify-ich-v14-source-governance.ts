import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildOpportunityV2SourceOverview, filterOpportunityV2Radar, publicOpportunityV2Deadline, readOpportunityV2Pool, readOpportunityV2Sources, runOpportunityV2, serializeOpportunityV2Public, writeOpportunityV2Pool, writeOpportunityV2Sources } from "../src/opportunity-v2";
import { opportunityV2Routes } from "../src/api/routes/opportunity-v2";
import { getOpportunityV2SourcePermission, getOpportunityV2SourcePermissionEvidence, isOpportunityV2PublicCopyAllowed, isOpportunityV2SourceCollectionAllowed, sourceFreshness } from "../src/opportunity-v2/source-governance";
import { OpportunityV2FetchBudget } from "../src/opportunity-v2/source-fetch-budget";
import { buildCanonicalOpportunityDisplayGroups } from "../src/opportunity-v2/canonical-display-groups";
import type { OpportunityV2, OpportunityV2Source } from "../src/opportunity-v2/types";

function source(id: string, url = `https://${id}.example.test/list`): OpportunityV2Source {
  return { id, name: id, url, region: "GLOBAL", priority: "P1", types: ["competition"], radars: ["ich"], enabled: true, status: "ACTIVE", last_fetch_at: null };
}

function opportunity(id: string, sourceId: string, detailUrl: string, discovered = [sourceId]): OpportunityV2 {
  return {
    id, title: `Open Call ${id}`, summary: "A real craft opportunity.", source_id: sourceId, source_name: sourceId,
    source_url: `https://${sourceId}.example.test/list`, detail_url: detailUrl, category: "competition", region: "GLOBAL",
    tags: ["craft"], deadline: null, status: "CURRENT", first_seen_at: "2026-10-01T00:00:00.000Z",
    last_seen_at: "2026-10-01T00:00:00.000Z", discovered_by_sources: discovered, radar_relevance: "RELEVANT",
  } as OpportunityV2;
}

function writeSources(filePath: string, sources: OpportunityV2Source[]): void {
  writeOpportunityV2Sources(sources, filePath);
}

async function main(): Promise<void> {
  const now = new Date("2026-10-05T12:00:00.000Z");
  assert.equal(getOpportunityV2SourcePermission("artconnect-opportunities"), "COMPLIANCE_HOLD");
  assert.equal(getOpportunityV2SourcePermissionEvidence("artconnect-opportunities").url, "https://www.magazine.artconnect.com/terms");
  assert.match(getOpportunityV2SourcePermissionEvidence("artconnect-opportunities").basis, /prior written permission|事先书面许可/iu);
  assert.equal(isOpportunityV2SourceCollectionAllowed("artconnect-opportunities"), false);
  assert.equal(getOpportunityV2SourcePermission("unreviewed-public-source"), "NOT_REVIEWED");
  assert.equal(isOpportunityV2SourceCollectionAllowed("unreviewed-public-source"), true, "the audit must not silently claim unreviewed sources are licensed");
  assert.equal(sourceFreshness("2026-10-02T05:59:59.999Z", now).status, "STALE", "ACTIVE/scheduled does not mean fresh beyond 72h+6h");
  assert.equal(sourceFreshness(null, now).status, "NEVER_SUCCEEDED");
  assert.equal(sourceFreshness("not-a-date", now).status, "UNKNOWN");
  let fakeNow = 0;
  const starts: number[] = [];
  let activeForHost = 0;
  let maxConcurrentForHost = 0;
  const fetchBudget = new OpportunityV2FetchBudget({ maxRequestsPerHost: 2, minIntervalMs: 1_000, now: () => fakeNow, sleep: async (ms) => { fakeNow += ms; } });
  await Promise.all([0, 1].map(() => fetchBudget.run("same.example", async () => {
    activeForHost += 1;
    maxConcurrentForHost = Math.max(maxConcurrentForHost, activeForHost);
    starts.push(fakeNow);
    await Promise.resolve();
    activeForHost -= 1;
  })));
  assert.deepEqual(starts, [0, 1_000]);
  assert.equal(maxConcurrentForHost, 1, "same-host requests serialize even when invoked concurrently");
  await assert.rejects(() => fetchBudget.run("same.example", async () => undefined), /host request budget/u);

  const loeweOfficial = opportunity("loewe-official", "loewe-craft-prize", "https://craftprize.loewe.com/zh/craftprize2027", ["loewe-craft-prize", "asef-culture360-opportunities"]);
  loeweOfficial.source_item_id = "9c506728be468703d19d6d09";
  loeweOfficial.title = "LOEWE FOUNDATION Craft Prize 2027";
  loeweOfficial.summary = "Official LOEWE FOUNDATION Craft Prize 2027 application page.";
  loeweOfficial.organizer = "LOEWE FOUNDATION";
  loeweOfficial.application_url = "https://craftprize.loewe.com/zh/craftprize2027";
  loeweOfficial.deadline = "2026-10-15T23:59:00.000Z";
  const loeweCraftScotland = opportunity("loewe-cs", "craft-scotland-opportunities", "https://www.craftscotland.org/community/opportunity/loewe-foundation-craft-prize-2027");
  loeweCraftScotland.source_item_id = "43885b166107ea794022fea4";
  loeweCraftScotland.title = "Awards & Competitions LOEWE FOUNDATION Craft Prize 2027";
  loeweCraftScotland.summary = "Submissions to the 10th edition of the LOEWE FOUNDATION Craft Prize are now open. €50,000 prize.";
  loeweCraftScotland.deadline = loeweOfficial.deadline;
  const loeweOpenCalls = opportunity("loewe-open-calls", "opencalls-ai", "https://opencalls.ai/opencalls/loewe-foundation-craft-prize-2027-a8bf1492-ae36-4af9-8ab6-e9d71b3d468f");
  loeweOpenCalls.source_item_id = "48039ca6f2f38a96c4829f9c";
  loeweOpenCalls.title = "Award LOEWE FOUNDATION Craft Prize 2027";
  loeweOpenCalls.summary = "The LOEWE FOUNDATION Craft Prize 2027 invites makers to submit original work.";
  const loeweGroup = buildCanonicalOpportunityDisplayGroups([loeweOfficial, loeweCraftScotland, loeweOpenCalls]);
  assert.equal(loeweGroup.cards.length, 1, "the reviewed same-edition LOEWE set produces one canonical display card");
  assert.equal(loeweGroup.cards[0].id, loeweOfficial.id);
  assert.deepEqual(loeweGroup.groups[0].alias_ids.sort(), [loeweCraftScotland.id, loeweOpenCalls.id].sort());
  assert.deepEqual(loeweGroup.cards[0].discovered_by_sources.sort(), ["asef-culture360-opportunities", "craft-scotland-opportunities", "loewe-craft-prize", "opencalls-ai"].sort());
  const loewePartial = buildCanonicalOpportunityDisplayGroups([loeweOfficial, loeweCraftScotland]);
  assert.equal(loewePartial.cards.length, 2, "incomplete curated membership stays visible rather than being silently merged");
  assert.equal(loewePartial.groups[0].status, "DUPLICATE_REVIEW");
  const loeweNextEdition = { ...loeweOpenCalls, id: "loewe-2028", title: "LOEWE FOUNDATION Craft Prize 2028", summary: "Submissions are open for the 2028 edition." };
  assert.equal(buildCanonicalOpportunityDisplayGroups([loeweOfficial, loeweCraftScotland, loeweNextEdition]).cards.some((card) => card.id === "loewe-2028"), true, "a different edition must not be merged by brand alone");

  const unsafeDate = { ...opportunity("unsafe-application", "independent-source", "https://independent-source.example.test/call"), deadline: "2026-10-31T23:59:00.000Z", deadline_kind: "application_deadline" as const, deadline_conflict_unsafe: true, deadline_conflicts: [{ stored_deadline: "2026-10-31T23:59:00.000Z", conflicting_deadline: "2026-11-20T23:59:00.000Z", evidence: "official application close date", source_url: "https://independent-source.example.test/call" }] };
  assert.deepEqual(publicOpportunityV2Deadline(unsafeDate), { deadline: null, deadline_text: "截止时间待核实", status: "UNKNOWN_DEADLINE", unsafe: true }, "an unsafe application-date conflict cannot produce an exact public deadline");

  const artconnectOnly = opportunity("artconnect-only", "artconnect-opportunities", "https://www.artconnect.com/opportunity/real-craft-call");
  assert.equal(isOpportunityV2PublicCopyAllowed(artconnectOnly), false);
  const independentlySourced = opportunity("multi-source", "independent-source", "https://independent-source.example.test/call", ["independent-source", "artconnect-opportunities"]);
  assert.equal(isOpportunityV2PublicCopyAllowed(independentlySourced), true);
  assert.deepEqual(serializeOpportunityV2Public(independentlySourced).discovered_by_sources, ["independent-source"], "held source identity is retained internally but not advertised as a public evidence contributor");

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ich-v14-source-governance-"));
  const run = async (sourceRow: OpportunityV2Source, body: string, status = 200) => {
    const sourcePath = path.join(tempDir, `${sourceRow.id}-sources.json`);
    const poolPath = path.join(tempDir, `${sourceRow.id}-pool.json`);
    const healthPath = path.join(tempDir, `${sourceRow.id}-health.json`);
    const changeFeedPath = path.join(tempDir, `${sourceRow.id}-changes.json`);
    writeSources(sourcePath, [sourceRow]);
    writeOpportunityV2Pool({ schema_version: "chanceping-opportunity-v2.v1", updated_at: now.toISOString(), opportunities: [] }, poolPath);
    let fetchCount = 0;
    const result = await runOpportunityV2({
      now, sourcesPath: sourcePath, poolPath, healthPath, changeFeedPath,
      fetcher: async (url) => { fetchCount += 1; return { status, final_url: url, text: body }; },
    });
    return { result, fetchCount, sources: readOpportunityV2Sources(sourcePath), pool: readOpportunityV2Pool(poolPath), health: JSON.parse(fs.readFileSync(healthPath, "utf8")).sources[0] };
  };

  const zero = await run(source("zero-rss"), "<rss version=\"2.0\"><channel><title>Updates</title></channel></rss>");
  assert.equal(zero.fetchCount, 1);
  assert.equal(zero.result.successful_sources, 1);
  assert.equal(zero.health.transport_ok, true);
  assert.equal(zero.health.parser_status, "recognized");
  assert.equal(zero.health.ok, true);
  assert.equal(zero.health.items_seen, 0, "empty but valid feed is a successful zero-result run");
  assert.equal(zero.health.reconciliation_status, "complete");
  assert.equal(zero.sources[0].status, "ACTIVE");
  assert.ok(zero.sources[0].last_fetch_at, "successful zero-result runs update fetch freshness");

  const parserFailure = await run(source("unrecognized"), "plain text response without a supported listing format");
  assert.equal(parserFailure.health.transport_ok, true);
  assert.equal(parserFailure.health.parser_status, "unrecognized");
  assert.equal(parserFailure.health.ok, false);
  assert.equal(parserFailure.health.reconciliation_status, "failed");
  assert.equal(parserFailure.sources[0].status, "NEEDS_ADAPTER");
  assert.equal(parserFailure.sources[0].last_fetch_at, null);

  const transportFailure = await run(source("http-failure"), "forbidden", 403);
  assert.equal(transportFailure.health.transport_ok, false);
  assert.equal(transportFailure.sources[0].status, "FAILED");

  const artconnectSourcePath = path.join(tempDir, "artconnect-sources.json");
  const artconnectPoolPath = path.join(tempDir, "artconnect-pool.json");
  const artconnectHealthPath = path.join(tempDir, "artconnect-health.json");
  const artconnectChangePath = path.join(tempDir, "artconnect-change.json");
  writeSources(artconnectSourcePath, [source("artconnect-opportunities", "https://www.artconnect.com/opportunities")]);
  writeOpportunityV2Pool({ schema_version: "chanceping-opportunity-v2.v1", updated_at: now.toISOString(), opportunities: [artconnectOnly] }, artconnectPoolPath);
  let artconnectFetches = 0;
  await runOpportunityV2({ now, sourcesPath: artconnectSourcePath, poolPath: artconnectPoolPath, healthPath: artconnectHealthPath, changeFeedPath: artconnectChangePath, fetcher: async (url) => { artconnectFetches += 1; return { status: 200, final_url: url, text: "<rss/>" }; } });
  assert.equal(artconnectFetches, 0, "COMPLIANCE_HOLD blocks automated collection without disabling/deleting its registry identity");
  assert.equal(readOpportunityV2Sources(artconnectSourcePath)[0].id, "artconnect-opportunities");
  assert.equal(readOpportunityV2Pool(artconnectPoolPath).opportunities[0].id, "artconnect-only", "historical pool record and source identity remain for audit/follow-up");
  assert.deepEqual(filterOpportunityV2Radar([artconnectOnly], [source("artconnect-opportunities")], { include_irrelevant: true }), [], "held-only records are not publicly copied");

  const overviewPoolPath = path.join(tempDir, "overview-pool.json");
  const overviewSourcesPath = path.join(tempDir, "overview-sources.json");
  const overviewHealthPath = path.join(tempDir, "overview-health.json");
  writeSources(overviewSourcesPath, [{ ...source("aging-active"), last_fetch_at: "2026-10-02T05:59:59.999Z" }, source("artconnect-opportunities")]);
  writeOpportunityV2Pool({ schema_version: "chanceping-opportunity-v2.v1", updated_at: now.toISOString(), opportunities: [] }, overviewPoolPath);
  fs.writeFileSync(overviewHealthPath, JSON.stringify({ sources: [{ source_id: "aging-active", fetched_at: now.toISOString(), ok: false, transport_ok: true, parser_status: "unrecognized", items_seen: 0, error: "parser failed", format: null, partial: true, next_page: 4 }] }));
  const overview = buildOpportunityV2SourceOverview({ sourcesPath: overviewSourcesPath, poolPath: overviewPoolPath, healthPath: overviewHealthPath, now });
  const aging = overview.rows.find((row) => row.id === "aging-active")!;
  assert.equal(aging.status, "ACTIVE");
  assert.equal(aging.freshness_status, "STALE");
  assert.equal(aging.effective_status, "STALE", "scheduler/source configured ACTIVE is not equivalent to fresh source data");
  assert.equal(aging.last_attempt_at, now.toISOString());
  assert.equal(aging.last_verified_content_at, null, "fetch time is not invented as a source-content timestamp");
  assert.equal(aging.partial, true);
  assert.equal(aging.next_page, 4);
  assert.equal(overview.rows.find((row) => row.id === "artconnect-opportunities")?.effective_status, "COMPLIANCE_HOLD");
  assert.equal(overview.rows.find((row) => row.id === "artconnect-opportunities")?.permission_evidence_url, "https://www.magazine.artconnect.com/terms");

  const api = opportunityV2Routes({ sourcesPath: artconnectSourcePath, poolPath: artconnectPoolPath });
  assert.equal((await api.request("http://localhost/opportunities/artconnect-only")).status, 404, "direct public detail API also enforces compliance hold");
  const publicRadar = await (await api.request("http://localhost/radar")).json() as { opportunities: OpportunityV2[] };
  assert.equal(publicRadar.opportunities.some((item) => item.id === "artconnect-only"), false);
  fs.rmSync(tempDir, { recursive: true, force: true });
  console.log("V1.4 source permission/freshness fixtures: PASS");
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
