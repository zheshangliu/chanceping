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
const heroChat = read("web/hero-radar-chat.js");
const watchResult = read("web/watch-result.js");
const aliyunSmoke = read("scripts/verify-q7-aliyun-smoke.ts");
const aliyunRemoteSmoke = read("scripts/verify-q7-aliyun-remote-smoke.ts");
const orchestrator = read("src/search/orchestrator.ts");

check("Q7Y verifier is registered", scripts["verify:q7y:custom-radar-ux"] === "tsx scripts/verify-q7y-custom-radar-ux.ts");
check("hero chat defines ten minute long operation timeout", /LONG_OPERATION_TIMEOUT_MS\s*=\s*10\s*\*\s*60\s*\*\s*1000/.test(heroChat));
check("hero chat postJson uses request timeout support", /async function postJson\(url, body, options = \{\}\)/.test(heroChat) && /fetchWithTimeout/.test(heroChat));
check("hero chat non-json errors mention gateway long wait", /线上网关等待时间|10 分钟|十分钟/.test(heroChat));
check("hero progress exposes one current line", /currentProgressLine/.test(heroChat) && /hero-progress-current/.test(heroChat));
check("hero progress hides provider executor names", !/Qwen\s*正在|DeepSeek\s*正在|Serper\s*正在|LLM\s*正在/i.test(heroChat));
check("watch result uses safe JSON parser", /parseJsonResponse/.test(watchResult) && /NON_JSON_RESPONSE/.test(watchResult));
check("watch result adjust button only routes back to chat", /openRadarChatFromResultFeedback\(\)/.test(watchResult) && !/showRadarRevisionFromResultFeedback/.test(watchResult));
check("watch result live failure copy encourages waiting and retry", /雷达已保留/.test(watchResult) && /不用重新描述/.test(watchResult));
check("Aliyun local smoke expects ChancePing wording", /盯机会正在理解并生成雷达/.test(aliyunSmoke) && !/Qwen 正在|Serper 正在/.test(aliyunSmoke));
check("Aliyun remote smoke expects ChancePing wording", /盯机会正在理解并生成雷达/.test(aliyunRemoteSmoke) && !/Qwen 正在|Serper 正在/.test(aliyunRemoteSmoke));
check("live evidence read timeout is env configurable", /CHANCEPING_LIVE_EVIDENCE_TIMEOUT_MS/.test(orchestrator) && !/timeoutMs:\s*8000/.test(orchestrator));

console.log(`\nQ7Y custom radar UX verification: ${pass} PASS, ${fail} FAIL`);
if (fail > 0) process.exit(1);
