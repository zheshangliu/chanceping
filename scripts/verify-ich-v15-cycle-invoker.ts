import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildIchProductionCycleRemoteCommand } from "./ich-production-cycle-remote-command.cjs";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "chanceping-cycle-invoker-"));
const binDir = path.join(tempDir, "bin");
const manifestPath = path.join(tempDir, "production-cycle-latest.json");
const manifestNextPath = path.join(tempDir, "manifest-next.json");
const systemctlPath = path.join(binDir, "systemctl");

try {
  fs.mkdirSync(binDir);
  fs.writeFileSync(manifestPath, JSON.stringify({ run_id: "prior-run", status: "COMPLETED" }));
  fs.writeFileSync(systemctlPath, `#!/bin/sh
set -eu
case "$*" in
  "cat chanceping-opportunity-v2.timer") printf '[Timer]\\nOnUnitActiveSec=72h\\n' ;;
  "show chanceping-opportunity-v2.service --property=ExecStart --value") printf '/usr/bin/npm run opportunity:v2:run' ;;
  "enable --now chanceping-opportunity-v2.timer") exit 0 ;;
  "is-enabled --quiet chanceping-opportunity-v2.timer") exit 0 ;;
  "is-active --quiet chanceping-opportunity-v2.timer") exit 0 ;;
  "list-timers --all --no-legend chanceping-opportunity-v2.timer") printf 'Fri 2026-10-09 00:12:00 UTC 3 days left chanceping-opportunity-v2.timer chanceping-opportunity-v2.service\\n' ;;
  "show chanceping-opportunity-v2.timer --property=NextElapseUSecRealtime --value") printf '%s' "$TIMER_NEXT_USEC" ;;
  "start chanceping-opportunity-v2.service") cp "$CYCLE_MANIFEST_NEXT" "$CYCLE_MANIFEST_PATH"; exit "\${CYCLE_START_EXIT:-0}" ;;
  "show chanceping-opportunity-v2.service --property=ActiveState,SubState,Result,ExecMainCode,ExecMainStatus --value") printf 'failed\\n' ;;
  *) echo "unexpected systemctl invocation: $*" >&2; exit 99 ;;
esac
`);
  fs.chmodSync(systemctlPath, 0o700);

  const command = buildIchProductionCycleRemoteCommand({ manifestPath, workingDirectory: tempDir });
  assert.match(command, /systemctl is-enabled --quiet chanceping-opportunity-v2\.timer/u);
  assert.match(command, /systemctl is-active --quiet chanceping-opportunity-v2\.timer/u);
  assert.match(command, /systemctl list-timers --all --no-legend chanceping-opportunity-v2\.timer/u);

  const failedManifest = {
    run_id: "new-failed-run",
    status: "FAILED",
    started_at: "2026-10-06T00:12:00.000Z",
    finished_at: "2026-10-06T00:24:00.000Z",
    production_commit: "c10b9bcb9487891e27dd40ae02a5ed06a89359a5",
    fetch: { fetched_sources: 39, successful_sources: 37, raw_items: 400, pool_items: 510, radar_items: 250 },
    translation: { status: "COMPLETED", translated: 12, reused: 110, failed_records: 0 },
    audit: { status: "PASS" },
    next_run_at: "2026-10-09T00:12:00.000Z",
    freshness: "STALE",
    failure_code: "FETCH_FAILED",
    private_provider_error: "DO_NOT_PRINT_THIS_SENTINEL",
  };
  fs.writeFileSync(manifestNextPath, JSON.stringify(failedManifest));
  const failedRun = spawnSync("bash", ["-c", command], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH ?? ""}`,
      CYCLE_MANIFEST_PATH: manifestPath,
      CYCLE_MANIFEST_NEXT: manifestNextPath,
      CYCLE_START_EXIT: "1",
      TIMER_NEXT_USEC: String(Date.parse("2026-10-09T00:12:00.000Z") * 1000),
    },
  });
  assert.equal(failedRun.status, 2, `failed/degraded cycles remain a non-zero workflow outcome; stdout=${failedRun.stdout}; stderr=${failedRun.stderr}`);
  assert.match(failedRun.stdout, /"run_id":"new-failed-run"/u, "the fresh terminal manifest is printed even if systemctl start returned non-zero");
  assert.match(failedRun.stdout, /"failure_code":"FETCH_FAILED"/u, "safe failure classification reaches the workflow artifact");
  assert.doesNotMatch(failedRun.stdout, /DO_NOT_PRINT_THIS_SENTINEL/u, "provider-private error text is never copied into public workflow logs");

  fs.writeFileSync(manifestPath, JSON.stringify({ run_id: "prior-run", status: "COMPLETED" }));
  fs.writeFileSync(manifestNextPath, JSON.stringify({ ...failedManifest, run_id: "new-completed-run", status: "COMPLETED", failure_code: null }));
  const completedRun = spawnSync("bash", ["-c", command], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH ?? ""}`,
      CYCLE_MANIFEST_PATH: manifestPath,
      CYCLE_MANIFEST_NEXT: manifestNextPath,
      CYCLE_START_EXIT: "0",
      TIMER_NEXT_USEC: String(Date.parse("2026-10-09T00:12:00.000Z") * 1000),
    },
  });
  assert.equal(completedRun.status, 0, "a completed cycle with a successful service exit passes");
  assert.match(completedRun.stdout, /"run_id":"new-completed-run"/u);

  fs.writeFileSync(manifestPath, JSON.stringify({ run_id: "prior-run", status: "COMPLETED" }));
  fs.writeFileSync(manifestNextPath, JSON.stringify({ ...failedManifest, run_id: "new-misaligned-run", status: "COMPLETED", failure_code: null }));
  const misalignedRun = spawnSync("bash", ["-c", command], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH ?? ""}`,
      CYCLE_MANIFEST_PATH: manifestPath,
      CYCLE_MANIFEST_NEXT: manifestNextPath,
      CYCLE_START_EXIT: "0",
      TIMER_NEXT_USEC: String(Date.parse("2026-10-10T00:12:00.000Z") * 1000),
    },
  });
  assert.notEqual(misalignedRun.status, 0, "a runtime next_run_at that drifts from systemd fails closed");

  console.log("ICH_V15_CYCLE_INVOKER: PASS (actual timer state checked; terminal manifest preserved after failed service exit; secret error omitted)");
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
