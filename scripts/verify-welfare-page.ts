import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createApp } from "../src/api/app";
import { loadRecordedWelfareOpportunities, savePersistedWelfareOpportunities } from "../src/public/welfare-opportunities";

process.env.CHANCEPING_WELFARE_STORE_PATH = path.join(os.tmpdir(), `chanceping-welfare-page-${process.pid}.json`);

// The page contract must be independent from the wall clock and from the
// production store. Seed one official, publicly disclosed fixture whose
// deadline remains current regardless of when the verification is run.
const [recorded] = loadRecordedWelfareOpportunities();
assert.ok(recorded, "recorded welfare fixture must exist");
savePersistedWelfareOpportunities([{
  ...recorded,
  deadline: "2099-12-31T18:00:00+08:00",
  deadlineDisplay: "2099年12月31日18时00分",
  lifecycleStatus: "current",
  retrievedAt: "2099-01-01T00:00:00.000Z",
}], process.env.CHANCEPING_WELFARE_STORE_PATH);

const html = fs.readFileSync("web/welfare.html", "utf8");
const css = fs.readFileSync("web/welfare.css", "utf8");
const js = fs.readFileSync("web/welfare.js", "utf8");
assert.ok(html.includes("盯机会｜企业福利商机雷达"));
assert.ok(html.includes("/welfare.js") && html.includes("/welfare.css"));
assert.ok(css.includes(".welfare-topbar") && !css.includes(".ai-events-page"));
assert.ok(js.includes("/api/public/welfare/opportunities?"));
assert.ok(!html.includes("本来生活能力"));
assert.ok(js.includes("contactName") && js.includes("contactPhone") && js.includes("contactAddress"));

async function main() {
  const app = createApp();
  const page = await app.request("/fuli");
  assert.equal(page.status, 200);
  assert.ok((await page.text()).includes("企业福利商机雷达"));
  const response = await app.request("/api/public/welfare/opportunities?status=current&page=1&page_size=12");
  assert.equal(response.status, 200);
  const json = await response.json() as any;
  assert.equal(json.success, true);
  assert.ok(json.data.items.length > 0);
  assert.ok(json.data.items[0].officialUrl.startsWith("https://www.szgm.gov.cn/"));
  assert.equal("radarId" in json.data.items[0], false);
  assert.equal("runId" in json.data.items[0], false);
  assert.ok(/^0755-\d{7,8}$/.test(json.data.items[0].contactPhone));
  assert.ok(json.data.items[0].contactName.length > 0);
  assert.ok(json.data.items[0].contactAddress.length > 0);
  const report = await app.request("/api/public/welfare/report.md");
  assert.equal(report.status, 200);
  assert.ok((await report.text()).includes(json.data.items[0].title));
  console.log("PASS verify:welfare:page");
}
main().catch((error) => { console.error(error); process.exit(1); });
