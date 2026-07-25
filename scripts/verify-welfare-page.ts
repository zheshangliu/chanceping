import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createApp } from "../src/api/app";
import { loadRecordedWelfareOpportunities, savePersistedWelfareCandidates, savePersistedWelfareOpportunities } from "../src/public/welfare-opportunities";

process.env.CHANCEPING_WELFARE_STORE_PATH = path.join(os.tmpdir(), `chanceping-welfare-page-${process.pid}.json`);
process.env.CHANCEPING_WELFARE_CANDIDATE_PATH = path.join(os.tmpdir(), `chanceping-welfare-candidates-${process.pid}.json`);

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
savePersistedWelfareCandidates([{
  id: "candidate_fixture", title: "职工防暑降温服务商征集公告", sourceCode: "ENT-001", sourceName: "南方电网供应链统一服务平台", officialUrl: "https://www.bidding.csg.cn/candidate.html", publishedAt: "2099-01-01T00:00:00+08:00", retrievedAt: "2099-01-01T00:00:00.000Z", region: "全国", verificationState: "CANDIDATE", reason: "详情字段待核验", nextAction: "回溯官方详情并核对截止时间。",
}], process.env.CHANCEPING_WELFARE_CANDIDATE_PATH);

const html = fs.readFileSync("web/welfare.html", "utf8");
const css = fs.readFileSync("web/welfare.css", "utf8");
const js = fs.readFileSync("web/welfare.js", "utf8");
assert.ok(html.includes("盯机会｜企业福利商机雷达"));
assert.ok(html.includes("/welfare.js") && html.includes("/welfare.css"));
assert.ok(css.includes(".welfare-topbar") && !css.includes(".ai-events-page"));
assert.ok(js.includes("/api/public/welfare/opportunities?"));
assert.ok(!html.includes("本来生活能力"));
assert.ok(js.includes("contactName") && js.includes("contactPhone") && js.includes("contactAddress"));
assert.ok(html.includes("待核验线索") && js.includes("/api/public/welfare/candidates"));
assert.ok(html.includes("当前机会") && html.includes("前置信号") && html.includes("历史续采"), "layered public navigation must be present");
assert.ok(html.includes("welfare-quick") && js.includes("welfare-quick"), "public quick filters must be present");
assert.ok(js.includes("查看详情") && js.includes("publicContact"), "cards must use a compact public summary");
assert.ok(!js.includes("chanceping:welfare:sales-follow-up:v1") && !js.includes("保存跟进记录"), "public page must not expose sales follow-up persistence");
assert.ok(!html.includes("welfare-export-followups"), "public page must not expose sales export");

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
  assert.ok(["current", "signal", "historical"].includes(json.data.items[0].opportunityLayer));
  assert.ok(json.data.items[0].contactPhone.length > 0);
  assert.ok(json.data.items[0].contactName.length > 0);
  assert.ok(json.data.items[0].contactAddress.length > 0);
  const candidates = await app.request("/api/public/welfare/candidates?page=1&page_size=12");
  assert.equal(candidates.status, 200);
  const candidateJson = await candidates.json() as any;
  assert.equal(candidateJson.data.items.length, 1);
  assert.equal(candidateJson.data.items[0].verificationState, "CANDIDATE");
  const report = await app.request("/api/public/welfare/report.md");
  assert.equal(report.status, 200);
  assert.ok((await report.text()).includes(json.data.items[0].title));
  console.log("PASS verify:welfare:page");
}
main().catch((error) => { console.error(error); process.exit(1); });
