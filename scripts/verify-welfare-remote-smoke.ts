import assert from "node:assert/strict";

const base = (process.env.CHANCEPING_WELFARE_BASE_URL ?? "").replace(/\/$/, "");
if (!base) {
  console.log("SKIP verify:welfare:remote-smoke (set CHANCEPING_WELFARE_BASE_URL after manual deployment)");
  process.exit(0);
}
async function check(url: string) {
  const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(20_000) });
  assert.equal(response.status, 200, `${url} should return 200`);
  return response;
}
async function main(): Promise<void> {
  const root = await check(`${base}/`);
  assert.match(await root.text(), /企业福利商机雷达/);
  await check(`${base}/fuli`);
  const api = await check(`${base}/api/public/welfare/opportunities`);
  const envelope = await api.json() as { data?: { items?: Array<{ officialUrl?: string }>; sources?: unknown } };
  const body = envelope.data ?? {};
  assert.ok(Array.isArray(body.items));
  assert.ok(Array.isArray(body.sources));
  assert.ok(!/radarId|runId|welfare-evidence|stack/i.test(JSON.stringify(body)));
  assert.ok(body.items?.every((item) => /^https:\/\//.test(item.officialUrl ?? "")));
  await check(`${base}/api/public/welfare/report.md`);
  console.log("PASS verify:welfare:remote-smoke");
}
main().catch((error) => { console.error(error); process.exit(1); });
