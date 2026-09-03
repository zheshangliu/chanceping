#!/usr/bin/env node
"use strict";

const tls = require("tls");
tls.DEFAULT_MAX_VERSION = "TLSv1.2";

const SwasOpen = require("@alicloud/swas-open20200601").default;
const {
  RunCommandRequest,
  DescribeInvocationResultRequest,
} = require("@alicloud/swas-open20200601");
const { Config } = require("@alicloud/openapi-client");
const { RuntimeOptions } = require("@alicloud/tea-util");

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function shellQuote(value) {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

const deployRef = process.env.CHANCEPING_DEPLOY_REF || "rescue/mvp-codex";
if (
  !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(deployRef)
  || deployRef.includes("..")
  || deployRef.endsWith("/")
) {
  throw new Error("Invalid CHANCEPING_DEPLOY_REF");
}

const instanceId = requiredEnv("CHANCEPING_SWAS_INSTANCE");
const regionId = process.env.CHANCEPING_SWAS_REGION || "cn-hongkong";
const accessKeyId = requiredEnv("ALIBABA_CLOUD_ACCESS_KEY_ID");
const accessKeySecret = requiredEnv("ALIBABA_CLOUD_ACCESS_KEY_SECRET");
const repoDir = process.env.CHANCEPING_SERVER_REPO_DIR || "/opt/chanceping";
const commandTimeout = Number(process.env.CHANCEPING_DEPLOY_COMMAND_TIMEOUT || "1800");

if (!Number.isInteger(commandTimeout) || commandTimeout < 60 || commandTimeout > 86400) {
  throw new Error("CHANCEPING_DEPLOY_COMMAND_TIMEOUT must be an integer from 60 to 86400");
}

const quotedRef = shellQuote(deployRef);
const quotedRepo = shellQuote(repoDir);
const command = [
  "set -Eeuo pipefail",
  `cd ${quotedRepo}`,
  `git fetch --no-tags origin ${quotedRef}`,
  "commit=$(git rev-parse --verify 'FETCH_HEAD^{commit}')",
  "helper=/tmp/chanceping-deploy-release-$commit.sh",
  "git show \"$commit:scripts/deploy-release.sh\" > \"$helper\"",
  "chmod 700 \"$helper\"",
  `CHANCEPING_SERVER_REPO_DIR=${quotedRepo} bash \"$helper\" \"$commit\"`,
  "rm -f \"$helper\"",
].join(" && ");

delete process.env.HTTP_PROXY;
delete process.env.HTTPS_PROXY;
delete process.env.ALL_PROXY;

const client = new SwasOpen(new Config({
  accessKeyId,
  accessKeySecret,
  regionId,
  endpoint: `swas.${regionId}.aliyuncs.com`,
  protocol: "https",
}));
const runtime = new RuntimeOptions({
  timeout: 30000,
  readTimeout: 30000,
  connectTimeout: 15000,
  autoretry: true,
  maxAttempts: 3,
});

(async () => {
  const response = await client.runCommandWithOptions(new RunCommandRequest({
    instanceId,
    regionId,
    name: "chanceping-atomic-release",
    type: "RunShellScript",
    commandContent: command,
    timeout: commandTimeout,
  }), runtime);
  const invokeId = response.body.invokeId;
  console.log(`Cloud Assistant invocation: ${invokeId}`);

  const maxPolls = Math.ceil(commandTimeout / 5) + 6;
  for (let attempt = 0; attempt < maxPolls; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    const resultResponse = await client.describeInvocationResultWithOptions(
      new DescribeInvocationResultRequest({ invokeId, regionId, instanceId }),
      runtime,
    );
    const result = resultResponse.body.invocationResult;
    if (!result) continue;
    console.log(`Status: ${result.invocationStatus} | ExitCode: ${result.exitCode}`);
    if (result.output) console.log(Buffer.from(result.output, "base64").toString("utf8"));
    if (["Success", "Failed", "Error", "Timeout"].includes(result.invocationStatus)) {
      process.exit(result.invocationStatus === "Success" ? 0 : 1);
    }
  }
  throw new Error("Timed out while polling Cloud Assistant invocation result");
})().catch((error) => {
  console.error(`SWAS deployment failed: ${error.message}`);
  process.exit(1);
});
