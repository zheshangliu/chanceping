import { readFileSync } from "fs";

let pass = 0;
let fail = 0;

function check(name: string, condition: boolean): void {
  if (condition) {
    pass += 1;
    console.log(`PASS ${name}`);
  } else {
    fail += 1;
    console.error(`FAIL ${name}`);
  }
}

const evidence = readFileSync("src/search/live-evidence.ts", "utf-8");
const orchestrator = readFileSync("src/search/orchestrator.ts", "utf-8");
const envExample = readFileSync(".env.example", "utf-8");

check("evidence reader supports bounded concurrency", evidence.includes("concurrency?: number") && evidence.includes("Promise.all") && evidence.includes("CHANCEPING_LIVE_EVIDENCE_CONCURRENCY"));
check("orchestrator passes explicit evidence concurrency", orchestrator.includes('concurrency: readPositiveIntegerEnv("CHANCEPING_LIVE_EVIDENCE_CONCURRENCY", 3)'));
check("environment template documents safe evidence concurrency", envExample.includes("CHANCEPING_LIVE_EVIDENCE_CONCURRENCY=3"));

console.log(`live evidence concurrency verification: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);
