import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runOpportunityV2DisplayTranslation } from "../src/opportunity-v2/translation-runner";
import { translationPrompt } from "../src/opportunity-v2/translation-provider";
import type { OpportunityV2 } from "../src/opportunity-v2/types";

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
    console.log("ICH_V16_TRANSLATION_QUALITY: PASS (one DeepSeek title repair for P0 only; validation unchanged; failure clusters retained)");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
