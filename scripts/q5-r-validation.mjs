import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { GOLDEN_CASES } from "./golden-20-browser-baseline.mjs";

export const GOLDEN8_IDS = [3, 4, 8, 9, 11, 13, 19, 20];
export const DEFAULT_RANDOM10_LIVE_IDS = [2, 4, 5, 8, 10];

export const POST_Q5_MANUAL_QUALITY_AUDIT = {
  1: ["部分通过", "IGF 属于有效观察来源，但电竞赛事与 Google Calendar 明显偏离围棋机会。"],
  2: ["部分通过", "ITTF 官方程序、日历和新闻可信，但没有稳定落到当前可报名的具体赛事入口。"],
  3: ["部分通过", "酒店婚礼服务可作渠道线索，Vogue 趋势页属于参考案例，尚未形成明确客户需求。"],
  4: ["部分通过", "招聘平台、采购系统上线通知和广交会 FAQ 与员工福利采购目标相关性不足。"],
  5: ["强通过", "包含 2026 文旅机构征集和长隆研学项目合作意向，能形成当周核验与联系动作。"],
  6: ["强通过", "命中广东科技项目官方申报通知，来源和申报动作明确。"],
  7: ["部分通过", "只有一条学生向 AI Hackathon，覆盖窄且与 AI 创业者主体存在资格匹配风险。"],
  8: ["部分通过", "招聘职位可作猎头线索，但以招聘平台和泛资讯为主，缺少公司官网与扩张信号闭环。"],
  9: ["部分通过", "文创比赛方向相关，但多为 2025 历史页面或二级聚合来源。"],
  10: ["强通过", "出现活动搭建集中采购直接项目，可支持当周核验；同时仍混有展会信息和参展流程噪声。"],
  11: ["强通过", "包含品牌影像大赛和摄影征集相关入口，具备投稿或进一步核验价值。"],
  12: ["部分通过", "跨境平台招商方向正确，但前三项集中在 2025 活动，时效性不足。"],
  13: ["强通过", "亚洲宠物展及官方展商申请属于明确参展入口。"],
  14: ["强通过", "独立游戏比赛、Game Jam 和 Epic MegaGrants 均能形成报名或申请动作。"],
  15: ["部分通过", "机构联系页和学生赛事不能直接证明招生、课程采购或学校合作需求。"],
  16: ["强通过", "2026 加盟展与市集摊位招募可形成参展动作，但仍有跨行业赛事噪声。"],
  17: ["部分通过", "出现无关设备间项目和通用采购通知，绿色工厂政策更多是观察信号而非设备订单。"],
  18: ["强通过", "2026/2027 奖学金申请属于大学生可直接核验和准备材料的机会。"],
  19: ["强通过", "2026 新加坡科技展会适合 SaaS 出海获客，但 Facebook 来源仍需降权。"],
  20: ["强通过", "2026/2027 文创与手工艺展可用于销售和曝光，但 Indeed 职位属于明显噪声。"],
};

export const RANDOM10_CASES = [
  { id: 1, input: "我们是宠物殡葬服务公司，想找合作和曝光机会。", identityTerms: ["宠物殡葬", "宠物善终", "宠物纪念"], strategyTerms: ["宠物", "殡葬", "善终", "医院", "纪念", "合作"] },
  { id: 2, input: "我们是工业除尘设备公司，想找环保项目招标和园区改造机会。", identityTerms: ["工业除尘", "除尘设备"], strategyTerms: ["除尘", "环保", "园区", "招标", "采购", "改造"] },
  { id: 3, input: "我们是养老院运营服务商，想找政府购买服务、康养合作和机构采购机会。", identityTerms: ["养老院", "养老", "康养"], strategyTerms: ["养老", "康养", "政府购买", "采购", "民政"] },
  { id: 4, input: "我们是新能源充电桩安装公司，想找物业、园区、商场和政府项目机会。", identityTerms: ["充电桩", "新能源"], strategyTerms: ["充电桩", "物业", "园区", "商场", "政府", "安装"] },
  { id: 5, input: "我们是企业心理咨询服务商，想找企业 EAP、工会福利和员工关怀采购机会。", identityTerms: ["心理咨询", "EAP"], strategyTerms: ["EAP", "心理", "工会", "员工关怀", "采购", "福利"] },
  { id: 6, input: "我们是城市露营装备品牌，想找渠道商、市集、户外展和品牌联名机会。", identityTerms: ["露营装备", "露营", "户外"], strategyTerms: ["露营", "户外展", "渠道", "市集", "联名"] },
  { id: 7, input: "我们是校园团餐供应商，想找学校食堂、团餐采购和供应商入库机会。", identityTerms: ["校园团餐", "团餐"], strategyTerms: ["学校食堂", "团餐", "采购", "供应商", "入库"] },
  { id: 8, input: "我们是民宿运营公司，想找文旅活动、OTA 平台活动和景区合作机会。", identityTerms: ["民宿运营", "民宿"], strategyTerms: ["民宿", "文旅", "OTA", "景区", "合作"] },
  { id: 9, input: "我们是低空无人机巡检服务公司，想找园区、能源、电力、应急和政府采购机会。", identityTerms: ["无人机巡检", "低空无人机"], strategyTerms: ["无人机", "巡检", "电力", "能源", "应急", "政府采购"] },
  { id: 10, input: "我们是二手奢侈品寄售店，想找买手店合作、商场快闪和平台入驻机会。", identityTerms: ["二手奢侈品", "奢侈品寄售"], strategyTerms: ["奢侈品", "寄售", "买手店", "商场", "快闪", "入驻"] },
];

const KEY_SEMANTIC_TYPES = new Set([
  "direct_opportunity",
  "business_lead",
  "channel_partner_lead",
  "customer_lead",
]);
const PRESET_LEAK_RE = /RPA|AI\s*赛事|AI\s*比赛|乒乓球|围棋选手/;

function escapeCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\n+/g, " ").trim();
}

function yesNo(value) {
  return value ? "是" : "否";
}

async function postJson(baseUrl, path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json.success !== true) {
    throw new Error(json.error?.message || `${path} failed (${response.status})`);
  }
  return json.data;
}

function summarizeSearch(data) {
  const rawCandidates = Array.isArray(data?.rawCandidates) ? data.rawCandidates : [];
  const cards = Array.isArray(data?.opportunityCards) ? data.opportunityCards : [];
  const keySemanticCandidates = rawCandidates.filter((item) => KEY_SEMANTIC_TYPES.has(item.semanticType));
  const businessLeadRaw = rawCandidates.filter((item) => ["business_lead", "channel_partner_lead", "customer_lead"].includes(item.semanticType));
  const acceptedBusinessLead = cards.filter((item) => ["business_lead", "channel_partner_lead", "customer_lead"].includes(item.opportunity_kind));
  const rejectedReasons = rawCandidates
    .filter((item) => item.status === "rejected" || item.qualityStatus === "low_action")
    .map((item) => item.qualityReason || "rejected")
    .filter(Boolean);
  const reasonCounts = new Map();
  for (const reason of rejectedReasons) reasonCounts.set(reason, (reasonCounts.get(reason) || 0) + 1);
  const rejectedReasonTop3 = [...reasonCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([reason, count]) => `${reason} (${count})`);
  return {
    rawCandidateCount: Number(data?.candidateAccounting?.rawCount ?? data?.total_raw ?? rawCandidates.length),
    keySemanticCandidateCount: keySemanticCandidates.length,
    rulePassedCount: Number(data?.total_rule_passed ?? 0),
    acceptedCardCount: Number(data?.candidateAccounting?.acceptedCount ?? cards.length),
    rejectedReasonTop3,
    businessLeadRejectedCount: Math.max(0, businessLeadRaw.length - acceptedBusinessLead.length),
    sourceArchetypeNormalized: [...new Set(rawCandidates.map((item) => item.sourceArchetype).filter(Boolean))],
    semanticBuckets: [...new Set(rawCandidates.map((item) => item.semanticType).filter(Boolean))],
    directOpportunity: cards.some((item) => item.opportunity_kind === "direct_opportunity"),
    actionableLead: cards.some((item) => ["business_lead", "channel_partner_lead", "customer_lead"].includes(item.opportunity_kind)),
    leadMarkedForReview: cards
      .filter((item) => ["business_lead", "channel_partner_lead", "customer_lead"].includes(item.opportunity_kind))
      .every((item) => /待复核|需联系确认|搜索发现/.test(`${item.source_disclaimer || ""} ${item.risk_note || ""} ${item.next_action || ""}`)),
    runOutcome: data?.runOutcome,
    cardTitles: cards.slice(0, 5).map((item) => item.title),
  };
}

export async function runGolden8Diagnostics(baseUrl) {
  const diagnostics = [];
  for (const id of GOLDEN8_IDS) {
    const item = GOLDEN_CASES.find((entry) => entry.id === id);
    if (!item) continue;
    try {
      const description = item.answer ? `${item.input}\n用户补充：${item.answer}` : item.input;
      const generated = await postJson(baseUrl, "/api/radars/generate", { description });
      const search = await postJson(baseUrl, "/api/search", {
        spec: generated.spec,
        query: description,
        search_mode: "live",
      });
      diagnostics.push({ id, ok: true, ...summarizeSearch(search) });
    } catch (error) {
      diagnostics.push({ id, ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return diagnostics;
}

export async function runRandom10Validation(baseUrl, options = {}) {
  const liveIds = new Set(options.liveIds ?? DEFAULT_RANDOM10_LIVE_IDS);
  const results = [];
  for (const item of RANDOM10_CASES) {
    const result = { id: item.id, input: item.input, liveSelected: liveIds.has(item.id) };
    try {
      const generated = await postJson(baseUrl, "/api/radars/generate", { description: item.input });
      const radarVersion = generated.radarVersion ?? generated.spec?.radar_version ?? {};
      const sourceArchetypes = Array.isArray(radarVersion.prioritySourceArchetypes) ? radarVersion.prioritySourceArchetypes : [];
      const queryFamilies = Array.isArray(radarVersion.queryFamilies) ? radarVersion.queryFamilies : [];
      const strategyText = JSON.stringify({
        profileSummary: generated.profileSummary,
        targetUser: radarVersion.targetUser,
        opportunityIntents: radarVersion.opportunityIntents,
        sourceArchetypes,
        queryFamilies,
      });
      result.requirementConfidence = generated.requirementConfidence;
      result.question = generated.questionsToConfirm?.[0]?.question || "";
      result.identityOk = item.identityTerms.some((term) => strategyText.includes(term));
      result.industryStrategyOk = item.strategyTerms.filter((term) => strategyText.toLowerCase().includes(term.toLowerCase())).length >= 2;
      result.noPresetLeakage = !PRESET_LEAK_RE.test(strategyText);
      result.sourceArchetypes = sourceArchetypes;
      result.queryFamilies = queryFamilies.map((family) => ({
        familyName: family.familyName,
        sourceArchetype: family.sourceArchetype,
        intentType: family.intentType,
        queries: family.queries,
      }));
      result.strategyPassed = result.identityOk
        && result.industryStrategyOk
        && result.noPresetLeakage
        && sourceArchetypes.length >= 2
        && queryFamilies.length >= 2
        && queryFamilies.some((family) => Array.isArray(family.queries) && family.queries.length >= 2);
      if (result.liveSelected && result.strategyPassed) {
        const search = await postJson(baseUrl, "/api/search", {
          spec: generated.spec,
          query: item.input,
          search_mode: "live",
        });
        result.search = summarizeSearch(search);
        result.liveStatus = result.search.rulePassedCount > 0 && result.search.acceptedCardCount > 0
          ? "通过"
          : result.search.rawCandidateCount === 0 || result.search.runOutcome?.status !== "succeeded"
            ? "环境/无结果，未证伪泛化"
            : "未通过：相关候选仍被全部挡住";
      } else {
        result.liveStatus = result.liveSelected ? "策略未通过，未执行搜索" : "未选择 live 搜索";
      }
    } catch (error) {
      result.strategyPassed = false;
      result.error = error instanceof Error ? error.message : String(error);
    }
    results.push(result);
  }
  return results;
}

export function buildGolden8Report(browserResults, diagnostics) {
  const browserById = new Map(browserResults.map((item) => [item.id, item]));
  const diagnosticsById = new Map(diagnostics.map((item) => [item.id, item]));
  const rows = GOLDEN8_IDS.map((id) => ({ browser: browserById.get(id) ?? { id }, diagnostic: diagnosticsById.get(id) ?? { id } }));
  const trustFailures = rows.filter(({ browser }) => browser.keyLeak || browser.mockFallback || browser.overclaim).length;
  const actionableCount = rows.filter(({ browser, diagnostic }) =>
    browser.searchRelevant && browser.cardsActionable && browser.cardCount > 0 && diagnostic.acceptedCardCount > 0,
  ).length;
  const gatePassed = rows.length === 8 && actionableCount >= 6 && trustFailures === 0;
  const lines = [
    "# Golden 8 Q.5 Live Regression Report",
    "",
    `生成时间：${new Date().toISOString()}`,
    "",
    "## 1. 验收结论",
    "",
    `- 有可信行动卡的案例：${actionableCount}/8（闸门：至少 6/8）。`,
    `- 可信度底线失败：${trustFailures}。`,
    `- Golden 8 闸门：${gatePassed ? "通过" : "未通过"}。`,
    "- 说明：真实无结果不强行凑卡；单个案例 acceptedCardCount 为 0 不自动判产品失败，但不会计入 6/8 行动质量目标。",
    "",
    "## 2. 候选漏斗与浏览器主链路",
    "",
    "| # | 浏览器结果 | rawCandidateCount | keySemanticCandidateCount | rulePassedCount | acceptedCardCount | direct | actionable lead | 线索待复核 | 卡片可行动 | 保存 | 复跑 | 第二报告 | rejectedReasonTop3 |",
    "|---:|---|---:|---:|---:|---:|---|---|---|---|---|---|---|---|",
    ...rows.map(({ browser, diagnostic }) => `| ${browser.id} | ${escapeCell(browser.status || browser.failureReason || "未运行")} | ${diagnostic.rawCandidateCount ?? 0} | ${diagnostic.keySemanticCandidateCount ?? 0} | ${diagnostic.rulePassedCount ?? 0} | ${diagnostic.acceptedCardCount ?? browser.cardCount ?? 0} | ${yesNo(diagnostic.directOpportunity)} | ${yesNo(diagnostic.actionableLead)} | ${yesNo(diagnostic.leadMarkedForReview)} | ${yesNo(browser.cardsActionable)} | ${yesNo(browser.saved)} | ${yesNo(browser.rerunSuccess)} | ${yesNo(browser.secondReport)} | ${escapeCell((diagnostic.rejectedReasonTop3 || []).join("；") || diagnostic.error || "无")} |`),
    "",
    "## 3. 判断",
    "",
    gatePassed
      ? "- 可以进入 Random 10 泛化闸门；这只表示 Q.5 的旧弱项复测达标，不代表 Golden 20 已通过。"
      : "- 不进入 Golden 20；先根据漏斗定位画像、策略、查询、Provider、准入或报告层问题。",
  ];
  return lines.join("\n");
}

export function buildRandom10Report(results) {
  const strategyPassed = results.filter((item) => item.strategyPassed).length;
  const selected = results.filter((item) => item.liveSelected);
  const livePassed = selected.filter((item) => item.liveStatus === "通过").length;
  const hardFailures = selected.filter((item) => /未通过|策略未通过/.test(item.liveStatus || "")).length;
  const gatePassed = results.length === 10 && strategyPassed >= 8 && hardFailures === 0 && livePassed >= 3;
  return [
    "# Random 10 Q.5 Generalization Report",
    "",
    `生成时间：${new Date().toISOString()}`,
    "",
    "## 1. 验收结论",
    "",
    "- 本轮从原始输入调用真实 LLM（commercial / DeepSeek）生成 RadarVersionSpec，不向测试预填 sourceArchetypes 或 queryFamilies。",
    `- 策略生成通过：${strategyPassed}/10（闸门：至少 8/10）。`,
    `- 代表性 live 搜索通过：${livePassed}/${selected.length}（闸门：至少 3 个通过且无“相关候选全部被挡”）。`,
    `- Random 10 泛化闸门：${gatePassed ? "通过" : "未通过"}。`,
    "",
    "## 2. 逐项结果",
    "",
    "| # | 原始输入 | 身份保留 | 行业策略 | 无预置泄漏 | sourceArchetypes | queryFamilies | 策略结果 | live 结果 |",
    "|---:|---|---|---|---|---:|---:|---|---|",
    ...results.map((item) => `| ${item.id} | ${escapeCell(item.input)} | ${yesNo(item.identityOk)} | ${yesNo(item.industryStrategyOk)} | ${yesNo(item.noPresetLeakage)} | ${escapeCell((item.sourceArchetypes || []).slice(0, 6).join("、"))} | ${(item.queryFamilies || []).length} | ${item.strategyPassed ? "通过" : "未通过"} | ${escapeCell(item.liveStatus || item.error || "未运行")} |`),
    "",
    "## 3. 泛化判断",
    "",
    gatePassed
      ? "- 没有发现依赖 Golden 20 行业模板才能生成策略的证据，可以进入 Golden 20 全量复跑。"
      : "- 暂不进入 Golden 20；优先检查原始需求到 RadarVersionSpec 的行业机会策略生成。",
  ].join("\n");
}

export function buildPostQ5ManualQualityAudit(results) {
  const rows = results
    .slice()
    .sort((a, b) => a.id - b.id)
    .map((item) => {
      const [status, reason] = POST_Q5_MANUAL_QUALITY_AUDIT[item.id] ?? ["未复核", "缺少人工复核记录。"];
      return { ...item, manualStatus: status, manualReason: reason };
    });
  const strong = rows.filter((item) => item.manualStatus === "强通过").length;
  const partial = rows.filter((item) => item.manualStatus === "部分通过").length;
  const failed = rows.filter((item) => item.manualStatus === "失败").length;
  return [
    "## 10. 人工行动价值复核（覆盖自动化结论）",
    "",
    `- 人工强通过：${strong}/20。`,
    `- 人工部分通过：${partial}/20。`,
    `- 人工失败：${failed}/20。`,
    "- 结论：自动化主链路通过，但人工行动价值未达到强通过 >= 15 的 Q 门槛。暂不进入 N/O，也不建议上阿里云测试站。",
    "- 说明：人工复核依据每个案例保存的前三个机会标题、来源类型和用户目标；完整字段与截止时间仍需后续逐页复核。",
    "- 测试配置：全程最多 5 个主题、15 条 query；为控制重复评分耗时，主要批次每条 query 最多取 2 条结果、精读 1 个最高优先级 URL。Golden 8 早期 #3/#4 使用了产品默认的每 query 5 条上限，因此卡片数量不用于跨案例排名。",
    "- 数据批次：Golden 20 的 #3/#4/#8/#9/#11/#13/#19/#20 复用同日同版本的 Golden 8 完整浏览器结果，其余 12 个案例使用新的隔离数据目录运行。",
    "",
    "| # | 自动结果 | 人工结果 | 前三项 | 人工判断 |",
    "|---:|---|---|---|---|",
    ...rows.map((item) => `| ${item.id} | ${escapeCell(item.status)} | ${item.manualStatus} | ${escapeCell((item.cardTitles || []).join("；"))} | ${escapeCell(item.manualReason)} |`),
    "",
    "### 主要问题",
    "",
    "1. Q.5 已消除长短语误杀，但语义分桶候选几乎全部通过 ruleFilter，缺少行业实体和目标对象的二次相关性约束。",
    "2. 当前自动判定只要标题含报名、合作、采购、联系等行动词就容易视为可行动，无法识别‘动作存在但不是这个用户的动作’。",
    "3. 时间窗口约束偏弱，2025 历史活动仍进入 2026 年的重点卡片。",
    "4. source archetype 生成较好，但候选实际来源没有稳定服从来源类型，例如招聘平台、媒体文章、通用联系页会替代官方采购或合作入口。",
    "5. 下一阶段应是 Q.6：Candidate Relevance Judge，而不是 N/O；重点做画像实体匹配、目标对象匹配、时效性和来源类型一致性。",
  ].join("\n");
}

export async function writeReport(file, markdown) {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${markdown.trim()}\n`, "utf-8");
  return file;
}

export async function loadJsonResults(file) {
  const parsed = JSON.parse(await readFile(file, "utf-8"));
  return Array.isArray(parsed) ? parsed : parsed.results ?? [];
}
