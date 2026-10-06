import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { opportunityV2Routes, type OpportunityV2RouteOptions } from "../src/api/routes/opportunity-v2";
import { withAsyncFileLock } from "../src/opportunity-v2/async-file-lock";
import type { IchProductionCycleManifest } from "../src/opportunity-v2/production-cycle";

async function main(): Promise<void> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "chanceping-v15-admin-cycle-route-"));
  const sourcesPath = path.join(tempDir, "sources.json");
  const poolPath = path.join(tempDir, "opportunities.json");
  const healthPath = path.join(tempDir, "source-health.json");
  const changeFeedPath = path.join(tempDir, "change-feed.json");
  fs.writeFileSync(sourcesPath, JSON.stringify({ sources: [{ id: "cycle-route-fixture", name: "Cycle route fixture", url: "https://example.invalid/", region: "CN", priority: "P0", types: ["market"], radars: ["ich"], enabled: true, status: "ACTIVE" }] }));
  fs.writeFileSync(poolPath, JSON.stringify({ schema_version: "chanceping-opportunity-v2.v1", updated_at: "2026-10-01T00:00:00.000Z", opportunities: [] }));

  let cycleCalls = 0;
  let directFetchCalls = 0;
  const manifest: IchProductionCycleManifest = {
    schema_version: "chanceping.ich.v15.production-cycle.v1",
    run_id: "fixture-cycle-run",
    status: "COMPLETED",
    started_at: "2026-10-06T07:00:00.000Z",
    finished_at: "2026-10-06T07:01:00.000Z",
    production_commit: null,
    fetch: null,
    translation: null,
    audit: null,
    next_run_at: "2026-10-09T07:01:00.000Z",
    freshness: "FRESH",
    failure_code: null,
  };
  const options: OpportunityV2RouteOptions = {
    sourcesPath,
    poolPath,
    healthPath,
    changeFeedPath,
    adminToken: "cycle-route-test-secret",
    fetcher: async () => { directFetchCalls += 1; return { status: 503, final_url: "", text: "" }; },
    runProductionCycle: async () => { cycleCalls += 1; return manifest; },
  };
  const app = opportunityV2Routes(options);

  try {
    const denied = await app.request("/run", { method: "POST" });
    assert.equal(denied.status, 403, "manual run must retain admin authorization");
    assert.equal(cycleCalls, 0, "unauthorized calls must not start a production cycle");

    const response = await app.request("/run", { method: "POST", headers: { "x-ich-admin-token": "cycle-route-test-secret" } });
    assert.equal(response.status, 200);
    assert.equal(cycleCalls, 1, "authorized manual runs must enter the protected cycle runner");
    assert.equal(directFetchCalls, 0, "the HTTP route must not call the legacy fetch-only pipeline directly");
    assert.equal((await response.json() as { run_id: string }).run_id, "fixture-cycle-run");

    let sourceRunPromise: Promise<Response> | undefined;
    await withAsyncFileLock(path.join(tempDir, "ich-production-cycle.lock"), async () => {
      sourceRunPromise = Promise.resolve(app.request("/sources/cycle-route-fixture/run", { method: "POST", headers: { "x-ich-admin-token": "cycle-route-test-secret" } }));
      await new Promise((resolve) => setTimeout(resolve, 80));
      assert.equal(directFetchCalls, 0, "source-specific fetch must wait while the protected cycle owns the runtime lock");
    });
    const sourceRun = await sourceRunPromise;
    assert.equal(sourceRun?.status, 200);
    assert.ok(directFetchCalls > 0, "source-specific fetch proceeds after the protected cycle releases the lock");
    console.log("ICH_V15_ADMIN_CYCLE_ROUTE: PASS (admin gate retained; manual run delegates to protected Fetch → Translate → Audit cycle)");
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
