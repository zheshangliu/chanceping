import assert from "node:assert/strict";
import { Hono } from "hono";
import { createHeadHunterApi } from "../src/headhunter/api/headhunter-api";
import { hashPassword } from "../src/headhunter/auth/admin-auth";
import { createHeadHunterApiContext } from "../src/headhunter/api/context";
import type { RawEvidence } from "../src/headhunter/model/evidence";

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
  const manualBody = await manual.json() as { company_id: string; lead_pool: string; opportunity_summary: string };
  assert.equal(manualBody.lead_pool, "A_ACTIONABLE");
  assert.ok(manualBody.opportunity_summary !== undefined);
  const evidence: RawEvidence = { evidence_id: "api-evidence", source_url: "https://example.com", source_name: "Example", source_type: "official", title: "Original", excerpt: "raw", published_at: null, observed_at: "2026-09-02T00:00:00Z", content_hash: null, immutable: true };
  await context.stores.evidence.insert(evidence);
  const override = await root.request("http://localhost/api/finance/evidence/api-evidence/override", { method: "PATCH", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ corrected_summary: "reviewed" }) });
  assert.equal(override.status, 200);
  assert.equal((await context.stores.evidence.get("api-evidence"))?.excerpt, "raw");
  console.log("headhunter API contract verification: PASS");
}
void main();
