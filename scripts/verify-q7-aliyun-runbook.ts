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

[
  "CHANCEPING_LLM_PROFILE=contest",
  "CONTEST_LLM_PROVIDER=qwen",
  "CONTEST_LLM_MODEL",
  "CONTEST_LLM_BASE_URL",
  "CONTEST_LLM_API_KEY",
  "SERPER_API_KEY",
  "verify:q7:api-env-contest",
  "verify:q7:aliyun-smoke",
  "verify:all",
  "全球 AI 赛事导航",
  "/aievents",
].forEach((required) => {
  check(`runbook mentions ${required}`, text.includes(required));
});

check("runbook says api.env is not committed", /不提交 `api\.env`/.test(text));
check("runbook keeps verify:all mock-safe", /verify:all.*mock-safe/.test(text));
check("runbook explains built-in radar quota bypass", /内置雷达不占用 3 个自定义额度/.test(text));
check("runbook does not include obvious API key value", !/sk-[A-Za-z0-9_-]+|API_KEY=\S{8,}/.test(text));

console.log(`Q7 Aliyun runbook: ${pass} PASS / ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
