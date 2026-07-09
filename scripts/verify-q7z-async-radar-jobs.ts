import fs from "fs";
import { createApp } from "../src/api/app";
import { createAppContext } from "../src/api/context";
import type { RadarRequirementSpec } from "../src/schema/radar-requirement-spec";

let pass = 0;
let fail = 0;

function check(name: string, condition: boolean, detail = ""): void {
  if (condition) {
    pass += 1;
    console.log(`PASS ${name}`);
  } else {
    fail += 1;
    console.error(`FAIL ${name}${detail ? `: ${detail}` : ""}`);
  }
}

function createCustomRadarSpec(): RadarRequirementSpec {
  return {
    product_name: "企业 EAP 采购机会雷达",
    product_category: "机会雷达",
    client_profile: {
      client_name: "企业心理咨询服务商",
      client_type: "服务商",
      industry: "企业心理咨询 / EAP",
      business_type: "B2B 服务",
      company_stage: "成长期",
      products_or_projects: ["企业 EAP", "员工关怀", "工会福利心理服务"],
      target_users: ["企业 HR", "工会", "员工福利采购负责人"],
      core_capabilities: ["心理咨询", "员工关怀课程", "危机干预"],
      current_assets: [],
      regions: ["广东", "香港"],
      notes: "寻找未来 60 天内企业 EAP、员工关怀、工会福利采购机会。",
    },
    core_goals: {
      primary_goal: "找到企业 EAP 和员工关怀采购线索",
      secondary_goals: ["工会福利项目", "企业员工心理健康采购"],
      success_definition: "至少找到一个可联系或可报名的采购/合作入口",
      action_intent: ["寻找客户", "寻找合作", "准备材料"],
      priority_order: ["采购入口", "工会项目", "企业福利合作"],
    },
    opportunity_scope: {
      primary_opportunity_types: ["企业 EAP 采购", "员工关怀采购", "工会福利项目"],
      secondary_opportunity_types: ["HR 服务商合作", "员工心理健康活动"],
      excluded_opportunity_types: ["纯招聘", "心理咨询师培训广告", "加盟广告"],
      must_have_conditions: ["存在采购、合作、报名、入库或联系入口"],
      nice_to_have_conditions: ["广东或香港", "未来 60 天"],
    },
    region_scope: {
      primary_regions: ["广东", "香港"],
      secondary_regions: ["中国内地"],
      excluded_regions: [],
      global_allowed: false,
      overseas_allowed: false,
    },
    keyword_strategy: {
      core_keywords_zh: ["企业 EAP", "员工关怀", "工会福利", "心理健康采购"],
      core_keywords_en: ["employee assistance program", "EAP procurement"],
      expanded_keywords_zh: ["员工心理健康", "福利采购", "供应商入库"],
      expanded_keywords_en: ["employee wellbeing vendor", "HR wellbeing procurement"],
      negative_keywords: ["招聘", "加盟", "培训广告"],
    },
    filter_rules: {
      must_include: ["采购", "合作", "供应商", "入库", "报名", "联系"],
      must_exclude: ["加盟广告", "心理咨询师招聘"],
      low_priority_signals: ["资讯文章", "课程介绍"],
      high_priority_signals: ["招标", "供应商入库", "采购公告", "工会项目"],
      requires_manual_review: ["费用", "截止时间", "联系人"],
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
      report_title_prefix: "本周",
      report_frequency: "weekly",
      max_items_per_report: 10,
      min_items_per_report: 1,
      must_include_sections: ["本轮结论", "机会卡", "本周行动"],
      opportunity_card_required_fields: ["title", "url", "next_action"],
      link_required: true,
      contact_required_if_available: true,
      deadline_required_if_available: true,
    },
    requirement_confidence: {
      total: 90,
      client_identity: { score: 90, weight: 15, reason: "用户身份明确" },
      business_goal: { score: 90, weight: 20, reason: "目标明确" },
      opportunity_type: { score: 88, weight: 20, reason: "机会类型明确" },
      region_scope: { score: 85, weight: 10, reason: "地区明确" },
      exclusion_rules: { score: 90, weight: 10, reason: "排除规则明确" },
      action_scenario: { score: 88, weight: 15, reason: "行动意图明确" },
      report_format: { score: 90, weight: 10, reason: "报告格式明确" },
    },
    questions_to_confirm: [],
    confirmation_status: {
      status: "confirmed",
      user_confirmed: true,
      confirmed_at: "2026-07-09",
      last_user_feedback: "",
      revision_count: 0,
    },
  };
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function run(): Promise<void> {
  const app = createApp(createAppContext());
  const spec = createCustomRadarSpec();

  const startResponse = await app.request("/api/radar-jobs/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      spec,
      radar_type: "custom",
      search_mode: "mock",
      query: "企业 EAP 员工关怀 工会福利 采购 供应商 入库 广东 香港",
    }),
  });
  const startJson = await startResponse.json() as { success?: boolean; data?: any; error?: any };
  check("radar job start returns 202", startResponse.status === 202, String(startResponse.status));
  check("radar job start succeeds", startJson.success === true, JSON.stringify(startJson.error ?? {}));
  const jobId = startJson.data?.jobId as string | undefined;
  check("radar job id is returned", typeof jobId === "string" && jobId.startsWith("job_"), String(jobId));
  check("start progress line uses ChancePing wording", /盯机会/.test(String(startJson.data?.progressLine ?? "")), String(startJson.data?.progressLine ?? ""));

  let finalJob: any = null;
  if (jobId) {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const response = await app.request(`/api/radar-jobs/${jobId}`);
      const json = await response.json() as { success?: boolean; data?: any; error?: any };
      if (response.status === 200 && json.success && ["succeeded", "failed"].includes(json.data?.status)) {
        finalJob = json.data;
        break;
      }
      await delay(50);
    }
  }

  check("radar job eventually finishes", Boolean(finalJob), "job did not finish");
  check("radar job succeeds", finalJob?.status === "succeeded", JSON.stringify(finalJob?.error ?? {}));
  const cards = finalJob?.result?.search?.opportunityCards ?? [];
  check("async job returns opportunity cards", Array.isArray(cards) && cards.length > 0, String(cards.length));
  const markdown = String(finalJob?.result?.report?.markdown ?? "");
  check("async job returns markdown report", markdown.includes("#") && (cards[0]?.title ? markdown.includes(cards[0].title) : true), markdown.slice(0, 120));
  check("async job records progress events", Array.isArray(finalJob?.progressEvents) && finalJob.progressEvents.length >= 3, String(finalJob?.progressEvents?.length ?? 0));
  const serialized = JSON.stringify(finalJob ?? {});
  check("async job progress hides external provider names", !/DeepSeek|Qwen 正在|Serper 正在|LLM 正在|serper:/i.test(serialized));

  const random10Script = fs.readFileSync("scripts/run-q7z-live-custom-radar-async-10.ts", "utf8");
  const radarJobsRoute = fs.readFileSync("src/api/routes/radar-jobs.ts", "utf8");
  check(
    "async radar jobs have configurable max runtime",
    radarJobsRoute.includes("CHANCEPING_RADAR_JOB_TIMEOUT_MS") && radarJobsRoute.includes("RADAR_JOB_TIMEOUT_MS"),
    "jobs should not run forever without a customer-visible terminal state",
  );
  check(
    "async radar jobs emit heartbeat progress while running",
    radarJobsRoute.includes("RADAR_JOB_HEARTBEAT_MS") && radarJobsRoute.includes("startJobHeartbeat"),
    "long live runs need ongoing progress updates",
  );
  check(
    "random 10 version parser supports V2 and later",
    random10Script.includes("match(/V(\\d+)\\.(\\d+)/)"),
    "versionNumber must not only parse V1.x",
  );
  check(
    "random 10 diagnostics use targeted radar text",
    random10Script.includes("diagnosticTextForGeneratedData") && !random10Script.includes("const initialText = JSON.stringify(generatedData);"),
    "do not scan exclusion/default fields as positive intent",
  );
  check(
    "random 10 diagnostics use targeted card text",
    random10Script.includes("diagnosticTextForCards") && !random10Script.includes("const cardText = JSON.stringify(cards.slice(0, 5));"),
    "do not scan entire card JSON for negative patterns",
  );
  check(
    "random 10 has a second unseen-industry scenario set",
    random10Script.includes("SCENARIOS_SECOND") && random10Script.includes('CHANCEPING_Q7Z_SCENARIO_SET === "second"'),
    "second random 10 set must be selectable",
  );
  check(
    "random 10 second scenario set writes a separate report",
    random10Script.includes("Q7Z_Async_Custom_Radar_Random_10_Second_Report.md"),
    "second set must not overwrite the first report",
  );

  console.log(`\nQ7Z async radar jobs verification: ${pass} PASS, ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
