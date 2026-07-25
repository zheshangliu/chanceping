import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

async function main() {
  const file = path.join(os.tmpdir(), `chanceping-business-p2-${process.pid}.json`);
  process.env.CHANCEPING_BUSINESS_PROFILES_PATH = file;
  process.env.CHANCEPING_BUSINESS_OPERATIONS_TOKEN = "p2-secret";
  const { createApp } = await import("../src/api/app");
  const { createAppContext } = await import("../src/api/context");
  const app = createApp(createAppContext());
  const headers = { "content-type": "application/json", "x-business-user": "p2-owner" };
  const created = await app.request("/api/business/profiles", { method: "POST", headers, body: JSON.stringify({ name: "文创企业", businessType: "小微企业", regions: ["guangzhou"], categories: ["policy"], industries: ["文创"], keywords: ["非遗"] }) });
  assert.equal(created.status, 201);
  const profile = await created.json() as { data: { id: string; ownerId?: string } };
  assert.equal(profile.data.ownerId, undefined);
  const list = await app.request("/api/business/profiles", { headers });
  assert.equal(list.status, 200);
  const operationsAnonymous = await app.request("/api/business/operations/review-queue");
  assert.equal(operationsAnonymous.status, 401);
  const operations = await app.request("/api/business/operations/review-queue", { headers: { authorization: "Bearer p2-secret" } });
  assert.equal(operations.status, 200);
  const matchA = await app.request(`/api/business/matches?edition=guangzhou`, { method: "POST", headers, body: JSON.stringify({ id: profile.data.id, categories: ["policy"], regions: ["guangzhou"], keywords: ["非遗"], industries: ["文创"] }) });
  const matchB = await app.request(`/api/business/matches?edition=guangzhou`, { method: "POST", headers, body: JSON.stringify({ id: "procurement-profile", categories: ["procurement"], regions: ["guangzhou"], keywords: ["采购"], industries: ["供应商"] }) });
  const a = await matchA.json() as { data: { items: Array<{ slug: string }> } };
  const b = await matchB.json() as { data: { items: Array<{ slug: string }> } };
  assert.notEqual(a.data.items[0]?.slug, b.data.items[0]?.slug);
  fs.rmSync(file, { force: true });
  console.log("Business P2 verifier passed: profile ownership boundary, protected operations and differentiated matching");
}
main().catch((error) => { console.error(error); process.exit(1); });
