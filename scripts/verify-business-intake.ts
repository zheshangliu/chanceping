import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";

async function main() {
  process.env.CHANCEPING_BUSINESS_OPERATIONS_TOKEN = "intake-test-token";
  process.env.CHANCEPING_BUSINESS_CANDIDATES_PATH = path.join(os.tmpdir(), `chanceping-intake-${process.pid}.ndjson`);
  const { createApp } = await import("../src/api/app"); const { createAppContext } = await import("../src/api/context"); const app = createApp(createAppContext());
  const headers = { authorization: "Bearer intake-test-token", "content-type": "application/json" };
  const intake = await app.request("/api/business/operations/intake", { method: "POST", headers, body: JSON.stringify({ sourceId: "src_ccgp_national", officialUrl: "https://www.ccgp.gov.cn/cggg/dfgg/test-intake.html", title: "收录验收用政府采购候选", publishedAt: "2026-07-27T10:00:00+08:00", deadline: "2026-08-20T09:00:00+08:00", categoryHint: "procurement" }) });
  assert.equal(intake.status, 201); const candidate = (await intake.json() as { data: { candidate: { candidateId: string }; publicVisible: boolean } }).data; assert.equal(candidate.publicVisible, false);
  const queue = await (await app.request("/api/business/operations/review-queue", { headers })).json() as { data: { candidates: Array<{ candidateId: string; state: string }> } }; assert.ok(queue.data.candidates.some((item) => item.candidateId === candidate.candidate.candidateId && item.state === "PENDING_VERIFICATION"));
  const decision = await app.request(`/api/business/operations/review-queue/${candidate.candidate.candidateId}/decision`, { method: "POST", headers, body: JSON.stringify({ decision: "verify", note: "已核对官方链接和截止日期" }) }); assert.equal(decision.status, 200);
  const publicList = await (await app.request("/api/business/opportunities?edition=guangzhou&status=current&q=%E6%94%B6%E5%BD%95%E9%AA%8C%E6%94%B6%E7%94%A8")).json() as { data: { total: number } }; assert.equal(publicList.data.total, 0);
  console.log("Business intake passed: official candidate → review queue → verification, never directly public");
}
main().catch((error) => { console.error(error); process.exit(1); });
