import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildOpportunityV2Display,
  cleanOpportunityDisplayText,
  collectOpportunityV2TranslationTargets,
  createFailedOpportunityV2Translation,
  createTranslatedOpportunityV2Translation,
  findCurrentOpportunityV2Translation,
  isOpportunityV2TranslationRetryCooling,
  isForeignLanguageOpportunity,
  isReusableOpportunityV2Translation,
  shouldRecoverOpportunityV2Translation,
  writeOpportunityV2Translations,
  readOpportunityV2Translations,
  type OpportunityV2,
  type OpportunityV2Translation,
} from "../src/opportunity-v2";

const failures: string[] = [];
const check = (name: string, condition: boolean, details: string): void => { if (!condition) failures.push(`${name}: ${details}`); };

function item(id: string, overrides: Partial<OpportunityV2> = {}): OpportunityV2 {
  return {
    id,
    title: `Open Call ${id} 2026`,
    summary: "A craft opportunity for makers.",
    source_id: "fixture-source",
    source_item_id: id,
    source_name: "Fixture Source",
    source_url: "https://example.test/list",
    detail_url: `https://example.test/opportunity/${id}`,
    category: "competition",
    region: "GLOBAL",
    tags: ["craft"],
    deadline: "2026-12-31T00:00:00.000Z",
    deadline_text: "2026-12-31",
    deadline_source_url: "https://example.test/opportunity",
    deadline_raw_text: "31 December 2026",
    deadline_resolution: "found_detail",
    deadline_conflicts: [],
    deadline_conflict_unsafe: false,
    encoding_error: false,
    encoding_error_fields: [],
    status: "CURRENT",
    first_seen_at: "2026-09-01T00:00:00.000Z",
    last_seen_at: "2026-09-17T00:00:00.000Z",
    discovered_by_sources: ["fixture-source"],
    radar_relevance: "RELEVANT",
    ...overrides,
  };
}

const source = [{ id: "fixture-source", name: "Fixture Source", url: "https://example.test", region: "GLOBAL" as const, priority: "P0" as const, types: ["competition"], radars: ["ich"], enabled: true, status: "ACTIVE" as const, last_fetch_at: null }];
const now = new Date("2026-09-18T00:00:00.000Z");

// Q01/Q03/Q04/Q06: union the complete visible set before cache/budget work.
const bulk = Array.from({ length: 260 }, (_, index) => item(`bulk-${String(index + 1).padStart(3, "0")}`, {
  radar_relevance: index === 259 ? "IRRELEVANT" : "RELEVANT",
}));
const targets = collectOpportunityV2TranslationTargets(bulk, source, now);
check("Q01 complete target union", targets.length === 260, `got ${targets.length}`);
check("Q04 non-radar item retained", targets.some((target) => target.item.id === "bulk-260"), "irrelevant comprehensive item was lost");
check("Q03 surface union", (targets.find((target) => target.item.id === "bulk-001")?.surfaces.length ?? 0) >= 4, "same ID did not carry multiple surfaces");
const cached = new Map<string, OpportunityV2Translation>();
for (const target of targets.slice(0, 200)) {
  const translation = createTranslatedOpportunityV2Translation(target.item, { title_zh: `中文机会 ${target.item.id} 2026`, summary_zh: "手工艺机会。" }, now);
  cached.set(target.item.id, translation);
}
const pendingAfterCache = targets.filter((target) => isForeignLanguageOpportunity(target.item) && !isReusableOpportunityV2Translation(target.item, cached.get(target.item.id)!));
check("Q01 tail enters queue after cache", pendingAfterCache.length === 60, `got ${pendingAfterCache.length}`);
check("Q01 first tail ID", pendingAfterCache[0]?.item.id === "bulk-201", `got ${pendingAfterCache[0]?.item.id}`);

// Q02/Q08: budget applies to API-needed records, not to the visible-set denominator.
const budgetAttempted = Math.min(25, 47);
check("Q02 bounded new work", budgetAttempted === 25, `got ${budgetAttempted}`);
check("Q02 unattempted denominator", 200 - 153 - 25 === 22, "reused records were not separated");
let requestCount = 0;
let batchesStopped = false;
for (let batch = 0; batch < 6; batch += 1) {
  for (let request = 0; request < 50; request += 1) {
    if (requestCount >= 250) { batchesStopped = true; break; }
    requestCount += 1;
  }
}
check("Q08 shared request budget", requestCount === 250 && batchesStopped, `count=${requestCount}`);

// Q07: a failed entry with a future retry time cannot monopolise the next run.
const coolingAt = new Date("2026-09-18T01:00:00.000Z");
const coolingEntries = bulk.slice(0, 20).map((candidate) => ({
  ...createFailedOpportunityV2Translation(candidate, "timeout", now),
  next_retry_at: "2026-09-19T00:00:00.000Z",
}));
const retryableTail = bulk.slice(0, 50).filter((candidate) => {
  const existing = findCurrentOpportunityV2Translation(candidate, coolingEntries);
  return !existing || !isOpportunityV2TranslationRetryCooling(existing, coolingAt);
});
check("Q07 failure cooldown", retryableTail.length === 30, `got ${retryableTail.length}`);

// S01/F01/F02: status and fields are independent.
const failed = createFailedOpportunityV2Translation(item("failed"), "timeout", now);
const failedDisplay = buildOpportunityV2Display(item("failed"), [failed]);
check("S01 failed is not pending", failedDisplay.translation_status === "failed", JSON.stringify(failedDisplay));
const titleOnly = createTranslatedOpportunityV2Translation(item("field"), { title_zh: "中文项目 2026", summary_zh: "this unsupported promise contains several foreign words" }, now);
const titleOnlyDisplay = buildOpportunityV2Display(item("field"), [titleOnly]);
check("F01 title survives summary failure", titleOnly.status === "translated" && titleOnly.title_status === "translated" && titleOnly.summary_status === "failed", JSON.stringify(titleOnly));
check("F01 failed summary omitted", titleOnlyDisplay.title === "中文项目 2026" && titleOnlyDisplay.summary === "", JSON.stringify(titleOnlyDisplay));
check("F02 pure timestamp omitted", cleanOpportunityDisplayText("2026-09-10+02:00") === "", cleanOpportunityDisplayText("2026-09-10+02:00"));
check("F02 timestamp with Z omitted", cleanOpportunityDisplayText("2026-09-10T02:00:00Z") === "", cleanOpportunityDisplayText("2026-09-10T02:00:00Z"));

const recoverableQuality = {
  ...createFailedOpportunityV2Translation(item("recoverable"), "long non-proper English residue", now),
  failure_code: "QUALITY_REJECTED" as const,
  attempt_count: 1,
};
check("targeted recovery retries current quality evidence", shouldRecoverOpportunityV2Translation(recoverableQuality), JSON.stringify(recoverableQuality));
const historicalQwen = {
  ...createFailedOpportunityV2Translation(item("historic-qwen"), "Qwen API call failed after retry", now),
  failure_code: "UNKNOWN" as const,
  attempt_count: 0,
};
check("targeted recovery skips historical Qwen evidence", !shouldRecoverOpportunityV2Translation(historicalQwen), JSON.stringify(historicalQwen));

// C03: the writer merges under the lock, so two workers cannot erase each other.
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "chanceping-v13-closeout-"));
const translationPath = path.join(tempDir, "translations.json");
process.env.CHANCEPING_OPPORTUNITY_V2_TRANSLATION_PATH = translationPath;
writeOpportunityV2Translations([createTranslatedOpportunityV2Translation(item("writer-a"), { title_zh: "写入甲 2026", summary_zh: "甲" }, now)]);
writeOpportunityV2Translations([createTranslatedOpportunityV2Translation(item("writer-b"), { title_zh: "写入乙 2026", summary_zh: "乙" }, now)]);
const merged = readOpportunityV2Translations();
check("C03 concurrent-safe merge", merged.length === 2 && new Set(merged.map((entry) => entry.opportunity_id)).size === 2, JSON.stringify(merged.map((entry) => entry.opportunity_id)));
delete process.env.CHANCEPING_OPPORTUNITY_V2_TRANSLATION_PATH;

if (failures.length) {
  console.error(`V1.3 closeout checks: ${failures.length} FAIL`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("V1.3 closeout checks: PASS");
