import assert from "node:assert/strict";
import fs from "node:fs";

const workflow = fs.readFileSync(".github/workflows/run-ich-production-cycle.yml", "utf8");
const caller = fs.readFileSync("scripts/invoke-aliyun-swas-deploy.cjs", "utf8");
const remoteCommand = fs.readFileSync("scripts/ich-production-cycle-remote-command.cjs", "utf8");
const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8")) as { scripts?: Record<string, string> };

assert.match(workflow, /workflow_dispatch:/u, "the protected cycle is an explicit manual workflow");
assert.match(workflow, /if: github\.ref == 'refs\/heads\/main'/gu, "verification and mutation jobs are main-only");
assert.match(workflow, /group: chanceping-production[\s\S]*cancel-in-progress: false/u, "the cycle shares the production deployment mutex");
assert.match(workflow, /environment:\s*\n\s+name: production/u, "the mutating job uses the protected production environment");
assert.match(workflow, /CHANCEPING_SWAS_ACTION: cycle/u, "the workflow calls the fixed server-local cycle action");
assert.match(remoteCommand, /systemctl cat chanceping-opportunity-v2\.timer/u, "the existing timer unit is checked");
assert.match(remoteCommand, /OnUnitActiveSec=72h/u, "a timer with a different cadence fails closed");
assert.match(remoteCommand, /systemctl enable --now chanceping-opportunity-v2\.timer/u, "the existing 72-hour timer is enabled idempotently");
assert.match(remoteCommand, /systemctl is-enabled --quiet chanceping-opportunity-v2\.timer/u, "timer enabled state is verified, not assumed");
assert.match(remoteCommand, /systemctl is-active --quiet chanceping-opportunity-v2\.timer/u, "timer active state is verified, not assumed");
assert.match(remoteCommand, /systemctl list-timers --all --no-legend chanceping-opportunity-v2\.timer/u, "the actual scheduled next trigger is read");
assert.match(remoteCommand, /NextElapseUSecRealtime/u, "runtime next_run_at is checked against systemd's actual next timer instant");
assert.match(remoteCommand, /Math\.abs\(runtimeMs-timerMs\)/u, "runtime and systemd next-run timestamps must be within the timer accuracy window");
assert.match(remoteCommand, /systemctl show chanceping-opportunity-v2\.service --property=ExecStart/u, "the existing service command is checked before execution");
assert.match(remoteCommand, /run-ich-production-cycle/u, "the fixed service target is the protected Fetch → Translate → Audit runner");
assert.match(remoteCommand, /systemctl start chanceping-opportunity-v2\.service \|\| service_start_exit=\$\?/u, "a non-zero oneshot exit does not hide its fresh terminal manifest");
assert.match(remoteCommand, /failure_code:m\.failure_code/u, "sanitized cycle failure classification is included in the workflow artifact");
assert.doesNotMatch(caller, /CHANCEPING_ICH_ADMIN_TOKEN/u, "no administrator bearer token is sent through the cloud command");
assert.match(remoteCommand, /status=\$\(printf/u, "the cycle runner checks its terminal status");
assert.match(remoteCommand, /\[ \\"\$status\\" = COMPLETED_WITH_BACKLOG \]/u, "a cycle with only bounded backlog can complete successfully");
assert.match(remoteCommand, /\[ \\"\$service_start_exit\\" -eq 0 \]/u, "only a successful service exit can pass");
assert.ok(packageJson.scripts?.["opportunity:v2:run"]?.includes("run-ich-production-cycle"), "the existing 72-hour service command resolves to the protected cycle");

console.log("ICH_V15_PROTECTED_RUNNER: PASS (main-only workflow; protected production environment; shared deployment lock; verified 72h timer/service; no admin token; degraded cycles fail promptly)");
