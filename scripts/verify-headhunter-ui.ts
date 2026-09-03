import assert from "node:assert/strict";
import { webUiRoutes } from "../src/api/routes/web-ui";

async function main(): Promise<void> {
  const app = webUiRoutes();
  const redirect = await app.request("http://finance.chanceping.com/", { headers: { host: "finance.chanceping.com" } });
  assert.equal(redirect.status, 302);
  assert.equal(redirect.headers.get("location"), "/login");
  const login = await app.request("http://finance.chanceping.com/login", { headers: { host: "finance.chanceping.com" } });
  assert.equal(login.status, 200);
  const loginHtml = await login.text();
  assert.ok(loginHtml.includes("管理员登录"));
  const weekly = await app.request("http://finance.chanceping.com/weekly", { headers: { host: "finance.chanceping.com" } });
  const weeklyHtml = await weekly.text();
  for (const label of ["本周", "机器 A 候选", "B级情报池", "趋势", "公司库", "雷达运行"]) assert.ok(weeklyHtml.includes(label));
  assert.ok(weeklyHtml.includes("data-finance-logout"));
  assert.ok(weeklyHtml.includes("@media (max-width: 720px)"));
  assert.equal((await app.request("http://localhost/weekly", { headers: { host: "chanceping.com" } })).status, 404);
  console.log("headhunter finance UI verification: PASS");
}
void main();
