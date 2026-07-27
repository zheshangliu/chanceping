import assert from "node:assert/strict";
import { buildBusinessReleaseManifest } from "../src/business/release-manifest";
import { createApp } from "../src/api/app";
import { createAppContext } from "../src/api/context";

async function main() {
  const manifest = buildBusinessReleaseManifest();
  assert.ok(manifest.data.total >= 100);
  assert.equal(manifest.data.total, manifest.data.current + manifest.data.historical);
  const app = createApp(createAppContext());
  for (const edition of ["guangzhou", "tianhe", "shaoguan"] as const) {
    const page = await app.request(`/api/business/opportunities?edition=${edition}&status=current`);
    assert.equal(page.status, 200);
    const payload = await page.json() as { data: { items: Array<{ lifecycleStatus: string }> } };
    assert.ok(payload.data.items.length > 0 && payload.data.items.every((item) => item.lifecycleStatus !== "historical"));
  }
  const match = await app.request("/api/business/matches?edition=guangzhou", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ keywords: ["非遗"], industries: ["文创"], regions: ["guangzhou"], categories: ["policy"] }) });
  assert.equal(match.status, 200);
  const matchPayload = await match.json() as { data: { items: Array<{ fitScore: number; gate: { status: string }; preparationCost: string[]; localRelevance: { reason: string } }> } };
  assert.equal(matchPayload.data.items.length, 20);
  assert.ok(matchPayload.data.items.every((item) => item.fitScore >= 0 && item.fitScore <= 100 && item.gate.status && item.preparationCost.length && item.localRelevance.reason));
  console.log(`Business P0-P1-P2 release verifier passed: ${manifest.data.total} records, three editions, 20 scored matches`);
}
main().catch((error) => { console.error(error); process.exit(1); });
