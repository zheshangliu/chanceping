import { createApp } from "../src/api/app";
import { createAppContext } from "../src/api/context";
import { ModelRouter } from "../src/agents/model-router";
import { createDefaultRadar } from "../src/schema/radar";
import { SearchOrchestrator } from "../src/search/orchestrator";
import type { ApiResponse, RadarGenerateResponseData } from "../src/api/types";

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail = ""): void {
  if (condition) {
    passed++;
    console.log(`PASS ${name}`);
  } else {
    failed++;
    console.log(`FAIL ${name}${detail ? ` -> ${detail}` : ""}`);
  }
}

async function generate(description: string): Promise<{ status: number; json: ApiResponse<RadarGenerateResponseData> }> {
  const app = createApp(createAppContext());
  const res = await app.request("/api/radars/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ description }),
  });
  return { status: res.status, json: await res.json() as ApiResponse<RadarGenerateResponseData> };
}

async function main(): Promise<void> {
  process.env.DATA_MODE = "mock";
  process.env.LLM_MODE = "mock";

  const tableTennis = await generate(
    "我是乒乓球选手，想盯未来30天内国内外可报名的乒乓球比赛，优先 ITTF、WTT、中国乒协官网，排除培训广告",
  );
  const data = tableTennis.json.data;
  check("table-tennis generation returns 200", tableTennis.status === 200, `status=${tableTennis.status}`);
  check("table-tennis generation success", tableTennis.json.success === true);
  check("profileSummary exists", !!data?.profileSummary);
  check("profileSummary has identity", !!data?.profileSummary?.identity && data.profileSummary.identity !== "未明确");
  check("profileSummary has target", !!data?.profileSummary?.target && data.profileSummary.target !== "未明确");
  check(
    "profileSummary contains source hints",
    (data?.profileSummary?.sourceHints ?? []).some((item) => /ITTF|WTT|ittf|worldtabletennis|中国乒协/i.test(item)),
  );
  check("requirementConfidence is numeric", typeof data?.requirementConfidence === "number");
  check("questionsToConfirm is array", Array.isArray(data?.questionsToConfirm));
  const summaryText = JSON.stringify(data?.profileSummary ?? {});
  check(
    "profile summary does not leak provider",
    !/provider|source_strategy|scoring_rules|requirement_confidence/i.test(summaryText),
    summaryText,
  );
  check("spec keeps profile version", data?.spec.profile_version === 1, `profile_version=${data?.spec.profile_version}`);
  const tableTennisVersion = (data as unknown as { radarVersion?: Record<string, unknown> })?.radarVersion;
  check("radar version exists", !!tableTennisVersion, JSON.stringify(data ?? {}));
  check("radar version starts at V1.0", tableTennisVersion?.version === "V1.0", JSON.stringify(tableTennisVersion ?? {}));
  check(
    "radar version has executable criteria and source archetypes",
    Array.isArray(tableTennisVersion?.highValueCriteria) &&
      (tableTennisVersion.highValueCriteria as unknown[]).length > 0 &&
      Array.isArray(tableTennisVersion?.prioritySourceArchetypes) &&
      (tableTennisVersion.prioritySourceArchetypes as unknown[]).length > 0 &&
      Array.isArray(tableTennisVersion?.queryFamilies) &&
      (tableTennisVersion.queryFamilies as unknown[]).length > 0,
    JSON.stringify(tableTennisVersion ?? {}),
  );
  check(
    "clear requirement has high confidence",
    (data?.requirementConfidence ?? 0) >= 85,
    `confidence=${data?.requirementConfidence}`,
  );

  const goPlayer = await generate("我是围棋选手");
  const goData = goPlayer.json.data;
  const goText = JSON.stringify(goData ?? {});
  check("go player identity is preserved", goData?.profileSummary?.identity === "围棋选手", goText);
  check(
    "go player short request is not treated as complete",
    (goData?.requirementConfidence ?? 100) < 60,
    `confidence=${goData?.requirementConfidence}`,
  );
  check(
    "go player receives a natural opportunity question",
    (goData?.questionsToConfirm ?? []).some((item) => item.question.includes("你主要想盯哪些围棋机会") && item.question.includes("职业定段赛")),
    JSON.stringify(goData?.questionsToConfirm ?? []),
  );
  check("go player never falls back to RPA", !/RPA|自动化比赛/.test(goText), goText);
  check(
    "confidence distinguishes explicit inferred and missing evidence",
    goData?.spec.requirement_confidence.client_identity.reason.startsWith("用户明确表达") === true &&
      goData?.spec.requirement_confidence.opportunity_type.reason.startsWith("信息缺失") === true &&
      goData?.spec.requirement_confidence.report_format.reason.startsWith("AI 推断") === true,
    JSON.stringify(goData?.spec.requirement_confidence),
  );

  const clarifiedGo = await generate(
    "我是围棋选手，想盯未来30天内国内外可报名的围棋公开赛、职业定段赛和奖金赛事，优先看中国围棋协会官网，排除培训广告",
  );
  const clarifiedGoData = clarifiedGo.json.data;
  check("clarified go requirement can proceed", (clarifiedGoData?.requirementConfidence ?? 0) >= 85);
  check(
    "priority preference does not swallow exclusion clause",
    !(clarifiedGoData?.profileSummary?.priorities ?? []).some((item) => item.includes("排除")),
    JSON.stringify(clarifiedGoData?.profileSummary?.priorities ?? []),
  );
  check(
    "generic named official source is preserved",
    (clarifiedGoData?.profileSummary?.sourceHints ?? []).some((item) => item.includes("中国围棋协会官网")),
    JSON.stringify(clarifiedGoData?.profileSummary?.sourceHints ?? []),
  );

  const clarifiedGoRadar = createDefaultRadar("围棋机会雷达", "custom", clarifiedGoData!.spec);
  const clarifiedGoSearch = await new SearchOrchestrator({
    llmAdapter: new ModelRouter(),
    dataMode: "mock",
    mockContent: true,
  }).search(clarifiedGoRadar.spec);
  const clarifiedGoSearchText = JSON.stringify(clarifiedGoSearch);
  check("go mock search keeps go semantics", /围棋/.test(clarifiedGoSearchText), clarifiedGoSearchText);
  check("go mock search does not use example.com", !/example\.com/.test(clarifiedGoSearchText), clarifiedGoSearchText);
  check("go mock search does not fall back to AI/RPA events", !/RPA|自动化比赛|AI 创新大赛|AI 赛事/.test(clarifiedGoSearchText), clarifiedGoSearchText);
  check(
    "mock cards are explicitly marked as demo data",
    (clarifiedGoSearch.opportunityCards ?? []).length > 0 &&
      (clarifiedGoSearch.opportunityCards ?? []).every((card) =>
        card.is_demo_data === true && /演示|测试数据|未真实核验/.test(`${card.risk_note}${card.source_disclaimer ?? ""}`),
      ),
    JSON.stringify(clarifiedGoSearch.opportunityCards ?? []),
  );
  check(
    "mock cards do not expose fake official source urls",
    (clarifiedGoSearch.opportunityCards ?? []).every((card) => !card.official_source_url || !/example\.com|mock\.chanceping\.local/.test(card.official_source_url)),
    JSON.stringify(clarifiedGoSearch.opportunityCards ?? []),
  );

  const roleMatrix = [
    { description: "我们是研学文旅公司", identity: "研学文旅公司", target: "" },
    { description: "我们帮客户做补贴申报", identity: "补贴申报", target: "" },
    { description: "我们做活动布置", identity: "活动布置", target: "" },
    { description: "我们是婚庆公司", identity: "婚庆公司", target: "" },
    { description: "我们是员工福利公司", identity: "员工福利公司", target: "" },
    { description: "我是一名猎头顾问", identity: "猎头顾问", target: "" },
    { description: "我想找投标机会", identity: "", target: "投标" },
    { description: "我想找客户线索", identity: "", target: "客户线索" },
  ];
  for (const sample of roleMatrix) {
    const generated = await generate(sample.description);
    const sampleData = generated.json.data;
    const sampleText = JSON.stringify(sampleData ?? {});
    check(`${sample.description} generation succeeds`, generated.status === 200 && generated.json.success === true);
    if (sample.identity) {
      check(
        `${sample.description} keeps subject identity`,
        (sampleData?.profileSummary?.identity ?? "").includes(sample.identity),
        sampleText,
      );
    }
    if (sample.target) {
      check(
        `${sample.description} keeps opportunity semantics`,
        (sampleData?.profileSummary?.target ?? "").includes(sample.target),
        sampleText,
      );
    }
    check(`${sample.description} never falls back to a fixed vertical`, !/RPA|自动化比赛|ai_competition/.test(sampleText), sampleText);
    check(
      `${sample.description} asks when key context is missing`,
      (sampleData?.questionsToConfirm ?? []).length > 0 && (sampleData?.requirementConfidence ?? 100) < 85,
      `confidence=${sampleData?.requirementConfidence}, questions=${JSON.stringify(sampleData?.questionsToConfirm ?? [])}`,
    );
  }

  const studyTour = await generate(
    "我们是研学文旅公司，想找有研学需求的国企单位和企业，看看能否接到研学订单，优先广东和大湾区，排除纯招聘信息",
  );
  const studyText = JSON.stringify(studyTour.json.data ?? {});
  check("study-tour generation succeeds", studyTour.status === 200 && studyTour.json.success === true);
  check("study-tour profile is not AI competition", !/AI赛事|AI 赛事|ai_competition/.test(studyText));
  check("study-tour profile keeps business lead semantics", /研学|文旅|国企|企业|客户|线索|订单/.test(studyText), studyText);

  const b2bSaasDescription = "我们是一家 B2B SaaS 公司，准备出海东南亚，想找当地展会、创业扶持、渠道合作、政府招商和潜在代理商线索。";
  const b2bSaas = await generate(b2bSaasDescription);
  const b2bData = b2bSaas.json.data;
  const b2bVersion = (b2bSaas.json.data as unknown as { radarVersion?: Record<string, unknown> })?.radarVersion;
  const b2bVersionText = JSON.stringify(b2bVersion ?? {});
  check("B2B SaaS generates radar V1.0", b2bVersion?.version === "V1.0", b2bVersionText);
  check("B2B SaaS radar positions around SEA SaaS outbound", /B2B SaaS|东南亚|出海/.test(String(b2bVersion?.oneSentencePositioning ?? "")), b2bVersionText);
  check("B2B SaaS profile keeps Southeast Asia region", /东南亚|ASEAN|Southeast/i.test(String(b2bData?.profileSummary?.regionsAndTime ?? "")), JSON.stringify(b2bData?.profileSummary ?? {}));
  check("B2B SaaS clarification does not ask user to repeat region", !(b2bData?.questionsToConfirm?.[0]?.question ?? "").includes("地区和时间范围"), JSON.stringify(b2bData?.questionsToConfirm ?? []));
  check(
    "B2B SaaS radar requires contactable opportunities",
    /联系人|报名入口|合作入口|商务配对|表单|邮箱/.test(b2bVersionText),
    b2bVersionText,
  );

  const retailRevision = await generate(`${b2bSaasDescription}\n\n[用户补充回答]\n不准，我不是泛 SaaS，我是 B2B 商品交易 SaaS，我想找零售行业机会。`);
  const retailData = retailRevision.json.data;
  const retailVersion = (retailData as unknown as { radarVersion?: Record<string, unknown> })?.radarVersion;
  const retailText = JSON.stringify(retailVersion ?? {});
  check("retail feedback upgrades radar to V1.1", retailVersion?.version === "V1.1", retailText);
  check("retail feedback updates executable spec semantics", /零售|商品交易|retail/i.test(JSON.stringify(retailData?.spec?.opportunity_scope?.primary_opportunity_types ?? [])) && /零售|商品交易|retail/i.test(String(retailData?.profileSummary?.target ?? "")), JSON.stringify({ target: retailData?.profileSummary?.target, types: retailData?.spec?.opportunity_scope?.primary_opportunity_types }));
  check("retail suggested radar name avoids glued opportunity labels", !/渠道合作零售客户/.test(String(retailData?.suggestedName ?? "")), String(retailData?.suggestedName ?? ""));
  check("retail V1.1 keeps commodity trading SaaS positioning", /商品交易|零售|retail/i.test(String(retailVersion?.oneSentencePositioning ?? "")), retailText);
  check("retail V1.1 lowers fintech AI generic tech", /降低|降权/.test(retailText) && /FinTech|AI|泛科技/.test(retailText), retailText);
  check("retail V1.1 raises retail FMCG distributor semantics", /零售|FMCG|商超|便利店|POS|ERP|供应链|B2B marketplace/i.test(retailText), retailText);
  check(
    "retail V1.1 source archetypes include retail-specific sources",
    /retail association|supermarket association|convenience store association|FMCG association|wholesaler association|distributor directory|retail trade fair|supplier portal|B2B marketplace|POS\/ERP partner directory/i.test(retailText),
    retailText,
  );
  check(
    "retail V1.1 query families include supplier and partner searches",
    /retail trade show|FMCG distributor|supermarket supplier registration|convenience store supplier portal|retail digital transformation grant|POS reseller partner|wholesale marketplace partner/i.test(retailText),
    retailText,
  );
  check(
    "retail V1.1 result buckets include lead subtypes",
    /channel_partner_lead|retail_customer_lead|association_directory/.test(retailText),
    retailText,
  );

  const retailRadar = createDefaultRadar("零售商品交易雷达", "custom", retailData!.spec);
  const retailSearch = await new SearchOrchestrator({
    llmAdapter: new ModelRouter(),
    dataMode: "mock",
    mockContent: true,
  }).search(retailRadar.spec);
  const retailSearchText = JSON.stringify(retailSearch.searchPlan ?? {});
  check("retail search planner consumes radar version source archetypes", /retail association|supplier portal|distributor directory|POS\/ERP|FMCG|supermarket/i.test(retailSearchText), retailSearchText);
  check("retail search planner emits retail query families", /retail trade show|supermarket supplier registration|wholesale marketplace partner|POS reseller partner/i.test(retailSearchText), retailSearchText);

  const customRadar = createDefaultRadar("测试自定义雷达", "custom");
  const customSearch = await new SearchOrchestrator({
    llmAdapter: new ModelRouter(),
    dataMode: "mock",
    mockContent: true,
  }).search(customRadar.spec);
  check("custom radar mock search returns opportunities", customSearch.opportunities.length > 0, `len=${customSearch.opportunities.length}`);
  check("custom radar mock search returns cards", (customSearch.opportunityCards?.length ?? 0) > 0, `len=${customSearch.opportunityCards?.length ?? 0}`);

  const legacyCustomRadar = createDefaultRadar("历史兼容自定义雷达", "custom", {
    radar_type: "ai_competition",
    core_keywords: ["AI", "赛事"],
  } as never);
  const legacySearch = await new SearchOrchestrator({
    llmAdapter: new ModelRouter(),
    dataMode: "mock",
    mockContent: true,
  }).search(legacyCustomRadar.spec, "AI比赛");
  check("legacy partial custom spec still returns opportunities", legacySearch.opportunities.length > 0, `len=${legacySearch.opportunities.length}`);
  check("legacy partial custom spec still returns cards", (legacySearch.opportunityCards?.length ?? 0) > 0, `len=${legacySearch.opportunityCards?.length ?? 0}`);

  console.log(`chat MVP contract: ${passed} PASS / ${failed} FAIL`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
