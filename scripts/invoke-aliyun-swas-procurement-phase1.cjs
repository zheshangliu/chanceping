#!/usr/bin/env node
"use strict";

const tls = require("tls");
tls.DEFAULT_MAX_VERSION = "TLSv1.2";

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

function buildBootstrapCommand(options = {}) {
  const deployRef = options.deployRef || process.env.CHANCEPING_DEPLOY_REF || EXPECTED_TAG;
  const expectedCommit = options.expectedCommit || EXPECTED_COMMIT;
  const controlPlaneCommit = options.controlPlaneCommit || process.env.CHANCEPING_CONTROL_PLANE_COMMIT || "";
  const repoDir = options.repoDir || RUN_REPO_DIR;
  const canaryEnabled = options.canaryEnabled || CANARY_ENABLED;
  if (deployRef !== EXPECTED_TAG) {
    throw new Error(`Unsupported CHANCEPING_DEPLOY_REF: ${deployRef}`);
  }
  if (expectedCommit !== EXPECTED_COMMIT) {
    throw new Error(`Unsupported CHANCEPING_EXPECTED_COMMIT: ${expectedCommit}`);
  }
  if (!/^[0-9a-f]{40}$/u.test(controlPlaneCommit)) {
    throw new Error("CHANCEPING_CONTROL_PLANE_COMMIT must be a full git SHA");
  }
  return [
    "set -Eeuo pipefail",
    "set -o pipefail",
    `export CONTROL_PLANE_COMMIT=${shellQuote(controlPlaneCommit)}`,
    `export DEPLOY_REF=${shellQuote(deployRef)}`,
    `export EXPECTED_COMMIT=${shellQuote(expectedCommit)}`,
    `export REPO_DIR=${shellQuote(repoDir)}`,
    `export CANARY_ENABLED=${shellQuote(canaryEnabled)}`,
    "cd \"$REPO_DIR\"",
    "git fetch --no-tags origin \"$CONTROL_PLANE_COMMIT\"",
    "control_commit=\"$(git rev-parse --verify 'FETCH_HEAD^{commit}')\"",
    "if [ \"$control_commit\" != \"$CONTROL_PLANE_COMMIT\" ]; then",
    "  echo \"control-plane commit mismatch: expected=$CONTROL_PLANE_COMMIT actual=$control_commit\" >&2",
    "  exit 2",
    "fi",
    "helper=\"$(mktemp -t chanceping-proc-phase1-rollout.XXXXXX.sh)\"",
    "cleanup() { rm -f -- \"$helper\"; }",
    "trap cleanup EXIT",
    "git show \"$CONTROL_PLANE_COMMIT:scripts/procurement-phase1-production-rollout.sh\" > \"$helper\"",
    "chmod 700 \"$helper\"",
    "CHANCEPING_DEPLOY_REF=\"$DEPLOY_REF\" \\",
    "CHANCEPING_EXPECTED_COMMIT=\"$EXPECTED_COMMIT\" \\",
    "CHANCEPING_CONTROL_PLANE_COMMIT=\"$CONTROL_PLANE_COMMIT\" \\",
    "CHANCEPING_SERVER_REPO_DIR=\"$REPO_DIR\" \\",
    "CHANCEPING_PROCUREMENT_CANARY=\"$CANARY_ENABLED\" \\",
    "bash \"$helper\"",
  ].join("\n");
}
async function main() {
  const { Config } = require("@alicloud/openapi-client");
  const { RuntimeOptions } = require("@alicloud/tea-util");
  const { RunCommandRequest, DescribeInvocationResultRequest } = require("@alicloud/swas-open20200601");
  const SwasOpen = require("@alicloud/swas-open20200601").default;
  const instanceId = requiredEnv("CHANCEPING_SWAS_INSTANCE");
  const accessKeyId = requiredEnv("ALIBABA_CLOUD_ACCESS_KEY_ID");
  const accessKeySecret = requiredEnv("ALIBABA_CLOUD_ACCESS_KEY_SECRET");
  const controlPlaneCommit = requiredEnv("CHANCEPING_CONTROL_PLANE_COMMIT");
  const commandTimeout = Number(process.env.CHANCEPING_DEPLOY_COMMAND_TIMEOUT || "1800");

  if (!Number.isInteger(commandTimeout) || commandTimeout < 60 || commandTimeout > 86400) {
    throw new Error("CHANCEPING_DEPLOY_COMMAND_TIMEOUT must be an integer from 60 to 86400");
  }

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

  delete process.env.HTTP_PROXY;
  delete process.env.HTTPS_PROXY;
  delete process.env.http_proxy;
  delete process.env.https_proxy;
  delete process.env.ALL_PROXY;
  delete process.env.all_proxy;

  const command = buildBootstrapCommand({
    deployRef: DEPLOY_REF,
    expectedCommit: EXPECTED_COMMIT,
    controlPlaneCommit,
    repoDir: RUN_REPO_DIR,
    canaryEnabled: CANARY_ENABLED,
  });

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
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`SWAS procurement phase1 rollout failed: ${error.message}`);
    process.exit(1);
  });
}

module.exports = { buildBootstrapCommand };
