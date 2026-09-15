import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

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
const productionWorkflowPath = ".github/workflows/deploy-production.yml";
const invokeScriptPath = "scripts/invoke-aliyun-swas-procurement-phase1.cjs";
const rolloutScriptPath = "scripts/procurement-phase1-production-rollout.sh";

const workflow = readText(workflowPath);
const productionWorkflow = readText(productionWorkflowPath);
const controller = readText(invokeScriptPath);
const rollout = fs.existsSync(rolloutScriptPath) ? readText(rolloutScriptPath) : "";
const escapedRollout = rollout.replaceAll('"', '\\"');
const invoke = `${controller}\n${rollout}\n${escapedRollout}`;
const transaction = rollout || controller;
const requireFromVerifier = createRequire(path.resolve("scripts/verify-procurement-phase1-rollout-control.ts"));
let bootstrapCommand = "";
try {
  const invokeModule = requireFromVerifier(path.resolve(invokeScriptPath)) as {
    buildBootstrapCommand?: (options: Record<string, string>) => string;
  };
  if (typeof invokeModule.buildBootstrapCommand === "function") {
    bootstrapCommand = invokeModule.buildBootstrapCommand({
      deployRef: REQUIRED_TAG,
      expectedCommit: REQUIRED_COMMIT,
      controlPlaneCommit: "0123456789abcdef0123456789abcdef01234567",
      repoDir: "/opt/chanceping",
      canaryEnabled: "1",
    });
  }
} catch {
  bootstrapCommand = "";
}
const bootstrapPlaintextBytes = Buffer.byteLength(bootstrapCommand, "utf8");
const bootstrapBase64Bytes = Buffer.byteLength(Buffer.from(bootstrapCommand, "utf8").toString("base64"), "utf8");
const candidateStart = workflow.indexOf("candidate-verify:");
const controlPlaneStart = workflow.indexOf("control-plane-verify:");
const deployStart = workflow.indexOf("\n  deploy:");
const candidateSection = workflow.slice(candidateStart, controlPlaneStart);
const controlPlaneSection = workflow.slice(controlPlaneStart, deployStart);
const phaseB = transaction.indexOf("# ----- Phase B: freeze timer and wait for scheduler quiescence -----");
const phaseC = transaction.indexOf("# ----- Phase C: runtime backup and read-only snapshot -----");
const phaseDeploy = transaction.indexOf("# ----- Phase C/D: exact target resolved and release deploy -----");
const phaseF = transaction.indexOf("# ----- Phase F: persistent migration ----");
const run1Quality = transaction.indexOf("# ----- Run 1 production quality gate -----");
const run2 = transaction.indexOf("capture_pool_identities run_2");
const pass1 = transaction.indexOf("run_canary_pass pass1");
const pass2 = transaction.indexOf("run_canary_pass pass2");
const run2Quality = transaction.indexOf("# ----- Run 2 production quality gate -----");
const idempotency = transaction.indexOf("compare_run_idempotency", pass2);
const crossSourceAudit = transaction.indexOf("cross-source-dedup.json");
const timerRestore = transaction.indexOf("restore_timer_state", run2);
const stableMarker = transaction.indexOf("write_audit STABLE");
const finalStableAssertion = transaction.lastIndexOf("assert_phase1_stable_state");
const applySourceStateStart = transaction.indexOf("apply_source_state() {");
const runDirectSourceStart = transaction.indexOf("run_direct_source() {", applySourceStateStart);
const applySourceStateSection = transaction.slice(applySourceStateStart, runDirectSourceStart);
const firstIndexAfter = (needle: string, start: number): number => transaction.indexOf(needle, start);

const checks: Check[] = [
  check("workflow name", /name:\s*Deploy procurement Phase 1/.test(workflow), "workflow name should be Deploy procurement Phase 1"),
  check("workflow input default", workflow.includes(`default: ${REQUIRED_TAG}`), "workflow default must be the fixed procurement tag"),
  check("workflow dispatch", workflow.includes("workflow_dispatch"), "workflow_dispatch trigger must exist"),
  check("candidate verify job", workflow.includes("candidate-verify:"), "candidate verification must be a separate job"),
  check("control-plane verify job", workflow.includes("control-plane-verify:"), "control-plane verification must be a separate job"),
  check("candidate checkout is immutable input", workflow.includes("ref: ${{ inputs.git_ref }}"), "candidate verification must checkout the immutable input ref"),
  check("control-plane checkout is immutable run sha", workflow.includes("ref: ${{ github.sha }}"), "control-plane verification/deploy must checkout the workflow commit"),
  check("candidate gates", ["npm run typecheck", "npm run verify:v15:e2e", "npm run verify:v15", "npm run verify:v16", "npm run verify:all", "npm run verify:ich:v211", "npm run verify:ich:procurement:semantic"].every((command) => candidateSection.includes(command)), "candidate job must run the complete candidate gate set"),
  check("candidate excludes control-plane gate", !candidateSection.includes("verify:procurement:phase1:rollout-control"), "immutable candidate must not run the control-plane-only verifier"),
  check("control-plane gate", controlPlaneSection.includes("npm run verify:procurement:phase1:rollout-control"), "control-plane job must run the rollout-control verifier"),
  check("deploy waits for both verification jobs", workflow.includes("needs: [candidate-verify, control-plane-verify]"), "deploy must require both candidate and control-plane verification"),
  check(
    "governed verification",
    workflow.includes("npm run verify:procurement:phase1:rollout-control"),
    "workflow must run rollout-control verification command",
  ),
  check("standalone rollout script", rollout.includes("# ----- Phase A: preflight -----") && rollout.includes("# ----- Phase F: persistent migration ----") && rollout.includes("rollback() {"), "full transactional rollout must live in the standalone server-side script"),
  check("bootstrap only", !controller.includes("PRODUCTION_QUALITY_GATE") && !controller.includes("CROSS_SOURCE_DEDUP_GATE") && !controller.includes("run_canary_pass() {") && !controller.includes("rollback() {") && controller.includes("scripts/procurement-phase1-production-rollout.sh"), "SWAS RunCommand must contain only the pinned helper bootstrap"),
  check("control-plane commit pinned", workflow.includes("CHANCEPING_CONTROL_PLANE_COMMIT: ${{ github.sha }}") && controller.includes("CONTROL_PLANE_COMMIT") && controller.includes("FETCH_HEAD") && controller.includes("scripts/procurement-phase1-production-rollout.sh"), "bootstrap must fetch and verify the exact workflow control-plane commit"),
  check("business release commit unchanged", controller.includes(REQUIRED_TAG) && controller.includes(REQUIRED_COMMIT) && rollout.includes(REQUIRED_TAG) && rollout.includes(REQUIRED_COMMIT), "business candidate tag and commit must remain immutable"),
  check("SWAS payload gate", bootstrapPlaintextBytes > 0 && bootstrapPlaintextBytes <= 8192 && bootstrapBase64Bytes > 0 && bootstrapBase64Bytes <= 8192, `bootstrap payload must be <= 8192 bytes (plaintext=${bootstrapPlaintextBytes}, base64=${bootstrapBase64Bytes})`),
  check("rollback restart hard gate", rollout.includes('systemctl restart "$SERVICE_NAME"') && !rollout.includes('systemctl restart "$SERVICE_NAME" || true'), "rollback must fail when chanceping.service restart fails"),
  check("rollback /health hard gate", rollout.includes('run_http "$BASE_URL/health"') && !rollout.includes('run_http "$BASE_URL/health" || true'), "rollback must fail when /health fails"),
  check("rollback /ich hard gate", rollout.includes('run_http "$BASE_URL/ich"') && !rollout.includes('run_http "$BASE_URL/ich" || true'), "rollback must fail when /ich fails"),
  check("rollback failed path", rollout.includes("ROLLBACK_FAILED") && rollout.includes("runtime checksum mismatch") && rollout.includes("exit 1"), "rollback failures must be audited as ROLLBACK_FAILED and exit non-zero"),
  check("default-main dispatch guard", workflow.includes("if: github.ref == 'refs/heads/main'"), "production deploy job must only run when dispatched from main"),
  check("production concurrency", workflow.includes("group: chanceping-production") && productionWorkflow.includes("group: chanceping-production"), "both production workflows must share the production concurrency group"),
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
  check("phase marker b", invoke.includes("# ----- Phase B: freeze timer and wait for scheduler quiescence -----"), "should include timer-freeze phase marker"),
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
  check("business migration helper", invoke.includes("migrateOpportunityV2Sources"), "migration must call the business source migration helper"),
  check("migration membership validation", invoke.includes("unexpected added source ids") && invoke.includes("source membership loss"), "migration must validate membership preservation and unexpected additions"),
  check("required canary state validation", invoke.includes("proc-cn-ccgp") && invoke.includes("enabled") && invoke.includes("PENDING"), "migration must validate procurement canary state"),
  check("business source state helper", invoke.includes("setOpportunityV2SourceState"), "canary state changes must use the business source state helper"),
  check("missing source stops rollout", invoke.includes("Source not found") || invoke.includes("source missing"), "missing canary sources must stop the rollout"),
  check("direct canary runner", invoke.includes("runOpportunityV2Source"), "canaries must invoke the runtime runner directly"),
  check("canary result validation", invoke.includes("fetched_sources") && invoke.includes("successful_sources") && invoke.includes("source_health") && invoke.includes("items_seen"), "canaries must validate source run results"),
  check("exported runtime paths", invoke.includes("export SOURCES_PATH") && invoke.includes("export OPPORTUNITIES_PATH") && invoke.includes("export BACKUP_PRE_FLIGHT"), "shell paths used by Node must be exported"),
  check("no HTTP canary", !invoke.includes("curl -fsS -X POST") && !invoke.includes("/api/opportunity-v2/sources/$source_id/run"), "canaries must not use the HTTP admin run endpoint"),
  check("no manual source registry", !invoke.includes("REQUIRED_SOURCE_IDS") && !invoke.includes("requiredSources = [") && !invoke.includes("set_source_state() {"), "source migration/state must not manually rewrite a registry"),
  check("no direct source-state write", !invoke.includes("fs.writeFileSync(process.env.SOURCES_PATH") && !applySourceStateSection.includes("writeFileSync"), "source state must be changed only through the business helper"),
  check("successful canary keeps active state", invoke.includes("apply_source_state \\\"$source_id\\\" 1 ACTIVE") && !invoke.includes("original_enabled") && !invoke.includes("original_status"), "successful canaries must remain enabled and ACTIVE instead of restoring disabled/PENDING"),
  check("READY_CORE state gate", invoke.includes("assert_ready_core_state()") && ["proc-cn-ccgp", "proc-cn-cib", "proc-global-ocp", "proc-eu-ted", "proc-wb"].every((id) => invoke.includes(id)), "must assert all five READY_CORE source states"),
  check("run1 quality after activation", pass1 >= 0 && run1Quality > pass1 && transaction.includes("assert_ready_core_state run1") && transaction.indexOf("assert_ready_core_state run1", pass1) < run1Quality, "Run 1 quality must run after READY_CORE activation"),
  check("no pending restore before run1 quality", run1Quality >= 0 && !invoke.slice(pass1, run1Quality).includes("PENDING\""), "successful canary must not restore PENDING before Run 1 quality"),
  check("run2 quality gate", run2Quality > pass2 && invoke.includes("run_production_quality_gate run2"), "Run 2 must execute the shared production quality gate"),
  check("run2 quality ordering", run2Quality > pass2 && idempotency > run2Quality && timerRestore > idempotency, "Run 2 quality must precede idempotency and timer restoration"),
  check("seven-source cross-source audit", crossSourceAudit > 0 && ["proc-uk-fts", "proc-ca-canadabuys", "proc-cn-ccgp", "proc-cn-cib", "proc-global-ocp", "proc-eu-ted", "proc-wb"].every((id) => invoke.includes(id)), "cross-source audit must cover existing UK/Canada and all procurement canaries"),
  check("business dedup audit", invoke.includes("deduplicateOpportunityV2") && invoke.includes("merged_discovered_by_sources") && invoke.includes("canonical_duplicate_count"), "cross-source audit must reuse business dedup semantics"),
  check("final stable gate ordering", finalStableAssertion > 0 && stableMarker > finalStableAssertion && invoke.includes("duplicate_opportunities") && invoke.includes("first_seen_at_preserved") && invoke.includes("discovered_by_sources_safe"), "STABLE must be written only after the final state and regression gate"),
  check("scheduler quiescence hard stop", invoke.includes("QUIESCE_TIMEOUT_SECONDS") && invoke.includes("while systemctl is-active \\\"$OP_SERVICE\\\" --quiet") && invoke.includes("stopping rollout before deploy"), "scheduler must be inactive before backup/deploy and timeout must stop rollout"),
  check("timer freeze before backup", phaseB >= 0 && firstIndexAfter("systemctl stop", phaseB) >= 0 && phaseC > firstIndexAfter("systemctl stop", phaseB) && firstIndexAfter("backup_runtime_file", phaseC) > phaseC, "timer freeze must precede runtime backup"),
  check("backup before exact deploy", firstIndexAfter("backup_runtime_file", phaseC) >= 0 && phaseDeploy > firstIndexAfter("backup_runtime_file", phaseC), "runtime backup must precede exact release deploy"),
  check("exact runtime absent-state backup", invoke.includes("EXISTS >") && invoke.includes("ABSENT >") && invoke.includes("rm -f -- \\\"$target\\\""), "runtime backup/restore must preserve absent and existing states"),
  check("rollback checksum verification", invoke.includes("verify_all_restored_runtime") && invoke.includes("ROLLBACK_FAILED") && invoke.includes("restored runtime checksum mismatch"), "rollback must verify restored runtime checksums and fail explicitly"),
  check("release manifest rollback", invoke.includes("backup_runtime_file \\\"$RELEASE_MANIFEST\\\" release-manifest.json") && invoke.includes("restore_runtime_file \\\"$RELEASE_MANIFEST\\\" \\\"$BACKUP_MANIFEST\\\""), "rollback must restore the predeploy manifest"),
  check("no manifest self-copy", !invoke.includes("cp \\\"$RELEASE_MANIFEST\\\" \\\"$RUN_REPO_DIR/release-manifest.json\\\""), "rollback must not copy the active manifest onto itself"),
  check("FETCH_HEAD exact commit", invoke.includes("rev-parse --verify 'FETCH_HEAD^{commit}'") && !invoke.includes("rev-parse --verify \"$DEPLOY_TAG^{commit}\""), "deploy must resolve the fetched commit from FETCH_HEAD"),
  check("active timer restore", invoke.includes("timer_before_active") && invoke.includes("if [ \\\"$timer_before_active\\\" = \\\"1\\\" ]; then") && invoke.includes("restore_timer_state"), "success and rollback must restore timer active state independently"),
  check("timer state assertion", invoke.includes("verify_timer_state()") && invoke.includes("timer enabled state mismatch") && invoke.includes("timer active state mismatch"), "timer restoration must be verified, not only requested"),
  check("run1 quality gate before run2", run1Quality > 0 && run2 > run1Quality && invoke.includes("quality_result") && invoke.includes("gates"), "Run 1 must pass the production quality gate before Run 2"),
  check("run2 idempotency before timer restore", run2 > 0 && invoke.includes("compare_run_idempotency") && timerRestore > run2, "Run 2 idempotency must be checked before timer restore"),
  check("source-level checkpoint", invoke.includes("checkpoint_canary") && invoke.includes("checkpoints/${pass_name}-${source_id}"), "each canary must checkpoint sources, pool, and health"),
  check("pool opportunities key", invoke.includes("parsed[key]") && invoke.includes("readSafe(poolPath, 'opportunities')") && !invoke.includes("parsed.sources || []"), "pool snapshot must read opportunities, not sources"),
  check("business regression identity snapshot", ["competition_ids", "memo_ids", "procurement_public_ids", "loewe", "pool"].every((field) => invoke.includes(field)), "predeploy snapshot must preserve complete business regression identities"),
  check("competition memo loewe regression", ["capture_postdeploy_public", "competition_unexplained_loss", "memo_unexplained_loss", "memo_parity", "loewe_preserved"].every((field) => invoke.includes(field)), "postdeploy regression must cover Competition, Memo parity, and LOEWE"),
  check("historical limitation recorded", invoke.includes("KNOWN_HISTORICAL_BASELINE_LIMITATION"), "historical baseline limitation must remain explicit"),
  check("full rollback canary policy", invoke.includes("CANARY_FAILURE_POLICY=FULL_ROLLBACK"), "canary failure must use an explicit full rollback policy"),
  check("production quality gate", ["seller_offer_leakage", "awarded_public", "closed_public", "cancelled_public", "construction_only_public", "generic_it_public", "unsafe_exact_deadline", "fake_exact_deadline", "deadline_source_mismatch", "buyer_label_bleed", "project_id_label_bleed", "procurement_method_label_bleed", "missing_domain_tag", "known_country_as_global", "aggregator_public_without_official_evidence", "encoding_errors", "known_false_positive_call_center", "manual_operation_keyword_false_positive", "generic_process_keyword_false_positive", "public_semantic_false_positive"].every((gate) => invoke.includes(gate)), "production must run every listed procurement quality gate"),
  check("cross-source dedup audit", invoke.includes("cross_source_dedup_audit") && invoke.includes("cross-source-dedup.json") && ["proc-cn-ccgp", "proc-cn-cib", "proc-global-ocp", "proc-eu-ted"].every((id) => invoke.includes(id)), "Run 2 must audit cross-source procurement canonical duplicates"),
  check("post-rollout remote smoke", workflow.includes("npm run verify:q7:aliyun-remote-smoke") && workflow.includes("CHANCEPING_DEPLOY_BASE_URL: https://www.chanceping.com"), "workflow must require the public remote smoke after rollout"),
  check("persistent timer follow-up", invoke.includes("persistent timer-triggered scheduler") && invoke.includes("run_production_quality_gate post-restore") && invoke.includes("capture_postdeploy_public"), "a Persistent timer-triggered run must be awaited and re-audited"),
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
    ["proc-cn-ccgp", "proc-cn-cib", "proc-global-ocp", "proc-eu-ted", "proc-wb"].every((id) =>
      invoke.includes(`'${id}'`) || invoke.includes(`\"${id}\"`) || invoke.includes(` ${id} `),
    ),
    "canary source IDs should be present while migration IDs remain owned by the business registry",
  ),
  check("migration uses business default registry", invoke.includes("DEFAULT_OPPORTUNITY_V2_SOURCES"), "migration must derive expected additions from the business default registry"),
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
