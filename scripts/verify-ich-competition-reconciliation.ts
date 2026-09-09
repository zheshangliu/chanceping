import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { readOpportunityV2Pool } from "../src/opportunity-v2";

const historicalMissingIds = [
  "chuangsaiyun-competition-list|https://www.chuangsaiyun.com/#/article/details?id=2711",
  "chuangsaiyun-competition-list|https://www.chuangsaiyun.com/#/article/details?id=2421",
  "chuangsaiyun-competition-list|https://www.chuangsaiyun.com/#/article/details?id=2418",
  "chuangsaiyun-competition-list|https://www.chuangsaiyun.com/#/article/details?id=2710",
  "chuangsaiyun-competition-list|https://www.chuangsaiyun.com/#/article/details?id=2716",
  "chuangsaiyun-competition-list|https://www.chuangsaiyun.com/#/article/details?id=2477",
  "chuangsaiyun-competition-list|https://www.chuangsaiyun.com/#/article/details?id=2590",
  "chuangsaiyun-competition-list|https://www.chuangsaiyun.com/#/article/details?id=2787",
  "chuangsaiyun-competition-list|https://www.chuangsaiyun.com/#/article/details?id=2786",
  "chuangsaiyun-competition-list|https://www.chuangsaiyun.com/#/article/details?id=2758",
  "chuangsaiyun-competition-list|https://www.chuangsaiyun.com/#/article/details?id=2754",
  "chuangsaiyun-competition-list|https://www.chuangsaiyun.com/#/article/details?id=2396",
  "chuangsaiyun-competition-list|https://www.chuangsaiyun.com/#/article/details?id=2728",
  "chuangsaiyun-competition-list|https://www.chuangsaiyun.com/#/article/details?id=2714",
  "chuangsaiyun-competition-list|https://www.chuangsaiyun.com/#/article/details?id=2771",
  "chuangsaiyun-competition-list|https://www.chuangsaiyun.com/#/article/details?id=2751",
  "chuangsaiyun-competition-list|https://www.chuangsaiyun.com/#/article/details?id=2696",
  "chuangsaiyun-competition-list|https://www.chuangsaiyun.com/#/article/details?id=2709",
  "chuangsaiyun-competition-list|https://www.chuangsaiyun.com/#/article/details?id=2723",
  "chuangsaiyun-competition-list|https://www.chuangsaiyun.com/#/article/details?id=2432",
  "chuangsaiyun-competition-list|https://www.chuangsaiyun.com/#/article/details?id=2747",
  "chuangsaiyun-competition-list|https://www.chuangsaiyun.com/#/article/details?id=2679",
  "chuangsaiyun-competition-list|https://www.chuangsaiyun.com/#/article/details?id=2583",
  "chuangsaiyun-competition-list|https://www.chuangsaiyun.com/#/article/details?id=2776",
  "chuangsaiyun-competition-list|https://www.chuangsaiyun.com/#/article/details?id=2712",
  "chuangsaiyun-competition-list|https://www.chuangsaiyun.com/#/article/details?id=2411",
  "chuangsaiyun-competition-list|https://www.chuangsaiyun.com/#/article/details?id=2559",
  "chuangsaiyun-competition-list|https://www.chuangsaiyun.com/#/article/details?id=2435",
  "chuangsaiyun-competition-list|https://www.chuangsaiyun.com/#/article/details?id=2405",
  "craft-scotland-opportunities|https://www.craftscotland.org/community/opportunity/studios-available-in-burntisland-2174",
  "craft-scotland-opportunities|https://www.craftscotland.org/contact",
  "craft-scotland-opportunities|https://www.craftscotland.org/newsletter-subscription",
  "craft-scotland-opportunities|https://www.craftscotland.org/terms-and-conditions/privacy-policy",
  "craft-scotland-opportunities|https://www.craftscotland.org/terms-and-conditions",
  "craft-scotland-opportunities|https://www.craftscotland.org/press-and-media",
  "heritage-crafts-opportunities|https://heritagecrafts.org.uk/about/faqs",
  "heritage-crafts-opportunities|https://heritagecrafts.org.uk/about/vacancies",
  "heritage-crafts-opportunities|https://heritagecrafts.org.uk/members/membership-status",
  "heritage-crafts-opportunities|https://heritagecrafts.org.uk/category/our-stories",
  "heritage-crafts-opportunities|https://heritagecrafts.org.uk/about/our-partners",
  "whaleideas-competition|https://whaleideas.com/zjds/gycp/wcsj/31796.html",
  "iuben-cultural-competition|https://iuben.cn/wcsj/6905.html",
  "iuben-cultural-competition|https://iuben.cn/hykj/6904.html",
  "chuangsaiyun-competition-list|https://www.chuangsaiyun.com/#/article/details?id=2790",
  "american-craft-council-opportunities|https://craftcouncil.org/stories",
  "american-craft-council-opportunities|https://craftcouncil.org/craft-happenings-calendar",
  "american-craft-council-opportunities|https://craftcouncil.org/object-stories",
  "american-craft-council-opportunities|https://craftcouncil.org/podcast",
  "american-craft-council-opportunities|https://craftcouncil.org/archives",
  "american-craft-council-opportunities|https://craftcouncil.org/national-directory",
];

const navigationNoise = /(?:contact|privacy|terms|press|newsletter|stories|archive|podcast|directory|vacancies|our-partners|faq|membership-status|craft-happenings-calendar|object-stories)/iu;

function normalizeUrl(value: string): string {
  return value.replace(/#.*$/u, "").replace(/\/$/u, "").toLowerCase();
}

async function main(): Promise<void> {
  const pool = readOpportunityV2Pool().opportunities;
  const currentCompetition = pool.filter((item) => item.category === "competition");
  const rows = historicalMissingIds.map((identity) => {
    const [sourceId, ...urlParts] = identity.split("|");
    const oldDetailUrl = urlParts.join("|");
    const matching = currentCompetition.filter((item) => item.source_id === sourceId && normalizeUrl(item.detail_url) === normalizeUrl(oldDetailUrl));
    const isNoise = navigationNoise.test(oldDetailUrl);
    const classification = isNoise ? "NAVIGATION_NOISE" : matching.length ? "SOURCE_LISTING_REFRESH_DIFFERENCE" : "LEGIT_COMPETITION_MISSING";
    return {
      source_id: sourceId,
      old_identity: identity,
      old_title: matching[0]?.title ?? null,
      old_detail_url: oldDetailUrl,
      classification,
      surviving_id: matching[0]?.id ?? null,
      reason: isNoise ? "历史审计 identity 是导航/内容页，不是独立赛事。" : matching.length ? "当前副本已按 source_id + detail_url 找回该记录。" : "当前副本未找到同源同详情记录，需要继续核对。",
      action: isNoise ? "保留 evidence，禁止进入公开 Radar。" : matching.length ? "保留当前记录并标记为已恢复/仍存活。" : "阻断生产 Gate，不能静默忽略。",
    };
  });
  const historicalMissingCount = 76;
  const unmaterializedMissingCount = historicalMissingCount - historicalMissingIds.length;
  const summary = {
    baseline_count: 1816,
    historical_after_count: 1859,
    current_competition_pool: currentCompetition.length,
    historical_missing_count: historicalMissingCount,
    explicit_identity_count: historicalMissingIds.length,
    unmaterialized_missing_count: unmaterializedMissingCount,
    classifications: rows.reduce<Record<string, number>>((counts, row) => { counts[row.classification] = (counts[row.classification] ?? 0) + 1; return counts; }, {}),
    legit_competition_missing: rows.filter((row) => row.classification === "LEGIT_COMPETITION_MISSING").length,
    unknown_missing: unmaterializedMissingCount,
    gate: unmaterializedMissingCount === 0 && rows.every((row) => row.classification !== "LEGIT_COMPETITION_MISSING") ? "PASS" : "BLOCKED",
    provenance: "753905a1a6c8e19471effedcc901817215afa5dc/audits/ich/procurement/latest/competition-regression.json",
  };
  const report = { generated_at: new Date().toISOString(), summary, rows, note: "原审计报告声明 missing_count=76，但只提供了 50 个 explicit missing_ids；其余 26 个没有 identity/detail_url，不能安全分类。" };
  const outputPath = path.resolve("reports/ich/v21/competition-missing-reconciliation.json");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  assert.equal(summary.legit_competition_missing, 0);
  console.log(JSON.stringify(summary, null, 2));
  if (summary.gate !== "PASS") process.exitCode = 1;
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
