import assert from "node:assert/strict";
import { Hono } from "hono";
import { createHeadHunterApi } from "../src/headhunter/api/headhunter-api";
import { hashPassword } from "../src/headhunter/auth/admin-auth";
import { createHeadHunterApiContext } from "../src/headhunter/api/context";

async function main(): Promise<void> {
  const context = createHeadHunterApiContext({ authConfig: { username: "admin", password_hash: hashPassword("correct"), session_secret: "secret" } });
  const root = new Hono(); root.route("/api/finance", createHeadHunterApi({ context }));
  assert.equal((await root.request("http://localhost/api/finance/leads/a")).status, 401);
  const login = await root.request("http://localhost/api/finance/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "admin", password: "correct" }) });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";
  assert.equal((await root.request("http://localhost/api/finance/leads/a", { headers: { cookie } })).status, 200);
  const manual = await root.request("http://localhost/api/finance/leads/manual", { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ company_id: "c", week_key: "2026-W36", lead_pool: "A_ACTIONABLE" }) });
  assert.equal(manual.status, 201);
  const patch = await root.request(`http://localhost/api/finance/leads/${(await manual.clone().json() as { id: string }).id}`, { method: "PATCH", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ manual_outreach: "reviewed" }) });
  assert.equal(patch.status, 200);
  console.log("headhunter API contract verification: PASS");
}
void main();
