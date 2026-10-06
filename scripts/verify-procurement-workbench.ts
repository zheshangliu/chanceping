import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Hono } from "hono";
import { assessProcurement } from "../src/opportunity-v2/procurement-workbench";
import { buildProcurementChangeEvents, recordProcurementChangeFeed } from "../src/opportunity-v2/procurement-change-feed";
import { createProcurementFollowupStore } from "../src/opportunity-v2/procurement-followup-store";
import { renderProcurementCsv } from "../src/opportunity-v2/procurement-export";
import { procurementWorkbenchRoutes } from "../src/api/routes/procurement-workbench";
import { procurementWorkbenchPageRoutes } from "../src/api/routes/procurement-workbench-pages";
import { buildWeeklyOpportunityActions } from "../src/opportunity-v2/procurement-workbench";
import type { OpportunityV2, OpportunityV2Source } from "../src/opportunity-v2/types";

const now = new Date("2026-09-15T00:00:00.000Z");
const source: OpportunityV2Source = {
  id: "proc-cn-ccgp", name: "中国政府采购网", url: "https://www.ccgp.gov.cn/", region: "CN", priority: "P0",
  types: ["procurement"], radars: ["ich"], enabled: true, status: "ACTIVE", last_fetch_at: null,
};

function opportunity(overrides: Partial<OpportunityV2> = {}): OpportunityV2 {
  return {
    id: "opp-proc-1", title: "非遗文创礼赠设计采购项目", summary: "公开采购非遗文创礼品及包装设计", source_id: source.id,
    source_item_id: "notice-1", source_name: source.name, source_url: source.url, detail_url: "https://example.com/notice-1",
    category: "procurement_project", region: "CN", tags: ["文创产品", "礼赠"], deadline: "2026-10-01", deadline_text: "投标截止 2026-10-01",
    status: "CURRENT", first_seen_at: "2026-09-01T00:00:00.000Z", last_seen_at: "2026-09-15T00:00:00.000Z", discovered_by_sources: [source.id], radar_relevance: "RELEVANT",
    procurement: { direction: "buyer_demand", stage: "open", notice_type: "tender", project_id: "notice-1", buyer_name: "文化馆", milestones: [{ kind: "submission", date: "2026-10-01" }] },
    ...overrides,
  };
}

const profile = { profile_id: "fixture-profile", approved_domain_tags: ["文创产品", "非遗活动", "礼赠"],
  geo_preferences: { onsite_first: ["广州"], goods_shipping_preferred: ["CN"] },
  qualification_facts: { default_eligibility: "NEEDS_REVIEW" as const, verified_licenses: [] }, hard_negative_domains: ["普通IT"] };

async function main(): Promise<void> {
const assessed = assessProcurement(opportunity(), profile, { now });
assert.equal(assessed.lane, "current");
assert.equal(assessed.eligibility_status, "NEEDS_REVIEW");
assert.ok(assessed.fit_score !== null && assessed.fit_score >= 0 && assessed.fit_score <= 100);
assert.ok(assessed.next_action.length > 0);
assert.ok(assessed.evidence.length > 0);

const expired = opportunity({ id: "opp-expired", deadline: "2026-08-01", status: "EXPIRED" });
assert.equal(assessProcurement(expired, profile, { now }).lane, "research");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "chanceping-workbench-test-"));
const followups = createProcurementFollowupStore(path.join(tempDir, "followups.json"));
await followups.upsert({ owner_id: "owner-a", opportunity_id: "opp-proc-1", status: "reviewing", note: "联系采购人确认样品", next_followup_at: "2026-09-20" });
assert.equal((await followups.get("owner-a", "opp-proc-1"))?.note, "联系采购人确认样品");
assert.equal(await followups.get("owner-b", "opp-proc-1"), null);

const before = opportunity({ deadline: "2026-09-30", procurement: { ...opportunity().procurement!, budget_amount: 10000, budget_currency: "CNY" } });
const after = opportunity({ deadline: "2026-10-01", procurement: { ...opportunity().procurement!, budget_amount: 12000, budget_currency: "CNY" } });
const events = buildProcurementChangeEvents([before], [after], now.toISOString());
assert.deepEqual(new Set(events.map((event) => event.event_type)), new Set(["deadline_changed", "budget_changed"]));
assert.equal(buildProcurementChangeEvents([after], [after], now.toISOString()).length, 0);

const csv = renderProcurementCsv([assessed]);
assert.ok(csv.includes("\"'=-1+1\"") === false);
assert.ok(csv.includes("非遗文创礼赠设计采购项目"));
const malicious = renderProcurementCsv([{ ...assessed, opportunity: opportunity({ title: "=HYPERLINK(\"https://evil.example\",\"click\")" }) }]);
assert.ok(malicious.includes("'=HYPERLINK"));

const route = new Hono();
route.route("/workbench", procurementWorkbenchRoutes({ opportunities: [opportunity()], sources: [source], profile, changeFeedPath: path.join(tempDir, "change-feed.json") }));
const publicResponse = await route.request("http://localhost/workbench/opportunities");
assert.equal(publicResponse.status, 200);
const publicBody = await publicResponse.json() as { opportunities: Array<Record<string, unknown>> };
assert.equal(publicBody.opportunities.length, 1);
assert.equal(publicBody.opportunities[0].private_followup, undefined);
const weeklyActions = buildWeeklyOpportunityActions({ opportunities: [opportunity()], sources: [source], now });
assert.equal(weeklyActions.length, 1, "the shortlist returns real current actions without a minimum quota");
assert.equal(weeklyActions[0].lane, "current");
assert.deepEqual(weeklyActions[0].type_labels, ["采购 / 订单"], "buyer-side procurement is included without invoking a private business profile");
assert.equal("fit_score" in weeklyActions[0], false, "the generic public shortlist does not expose a private-profile score");
assert.equal(buildWeeklyOpportunityActions({ opportunities: [], sources: [source], now }).length, 0);
const pollutedHazardousTender = opportunity({
  id: "polluted-hazardous-tender",
  title: "Hazardous Waste Disposal Services",
  summary: "The Department of National Defence requires an autonomous mine countermeasures vehicle for detecting underwater mines.",
  tags: ["procurement", "文创产品", "fair", "market", "文化服务", "grant", "活动执行", "展陈"],
});
assert.equal(buildWeeklyOpportunityActions({ opportunities: [opportunity(), pollutedHazardousTender], sources: [source], now }).some((item) => item.opportunity_id === pollutedHazardousTender.id), false, "stale creative tags cannot turn an unrelated defense tender into a weekly ICH action");
const pollutedRoute = new Hono();
pollutedRoute.route("/workbench", procurementWorkbenchRoutes({ opportunities: [opportunity(), pollutedHazardousTender], sources: [source], profile, now }));
const pollutedProcurement = await (await pollutedRoute.request("http://localhost/workbench/opportunities")).json() as { total: number; opportunities: Array<{ opportunity_id: string }> };
assert.equal(pollutedProcurement.total, 1, "procurement publication must require domain signals in the notice content, not only stale tags");
const artConnect = { ...source, id: "artconnect-opportunities", name: "ArtConnect", status: "ACTIVE" as const };
const pausedSource = { ...source, id: "paused-proc-source", status: "PAUSED" as const };
const excludedActions = buildWeeklyOpportunityActions({
  opportunities: [
    opportunity({ id: "seller-offer", source_item_id: "seller", procurement: { ...opportunity().procurement!, direction: "seller_offer" } }),
    opportunity({ id: "paused-item", source_id: pausedSource.id }),
    opportunity({ id: "held-item", source_id: artConnect.id }),
  ],
  sources: [source, pausedSource, artConnect],
  now,
});
assert.deepEqual(excludedActions, [], "seller offers, paused sources, and compliance-held sources are not weekly public actions");
const anonymousRoute = new Hono();
anonymousRoute.route("/workbench", procurementWorkbenchRoutes({ opportunities: [opportunity()], sources: [source], now }));
const anonymousResponse = await anonymousRoute.request("http://localhost/workbench/opportunities");
const anonymousBody = await anonymousResponse.json() as { opportunities: Array<Record<string, unknown>> };
assert.equal(anonymousBody.opportunities[0].fit_score, null, "anonymous views must not apply an unconfigured personal/business fit score");
assert.equal(anonymousBody.opportunities[0].profile_id, "unpersonalized-public-view");
const actionResponse = await route.request("http://localhost/workbench/actions/weekly");
assert.equal(actionResponse.status, 200);
assert.equal(((await actionResponse.json()) as { personalized: boolean }).personalized, false);
const privateResponse = await route.request("http://localhost/workbench/followups/opp-proc-1");
assert.equal(privateResponse.status, 401);
assert.equal((await route.request("http://localhost/workbench/followups?user_id=owner-a")).status, 401, "query parameters cannot impersonate a private owner");
assert.equal((await route.request("http://localhost/workbench/followups/opp-proc-1", { headers: { "x-business-user": "owner-a" } })).status, 401, "a caller-controlled identity header is not authentication");
assert.equal((await route.request("http://localhost/workbench/followups", { method: "POST", headers: { "content-type": "application/json", "x-business-user": "owner-a" }, body: JSON.stringify({ owner_id: "owner-a", opportunity_id: "opp-proc-1", note: "spoof" }) })).status, 401, "request body and headers do not grant private write access");
assert.equal((await route.request("http://localhost/workbench/inbox")).status, 401, "the inbox is private too");
const authenticatedRoute = new Hono();
const authenticatedFollowupPath = path.join(tempDir, "authenticated-followups.json");
const inboxFeedPath = path.join(tempDir, "inbox-change-feed.json");
authenticatedRoute.route("/workbench", procurementWorkbenchRoutes({ opportunities: [opportunity()], sources: [source], profile, followupPath: authenticatedFollowupPath, changeFeedPath: inboxFeedPath, now, resolveAuthenticatedUser: () => "session-owner" }));
const authenticatedWrite = await authenticatedRoute.request("http://localhost/workbench/followups", { method: "POST", headers: { "content-type": "application/json", "x-business-user": "attacker" }, body: JSON.stringify({ owner_id: "attacker", opportunity_id: "opp-proc-1", status: "reviewing", note: "server identity wins" }) });
assert.equal(authenticatedWrite.status, 201);
const writtenRecord = ((await authenticatedWrite.json()) as { followup: { owner_id: string; note: string } }).followup;
assert.equal(writtenRecord.owner_id, "session-owner", "the verified server-side identity is the only owner source");
assert.equal(writtenRecord.note, "server identity wins");
recordProcurementChangeFeed([opportunity()], [], inboxFeedPath, new Date().toISOString());
const initialInboxPage = new Hono();
initialInboxPage.route("/ich", procurementWorkbenchPageRoutes({ opportunities: [opportunity()], sources: [source], followupPath: authenticatedFollowupPath, changeFeedPath: inboxFeedPath, resolveAuthenticatedUser: () => "session-owner" }));
const initialInboxHtml = await (await initialInboxPage.request("http://localhost/ich/procurement/inbox")).text();
assert.match(initialInboxHtml, /data-read-event=/u, "unread changes can be marked read from the private inbox page");
const inboxBeforeRead = await (await authenticatedRoute.request("http://localhost/workbench/inbox")).json() as { followups: Array<{ note: string }>; changes: Array<{ event_id: string; is_read: boolean }>; unread_changes: number };
assert.equal(inboxBeforeRead.followups.length, 1);
assert.equal(inboxBeforeRead.followups[0].note, "server identity wins");
assert.equal(inboxBeforeRead.changes.length, 1);
assert.equal(inboxBeforeRead.changes[0].is_read, false);
assert.equal(inboxBeforeRead.unread_changes, 1);
const readResponse = await authenticatedRoute.request(`http://localhost/workbench/inbox/${inboxBeforeRead.changes[0].event_id}/read`, { method: "POST" });
assert.equal(readResponse.status, 200);
const inboxAfterRead = await (await authenticatedRoute.request("http://localhost/workbench/inbox")).json() as { changes: Array<{ is_read: boolean }>; unread_changes: number };
assert.equal(inboxAfterRead.changes[0].is_read, true);
assert.equal(inboxAfterRead.unread_changes, 0);
const otherOwnerRoute = new Hono();
otherOwnerRoute.route("/workbench", procurementWorkbenchRoutes({ opportunities: [opportunity()], sources: [source], followupPath: authenticatedFollowupPath, changeFeedPath: inboxFeedPath, resolveAuthenticatedUser: () => "other-owner" }));
const otherOwnerInbox = await (await otherOwnerRoute.request("http://localhost/workbench/inbox")).json() as { followups: unknown[]; changes: unknown[]; unread_changes: number };
assert.deepEqual(otherOwnerInbox.followups, []);
assert.deepEqual(otherOwnerInbox.changes, []);
assert.equal(otherOwnerInbox.unread_changes, 0);
const loeweOfficial = opportunity({ id: "loewe-official", source_id: "loewe-craft-prize", source_item_id: "9c506728be468703d19d6d09", category: "competition", detail_url: "https://craftprize.loewe.com/zh/craftprize2027", title: "LOEWE FOUNDATION Craft Prize 2027", summary: "Official LOEWE FOUNDATION Craft Prize 2027 application page." });
const loeweCraftScotland = opportunity({ id: "loewe-cs", source_id: "craft-scotland-opportunities", source_item_id: "43885b166107ea794022fea4", category: "competition", detail_url: "https://www.craftscotland.org/community/opportunity/loewe-foundation-craft-prize-2027", title: "Awards & Competitions LOEWE FOUNDATION Craft Prize 2027", summary: "Submissions to the 10th edition of the LOEWE FOUNDATION Craft Prize are now open." });
const loeweOpenCalls = opportunity({ id: "loewe-open-calls", source_id: "opencalls-ai", source_item_id: "48039ca6f2f38a96c4829f9c", category: "competition", detail_url: "https://opencalls.ai/opencalls/loewe-foundation-craft-prize-2027-a8bf1492-ae36-4af9-8ab6-e9d71b3d468f", title: "Award LOEWE FOUNDATION Craft Prize 2027", summary: "The LOEWE FOUNDATION Craft Prize 2027 invites makers to submit original work." });
const loeweFollowupsPath = path.join(tempDir, "loewe-followups.json");
const loeweStore = createProcurementFollowupStore(loeweFollowupsPath);
await loeweStore.upsert({ owner_id: "session-owner", opportunity_id: loeweCraftScotland.id, status: "reviewing", note: "已核对旧译名下的报名材料", next_followup_at: "2026-10-10" });
const loeweRoute = new Hono();
loeweRoute.route("/workbench", procurementWorkbenchRoutes({ opportunities: [loeweOfficial, loeweCraftScotland, loeweOpenCalls], sources: [source], followupPath: loeweFollowupsPath, resolveAuthenticatedUser: () => "session-owner" }));
const canonicalRead = await (await loeweRoute.request("http://localhost/workbench/followups/loewe-official")).json() as { followup: { opportunity_id: string; status: string; note: string } };
assert.equal(canonicalRead.followup.opportunity_id, loeweCraftScotland.id, "canonical display lookup finds the user's existing alias follow-up");
assert.equal(canonicalRead.followup.status, "reviewing");
assert.equal(canonicalRead.followup.note, "已核对旧译名下的报名材料");
const canonicalWrite = await loeweRoute.request("http://localhost/workbench/followups", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ opportunity_id: loeweOfficial.id, status: "preparing", note: "更新报名准备状态" }) });
assert.equal(canonicalWrite.status, 201);
assert.equal((await loeweStore.get("session-owner", loeweCraftScotland.id))?.note, "更新报名准备状态", "saving from the canonical title keeps the existing alias-keyed record rather than creating a second record");
assert.equal(await loeweStore.get("session-owner", loeweOfficial.id), null);
const page = new Hono();
page.route("/ich", procurementWorkbenchPageRoutes({ opportunities: [opportunity()], sources: [source], profile }));
const pageResponse = await page.request("http://localhost/ich/procurement");
assert.equal(pageResponse.status, 200);
const workbenchHtml = await pageResponse.text();
assert.match(workbenchHtml, /采购机会工作台/u);
assert.ok(workbenchHtml.includes(".pw-filter{display:grid;grid-template-columns:minmax(0,1fr) auto}.pw-filter input{grid-column:1/-1;width:100%}"), "mobile workbench filters keep search full-width and controls within a narrow viewport");
const anonymousWorkbenchPage = await page.request("http://localhost/ich/procurement");
assert.doesNotMatch(await anonymousWorkbenchPage.text(), /广州|佛山|东莞|深圳/iu, "the public workbench must not inject an owner-specific geo profile");
const detailResponse = await page.request("http://localhost/ich/procurement/opp-proc-1");
assert.equal(detailResponse.status, 200);
const detailHtml = await detailResponse.text();
assert.match(detailHtml, /私有跟进/u);
assert.match(detailHtml, /尚未接入服务端登录身份/u);
assert.doesNotMatch(detailHtml, /<label>用户标识|x-business-user/u, "unauthenticated HTML must not collect or send caller-selected identity");
const authenticatedPage = new Hono();
authenticatedPage.route("/ich", procurementWorkbenchPageRoutes({ opportunities: [opportunity()], sources: [source], profile, resolveAuthenticatedUser: () => "session-owner" }));
const authenticatedDetailHtml = await (await authenticatedPage.request("http://localhost/ich/procurement/opp-proc-1")).text();
assert.match(authenticatedDetailHtml, /name="note"/u);
assert.doesNotMatch(authenticatedDetailHtml, /x-business-user|name="owner"/u, "authorized form still uses cookie/session identity, never a user-id field/header");
const changesResponse = await route.request("http://localhost/workbench/changes");
assert.equal(changesResponse.status, 200);
assert.deepEqual(((await changesResponse.json()) as { events: unknown[] }).events, []);
const changesPageResponse = await page.request("http://localhost/ich/procurement/changes");
assert.equal(changesPageResponse.status, 200);
assert.match(await changesPageResponse.text(), /采购机会变更摘要/u);
const anonymousInboxPage = await page.request("http://localhost/ich/procurement/inbox");
assert.equal(anonymousInboxPage.status, 401);
assert.doesNotMatch(await anonymousInboxPage.text(), /联系采购人确认样品|server identity wins/u);
const authenticatedInboxPage = new Hono();
authenticatedInboxPage.route("/ich", procurementWorkbenchPageRoutes({ opportunities: [opportunity()], sources: [source], followupPath: authenticatedFollowupPath, changeFeedPath: inboxFeedPath, resolveAuthenticatedUser: () => "session-owner" }));
const authenticatedInboxResponse = await authenticatedInboxPage.request("http://localhost/ich/procurement/inbox");
assert.equal(authenticatedInboxResponse.status, 200);
const authenticatedInboxHtml = await authenticatedInboxResponse.text();
assert.match(authenticatedInboxHtml, /server identity wins/u);
assert.match(authenticatedInboxHtml, /新发现 · 已读/u);
assert.doesNotMatch(authenticatedInboxHtml, /data-read-event=/u);

fs.rmSync(tempDir, { recursive: true, force: true });
console.log("PROCUREMENT_WORKBENCH: PASS");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
