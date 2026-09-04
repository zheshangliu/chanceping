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
  for (const label of ["本周", "A级机会", "B级情报池", "趋势", "公司库", "雷达运行", "推荐机会", "待验证机会", "最近运行", "可执行联系"]) assert.ok(weeklyHtml.includes(label));
  assert.ok(weeklyHtml.includes("data-finance-logout"));
  assert.ok(weeklyHtml.includes("@media (max-width:720px)"));
  for (const marker of ["finance-hero", "finance-insight", "finance-stat-row", "本周 Lead Feed", "details class=\"finance-evidence\"", "复制首触话术", "查看证据"]) assert.ok(weeklyHtml.includes(marker), `missing UI marker: ${marker}`);
  assert.ok(!weeklyHtml.includes("company_id"), "internal company IDs must not be rendered in the UI shell");
  assert.equal((await app.request("http://localhost/weekly", { headers: { host: "chanceping.com" } })).status, 404);
  console.log("headhunter finance UI verification: PASS");
}
void main();
