"use strict";

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\"'\"'")}'`;
}

function buildIchProductionCycleRemoteCommand(options = {}) {
  const manifestPath = shellQuote(options.manifestPath || "/var/lib/chanceping/opportunity-v2/production-cycle-latest.json");
  const workingDirectory = shellQuote(options.workingDirectory || "/opt/chanceping/current");
  const timerOverrideSource = shellQuote(options.timerOverrideSource || "docs/deployment/chanceping-opportunity-v2.timer.d/zzzz-runtime-alignment.conf");
  const timerOverridePath = shellQuote(options.timerOverridePath || "/etc/systemd/system/chanceping-opportunity-v2.timer.d/zzzz-runtime-alignment.conf");
  const timerBackupBase = shellQuote(options.timerBackupDirectory || "/var/lib/chanceping/opportunity-v2/systemd-backups");
  return [
    "set -eu",
    "service_exec=$(systemctl show chanceping-opportunity-v2.service --property=ExecStart --value)",
    "case \"$service_exec\" in *'npm run opportunity:v2:run'*|*'npm run opportunity:v2:cycle'*|*'run-ich-production-cycle'*) ;; *) echo '[chanceping] existing OpportunityV2 service does not point at the protected cycle runner' >&2; exit 1 ;; esac",
    `cd ${workingDirectory}`,
    "timer_override_source=" + timerOverrideSource,
    "timer_override_path=" + timerOverridePath,
    "timer_backup_base=" + timerBackupBase,
    "timer_backup_id=$(date -u +%Y%m%dT%H%M%SZ)-$$",
    "timer_backup_dir=\"$timer_backup_base/$timer_backup_id\"",
    "mkdir -p \"$timer_backup_dir\"",
    "chmod 0700 \"$timer_backup_dir\"",
    "timer_unit=$(systemctl cat chanceping-opportunity-v2.timer)",
    "printf '%s\\n' \"$timer_unit\" > \"$timer_backup_dir/timer.before\"",
    "echo \"[chanceping] saved previous timer definition: $timer_backup_dir/timer.before\"",
    "if [ -e \"$timer_override_path\" ] && ! cmp -s \"$timer_override_source\" \"$timer_override_path\"; then cp -p \"$timer_override_path\" \"$timer_backup_dir/override.before\"; fi",
    "if ! cmp -s \"$timer_override_source\" \"$timer_override_path\"; then",
    "  timer_override_tmp=\"$timer_override_path.tmp.$$\"",
    "  mkdir -p \"$(dirname \"$timer_override_path\")\"",
    "  install -m 0644 \"$timer_override_source\" \"$timer_override_tmp\"",
    "  mv -f \"$timer_override_tmp\" \"$timer_override_path\"",
    "  systemctl daemon-reload",
    "fi",
    "systemctl restart chanceping-opportunity-v2.timer",
    "echo '[chanceping] timer normalized: exactly one OnUnitActiveSec=72h; startup/calendar/other cadence cleared'",
    "systemctl enable --now chanceping-opportunity-v2.timer",
    "systemctl is-enabled --quiet chanceping-opportunity-v2.timer || { echo '[chanceping] 72h timer is not enabled' >&2; exit 1; }",
    "systemctl is-active --quiet chanceping-opportunity-v2.timer || { echo '[chanceping] 72h timer is not active' >&2; exit 1; }",
    "timer_next=$(systemctl list-timers --all --no-legend chanceping-opportunity-v2.timer)",
    "if [ -z \"$timer_next\" ]; then echo '[chanceping] 72h timer has no scheduled next trigger' >&2; exit 1; fi",
    "echo \"[chanceping] timer enabled and active; next trigger: $timer_next\"",
    `before=$(node -e 'try{const m=JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8"));process.stdout.write(String(m.run_id||""))}catch{}' ${manifestPath})`,
    "service_start_exit=0",
    "systemctl start chanceping-opportunity-v2.service || service_start_exit=$?",
    "i=0",
    "while [ $i -lt 420 ]; do",
    `  terminal=$(node -e 'try{const m=JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8"));if(m.run_id&&m.run_id!==process.argv[2]&&["COMPLETED","COMPLETED_WITH_BACKLOG","DEGRADED","FAILED"].includes(m.status)){const out={run_id:m.run_id,status:m.status,started_at:m.started_at,finished_at:m.finished_at,production_commit:m.production_commit,fetch:m.fetch,translation:m.translation,audit:m.audit,next_run_at:m.next_run_at,freshness:m.freshness,failure_code:m.failure_code};console.log(m.status);console.log(JSON.stringify(out))}}catch{}' ${manifestPath} "$before")`,
    "  if [ -n \"$terminal\" ]; then",
    "    status=$(printf '%s\\n' \"$terminal\" | sed -n '1p')",
    "    printf '%s\\n' \"$terminal\" | sed -n '2p'",
    `    runtime_next=$(node -e 'try{const m=JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8"));process.stdout.write(String(m.next_run_at||""))}catch{}' ${manifestPath})`,
    "    timer_next_dbus=$(busctl get-property org.freedesktop.systemd1 /org/freedesktop/systemd1/unit/chanceping_2dopportunity_2dv2_2etimer org.freedesktop.systemd1.Timer NextElapseUSecMonotonic)",
    "    node -e 'const runtimeMs=Date.parse(process.argv[1]);const match=process.argv[2].match(/^t\\s+(\\d+)$/);if(!Number.isFinite(runtimeMs)||!match){process.exit(1)}const nextMonoUsec=BigInt(match[1]);const nowMonoUsec=process.hrtime.bigint()/1000n;const timerMs=Date.now()+Number(nextMonoUsec-nowMonoUsec)/1000;if(!Number.isFinite(timerMs)||Math.abs(runtimeMs-timerMs)>300000){process.exit(1)}' \"$runtime_next\" \"$timer_next_dbus\" || { echo '[chanceping] runtime next_run_at does not match systemd monotonic timer within five minutes' >&2; echo \"[chanceping] runtime next_run_at: $runtime_next\" >&2; echo \"[chanceping] systemd NextElapseUSecMonotonic: $timer_next_dbus\" >&2; systemctl cat chanceping-opportunity-v2.timer | grep -E '^[[:space:]]*(On[A-Za-z]*|RandomizedDelaySec|AccuracySec|Unit)=' >&2 || true; exit 1; }",
    "    echo \"[chanceping] runtime next_run_at matches systemd monotonic timer: $runtime_next\"",
    "    if { [ \"$status\" = COMPLETED ] || [ \"$status\" = COMPLETED_WITH_BACKLOG ]; } && [ \"$service_start_exit\" -eq 0 ]; then exit 0; else exit 2; fi",
    "  fi",
    "  state=$(systemctl show chanceping-opportunity-v2.service --property=ActiveState --value)",
    "  if [ \"$state\" = failed ]; then systemctl show chanceping-opportunity-v2.service --property=ActiveState,SubState,Result,ExecMainCode,ExecMainStatus --value >&2; exit 1; fi",
    "  sleep 5",
    "  i=$((i+1))",
    "done",
    "echo '[chanceping] production cycle did not publish a fresh terminal manifest' >&2",
    "systemctl show chanceping-opportunity-v2.service --property=ActiveState,SubState,Result,ExecMainCode,ExecMainStatus --value >&2 || true",
    "exit 1",
  ].join("\n");
}

module.exports = { buildIchProductionCycleRemoteCommand };
