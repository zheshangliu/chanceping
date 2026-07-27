import assert from "node:assert/strict";

async function main() {
  const { createApp } = await import("../src/api/app");
  const { createAppContext } = await import("../src/api/context");
  const app = createApp(createAppContext());
  const response = await app.request("/api/business/demo-package?edition=guangzhou");
  assert.equal(response.status, 200);
  const payload = await response.json() as { success: boolean; data: { items: unknown[]; featured: Array<{ id: string; fitLabel: string }>; actionPlan: string[]; profile: { id: string }; freeze: { version: string } } };
  assert.equal(payload.success, true);
  assert.equal(payload.data.profile.id, "demo-runjia-cultural");
  assert.equal(payload.data.items.length, 20);
  assert.equal(payload.data.featured.length, 5);
  assert.equal(payload.data.freeze.version, "contest-freeze-v1");
  assert.ok(payload.data.featured.some((item) => item.fitLabel === "不适合"));
  assert.ok(payload.data.actionPlan.length >= 3);
  console.log("Business contest package passed: profile + 20 matches + 5 featured + action plan");
}
main();
