import assert from "node:assert/strict";
import fs from "node:fs";

async function main() {
  const { createApp } = await import("../src/api/app");
  const { createAppContext } = await import("../src/api/context");
  const app = createApp(createAppContext());
  const demo = await (await app.request("/api/business/demo-package?edition=guangzhou")).json() as { data: { featured: Array<{ id: string; fitLabel: string }>; gate: { passed: boolean } } };
  assert.equal(demo.data.featured.length, 5);
  assert.equal(demo.data.gate.passed, true);
  assert.ok(demo.data.featured.some((item) => item.fitLabel === "不适合"));
  const overview = await (await app.request("/api/business/overview?edition=guangzhou")).json() as { data: { currentCount: number; verifiedCount: number; sourceCount: number; categories: unknown[] } };
  assert.ok(overview.data.currentCount >= 20);
  assert.ok(overview.data.verifiedCount > 0 && overview.data.sourceCount > 0 && overview.data.categories.length === 6);
  const shaoguan = await (await app.request("/api/business/opportunities?edition=shaoguan&status=current&q=%E6%B7%B1%E5%9C%B3")).json() as { data: { total: number } };
  assert.equal(shaoguan.data.total, 0);
  const businessJs = fs.readFileSync("web/business.js", "utf8");
  const homeJs = fs.readFileSync("web/home.js", "utf8");
  assert.match(businessJs, /business_context/);
  assert.match(homeJs, /chanceping:business-context-received/);
  console.log("Business contest readiness passed: freeze, city relevance, evidence, and AI context handoff");
}
main().catch((error) => { console.error(error); process.exit(1); });
