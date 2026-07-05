import type { LLMAdapter } from "../src/agents/llm-adapter";
import { createDefaultSpec, type RadarRequirementSpec } from "../src/schema/radar-requirement-spec";
import type { SearchResult } from "../src/search/types";
import type { SearchProvider } from "../src/search/provider-registry";
import { providerRegistry } from "../src/search/provider-registry";
import { assessCandidatePageType, applyCandidatePageTypeGate } from "../src/search/candidate-page-type";
import { applyCandidateJudgeGate } from "../src/search/candidate-llm-judge";
import { applyCandidateOwnershipGate } from "../src/search/candidate-ownership";
import { rankCandidateResults } from "../src/search/candidate-ranking";
import { applyCandidateRelevanceGate } from "../src/search/candidate-relevance";
import { isHighPriorityEvidenceSource, isOfficialGovernmentNews, prioritizeEvidenceReadCandidates } from "../src/search/evidence-read-priority";
import { SearchOrchestrator } from "../src/search/orchestrator";
import { JinaReaderFetcher } from "../src/search/content/jina-reader";
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

function aiEventSpec(): RadarRequirementSpec {
  const value = createDefaultSpec();
  value.client_profile.client_type = "大湾区 OPC";
  value.client_profile.business_type = "OPC / AI 创业者";
  value.core_goals.primary_goal = "搜索大湾区乃至海外可参加的 AI 马拉松、Hackathon 和开发者挑战赛";
  value.opportunity_scope.primary_opportunity_types = ["AI 马拉松", "AI Hackathon", "开发者挑战赛"];
  value.keyword_strategy.core_keywords_zh = ["AI 马拉松", "AI 比赛", "开发者挑战赛"];
  value.keyword_strategy.core_keywords_en = ["AI hackathon", "developer challenge", "Qwen Cloud"];
  value.radar_version = {
    version: "V1.0",
    oneSentencePositioning: "大湾区 OPC 的 AI 赛事雷达",
    targetUser: "大湾区 OPC / AI 创业者",
    businessContext: "希望发现可报名、可提交作品、可申请云资源或奖金的 AI 马拉松和开发者挑战赛。",
    opportunityIntents: ["AI 马拉松", "AI Hackathon", "开发者挑战赛"],
    highValueCriteria: ["有报名入口", "可提交作品", "有奖金或云资源", "适合个人开发者或 OPC"],
    exclusionRules: ["展会资讯", "培训广告", "学生专属结果", "规则介绍"],
    prioritySourceArchetypes: ["official_event_site", "hackathon platform", "cloud vendor developer program"],
    queryFamilies: [{
      familyName: "Qwen Cloud / Devpost Hackathon",
      intentType: "direct_opportunity",
      sourceArchetype: "official event site / hackathon platform",
      queries: [
        "Qwen Cloud Hackathon Devpost official application",
        "site:devpost.com Qwen Cloud Hackathon",
      ],
      whyThisFamily: "Devpost 具体赛事页通常包含报名、提交作品、截止时间和云资源信息。",
    }],
    scoringRules: [],
    reportTemplate: ["重点机会", "待复核项"],
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
const qwenDevpost = candidate(
  "Global AI Hackathon Series with Qwen Cloud",
  "https://qwencloud-hackathon.devpost.com/",
  "Join the Qwen Cloud hackathon. Participants can register, submit projects and compete for cloud credits.",
);
const qwenDevpostJoinOnly = candidate(
  "Global AI Hackathon Series with Qwen Cloud : Build your ... - Devpost",
  "https://qwencloud-hackathon.devpost.com",
  "Deadline: Jul 9, 2026 @ 2:00pm PDT · Join hackathon · Global AI Hackathon Series with Qwen Cloud.",
);
const qwenDevpostPrizeOnly = candidate(
  "Global AI Hackathon Series with Qwen Cloud : Build your ... - Devpost",
  "https://qwencloud-hackathon.devpost.com",
  "Build your own AI Agent on Qwen Cloud - compete for $70K in prizes across five tracks. Requirements · Hackathon Sponsors · Prizes · Devpost Achievements · Judges.",
);
const qwenDevpostManageSubmission = candidate(
  "Global AI Hackathon Series with Qwen Cloud - Devpost",
  "https://devpost.com/submit-to/29966-global-ai-hackathon-series-with-qwen-cloud/manage/submissions",
  "Deadline: Jul 9, 2026 @ 2:00pm PDT · Join hackathon · Global AI Hackathon Series with Qwen Cloud. Overview · My projects · Participants (6486).",
);
const devpostCategory = candidate(
  "Artificial Intelligence Hackathons on Devpost",
  "https://devpost.com/c/artificial-intelligence",
  "Browse artificial intelligence hackathons and projects, including Global AI Hackathon Series with Qwen Cloud.",
);
const dorahacksHackathon = candidate(
  "AI Agent Hackathon 2026 - DoraHacks",
  "https://dorahacks.io/hackathon/ai-agent-2026/detail",
  "Official hackathon page with registration and submission details.",
);
const govNews = candidate(
  "广东省科技厅发布人工智能创新挑战赛报名通知",
  "https://gdstc.gd.gov.cn/zwgk_n/tzgg/content/post_ai_contest.html",
  "政府官网新闻通知，发布人工智能创新挑战赛报名安排和提交入口。",
);
const youtubeVideo = candidate(
  "AI Hackathon highlights - YouTube",
  "https://www.youtube.com/watch?v=fixture",
  "AI hackathon video highlights.",
);
const organizerRegistration = {
  ...candidate(
    "Future Intelligence Challenge 2026 - Registration",
    "https://future-intelligence.example.com/competition/register",
    "Official organizer registration page. Apply and submit before the deadline.",
  ),
  source_archetype: "official_event_site" as const,
};
const officialHackathonDetail = {
  ...candidate(
    "AI Hackathon 2026 | Hackathons @ Berkeley",
    "https://ai.hackberkeley.org/",
    "Official event page for the 2026 AI Hackathon at Berkeley.",
  ),
  source_archetype: "official_event_site" as const,
};
const genericAiNews = {
  ...candidate(
    "AI hackathon industry news roundup",
    "https://news.example.com/ai-hackathon-roundup",
    "News roundup covering several past and future AI hackathons.",
  ),
  source_archetype: "official_event_site" as const,
};
const aiMediaReport = candidate(
  "AI创业者集结！2026新一代人工智能（深圳）创业创新大赛正式启动",
  "https://www.qbitai.com/2026/06/432581.html",
  "媒体报道赛事启动，提到参赛团队和产业资源，但不是主办方官方报名页。",
);

check("Glassdoor is a weak aggregator", assessCandidateSourceIntegrity(glassdoor).kind === "weak_aggregator");
check("Douyin is a weak social source", assessCandidateSourceIntegrity(douyin).kind === "weak_social");
check("generic procurement PDF is generic document", assessCandidateSourceIntegrity(genericPdf).kind === "generic_document");
check("specific government tender is trusted primary", assessCandidateSourceIntegrity(officialTender).kind === "trusted_primary");
check("exhibition listing site is a weak aggregator", assessCandidateSourceIntegrity(exhibitionAggregator).kind === "weak_aggregator");
check("procurement reposting site is a weak aggregator", assessCandidateSourceIntegrity(tenderAggregator).kind === "weak_aggregator");
check("job listing site is a weak aggregator", assessCandidateSourceIntegrity(jobAggregator).kind === "weak_aggregator");
check("news repost is a weak reference source", assessCandidateSourceIntegrity(newsRepost).kind === "weak_reference");
check("AI industry media report is a weak reference source", assessCandidateSourceIntegrity(aiMediaReport).kind === "weak_reference");
check("gov.cn news is official government news", isOfficialGovernmentNews(govNews), JSON.stringify(govNews));
check("specific Qwen Cloud Devpost page is high-priority evidence", isHighPriorityEvidenceSource(qwenDevpost, radarSpec), JSON.stringify(qwenDevpost));
check("DoraHacks concrete hackathon page is high-priority evidence", isHighPriorityEvidenceSource(dorahacksHackathon, radarSpec), JSON.stringify(dorahacksHackathon));
check("organizer registration page is high-priority evidence", isHighPriorityEvidenceSource(organizerRegistration, radarSpec), JSON.stringify(organizerRegistration));
check("official event detail is high-priority without snippet action words", isHighPriorityEvidenceSource(officialHackathonDetail, radarSpec), JSON.stringify(officialHackathonDetail));
check("Devpost category page is not high-priority evidence", !isHighPriorityEvidenceSource(devpostCategory, radarSpec), JSON.stringify(devpostCategory));
check("YouTube highlights are not high-priority evidence", !isHighPriorityEvidenceSource(youtubeVideo, radarSpec), JSON.stringify(youtubeVideo));
check("generic non-government news is not high-priority evidence", !isHighPriorityEvidenceSource(genericAiNews, radarSpec), JSON.stringify(genericAiNews));

const evidenceReadList = prioritizeEvidenceReadCandidates({
  keyCandidates: [qwenDevpost],
  rawCandidates: [devpostCategory, dorahacksHackathon, officialHackathonDetail, govNews, youtubeVideo, genericAiNews],
  maxUrls: 1,
  spec: radarSpec,
});
check("all high-priority evidence sources are read beyond fallback cap", evidenceReadList.length === 4, evidenceReadList.map((item) => item.url).join(" | "));
check("priority evidence includes Qwen Cloud Devpost", evidenceReadList.some((item) => item.url.includes("qwencloud-hackathon.devpost.com")), evidenceReadList.map((item) => item.url).join(" | "));
check("priority evidence includes DoraHacks concrete page", evidenceReadList.some((item) => item.url.includes("dorahacks.io/hackathon/ai-agent-2026")), evidenceReadList.map((item) => item.url).join(" | "));
check("priority evidence includes gov.cn official news", evidenceReadList.some((item) => item.url.includes("gdstc.gd.gov.cn")), evidenceReadList.map((item) => item.url).join(" | "));
check("priority evidence excludes category/social low-value pages", !evidenceReadList.some((item) => item.url.includes("devpost.com/c/") || item.url.includes("youtube.com")), evidenceReadList.map((item) => item.url).join(" | "));

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
const qwenDevpostPage = assessCandidatePageType(qwenDevpost, radarSpec, { now: new Date("2026-07-03T00:00:00+08:00") });
const qwenDevpostJoinOnlyPage = assessCandidatePageType(qwenDevpostJoinOnly, radarSpec, { now: new Date("2026-07-03T00:00:00+08:00") });
const qwenDevpostPrizeOnlyPage = assessCandidatePageType(qwenDevpostPrizeOnly, radarSpec, { now: new Date("2026-07-03T00:00:00+08:00") });
const aiMediaReportPage = assessCandidatePageType(aiMediaReport, radarSpec, { now: new Date("2026-07-03T00:00:00+08:00") });
check("platform service terms are not a key opportunity", serviceTermsPage.keyCardEligibility !== "eligible", JSON.stringify(serviceTermsPage));
check("procurement category page is not a key opportunity", procurementCategoryPage.keyCardEligibility !== "eligible", JSON.stringify(procurementCategoryPage));
check("news repost requires original source before key card", newsRepostPage.keyCardEligibility !== "eligible", JSON.stringify(newsRepostPage));
check("specific event-platform root page can be key-card eligible", qwenDevpostPage.keyCardEligibility === "eligible", JSON.stringify(qwenDevpostPage));
check("Devpost root page with Join hackathon is key-card eligible", qwenDevpostJoinOnlyPage.keyCardEligibility === "eligible", JSON.stringify(qwenDevpostJoinOnlyPage));
check("Devpost root page with compete/prize signals is key-card eligible", qwenDevpostPrizeOnlyPage.keyCardEligibility === "eligible", JSON.stringify(qwenDevpostPrizeOnlyPage));
check("non-government AI media report cannot be a key card", aiMediaReportPage.keyCardEligibility !== "eligible", JSON.stringify(aiMediaReportPage));

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

async function verifyQwenDevpostJoinActionSurvivesFullGate(): Promise<void> {
  const specForAiEvent = aiEventSpec();
  const candidateFromSerper = {
    ...qwenDevpostJoinOnly,
    source_archetype: "official_event_site" as const,
    search_query: "Qwen Cloud Hackathon Devpost official application",
    search_theme: "Qwen Cloud / Devpost Hackathon",
    query_family: "Qwen Cloud / Devpost Hackathon",
    query_variant: "official_source" as const,
    intent_type: "direct_opportunity" as const,
  };
  const relevance = applyCandidateRelevanceGate([candidateFromSerper], specForAiEvent, {
    now: new Date("2026-07-03T00:00:00+08:00"),
  });
  check(
    "Qwen Devpost Join hackathon passes relevance gate",
    relevance.accepted.length === 1,
    JSON.stringify(relevance.assessedResults[0]?.relevance_assessment),
  );
  const pageGate = applyCandidatePageTypeGate(relevance.assessedResults, specForAiEvent, {
    now: new Date("2026-07-03T00:00:00+08:00"),
  });
  check(
    "Qwen Devpost Join hackathon passes page-type gate",
    pageGate.eligible.length === 1,
    JSON.stringify(pageGate.assessedResults[0]?.page_type_assessment),
  );
  const emptyJudgeAdapter: LLMAdapter = {
    async chat() {
      return { content: "{\"candidates\":[]}", parsed: { candidates: [] } };
    },
  };
  const judged = await applyCandidateJudgeGate(pageGate.assessedResults, specForAiEvent, emptyJudgeAdapter, {
    mode: "llm",
    now: new Date("2026-07-03T00:00:00+08:00"),
  });
  check(
    "Qwen Devpost Join hackathon fallback judge accepts action entry",
    judged.accepted.length === 1,
    JSON.stringify(judged.assessedResults[0]?.candidate_judge_assessment),
  );
  const owned = applyCandidateOwnershipGate(judged.assessedResults, specForAiEvent, {
    now: new Date("2026-07-03T00:00:00+08:00"),
  });
  check(
    "Qwen Devpost Join hackathon ownership accepts current user action",
    owned.accepted.length === 1,
    JSON.stringify(owned.assessedResults[0]?.ownership_assessment),
  );
  const ranked = rankCandidateResults(owned.assessedResults, specForAiEvent, {
    maxKeyCandidates: 5,
    now: new Date("2026-07-03T00:00:00+08:00"),
  });
  check(
    "Qwen Devpost Join hackathon materializes as key card",
    ranked.keyCandidates.some((item) => item.url.includes("qwencloud-hackathon.devpost.com")),
    JSON.stringify(ranked.assessedResults.map((item) => ({
      title: item.title,
      semantic: item.semantic_type,
      cap: item.candidate_ranking_assessment?.capStatus,
      reasons: item.candidate_ranking_assessment?.reasonCodes,
    }))),
  );
}

async function verifyQwenDevpostPrizeSignalsSurviveFullGate(): Promise<void> {
  const specForAiEvent = aiEventSpec();
  const candidateFromSerper = {
    ...qwenDevpostPrizeOnly,
    source_archetype: "official_event_site" as const,
    search_query: "Qwen Cloud Hackathon Devpost official application",
    search_theme: "Qwen Cloud / Devpost Hackathon",
    query_family: "Qwen Cloud / Devpost Hackathon",
    query_variant: "official_source" as const,
    intent_type: "direct_opportunity" as const,
  };
  const relevance = applyCandidateRelevanceGate([candidateFromSerper], specForAiEvent, {
    now: new Date("2026-07-03T00:00:00+08:00"),
  });
  check(
    "Qwen Devpost prize/compete signals pass relevance gate",
    relevance.accepted.length === 1,
    JSON.stringify(relevance.assessedResults[0]?.relevance_assessment),
  );
  const pageGate = applyCandidatePageTypeGate(relevance.assessedResults, specForAiEvent, {
    now: new Date("2026-07-03T00:00:00+08:00"),
  });
  check(
    "Qwen Devpost prize/compete signals pass page-type gate",
    pageGate.eligible.length === 1,
    JSON.stringify(pageGate.assessedResults[0]?.page_type_assessment),
  );
  const emptyJudgeAdapter: LLMAdapter = {
    async chat() {
      return { content: "{\"candidates\":[]}", parsed: { candidates: [] } };
    },
  };
  const judged = await applyCandidateJudgeGate(pageGate.assessedResults, specForAiEvent, emptyJudgeAdapter, {
    mode: "llm",
    now: new Date("2026-07-03T00:00:00+08:00"),
  });
  check(
    "Qwen Devpost prize/compete fallback judge accepts concrete event root",
    judged.accepted.length === 1,
    JSON.stringify(judged.assessedResults[0]?.candidate_judge_assessment),
  );
  const owned = applyCandidateOwnershipGate(judged.assessedResults, specForAiEvent, {
    now: new Date("2026-07-03T00:00:00+08:00"),
  });
  check(
    "Qwen Devpost prize/compete ownership accepts current user action",
    owned.accepted.length === 1,
    JSON.stringify(owned.assessedResults[0]?.ownership_assessment),
  );
  const ranked = rankCandidateResults(owned.assessedResults, specForAiEvent, {
    maxKeyCandidates: 5,
    now: new Date("2026-07-03T00:00:00+08:00"),
  });
  check(
    "Qwen Devpost prize/compete page materializes as key card",
    ranked.keyCandidates.some((item) => item.url === "https://qwencloud-hackathon.devpost.com"),
    JSON.stringify(ranked.assessedResults.map((item) => ({
      title: item.title,
      semantic: item.semantic_type,
      cap: item.candidate_ranking_assessment?.capStatus,
      reasons: item.candidate_ranking_assessment?.reasonCodes,
    }))),
  );
}

async function runAiEventFullGate(results: SearchResult[], maxKeyCandidates = 5) {
  const specForAiEvent = aiEventSpec();
  const prepared = results.map((result) => ({
    ...result,
    source_archetype: "official_event_site" as const,
    search_query: "Qwen Cloud Hackathon Devpost official application",
    search_theme: "Qwen Cloud / Devpost Hackathon",
    query_family: "Qwen Cloud / Devpost Hackathon",
    query_variant: "official_source" as const,
    intent_type: "direct_opportunity" as const,
  }));
  const relevance = applyCandidateRelevanceGate(prepared, specForAiEvent, {
    now: new Date("2026-07-03T00:00:00+08:00"),
  });
  const pageGate = applyCandidatePageTypeGate(relevance.assessedResults, specForAiEvent, {
    now: new Date("2026-07-03T00:00:00+08:00"),
  });
  const emptyJudgeAdapter: LLMAdapter = {
    async chat() {
      return { content: "{\"candidates\":[]}", parsed: { candidates: [] } };
    },
  };
  const judged = await applyCandidateJudgeGate(pageGate.assessedResults, specForAiEvent, emptyJudgeAdapter, {
    mode: "llm",
    now: new Date("2026-07-03T00:00:00+08:00"),
  });
  const owned = applyCandidateOwnershipGate(judged.assessedResults, specForAiEvent, {
    now: new Date("2026-07-03T00:00:00+08:00"),
  });
  return rankCandidateResults(owned.assessedResults, specForAiEvent, {
    maxKeyCandidates,
    now: new Date("2026-07-03T00:00:00+08:00"),
  });
}

async function verifyQwenEventRootBeatsDevpostManageSubmission(): Promise<void> {
  const ranked = await runAiEventFullGate([qwenDevpostManageSubmission, qwenDevpostPrizeOnly], 1);
  check(
    "Qwen event root outranks Devpost manage/submissions URL",
    ranked.keyCandidates[0]?.url === "https://qwencloud-hackathon.devpost.com",
    JSON.stringify(ranked.assessedResults.map((item) => ({
      title: item.title,
      url: item.url,
      semantic: item.semantic_type,
      cap: item.candidate_ranking_assessment?.capStatus,
      score: item.candidate_ranking_assessment?.totalScore,
      reasons: item.candidate_ranking_assessment?.reasonCodes,
    }))),
  );
}

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

async function verifyDirectEvidenceRead(): Promise<void> {
  const originalFetch = globalThis.fetch;
  const requestedUrls: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    requestedUrls.push(String(input));
    return new Response(`<!doctype html><html><head><title>Official AI Hackathon Registration</title></head><body><main><h1>Official AI Hackathon Registration</h1><p>Applications are open until 2026-09-30. Submit your project through the official entry form.</p></main></body></html>`, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }) as typeof fetch;
  try {
    const fetcher = new JinaReaderFetcher({ mockMode: false, preferDirect: true, timeoutMs: 1000 });
    const content = await fetcher.fetch("https://organizer.example.com/hackathon/register");
    check("live evidence direct read succeeds without Jina", content.fetch_success === true && content.word_count > 0, JSON.stringify(content));
    check("direct read preserves official page title", content.title.includes("Official AI Hackathon Registration"), content.title);
    check("successful direct read does not call Jina", requestedUrls.length === 1 && !requestedUrls[0]?.includes("r.jina.ai"), requestedUrls.join(" | "));
  } finally {
    globalThis.fetch = originalFetch;
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
  await verifyQwenDevpostJoinActionSurvivesFullGate();
  await verifyQwenDevpostPrizeSignalsSurviveFullGate();
  await verifyQwenEventRootBeatsDevpostManageSubmission();
  await verifyDirectEvidenceRead();
  await verifyOrchestratorRecovery();
  await verifyRecoveryNoResultStaysHonest();
  console.log(`Q.6-H primary source recovery: ${passed} PASS / ${failed} FAIL`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
