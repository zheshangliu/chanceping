import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runOpportunityV2DisplayTranslation } from "../src/opportunity-v2/translation-runner";
import { translationPrompt } from "../src/opportunity-v2/translation-provider";
import type { OpportunityV2 } from "../src/opportunity-v2/types";
import { claimApprovedOpportunityV2TitleRepair, createTranslatedOpportunityV2Translation, isForeignLanguageTitle, readOpportunityV2Translations, writeOpportunityV2Translations } from "../src/opportunity-v2/display";

const now = new Date("2026-10-06T07:00:00.000Z");
const source = {
  id: "v16-test-source", name: "Craft opportunity source", url: "https://example.org/opportunities", region: "GLOBAL" as const,
  priority: "P0" as const, types: ["competition", "craft"], radars: ["ich"], enabled: true, status: "ACTIVE" as const, last_fetch_at: now.toISOString(),
};
const p0: OpportunityV2 = {
  id: "v16-p0-title-repair", title: "2026 International Craft Fellowship", summary: "Application deadline 2026-11-01.",
  source_id: source.id, source_item_id: "p0", source_name: source.name, source_url: source.url, detail_url: "https://example.org/opportunities/p0",
  category: "competition", region: "GLOBAL", tags: ["craft"], deadline: "2026-11-01", status: "CURRENT",
  first_seen_at: now.toISOString(), last_seen_at: now.toISOString(), discovered_by_sources: [source.id], radar_relevance: "RELEVANT",
};
const p1: OpportunityV2 = {
  ...p0, id: "v16-p1-no-repair", source_item_id: "p1", title: "International Craft Fellowship 2027", summary: "Rolling applications for eligible craft applicants.",
  detail_url: "https://example.org/opportunities/p1", deadline: null, status: "UNKNOWN_DEADLINE",
};

async function main(): Promise<void> {
  for (const title of [
    "2026第六届“建筑师的椅子”（The Architect's Chair）设计竞赛",
    "国誉设计大奖2027 KOKUYO DESIGN AWARD",
    "2026 第四届亚洲IP设计大赛 ASIA IP CONTEST in TOKYO 2026",
    "2027第十五届美国Architizer A+奖（Architizer A+Awards）",
    "中国教育技术协会“大学生OPC创业—AI Agent创新赛道”宣传短片征集活动",
  ]) {
    assert.equal(isForeignLanguageTitle({ title }), false, `already readable Chinese title: ${title}`);
    assert.equal(createTranslatedOpportunityV2Translation({ ...p0, title }, { title_zh: title, summary_zh: "" }, now).status, "translated");
  }
  assert.equal(isForeignLanguageTitle({ title: "International Craft Fellowship 国际" }), true);
  assert.equal(isForeignLanguageTitle({ title: "国际艺术征集 International Craft Fellowship Residency Application Requirements" }), true);
  assert.equal(isForeignLanguageTitle({ title: "2026 올해의 공예상 후보자 추천 공모" }), true);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ich-v16-translation-quality-"));
  const sourcesPath = path.join(dir, "sources.json");
  const poolPath = path.join(dir, "opportunities.json");
  const translationsPath = path.join(dir, "translations.json");
  fs.writeFileSync(sourcesPath, JSON.stringify({ sources: [source] }));
  fs.writeFileSync(poolPath, JSON.stringify({ schema_version: "chanceping-opportunity-v2.v1", updated_at: now.toISOString(), opportunities: [p0, p1] }));
  fs.writeFileSync(translationsPath, JSON.stringify({ translations: [] }));
  const calls: Array<{ id: string; summary: string }> = [];
  const provider = {
    id: "deepseek", free: false,
    async translate(input: { title: string; summary: string; targetLanguage: "zh-CN" }) {
      const isP0 = input.title === p0.title;
      const priorCalls = calls.filter((call) => call.id === (isP0 ? p0.id : p1.id)).length;
      calls.push({ id: isP0 ? p0.id : p1.id, summary: input.summary });
      if (isP0 && priorCalls === 1) return { title_zh: "2026年国际手工艺驻留计划", summary_zh: "" };
      return { title_zh: "completely unrelated phrase without any translated title words", summary_zh: "" };
    },
  };
  try {
    const result = await runOpportunityV2DisplayTranslation({ now, execute: true, allSurfaces: true, sourcesPath, poolPath, translationPath: translationsPath, translationProvider: provider });
    assert.equal(result.p0_title_repair_attempted, 1, "a quality-rejected P0 title gets exactly one repair request");
    assert.equal(result.p0_title_repair_succeeded, 1);
    assert.equal(result.p0_title_repair_failed, 0);
    assert.equal(calls.filter((call) => call.id === p0.id).length, 2, "P0 has one initial request plus no more than one repair");
    assert.equal(calls.filter((call) => call.id === p1.id).length, 1, "P1 receives no repair retry");
    assert.equal(result.quality_rejection_clusters.ENGLISH_RESIDUE, 2, "quality failures are clustered without logging source text");
    assert.ok((result.quality_rejection_clusters.MISSING_FACT ?? 0) >= 1, "dropping the source-title year is classified as a factual omission");
    const titleRepairPrompt = translationPrompt({ title: p0.title, summary: "", targetLanguage: "zh-CN" }).system;
    assert.match(titleRepairPrompt, /只处理标题/u);
    assert.match(titleRepairPrompt, /年份、金额、币种符号、型号和机构缩写/u, "title-only repair explicitly preserves structured title facts");
    assert.match(titleRepairPrompt, /summary_zh 必须为空/u);
    const saved = JSON.parse(fs.readFileSync(translationsPath, "utf8")) as { translations: Array<{ opportunity_id: string; status: string; title_zh?: string; attempt_count?: number; retryable?: boolean }> };
    assert.equal(saved.translations.find((entry) => entry.opportunity_id === p0.id)?.title_zh, "2026年国际手工艺驻留计划");
    assert.equal(saved.translations.find((entry) => entry.opportunity_id === p0.id)?.status, "translated");
    assert.equal(saved.translations.find((entry) => entry.opportunity_id === p1.id)?.status, "failed");
    fs.writeFileSync(poolPath, JSON.stringify({ schema_version: "chanceping-opportunity-v2.v1", updated_at: now.toISOString(), opportunities: [p1] }));
    let p1RetryRequests = 0;
    const p1RejectingProvider = {
      id: "deepseek", free: false,
      async translate() { p1RetryRequests += 1; return { title_zh: "无关标题", summary_zh: "" }; },
    };
    const p1SecondAttempt = await runOpportunityV2DisplayTranslation({ now: new Date(now.getTime() + 2 * 60 * 60 * 1000), execute: true, allSurfaces: true, sourcesPath, poolPath, translationPath: translationsPath, translationProvider: p1RejectingProvider });
    assert.equal(p1SecondAttempt.attempted_records, 1, "P1 may receive one bounded retry after the cooling window");
    const cappedP1Cache = JSON.parse(fs.readFileSync(translationsPath, "utf8")) as { translations: Array<{ opportunity_id: string; attempt_count?: number; retryable?: boolean; next_retry_at?: string | null }> };
    const cappedP1 = cappedP1Cache.translations.find((entry) => entry.opportunity_id === p1.id)!;
    assert.equal(cappedP1.attempt_count, 2, "P1 attempt count accumulates across cycles");
    assert.equal(cappedP1.retryable, false, "repeated quality rejection is permanently dispositioned after two attempts");
    assert.equal(cappedP1.next_retry_at, null);
    const p1ThirdAttempt = await runOpportunityV2DisplayTranslation({ now: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000), execute: true, allSurfaces: true, sourcesPath, poolPath, translationPath: translationsPath, translationProvider: p1RejectingProvider });
    assert.equal(p1ThirdAttempt.selected_unique_ids.includes(p1.id), false, "the all-surfaces mode honors the exhausted retry cap");
    assert.equal(p1RetryRequests, 1, "P1 is not retried indefinitely after its one bounded retry");
    fs.writeFileSync(poolPath, JSON.stringify({ schema_version: "chanceping-opportunity-v2.v1", updated_at: now.toISOString(), opportunities: [p0] }));
    fs.writeFileSync(translationsPath, JSON.stringify({ translations: [] }));
    let failedRepairRequests = 0;
    const alwaysRejectedProvider = {
      id: "deepseek", free: false,
      async translate() { failedRepairRequests += 1; return { title_zh: "Unrelated title", summary_zh: "" }; },
    };
    const firstFailedRepair = await runOpportunityV2DisplayTranslation({ now, execute: true, allSurfaces: true, sourcesPath, poolPath, translationPath: translationsPath, translationProvider: alwaysRejectedProvider });
    assert.equal(firstFailedRepair.p0_title_repair_attempted, 1);
    const failedCache = JSON.parse(fs.readFileSync(translationsPath, "utf8")) as { translations: Array<{ opportunity_id: string; p0_title_repair_attempted?: boolean }> };
    assert.equal(failedCache.translations.find((entry) => entry.opportunity_id === p0.id)?.p0_title_repair_attempted, true, "the single title-repair attempt is durably recorded");
    const secondCycle = await runOpportunityV2DisplayTranslation({ now: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000), execute: true, allSurfaces: true, sourcesPath, poolPath, translationPath: translationsPath, translationProvider: alwaysRejectedProvider });
    assert.equal(secondCycle.selected_unique_ids.includes(p0.id), false, "a P0 record whose one repair was exhausted is not retried indefinitely");
    assert.equal(failedRepairRequests, 2, "the initial title request and its one permitted repair are the complete lifetime retry budget for this quality failure");
    const legacyP0 = { ...p0, title: "Creative Fellowship 2027 Closing 12 Oct 2026" };
    const legacyP1 = { ...p1, title: "Artist Residency Australia Closing 25 Oct 2026" };
    const rejected = [legacyP0, legacyP1].map((item) => ({
      ...createTranslatedOpportunityV2Translation(item, { title_zh: item === legacyP0 ? "2027创意研修计划" : "澳大利亚艺术家驻留", summary_zh: "" }, now),
      attempt_count: 2, retryable: false,
    }));
    fs.writeFileSync(poolPath, JSON.stringify({ opportunities: [legacyP0, legacyP1] }));
    fs.writeFileSync(translationsPath, JSON.stringify({ translations: rejected }));
    let recoveryRequests = 0;
    const recoveryProvider = { id: "deepseek", free: false, async translate(input: { title: string; summary: string }) {
      recoveryRequests += 1;
      assert.equal(input.summary, "", "historical recovery only requests a title");
      return { title_zh: input.title === legacyP0.title ? "2027创意研修计划（截止：2026年10月12日）" : "澳大利亚艺术家驻留（截止：2026年10月25日）", summary_zh: "" };
    } };
    const recovered = await runOpportunityV2DisplayTranslation({ now, sourcesPath, poolPath, translationPath: translationsPath, translationProvider: recoveryProvider, maxRequests: 2 });
    assert.equal(recovered.translated_records, 2, "legacy prompt-conflict failures can consume their bounded title recovery");
    assert.equal(recoveryRequests, 2, "recovery uses exactly one request per record");
    const replay = await runOpportunityV2DisplayTranslation({ now, sourcesPath, poolPath, translationPath: translationsPath, translationProvider: recoveryProvider });
    assert.equal(replay.actual_requests, 0, "recovered titles replay from cache");
    fs.writeFileSync(translationsPath, JSON.stringify({ translations: rejected }));
    const stillRejected = await runOpportunityV2DisplayTranslation({ now, sourcesPath, poolPath, translationPath: translationsPath, translationProvider: alwaysRejectedProvider });
    assert.equal(stillRejected.attempted_records, 2);
    const noLoop = await runOpportunityV2DisplayTranslation({ now: new Date(now.getTime() + 86400000), sourcesPath, poolPath, translationPath: translationsPath, translationProvider: alwaysRejectedProvider });
    assert.equal(noLoop.attempted_records, 0, "failed historical recovery is never repeated");
    // User-approved exception: only these five exhausted records, exactly once.
    const approvedIds = ["oppv2_6150510674e7858292faf45c", "oppv2_6dff384b8cb200042b57ca53", "oppv2_738353f18d8c7b821e306088", "oppv2_77f08bf9e27bd4171f7494ed", "oppv2_cc93864a650fb6d755e979e8"];
    const approvedItems = approvedIds.map((id, index) => ({ ...p0, id, title: `Craft Fellowship ${2026 + index}`, source_item_id: id, detail_url: `https://example.org/${id}` }));
    const excluded = { ...p0, id: "not-approved", title: "Craft Fellowship 2035" };
    const exhausted = [...approvedItems, excluded].map(item => ({ ...createTranslatedOpportunityV2Translation(item, { title_zh: "缺少年份", summary_zh: "" }, now), attempt_count: 3, retryable: false, p0_title_repair_attempted: true }));
    fs.writeFileSync(poolPath, JSON.stringify({ opportunities: [...approvedItems, excluded] }));
    fs.writeFileSync(translationsPath, JSON.stringify({ translations: exhausted }));
    const approvedCalls: string[] = [];
    const approvedProvider = { id: "deepseek", free: false, async translate(input: { title: string; summary: string }) {
      const item = approvedItems.find(item => item.title === input.title)!;
      assert.ok(item, "an unapproved sixth record must never reach the provider");
      const savedEntry = readOpportunityV2Translations(translationsPath).find(entry => entry.opportunity_id === item.id) as unknown as Record<string, unknown>;
      assert.ok(savedEntry.approved_title_repair_20261007_at, "consume the allowance durably before any provider request");
      assert.equal(savedEntry.attempt_count, 4, "never reset the three historical attempts");
      assert.equal(input.summary, "", "approved repair is title-only");
      approvedCalls.push(item.id);
      return { title_zh: item.id === approvedIds[4] ? "故意遗漏年份" : `${input.title.match(/20\d{2}/u)![0]}年手工艺研修计划`, summary_zh: "" };
    } };
    const approvedRun = await runOpportunityV2DisplayTranslation({ now, sourcesPath, poolPath, translationPath: translationsPath, translationProvider: approvedProvider, maxRequests: 5 });
    assert.equal(approvedRun.attempted_records, 5, "explicit approval unblocks exactly five exhausted records");
    assert.equal(approvedRun.translated_records, 4);
    assert.equal(approvedRun.failed_records, 1, "fact validation still rejects a missing year");
    assert.equal(approvedRun.approved_title_repairs?.length, 5, "production evidence records every approved outcome without source text");
    assert.equal(approvedRun.approved_title_repairs?.filter(row => row.status === "failed").length, 1);
    assert.deepEqual([...approvedCalls].sort(), [...approvedIds].sort());
    const afterApproval = readOpportunityV2Translations(translationsPath);
    assert.deepEqual(afterApproval.find(entry => entry.opportunity_id === excluded.id), exhausted.at(-1), "unapproved cache remains unchanged");
    assert.ok(afterApproval.filter(entry => approvedIds.includes(entry.opportunity_id)).every(entry => entry.attempt_count === 4 && entry.p0_title_repair_attempted && entry.retryable === false));
    const approvedReplay = await runOpportunityV2DisplayTranslation({ now: new Date(now.getTime() + 86400000), sourcesPath, poolPath, translationPath: translationsPath, translationProvider: approvedProvider });
    assert.equal(approvedReplay.actual_requests, 0, "both successful and failed approved repairs are consumed permanently");
    fs.writeFileSync(poolPath, JSON.stringify({ opportunities: [approvedItems[0]] }));
    fs.writeFileSync(translationsPath, JSON.stringify({ translations: [exhausted[0]] }));
    const networkRetryProvider = { id: "deepseek", free: false, async translate(_input: unknown, hooks?: { onRequestStart?: () => void }) {
      hooks?.onRequestStart?.();
      hooks?.onRequestStart?.(); // Adapter retry must be stopped before a second HTTP request.
      throw new Error("unreachable second request");
    } };
    const networkRun = await runOpportunityV2DisplayTranslation({ now, sourcesPath, poolPath, translationPath: translationsPath, translationProvider: networkRetryProvider });
    assert.equal(networkRun.actual_requests, 1);
    assert.equal(networkRun.failed_records, 1);
    assert.equal(readOpportunityV2Translations(translationsPath)[0].attempt_count, 4, "a blocked adapter retry is not a second consumed request");
    fs.writeFileSync(translationsPath, JSON.stringify({ translations: [exhausted[0]] }));
    assert.equal(claimApprovedOpportunityV2TitleRepair(approvedItems[0], translationsPath, now), true);
    assert.equal(claimApprovedOpportunityV2TitleRepair(approvedItems[0], translationsPath, now), false, "concurrent claims cannot spend the approval twice");
    const interruptedReplay = await runOpportunityV2DisplayTranslation({ now, sourcesPath, poolPath, translationPath: translationsPath, translationProvider: approvedProvider });
    assert.equal(interruptedReplay.actual_requests, 0, "a crash after claim cannot automatically retry the provider");
    const changedItem = { ...approvedItems[0], summary: "Updated source text" };
    const changedFailure = { ...createTranslatedOpportunityV2Translation(changedItem, { title_zh: "遗漏年份", summary_zh: "" }, now), p0_title_repair_attempted: true, retryable: false };
    writeOpportunityV2Translations([changedFailure], translationsPath);
    fs.writeFileSync(poolPath, JSON.stringify({ opportunities: [changedItem] }));
    const changedReplay = await runOpportunityV2DisplayTranslation({ now, sourcesPath, poolPath, translationPath: translationsPath, translationProvider: approvedProvider });
    assert.equal(changedReplay.actual_requests, 0, "source-hash changes cannot renew this one-off approval");
    console.log("ICH_V16_TRANSLATION_QUALITY: PASS (one DeepSeek title repair for P0 only; validation unchanged; failure clusters retained)");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
