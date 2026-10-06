import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

async function main(): Promise<void> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "chanceping-v15-identity-"));
  const storePath = path.join(tempDir, "followups.json");
  const profilePath = path.join(tempDir, "profiles.json");
  const workflowsPath = path.join(tempDir, "workflows.json");
  const previousEnv = new Map([
    ["CHANCEPING_PROCUREMENT_FOLLOWUP_PATH", process.env.CHANCEPING_PROCUREMENT_FOLLOWUP_PATH],
    ["CHANCEPING_BUSINESS_PROFILES_PATH", process.env.CHANCEPING_BUSINESS_PROFILES_PATH],
    ["CHANCEPING_BUSINESS_WORKFLOWS_PATH", process.env.CHANCEPING_BUSINESS_WORKFLOWS_PATH],
  ]);
  process.env.CHANCEPING_PROCUREMENT_FOLLOWUP_PATH = storePath;
  process.env.CHANCEPING_BUSINESS_PROFILES_PATH = profilePath;
  process.env.CHANCEPING_BUSINESS_WORKFLOWS_PATH = workflowsPath;
  const marker = "V15_PRIVATE_MARKER_MUST_NEVER_REACH_ANON";
  const fixture = {
    schema_version: "chanceping-procurement-followups.v1",
    records: [{ opportunity_id: "private-opportunity", owner_id: "attacker", status: "reviewing", note: marker, next_followup_at: null, updated_at: "2026-10-01T00:00:00.000Z", revision: 1 }],
    read_event_markers: [],
  };
  fs.writeFileSync(storePath, `${JSON.stringify(fixture, null, 2)}\n`);
  fs.writeFileSync(profilePath, `${JSON.stringify({ profiles: [{ id: "private-profile", name: "Private profile", businessType: "studio", regions: ["CN"], targetAudience: ["collectors"], categories: ["craft"], industries: ["heritage"], keywords: [marker], constraints: [], ownerId: "attacker", createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z" }] }, null, 2)}\n`);
  fs.writeFileSync(workflowsPath, `${JSON.stringify({ savedFilters: [{ id: "private-filter", userId: "attacker", name: marker, edition: "guangzhou", filters: { private: true }, createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z" }], favorites: [], reminders: [] }, null, 2)}\n`);
  const before = fs.readFileSync(storePath);
  const beforeHash = createHash("sha256").update(before).digest("hex");
  const profileBefore = fs.readFileSync(profilePath);
  const profileHash = createHash("sha256").update(profileBefore).digest("hex");
  const workflowsBefore = fs.readFileSync(workflowsPath);
  const workflowsHash = createHash("sha256").update(workflowsBefore).digest("hex");

  try {
    const [{ createApp }, { createAppContext }] = await Promise.all([
      import("../src/api/app"),
      import("../src/api/context"),
    ]);
    const app = createApp(createAppContext());

    const forgedHeader = { "x-business-user": "attacker" };
    const apiRead = await app.request("/api/opportunity-v2/workbench/followups?owner_id=attacker", { headers: forgedHeader });
    assert.equal(apiRead.status, 401, "the actual app must reject forged header and owner query on a private read");
    assert.doesNotMatch(await apiRead.text(), new RegExp(marker, "u"));

    const forgedPage = await app.request("/ich/procurement/inbox?owner=attacker", { headers: forgedHeader });
    assert.equal(forgedPage.status, 401, "the actual app must reject client identity on the private inbox page");
    assert.doesNotMatch(await forgedPage.text(), new RegExp(marker, "u"));

    const bodyWrite = await app.request("/api/opportunity-v2/workbench/followups", {
      method: "POST",
      headers: { ...forgedHeader, "content-type": "application/json" },
      body: JSON.stringify({ owner_id: "attacker", opportunity_id: "private-opportunity", status: "reviewing", note: "forged write" }),
    });
    assert.equal(bodyWrite.status, 401, "body owner and forged header must not authorize a private write");
    assert.equal(createHash("sha256").update(fs.readFileSync(storePath)).digest("hex"), beforeHash, "unauthorized writes must leave the private store byte-for-byte unchanged");

    const anonymousQuery = await app.request("/api/opportunity-v2/workbench/followups?user_id=attacker");
    assert.equal(anonymousQuery.status, 401, "query owner alone must not authorize a private read");

    const profileRead = await app.request("/api/business/profiles?userId=attacker", { headers: forgedHeader });
    assert.equal(profileRead.status, 401, "business profile reads must not trust a caller-selected identity");
    assert.doesNotMatch(await profileRead.text(), new RegExp(marker, "u"));
    const profileDetail = await app.request("/api/business/profiles/private-profile?userId=attacker", { headers: forgedHeader });
    assert.equal(profileDetail.status, 401, "profile detail must resolve identity server-side before lookup");
    const profileWrite = await app.request("/api/business/profiles", {
      method: "POST",
      headers: { ...forgedHeader, "content-type": "application/json" },
      body: JSON.stringify({ ownerId: "attacker", name: "forged profile", keywords: [marker] }),
    });
    assert.equal(profileWrite.status, 401, "a forged identity must not create a profile for another owner");
    assert.equal(createHash("sha256").update(fs.readFileSync(profilePath)).digest("hex"), profileHash, "unauthorized profile reads/writes must not alter the private profile store");

    const workflowRead = await app.request("/api/business/workflows/saved-filters?userId=attacker", { headers: forgedHeader });
    assert.equal(workflowRead.status, 401, "saved filters must not trust a caller-selected identity");
    assert.doesNotMatch(await workflowRead.text(), new RegExp(marker, "u"));
    const workflowWrite = await app.request("/api/business/workflows/favorites", {
      method: "POST",
      headers: { ...forgedHeader, "content-type": "application/json" },
      body: JSON.stringify({ userId: "attacker", opportunityId: "forged-opportunity" }),
    });
    assert.equal(workflowWrite.status, 401, "a forged identity must not create private workflow data");
    const workflowDelete = await app.request("/api/business/workflows/saved-filters/private-filter?userId=attacker", { method: "DELETE", headers: forgedHeader });
    assert.equal(workflowDelete.status, 401, "a forged identity must not delete another user's saved filter");
    assert.equal(createHash("sha256").update(fs.readFileSync(workflowsPath)).digest("hex"), workflowsHash, "unauthorized workflow reads/writes must leave private data unchanged");

    assert.equal((await app.request("/api/business/editions/guangzhou")).status, 200, "public business discovery must remain available without a private identity");

    const publicWeekly = await app.request("/api/opportunity-v2/workbench/actions/weekly");
    assert.equal(publicWeekly.status, 200, "absence of a login resolver must not block public weekly actions");
    assert.equal(createHash("sha256").update(fs.readFileSync(storePath)).digest("hex"), beforeHash);
    assert.equal(fs.readFileSync(storePath).toString(), before.toString());
    console.log("ICH_V15_IDENTITY: PASS (real createApp routes; forged private read/write denied; store unchanged; public weekly remains 200)");
  } finally {
    for (const [name, value] of previousEnv) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
