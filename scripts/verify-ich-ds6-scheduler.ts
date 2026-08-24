import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const schedule = JSON.parse(fs.readFileSync(path.resolve("ops/ich-ds6-schedule.json"), "utf8")) as { enabled: boolean; timezone: string; interval_days: number; run_mode: string; formal_store_write: boolean; requires_manual_promotion: boolean };
const timer = fs.readFileSync(path.resolve("ops/chanceping-ich-ds6.timer"), "utf8");
const service = fs.readFileSync(path.resolve("ops/chanceping-ich-ds6.service"), "utf8");
const ledger = JSON.parse(fs.readFileSync(path.resolve("docs/ich/DS6-只读调度运行账本_V1.0.json"), "utf8")) as { runs: Array<{ gate: string; readonly: boolean; formal_store_write: boolean; formal_store_unchanged: boolean; schedule: { interval_days: number }; steps: Array<{ exit_code: number }> }> };
assert.equal(schedule.enabled, true);
assert.equal(schedule.timezone, "Asia/Shanghai");
assert.equal(schedule.interval_days, 3);
assert.equal(schedule.run_mode, "readonly");
assert.equal(schedule.formal_store_write, false);
assert.equal(schedule.requires_manual_promotion, true);
assert(timer.includes("OnUnitActiveSec=72h") && timer.includes("Persistent=true") && timer.includes("chanceping-ich-ds6.service"));
assert(service.includes("npm run ich:ds6:run-once") && service.includes("CHANCEPING_ICH_STORE_PATH") && service.includes("CHANCEPING_ICH_DS6_LEDGER_PATH=/var/lib/chanceping/ich-ds6/") && service.includes("ExecStartPre=/usr/bin/install -d") && !service.includes("replaceAll"));
assert(ledger.runs.length >= 3, "DS6 requires three consecutive runs before entering DS7");
for (const run of ledger.runs.slice(-3)) {
  assert.equal(run.gate, "pass");
  assert.equal(run.readonly, true);
  assert.equal(run.formal_store_write, false);
  assert.equal(run.formal_store_unchanged, true);
  assert.equal(run.schedule.interval_days, 3);
  assert(run.steps.every((step) => step.exit_code === 0));
}
console.log(JSON.stringify({ gate: "pass", consecutive_runs: ledger.runs.length, interval_days: 3, timezone: "Asia/Shanghai", formal_store_write: false }, null, 2));
