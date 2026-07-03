import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  Golden20BrowserRunner,
  loadGoldenResults,
  saveGoldenResults,
} from "./golden-20-browser-baseline.mjs";
import {
  GOLDEN8_IDS,
  RANDOM10_CASES,
  buildGolden8Report,
  buildPostQ5ManualQualityAudit,
  buildRandom10Report,
} from "./q5-r-validation.mjs";

const dir = await mkdtemp(join(tmpdir(), "chanceping-q5-r-"));
try {
  const resultFile = join(dir, "results.json");
  await saveGoldenResults([{ id: 3, status: "通过" }], resultFile);
  assert.deepEqual(await loadGoldenResults(resultFile), [{ id: 3, status: "通过" }]);

  const runner = new Golden20BrowserRunner({ tab: null, resultFile });
  assert.equal(runner.resultFile, resultFile);

  assert.deepEqual(GOLDEN8_IDS, [3, 4, 8, 9, 11, 13, 19, 20]);
  assert.equal(RANDOM10_CASES.length, 10);

  const goldenReport = buildGolden8Report([
    {
      id: 3,
      status: "通过",
      cardCount: 1,
      cardsActionable: true,
      searchRelevant: true,
      saved: true,
      rerunSuccess: true,
      secondReport: true,
      keyLeak: false,
      mockFallback: false,
      overclaim: false,
    },
  ], [{
    id: 3,
    rawCandidateCount: 12,
    keySemanticCandidateCount: 4,
    rulePassedCount: 2,
    acceptedCardCount: 1,
    rejectedReasonTop3: ["低行动性来源"],
  }]);
  assert.match(goldenReport, /rawCandidateCount/);
  assert.match(goldenReport, /至少 6\/8/);
  assert.doesNotMatch(goldenReport, /每个案例 acceptedCardCount/);

  const randomReport = buildRandom10Report([{ id: 1, strategyPassed: true }]);
  assert.match(randomReport, /原始输入/);
  assert.match(randomReport, /真实 LLM/);

  const manualAudit = buildPostQ5ManualQualityAudit(Array.from({ length: 20 }, (_, index) => ({
    id: index + 1,
    status: "通过",
    cardTitles: [],
  })));
  assert.match(manualAudit, /人工强通过：10\/20/);
  assert.match(manualAudit, /暂不进入 N\/O/);

  console.log("Q5-R harness: 8 PASS / 0 FAIL");
} finally {
  await rm(dir, { recursive: true, force: true });
}
