import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

interface StepResult { name: string; exit_code: number; output: string; }
const nowRaw = process.argv.includes("--now") ? process.argv[process.argv.indexOf("--now") + 1] : new Date().toISOString();
const now = new Date(nowRaw);
if (Number.isNaN(now.getTime())) throw new Error(`Invalid --now value: ${nowRaw}`);
const skipEndpoints = process.argv.includes("--skip-endpoints");
const storePath = path.resolve("data/ich-opportunities.json");
const ledgerPath = path.resolve("docs/ich/DS6-只读调度运行账本_V1.0.json");
const beforeRaw = fs.readFileSync(storePath);
const beforeHash = crypto.createHash("sha256").update(beforeRaw).digest("hex");
const steps: Array<{ name: string; command: string[] }> = [];
if (!skipEndpoints) steps.push({ name: "source-endpoints", command: ["scripts/verify-ich-source-endpoints.ts"] });
steps.push(
  { name: "ds2-readonly-discovery", command: ["scripts/run-ich-ds2-readonly-discovery.ts"] },
  { name: "ds3-candidate-quality", command: ["scripts/run-ich-ds3-candidate-quality.ts"] },
  { name: "ds4-release-audit", command: ["scripts/run-ich-ds4-release-audit.ts", "--now", now.toISOString()] },
  { name: "ds5-operations-audit", command: ["scripts/run-ich-ds5-operations-audit.ts", "--now", now.toISOString()] },
  { name: "ds5-consistency", command: ["scripts/verify-ich-ds5-consistency.ts"] },
);
const stepResults: StepResult[] = [];
for (const step of steps) {
  const result = spawnSync(process.execPath, ["--import", "tsx", ...step.command], { cwd: process.cwd(), encoding: "utf8" });
  stepResults.push({ name: step.name, exit_code: result.status ?? 1, output: `${result.stdout ?? ""}${result.stderr ?? ""}`.slice(-6000) });
}
const afterRaw = fs.readFileSync(storePath);
const afterHash = crypto.createHash("sha256").update(afterRaw).digest("hex");
const allStepsPassed = stepResults.every((step) => step.exit_code === 0);
const run = {
  schema_version: "ich-ds6-scheduled-readonly.v1",
  run_id: `ich-ds6-${now.toISOString().replace(/[-:TZ.]/g, "").slice(0, 14)}`,
  ran_at: now.toISOString(),
  schedule: { timezone: "Asia/Shanghai", interval_days: 3, skip_endpoints: skipEndpoints },
  readonly: true,
  formal_store_write: false,
  formal_store_before_sha256: beforeHash,
  formal_store_after_sha256: afterHash,
  formal_store_unchanged: beforeHash === afterHash,
  steps: stepResults,
  gate: allStepsPassed && beforeHash === afterHash ? "pass" : "blocked",
};
const ledger = fs.existsSync(ledgerPath) ? JSON.parse(fs.readFileSync(ledgerPath, "utf8")) as { schema_version: string; runs: Array<{ run_id?: string }> } : { schema_version: "ich-ds6-scheduled-readonly.v1", runs: [] };
const uniqueRuns = new Map<string, typeof run>();
for (const item of ledger.runs) if (item.run_id) uniqueRuns.set(item.run_id, item as typeof run);
uniqueRuns.set(run.run_id, run);
ledger.runs = [...uniqueRuns.values()];
fs.writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ run_id: run.run_id, gate: run.gate, readonly: true, formal_store_write: false, formal_store_unchanged: run.formal_store_unchanged, steps: stepResults.map((step) => ({ name: step.name, exit_code: step.exit_code })), ledger: path.relative(process.cwd(), ledgerPath) }, null, 2));
if (run.gate !== "pass") process.exitCode = 1;
