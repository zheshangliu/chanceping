import { execFileSync } from "node:child_process";

type Step = {
  command: string;
  optional?: boolean;
  skipEnv?: string;
};

const steps: Step[] = [
  { command: "typecheck" },
  { command: "verify:q7:api-env-contest" },
  { command: "verify:q7:backend-i18n" },
  { command: "verify:q7:chat-window" },
  { command: "verify:q7:docker-readiness" },
  { command: "verify:q7:cloud-readiness" },
  { command: "verify:q7:aliyun-runbook" },
  { command: "verify:q7:aliyun-smoke" },
  { command: "verify:q7:aliyun-container-smoke", optional: true, skipEnv: "CHANCEPING_SKIP_ALIYUN_CONTAINER_SMOKE" },
  { command: "verify:all" },
];

function isEnabled(value: string | undefined): boolean {
  return /^(1|true|yes)$/i.test(value ?? "");
}

function runNodeScript(command: string): void {
  console.log(`\n[aliyun-preflight] node --run ${command}`);
  execFileSync(process.execPath, ["--run", command], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });
}

let skipped = 0;

try {
  for (const step of steps) {
    if (step.skipEnv && isEnabled(process.env[step.skipEnv])) {
      skipped += 1;
      console.log(`\n[aliyun-preflight] SKIP ${step.command}: ${step.skipEnv}=true`);
      continue;
    }
    runNodeScript(step.command);
  }

  console.log(`\nQ7 Aliyun preflight: ${steps.length - skipped} steps passed${skipped ? `, ${skipped} skipped` : ""}`);
} catch (error) {
  console.error("\nQ7 Aliyun preflight failed.");
  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(error);
  }
  process.exit(1);
}
