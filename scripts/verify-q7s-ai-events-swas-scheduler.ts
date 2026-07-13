import { existsSync, readFileSync } from "node:fs";
import packageJson from "../package.json";

let pass = 0;
let fail = 0;

function read(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

function check(name: string, condition: boolean, detail = ""): void {
  if (condition) {
    pass += 1;
    console.log(`PASS ${name}`);
  } else {
    fail += 1;
    console.error(`FAIL ${name}${detail ? `: ${detail}` : ""}`);
  }
}

const servicePath = "docs/deployment/chanceping-ai-events-update.service";
const timerPath = "docs/deployment/chanceping-ai-events-update.timer";
const runbookPath = "docs/deployment/aliyun-mvp-runbook.md";

const service = read(servicePath);
const timer = read(timerPath);
const runbook = read(runbookPath);
const scripts = (packageJson as { scripts?: Record<string, string> }).scripts ?? {};

console.log("\n[Q7S AI Events SWAS scheduler] 72h public radar refresh checks\n");

check("systemd service template exists", existsSync(servicePath), servicePath);
check("systemd timer template exists", existsSync(timerPath), timerPath);
check("Aliyun runbook exists", existsSync(runbookPath), runbookPath);

check("service is oneshot", /Type=oneshot/.test(service));
check("service runs from current release symlink", /WorkingDirectory=\/opt\/chanceping\/current/.test(service));
check("service reads server env file only", /EnvironmentFile=\/etc\/chanceping\/chanceping\.env/.test(service));
check(
  "service runs AI Events update with source collection and image hydration",
  /ExecStart=\/usr\/bin\/npm run ai-events:update -- --collect-sources --discover-with-search --source-max-links=12 --hydrate-images --image-limit=60/.test(service),
  service,
);
check("service reloads the public API after a successful refresh", /ExecStartPost=\/bin\/systemctl restart chanceping\.service/.test(service), service);
check("service has bounded timeout", /TimeoutStartSec=30min/.test(service));
check("service does not contain secret values", !/sk-[A-Za-z0-9_-]+|API_KEY=\S{8,}/.test(service), service);

check("timer waits after boot before first refresh", /OnBootSec=10min/.test(timer));
check("timer cadence is 72 hours", /OnUnitActiveSec=72h/.test(timer));
check("timer is persistent across downtime", /Persistent=true/.test(timer));
check("timer points at refresh service", /Unit=chanceping-ai-events-update\.service/.test(timer));
check("timer installs under timers target", /WantedBy=timers\.target/.test(timer));

[
  "AI Events 三天更新任务（SWAS / Workbench）",
  "docs/deployment/chanceping-ai-events-update.service",
  "docs/deployment/chanceping-ai-events-update.timer",
  "systemctl enable --now chanceping-ai-events-update.timer",
  "systemctl list-timers --all | grep chanceping-ai-events-update",
  "systemctl start chanceping-ai-events-update.service",
  "journalctl -u chanceping-ai-events-update.service -n 120 --no-pager",
  "systemctl disable --now chanceping-ai-events-update.timer",
  "npm run ai-events:update -- --collect-sources --discover-with-search --source-max-links=12 --hydrate-images --image-limit=60",
  "curl -fsS http://127.0.0.1:3000/api/public/ai-events?page_size=3",
  "curl -I http://127.0.0.1:3000/aievents",
].forEach((required) => {
  check(`runbook documents ${required}`, runbook.includes(required));
});

check("runbook states public page does not trigger live search or live LLM", /不在访客打开页面时触发 live search 或 live LLM/.test(runbook));
check("runbook states update cadence is 72 hours", /每 72 小时跑一次/.test(runbook));
check("runbook states keys are not printed", /不打印 Qwen \/ Serper API Key/.test(runbook));
check("runbook documents source logo fallback", /来源站点 logo/.test(runbook));
check("runbook does not contain obvious API key value", !/sk-[A-Za-z0-9_-]+|API_KEY=\S{8,}/.test(runbook));

check("package exposes AI Events update command", scripts["ai-events:update"] === "tsx scripts/run-ai-events-update-pipeline.ts");
check("package exposes local scheduler command", scripts["ai-events:update:scheduled"] === "tsx scripts/run-ai-events-update-scheduler.ts");

console.log(`\nQ7S AI Events SWAS scheduler checks: ${pass} PASS / ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
