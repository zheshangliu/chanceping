import fs from "node:fs";

type Check = {
  id: string;
  passed: boolean;
  detail: string;
};

const REQUIRED_TAG = "release-procurement-phase1-2b-20260913-f514ee6";
const REQUIRED_COMMIT = "f514ee6b624dc2bb5abf12bb317cb30c37bedb5d";

function readText(path: string): string {
  return fs.readFileSync(path, "utf8");
}

function check(id: string, passed: boolean, detail: string): Check {
  return { id, passed: Boolean(passed), detail };
}

const workflowPath = ".github/workflows/deploy-procurement-phase1.yml";
const invokeScriptPath = "scripts/invoke-aliyun-swas-procurement-phase1.cjs";

const workflow = readText(workflowPath);
const invoke = readText(invokeScriptPath);

const checks: Check[] = [
  check("workflow name", /name:\s*Deploy procurement Phase 1/.test(workflow), "workflow name should be Deploy procurement Phase 1"),
  check("workflow input default", workflow.includes(`default: ${REQUIRED_TAG}`), "workflow default must be the fixed procurement tag"),
  check("workflow dispatch", workflow.includes("workflow_dispatch"), "workflow_dispatch trigger must exist"),
  check(
    "governed verification",
    workflow.includes("npm run verify:procurement:phase1:rollout-control"),
    "workflow must run rollout-control verification command",
  ),
  check("deploy checkout main", /ref:\s*main/.test(workflow), "deploy job should checkout main"),
  check("no ssh", !workflow.includes("ssh -"), "workflow should not invoke SSH"),
  check(
    "no strict host key bypass",
    !workflow.includes("StrictHostKeyChecking=no"),
    "workflow should not disable SSH host-key verification",
  ),
  check("invoke env", workflow.includes("CHANCEPING_DEPLOY_REF:"), "deploy step should pass CHANCEPING_DEPLOY_REF"),
  check(
    "exact tag lock",
    invoke.includes(`\"${REQUIRED_TAG}\"`) && invoke.includes(`\"${REQUIRED_COMMIT}\"`),
    "invoke script must hardcode the expected tag and commit",
  ),
  check("phase marker a", invoke.includes("# ----- Phase A: preflight -----"), "should include preflight phase marker"),
  check("phase marker b", invoke.includes("# ----- Phase B: freeze timer -----"), "should include timer-freeze phase marker"),
  check("phase marker c", invoke.includes("# ----- Phase C/D: exact target resolved and release deploy -----"), "should include deploy phase marker"),
  check("phase marker f", invoke.includes("# ----- Phase F: persistent migration ----"), "should include migration phase marker"),
  check("preflight snapshot", invoke.includes("collect_snapshot"), "should collect preflight snapshot"),
  check("timer freeze", invoke.includes("systemctl stop \\\"$TIMER_NAME\\\""), "should freeze timer before mutation"),
  check("preflight backup", invoke.includes("backup_runtime_file \\\"$SOURCES_PATH\\\" sources.json"), "must backup sources.json before deploy"),
  check("exact target fetch", invoke.includes("git -C \\\"$RUN_REPO_DIR\\\" fetch --no-tags origin \\\"$DEPLOY_TAG\\\""), "must fetch exact deploy tag"),
  check(
    "atomic release deploy call",
    invoke.includes("CHANCEPING_SERVER_REPO_DIR=\\\"$RUN_REPO_DIR\\\" bash \\\"$helper\\\" \\\"$deploy_commit\\\""),
    "must call deploy-release.sh via helper",
  ),
  check("smoke checks", invoke.includes("run_http \\\"$BASE_URL/api/opportunity-v2/radar\\\""), "should run smoke check on radar API"),
  check("migration", invoke.includes("Phase F: persistent migration"), "migration block should exist"),
  check("canary pass1", invoke.includes("run_canary_pass pass1"), "must run canary pass1"),
  check("canary pass2", invoke.includes("run_canary_pass pass2"), "must run canary pass2"),
  check("stable state marker", invoke.includes("write_audit STABLE \\\"rollout completed\\\""), "should emit stable status on success"),
  check("rollback function", invoke.includes("rollback() {"), "rollback function should exist"),
  check("rollback trap", invoke.includes("trap 'rollback \\\"ERR trap\\\"' ERR"), "rollback trap should be installed"),
  check(
    "backup path",
    invoke.includes("/var/lib/chanceping/backups/opportunity-v2-phase1-2b"),
    "backups should be written under fixed procurement path",
  ),
  check(
    "required procurement ids",
    ["proc-uk-fts", "proc-ca-canadabuys", "proc-cn-ccgp", "proc-cn-cib", "proc-global-ocp", "proc-eu-ted", "proc-wb"].every((id) =>
      invoke.includes(`'${id}'`) || invoke.includes(`\"${id}\"`) || invoke.includes(` ${id} `),
    ),
    "migration/canary source IDs should be present",
  ),
  check(
    "canary dual pass",
    invoke.includes("run_canary_pass pass1") && invoke.includes("run_canary_pass pass2"),
    "must run two canary passes",
  ),
  check(
    "rollback hook",
    invoke.includes("rollback() {") && invoke.includes("trap 'rollback \\\"ERR trap\\\"' ERR"),
    "rollback function + ERR trap should exist",
  ),
  check(
    "timer restore",
    invoke.includes("if [ \\\"$timer_before_enabled\\\" = \\\"1\\\" ]; then")
      && invoke.includes("systemctl start \\\"$TIMER_NAME\\\"")
      && invoke.includes("systemctl stop \\\"$TIMER_NAME\\\""),
    "timer should restore to prior state",
  ),
];

const failed = checks.filter((checkItem) => !checkItem.passed);
if (failed.length > 0) {
  console.error(`procurement phase1 rollout control: ${checks.length - failed.length}/${checks.length} checks passed`);
  for (const item of failed) {
    console.error(`FAIL: ${item.id}`);
    console.error(`  ${item.detail}`);
  }
  process.exit(1);
}

console.log(`procurement phase1 rollout control: PASS (${checks.length}/${checks.length} checks)`);
console.log(`workflow file: ${workflowPath}`);
console.log(`invoke script: ${invokeScriptPath}`);
