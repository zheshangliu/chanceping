import { execFileSync } from "node:child_process";
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

function gitLsFiles(path: string): string {
  try {
    return execFileSync("git", ["ls-files", path], { encoding: "utf8" });
  } catch {
    return "";
  }
}

const packageJson = JSON.parse(read("package.json") || "{}") as { scripts?: Record<string, string> };
const scripts = packageJson.scripts ?? {};
const verifyAll = scripts["verify:all"] ?? "";

check("local dev uses Qwen contest profile", /CHANCEPING_LLM_PROFILE=contest/.test(scripts.dev ?? ""));
check("live LLM verifier uses Qwen contest profile", /CHANCEPING_LLM_PROFILE=contest/.test(scripts["verify:live-llm"] ?? ""));
check("Q7 live demo uses Qwen contest profile", /CHANCEPING_LLM_PROFILE=contest/.test(scripts["verify:q7:live-demo"] ?? ""));
check("backend Qwen wording verifier is registered", scripts["verify:q7:backend-i18n"] === "tsx scripts/verify-q7-backend-i18n.ts");
check("api.env Qwen contest verifier is registered", scripts["verify:q7:api-env-contest"] === "tsx scripts/verify-q7-api-env-contest.ts");
check("chat window verifier is registered", scripts["verify:q7:chat-window"] === "tsx scripts/verify-q7-chat-window.ts");
check("cloud readiness verifier is registered", scripts["verify:q7:cloud-readiness"] === "tsx scripts/verify-q7-cloud-readiness.ts");
check("Aliyun runbook verifier is registered", scripts["verify:q7:aliyun-runbook"] === "tsx scripts/verify-q7-aliyun-runbook.ts");
check("Aliyun smoke verifier is registered", scripts["verify:q7:aliyun-smoke"] === "tsx scripts/verify-q7-aliyun-smoke.ts");

[
  "verify:live",
  "q4:live-server",
  "verify:q7:live-demo",
  "CHANCEPING_LOAD_API_ENV=true",
  "CHANCEPING_ENABLE_LOCAL_LIVE_SEARCH=true",
  "CHANCEPING_ENABLE_LOCAL_LIVE_LLM=true",
].forEach((forbidden) => {
  check(`verify:all does not include ${forbidden}`, !verifyAll.includes(forbidden), verifyAll);
});

const gitignore = read(".gitignore").split(/\r?\n/).map((line) => line.trim());
check("api.env is gitignored", gitignore.includes("api.env") || gitignore.includes("/api.env"));
check("api.env is not tracked", gitLsFiles("api.env").trim() === "");

const aliyunRunbook = read("docs/deployment/aliyun-mvp-runbook.md");
check("Aliyun runbook documents Qwen contest profile", aliyunRunbook.includes("CHANCEPING_LLM_PROFILE=contest") && aliyunRunbook.includes("CONTEST_LLM_PROVIDER=qwen"));
check("Aliyun runbook documents built-in AI events navigator", aliyunRunbook.includes("全球 AI 赛事导航") && aliyunRunbook.includes("/aievents"));

const backendVisibleFiles = [
  "web/index.html",
  "web/home.js",
  "web/hero-radar-chat.js",
  "web/radar-profile.js",
  "web/radars.js",
  "web/radar-detail.js",
  "web/watch-result.js",
  "web/search.js",
].map((file) => ({ file, content: read(file) }));

const visibleJoined = backendVisibleFiles.map(({ content }) => content).join("\n");
const deepSeekHits = backendVisibleFiles
  .filter(({ content }) => /DeepSeek|deepseek|DEEPSEEK/.test(content))
  .map(({ file }) => file);
check("customer-visible backend files do not mention DeepSeek", deepSeekHits.length === 0, deepSeekHits.join(", "));
[
  "Qwen 正在理解并生成雷达",
  "Qwen 正在画雷达",
  "Serper 正在搜索机会，Qwen 随后整理证据",
  "Qwen 正在生成机会报告",
  "Qwen 正在生成报告",
].forEach((phrase) => {
  check(`customer-visible backend includes ${phrase}`, visibleJoined.includes(phrase));
});

const radarChatRoutes = read("src/api/routes/radar-chats.ts");
check("built-in sample room id is defined", radarChatRoutes.includes('BUILTIN_SAMPLE_ROOM_ID = "ai-event-sample-room"'));
check(
  "built-in sample room bypasses custom quota",
  radarChatRoutes.includes("isBuiltinSampleRoomRadarId")
    && radarChatRoutes.includes("!isBuiltinSampleRoomRadarId(radarId)")
    && radarChatRoutes.includes("item.radarId !== BUILTIN_SAMPLE_ROOM_ID"),
);

const chatWindowVerifier = read("scripts/verify-q7-chat-window.ts");
check(
  "chat verifier covers built-in sample room after quota full",
  chatWindowVerifier.includes("built-in AI event sample room is available even after custom quota is full"),
);
check("chat verifier checks hard delete behavior", chatWindowVerifier.includes("hard deletes a window"));

const heroChat = read("web/hero-radar-chat.js");
check("hero chat supports per-user query isolation", heroChat.includes("hero_chat_user_id") && heroChat.includes("test_user_id"));
check("hero chat keeps custom window quota at 3", heroChat.includes("CHAT_WINDOW_LIMIT = 3"));
check(
  "hero chat uses global AI events navigator sample room",
  heroChat.includes('id: "ai-event-sample-room"') && heroChat.includes('name: "全球 AI 赛事导航"'),
);

const aiEventsPage = read("web/ai-events.js");
check("public AI events page reads public feed", aiEventsPage.includes("fetch(`/api/public/ai-events?"));
check("public AI events page does not call search API", !/\/api\/search/.test(aiEventsPage));
check("public AI events page does not run radars directly", !/\/api\/radars\/[^"`']+\/run/.test(aiEventsPage));
check("public AI events page does not depend on live_search flag", !/live_search/i.test(aiEventsPage));

console.log(`Q7 cloud readiness: ${pass} PASS / ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
