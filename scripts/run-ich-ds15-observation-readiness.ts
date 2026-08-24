import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const storePath = path.resolve("data/ich-opportunities.json");
const ds5Path = path.resolve("docs/ich/DS5-规模化运营运行记录_V1.0.json");
const ds6Path = path.resolve("docs/ich/DS6-只读调度运行账本_V1.0.json");
const outputPath = path.resolve("docs/ich/DS15-三日观察启动记录_V1.0.json");
const now = new Date("2026-08-24T12:00:00.000Z");
const raw = fs.readFileSync(storePath, "utf8");
const ds5 = JSON.parse(fs.readFileSync(ds5Path, "utf8")) as { gate: string; formal_store_write: boolean; next_scheduled_run_at: string };
const ds6File = JSON.parse(fs.readFileSync(ds6Path, "utf8")) as { runs: Array<{ gate: string; readonly: boolean; formal_store_write: boolean; formal_store_unchanged: boolean; run_id: string }> };
const ds6 = ds6File.runs.at(-1);
const audit = {
  schema_version: "ich-ds15-observation-readiness.v1",
  stage: "DS15",
  observation_window_start: now.toISOString(),
  planned_observation_end: "2026-08-27T12:00:00.000Z",
  remote_timer: { unit: "chanceping-ich-ds6.timer", enabled: true, active_state: "active", sub_state: "waiting", last_trigger: "2026-08-24 17:05:17 CST", next_trigger: "2026-08-27 17:10:42 CST", last_result: "success", service_active: true },
  upstream: { ds5_gate: ds5.gate, ds5_formal_store_write: ds5.formal_store_write, ds5_next_scheduled_run_at: ds5.next_scheduled_run_at, ds6_run_id: ds6?.run_id ?? null, ds6_gate: ds6?.gate ?? null, ds6_readonly: ds6?.readonly ?? false, ds6_formal_store_write: ds6?.formal_store_write ?? true, ds6_formal_store_unchanged: ds6?.formal_store_unchanged ?? false },
  baseline: { formal_store_path: "data/ich-opportunities.json", formal_store_sha256: crypto.createHash("sha256").update(raw).digest("hex"), formal_store_write: false, public_regression_required: true },
  observation_checks: ["timer remains enabled/active", "DS6 service exits 0", "DS4/DS5 counts and consistency remain aligned", "public /ich list/filter/detail/SSR remain healthy", "no unapproved candidate enters formal store"],
  half_automatic_update_decision: "pending_until_observation_end",
  gate: ds5.gate === "pass" && ds5.formal_store_write === false && ds6?.gate === "pass" && ds6.readonly === true && ds6.formal_store_write === false && ds6.formal_store_unchanged === true ? "observation_started" : "blocked",
};
fs.writeFileSync(outputPath, `${JSON.stringify(audit, null, 2)}\n`);
console.log(JSON.stringify({ stage: audit.stage, gate: audit.gate, observation_window_start: audit.observation_window_start, planned_observation_end: audit.planned_observation_end, next_trigger: audit.remote_timer.next_trigger, half_automatic_update_decision: audit.half_automatic_update_decision }, null, 2));
if (audit.gate === "blocked") process.exitCode = 1;
