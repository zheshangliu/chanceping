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

const dockerfile = read("Dockerfile");
const compose = read("docker-compose.yml");
const dockerignore = read(".dockerignore");

check("Dockerfile exists", existsSync("Dockerfile"));
check("docker-compose.yml exists", existsSync("docker-compose.yml"));
check(".dockerignore exists", existsSync(".dockerignore"));

check("Docker build context excludes api.env", /^api\.env$/m.test(dockerignore));
check("Docker build context excludes runtime data", ["data/", "reports/", "exports/", "artifacts/"].every((item) => dockerignore.includes(item)));
check("Docker build context excludes local work artifacts", dockerignore.includes(".superpowers/") && dockerignore.includes("ui-audit-*/"));
check("Dockerfile does not mention api.env", !/api\.env/.test(dockerfile.replace(/注意：api\.env 必须只留在本地，不能进入 Docker build context。/, "")));
check("Dockerfile sets production environment", /ENV NODE_ENV=production/.test(dockerfile));
check("Dockerfile base image can be overridden for Aliyun/ACR builds", /ARG NODE_IMAGE=node:22-slim/.test(dockerfile) && /FROM \$\{NODE_IMAGE\} AS builder/.test(dockerfile) && /FROM \$\{NODE_IMAGE\} AS runtime/.test(dockerfile));
check("Dockerfile defaults to mock-safe mode", /ENV DATA_MODE=mock/.test(dockerfile) && /ENV LLM_MODE=mock/.test(dockerfile));
check("Dockerfile selects Qwen contest profile", /ENV CHANCEPING_LLM_PROFILE=contest/.test(dockerfile) && /ENV CONTEST_LLM_PROVIDER=qwen/.test(dockerfile));
check("Dockerfile disables local api.env loading", /ENV CHANCEPING_LOAD_API_ENV=false/.test(dockerfile));
check("Dockerfile disables local live flags by default", /ENV CHANCEPING_ENABLE_LOCAL_LIVE_SEARCH=false/.test(dockerfile) && /ENV CHANCEPING_ENABLE_LOCAL_LIVE_LLM=false/.test(dockerfile));
check("Dockerfile keeps radar chat store on mounted data dir", /ENV CHANCEPING_RADAR_CHAT_STORE_PATH=data\/radar-chat-windows\.json/.test(dockerfile));
check("Dockerfile healthchecks /health", dockerfile.includes("http://localhost:3000/health"));
check("Dockerfile starts API server through npm start", /CMD \["npm", "run", "start"\]/.test(dockerfile));
check("Dockerfile runtime keeps tsx available for TypeScript start", /# MVP 测试站直接运行 TypeScript 入口，需要 tsx/.test(dockerfile) && /RUN npm ci --include=dev/.test(dockerfile));

check("compose sets production environment", compose.includes("NODE_ENV=production"));
check("compose exposes NODE_IMAGE build arg", compose.includes("NODE_IMAGE: ${CHANCEPING_DOCKER_NODE_IMAGE:-node:22-slim}"));
check("compose defaults to mock-safe mode", compose.includes("DATA_MODE=mock") && compose.includes("LLM_MODE=mock"));
check("compose selects Qwen contest profile", compose.includes("CHANCEPING_LLM_PROFILE=contest") && compose.includes("CONTEST_LLM_PROVIDER=qwen"));
check("compose does not mount api.env", !/api\.env\s*:\s*\/app/.test(compose));
check("compose persists data reports and exports", ["./data:/app/data", "./reports:/app/reports", "./exports:/app/exports"].every((item) => compose.includes(item)));
check("compose documents secret injection without values", compose.includes("CONTEST_LLM_API_KEY=${CONTEST_LLM_API_KEY}") && compose.includes("SERPER_API_KEY=${SERPER_API_KEY}"));
check("compose does not contain obvious API key value", !/sk-[A-Za-z0-9_-]+|API_KEY=(?!\$\{)[^\s#]{8,}/.test(compose));
check("Docker assets do not mention DeepSeek", !/DeepSeek|deepseek|DEEPSEEK/.test(`${dockerfile}\n${compose}`));

console.log(`Q7 Docker readiness: ${pass} PASS / ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
