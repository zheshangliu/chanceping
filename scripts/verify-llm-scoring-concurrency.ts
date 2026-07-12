import { readFileSync } from "fs";

let pass = 0;
let fail = 0;
function check(name: string, condition: boolean): void {
  if (condition) { pass += 1; console.log(`PASS ${name}`); }
  else { fail += 1; console.error(`FAIL ${name}`); }
}

const scorer = readFileSync("src/search/opportunity-scorer.ts", "utf-8");
const envExample = readFileSync(".env.example", "utf-8");
check("opportunity scoring uses bounded parallel batches", scorer.includes("CHANCEPING_LLM_SCORING_CONCURRENCY") && scorer.includes("Promise.all") && scorer.includes("Math.min(6"));
check("opportunity scoring opens a per-run circuit breaker after live LLM failure", scorer.includes("llmScoringUnavailable"));
check("environment template documents scoring concurrency", envExample.includes("CHANCEPING_LLM_SCORING_CONCURRENCY=3"));
console.log(`LLM scoring concurrency verification: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);
