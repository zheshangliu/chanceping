import { createDefaultSpec, type RadarRequirementSpec } from "../src/schema/radar-requirement-spec";
import type { OpportunityKind, SourceArchetypeId } from "../src/schema/radar-mvp-contracts";
import type { SearchResult } from "../src/search/types";
import {
  rankCandidateResults,
  type CandidateRankingAssessment,
} from "../src/search/candidate-ranking";

function toSpec(): RadarRequirementSpec {
  const spec = createDefaultSpec();
  spec.client_profile.business_type = "员工福利和节日礼品供应商";
  spec.client_profile.client_type = "员工福利和节日礼品供应商";
  spec.core_goals.primary_goal = "寻找广东和香港企业福利采购、工会项目与礼品招标";
  spec.opportunity_scope.primary_opportunity_types = ["企业福利采购", "工会福利项目", "节日礼品招标", "供应商入库"];
  spec.keyword_strategy.core_keywords_zh = ["员工福利", "节日礼品", "供应商征集", "采购"];
  spec.filter_rules.must_exclude = ["加盟广告", "系统教程"];
  spec.radar_version = {
    version: "V1.0",
    oneSentencePositioning: "员工福利采购机会雷达",
    targetUser: "员工福利和节日礼品供应商",
    businessContext: "寻找广东和香港企业福利采购、工会项目与礼品招标",
    opportunityIntents: ["企业福利采购", "工会福利项目", "节日礼品招标", "供应商入库"],
    highValueCriteria: ["采购或入库入口", "供应商可参与", "官方或采购原文"],
    exclusionRules: ["加盟广告", "系统教程"],
    prioritySourceArchetypes: ["采购公告", "供应商门户", "工会官网"],
    queryFamilies: [{
      familyName: "福利采购与供应商征集",
      intentType: "direct_opportunity",
      sourceArchetype: "procurement_or_supplier_portal",
      queries: ["广东 员工福利 礼品 供应商 征集"],
      whyThisFamily: "Q.6-C ranking fixture",
    }],
    scoringRules: [],
    reportTemplate: ["重点机会", "观察来源"],
    missingConfig: [],
    defaultAssumptions: [],
    revisionNotes: [],
    resultBuckets: ["direct_opportunity", "business_lead", "watch_signal"],
  };
  return spec;
}

function candidate(
  title: string,
  url: string,
  sourceArchetype: SourceArchetypeId,
  semanticType: OpportunityKind = "direct_opportunity",
  score = 80,
  snippet = "员工福利礼品采购供应商征集，供应商可查看公告并准备材料。",
): SearchResult {
  return {
    title,
    url,
    snippet,
    source_provider: "fixture",
    source_type: "web",
    published_at: "2026-07-01",
    semantic_type: semanticType,
    source_archetype: sourceArchetype,
    candidate_judge_assessment: {
      candidate_type: semanticType === "direct_opportunity" ? "key_opportunity" : "actionable_lead",
      beneficiary_fit: "fit",
      action_fit: "fit",
      source_fit: "fit",
      freshness_fit: "valid",
      relevance_score: score,
      decision: "accept",
      reason: "fixture accepted",
      basis: "deterministic_fallback",
      assessedAt: "2026-07-03T00:00:00.000Z",
    },
  };
}

let failed = 0;
function check(name: string, condition: boolean, detail = ""): void {
  if (condition) {
    console.log(`PASS ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL ${name}${detail ? ` -> ${detail}` : ""}`);
  }
}

function ranking(result: SearchResult): CandidateRankingAssessment | undefined {
  return result.candidate_ranking_assessment;
}

const spec = toSpec();

const authoritySample = [
  candidate(
    "员工福利采购 - 销邦招标平台",
    "https://www.bidcenter.com.cn/news/welfare-gifts",
    "procurement_or_supplier_portal",
    "direct_opportunity",
    88,
  ),
  candidate(
    "广东省总工会2026年春节福利采购项目招标公告",
    "https://www.gd.gov.cn/procurement/welfare-gifts-2026",
    "procurement_or_supplier_portal",
    "direct_opportunity",
    82,
  ),
  candidate(
    "员工福利趋势新闻报道",
    "https://news.example.com/welfare-trends",
    "reference_case_source",
    "business_lead",
    90,
    "媒体报道员工福利市场趋势，没有采购或供应商入库入口。",
  ),
];

const authorityResult = rankCandidateResults(authoritySample, spec, {
  maxKeyCandidates: 5,
  now: new Date("2026-07-03T00:00:00+08:00"),
});

check("official government/procurement source outranks aggregator", authorityResult.keyCandidates[0]?.url.includes("gd.gov.cn"), authorityResult.keyCandidates.map((item) => item.url).join(" | "));
check("reference/news page is not first key candidate", !authorityResult.keyCandidates[0]?.url.includes("news.example.com"), authorityResult.keyCandidates[0]?.url ?? "");
check("ranking assessment is written to all audit results", authorityResult.assessedResults.every((item) => ranking(item)), "missing ranking assessment");
check("aggregator is excluded when a credible primary candidate exists", !authorityResult.keyCandidates.some((item) => item.url.includes("bidcenter.com.cn")), authorityResult.keyCandidates.map((item) => `${item.title}:${ranking(item)?.authorityTier}:${ranking(item)?.capStatus}`).join(" | "));
check("excluded aggregator remains in audit as watch signal", authorityResult.assessedResults.some((item) => item.url.includes("bidcenter.com.cn") && ranking(item)?.capStatus === "excluded_by_cap" && item.semantic_type === "watch_signal"), JSON.stringify(authorityResult.assessedResults.map((item) => ({ title: item.title, authority: ranking(item)?.authorityTier, cap: ranking(item)?.capStatus, semantic: item.semantic_type, reasons: ranking(item)?.reasonCodes }))));

const staleSample = [
  candidate(
    "2025年员工福利礼品采购公告",
    "https://www.gd.gov.cn/procurement/welfare-gifts-2025",
    "procurement_or_supplier_portal",
    "direct_opportunity",
    95,
    "2025年度员工福利礼品采购公告。",
  ),
  candidate(
    "2026年员工福利礼品供应商征集公告",
    "https://www.gd.gov.cn/procurement/welfare-gifts-2026",
    "procurement_or_supplier_portal",
    "direct_opportunity",
    75,
    "2026年度员工福利礼品供应商征集公告。",
  ),
];
const staleResult = rankCandidateResults(staleSample, spec, {
  maxKeyCandidates: 5,
  now: new Date("2026-07-03T00:00:00+08:00"),
});
check("current-year opportunity outranks stale high-score result", staleResult.keyCandidates[0]?.title.includes("2026"), staleResult.keyCandidates.map((item) => item.title).join(" | "));

const unreadableSample = [
  candidate(
    "�ӱ�����ѧԺ��У�����꽡���ٽ���Ŀ�����б깫��",
    "https://www.gd.gov.cn/procurement/unreadable-title",
    "procurement_or_supplier_portal",
    "direct_opportunity",
    99,
    "2026年度员工福利礼品供应商征集公告。",
  ),
  candidate(
    "2026年员工福利礼品供应商征集公告",
    "https://www.gd.gov.cn/procurement/readable-title",
    "procurement_or_supplier_portal",
    "direct_opportunity",
    75,
    "2026年度员工福利礼品供应商征集公告。",
  ),
];
const unreadableResult = rankCandidateResults(unreadableSample, spec, {
  maxKeyCandidates: 5,
  now: new Date("2026-07-03T00:00:00+08:00"),
});
check("unreadable mojibake title is excluded from key cards", !unreadableResult.keyCandidates.some((item) => item.url.includes("unreadable-title")), unreadableResult.keyCandidates.map((item) => item.title).join(" | "));
check("unreadable title keeps audit reason", unreadableResult.assessedResults.some((item) => item.url.includes("unreadable-title") && ranking(item)?.reasonCodes.includes("unreadable_title_excluded_from_key_card")), JSON.stringify(unreadableResult.assessedResults.map((item) => ({ title: item.title, cap: ranking(item)?.capStatus, reasons: ranking(item)?.reasonCodes }))));
check("readable candidate still enters key cards after unreadable exclusion", unreadableResult.keyCandidates.some((item) => item.url.includes("readable-title")), unreadableResult.keyCandidates.map((item) => item.title).join(" | "));

const capSample = Array.from({ length: 7 }, (_, index) => candidate(
  `2026年员工福利礼品供应商征集公告 ${index + 1}`,
  `https://www.gd.gov.cn/procurement/welfare-gifts-2026-${index + 1}`,
  "procurement_or_supplier_portal",
  index === 6 ? "business_lead" : "direct_opportunity",
  80 - index,
));
const capped = rankCandidateResults(capSample, spec, {
  maxKeyCandidates: 5,
  now: new Date("2026-07-03T00:00:00+08:00"),
});
check("key candidates capped at 5", capped.keyCandidates.length === 5, `count=${capped.keyCandidates.length}`);
check("overflow key candidates are downgraded to watch signal", capped.assessedResults.filter((item) => ranking(item)?.capStatus === "excluded_by_cap").every((item) => item.semantic_type === "watch_signal"), JSON.stringify(capped.assessedResults.map((item) => ({ title: item.title, type: item.semantic_type, cap: ranking(item)?.capStatus }))));
check("business lead does not outrank official direct opportunity by default", capped.keyCandidates[0]?.semantic_type === "direct_opportunity", capped.keyCandidates[0]?.title ?? "");

if (failed > 0) {
  console.error(`Q.6-C candidate ranking: ${failed} FAIL`);
  process.exit(1);
}
console.log("Q.6-C candidate ranking: PASS");
