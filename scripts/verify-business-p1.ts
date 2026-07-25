import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

async function main() {
const file = path.join(os.tmpdir(), `chanceping-business-p1-${process.pid}.json`);
process.env.CHANCEPING_BUSINESS_WORKFLOWS_PATH = file;
const { createApp } = await import("../src/api/app");
const { createAppContext } = await import("../src/api/context");
const app = createApp(createAppContext());
const headers = { "content-type": "application/json", "x-business-user": "p1-demo" };
const save = await app.request("/api/business/workflows/saved-filters", { method: "POST", headers, body: JSON.stringify({ name: "广州政策", edition: "guangzhou", filters: { category: "policy", status: "current" } }) });
assert.equal(save.status, 201);
const saved = await save.json() as { data: { id: string } };
const fav = await app.request("/api/business/workflows/favorites", { method: "POST", headers, body: JSON.stringify({ opportunityId: "opp-demo" }) });
assert.equal(fav.status, 201);
const reminder = await app.request("/api/business/workflows/reminders", { method: "POST", headers, body: JSON.stringify({ opportunityId: "opp-demo", remindAt: "2026-07-30T09:00:00+08:00" }) });
assert.equal(reminder.status, 201);
const reconstructed = createApp(createAppContext());
const list = await reconstructed.request("/api/business/workflows/saved-filters", { headers: { "x-business-user": "p1-demo" } });
assert.equal(list.status, 200);
const listPayload = await list.json() as { data: { items: Array<{ id: string }> } };
assert.ok(listPayload.data.items.some((item) => item.id === saved.data.id));
const exportResponse = await reconstructed.request("/api/business/workflows/export?edition=guangzhou", { headers: { "x-business-user": "p1-demo" } });
assert.equal(exportResponse.status, 200);
assert.match(exportResponse.headers.get("content-type") || "", /json|csv/);
fs.rmSync(file, { force: true });
console.log("Business P1 verifier passed: saved filters, favorites, reminders and persistence");
}
main().catch((error) => { console.error(error); process.exit(1); });
