import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const rollout = fs.readFileSync("scripts/procurement-phase1-production-rollout.sh", "utf8");
const start = rollout.indexOf("capture_optional_json() {");
assert.ok(start >= 0, "rollout must provide an optional preflight JSON capture");
const end = rollout.indexOf("\n}\n", start);
assert.ok(end >= 0, "optional capture function must be closed");
const functionText = rollout.slice(start, end + 3);
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "chanceping-preflight-"));
try {
  const mockCurl = path.join(tempDir, "curl");
  fs.writeFileSync(mockCurl, "#!/bin/sh\nexit 22\n", { mode: 0o700 });
  const output = path.join(tempDir, "before.json");
  execFileSync("/bin/bash", ["-eu", "-c", `${functionText}\ncapture_optional_json https://legacy.invalid/api ${output}`], {
    env: { ...process.env, PATH: `${tempDir}:${process.env.PATH ?? ""}` },
    stdio: "pipe",
  });
  assert.deepEqual(JSON.parse(fs.readFileSync(output, "utf8")), { items: [] });
  console.log("PROCUREMENT_PREFLIGHT_LEGACY: PASS");
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
