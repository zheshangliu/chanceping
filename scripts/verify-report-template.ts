import { generateRadarReport } from "../src/agents/radar-report-generator";
import fs from "fs";
import path from "path";

const spec: any = {
  product_name: "ChancePing",
  product_category: "机会雷达",
  client_profile: {
    client_name: "测试客户",
    client_type: "个人",
    industry: "体育",
    business_type: "乒乓球选手",
    products_or_projects: ["个人参赛"],
    target_users: ["自己"],
    core_capabilities: ["乒乓球"],
    current_assets: [],
    regions: ["中国", "国际"],
    notes: "",
  },
  core_goals: {
    primary_goal: "寻找可报名乒乓球赛事",
    secondary_goals: [],
    success_definition: "找到可报名且来源真实的比赛",
    action_intent: ["报名比赛"],
    priority_order: ["可报名", "权威来源"],
  },
  opportunity_scope: {
    primary_opportunity_types: ["乒乓球比赛"],
    secondary_opportunity_types: ["公开赛"],
    excluded_opportunity_types: ["培训广告"],
    must_have_conditions: ["可报名"],
    nice_to_have_conditions: [],
  },
  region_scope: {
    primary_regions: ["中国"],
    secondary_regions: ["国际"],
    excluded_regions: [],
    global_allowed: true,
    overseas_allowed: true,
  },
  keyword_strategy: {
    core_keywords_zh: ["乒乓球", "比赛", "报名"],
    core_keywords_en: ["table tennis", "entry"],
    expanded_keywords_zh: [],
    expanded_keywords_en: [],
    negative_keywords: ["培训广告"],
  },
  source_strategy: {
    official_sites: [],
    platforms: [],
    search_engines: [],
    social_media: [],
    rss_sources: [],
    manual_sources: ["中国乒协官网"],
    source_priority: ["ITTF", "中国乒协官网"],
    sources_used_in_report: [],
    user_supplied_sources: [
      {
        source_name: "ITTF",
        source_url: "https://www.ittf.com/",
        added_at: "2026-06-30T00:00:00.000Z",
        contributed_by: "user",
      },
    ],
    source_transparency_enabled: true,
  },
  filter_rules: {
    must_include: ["报名"],
    must_exclude: ["广告"],
    low_priority_signals: [],
    high_priority_signals: ["官方"],
    requires_manual_review: [],
  },
  scoring_rules: {
    backend_score_enabled: true,
    visible_level_enabled: true,
    weights: { match_score: 30, business_value: 25, timeliness: 20, credibility: 15, actionability: 10, risk_penalty: -20 },
    visible_level_mapping: { S: "90-100", A: "80-89", B: "65-79", C: "50-64", D: "0-49", hidden: "不展示" },
    level_definitions: { S: "强烈推荐", A: "高价值", B: "可关注", C: "低优先级", D: "不推荐", hidden: "不展示" },
  },
  report_requirements: {
    report_format: "markdown",
    report_title_prefix: "机会雷达报告",
    report_frequency: "weekly",
    max_items_per_report: 10,
    min_items_per_report: 1,
    must_include_sections: [],
    opportunity_card_required_fields: [],
    link_required: true,
    contact_required_if_available: false,
    deadline_required_if_available: true,
  },
  requirement_confidence: {
    total: 100,
    client_identity: { score: 100, weight: 15, reason: "" },
    business_goal: { score: 100, weight: 20, reason: "" },
    opportunity_type: { score: 100, weight: 20, reason: "" },
    region_scope: { score: 100, weight: 10, reason: "" },
    exclusion_rules: { score: 100, weight: 10, reason: "" },
    action_scenario: { score: 100, weight: 15, reason: "" },
    report_format: { score: 100, weight: 10, reason: "" },
  },
  questions_to_confirm: [],
  confirmation_status: {
    status: "confirmed",
    user_confirmed: true,
    confirmed_at: "2026-06-30",
    last_user_feedback: "",
    revision_count: 0,
  },
};

const result = generateRadarReport({
  spec,
  radar_type: "ai_competition",
  period_start: "2026-06-24",
  period_end: "2026-06-30",
  sourceHintChecks: [
    {
      sourceName: "ITTF",
      sourceUrl: "https://www.ittf.com/",
      status: "checked",
      resultCount: 1,
    },
    {
      sourceName: "中国乒协官网",
      sourceUrl: "",
      status: "name_only",
      resultCount: 0,
    },
  ] as any,
  candidateAccounting: {
    rawCount: 8,
    deduplicatedCount: 5,
    assessedCount: 3,
    acceptedCount: 1,
    rejectedCount: 2,
  },
  opportunities: [
    {
      id: "opp-test",
      title: "测试乒乓球公开赛",
      type: "乒乓球比赛",
      deadline: "2026-07-15",
      visible_level: "A",
      status: "new",
      match_reason: "报名窗口仍开放，适合个人选手。",
      official_source_url: "https://www.ittf.com/",
      next_action: "查看报名要求",
      opportunity_kind: "direct_opportunity",
      evidence_status: "needs_review",
      action_status: "act_now",
    } as any,
    {
      id: "opp-channel",
      title: "东南亚零售 POS 渠道伙伴线索",
      type: "渠道合作线索",
      visible_level: "B",
      status: "new",
      deadline: "",
      match_reason: "搜索发现渠道伙伴页面，尚未确认合作意向。",
      official_source_url: "https://partners.example.org/pos-reseller",
      next_action: "联系确认合作机制",
      opportunity_kind: "channel_partner_lead",
      evidence_status: "needs_review",
      action_status: "prepare",
      data_mode: "live",
      source_disclaimer: "搜索发现，需联系确认，待复核。",
    } as any,
    {
      id: "opp-customer",
      title: "商超供应商注册潜在客户线索",
      type: "潜在客户线索",
      visible_level: "B",
      status: "new",
      deadline: "",
      match_reason: "搜索发现供应商入口，尚未确认采购需求。",
      official_source_url: "https://buyers.example.org/supplier-registration",
      next_action: "联系确认真实需求",
      opportunity_kind: "customer_lead",
      evidence_status: "needs_review",
      action_status: "prepare",
      data_mode: "live",
      source_disclaimer: "搜索发现，需联系确认，待复核。",
    } as any,
  ],
  rawCandidates: [
    {
      id: "raw-directory",
      query: "零售协会会员目录",
      title: "东南亚零售协会会员目录",
      url: "https://association.example.org/members",
      sourceDomain: "association.example.org",
      sourceType: "web",
      status: "raw",
      semanticType: "association_directory",
      qualityStatus: "unknown",
      qualityReason: "会员目录本身不是已确认机会",
    },
  ],
});

const md = result.markdown || "";
const required = [
  "# ChancePing｜本周机会雷达报告",
  "## 1. 雷达画像",
  "## 2. 本周一句话判断",
  "## 3. S / A / B 级机会总览",
  "## 4. 机会详情卡片",
  "## 5. 本周行动清单",
  "## 6. 不建议投入或需复核的机会",
  "## 7. 来源与检查回执",
  "## 8. 报告行动层",
  "## 9. 下周继续追踪",
  "decision:",
  "recommended_angle:",
  "material_gaps:",
  "next_actions:",
  "risk_notes:",
  "monitoring_keywords:",
  "模型判断",
  "待复核",
  "指定信号源",
  "本轮重点检查来源",
  "中国乒协官网",
  "测试乒乓球公开赛",
  "https://www.ittf.com/",
  "机会类型",
  "证据状态",
  "行动状态",
  "rawCount",
  "渠道伙伴线索：先核对伙伴覆盖地区、产品适配和合作机制",
  "潜在客户线索：先验证真实需求、采购窗口和决策路径",
  "协会目录：先建立目标名单，再逐个寻找公开联系入口",
];

const emptyResult = generateRadarReport({
  spec,
  radar_type: "custom",
  period_start: "2026-06-24",
  period_end: "2026-06-30",
  sourceHintChecks: [
    {
      sourceName: "ITTF",
      sourceUrl: "https://www.ittf.com/",
      status: "checked_no_results",
      resultCount: 0,
    },
  ] as any,
  candidateAccounting: {
    rawCount: 3,
    deduplicatedCount: 3,
    assessedCount: 3,
    acceptedCount: 0,
    rejectedCount: 3,
  },
  rawCandidates: [
    {
      id: "raw-watch-1",
      query: "跨境电商 seller program",
      title: "Shopee 2025 本地化履约业务招商大会",
      url: "https://seller.example.org/shopee-local-fulfillment",
      sourceDomain: "seller.example.org",
      sourceType: "web",
      status: "raw",
      semanticType: "watch_signal",
      qualityStatus: "unknown",
      qualityReason: "报名信息疑似过期，需下轮复核平台入口",
    },
    {
      id: "raw-watch-2",
      query: "marketplace seller registration",
      title: "Amazon Global Selling 开店入口",
      url: "https://sell.amazon.example.org/global-selling",
      sourceDomain: "sell.amazon.example.org",
      sourceType: "web",
      status: "raw",
      semanticType: "business_lead",
      qualityStatus: "unknown",
      qualityReason: "卖家入口存在，但未形成本轮重点卡",
    },
  ] as any,
  opportunities: [],
});

const profileFieldResult = generateRadarReport({
  spec: {
    ...spec,
    core_goals: {
      ...spec.core_goals,
      priority_order: ["未来60天内", "权威来源"],
    },
  },
  radar_type: "custom",
  period_start: "2026-06-24",
  period_end: "2026-06-30",
  profile: {
    地域范围: "中国、国际；找到可报名且来源真实的比赛",
    时间范围: "中国、国际；找到可报名且来源真实的比赛",
  },
  opportunities: [],
});

const emptyMd = emptyResult.markdown || "";
const profileFieldMd = profileFieldResult.markdown || "";
const reportGenerator = fs.readFileSync(
  path.resolve(process.cwd(), "src/agents/radar-report-generator.ts"),
  "utf-8",
);

let failed = 0;
for (const token of required) {
  if (!md.includes(token)) {
    failed++;
    console.log(`FAIL missing ${token}`);
  }
}
if (!reportGenerator.includes("candidateAccounting")) {
  failed++;
  console.log("FAIL report statistics are not wired to CandidateAccounting");
}
if (!emptyMd.includes("本轮没有发现足够匹配、可行动的机会。")) {
  failed++;
  console.log("FAIL empty report missing no-result statement");
}
if (!emptyMd.includes("放宽地区") || !emptyMd.includes("保存为长期雷达继续监控")) {
  failed++;
  console.log("FAIL empty report missing actionable suggestions");
}
if (!emptyMd.includes("| 来源 | 状态 | 结果数 | 说明 |")) {
  failed++;
  console.log("FAIL empty report missing source coverage table");
}
if (!emptyMd.includes("decision: Monitor") || !emptyMd.includes("monitoring_keywords:")) {
  failed++;
  console.log("FAIL empty report missing action layer monitor decision");
}
if (!emptyMd.includes("本轮未找到足够证据进入重点机会卡")) {
  failed++;
  console.log("FAIL empty report missing no-card evidence statement");
}
if (!emptyMd.includes("观察线索") || !emptyMd.includes("Shopee 2025 本地化履约业务招商大会")) {
  failed++;
  console.log("FAIL empty report missing observation signals");
}
if (!emptyMd.includes("为什么没有进入重点卡") || !emptyMd.includes("报名信息疑似过期")) {
  failed++;
  console.log("FAIL empty report missing downgrade reasons");
}
if (!emptyMd.includes("下一轮建议") || !emptyMd.includes("source / query")) {
  failed++;
  console.log("FAIL empty report missing next-round source/query guidance");
}
if (!profileFieldMd.includes("- 地域范围：中国、国际")) {
  failed++;
  console.log("FAIL report profile should prefer structured region fields");
}
if (!profileFieldMd.includes("- 时间范围：未来60天内")) {
  failed++;
  console.log("FAIL report profile should derive an actual time window instead of duplicating region/goal text");
}
if (failed === 0) console.log("PASS report template matches MVP structure");
process.exit(failed > 0 ? 1 : 0);
