import { createApp } from "../src/api/app";
import { createAppContext } from "../src/api/context";
import { generateLiveLlmEvidenceExplanation } from "../src/agents/live-llm-report-explainer";
import fs from "node:fs";
import type { LLMAdapter } from "../src/agents/llm-adapter";
import { applyCandidatePageTypeGate, assessCandidatePageType } from "../src/search/candidate-page-type";
import { rankCandidateResults } from "../src/search/candidate-ranking";
import { applyCandidateRelevanceGate } from "../src/search/candidate-relevance";
import { applyCandidateJudgeGate } from "../src/search/candidate-llm-judge";
import { applyCandidateOwnershipGate } from "../src/search/candidate-ownership";
import { extractEvidence } from "../src/search/evidence-extractor";
import { isHighPriorityEvidenceSource, prioritizeEvidenceReadCandidates } from "../src/search/evidence-read-priority";
import { buildSuccessfulFieldEvidence } from "../src/search/live-evidence";
import { mapToCard, sortOpportunityCardsForDisplay } from "../src/search/opportunity-card-mapper";
import { buildOpportunityStrategy } from "../src/search/opportunity-strategy";
import { buildPrimarySourceRecoveryQueries } from "../src/search/primary-source-recovery";
import { generateRadarReport } from "../src/agents/radar-report-generator";
import { classifySource } from "../src/search/source-classifier";

let pass = 0;
let fail = 0;

function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    pass += 1;
    console.log(`PASS ${name}`);
  } else {
    fail += 1;
    console.error(`FAIL ${name}${detail ? `: ${detail}` : ""}`);
  }
}

async function post(app: ReturnType<typeof createApp>, path: string, body: unknown) {
  const response = await app.request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await response.json() as { success: boolean; data?: any; error?: any };
  check(`${path} returns 200`, response.status === 200, String(response.status));
  check(`${path} succeeds`, json.success === true, JSON.stringify(json.error ?? {}));
  return json.data;
}

const app = createApp(createAppContext());

async function run() {
  const demoPrompt = "我是在大湾区的 OPC / AI 产品创业者，正在打磨 ChancePing 机会雷达 Demo。我想找未来 30-60 天内仍可报名、可提交作品、适合个人开发者或小团队参加的 AI 比赛、AI Agent Hackathon、AI 创作赛事、AI IDE / Vibe Coding 比赛、云厂商开发者挑战、创业扶持和产品展示机会。请优先搜索 Qwen Cloud、TRAE、Devpost、DoraHacks、Lablab.ai、Kaggle、阿里云、腾讯云、AWS、Google Cloud、Microsoft、GitHub、Hugging Face、Product Hunt、AI Grant、粤港澳大湾区和海外线上比赛；排除展会资讯、培训广告、学生专属且 OPC 不能参加的比赛、已截止活动、纯新闻转载和没有报名入口的页面。报告里请按 S/A/B/C 评级，给我报名截止、奖金或云资源、参赛资格、适合 ChancePing 的打法、材料清单、风险提醒和本周行动步骤。";
  const initial = await post(app, "/api/radars/generate", {
    description: "我是个人开发者，想找 AI 比赛机会，帮我盯一下。",
  });
  check("initial version is V1.0", initial.radarVersion?.version === "V1.0", initial.radarVersion?.version ?? "");

  const v11 = await post(app, "/api/radars/revise", {
    previousSpec: initial.spec,
    previousRadarVersion: initial.radarVersion || initial.spec.radar_version,
    userMessage: "我不是学生，我是 OPC 创业者，优先奖金、云资源、能上架展示的比赛。",
    trigger: "requirement_correction",
  });
  check("first revision upgrades version", v11.radarVersion.version !== "V1.0", v11.radarVersion.version);
  check("first revision has visible diff", v11.radarDiff.summary.length > 0);
  check("first revision captures entrepreneur/developer intent", /创业者|开发者|OPC/i.test(JSON.stringify(v11.radarVersion)));
  check("first revision stays unconfirmed", v11.spec.confirmation_status?.user_confirmed === false, JSON.stringify(v11.spec.confirmation_status));

  const v12 = await post(app, "/api/radars/revise", {
    previousSpec: v11.spec,
    previousRadarVersion: v11.radarVersion,
    userMessage: "不要展会资讯，我要能报名的比赛。",
    trigger: "strategy_adjustment",
  });
  check("second revision upgrades version again", v12.radarVersion.version !== v11.radarVersion.version, v12.radarVersion.version);
  check("second revision downweights expo/news", /展会|资讯|新闻/.test(JSON.stringify(v12.radarDiff.downweighted)));
  check("second revision upweights registration", /报名|申请|入口|registration|application/i.test(JSON.stringify(v12.radarVersion)));
  check("second revision still waits for confirmation", v12.spec.confirmation_status?.user_confirmed === false, JSON.stringify(v12.spec.confirmation_status));

  const opportunityStrategy = buildOpportunityStrategy(v12.spec);
  const plannedQueries = (opportunityStrategy?.queries ?? []).map((item) => item.query);
  const plannedQueryText = plannedQueries.join("\n");
  check("AI event strategy stays within search cost cap", plannedQueries.length > 0 && plannedQueries.length <= 15, `queries=${plannedQueries.length}`);
  check(
    "AI event strategy includes Qwen Cloud Devpost official query",
    /Qwen Cloud Hackathon Devpost official application/i.test(plannedQueryText),
    plannedQueryText,
  );
  check(
    "AI event strategy includes TRAE registration query",
    /TRAE[\s\S]{0,30}(报名|official|application|challenge|创造力大赛)/i.test(plannedQueryText),
    plannedQueryText,
  );
  check(
    "AI event strategy includes hackathon platform discovery",
    /DoraHacks|Devpost|Lablab|Vibe Coding|AI Agent Hackathon/i.test(plannedQueryText),
    plannedQueryText,
  );
  check(
    "AI event strategy includes Kaggle/competition platform discovery",
    /Kaggle|AI competition platform|machine learning competition/i.test(plannedQueryText),
    plannedQueryText,
  );
  check(
    "AI event strategy includes cloud vendor challenge sources",
    /AWS|Google Cloud|Microsoft|Azure|阿里云|Tencent Cloud|cloud credits/i.test(plannedQueryText),
    plannedQueryText,
  );
  check(
    "AI event strategy includes product showcase and AI grant sources",
    /Product Hunt|Hugging Face|AI Grant|startup showcase|创业扶持|产品展示/i.test(plannedQueryText),
    plannedQueryText,
  );
  check(
    "AI event strategy includes GitHub developer challenge source",
    /GitHub|developer challenge|开发者挑战/i.test(plannedQueryText),
    plannedQueryText,
  );
  check(
    "AI event strategy keeps GBA and overseas intent",
    /Greater Bay Area|大湾区|overseas|global|international|海外/i.test(plannedQueryText),
    plannedQueryText,
  );
  const nonAiSpec = JSON.parse(JSON.stringify(v12.spec));
  nonAiSpec.primary_subject = "广州婚庆公司客户线索";
  nonAiSpec.client_profile.client_type = "婚庆公司";
  nonAiSpec.client_profile.industry = "婚庆";
  nonAiSpec.client_profile.business_type = "婚庆服务商";
  nonAiSpec.core_goals.primary_goal = "寻找高端婚礼客户和酒店合作线索";
  nonAiSpec.core_goals.secondary_goals = ["酒店合作", "品牌合作", "婚礼客户线索"];
  nonAiSpec.opportunity_scope.primary_opportunity_types = ["客户线索", "酒店合作", "婚礼活动合作"];
  nonAiSpec.opportunity_scope.must_have_conditions = ["能联系到酒店、活动方或品牌方"];
  nonAiSpec.keyword_strategy.core_keywords_zh = ["婚庆公司", "高端婚礼", "酒店合作"];
  nonAiSpec.keyword_strategy.core_keywords_en = [];
  nonAiSpec.keyword_strategy.expanded_keywords_zh = ["婚礼策划", "宴会厅合作", "品牌活动"];
  nonAiSpec.keyword_strategy.expanded_keywords_en = [];
  nonAiSpec.source_strategy.official_sites = [];
  nonAiSpec.source_strategy.platforms = [];
  nonAiSpec.source_strategy.manual_sources = [];
  nonAiSpec.filter_rules.high_priority_signals = ["能联系到酒店、活动方或品牌方"];
  nonAiSpec.profile_summary = {
    identity: "婚庆服务商",
    target: "高端婚礼客户和酒店合作线索",
    priorities: ["酒店合作", "品牌合作"],
    regionsAndTime: "广州；未来60天",
    exclusions: ["招聘广告", "培训广告"],
    sourceHints: [],
    assumptions: ["默认优先找可联系的酒店、活动方或品牌方"],
  };
  nonAiSpec.radar_version.oneSentencePositioning = "广州婚庆公司客户线索雷达";
  nonAiSpec.radar_version.targetUser = "婚庆服务商";
  nonAiSpec.radar_version.businessContext = "广州婚庆公司希望找到高端婚礼客户、酒店宴会厅和品牌活动合作线索。";
  nonAiSpec.radar_version.opportunityIntents = ["客户线索", "酒店合作", "婚礼活动合作"];
  nonAiSpec.radar_version.highValueCriteria = ["能联系到酒店、活动方或品牌方"];
  nonAiSpec.radar_version.exclusionRules = ["招聘广告", "培训广告", "纯资讯文章"];
  nonAiSpec.radar_version.prioritySourceArchetypes = ["hotel partner page", "brand event contact page", "wedding venue directory"];
  nonAiSpec.radar_version.defaultAssumptions = ["默认优先找可联系的酒店、活动方或品牌方"];
  nonAiSpec.radar_version.revisionNotes = [];
  nonAiSpec.radar_version.queryFamilies = [{
    familyName: "婚庆客户线索",
    intentType: "business_lead",
    sourceArchetype: "company contact page / hotel partner page",
    queries: ["广州 高端婚礼 酒店 合作 联系", "婚庆公司 品牌活动 合作 线索"],
    whyThisFamily: "验证非 AI 赛事雷达不会被 AI Hero Demo 查询污染。",
    resultBucket: "business_lead",
  }];
  const nonAiStrategy = buildOpportunityStrategy(nonAiSpec);
  const nonAiQueryText = (nonAiStrategy?.queries ?? []).map((item) => item.query).join("\n");
  check("AI event strategy does not pollute non-AI radar", !/Qwen|TRAE|DoraHacks|Devpost|Lablab/i.test(nonAiQueryText), nonAiQueryText);

  const overclaimingAdapter: LLMAdapter = {
    async chat() {
      return {
        content: JSON.stringify({
          explanations: [{
            title: "Qwen Cloud Hackathon",
            opportunity_value: "模型判断：已确认报名资格，适合 OPC 创业者。",
            suggested_action: "已确认截止日期后可以直接提交作品。",
            risk_note: "已确认费用为免费。",
            evidence_basis: "已核验联系人和报名状态。",
            review_needed: ["已确认版权义务"],
          }],
          global_notes: ["已确认报名资格和费用。"],
        }),
      };
    },
  };
  const safeExplanation = await generateLiveLlmEvidenceExplanation(
    overclaimingAdapter,
    {
      spec: v12.spec,
      opportunities: [{
        title: "Qwen Cloud Hackathon",
        type: "AI Hackathon",
        organizer: "Qwen",
        region: "Global",
        deadline: "待复核",
        reward_or_value: "待复核",
        eligibility: "待复核",
        materials_required: "待复核",
        match_reason: "模型判断：与 AI 赛事雷达相关。",
        next_action: "打开官方来源复核报名入口。",
        official_source_url: "https://qwencloud-hackathon.devpost.com/",
        application_url: "",
        contact_info: "",
        risk_note: "待复核。",
        backend_score: 82,
        visible_level: "A",
        status: "new",
        evidence_status: "needs_review",
        action_status: "prepare",
        opportunity_kind: "direct_opportunity",
        data_mode: "live",
        source_disclaimer: "搜索发现，待复核",
        field_evidence: [
          { field: "title", status: "verified", basis: "fetched_content", sourceUrl: "https://qwencloud-hackathon.devpost.com/", sourceDomain: "qwencloud-hackathon.devpost.com", value: "Qwen Cloud Hackathon" },
          { field: "source_url", status: "verified", basis: "fetched_content", sourceUrl: "https://qwencloud-hackathon.devpost.com/", sourceDomain: "qwencloud-hackathon.devpost.com", value: "https://qwencloud-hackathon.devpost.com/" },
          { field: "source_domain", status: "verified", basis: "fetched_content", sourceUrl: "https://qwencloud-hackathon.devpost.com/", sourceDomain: "qwencloud-hackathon.devpost.com", value: "qwencloud-hackathon.devpost.com" },
          { field: "source_type", status: "partially_verified", basis: "fetched_content", sourceUrl: "https://qwencloud-hackathon.devpost.com/", sourceDomain: "qwencloud-hackathon.devpost.com", value: "hackathon platform" },
          { field: "registration_or_application_signal", status: "unverified", basis: "search_result", sourceUrl: "https://qwencloud-hackathon.devpost.com/", sourceDomain: "qwencloud-hackathon.devpost.com" },
          { field: "date_or_deadline", status: "not_found", basis: "not_checked", sourceUrl: "https://qwencloud-hackathon.devpost.com/", sourceDomain: "qwencloud-hackathon.devpost.com" },
          { field: "fee", status: "not_found", basis: "not_checked", sourceUrl: "https://qwencloud-hackathon.devpost.com/", sourceDomain: "qwencloud-hackathon.devpost.com" },
          { field: "eligibility", status: "not_found", basis: "not_checked", sourceUrl: "https://qwencloud-hackathon.devpost.com/", sourceDomain: "qwencloud-hackathon.devpost.com" },
          { field: "contact_or_application_route", status: "not_found", basis: "not_checked", sourceUrl: "https://qwencloud-hackathon.devpost.com/", sourceDomain: "qwencloud-hackathon.devpost.com" },
        ],
      } as any],
      radar_type: "custom",
      period_start: "2026-06-27",
      period_end: "2026-07-04",
    },
    { profile: "contest", provider: "qwen", model: "qwen-plus" },
  );
  const safeExplanationText = JSON.stringify(safeExplanation);
  check("live LLM explanation sanitizes forbidden overclaims", !/已确认报名资格|已核验报名资格|已确认费用|已核验费用|已确认截止日期|已核验截止日期|已确认联系人|已核验联系人|已确认报名状态|已核验报名状态|已确认版权义务|已核验版权义务/.test(safeExplanationText), safeExplanationText);
  check("live LLM explanation keeps review-needed wording after sanitizing", /待复核/.test(safeExplanationText), safeExplanationText);

  const qwenCard = mapToCard(
    {
      search_result: {
        title: "Global AI Hackathon Series with Qwen Cloud : Build your ... - Devpost",
        url: "https://qwencloud-hackathon.devpost.com",
        snippet: "Build your own AI Agent on Qwen Cloud - compete for $70K in prizes across five tracks.",
        source_provider: "serper",
        source_type: "web",
      },
      cleaned_content: {
        url: "https://qwencloud-hackathon.devpost.com",
        title: "JavaScript is disabled",
        main_text: "JavaScript is disabled",
        word_count: 3,
        fetch_success: true,
      },
      relevance_score: 82,
      relevance_reason: "AI 赛事入口，待复核报名信息。",
      chance_score: { fit: 82, intent: 82, evidence: 60, urgency: 60, effort_cost: 40, total: 82 },
      visible_level: "A",
      backend_score: 82,
      opportunity_kind: "direct_opportunity",
      evidence_status: "needs_review",
      action_status: "prepare",
    },
    [{
      sourceId: "src_qwen",
      url: "https://qwencloud-hackathon.devpost.com",
      mediaName: "Devpost",
      sourceType: "official",
      confidenceGrade: "A2",
      verificationStatus: "partially_verified",
      isOfficial: true,
      retrievedAt: "2026-07-04T00:00:00.000Z",
    }],
    [{
      evidenceId: "ev_bad_title",
      sourceId: "src_qwen",
      field: "title",
      value: "JavaScript is disabled",
      evidenceText: "JavaScript is disabled",
      confidence: 0.95,
      needsReview: false,
    }],
    "custom-ai-event",
  );
  check("card title ignores JavaScript-disabled evidence placeholder", qwenCard.title.includes("Qwen Cloud"), qwenCard.title);

  const qwenFetchedContent = {
    url: "https://qwencloud-hackathon.devpost.com/",
    title: "Global AI Hackathon Series with Qwen Cloud",
    main_text: [
      "Global AI Hackathon Series with Qwen Cloud",
      "Join the hackathon and build your own AI Agent on Qwen Cloud.",
      "Deadline: Jul 9, 2026 @ 2:00pm PDT.",
      "Submit your project through Devpost before the deadline.",
      "$70K in prizes across five tracks and Qwen Cloud resources.",
      "Eligibility: individual developers, startups and small teams may participate.",
      "There is no entry fee.",
      "Register at https://qwencloud-hackathon.devpost.com/.",
    ].join("\n"),
    word_count: 72,
    fetch_success: true,
  };
  const qwenExtractedEvidence = extractEvidence(qwenFetchedContent, "src_qwen_fetched");
  check("AI event extractor reads English Devpost deadline", qwenExtractedEvidence.some((item) => item.field === "deadline" && /Jul 9, 2026|2026/.test(item.value)), JSON.stringify(qwenExtractedEvidence));
  check("AI event extractor reads English prize/resources", qwenExtractedEvidence.some((item) => item.field === "reward_or_value" && /70K|prizes|Cloud/i.test(item.value)), JSON.stringify(qwenExtractedEvidence));
  check("AI event extractor reads English eligibility", qwenExtractedEvidence.some((item) => item.field === "eligibility" && /individual developers|small teams|startups/i.test(item.value)), JSON.stringify(qwenExtractedEvidence));
  check("AI event extractor reads registration URL", qwenExtractedEvidence.some((item) => item.field === "application_url" && item.value.includes("qwencloud-hackathon.devpost.com")), JSON.stringify(qwenExtractedEvidence));

  const qwenFieldEvidence = buildSuccessfulFieldEvidence({
    title: "Global AI Hackathon Series with Qwen Cloud",
    url: "https://qwencloud-hackathon.devpost.com/",
    snippet: "Deadline: Jul 9, 2026 @ 2:00pm PDT · Join hackathon · $70K in prizes.",
    source_provider: "serper",
    source_type: "web" as const,
  }, qwenFetchedContent, "2026-07-04T00:00:00.000Z");
  check("field evidence marks Devpost registration signal from fetched content", qwenFieldEvidence.some((item) => item.field === "registration_or_application_signal" && item.status === "partially_verified" && /Join|Submit|Register/i.test(`${item.value} ${item.evidenceText}`)), JSON.stringify(qwenFieldEvidence));
  check("field evidence marks Devpost deadline from fetched content", qwenFieldEvidence.some((item) => item.field === "date_or_deadline" && item.status === "partially_verified" && /Jul 9, 2026|2026/.test(`${item.value} ${item.evidenceText}`)), JSON.stringify(qwenFieldEvidence));
  check("field evidence marks Devpost fee/free status from fetched content", qwenFieldEvidence.some((item) => item.field === "fee" && item.status === "partially_verified" && /no entry fee|free|不收取/i.test(`${item.value} ${item.evidenceText}`)), JSON.stringify(qwenFieldEvidence));
  check("field evidence marks Devpost eligibility from fetched content", qwenFieldEvidence.some((item) => item.field === "eligibility" && item.status === "partially_verified" && /individual developers|small teams/i.test(`${item.value} ${item.evidenceText}`)), JSON.stringify(qwenFieldEvidence));

  const coffeeTextEvidence = buildSuccessfulFieldEvidence({
    title: "SuperAI NEXT Hackathon",
    url: "https://dorahacks.io/hackathon/superai-next",
    snippet: "Food and coffee are available during conference hours. Register to join the hackathon.",
    source_provider: "serper",
    source_type: "web" as const,
  }, {
    url: "https://dorahacks.io/hackathon/superai-next",
    title: "SuperAI NEXT Hackathon",
    main_text: "Food and coffee are available during conference hours. Register to join the hackathon.",
    word_count: 14,
    fetch_success: true,
  }, "2026-07-04T00:00:00.000Z");
  check("field evidence does not mistake coffee text as fee", !coffeeTextEvidence.some((item) => item.field === "fee" && /coffee/i.test(`${item.value} ${item.evidenceText}`)), JSON.stringify(coffeeTextEvidence));

  const traeMediaResult = {
    title: "超百万现金激励，TRAE AI创造力大赛正式启动 - 财中社",
    url: "https://m.caizhongshe.cn/news-123",
    snippet: "新闻报道 TRAE AI 创造力大赛启动，提到报名、作品提交和官方论坛规则页。",
    source_provider: "serper",
    source_type: "web" as const,
  };
  const traeRecoveryQueries = buildPrimarySourceRecoveryQueries([traeMediaResult], v12.spec, 2).map((item) => item.query).join("\n");
  check("TRAE media clue recovers official forum/application query", /forum\.trae\.cn|TRAE AI 创造力大赛 官方 报名/i.test(traeRecoveryQueries), traeRecoveryQueries);

  const priorityAiEventSources = Array.from({ length: 12 }, (_, index) => ({
    title: `AI Agent Hackathon ${index + 1} - Devpost`,
    url: `https://ai-agent-demo-${index + 1}.devpost.com/`,
    snippet: `Join hackathon ${index + 1}. Register and submit before Deadline: Jul ${10 + index}, 2026. Prize pool and cloud credits available.`,
    source_provider: "serper",
    source_type: "web" as const,
    source_archetype: "official_event_site" as const,
    intent_type: "direct_opportunity" as const,
  }));
  check("all 12 concrete AI event sources qualify as high-priority evidence", priorityAiEventSources.every((item) => isHighPriorityEvidenceSource(item, v12.spec)), JSON.stringify(priorityAiEventSources));
  const priorityReadList = prioritizeEvidenceReadCandidates({
    keyCandidates: priorityAiEventSources.slice(0, 3),
    rawCandidates: priorityAiEventSources.slice(3),
    maxUrls: 3,
    spec: v12.spec,
  });
  check("AI event priority evidence reads all 12 high-priority URLs beyond fallback cap", priorityReadList.length === 12, priorityReadList.map((item) => item.url).join(" | "));

  const qwenOfficialSources = [
    {
      title: "Global AI Hackathon Series with Qwen Cloud : Build your own AI Agent",
      url: "https://qwencloud-hackathon.devpost.com/",
      snippet: "Deadline: Jul 9, 2026 @ 2:00pm PDT. Join the hackathon, submit through Devpost and compete for $70K in prizes.",
    },
    {
      title: "Rules - Global AI Hackathon Series with Qwen Cloud",
      url: "https://qwencloud-hackathon.devpost.com/rules",
      snippet: "Official rules, eligibility, submissions, judging and prizes for Qwen Cloud Hackathon.",
    },
    {
      title: "Resources - Global AI Hackathon Series with Qwen Cloud",
      url: "https://qwencloud-hackathon.devpost.com/resources",
      snippet: "Register on Devpost. Qwen Cloud free trial and hackathon resources are available.",
    },
  ].map((item) => ({
    ...item,
    source_provider: "serper",
    source_type: "web" as const,
    source_archetype: "official_event_site" as const,
    intent_type: "direct_opportunity" as const,
    semantic_type: "direct_opportunity" as const,
  }));
  const qwenClassifiedSource = classifySource({
    title: "Global AI Hackathon Series with Qwen Cloud : Build your own AI Agent - Devpost",
    url: "https://qwencloud-hackathon.devpost.com",
    snippet: "Build your own AI Agent on Qwen Cloud. Register and submit through Devpost for $70K in prizes.",
    source_provider: "serper",
    source_type: "web" as const,
  });
  check("concrete Devpost event root is classified as official source", qwenClassifiedSource.sourceType === "official" && qwenClassifiedSource.isOfficial && qwenClassifiedSource.confidenceGrade === "A2", JSON.stringify(qwenClassifiedSource));
  const traeOfficialSources = [
    {
      title: "TRAE AI 创造力大赛报名专区",
      url: "https://forum.trae.cn/c/38-category/38",
      snippet: "TRAE AI 创造力大赛报名专区，7月15日前报名，查看规则全攻略并提交作品。",
    },
    {
      title: "TRAE AI 创造力大赛规则全攻略",
      url: "https://forum.trae.cn/t/topic/22548",
      snippet: "官方规则页：报名、提交作品、赛题、现金激励和评审标准。",
    },
  ].map((item) => ({
    ...item,
    source_provider: "serper",
    source_type: "web" as const,
    source_archetype: "official_event_site" as const,
    intent_type: "direct_opportunity" as const,
    semantic_type: "direct_opportunity" as const,
  }));
  const noisyAiEventSources = [
    {
      title: "Qwen Cloud Hackathon announcement - X",
      url: "https://x.com/devpost/status/123",
      snippet: "Join the Qwen Cloud Hackathon and register now.",
    },
    {
      title: "Qwen Cloud Hackathon - LinkedIn Pulse",
      url: "https://www.linkedin.com/pulse/qwen-cloud-hackathon-news",
      snippet: "A media repost about Qwen Cloud Hackathon registration.",
    },
    {
      title: "Qwen Cloud Hackathon 怎么参加？- 知乎",
      url: "https://www.zhihu.com/question/123",
      snippet: "讨论 Qwen Cloud Hackathon 报名和规则。",
    },
    {
      title: "All AI Hackathons - Lablab.ai",
      url: "https://lablab.ai/ai-hackathons",
      snippet: "Browse all AI hackathons and competitions.",
    },
    {
      title: "What is vibe coding?",
      url: "https://cloud.google.com/discover/what-is-vibe-coding",
      snippet: "A guide explaining vibe coding and AI-assisted development.",
    },
  ].map((item) => ({
    ...item,
    source_provider: "serper",
    source_type: "web" as const,
    source_archetype: "official_event_site" as const,
    intent_type: "direct_opportunity" as const,
    semantic_type: "direct_opportunity" as const,
  }));
  const concreteLablabEvent = {
    title: "AI Agent Hackathon - Lablab.ai Event",
    url: "https://lablab.ai/event/ai-agent-hackathon",
    snippet: "Join this AI Agent hackathon, register and submit your project before the deadline.",
    source_provider: "serper",
    source_type: "web" as const,
    source_archetype: "official_event_site" as const,
    intent_type: "direct_opportunity" as const,
    semantic_type: "direct_opportunity" as const,
  };
  check("Qwen official Devpost pages are high-priority evidence", qwenOfficialSources.every((item) => isHighPriorityEvidenceSource(item, v12.spec)), JSON.stringify(qwenOfficialSources));
  check("TRAE official forum pages are high-priority evidence", traeOfficialSources.every((item) => isHighPriorityEvidenceSource(item, v12.spec)), JSON.stringify(traeOfficialSources));
  check("concrete Lablab event page is high-priority evidence", isHighPriorityEvidenceSource(concreteLablabEvent, v12.spec), JSON.stringify(concreteLablabEvent));
  check("social/reference/category AI mentions are not high-priority evidence", noisyAiEventSources.every((item) => !isHighPriorityEvidenceSource(item, v12.spec)), JSON.stringify(noisyAiEventSources));

  const mixedPriorityReadList = prioritizeEvidenceReadCandidates({
    keyCandidates: [],
    rawCandidates: [...noisyAiEventSources, ...qwenOfficialSources, ...traeOfficialSources, concreteLablabEvent],
    maxUrls: 3,
    spec: v12.spec,
  }).map((item) => item.url);
  check("priority evidence reading excludes weak social/reference/category sources", noisyAiEventSources.every((item) => !mixedPriorityReadList.includes(item.url)), mixedPriorityReadList.join(" | "));
  check("priority evidence reading keeps Qwen/TRAE official sources", [...qwenOfficialSources, ...traeOfficialSources].every((item) => mixedPriorityReadList.includes(item.url)), mixedPriorityReadList.join(" | "));

  function acceptedCandidate<T extends { title: string; url: string; snippet: string }>(item: T, sourceArchetype = "official_event_site" as const) {
    const base = {
      ...item,
      source_provider: "serper",
      source_type: "web" as const,
      source_archetype: sourceArchetype,
      intent_type: "direct_opportunity" as const,
      semantic_type: "direct_opportunity" as const,
      original_semantic_type: "direct_opportunity" as const,
      candidate_judge_assessment: {
        candidate_type: "key_opportunity" as const,
        beneficiary_fit: "fit" as const,
        action_fit: "fit" as const,
        source_fit: "fit" as const,
        freshness_fit: "valid" as const,
        relevance_score: 86,
        decision: "accept" as const,
        reason: "适合 AI 赛事雷达。",
        basis: "deterministic_fallback" as const,
        assessedAt: "2026-07-04T00:00:00.000Z",
      },
      ownership_assessment: {
        pageAudience: "current_user" as const,
        currentUserActionMode: "register" as const,
        opportunityRoleForUser: "direct_opportunity" as const,
        ownershipDecision: "accept" as const,
        ownershipReason: "当前用户可报名或提交作品。",
        reasonCodes: ["generic_direct_action"],
        basis: "deterministic_rule_on_search_evidence" as const,
        assessedAt: "2026-07-04T00:00:00.000Z",
      },
    };
    return {
      ...base,
      page_type_assessment: assessCandidatePageType(base, v12.spec, { now: new Date("2026-07-04T00:00:00.000Z") }),
    };
  }
  const rankedDemoCandidates = rankCandidateResults([
    acceptedCandidate(qwenOfficialSources[0]),
    acceptedCandidate(traeOfficialSources[0]),
    acceptedCandidate({
      title: "中国研究生创新实践系列大赛管理平台",
      url: "https://cpipc.acge.org.cn/cw/hp/4",
      snippet: "大学生和研究生比赛管理平台，报名参赛入口。",
    }, "official_event_site"),
    acceptedCandidate({
      title: "India Agentic AI Open Hackathon",
      url: "https://india-agentic-ai.devpost.com/",
      snippet: "Join hackathon and submit your AI agent project before the deadline.",
    }, "official_event_site"),
    acceptedCandidate(noisyAiEventSources[0]),
  ], v12.spec, { maxKeyCandidates: 3, now: new Date("2026-07-04T00:00:00.000Z") });
  const rankedKeyUrls = rankedDemoCandidates.keyCandidates.map((item) => item.url);
  check("ranking keeps Qwen official entry in key cards", rankedKeyUrls.includes("https://qwencloud-hackathon.devpost.com/"), rankedKeyUrls.join(" | "));
  check("ranking keeps TRAE official entry in key cards", rankedKeyUrls.includes("https://forum.trae.cn/c/38-category/38"), rankedKeyUrls.join(" | "));
  check("ranking excludes social repost from key cards", !rankedKeyUrls.includes("https://x.com/devpost/status/123"), rankedKeyUrls.join(" | "));

  const traeOfficialRegistrationResult = {
    title: "0门槛助你报名成功，赢取99元速通奖励和决赛现场门票",
    url: "https://forum.trae.cn/t/topic/22548",
    snippet: "有想法就能来，报名真的只要3分钟。这篇是TRAE AI创造力大赛的报名手把手教程。哪怕你没有任何技术背景、没写过一行代码，跟着下面的步骤走，也能顺利发出报名帖。",
    source_provider: "serper",
    source_type: "web" as const,
    source_archetype: "official_event_site" as const,
    intent_type: "direct_opportunity" as const,
    semantic_type: "direct_opportunity" as const,
  };
  const traeRelevanceGate = applyCandidateRelevanceGate([traeOfficialRegistrationResult], v12.spec, { now: new Date("2026-07-04T00:00:00.000Z") });
  const traePageGate = applyCandidatePageTypeGate(traeRelevanceGate.assessedResults, v12.spec, { now: new Date("2026-07-04T00:00:00.000Z") });
  const traeJudgeGate = await applyCandidateJudgeGate(traePageGate.assessedResults, v12.spec, overclaimingAdapter, { mode: "fallback", now: new Date("2026-07-04T00:00:00.000Z") });
  const traeOwnershipGate = applyCandidateOwnershipGate(traeJudgeGate.assessedResults, v12.spec, { now: new Date("2026-07-04T00:00:00.000Z") });
  const traeOfficialRanking = rankCandidateResults(traeOwnershipGate.assessedResults, v12.spec, { maxKeyCandidates: 3, now: new Date("2026-07-04T00:00:00.000Z") });
  const traeOfficialAssessed = traeOwnershipGate.assessedResults[0];
  check("TRAE official registration tutorial passes relevance gate", traeOfficialAssessed.relevance_assessment?.decision === "accept", JSON.stringify(traeOfficialAssessed.relevance_assessment));
  check("TRAE official registration tutorial passes candidate judge", traeOfficialAssessed.candidate_judge_assessment?.decision === "accept", JSON.stringify(traeOfficialAssessed.candidate_judge_assessment));
  check("TRAE official registration tutorial passes ownership gate", traeOfficialAssessed.ownership_assessment?.ownershipDecision === "accept", JSON.stringify(traeOfficialAssessed.ownership_assessment));
  check("TRAE official registration tutorial can enter key cards", traeOfficialRanking.keyCandidates.some((item) => item.url === "https://forum.trae.cn/t/topic/22548"), JSON.stringify(traeOfficialRanking.assessedResults.map((item) => ({ url: item.url, semantic: item.semantic_type, ranking: item.candidate_ranking_assessment }))));

  const qwenRootVsSubpages = rankCandidateResults([
    acceptedCandidate({
      title: "Participants (6486) - Global AI Hackathon Series with Qwen Cloud",
      url: "https://qwencloud-hackathon.devpost.com/participants",
      snippet: "Participants list for the Qwen Cloud Hackathon.",
    }),
    acceptedCandidate({
      title: "Resources - Global AI Hackathon Series with Qwen Cloud - Devpost",
      url: "https://qwencloud-hackathon.devpost.com/resources",
      snippet: "Resources and cloud trial information for Qwen Cloud Hackathon.",
    }),
    acceptedCandidate({
      title: "Global AI Hackathon Series with Qwen Cloud : Build your own AI Agent - Devpost",
      url: "https://qwencloud-hackathon.devpost.com",
      snippet: "Build your own AI Agent on Qwen Cloud. Register and submit through Devpost before the deadline.",
    }),
  ], v12.spec, { maxKeyCandidates: 3, now: new Date("2026-07-04T00:00:00.000Z") });
  const qwenRootVsSubpageKeyUrls = qwenRootVsSubpages.keyCandidates.map((item) => item.url);
  check("ranking keeps Qwen event root instead of utility subpages", qwenRootVsSubpageKeyUrls.includes("https://qwencloud-hackathon.devpost.com") && !qwenRootVsSubpageKeyUrls.some((url) => /\/(?:participants|resources)(?:\/|$)/.test(url)), qwenRootVsSubpageKeyUrls.join(" | "));

  const qwenPromotedCard = mapToCard(
    {
      search_result: {
        title: "Global AI Hackathon Series with Qwen Cloud : Build your ... - Devpost",
        url: "https://qwencloud-hackathon.devpost.com",
        snippet: "Build your own AI Agent on Qwen Cloud - compete for $70K in prizes across five tracks.",
        source_provider: "serper",
        source_type: "web",
      },
      cleaned_content: {
        url: "https://qwencloud-hackathon.devpost.com",
        title: "Global AI Hackathon Series with Qwen Cloud",
        main_text: "Build your own AI Agent on Qwen Cloud.",
        word_count: 8,
        fetch_success: true,
      },
      relevance_score: 52,
      relevance_reason: "Live Evidence MVP: 搜索发现，字段待复核。",
      chance_score: { fit: 62, intent: 62, evidence: 55, urgency: 30, effort_cost: 40, total: 52 },
      visible_level: "C",
      backend_score: 52,
      opportunity_kind: "direct_opportunity",
      evidence_status: "needs_review",
      action_status: "prepare",
    },
    [{
      sourceId: "src_qwen_boost",
      url: "https://qwencloud-hackathon.devpost.com",
      mediaName: "Devpost",
      sourceType: "official",
      confidenceGrade: "A2",
      verificationStatus: "partially_verified",
      isOfficial: true,
      retrievedAt: "2026-07-04T00:00:00.000Z",
    }],
    [],
    "custom-ai-event",
  );
  check("AI event concrete platform entry is promoted from C to A for demo usefulness", qwenPromotedCard.visible_level === "A" && qwenPromotedCard.backend_score >= 80, JSON.stringify({ level: qwenPromotedCard.visible_level, score: qwenPromotedCard.backend_score }));
  check("AI event concrete platform card uses customer-facing match reason", /具体赛事|黑客松|报名|官方|复核/.test(qwenPromotedCard.match_reason) && !/Live Evidence MVP/.test(qwenPromotedCard.match_reason), qwenPromotedCard.match_reason);
  check("AI event concrete platform card keeps review-safe next action", /复核|官方|报名/.test(qwenPromotedCard.next_action), qwenPromotedCard.next_action);

  const qwenLiveSerperSource = classifySource({
    title: "Global AI Hackathon Series with Qwen Cloud : Build your ... - Devpost",
    url: "https://qwencloud-hackathon.devpost.com",
    snippet: "Build your own AI Agent on Qwen Cloud - compete for $70K in prizes across five tracks.",
    source_provider: "serper",
    source_type: "web" as const,
  });
  const qwenLiveSerperPromotedCard = mapToCard(
    {
      search_result: {
        title: "Global AI Hackathon Series with Qwen Cloud : Build your ... - Devpost",
        url: "https://qwencloud-hackathon.devpost.com",
        snippet: "Build your own AI Agent on Qwen Cloud - compete for $70K in prizes across five tracks.",
        source_provider: "serper",
        source_type: "web",
      },
      cleaned_content: {
        url: "https://qwencloud-hackathon.devpost.com",
        title: "JavaScript is disabled",
        main_text: "JavaScript is disabled",
        word_count: 3,
        fetch_success: true,
      },
      relevance_score: 52,
      relevance_reason: "搜索发现，字段待复核。",
      chance_score: { fit: 62, intent: 62, evidence: 55, urgency: 30, effort_cost: 40, total: 52 },
      visible_level: "C",
      backend_score: 52,
      opportunity_kind: "direct_opportunity",
      evidence_status: "needs_review",
      action_status: "prepare",
    },
    [qwenLiveSerperSource],
    [],
    "custom-ai-event",
  );
  check("live Serper Qwen event root is promoted from C to A", qwenLiveSerperPromotedCard.visible_level === "A" && qwenLiveSerperPromotedCard.backend_score >= 80, JSON.stringify({ level: qwenLiveSerperPromotedCard.visible_level, score: qwenLiveSerperPromotedCard.backend_score, source: qwenLiveSerperSource }));

  const qwenResourcesSupportCard = mapToCard(
    {
      search_result: {
        title: "Resources - Global AI Hackathon Series with Qwen Cloud - Devpost",
        url: "https://qwencloud-hackathon.devpost.com/resources",
        snippet: "Global AI Hackathon Series with Qwen Cloud resources and cloud trial information.",
        source_provider: "serper",
        source_type: "web",
      },
      cleaned_content: {
        url: "https://qwencloud-hackathon.devpost.com/resources",
        title: "Resources - Global AI Hackathon Series with Qwen Cloud",
        main_text: "Resources and cloud trial information.",
        word_count: 6,
        fetch_success: true,
      },
      relevance_score: 52,
      relevance_reason: "赛事资源页，可作为支撑证据，但不是报名入口。",
      chance_score: { fit: 62, intent: 62, evidence: 55, urgency: 30, effort_cost: 40, total: 52 },
      visible_level: "C",
      backend_score: 52,
      opportunity_kind: "direct_opportunity",
      evidence_status: "needs_review",
      action_status: "prepare",
    },
    [classifySource({
      title: "Resources - Global AI Hackathon Series with Qwen Cloud - Devpost",
      url: "https://qwencloud-hackathon.devpost.com/resources",
      snippet: "Global AI Hackathon Series with Qwen Cloud resources and cloud trial information.",
      source_provider: "serper",
      source_type: "web" as const,
    })],
    [],
    "custom-ai-event",
  );
  check("Qwen Devpost resources page is not promoted as a key action card", qwenResourcesSupportCard.visible_level !== "A" && qwenResourcesSupportCard.backend_score < 80, JSON.stringify({ level: qwenResourcesSupportCard.visible_level, score: qwenResourcesSupportCard.backend_score }));

  const qwenParticipantsSupportCard = mapToCard(
    {
      search_result: {
        title: "Participants (6486) - Global AI Hackathon Series with Qwen Cloud",
        url: "https://qwencloud-hackathon.devpost.com/participants",
        snippet: "Participants list for the Qwen Cloud Hackathon.",
        source_provider: "serper",
        source_type: "web",
      },
      cleaned_content: {
        url: "https://qwencloud-hackathon.devpost.com/participants",
        title: "Participants (6486) - Global AI Hackathon Series with Qwen Cloud",
        main_text: "Participants list for the Qwen Cloud Hackathon.",
        word_count: 8,
        fetch_success: true,
      },
      relevance_score: 66,
      relevance_reason: "参赛者列表可作为旁证，但不是报名入口。",
      chance_score: { fit: 66, intent: 66, evidence: 55, urgency: 30, effort_cost: 40, total: 66 },
      visible_level: "B",
      backend_score: 66,
      opportunity_kind: "direct_opportunity",
      evidence_status: "needs_review",
      action_status: "prepare",
    },
    [classifySource({
      title: "Participants (6486) - Global AI Hackathon Series with Qwen Cloud",
      url: "https://qwencloud-hackathon.devpost.com/participants",
      snippet: "Participants list for the Qwen Cloud Hackathon.",
      source_provider: "serper",
      source_type: "web" as const,
    })],
    [],
    "custom-ai-event",
  );
  check("Qwen Devpost participants page is downgraded to observation", qwenParticipantsSupportCard.visible_level === "C" && qwenParticipantsSupportCard.backend_score <= 64, JSON.stringify({ level: qwenParticipantsSupportCard.visible_level, score: qwenParticipantsSupportCard.backend_score }));

  const lablabCategoryCard = mapToCard(
    {
      search_result: {
        title: "AI Hackathons - Lablab.ai",
        url: "https://lablab.ai/ai-hackathons",
        snippet: "Browse upcoming AI hackathons and challenges on Lablab.ai.",
        source_provider: "serper",
        source_type: "web",
      },
      cleaned_content: {
        url: "https://lablab.ai/ai-hackathons",
        title: "AI Hackathons - Lablab.ai",
        main_text: "Browse AI hackathons.",
        word_count: 4,
        fetch_success: true,
      },
      relevance_score: 72,
      relevance_reason: "AI hackathon 分类页，可作为发现入口。",
      chance_score: { fit: 72, intent: 72, evidence: 55, urgency: 30, effort_cost: 40, total: 72 },
      visible_level: "B",
      backend_score: 72,
      opportunity_kind: "direct_opportunity",
      evidence_status: "needs_review",
      action_status: "prepare",
    },
    [classifySource({
      title: "AI Hackathons - Lablab.ai",
      url: "https://lablab.ai/ai-hackathons",
      snippet: "Browse upcoming AI hackathons and challenges on Lablab.ai.",
      source_provider: "serper",
      source_type: "web" as const,
    })],
    [],
    "custom-ai-event",
  );
  check("Lablab AI hackathons category is downgraded to observation", lablabCategoryCard.visible_level === "C" && lablabCategoryCard.backend_score <= 64, JSON.stringify({ level: lablabCategoryCard.visible_level, score: lablabCategoryCard.backend_score }));

  const traeLatestCard = mapToCard(
    {
      search_result: {
        title: "TRAE 官方中文社区",
        url: "https://forum.trae.cn/latest",
        snippet: "TRAE 官方中文社区最新帖子列表。",
        source_provider: "serper",
        source_type: "web",
      },
      cleaned_content: {
        url: "https://forum.trae.cn/latest",
        title: "TRAE 官方中文社区",
        main_text: "最新帖子列表。",
        word_count: 4,
        fetch_success: true,
      },
      relevance_score: 71,
      relevance_reason: "官方社区列表页，可作为发现入口。",
      chance_score: { fit: 71, intent: 71, evidence: 55, urgency: 30, effort_cost: 40, total: 71 },
      visible_level: "B",
      backend_score: 71,
      opportunity_kind: "direct_opportunity",
      evidence_status: "needs_review",
      action_status: "prepare",
    },
    [classifySource({
      title: "TRAE 官方中文社区",
      url: "https://forum.trae.cn/latest",
      snippet: "TRAE 官方中文社区最新帖子列表。",
      source_provider: "serper",
      source_type: "web" as const,
    })],
    [],
    "custom-ai-event",
  );
  check("TRAE latest listing page is downgraded to observation", traeLatestCard.visible_level === "C" && traeLatestCard.backend_score <= 64, JSON.stringify({ level: traeLatestCard.visible_level, score: traeLatestCard.backend_score }));

  const traeMediaCard = mapToCard(
    {
      search_result: {
        title: "超百万现金激励，TRAE AI创造力大赛正式启动 - 财中社",
        url: "https://m.caizhongshe.cn/news-123",
        snippet: "新闻报道 TRAE AI 创造力大赛启动。",
        source_provider: "serper",
        source_type: "web",
      },
      cleaned_content: {
        url: "https://m.caizhongshe.cn/news-123",
        title: "超百万现金激励，TRAE AI创造力大赛正式启动",
        main_text: "新闻报道。",
        word_count: 8,
        fetch_success: true,
      },
      relevance_score: 72,
      relevance_reason: "AI 赛事相关新闻，待追溯官方入口。",
      chance_score: { fit: 72, intent: 72, evidence: 45, urgency: 50, effort_cost: 40, total: 72 },
      visible_level: "B",
      backend_score: 72,
      opportunity_kind: "direct_opportunity",
      evidence_status: "needs_review",
      action_status: "prepare",
    },
    [{
      sourceId: "src_trae_media",
      url: "https://m.caizhongshe.cn/news-123",
      mediaName: "财中社",
      sourceType: "media_general",
      confidenceGrade: "C3",
      verificationStatus: "unverified",
      isOfficial: false,
      retrievedAt: "2026-07-04T00:00:00.000Z",
    }],
    [],
    "custom-ai-event",
  );
  check("AI event media-only report is downgraded below action cards", traeMediaCard.visible_level === "C", JSON.stringify({ level: traeMediaCard.visible_level, score: traeMediaCard.backend_score }));

  const expiredEventCard = mapToCard(
    {
      search_result: {
        title: "Expired AI Hackathon",
        url: "https://example.devpost.com",
        snippet: "Join this AI hackathon. Deadline 2020/06/10.",
        source_provider: "serper",
        source_type: "web",
      },
      cleaned_content: {
        url: "https://example.devpost.com",
        title: "Expired AI Hackathon",
        main_text: "Deadline 2020/06/10. Register and submit your project.",
        word_count: 8,
        fetch_success: true,
      },
      relevance_score: 82,
      relevance_reason: "AI 赛事入口，但截止时间已过。",
      chance_score: { fit: 82, intent: 82, evidence: 70, urgency: 10, effort_cost: 40, total: 78 },
      visible_level: "B",
      backend_score: 78,
      opportunity_kind: "direct_opportunity",
      evidence_status: "needs_review",
      action_status: "prepare",
    },
    [{
      sourceId: "src_expired",
      url: "https://example.devpost.com",
      mediaName: "Devpost",
      sourceType: "official",
      confidenceGrade: "A2",
      verificationStatus: "partially_verified",
      isOfficial: true,
      retrievedAt: "2026-07-04T00:00:00.000Z",
    }],
    [{
      evidenceId: "ev_expired_deadline",
      sourceId: "src_expired",
      field: "deadline",
      value: "2020/06/10",
      evidenceText: "Deadline 2020/06/10.",
      confidence: 0.8,
      needsReview: false,
    }],
    "custom-ai-event",
  );
  check("expired event evidence is archived instead of key-card", expiredEventCard.visible_level === "D" && expiredEventCard.status === "expired", JSON.stringify({ level: expiredEventCard.visible_level, status: expiredEventCard.status, risk: expiredEventCard.risk_note }));
  const sortedDemoCards = sortOpportunityCardsForDisplay([
    expiredEventCard,
    {
      ...qwenPromotedCard,
      visible_level: "A",
      backend_score: 82,
      title: "Global AI Hackathon Series with Qwen Cloud",
    },
    {
      ...traeMediaCard,
      visible_level: "C",
      backend_score: 58,
      title: "Observation Candidate",
    },
  ] as any);
  check("display sorting puts active AI event cards before expired D cards", sortedDemoCards[0].title.includes("Qwen Cloud") && sortedDemoCards.at(-1)?.visible_level === "D", sortedDemoCards.map((card) => `${card.visible_level}:${card.title}`).join(" | "));

  const heroChatJs = fs.readFileSync("web/hero-radar-chat.js", "utf-8");
  const indexHtml = fs.readFileSync("web/index.html", "utf-8");
  const stylesCss = fs.readFileSync("web/styles.css", "utf-8");
  const orchestratorTs = fs.readFileSync("src/search/orchestrator.ts", "utf-8");
  check("hero demo prompt is detailed enough for recording", heroChatJs.includes("Qwen Cloud") && heroChatJs.includes("Product Hunt") && heroChatJs.includes("S/A/B/C"), "demo prompt should lock the first recording message");
  check("hero demo prompt covers OPC and actionable AI contests", heroChatJs.includes("OPC / AI 产品创业者") && heroChatJs.includes("未来 30-60 天内仍可报名"), "demo prompt should be richer than a short user sentence");
  check("hero homepage hides legacy multi-industry template block", /class="home-examples-block"[^>]*hidden/.test(indexHtml) || /\\.home-examples-block[\\s\\S]*display:\\s*none\\s*!important/.test(stylesCss), "legacy template block should not be visible in Hero Demo");
  check("hero report summary names S/A/B/C and top opportunities", heroChatJs.includes("本次建议先看") && heroChatJs.includes("S 级") && heroChatJs.includes("A 级"), "summary should read like a report brief");
  check("hero report summary uses dynamic level recommendation", heroChatJs.includes("buildReportRecommendation") && !heroChatJs.includes("建议先处理 S/A 级机会。</span>"), "summary must not recommend S/A when this run has no S/A cards");
  check("hero report summary includes trustworthy evidence reminder", heroChatJs.includes("搜索发现，不等于已核验事实"), "summary should keep anti-hallucination copy");
  check("hero progress explains live source reading", heroChatJs.includes("正在读取优先来源正文") && heroChatJs.includes("云厂商赛事页、Devpost、DoraHacks"), "progress should explain real work without exposing model providers");
  check("customer-facing AI event output avoids internal MVP/mock wording", !/Live Evidence MVP|LLM 仍保持 mock|mock 轻量评估/i.test(`${heroChatJs}\n${orchestratorTs}`), "customer reports/cards should not expose engineering labels");

  const demoReport = generateRadarReport({
    spec: {
      ...v12.spec,
      core_goals: { ...v12.spec.core_goals, primary_goal: "AI 赛事雷达 Hero Demo" },
      confirmation_status: {
        ...(v12.spec.confirmation_status || {}),
        status: "confirmed",
        user_confirmed: true,
        confirmed_at: new Date().toISOString(),
      },
    },
    opportunities: [
      {
        title: "TRAE AI 创造力大赛",
        type: "AI IDE / Vibe Coding / 产品 Demo",
        organizer: "TRAE",
        region: "中国 / 线上",
        deadline: "2026-07-15 23:59",
        reward_or_value: "现金奖池、产品展示、AI IDE 创作证明",
        eligibility: "个人开发者 / 小团队，待复核具体规则",
        materials_required: "创意提案、Demo、项目说明、AI 创作过程证明",
        match_reason: "适合用 ChancePing 做可体验 Demo，能展示 AI IDE 与机会雷达结合。",
        next_action: "立即打开官方规则，确认报名入口和材料要求",
        official_source_url: "https://forum.trae.cn/t/topic/22548",
        application_url: "https://forum.trae.cn/t/topic/22548",
        contact_info: "待复核",
        risk_note: "报名资格、材料格式、版权义务和截止时间需以官方页面为准。",
        backend_score: 94,
        visible_level: "S",
        status: "new",
        evidence_status: "needs_review",
        action_status: "prepare",
        opportunity_kind: "direct_opportunity",
        data_mode: "live",
        source_disclaimer: "搜索发现，待复核",
      },
      {
        title: "Global AI Hackathon Series with Qwen Cloud",
        type: "AI Agent / Qwen Cloud / Devpost Hackathon",
        organizer: "Qwen Cloud / Devpost",
        region: "Global / Online",
        deadline: "2026-07-09 2:00pm PDT",
        reward_or_value: "$70K prizes / cloud resources，待复核",
        eligibility: "个人开发者 / 小团队，需复核官方规则",
        materials_required: "公开代码仓库、Demo 视频、架构说明、项目说明",
        match_reason: "适合把 ChancePing 包装成 AI Opportunity Radar Agent，强调搜索、抽取、评分和报告生成。",
        next_action: "同步评估 Qwen Cloud 赛道与部署要求",
        official_source_url: "https://qwencloud-hackathon.devpost.com/",
        application_url: "https://qwencloud-hackathon.devpost.com/",
        contact_info: "待复核",
        risk_note: "需复核模型、云部署、开源仓库和视频要求。",
        backend_score: 91,
        visible_level: "S",
        status: "new",
        evidence_status: "needs_review",
        action_status: "prepare",
        opportunity_kind: "direct_opportunity",
        data_mode: "live",
        source_disclaimer: "搜索发现，待复核",
      },
      {
        title: "Agentic AI Build Week 2026",
        type: "AI Agent Buildathon",
        organizer: "GenAI Fund / Devpost",
        region: "Vietnam / Southeast Asia",
        deadline: "2026-07-12",
        reward_or_value: "企业命题、合作伙伴资源，待复核",
        eligibility: "AI builder / startup，待复核",
        materials_required: "项目说明、Demo、现场参与安排",
        match_reason: "适合观察东南亚 AI Agent 企业命题，但线下成本较高。",
        next_action: "收藏观察，确认是否值得线下参与",
        official_source_url: "https://agentic-ai-build-week-2026.devpost.com/",
        application_url: "https://agentic-ai-build-week-2026.devpost.com/",
        contact_info: "待复核",
        risk_note: "线下参与成本和资格要求待复核。",
        backend_score: 78,
        visible_level: "A",
        status: "new",
        evidence_status: "needs_review",
        action_status: "prepare",
        opportunity_kind: "direct_opportunity",
        data_mode: "live",
        source_disclaimer: "搜索发现，待复核",
      },
    ] as any,
    radar_type: "custom",
    period_start: "2026-06-27",
    period_end: "2026-07-04",
    generated_at: "2026-07-04T00:00:00.000Z",
    profile: { 用户身份: "大湾区 OPC / AI 产品创业者", 关注机会: "AI 比赛、AI Agent Hackathon、云厂商挑战" },
    candidateAccounting: { rawCount: 66, deduplicatedCount: 54, assessedCount: 18, acceptedCount: 3, rejectedCount: 51 },
  });
  const demoMarkdown = demoReport.markdown || "";
  check("AI event report uses GPT-like daily judgment section", /今日总判断|本轮总判断/.test(demoMarkdown), demoMarkdown.slice(0, 1000));
  check("AI event report includes today's opportunity table", /今日机会总表|机会总表/.test(demoMarkdown) && /TRAE AI 创造力大赛/.test(demoMarkdown), demoMarkdown.slice(0, 1500));
  check("AI event report includes key opportunity details section", /重点机会详解/.test(demoMarkdown) && /Qwen Cloud/.test(demoMarkdown), demoMarkdown.slice(0, 2200));
  const detailHeadings = Array.from(demoMarkdown.matchAll(/^### \d+\. [^\n]+$/gm)).map((match) => match[0].replace(/^### \d+\. [^｜]+｜/, ""));
  check("AI event report does not duplicate opportunity detail headings", new Set(detailHeadings).size === detailHeadings.length, detailHeadings.join(" | "));
  check("AI event report includes demo strategy recommendation", /推荐参赛方案|ChancePing/.test(demoMarkdown), demoMarkdown.slice(0, 2600));
  check("AI event report includes original source section", demoMarkdown.includes("原始来源") && demoMarkdown.includes("qwencloud-hackathon.devpost.com"), demoMarkdown.slice(0, 3200));
  const exclusionLine = demoMarkdown.split("\n").find((line) => line.startsWith("- 排除内容：")) ?? "";
  check("AI event report de-duplicates repeated exclusion labels", (exclusionLine.match(/展会资讯/g) ?? []).length <= 1 && (exclusionLine.match(/培训广告/g) ?? []).length <= 1, exclusionLine);

  const search = await post(app, "/api/search", {
    spec: {
      ...v12.spec,
      confirmation_status: {
        ...(v12.spec.confirmation_status || {}),
        status: "confirmed",
        user_confirmed: true,
        confirmed_at: new Date().toISOString(),
      },
    },
    query: "developer challenge hackathon cloud credits competition application",
    max_results: 2,
  });
  check("confirmed revised radar can search", Array.isArray(search.opportunityCards), "missing cards array");
  check("confirmed revised radar returns opportunity cards", (search.opportunityCards || []).length > 0, `cards=${(search.opportunityCards || []).length}`);
  check("search result keeps radar version strategy", search.searchPlan?.opportunityStrategy?.radarVersion === v12.radarVersion.version, search.searchPlan?.opportunityStrategy?.radarVersion ?? "");
}

run()
  .then(() => {
    if (fail > 0) {
      console.error(`Q.7 AI competition demo: ${pass} PASS / ${fail} FAIL`);
      process.exit(1);
    }
    console.log(`Q.7 AI competition demo: ${pass} PASS / 0 FAIL`);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
