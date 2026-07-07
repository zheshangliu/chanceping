import { existsSync, readFileSync } from "node:fs";

let pass = 0;
let fail = 0;

function check(name: string, condition: boolean, detail = ""): void {
  if (condition) {
    pass += 1;
    console.log(`PASS ${name}`);
  } else {
    fail += 1;
    console.error(`FAIL ${name}${detail ? `: ${detail}` : ""}`);
  }
}

const path = "docs/deployment/aliyun-mvp-runbook.md";
check("Aliyun runbook exists", existsSync(path), path);

const text = existsSync(path) ? readFileSync(path, "utf8") : "";
const envExamplePath = "docs/deployment/aliyun.env.example";
check("Aliyun env example exists", existsSync(envExamplePath), envExamplePath);

const envExample = existsSync(envExamplePath) ? readFileSync(envExamplePath, "utf8") : "";

[
  "CHANCEPING_LLM_PROFILE=contest",
  "CONTEST_LLM_PROVIDER=qwen",
  "CONTEST_LLM_MODEL",
  "CONTEST_LLM_BASE_URL",
  "CONTEST_LLM_API_KEY",
  "SERPER_API_KEY",
  "verify:q7:api-env-contest",
  "verify:q7:aliyun-smoke",
  "verify:q7:aliyun-remote-smoke",
  "verify:q7:aliyun-container-smoke",
  "verify:q7:aliyun-preflight",
  "verify:q7:aliyun-deploy-prereqs",
  "CHANCEPING_DEPLOY_BASE_URL",
  "verify:q7:docker-readiness",
  "CHANCEPING_DOCKER_NODE_IMAGE",
  "--build-arg NODE_IMAGE",
  "compare:live-llm-profiles",
  "verify:q7:backend-i18n",
  "Qwen 正在理解并生成雷达",
  "Qwen 正在画雷达",
  "Serper 正在搜索机会，Qwen 随后整理证据",
  "Qwen 正在生成机会报告",
  "verify:all",
  "全球 AI 赛事导航",
  "/aievents",
].forEach((required) => {
  check(`runbook mentions ${required}`, text.includes(required));
});

check("runbook says api.env is not committed", /不提交 `api\.env`/.test(text));
check("runbook keeps verify:all mock-safe", /verify:all.*mock-safe/.test(text));
check("runbook documents one-command Aliyun preflight", /node --run verify:q7:aliyun-preflight/.test(text) && /CHANCEPING_SKIP_ALIYUN_CONTAINER_SMOKE=true/.test(text));
check("runbook documents strict Aliyun deploy prerequisite gate", /CHANCEPING_REQUIRE_ALIYUN_DEPLOY_READY=true node --run verify:q7:aliyun-deploy-prereqs/.test(text));
check("runbook explains built-in radar quota bypass", /内置雷达不占用 3 个自定义额度/.test(text));
check("runbook has backend Qwen wording step", /4\.5 后端页面 Qwen 文案复核/.test(text) && /不出现 DeepSeek 字样/.test(text));
check("runbook says api.env stays out of image", /`api\.env` 不进入镜像/.test(text));
check("runbook documents post-deploy LLM comparison", /compare:live-llm-profiles/.test(text) && /不放进当前阿里云前置闸门/.test(text));
check("runbook does not include obvious API key value", !/sk-[A-Za-z0-9_-]+|API_KEY=\S{8,}/.test(text));
check("runbook references Aliyun env example", text.includes("docs/deployment/aliyun.env.example"));

[
  "NODE_ENV=production",
  "DATA_MODE=mock",
  "LLM_MODE=mock",
  "CHANCEPING_LLM_PROFILE=contest",
  "CONTEST_LLM_PROVIDER=qwen",
  "CONTEST_LLM_MODEL=",
  "CONTEST_LLM_BASE_URL=",
  "CONTEST_LLM_API_KEY=",
  "SERPER_API_KEY=",
  "CHANCEPING_LOAD_API_ENV=false",
  "CHANCEPING_ENABLE_LOCAL_LIVE_SEARCH=false",
  "CHANCEPING_ENABLE_LOCAL_LIVE_LLM=false",
  "CHANCEPING_RADAR_CHAT_STORE_PATH=data/radar-chat-windows.json",
].forEach((required) => {
  check(`Aliyun env example includes ${required}`, envExample.includes(required));
});

check("Aliyun env example keeps API keys blank", !/API_KEY=[^\s#]+/.test(envExample));
check("Aliyun env example does not mention DeepSeek commercial profile", !/deepseek|COMMERCIAL_LLM|CHANCEPING_LLM_PROFILE=commercial/i.test(envExample));

console.log(`Q7 Aliyun runbook: ${pass} PASS / ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
