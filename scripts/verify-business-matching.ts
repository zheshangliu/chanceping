import assert from "node:assert/strict";
import { createApp } from "../src/api/app";
import { createAppContext } from "../src/api/context";

async function main() {
  const app = createApp(createAppContext());
  const response = await app.request("/api/business/matches?edition=guangzhou", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ keywords: ["创新"], industries: ["科技"], regions: ["广州"], categories: ["policy"] }) });
  assert.equal(response.status, 200);
  const payload = await response.json() as { success: boolean; data: { items: Array<{ fitScore: number; fitReasons: string[] }>; gate: { passed: boolean } } };
  assert.equal(payload.success, true);
  assert.equal(payload.data.items.length, 20);
  assert.equal(payload.data.gate.passed, true);
  assert.ok(payload.data.items.every((item) => item.fitScore >= 0 && item.fitScore <= 100 && item.fitReasons.length > 0));
  console.log("Business matching verified: demo profile gate passed with 20 scored opportunities");
}
main().catch((error) => { console.error(error); process.exit(1); });
