import { execFileSync } from "node:child_process";

type Check = {
  name: string;
  ok: boolean;
  hint: string;
  requiredForStrict: boolean;
};

function isEnabled(value: string | undefined): boolean {
  return /^(1|true|yes)$/i.test(value ?? "");
}

function hasCommand(command: string): boolean {
  try {
    execFileSync("sh", ["-lc", `command -v ${command}`], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function hasEnv(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

function hasAnyEnv(names: string[]): boolean {
  return names.some(hasEnv);
}

const strict = isEnabled(process.env.CHANCEPING_REQUIRE_ALIYUN_DEPLOY_READY);

const checks: Check[] = [
  {
    name: "Docker CLI is available for image build/smoke",
    ok: hasCommand("docker"),
    hint: "Install/start Docker, or run deployment from an environment that can build the image.",
    requiredForStrict: true,
  },
  {
    name: "Aliyun CLI or remote deploy URL is available",
    ok: hasCommand("aliyun") || hasEnv("CHANCEPING_DEPLOY_BASE_URL"),
    hint: "Install/configure aliyun CLI for automated deploy, or deploy manually and set CHANCEPING_DEPLOY_BASE_URL for remote smoke.",
    requiredForStrict: true,
  },
  {
    name: "Aliyun credential variable names are present for automated deploy",
    ok: hasAnyEnv(["ALIYUN_CLI_PROFILE", "ALIBABA_CLOUD_ACCESS_KEY_ID", "ALIYUN_ACCESS_KEY_ID"]),
    hint: "Set ALIYUN_CLI_PROFILE, or ALIBABA_CLOUD_ACCESS_KEY_ID / ALIBABA_CLOUD_ACCESS_KEY_SECRET in the deployment environment. Values are never printed.",
    requiredForStrict: true,
  },
  {
    name: "ACR image target is configured for image push",
    ok: hasAnyEnv(["CHANCEPING_ALIYUN_ACR_REGISTRY", "ALIYUN_ACR_REGISTRY", "ACR_REGISTRY"])
      && hasAnyEnv(["CHANCEPING_ALIYUN_IMAGE", "ALIYUN_IMAGE_NAME", "ACR_IMAGE"]),
    hint: "Set CHANCEPING_ALIYUN_ACR_REGISTRY and CHANCEPING_ALIYUN_IMAGE, or equivalent CI variables, before pushing the container image.",
    requiredForStrict: true,
  },
  {
    name: "Remote smoke URL is configured after deployment",
    ok: hasEnv("CHANCEPING_DEPLOY_BASE_URL"),
    hint: "After the Aliyun test site is deployed, set CHANCEPING_DEPLOY_BASE_URL=https://... and run verify:q7:aliyun-remote-smoke.",
    requiredForStrict: true,
  },
];

let blockers = 0;

for (const check of checks) {
  if (check.ok) {
    console.log(`PASS ${check.name}`);
  } else {
    blockers += check.requiredForStrict ? 1 : 0;
    console.log(`${strict && check.requiredForStrict ? "FAIL" : "WARN"} ${check.name}`);
    console.log(`     ${check.hint}`);
  }
}

if (strict && blockers > 0) {
  console.error(`Q7 Aliyun deploy prerequisites: ${checks.length - blockers} PASS / ${blockers} BLOCKED`);
  process.exit(1);
}

console.log(
  `Q7 Aliyun deploy prerequisites: ${checks.length - blockers} ready / ${blockers} pending${strict ? "" : " (report-only mode)"}`,
);
