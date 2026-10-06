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
const busctlPath = path.join(binDir, "busctl");
const timerOverridePath = path.join(tempDir, "systemd", "chanceping-opportunity-v2.timer.d", "zzzz-runtime-alignment.conf");
const timerBackupDirectory = path.join(tempDir, "timer-backups");
const systemctlCallsPath = path.join(tempDir, "systemctl-calls.log");
const timerOverrideSource = "docs/deployment/chanceping-opportunity-v2.timer.d/zzzz-runtime-alignment.conf";

try {
  fs.mkdirSync(binDir);
  fs.mkdirSync(path.dirname(path.join(tempDir, timerOverrideSource)), { recursive: true });
  fs.writeFileSync(path.join(tempDir, timerOverrideSource), fs.readFileSync(timerOverrideSource, "utf8"));
  fs.writeFileSync(manifestPath, JSON.stringify({ run_id: "prior-run", status: "COMPLETED" }));
  fs.writeFileSync(systemctlPath, `#!/bin/sh
set -eu
if [ -n "\${SYSTEMCTL_CALLS_PATH:-}" ]; then printf '%s\\n' "$*" >> "$SYSTEMCTL_CALLS_PATH"; fi
case "$*" in
  "cat chanceping-opportunity-v2.timer") printf '[Timer]\\nOnUnitActiveSec=72h\\n%s\\n' "\${TIMER_ADDITIONAL_DIRECTIVE:-}" ;;
  "show chanceping-opportunity-v2.service --property=ExecStart --value") printf '/usr/bin/npm run opportunity:v2:run' ;;
  "daemon-reload") exit 0 ;;
  "restart chanceping-opportunity-v2.timer") exit 0 ;;
  "enable --now chanceping-opportunity-v2.timer") exit 0 ;;
  "is-enabled --quiet chanceping-opportunity-v2.timer") exit 0 ;;
  "is-active --quiet chanceping-opportunity-v2.timer") exit 0 ;;
  "list-timers --all --no-legend chanceping-opportunity-v2.timer") printf 'Fri 2026-10-09 00:12:00 UTC 3 days left chanceping-opportunity-v2.timer chanceping-opportunity-v2.service\\n' ;;
  "show chanceping-opportunity-v2.timer --property=NextElapseUSecRealtime --value") printf 'Fri 2026-10-09 00:12:00 UTC' ;;
  "start chanceping-opportunity-v2.service") cp "$CYCLE_MANIFEST_NEXT" "$CYCLE_MANIFEST_PATH"; exit "\${CYCLE_START_EXIT:-0}" ;;
  "show chanceping-opportunity-v2.service --property=ActiveState,SubState,Result,ExecMainCode,ExecMainStatus --value") printf 'failed\\n' ;;
  *) echo "unexpected systemctl invocation: $*" >&2; exit 99 ;;
esac
`);
  fs.writeFileSync(busctlPath, `#!/bin/sh
set -eu
case "$*" in
  "get-property org.freedesktop.systemd1 /org/freedesktop/systemd1/unit/chanceping_2dopportunity_2dv2_2etimer org.freedesktop.systemd1.Timer NextElapseUSecRealtime") printf 't %s' "$TIMER_NEXT_USEC" ;;
  *) echo "unexpected busctl invocation: $*" >&2; exit 99 ;;
esac
`);
  fs.chmodSync(systemctlPath, 0o700);
  fs.chmodSync(busctlPath, 0o700);

  const command = buildIchProductionCycleRemoteCommand({ manifestPath, workingDirectory: tempDir, timerOverridePath, timerBackupDirectory, timerOverrideSource });
  assert.match(command, /systemctl is-enabled --quiet chanceping-opportunity-v2\.timer/u);
  assert.match(command, /systemctl is-active --quiet chanceping-opportunity-v2\.timer/u);
  assert.match(command, /systemctl list-timers --all --no-legend chanceping-opportunity-v2\.timer/u);
  assert.match(command, /busctl get-property org\.freedesktop\.systemd1/u, "the exact timer instant is read as a typed D-Bus integer, not a locale-formatted systemctl string");

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
  fs.rmSync(timerOverridePath, { force: true });
  const completedRun = spawnSync("bash", ["-c", command], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH ?? ""}`,
      CYCLE_MANIFEST_PATH: manifestPath,
      CYCLE_MANIFEST_NEXT: manifestNextPath,
      CYCLE_START_EXIT: "0",
      SYSTEMCTL_CALLS_PATH: systemctlCallsPath,
      TIMER_NEXT_USEC: String(Date.parse("2026-10-09T00:12:00.000Z") * 1000),
    },
  });
  assert.equal(completedRun.status, 0, "a completed cycle with a successful service exit passes");
  assert.match(completedRun.stdout, /"run_id":"new-completed-run"/u);
  assert.equal(fs.readFileSync(timerOverridePath, "utf8"), fs.readFileSync(path.join(tempDir, timerOverrideSource), "utf8"), "the canonical 72h-only timer override is installed");
  const timerBackupEntries = fs.readdirSync(timerBackupDirectory);
  assert.ok(timerBackupEntries.length > 0, "the prior systemd timer definition is preserved before migration");
  assert.match(fs.readFileSync(path.join(timerBackupDirectory, timerBackupEntries[0], "timer.before"), "utf8"), /\[Timer\]/u, "the exact pre-migration timer unit is saved");
  assert.match(fs.readFileSync(systemctlCallsPath, "utf8"), /daemon-reload[\s\S]*restart chanceping-opportunity-v2\.timer[\s\S]*start chanceping-opportunity-v2\.service/u, "systemd reloads and rearms the timer before the protected cycle starts");

  fs.writeFileSync(manifestPath, JSON.stringify({ run_id: "prior-run", status: "COMPLETED" }));
  const bootCatchupRun = spawnSync("bash", ["-c", command], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH ?? ""}`,
      CYCLE_MANIFEST_PATH: manifestPath,
      CYCLE_MANIFEST_NEXT: manifestNextPath,
      CYCLE_START_EXIT: "0",
      TIMER_ADDITIONAL_DIRECTIVE: "OnBootSec=5min",
      TIMER_NEXT_USEC: String(Date.parse("2026-10-09T00:12:00.000Z") * 1000),
    },
  });
  assert.equal(bootCatchupRun.status, 0, "a one-shot boot catch-up trigger can coexist with the single 72h cadence");
  assert.match(bootCatchupRun.stdout, /new-completed-run/u);

  fs.writeFileSync(manifestPath, JSON.stringify({ run_id: "prior-run", status: "COMPLETED" }));
  const duplicateSchedule = spawnSync("bash", ["-c", command], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH ?? ""}`,
      CYCLE_MANIFEST_PATH: manifestPath,
      CYCLE_MANIFEST_NEXT: manifestNextPath,
      TIMER_ADDITIONAL_DIRECTIVE: "OnCalendar=*-*-* 03:00:00",
      TIMER_NEXT_USEC: String(Date.parse("2026-10-09T00:42:00.000Z") * 1000),
    },
  });
  assert.notEqual(duplicateSchedule.status, 0, "an additional calendar trigger cannot silently diverge from the runtime 72h next_run_at");
  assert.match(duplicateSchedule.stderr, /runtime next_run_at does not match systemd timer/u);
  assert.match(duplicateSchedule.stderr, /OnCalendar=\*-\*-\* 03:00:00/u, "a rejected cadence prints only the relevant timer trigger for diagnosis");

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
