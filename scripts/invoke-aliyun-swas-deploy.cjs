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

const instanceId = requiredEnv("CHANCEPING_SWAS_INSTANCE");
const regionId = process.env.CHANCEPING_SWAS_REGION || "cn-hongkong";
const accessKeyId = requiredEnv("ALIBABA_CLOUD_ACCESS_KEY_ID");
const accessKeySecret = requiredEnv("ALIBABA_CLOUD_ACCESS_KEY_SECRET");
const action = process.env.CHANCEPING_SWAS_ACTION || "deploy";
if (!["deploy", "cycle"].includes(action)) throw new Error("Invalid CHANCEPING_SWAS_ACTION");

let command;
let commandName;
let commandTimeout;

if (action === "cycle") {
  commandName = "chanceping-protected-ich-cycle";
  commandTimeout = 2400;
  // Fixed server-local operation: no user-provided command, URL, path, or token.
  // The existing systemd service retains the server-side DeepSeek credentials.
  command = [
    "set -eu",
    "cd /opt/chanceping/current",
    "timer_unit=$(systemctl cat chanceping-opportunity-v2.timer)",
    "if ! printf '%s\\n' \"$timer_unit\" | grep -Eq '^[[:space:]]*OnUnitActiveSec=72h([[:space:]]|$)'; then echo '[chanceping] existing OpportunityV2 timer is not configured for 72h' >&2; exit 1; fi",
    "service_exec=$(systemctl show chanceping-opportunity-v2.service --property=ExecStart --value)",
    "case \"$service_exec\" in *'npm run opportunity:v2:run'*|*'npm run opportunity:v2:cycle'*|*'run-ich-production-cycle'*) ;; *) echo '[chanceping] existing OpportunityV2 service does not point at the protected cycle runner' >&2; exit 1 ;; esac",
    "systemctl enable --now chanceping-opportunity-v2.timer",
    "timer_next=$(systemctl show chanceping-opportunity-v2.timer --property=NextElapseUSecRealtime --value)",
    "echo \"[chanceping] timer enabled and active; next trigger: $timer_next\"",
    "before=$(node -e 'try{const m=require(\"/var/lib/chanceping/opportunity-v2/production-cycle-latest.json\");process.stdout.write(String(m.run_id||\"\"))}catch{}')",
    "systemctl start chanceping-opportunity-v2.service",
    "i=0",
    "while [ $i -lt 420 ]; do",
    "  terminal=$(node -e 'try{const m=require(\"/var/lib/chanceping/opportunity-v2/production-cycle-latest.json\");if(m.run_id&&m.run_id!==process.argv[1]&&[\"COMPLETED\",\"DEGRADED\",\"FAILED\"].includes(m.status)){const out={run_id:m.run_id,status:m.status,started_at:m.started_at,finished_at:m.finished_at,production_commit:m.production_commit,fetch:m.fetch,translation:m.translation,audit:m.audit,next_run_at:m.next_run_at,freshness:m.freshness,failure_code:m.failure_code};console.log(m.status);console.log(JSON.stringify(out))}}catch{}' \"$before\")",
    "  if [ -n \"$terminal\" ]; then",
    "    status=$(printf '%s\\n' \"$terminal\" | sed -n '1p')",
    "    printf '%s\\n' \"$terminal\" | sed -n '2p'",
    "    if [ \"$status\" = COMPLETED ]; then exit 0; else exit 2; fi",
    "  fi",
    "  state=$(systemctl show chanceping-opportunity-v2.service -p ActiveState --value)",
    "  if [ \"$state\" = failed ]; then systemctl --no-pager --full status chanceping-opportunity-v2.service; exit 1; fi",
    "  sleep 5",
    "  i=$((i+1))",
    "done",
    "echo '[chanceping] production cycle did not publish a fresh terminal manifest' >&2",
    "exit 1",
  ].join("\n");
} else {
  const deployRef = process.env.CHANCEPING_DEPLOY_REF || "rescue/mvp-codex";
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(deployRef)
    || deployRef.includes("..")
    || deployRef.endsWith("/")
  ) {
    throw new Error("Invalid CHANCEPING_DEPLOY_REF");
  }
  const repoDir = process.env.CHANCEPING_SERVER_REPO_DIR || "/opt/chanceping";
  commandTimeout = Number(process.env.CHANCEPING_DEPLOY_COMMAND_TIMEOUT || "1800");
  if (!Number.isInteger(commandTimeout) || commandTimeout < 60 || commandTimeout > 86400) {
    throw new Error("CHANCEPING_DEPLOY_COMMAND_TIMEOUT must be an integer from 60 to 86400");
  }
  const quotedRef = shellQuote(deployRef);
  const quotedRepo = shellQuote(repoDir);
  commandName = "chanceping-atomic-release";
  command = [
    "set -eu",
    `cd ${quotedRepo}`,
    `git fetch --no-tags origin ${quotedRef}`,
    `commit=\$(git rev-parse --verify 'refs/remotes/origin/${deployRef}^{commit}' 2>/dev/null || git rev-parse --verify 'refs/tags/${deployRef}^{commit}' 2>/dev/null || git rev-parse --verify 'FETCH_HEAD^{commit}')`,
    `echo "[chanceping] requested ref: ${deployRef}"`,
    "echo \"[chanceping] selected commit: $commit\"",
    "helper=/tmp/chanceping-deploy-release-$commit.sh",
    "git show \"$commit:scripts/deploy-release.sh\" > \"$helper\"",
    "chmod 700 \"$helper\"",
    `CHANCEPING_SERVER_REPO_DIR=${quotedRepo} bash \"$helper\" \"$commit\"`,
    "rm -f \"$helper\"",
  ].join(" && ");
}

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
    name: commandName,
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
  console.error(`SWAS ${action} failed: ${error.message}`);
  process.exit(1);
});
