import assert from "node:assert/strict";

async function main(): Promise<void> {
  const baseUrl = process.env.CHANCEPING_DEPLOY_BASE_URL?.replace(/\/$/, "");
  if (!baseUrl) { console.error(JSON.stringify({ status: "BLOCKED_BY_DEPLOY_URL", required: "CHANCEPING_DEPLOY_BASE_URL" })); process.exitCode = 2; return; }
  const login = await fetch(`${baseUrl}/login`, { redirect: "manual" });
  assert.equal(login.status, 200, `login status=${login.status}`);
  const root = await fetch(`${baseUrl}/`, { redirect: "manual" });
  assert.ok([200, 302, 303].includes(root.status), `root status=${root.status}`);
  if (process.env.CHANCEPING_ALLOW_PRODUCTION_SMOKE !== "true") {
    console.log(JSON.stringify({ status: "READ_ONLY_PASS", base_url: baseUrl, login_status: login.status, root_status: root.status, mutations: "skipped" }));
    return;
  }
  const username = process.env.FINANCE_ADMIN_USERNAME;
  const password = process.env.FINANCE_ADMIN_PASSWORD;
  if (!username || !password) throw new Error("Production mutation smoke requires FINANCE_ADMIN_USERNAME and FINANCE_ADMIN_PASSWORD in process environment");
  const auth = await fetch(`${baseUrl}/api/finance/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username, password }) });
  assert.equal(auth.status, 200);
  const cookie = auth.headers.get("set-cookie")?.split(";")[0] ?? "";
  for (const path of ["/api/finance/weekly/current", "/api/finance/leads/a", "/api/finance/leads/b", "/api/finance/companies", "/api/finance/runs"]) assert.equal((await fetch(`${baseUrl}${path}`, { headers: { cookie } })).status, 200, path);
  console.log(JSON.stringify({ status: "AUTHENTICATED_READ_PASS", base_url: baseUrl, mutations: "not implemented in safe smoke; use documented manual B/restart/cleanup procedure" }));
}
void main().catch((error: unknown) => {
  console.error(JSON.stringify({ status: "BLOCKED_BY_REMOTE_SMOKE", error: error instanceof Error ? error.message : "remote request failed" }));
  process.exitCode = 2;
});
