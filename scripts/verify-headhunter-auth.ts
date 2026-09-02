import assert from "node:assert/strict";
import { Hono } from "hono";
import { createAuthRoutes } from "../src/headhunter/api/auth-routes";
import { hashPassword } from "../src/headhunter/auth/admin-auth";
import { SessionStore } from "../src/headhunter/auth/session-store";

async function main(): Promise<void> {
  const sessions = new SessionStore();
  const app = new Hono();
  app.route("/auth", createAuthRoutes({ config: { username: "admin", password_hash: hashPassword("correct"), session_secret: "test-secret" }, sessions, secureCookies: true, maxFailures: 2, windowMs: 60_000 }));
  assert.equal((await app.request("http://localhost/auth/session")).status, 401);
  const bad = await app.request("http://localhost/auth/login", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "1.2.3.4" }, body: JSON.stringify({ username: "admin", password: "wrong" }) });
  assert.equal(bad.status, 401);
  const good = await app.request("http://localhost/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "admin", password: "correct" }) });
  assert.equal(good.status, 200);
  const cookie = good.headers.get("set-cookie");
  assert.ok(cookie?.includes("HttpOnly"));
  assert.ok(cookie?.includes("Secure"));
  const session = await app.request("http://localhost/auth/session", { headers: { cookie: cookie?.split(";")[0] ?? "" } });
  assert.equal(session.status, 200);
  const logout = await app.request("http://localhost/auth/logout", { method: "POST", headers: { cookie: cookie?.split(";")[0] ?? "" } });
  assert.equal(logout.status, 200);
  assert.equal((await app.request("http://localhost/auth/session", { headers: { cookie: cookie?.split(";")[0] ?? "" } })).status, 401);
  await app.request("http://localhost/auth/login", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "rate-limit" }, body: JSON.stringify({ username: "admin", password: "wrong" }) });
  await app.request("http://localhost/auth/login", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "rate-limit" }, body: JSON.stringify({ username: "admin", password: "wrong" }) });
  assert.equal((await app.request("http://localhost/auth/login", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "rate-limit" }, body: JSON.stringify({ username: "admin", password: "correct" }) })).status, 429);
  console.log("headhunter admin auth verification: PASS");
}
void main();
