import type { LLMAdapter } from "../src/agents/llm-adapter";
import { createDefaultSpec, type RadarRequirementSpec } from "../src/schema/radar-requirement-spec";
import type { SearchResult } from "../src/search/types";
import type { SearchProvider } from "../src/search/provider-registry";
import { providerRegistry } from "../src/search/provider-registry";
import { assessCandidatePageType, applyCandidatePageTypeGate } from "../src/search/candidate-page-type";
import { rankCandidateResults } from "../src/search/candidate-ranking";
import { SearchOrchestrator } from "../src/search/orchestrator";
import {
  assessCandidateSourceIntegrity,
  buildPrimarySourceRecoveryQueries,
} from "../src/search/primary-source-recovery";

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail = ""): void {
  if (condition) {
    passed += 1;
    console.log(`PASS ${name}`);
    return;
  }
  failed += 1;
  console.error(`FAIL ${name}${detail ? ` -> ${detail}` : ""}`);
}

function spec(): RadarRequirementSpec {
  const value = createDefaultSpec();
  value.client_profile.business_type = "岭南非遗和文创产品公司";
  value.core_goals.primary_goal = "寻找工艺美术赛事、作品征集和文创采购机会";
  value.opportunity_scope.primary_opportunity_types = ["工艺美术赛事", "作品征集", "文创采购"];
  value.keyword_strategy.core_keywords_zh = ["工艺美术", "作品征集", "文创采购"];
  value.radar_version = {
    version: "V1.0",
    oneSentencePositioning: "非遗文创机会雷达",
    targetUser: "岭南非遗和文创产品公司",
    businessContext: "寻找工艺美术赛事、作品征集和文创采购机会",
    opportunityIntents: ["工艺美术赛事", "作品征集", "文创采购"],
    highValueCriteria: ["有官方征集原文", "有投稿或采购入口"],
    exclusionRules: ["历史汇总", "培训广告"],
    prioritySourceArchetypes: ["政府官网", "主办方官网", "采购公告原文"],
    queryFamilies: [{
      familyName: "工艺美术作品征集",
      intentType: "direct_opportunity",
      sourceArchetype: "open_call_submission_page",
      queries: ["工艺美术 作品征集 官方公告"],
      whyThisFamily: "寻找可投稿的官方原始征集页",
    }],
    scoringRules: [],
    reportTemplate: ["重点机会", "观察来源"],
    missingConfig: [],
    defaultAssumptions: [],
    revisionNotes: [],
    resultBuckets: ["direct_opportunity", "watch_signal"],
  };
  return value;
}

function candidate(title: string, url: string, snippet: string): SearchResult {
  return {
    title,
    url,
    snippet,
    source_provider: "fixture",
    source_type: "web",
    published_at: "2026-07-01",
    semantic_type: "direct_opportunity",
    original_semantic_type: "direct_opportunity",
    source_archetype: "open_call_submission_page",
    candidate_judge_assessment: {
      candidate_type: "key_opportunity",
      beneficiary_fit: "fit",
      action_fit: "fit",
      source_fit: "fit",
      freshness_fit: "valid",
      relevance_score: 88,
      decision: "accept",
      reason: "fixture accepted",
      basis: "deterministic_fallback",
      assessedAt: "2026-07-03T00:00:00.000Z",
    },
  };
}

const radarSpec = spec();

const glassdoor = candidate(
  "42 財務經理 Jobs in Hong Kong, May 2026 - Glassdoor",
  "https://www.glassdoor.com.hk/Job/hong-kong-finance-manager-jobs-SRCH_IL.0,9.htm",
  "招聘平台职位列表，未显示企业直接委托猎头或公司官方招聘入口。",
);
const douyin = candidate(
  "第五届内蒙古工艺美术精品展作品征集 - 抖音",
  "https://www.douyin.com/search/工艺美术大赛报名",
  "作品征集和报名信息，需追踪主办方官方原始公告。",
);
const genericPdf = candidate(
  "[PDF] 广东省政府采购公开招标文件",
  "https://example.gov.cn/files/procurement.pdf",
  "政府采购公开招标文件，未显示具体采购项目名称、环保设备范围或当前投标入口。",
);
const officialTender = candidate(
  "广东某集团2026年工艺美术文创礼品采购项目招标公告",
  "https://www.gd.gov.cn/procurement/cultural-gifts-2026",
  "文创礼品采购项目招标公告，供应商可查看采购范围并提交投标材料。",
);
const exhibitionAggregator = candidate(
  "2027第七届中国跨境电商交易会（春季） - 第一展会网",
  "https://www.onezh.com/web/index_81234.html",
  "展会信息聚合页面，需追踪主办方官网和展商申请入口。",
);
const tenderAggregator = candidate(
  "关于“万福”商旅伴手礼公共品牌商品和外包装设计 - 全国招标采购公共服务平台",
  "https://hnzbcgxxw.com/list/detail/10461.html",
  "招标采购信息平台转载的项目摘要，需追踪采购人原始公告。",
);
const staleCampaign = candidate(
  "报名倒计时！Shopee 2025本地化履约业务招商大会",
  "https://xiaguangshe.com/8735",
  "2025年4月举办的招商大会报名文章。",
);
const platformRollout = candidate(
  "关于全市推广统一应用广东政府采购智慧云平台项目采购电子交易系统的通知",
  "https://www.gd.gov.cn/zwgk/procurement-platform-rollout",
  "通知各单位推广使用政府采购电子交易平台，不是面向环保设备供应商的具体采购项目。",
);
const jobAggregator = candidate(
  "广州最新财务总监招聘信息",
  "https://www.zhaopin.com/zhaopin/2784998ffc3a46c4a98439f56c8bbf6f",
  "智联招聘推荐30个相关招聘信息，属于职位聚合列表。",
);
const newsRepost = candidate(
  "中国乒协公示伦敦世乒赛团体赛选拔办法 - 新华网客户端",
  "https://app.xinhuanet.com/news/article.html?id=fixture",
  "媒体转述中国乒协选拔办法，原始名单和报名信息需查看中国乒协官网。",
);
const serviceTerms = candidate(
  "买家服务须-线上签署 - 跨境专供",
  "https://kj.1688.com/Servicesign.html",
  "平台服务使用条件和线上协议，不是当前平台招商活动或卖家报名机会。",
);
const procurementCategory = candidate(
  "招标采购 - 广东环境保护工程职业学院",
  "https://www.gdpepe.edu.cn/zbgg/list.htm",
  "招标采购栏目列表，需进入具体项目公告确认采购范围和投标入口。",
);

check("Glassdoor is a weak aggregator", assessCandidateSourceIntegrity(glassdoor).kind === "weak_aggregator");
check("Douyin is a weak social source", assessCandidateSourceIntegrity(douyin).kind === "weak_social");
check("generic procurement PDF is generic document", assessCandidateSourceIntegrity(genericPdf).kind === "generic_document");
check("specific government tender is trusted primary", assessCandidateSourceIntegrity(officialTender).kind === "trusted_primary");
check("exhibition listing site is a weak aggregator", assessCandidateSourceIntegrity(exhibitionAggregator).kind === "weak_aggregator");
check("procurement reposting site is a weak aggregator", assessCandidateSourceIntegrity(tenderAggregator).kind === "weak_aggregator");
check("job listing site is a weak aggregator", assessCandidateSourceIntegrity(jobAggregator).kind === "weak_aggregator");
check("news repost is a weak reference source", assessCandidateSourceIntegrity(newsRepost).kind === "weak_reference");

const glassdoorPage = assessCandidatePageType(glassdoor, radarSpec, { now: new Date("2026-07-03T00:00:00+08:00") });
const douyinPage = assessCandidatePageType(douyin, radarSpec, { now: new Date("2026-07-03T00:00:00+08:00") });
const genericPdfPage = assessCandidatePageType(genericPdf, radarSpec, { now: new Date("2026-07-03T00:00:00+08:00") });
const officialTenderPage = assessCandidatePageType(officialTender, radarSpec, { now: new Date("2026-07-03T00:00:00+08:00") });
check("Glassdoor cannot be key-card eligible", glassdoorPage.keyCardEligibility !== "eligible", JSON.stringify(glassdoorPage));
check("Douyin cannot be key-card eligible", douyinPage.keyCardEligibility !== "eligible", JSON.stringify(douyinPage));
check("generic procurement PDF cannot be key-card eligible", genericPdfPage.keyCardEligibility !== "eligible", JSON.stringify(genericPdfPage));
check("specific official tender stays key-card eligible", officialTenderPage.keyCardEligibility === "eligible", JSON.stringify(officialTenderPage));
const platformRolloutPage = assessCandidatePageType(platformRollout, radarSpec, { now: new Date("2026-07-03T00:00:00+08:00") });
check("procurement platform rollout is not a key opportunity", platformRolloutPage.keyCardEligibility !== "eligible", JSON.stringify(platformRolloutPage));
const serviceTermsPage = assessCandidatePageType(serviceTerms, radarSpec, { now: new Date("2026-07-03T00:00:00+08:00") });
const procurementCategoryPage = assessCandidatePageType(procurementCategory, radarSpec, { now: new Date("2026-07-03T00:00:00+08:00") });
const newsRepostPage = assessCandidatePageType(newsRepost, radarSpec, { now: new Date("2026-07-03T00:00:00+08:00") });
check("platform service terms are not a key opportunity", serviceTermsPage.keyCardEligibility !== "eligible", JSON.stringify(serviceTermsPage));
check("procurement category page is not a key opportunity", procurementCategoryPage.keyCardEligibility !== "eligible", JSON.stringify(procurementCategoryPage));
check("news repost requires original source before key card", newsRepostPage.keyCardEligibility !== "eligible", JSON.stringify(newsRepostPage));

const recoveryQueries = buildPrimarySourceRecoveryQueries([glassdoor, douyin, genericPdf], radarSpec, 2);
check("named social candidate produces one primary-source recovery query", recoveryQueries.length === 1, JSON.stringify(recoveryQueries));
check("recovery query asks for official original source", /官方|主办方|原始公告|official/i.test(recoveryQueries[0]?.query ?? ""), recoveryQueries[0]?.query ?? "");
check("generic jobs and procurement documents do not generate recovery queries", !/glassdoor|公開招标文件|公开招标文件|42 財務經理/i.test(JSON.stringify(recoveryQueries)), JSON.stringify(recoveryQueries));

const aggregatorRecovery = buildPrimarySourceRecoveryQueries([exhibitionAggregator, tenderAggregator], radarSpec, 2);
check("named aggregators produce bounded primary recovery queries", aggregatorRecovery.length === 2, JSON.stringify(aggregatorRecovery));
check("recovery queries remove aggregator brand names", !/第一展会网|全国招标采购公共服务平台/.test(JSON.stringify(aggregatorRecovery)), JSON.stringify(aggregatorRecovery));

const gatedWeak = applyCandidatePageTypeGate([glassdoor, douyin, genericPdf], radarSpec, { now: new Date("2026-07-03T00:00:00+08:00") });
const rankedWeak = rankCandidateResults(gatedWeak.assessedResults, radarSpec, { now: new Date("2026-07-03T00:00:00+08:00") });
check("weak sources never become key cards even without a primary candidate", rankedWeak.keyCandidates.length === 0, JSON.stringify(rankedWeak.assessedResults));

const stalePageGate = applyCandidatePageTypeGate([staleCampaign], radarSpec, { now: new Date("2026-07-03T00:00:00+08:00") });
const staleRanking = rankCandidateResults(stalePageGate.assessedResults, radarSpec, { now: new Date("2026-07-03T00:00:00+08:00") });
check("explicitly stale action page cannot become a key card", staleRanking.keyCandidates.length === 0, JSON.stringify(staleRanking.assessedResults));

const llmAdapter: LLMAdapter = {
  async chat() {
    return {
      content: JSON.stringify({ fit: 84, intent: 82, effort_cost: 60, reason: "q6h fixture" }),
      parsed: { fit: 84, intent: 82, effort_cost: 60 },
    };
  },
};

async function verifyOrchestratorRecovery(): Promise<void> {
  const providerName = "q6h_primary_recovery_provider";
  const previous = providerRegistry.get(providerName);
  const queries: string[] = [];
  const provider: SearchProvider = {
    name: providerName,
    display_name: "Q6-H Primary Recovery Provider",
    source_type: "web",
    reliability: "B",
    enabled: true,
    radar_types: ["custom"],
    async healthCheck() {
      return true;
    },
    async search(query) {
      queries.push(query);
      if (/原始公告|official original/i.test(query)) {
        return [{
          ...officialTender,
          title: "第五届内蒙古工艺美术精品展作品征集公告",
          url: "https://www.wushen.gov.cn/art/2026/official-open-call",
          snippet: "主办方发布第五届工艺美术精品展作品征集公告，参展者可按通知提交作品。",
          source_provider: providerName,
        }];
      }
      return [{ ...douyin, source_provider: providerName }];
    },
  };
  providerRegistry.register(provider);
  try {
    const result = await new SearchOrchestrator({
      llmAdapter,
      dataMode: "live",
      enableContentFetch: false,
      maxResultsPerProvider: 5,
    }).search(radarSpec, "工艺美术作品征集", { primary: [providerName], fallback: [] });
    const executionQueries = result.executionLog?.queryExecutions ?? [];
    check("orchestrator executes bounded primary-source recovery", executionQueries.some((item) => item.queryVariant === "official_source" && item.queryFamily === "primary source recovery"), JSON.stringify(executionQueries));
    check("orchestrator keeps total query count within 15", new Set(executionQueries.map((item) => item.query)).size <= 15, `queries=${queries.length}`);
    check("recovered official result becomes a key card", (result.opportunityCards ?? []).some((card) => /wushen\.gov\.cn/.test(card.official_source_url ?? "")), JSON.stringify(result.opportunityCards ?? []));
    check("weak social result stays out of key cards", !(result.opportunityCards ?? []).some((card) => /douyin\.com/.test(card.official_source_url ?? "")), JSON.stringify(result.opportunityCards ?? []));
  } finally {
    providerRegistry.unregister(providerName);
    if (previous) providerRegistry.register(previous);
  }
}

async function verifyRecoveryNoResultStaysHonest(): Promise<void> {
  const providerName = "q6h_empty_recovery_provider";
  const previous = providerRegistry.get(providerName);
  const provider: SearchProvider = {
    name: providerName,
    display_name: "Q6-H Empty Recovery Provider",
    source_type: "web",
    reliability: "B",
    enabled: true,
    radar_types: ["custom"],
    async healthCheck() {
      return true;
    },
    async search(query) {
      if (/原始公告|official original/i.test(query)) return [];
      return [{ ...douyin, source_provider: providerName }];
    },
  };
  providerRegistry.register(provider);
  try {
    const result = await new SearchOrchestrator({
      llmAdapter,
      dataMode: "live",
      enableContentFetch: false,
      maxResultsPerProvider: 5,
    }).search(radarSpec, "工艺美术作品征集", { primary: [providerName], fallback: [] });
    check("empty primary recovery does not promote weak source", (result.opportunityCards ?? []).length === 0, JSON.stringify(result.opportunityCards ?? []));
    check("empty primary recovery does not fabricate mock candidates", !(result.rawCandidates ?? []).some((item) => /example\.com|mock\.chanceping\.local/.test(item.url)), JSON.stringify(result.rawCandidates ?? []));

    const legacySpec = structuredClone(radarSpec);
    legacySpec.radar_version = undefined;
    const legacyResult = await new SearchOrchestrator({
      llmAdapter,
      dataMode: "live",
      enableContentFetch: false,
      maxResultsPerProvider: 5,
    }).search(legacySpec, "工艺美术作品征集", { primary: [providerName], fallback: [] });
    const legacyExecutions = legacyResult.executionLog?.queryExecutions ?? [];
    check("legacy spec without reserved recovery slots stays within 15 queries", new Set(legacyExecutions.map((item) => item.query)).size <= 15, `count=${legacyExecutions.length}`);
    check("legacy spec does not append unreserved recovery query", !legacyExecutions.some((item) => item.queryFamily === "primary source recovery"), JSON.stringify(legacyExecutions));
  } finally {
    providerRegistry.unregister(providerName);
    if (previous) providerRegistry.register(previous);
  }
}

async function main(): Promise<void> {
  await verifyOrchestratorRecovery();
  await verifyRecoveryNoResultStaysHonest();
  console.log(`Q.6-H primary source recovery: ${passed} PASS / ${failed} FAIL`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
