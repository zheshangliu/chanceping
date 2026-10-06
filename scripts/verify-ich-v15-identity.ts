import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

async function main(): Promise<void> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "chanceping-v15-identity-"));
  const storePath = path.join(tempDir, "followups.json");
  const previousPath = process.env.CHANCEPING_PROCUREMENT_FOLLOWUP_PATH;
  process.env.CHANCEPING_PROCUREMENT_FOLLOWUP_PATH = storePath;
  const marker = "V15_PRIVATE_MARKER_MUST_NEVER_REACH_ANON";
  const fixture = {
    schema_version: "chanceping-procurement-followups.v1",
    records: [{ opportunity_id: "private-opportunity", owner_id: "attacker", status: "reviewing", note: marker, next_followup_at: null, updated_at: "2026-10-01T00:00:00.000Z", revision: 1 }],
    read_event_markers: [],
  };
  fs.writeFileSync(storePath, `${JSON.stringify(fixture, null, 2)}\n`);
  const before = fs.readFileSync(storePath);
  const beforeHash = createHash("sha256").update(before).digest("hex");

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

    const publicWeekly = await app.request("/api/opportunity-v2/workbench/actions/weekly");
    assert.equal(publicWeekly.status, 200, "absence of a login resolver must not block public weekly actions");
    assert.equal(createHash("sha256").update(fs.readFileSync(storePath)).digest("hex"), beforeHash);
    assert.equal(fs.readFileSync(storePath).toString(), before.toString());
    console.log("ICH_V15_IDENTITY: PASS (real createApp routes; forged private read/write denied; store unchanged; public weekly remains 200)");
  } finally {
    if (previousPath === undefined) delete process.env.CHANCEPING_PROCUREMENT_FOLLOWUP_PATH;
    else process.env.CHANCEPING_PROCUREMENT_FOLLOWUP_PATH = previousPath;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
