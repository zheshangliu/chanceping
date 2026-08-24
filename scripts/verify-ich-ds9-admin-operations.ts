import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Hono } from "hono";
import { ichAdminPagesRoutes } from "../src/api/routes/ich-admin-pages";
import { internalIchOperationsRoutes } from "../src/api/routes/internal-ich-operations";
import { createApp } from "../src/api/app";

let passed = 0;
let failed = 0;
function check(name: string, condition: boolean, detail = ""): void {
  if (condition) {
    passed += 1;
    console.log(`[PASS] ${name}`);
  } else {
    failed += 1;
    console.error(`[FAIL] ${name}${detail ? `: ${detail}` : ""}`);
  }
}

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "chanceping-ich-ds9-"));
const token = "ds9-test-token";
const app = new Hono().route("/api/internal/ich", internalIchOperationsRoutes({
  adminToken: token,
  rootDirectory: process.cwd(),
  storePath: path.join(temp, "missing-store.json"),
  now: () => new Date("2026-08-24T16:00:00+08:00"),
}));
const auth = { Authorization: `Bearer ${token}` };

async function main(): Promise<void> {
  console.log("\n[ICH DS9] Admin operations dashboard\n");
  const unauthorized = await app.request("/api/internal/ich/operations");
  check("operations endpoint rejects missing bearer token", unauthorized.status === 401);
  const response = await app.request("/api/internal/ich/operations", { headers: auth });
  const body = await response.json() as any;
  check("operations endpoint is available to authenticated admin", response.status === 200 && body.schema_version === "ich-operations-dashboard.v1");
  check("formal store metrics are dynamic and non-empty", body.formal_store.total >= 35 && typeof body.formal_store.current === "number");
  check("source registry and DS7 workflow metrics are exposed", body.source_registry.total >= 20 && body.source_workflows.total >= 10 && Object.keys(body.source_workflows.category_coverage).length === 6);
  check("DS10-C source health metrics are exposed", body.source_health?.items?.length === body.source_registry.total && typeof body.source_health.summary.collection_success_rate === "number" && typeof body.source_health.summary.field_missing_rate === "number" && typeof body.source_health.summary.duplicate_rate === "number");
  check("DS10-C source health rows include action and endpoint fields", body.source_health.items.every((item: any) => "http_status" in item && "last_successful_collection" in item && "candidate_count" in item && "action_required" in item));
  check("DS6 cadence is read-only and three-day based", body.ds6_schedule.interval_days === 3 && body.ds6_schedule.run_mode === "readonly" && body.ds6_schedule.formal_store_write === false);
  check("DS8 lifecycle gate and stale queue are visible", ["pass", "pass_with_followups"].includes(body.ds8_lifecycle.gate) && typeof body.ds8_lifecycle.stale_recheck === "number");
  check("DS5 snapshot drift is explicit", typeof body.ds5_snapshot.current_drift === "number" && typeof body.ds5_snapshot.dynamic_current === "number");
  check("dashboard response contains no admin token or environment values", !JSON.stringify(body).includes(token) && body.safety.secrets_in_response === false);

  const page = new Hono().route("/ich/admin", ichAdminPagesRoutes());
  const pageResponse = await page.request("/ich/admin");
  const html = await pageResponse.text();
  check("admin page is no-store and noindex", pageResponse.headers.get("cache-control") === "no-store" && html.includes('name="robots" content="noindex,nofollow"'));
  check("admin page renders DS9 operations panel and endpoint", html.includes("数据源与运行状态") && html.includes("来源健康与采集质量") && html.includes('api("/operations")') && html.includes("formal_store"));
  check("admin page does not embed credentials", !html.includes(token) && !html.includes("CHANCEPING_ICH_ADMIN_TOKEN"));

  process.env.CHANCEPING_ICH_ADMIN_TOKEN = token;
  try {
    const fullApp = createApp();
    const mounted = await fullApp.request("/api/internal/ich/operations", { headers: auth });
    check("full application mounts the protected operations endpoint", mounted.status === 200);
  } finally {
    delete process.env.CHANCEPING_ICH_ADMIN_TOKEN;
  }

  console.log(`\nICH DS9 result: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exitCode = 1;
}

main().finally(() => fs.rmSync(temp, { recursive: true, force: true })).catch((error) => {
  console.error(error);
  process.exit(1);
});
