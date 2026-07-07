import { existsSync, readFileSync } from "node:fs";

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

const packageJson = JSON.parse(read("package.json") || "{}") as { scripts?: Record<string, string> };
const scripts = packageJson.scripts ?? {};
const compareScript = read("scripts/compare-live-llm-profiles.ts");
const runbook = read("docs/deployment/aliyun-mvp-runbook.md");
const integratedPlan = read("docs/superpowers/plans/2026-07-07-chanceping-next-stage-integrated-plan.md");

check("comparison verifier is registered", scripts["verify:q7:llm-comparison"] === "tsx scripts/verify-q7-llm-comparison.ts");
check(
  "live comparison command is explicit opt-in",
  scripts["compare:live-llm-profiles"] === "CHANCEPING_LOAD_API_ENV=true CHANCEPING_RUN_LLM_COMPARISON=true tsx scripts/compare-live-llm-profiles.ts",
  scripts["compare:live-llm-profiles"] ?? "missing",
);
check("comparison command is not in verify:all", !String(scripts["verify:all"] ?? "").includes("compare:live-llm-profiles"));
check("comparison verifier is not in verify:all", !String(scripts["verify:all"] ?? "").includes("verify:q7:llm-comparison"));
check("comparison script exists", existsSync("scripts/compare-live-llm-profiles.ts"));
check("comparison script requires explicit run flag", compareScript.includes("CHANCEPING_RUN_LLM_COMPARISON"));
check("comparison script loads api.env only through local loader", compareScript.includes("loadLocalApiEnv"));
check("comparison script resolves public profile metadata", compareScript.includes("toLiveLlmPublicProfile"));
check("comparison script compares commercial and contest profiles", compareScript.includes('"commercial"') && compareScript.includes('"contest"'));
check("comparison script records provider model latency and shape", ["profile", "provider", "model", "latencyMs", "contentLength", "parsedKeys"].every((field) => compareScript.includes(field)));
check("comparison script uses fixed prompts", compareScript.includes("requirement_understanding") && compareScript.includes("result_feedback") && compareScript.includes("report_explanation"));
check("comparison script never logs raw apiKey", !/console\.(log|error)\([^)]*apiKey|JSON\.stringify\([^)]*profile[^)]*\)/s.test(compareScript));
check("comparison script has no obvious key literal", !/sk-[A-Za-z0-9_-]+|API_KEY=\S{8,}/.test(compareScript));
check("runbook documents comparison as post-deploy non-gate", runbook.includes("compare:live-llm-profiles") && runbook.includes("不放进当前阿里云前置闸门"));
check("integrated plan documents comparison harness", integratedPlan.includes("compare:live-llm-profiles") && integratedPlan.includes("without logging keys"));

console.log(`Q7 LLM comparison harness: ${pass} PASS / ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
