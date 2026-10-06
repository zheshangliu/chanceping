"use strict";

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\"'\"'")}'`;
}

function buildIchProductionCycleRemoteCommand(options = {}) {
  const manifestPath = shellQuote(options.manifestPath || "/var/lib/chanceping/opportunity-v2/production-cycle-latest.json");
  const workingDirectory = shellQuote(options.workingDirectory || "/opt/chanceping/current");
  return [
    "set -eu",
    `cd ${workingDirectory}`,
    "timer_unit=$(systemctl cat chanceping-opportunity-v2.timer)",
    "if ! printf '%s\\n' \"$timer_unit\" | grep -Eq '^[[:space:]]*OnUnitActiveSec=72h([[:space:]]|$)'; then echo '[chanceping] existing OpportunityV2 timer is not configured for 72h' >&2; exit 1; fi",
    "service_exec=$(systemctl show chanceping-opportunity-v2.service --property=ExecStart --value)",
    "case \"$service_exec\" in *'npm run opportunity:v2:run'*|*'npm run opportunity:v2:cycle'*|*'run-ich-production-cycle'*) ;; *) echo '[chanceping] existing OpportunityV2 service does not point at the protected cycle runner' >&2; exit 1 ;; esac",
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
    "    timer_next_usec=$(systemctl show chanceping-opportunity-v2.timer --property=NextElapseUSecRealtime --value)",
    "    node -e 'const runtimeMs=Date.parse(process.argv[1]);const raw=process.argv[2];if(!Number.isFinite(runtimeMs)||!/^\\d+$/.test(raw)){process.exit(1)}const timerMs=Number(BigInt(raw)/1000n);if(!Number.isFinite(timerMs)||Math.abs(runtimeMs-timerMs)>300000){process.exit(1)}' \"$runtime_next\" \"$timer_next_usec\" || { echo '[chanceping] runtime next_run_at does not match systemd timer within five minutes' >&2; exit 1; }",
    "    echo \"[chanceping] runtime next_run_at matches systemd timer: $runtime_next\"",
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
