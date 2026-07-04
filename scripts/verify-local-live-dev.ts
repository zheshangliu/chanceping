import { readFileSync } from "fs";

const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
  scripts?: Record<string, string>;
};
const scripts = packageJson.scripts ?? {};
let passed = 0;
let failed = 0;

function check(label: string, condition: boolean): void {
  if (condition) {
    passed += 1;
    console.log(`PASS ${label}`);
  } else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}

const dev = scripts.dev ?? "";
const start = scripts.start ?? "";
const verifyAll = scripts["verify:all"] ?? "";

check("dev explicitly loads local api.env", dev.includes("CHANCEPING_LOAD_API_ENV=true"));
check("dev enables local live LLM", dev.includes("CHANCEPING_ENABLE_LOCAL_LIVE_LLM=true"));
check("dev selects commercial profile", dev.includes("CHANCEPING_LLM_PROFILE=commercial"));
check("dev selects live LLM mode", dev.includes("LLM_MODE=live"));
check("dev does not enable live search", !dev.includes("CHANCEPING_ENABLE_LOCAL_LIVE_SEARCH=true"));
check("start does not implicitly enable local live LLM", !start.includes("CHANCEPING_ENABLE_LOCAL_LIVE_LLM=true"));
check("mock development command remains available", scripts["dev:mock"] === "DATA_MODE=mock LLM_MODE=mock tsx src/api/server.ts");
check("local live verifier is not part of verify:all", !verifyAll.includes("verify:local-live-dev"));

console.log(`local live dev verification: ${passed} PASS / ${failed} FAIL`);
if (failed > 0) process.exit(1);
