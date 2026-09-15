import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const requireFromHere = createRequire(__filename);
const { buildBootstrapCommand } = requireFromHere(path.resolve("scripts/invoke-aliyun-swas-procurement-phase1.cjs")) as { buildBootstrapCommand: (options: Record<string, string>) => string };
const command = buildBootstrapCommand({
  deployRef: "release-procurement-phase1-2b-20260913-f514ee6",
  expectedCommit: "f514ee6b624dc2bb5abf12bb317cb30c37bedb5d",
  controlPlaneCommit: "0123456789abcdef0123456789abcdef01234567",
  repoDir: "/opt/chanceping",
});
const prefix = command.slice(0, command.indexOf("export CONTROL_PLANE_COMMIT"));
assert.doesNotThrow(() => execFileSync("/bin/dash", ["-n", "-c", prefix]), "Cloud Assistant bootstrap prefix must be /bin/sh syntax");
execFileSync("/bin/dash", ["-eu", "-c", `${prefix}\nprintf 'posix-bootstrap-ok\\n'`], { stdio: "pipe" });
assert.doesNotMatch(prefix, /set -[^\n]*pipefail/iu, "POSIX bootstrap must not request Bash-only pipefail");
console.log("PROCUREMENT_BOOTSTRAP_POSIX: PASS");
