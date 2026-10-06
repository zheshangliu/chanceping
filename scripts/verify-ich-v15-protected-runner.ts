import assert from "node:assert/strict";
import fs from "node:fs";

const workflow = fs.readFileSync(".github/workflows/run-ich-production-cycle.yml", "utf8");
const caller = fs.readFileSync("scripts/invoke-aliyun-swas-deploy.cjs", "utf8");
const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8")) as { scripts?: Record<string, string> };

assert.match(workflow, /workflow_dispatch:/u, "the protected cycle is an explicit manual workflow");
assert.match(workflow, /if: github\.ref == 'refs\/heads\/main'/gu, "verification and mutation jobs are main-only");
assert.match(workflow, /group: chanceping-production[\s\S]*cancel-in-progress: false/u, "the cycle shares the production deployment mutex");
assert.match(workflow, /environment:\s*\n\s+name: production/u, "the mutating job uses the protected production environment");
assert.match(workflow, /CHANCEPING_SWAS_ACTION: cycle/u, "the workflow calls the fixed server-local cycle action");
assert.match(caller, /systemctl cat chanceping-opportunity-v2\.timer/u, "the existing timer unit is checked");
assert.match(caller, /OnUnitActiveSec=72h/u, "a timer with a different cadence fails closed");
assert.match(caller, /systemctl enable --now chanceping-opportunity-v2\.timer/u, "the existing 72-hour timer is enabled idempotently");
assert.match(caller, /systemctl show chanceping-opportunity-v2\.service --property=ExecStart/u, "the existing service command is checked before execution");
assert.match(caller, /run-ich-production-cycle/u, "the fixed service target is the protected Fetch → Translate → Audit runner");
assert.doesNotMatch(caller, /CHANCEPING_ICH_ADMIN_TOKEN/u, "no administrator bearer token is sent through the cloud command");
assert.match(caller, /status=\$\(printf/u, "the cycle runner checks its terminal status");
assert.ok(caller.includes('if [ \\"$status\\" = COMPLETED ]; then exit 0; else exit 2; fi'), "DEGRADED and FAILED terminal cycles fail promptly instead of timing out");
assert.ok(packageJson.scripts?.["opportunity:v2:run"]?.includes("run-ich-production-cycle"), "the existing 72-hour service command resolves to the protected cycle");

console.log("ICH_V15_PROTECTED_RUNNER: PASS (main-only workflow; protected production environment; shared deployment lock; verified 72h timer/service; no admin token; degraded cycles fail promptly)");
