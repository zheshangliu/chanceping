import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";

async function main() {
  process.env.CHANCEPING_BUSINESS_WORKFLOWS_PATH = path.join(os.tmpdir(), `chanceping-new-user-${process.pid}.json`);
  process.env.CHANCEPING_BUSINESS_PROFILES_PATH = path.join(os.tmpdir(), `chanceping-new-user-profile-${process.pid}.json`);
  const { createApp } = await import("../src/api/app");
  const { createAppContext } = await import("../src/api/context");
  const app = createApp(createAppContext());
  const home = await app.request("/api/business/editions/guangzhou"); assert.equal(home.status, 200);
  const list = await app.request("/api/business/opportunities?edition=guangzhou&status=current&diverse=1"); const listPayload = await list.json() as { data: { items: Array<{ id: string; slug: string }> } }; assert.equal(list.status, 200); assert.ok(listPayload.data.items.length > 0);
  const item = listPayload.data.items[0];
  const detail = await app.request(`/api/business/opportunities/${item.slug}?edition=guangzhou`); assert.equal(detail.status, 200);
  const match = await app.request("/api/business/matches?edition=guangzhou", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ keywords: ["创新"], industries: ["科技"], regions: ["guangzhou"] }) }); const matchPayload = await match.json() as { data: { items: unknown[] } }; assert.equal(match.status, 200); assert.equal(matchPayload.data.items.length, 20);
  const userHeaders = { "content-type": "application/json", "x-business-user": "new-user" };
  assert.equal((await app.request("/api/business/workflows/favorites", { method: "POST", headers: userHeaders, body: JSON.stringify({ opportunityId: item.id }) })).status, 201);
  assert.equal((await app.request("/api/business/workflows/saved-filters", { method: "POST", headers: userHeaders, body: JSON.stringify({ name: "我的广州筛选", edition: "guangzhou", filters: { status: "current" } }) })).status, 201);
  assert.equal((await app.request("/api/business/workflows/reminders", { method: "POST", headers: userHeaders, body: JSON.stringify({ opportunityId: item.id, remindAt: new Date(Date.now() + 86400000).toISOString() }) })).status, 201);
  assert.equal((await app.request("/api/business/profiles", { method: "POST", headers: userHeaders, body: JSON.stringify({ name: "我的企业", regions: ["guangzhou"], categories: ["policy"] }) })).status, 201);
  assert.equal((await app.request("/api/business/operations/review-queue")).status, 401);
  console.log("Business new-user journey passed: city → list → detail → match → save → favorite → reminder → profile");
}
main().catch((error) => { console.error(error); process.exit(1); });
