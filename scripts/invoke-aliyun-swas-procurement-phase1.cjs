#!/usr/bin/env node
"use strict";

const tls = require("tls");
tls.DEFAULT_MAX_VERSION = "TLSv1.2";

const { Config } = require("@alicloud/openapi-client");
const { RuntimeOptions } = require("@alicloud/tea-util");
const { RunCommandRequest, DescribeInvocationResultRequest } = require("@alicloud/swas-open20200601");
const SwasOpen = require("@alicloud/swas-open20200601").default;

const EXPECTED_TAG = "release-procurement-phase1-2b-20260913-f514ee6";
const EXPECTED_COMMIT = "f514ee6b624dc2bb5abf12bb317cb30c37bedb5d";

const DEPLOY_REF = process.env.CHANCEPING_DEPLOY_REF || EXPECTED_TAG;
const REGION = process.env.CHANCEPING_SWAS_REGION || "cn-hongkong";
const RUN_REPO_DIR = process.env.CHANCEPING_SERVER_REPO_DIR || "/opt/chanceping";
const CANARY_ENABLED = process.env.CHANCEPING_PROCUREMENT_CANARY ?? "1";

if (DEPLOY_REF !== EXPECTED_TAG) {
  throw new Error(`Unsupported CHANCEPING_DEPLOY_REF: ${DEPLOY_REF}`);
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function shellQuote(value) {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

const instanceId = requiredEnv("CHANCEPING_SWAS_INSTANCE");
const accessKeyId = requiredEnv("ALIBABA_CLOUD_ACCESS_KEY_ID");
const accessKeySecret = requiredEnv("ALIBABA_CLOUD_ACCESS_KEY_SECRET");
const commandTimeout = Number(process.env.CHANCEPING_DEPLOY_COMMAND_TIMEOUT || "1800");

if (!Number.isInteger(commandTimeout) || commandTimeout < 60 || commandTimeout > 86400) {
  throw new Error("CHANCEPING_DEPLOY_COMMAND_TIMEOUT must be an integer from 60 to 86400");
}

const quoted = {
  deployRef: shellQuote(DEPLOY_REF),
  expectedCommit: shellQuote(EXPECTED_COMMIT),
  repoDir: shellQuote(RUN_REPO_DIR),
};

const command = [
  "set -Eeuo pipefail",
  "set -o pipefail",
  `readonly DEPLOY_TAG=${quoted.deployRef}`,
  `readonly EXPECTED_TAG=${shellQuote(EXPECTED_TAG)}`,
  `readonly EXPECTED_COMMIT=${quoted.expectedCommit}`,
  `readonly CANARY_ENABLED='${CANARY_ENABLED}'`,
  `readonly RUN_REPO_DIR=${quoted.repoDir}`,
  "readonly BACKUP_ROOT=/var/lib/chanceping/backups/opportunity-v2-phase1-2b-$(date -u +%Y%m%dT%H%M%SZ)",
  "readonly BACKUP_SOURCE_BACKUP=${BACKUP_ROOT}/sources.json",
  "readonly BACKUP_POOL_BACKUP=${BACKUP_ROOT}/opportunities.json",
  "readonly BACKUP_HEALTH_BACKUP=${BACKUP_ROOT}/source-health.json",
  "readonly BACKUP_SCHEDULER_BACKUP=${BACKUP_ROOT}/scheduler.json",
  "readonly BACKUP_MANIFEST=${BACKUP_ROOT}/preflight-manifest.json",
  "readonly BACKUP_PRE_FLIGHT=${BACKUP_ROOT}/preflight.json",
  "readonly AUDIT_FILE=${BACKUP_ROOT}/rollout-audit.json",
  "readonly RELEASE_MANIFEST=${RUN_REPO_DIR}/release-manifest.json",
  "readonly CURRENT_LINK=${RUN_REPO_DIR}/current",
  "readonly OP_V2_ROOT=/var/lib/chanceping/opportunity-v2",
  "readonly SOURCES_PATH=${OP_V2_ROOT}/sources.json",
  "readonly OPPORTUNITIES_PATH=${OP_V2_ROOT}/opportunities.json",
  "readonly SOURCE_HEALTH_PATH=${OP_V2_ROOT}/source-health.json",
  "readonly SCHEDULER_PATH=${OP_V2_ROOT}/scheduler.json",
  "readonly SERVICE_NAME=chanceping",
  "readonly TIMER_NAME=chanceping-opportunity-v2.timer",
  "readonly OP_SERVICE=chanceping-opportunity-v2.service",
  "readonly BASE_URL=http://127.0.0.1:3000",
  "readonly CANARY_SOURCES=(proc-cn-ccgp proc-cn-cib proc-global-ocp proc-eu-ted proc-wb)",
  "readonly REQUIRED_SOURCE_IDS=(proc-uk-fts proc-ca-canadabuys proc-cn-ccgp proc-cn-cib proc-global-ocp proc-eu-ted proc-wb)",
  "",
  "mkdir -p \"$BACKUP_ROOT\"",
  "mkdir -p \"$BACKUP_ROOT/.meta\"",
  "runtime_before_commit=unknown",
  "previous_release=\"\"",
  "timer_before_enabled=0",
  "timer_before_active=0",
  "op_service_before_active=0",
  "",
  "write_audit() {",
  "  local status=\"$1\"",
  "  local message=\"$2\"",
  "  cp \"$BACKUP_PRE_FLIGHT\" \"$AUDIT_FILE.pre\" 2>/dev/null || true",
  "  cat <<JSON > \"$AUDIT_FILE\"",
  "  {",
  "    \"status\": \"$status\",",
  "    \"message\": \"$message\",",
  "    \"deployTag\": \"$DEPLOY_TAG\",",
  "    \"expectedCommit\": \"$EXPECTED_COMMIT\",",
  "    \"runtimeBeforeCommit\": \"$runtime_before_commit\",",
  "    \"previousRelease\": \"$previous_release\",",
  "    \"timerEnabledBefore\": \"$timer_before_enabled\",",
  "    \"timerActiveBefore\": \"$timer_before_active\",",
  "    \"opServiceActiveBefore\": \"$op_service_before_active\",",
  "    \"backupRoot\": \"$BACKUP_ROOT\",",
  "    \"generatedAt\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"",
  "  }",
  "JSON",
  "}",
  "",
  "collect_snapshot() {",
  "  node - <<'NODE'",
  "const fs = require('fs');",
  "const path = process.env.BACKUP_PRE_FLIGHT;",
  "const runtimePath = process.env.SOURCES_PATH;",
  "const poolPath = process.env.OPPORTUNITIES_PATH;",
  "function readSafe(filePath, key) {",
  "  if (!fs.existsSync(filePath)) return { count: 0, ids: [] };",
  "  const raw = fs.readFileSync(filePath, 'utf8');",
  "  if (!raw.trim()) return { count: 0, ids: [] };",
  "  const parsed = JSON.parse(raw);",
  "  const rows = Array.isArray(parsed) ? parsed : (parsed.sources || []);",
  "  const ids = Array.isArray(rows) ? rows.map((row) => row.id).filter(Boolean) : [];",
  "  return {",
  "    count: Array.isArray(rows) ? rows.length : 0,",
  "    ids: ids,",
  "  };",
  "}",
  "const sources = readSafe(runtimePath);",
  "const pool = readSafe(poolPath);",
  "fs.writeFileSync(path, JSON.stringify({ sources, pool }, null, 2));",
  "NODE",
  "}",
  "",
  "backup_runtime_file() {",
  "  local source=\"$1\"",
  "  local target=\"$2\"",
  "  if [ -f \"$source\" ]; then",
  "    cp \"$source\" \"$BACKUP_ROOT/$target\"",
  "    sha256sum \"$source\" > \"${BACKUP_ROOT}/$target.sha256\"",
  "    stat -c '%n %s %Y' \"$source\" > \"${BACKUP_ROOT}/$target.meta\"",
  "  fi",
  "}",
  "",
  "restore_runtime_file() {",
  "  local target=\"$1\"",
  "  local source=\"$2\"",
  "  if [ -f \"$source\" ]; then cp \"$source\" \"$target\"; fi",
  "}",
  "",
  "set_source_state() {",
  "  local source_id=\"$1\"",
  "  CP_SOURCE_ID=\"$source_id\" node - <<'NODE'",
  "const fs = require('fs');",
  "const sourceId = process.env.CP_SOURCE_ID;",
  "const path = process.env.SOURCES_PATH;",
  "if (!sourceId) { process.exit(0); }",
  "const raw = fs.existsSync(path) ? fs.readFileSync(path, 'utf8') : '{\"sources\":[]}'",
  "const parsed = JSON.parse(raw || '{\"sources\":[]}');",
  "const sources = Array.isArray(parsed) ? parsed : (parsed.sources || []);",
  "let hit = false;",
  "const next = sources.map((row) => {",
  "  if (row && row.id === sourceId) {",
  "    hit = true;",
  "    return { ...row, enabled: true, status: 'PENDING' };",
  "  }",
  "  return row;",
  "});",
  "if (!hit) {",
  "  next.push({ id: sourceId, enabled: true, status: 'PENDING' });",
  "}",
  "fs.writeFileSync(",
  "  path,",
  "  `${JSON.stringify({ schema_version: 'chanceping-opportunity-v2.sources.v1', updated_at: new Date().toISOString(), sources: next }, null, 2)}\\n`,",
  "  'utf8',",
  ");",
  "NODE",
  "}",
  "",
  "run_http() {",
  "  local url=\"$1\"",
  "  curl -fsS \"$url\" >/dev/null",
  "}",
  "",
  "run_canary_pass() {",
  "  local pass_name=\"$1\"",
  "  for source_id in \"${CANARY_SOURCES[@]}\"; do",
  "    set_source_state \"$source_id\"",
  "    sleep 1",
    "    curl -fsS -X POST \"$BASE_URL/api/opportunity-v2/sources/$source_id/run\" || {",
  "      echo \"run canary failed: $pass_name $source_id\" >&2",
  "      return 1",
  "    }",
    "    run_http \"$BASE_URL/api/opportunity-v2/sources/$source_id\" || true",
  "    sleep 1",
  "  done",
  "}",
  "",
  "rollback() {",
  "  local reason=\"$1\"",
  "  set +e",
  "  write_audit ROLLED_BACK \"rollback reason: $reason\"",
  "  if systemctl is-active \"$OP_SERVICE\" --quiet; then",
  "    systemctl stop \"$OP_SERVICE\" || true",
  "  fi",
  "  restore_runtime_file \"$SOURCES_PATH\" \"$BACKUP_SOURCE_BACKUP\"",
  "  restore_runtime_file \"$OPPORTUNITIES_PATH\" \"$BACKUP_POOL_BACKUP\"",
  "  restore_runtime_file \"$SOURCE_HEALTH_PATH\" \"$BACKUP_HEALTH_BACKUP\"",
  "  restore_runtime_file \"$SCHEDULER_PATH\" \"$BACKUP_SCHEDULER_BACKUP\"",
  "  if [ -n \"$previous_release\" ] && [ -d \"$previous_release\" ]; then",
  "    ln -sfn \"$previous_release\" \"$CURRENT_LINK\"",
  "  fi",
  "  if [ -f \"$RELEASE_MANIFEST\" ]; then",
  "    cp \"$RELEASE_MANIFEST\" \"$RUN_REPO_DIR/release-manifest.json\"",
  "  fi",
  "  if [ \"$timer_before_enabled\" = \"1\" ]; then",
  "    systemctl start \"$TIMER_NAME\" || true",
  "  else",
  "    systemctl stop \"$TIMER_NAME\" || true",
  "  fi",
  "  systemctl restart \"$SERVICE_NAME\" || true",
  "  run_http \"$BASE_URL/health\" || true",
  "  run_http \"$BASE_URL/ich\" || true",
  "  exit 1",
  "}",
  "",
  "trap 'rollback \"ERR trap\"' ERR",
  "",
  "# ----- Phase A: preflight -----",
  "if [ -L \"$CURRENT_LINK\" ]; then",
  "  previous_release=\"$(readlink -f \"$CURRENT_LINK\")\"",
  "fi",
  "runtime_before_commit=\"$(git -C \"$RUN_REPO_DIR\" rev-parse HEAD)\"",
  "systemctl is-enabled \"$TIMER_NAME\" --quiet && timer_before_enabled=1 || timer_before_enabled=0",
  "systemctl is-active \"$TIMER_NAME\" --quiet && timer_before_active=1 || timer_before_active=0",
  "systemctl is-active \"$OP_SERVICE\" --quiet && op_service_before_active=1 || op_service_before_active=0",
  "backup_runtime_file \"$SOURCES_PATH\" sources.json",
  "backup_runtime_file \"$OPPORTUNITIES_PATH\" opportunities.json",
  "backup_runtime_file \"$SOURCE_HEALTH_PATH\" source-health.json",
  "backup_runtime_file \"$SCHEDULER_PATH\" scheduler.json",
  "node - <<'NODE'",
  "const fs = require('fs');",
  "const manifestPath = process.env.RELEASE_MANIFEST;",
  "if (!fs.existsSync(manifestPath)) {",
  "  process.exit(0);",
  "}",
  "const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));",
  "fs.writeFileSync(process.env.BACKUP_MANIFEST, JSON.stringify(manifest, null, 2));",
  "NODE",
  "collect_snapshot",
  "run_http \"$BASE_URL/health\"",
  "write_audit STAGED \"preflight complete\"",
  "",
  "# ----- Phase B: freeze timer -----",
  "systemctl stop \"$TIMER_NAME\"",
  "if [ \"$op_service_before_active\" = \"1\" ]; then",
  "  for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do",
  "    if ! systemctl is-active \"$OP_SERVICE\" --quiet; then",
  "      break",
  "    fi",
  "    sleep 2",
  "  done",
  "fi",
  "",
  "# ----- Phase C/D: exact target resolved and release deploy -----",
  "git -C \"$RUN_REPO_DIR\" fetch --no-tags origin \"$DEPLOY_TAG\"",
  "deploy_commit=\"$(git -C \"$RUN_REPO_DIR\" rev-parse --verify \"$DEPLOY_TAG^{commit}\")\"",
  "if [ \"$deploy_commit\" != \"$EXPECTED_COMMIT\" ]; then",
  "  rollback \"deploy commit mismatch: $deploy_commit\"",
  "fi",
  "helper=$(mktemp -t chanceping-release-proc-phase1.XXXXXX.sh)",
  "git -C \"$RUN_REPO_DIR\" show \"$deploy_commit:scripts/deploy-release.sh\" > \"$helper\"",
  "chmod 700 \"$helper\"",
  "CHANCEPING_SERVER_REPO_DIR=\"$RUN_REPO_DIR\" bash \"$helper\" \"$deploy_commit\"",
  "rm -f \"$helper\"",
  "",
  "run_http \"$BASE_URL/health\"",
  "run_http \"$BASE_URL/ich\"",
  "run_http \"$BASE_URL/ich/memo\"",
  "run_http \"$BASE_URL/ich/memo.json\"",
  "run_http \"$BASE_URL/ich/memo.md\"",
  "run_http \"$BASE_URL/api/opportunity-v2/radar\"",
  "run_http \"$BASE_URL/api/opportunity-v2/sources\"",
  "run_http \"$BASE_URL/opportunity-v2/admin/sources\"",
  "",
  "if [ ! -f \"$RUN_REPO_DIR/release-manifest.json\" ]; then",
  "  rollback \"release-manifest missing after deploy\"",
  "fi",
  "node - <<'NODE'",
  "const fs = require('fs');",
  "const path = `${process.env.RUN_REPO_DIR}/release-manifest.json`;",
  "const manifest = JSON.parse(fs.readFileSync(path, 'utf8'));",
  "if (!manifest || manifest.commit !== process.env.EXPECTED_COMMIT) {",
  "  process.exit(1);",
  "}",
  "NODE",
  "",
  "# ----- Phase F: persistent migration ----",
  "node - <<'NODE'",
  "const fs = require('fs');",
  "const path = process.env.SOURCES_PATH;",
  "const requiredSources = [",
  "  { id: 'proc-uk-fts', name: 'UK Find a Tender Source', url: 'https://www.crowncommercial.gov.uk/contracts-finder', region: 'GLOBAL', priority: 'P1', types: ['procurement'], radars: ['ich'], enabled: false, status: 'PENDING' },",
  "  { id: 'proc-ca-canadabuys', name: 'Canada Buy', url: 'https://buyandsell.gc.ca', region: 'GLOBAL', priority: 'P1', types: ['procurement'], radars: ['ich'], enabled: false, status: 'PENDING' },",
  "  { id: 'proc-cn-ccgp', name: '中国政府采购网', url: 'https://www.ccgp.gov.cn/cggg/', region: 'CN', priority: 'P1', types: ['procurement'], radars: ['ich'], enabled: false, status: 'PENDING' },",
  "  { id: 'proc-cn-cib', name: '中国招投标网', url: 'https://www.ccgp.gov.cn/', region: 'CN', priority: 'P1', types: ['procurement'], radars: ['ich'], enabled: false, status: 'PENDING' },",
  "  { id: 'proc-global-ocp', name: 'Open Contracting Platform', url: 'https://www.open-contracting.org/', region: 'GLOBAL', priority: 'P1', types: ['procurement'], radars: ['ich'], enabled: false, status: 'PENDING' },",
  "  { id: 'proc-eu-ted', name: 'TED', url: 'https://ted.europa.eu/en', region: 'GLOBAL', priority: 'P1', types: ['procurement'], radars: ['ich'], enabled: false, status: 'PENDING' },",
  "  { id: 'proc-wb', name: 'World Bank Procurement', url: 'https://www.worldbank.org/', region: 'GLOBAL', priority: 'P1', types: ['procurement'], radars: ['ich'], enabled: false, status: 'PENDING' },",
  "];",
  "const raw = fs.existsSync(path) ? fs.readFileSync(path, 'utf8') : '{\"sources\":[]}' ;",
  "const parsed = JSON.parse(raw || '{\"sources\":[]}');",
  "const sourceList = Array.isArray(parsed) ? parsed : (parsed.sources || []);",
  "const byId = new Map(sourceList.map((item) => [item.id, item]));",
  "for (const source of requiredSources) {",
  "  if (!byId.has(source.id)) {",
  "    byId.set(source.id, source);",
  "  } else {",
  "    const existing = byId.get(source.id) || {};",
  "    byId.set(source.id, { ...source, ...existing, id: source.id, enabled: existing.enabled ?? source.enabled, status: existing.status ?? source.status });",
  "  }",
  "}",
  "const next = Array.from(byId.values());",
  "fs.writeFileSync(process.env.SOURCES_PATH, `${JSON.stringify({",
  "  schema_version: 'chanceping-opportunity-v2.sources.v1',",
  "  updated_at: new Date().toISOString(),",
  "  sources: next,",
  "}, null, 2)}\\n`, 'utf8');",
  "NODE",
  "",
  "write_audit MIGRATED \"source migration applied\"",
  "",
  "if [ \"$CANARY_ENABLED\" = \"1\" ]; then",
  "  run_canary_pass pass1",
  "  run_http \"$BASE_URL/api/opportunity-v2/radar\"",
  "  run_canary_pass pass2",
  "fi",
  "",
  "# ----- restore timer according to original state after success -----",
  "if [ \"$timer_before_enabled\" = \"1\" ]; then",
  "  systemctl start \"$TIMER_NAME\"",
  "else",
  "  systemctl stop \"$TIMER_NAME\"",
  "fi",
  "",
  "trap - ERR",
  "write_audit STABLE \"rollout completed\"",
  "cat \"$AUDIT_FILE\"",
].join("\n");

const client = new SwasOpen(
  new Config({
    accessKeyId,
    accessKeySecret,
    regionId: REGION,
    endpoint: `swas.${REGION}.aliyuncs.com`,
    protocol: "https",
  }),
);

const runtime = new RuntimeOptions({
  timeout: 30000,
  readTimeout: 30000,
  connectTimeout: 15000,
  autoretry: true,
  maxAttempts: 3,
});

// Additional hardening: never leak proxy secrets into invocation context.
delete process.env.HTTP_PROXY;
delete process.env.HTTPS_PROXY;
delete process.env.http_proxy;
delete process.env.https_proxy;
delete process.env.ALL_PROXY;
delete process.env.all_proxy;

(async () => {
  const response = await client.runCommandWithOptions(
    new RunCommandRequest({
      instanceId,
      regionId: REGION,
      name: "chanceping-procurement-phase1",
      type: "RunShellScript",
      commandContent: command,
      timeout: commandTimeout,
    }),
    runtime,
  );
  const invokeId = response.body.invokeId;
  console.log(`Cloud Assistant invocation: ${invokeId}`);

  const maxPolls = Math.ceil(commandTimeout / 5) + 20;
  for (let attempt = 0; attempt < maxPolls; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    const resultResponse = await client.describeInvocationResultWithOptions(
      new DescribeInvocationResultRequest({
        invokeId,
        regionId: REGION,
        instanceId,
      }),
      runtime,
    );
    const result = resultResponse.body.invocationResult;
    if (!result) continue;
    const exitCode = result.exitCode ?? "unknown";
    const status = result.invocationStatus || "unknown";
    console.log(`Status: ${status} | ExitCode: ${exitCode}`);
    if (result.output) {
      console.log(Buffer.from(result.output, "base64").toString("utf8"));
    }
    if (["Success", "Failed", "Error", "Timeout"].includes(status)) {
      process.exit(status === "Success" ? 0 : 1);
    }
  }
  throw new Error("Timed out while polling Cloud Assistant invocation result");
})().catch((error) => {
  console.error(`SWAS procurement phase1 rollout failed: ${error.message}`);
  process.exit(1);
});
