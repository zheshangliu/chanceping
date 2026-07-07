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
check("Aliyun remote smoke verifier is registered", scripts["verify:q7:aliyun-remote-smoke"] === "tsx scripts/verify-q7-aliyun-remote-smoke.ts");
check("Aliyun container smoke verifier is registered", scripts["verify:q7:aliyun-container-smoke"] === "tsx scripts/verify-q7-aliyun-container-smoke.ts");
check("Aliyun preflight verifier is registered", scripts["verify:q7:aliyun-preflight"] === "tsx scripts/verify-q7-aliyun-preflight.ts");
check("Aliyun deploy prereq verifier is registered", scripts["verify:q7:aliyun-deploy-prereqs"] === "tsx scripts/verify-q7-aliyun-deploy-prereqs.ts");
check("Docker readiness verifier is registered", scripts["verify:q7:docker-readiness"] === "tsx scripts/verify-q7-docker-readiness.ts");
check("LLM comparison verifier is registered", scripts["verify:q7:llm-comparison"] === "tsx scripts/verify-q7-llm-comparison.ts");
check(
  "LLM comparison command is explicit opt-in",
  scripts["compare:live-llm-profiles"] === "CHANCEPING_LOAD_API_ENV=true CHANCEPING_RUN_LLM_COMPARISON=true tsx scripts/compare-live-llm-profiles.ts",
);

[
  "verify:live",
  "q4:live-server",
  "verify:q7:live-demo",
  "compare:live-llm-profiles",
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
const aliyunEnvExample = read("docs/deployment/aliyun.env.example");
const competitionEnvExample = read(".env.example.competition");
check("Aliyun runbook documents Qwen contest profile", aliyunRunbook.includes("CHANCEPING_LLM_PROFILE=contest") && aliyunRunbook.includes("CONTEST_LLM_PROVIDER=qwen"));
check("Aliyun runbook documents built-in AI events navigator", aliyunRunbook.includes("全球 AI 赛事导航") && aliyunRunbook.includes("/aievents"));
check("Aliyun runbook documents remote smoke", aliyunRunbook.includes("CHANCEPING_DEPLOY_BASE_URL") && aliyunRunbook.includes("verify:q7:aliyun-remote-smoke"));
check(
  "Aliyun runbook documents backend Qwen wording gate",
  aliyunRunbook.includes("4.5 后端页面 Qwen 文案复核")
    && aliyunRunbook.includes("verify:q7:backend-i18n")
    && aliyunRunbook.includes("Serper 正在搜索机会，Qwen 随后整理证据"),
);
check("Aliyun runbook documents Docker readiness", aliyunRunbook.includes("verify:q7:docker-readiness") && /`api\.env` 不进入镜像/.test(aliyunRunbook));
check(
  "Aliyun runbook documents container smoke",
  aliyunRunbook.includes("verify:q7:aliyun-container-smoke")
    && aliyunRunbook.includes("CHANCEPING_DOCKER_NODE_IMAGE")
    && aliyunRunbook.includes("verify:q7:aliyun-remote-smoke"),
);
check(
  "Aliyun runbook documents one-command preflight",
  aliyunRunbook.includes("verify:q7:aliyun-preflight")
    && aliyunRunbook.includes("CHANCEPING_SKIP_ALIYUN_CONTAINER_SMOKE"),
);
check(
  "Aliyun runbook documents real deploy prerequisite gate",
  aliyunRunbook.includes("verify:q7:aliyun-deploy-prereqs")
    && aliyunRunbook.includes("CHANCEPING_REQUIRE_ALIYUN_DEPLOY_READY=true"),
);
check("Aliyun runbook documents post-deploy LLM comparison", aliyunRunbook.includes("compare:live-llm-profiles") && aliyunRunbook.includes("不放进当前阿里云前置闸门"));
check("Aliyun env example uses Qwen contest profile", aliyunEnvExample.includes("CHANCEPING_LLM_PROFILE=contest") && aliyunEnvExample.includes("CONTEST_LLM_PROVIDER=qwen"));
check("Aliyun env example keeps live flags off by default", aliyunEnvExample.includes("CHANCEPING_LOAD_API_ENV=false") && aliyunEnvExample.includes("CHANCEPING_ENABLE_LOCAL_LIVE_SEARCH=false") && aliyunEnvExample.includes("CHANCEPING_ENABLE_LOCAL_LIVE_LLM=false"));
check("Aliyun env example keeps API keys blank", !/API_KEY=[^\s#]+/.test(aliyunEnvExample));
check("competition env example documents current contest profile", competitionEnvExample.includes("CHANCEPING_LLM_PROFILE=contest") && competitionEnvExample.includes("CONTEST_LLM_API_KEY="));

const dockerignore = read(".dockerignore");
const dockerfile = read("Dockerfile");
const compose = read("docker-compose.yml");
check("Docker context excludes api.env", /^api\.env$/m.test(dockerignore));
check("Dockerfile defaults to Qwen contest and mock-safe", dockerfile.includes("CHANCEPING_LLM_PROFILE=contest") && dockerfile.includes("CONTEST_LLM_PROVIDER=qwen") && dockerfile.includes("LLM_MODE=mock"));
check("docker-compose does not mount api.env", !/api\.env\s*:\s*\/app/.test(compose));

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
const backendUser = read("web/backend-user.js");
const radarsJs = read("web/radars.js");
const radarDetailJs = read("web/radar-detail.js");
check("hero chat supports per-user query isolation", heroChat.includes("hero_chat_user_id") && heroChat.includes("test_user_id"));
check(
  "hero chat defaults public visitors to persistent anonymous ids",
  heroChat.includes("chanceping_hero_visitor_user_id")
    && heroChat.includes("createAnonymousHeroUserId")
    && heroChat.includes("localStorage.setItem(ANONYMOUS_USER_ID_KEY")
    && !heroChat.includes('DEFAULT_USER_ID = "demo_user"'),
);
check("hero chat keeps custom window quota at 3", heroChat.includes("CHAT_WINDOW_LIMIT = 3"));
check(
  "hero chat uses global AI events navigator sample room",
  heroChat.includes('id: "ai-event-sample-room"') && heroChat.includes('name: "全球 AI 赛事导航"'),
);
check(
  "legacy backend user helper reuses hero visitor id",
  backendUser.includes("chanceping_hero_visitor_user_id") && backendUser.includes("hero_chat_user_id") && backendUser.includes("test_user_id"),
);
check(
  "legacy backend user helper sends request user header",
  backendUser.includes("X-ChancePing-User-Id") && backendUser.includes("withUserHeaders") && backendUser.includes("fetchWithUser"),
);
check(
  "my radars list/detail use visitor-scoped backend fetch",
  radarsJs.includes("backendFetch") && radarDetailJs.includes("backendFetch") && radarsJs.includes("ChancePingBackendUser") && radarDetailJs.includes("ChancePingBackendUser"),
);

const aiEventsPage = read("web/ai-events.js");
check("public AI events page reads public feed", aiEventsPage.includes("fetch(`/api/public/ai-events?"));
check("public AI events page does not call search API", !/\/api\/search/.test(aiEventsPage));
check("public AI events page does not run radars directly", !/\/api\/radars\/[^"`']+\/run/.test(aiEventsPage));
check("public AI events page does not depend on live_search flag", !/live_search/i.test(aiEventsPage));

console.log(`Q7 cloud readiness: ${pass} PASS / ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
