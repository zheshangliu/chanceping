import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { readOpportunityV2Pool } from "../src/opportunity-v2";

const navigationNoise = /(?:contact|privacy|terms|press|newsletter|stories|archive|podcast|directory|vacancies|our-partners|faq|membership-status|craft-happenings-calendar|object-stories)/iu;
const nonCompetitionOpportunity = /(?:studios?-available|studio\s*&\s*workshop|professional-development|residen(?:cy|t)|workshop|tutors?-call)/iu;

function normalizeUrl(value: string): string {
  try {
    const url = new URL(value.trim());
    for (const key of [...url.searchParams.keys()]) {
      if (/^(?:utm_|ref$|source$)/iu.test(key)) url.searchParams.delete(key);
    }
    url.pathname = url.pathname.replace(/\/+$/u, "") || "/";
    url.hash = url.hash.replace(/\/+$/u, "");
    return `${url.protocol}//${url.host}${url.pathname}${url.search}${url.hash}`.toLowerCase();
  } catch {
    return value.trim().replace(/\/+$/u, "").toLowerCase();
  }
}

async function main(): Promise<void> {
  const pool = readOpportunityV2Pool().opportunities;
  const currentCompetition = pool.filter((item) => item.category === "competition");
  const regressionPath = path.resolve("audits/ich/procurement/latest/competition-regression.json");
  const checksPath = path.resolve("audits/ich/procurement/latest/checks.json");
  const regression = JSON.parse(fs.readFileSync(regressionPath, "utf8")) as { baseline_count: number; after_count: number; missing_count?: number; missing_ids?: string[] };
  const checks = JSON.parse(fs.readFileSync(checksPath, "utf8")) as { procurement_count?: number };
  const historicalMissingIds = Array.isArray(regression.missing_ids) ? regression.missing_ids : [];
  const reportedMissingCount = regression.missing_count ?? historicalMissingIds.length;
  const rows = historicalMissingIds.map((identity) => {
    const [sourceId, ...urlParts] = identity.split("|");
    const oldDetailUrl = urlParts.join("|");
    const matching = currentCompetition.filter((item) => item.source_id === sourceId && normalizeUrl(item.detail_url) === normalizeUrl(oldDetailUrl));
    const isNoise = navigationNoise.test(oldDetailUrl);
    const isNonCompetition = nonCompetitionOpportunity.test(oldDetailUrl) || nonCompetitionOpportunity.test(matching[0]?.title ?? "");
    const classification = isNoise ? "NAVIGATION_NOISE" : isNonCompetition ? "NON_COMPETITION_CONTENT" : matching.length ? "SOURCE_LISTING_REFRESH_DIFFERENCE" : "LEGIT_COMPETITION_MISSING";
    return {
      source_id: sourceId,
      old_identity: identity,
      old_title: matching[0]?.title ?? null,
      old_detail_url: oldDetailUrl,
      classification,
      surviving_id: matching[0]?.id ?? null,
      reason: isNoise ? "历史审计 identity 是导航/内容页，不是独立赛事。" : isNonCompetition ? "历史 identity 是工作室/工作坊等非赛事机会，不能计入赛事回归。" : matching.length ? "当前副本已按 source_id + normalized detail_url 找回该记录。" : "当前副本未找到同源同详情记录，需要继续核对。",
      action: isNoise || isNonCompetition ? "保留 evidence，禁止进入赛事备忘录。" : matching.length ? "保留当前记录并标记为已恢复/仍存活。" : "阻断生产 Gate，不能静默忽略。",
    };
  });
  const unmaterializedMissingCount = Math.max(0, reportedMissingCount - historicalMissingIds.length);
  const baselineUnrecoverable = unmaterializedMissingCount > 0;
  const classifications = rows.reduce<Record<string, number>>((counts, row) => { counts[row.classification] = (counts[row.classification] ?? 0) + 1; return counts; }, {});
  if (baselineUnrecoverable) classifications.UNKNOWN = unmaterializedMissingCount;
  const summary = {
    baseline_count: regression.baseline_count,
    historical_after_count: regression.after_count,
    current_competition_pool: currentCompetition.length,
    historical_missing_count: reportedMissingCount,
    explicit_identity_count: historicalMissingIds.length,
    unmaterialized_missing_count: unmaterializedMissingCount,
    input_count_mismatch: reportedMissingCount !== historicalMissingIds.length,
    procurement_count_in_same_audit: checks.procurement_count ?? null,
    classifications,
    legit_competition_missing: rows.filter((row) => row.classification === "LEGIT_COMPETITION_MISSING").length,
    unknown_missing: unmaterializedMissingCount,
    baseline_status: baselineUnrecoverable ? "BASELINE_UNRECOVERABLE" : "RECOVERED",
    gate: unmaterializedMissingCount === 0 && rows.every((row) => row.classification !== "LEGIT_COMPETITION_MISSING") ? "PASS" : "BLOCKED",
    provenance: "753905a1a6c8e19471effedcc901817215afa5dc/audits/ich/procurement/latest/competition-regression.json",
  };
  const report = { generated_at: new Date().toISOString(), summary, rows, note: "本报告只使用上游审计实际提供的 missing_ids；若 missing_count 大于该数组长度，额外数量不与 procurement_count 混同，保留为输入快照缺失身份的阻断证据。Hash 路由 detail_url 保留 fragment 参与同源身份匹配。当前 26 条额外身份在本地、Git 对象和已提交审计产物中均无完整旧快照，标记为 UNKNOWN / BASELINE_UNRECOVERABLE，不伪造赛事身份。" };
  const outputPath = path.resolve("reports/ich/v21/competition-missing-reconciliation.json");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  assert.equal(summary.legit_competition_missing, 0);
  const matchedRows = rows.filter((row) => row.surviving_id);
  assert.equal(new Set(matchedRows.map((row) => row.surviving_id)).size, matchedRows.length, "each explicit historical identity must map to a distinct surviving record");
  console.log(JSON.stringify(summary, null, 2));
  if (summary.gate !== "PASS") process.exitCode = 1;
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
