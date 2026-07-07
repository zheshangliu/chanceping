import { readFileSync } from "fs";
import { spawnSync } from "child_process";
import { loadLocalApiEnv } from "../src/config/local-env";
import {
  LiveLlmProfileError,
  resolveLiveLlmProfile,
  toLiveLlmPublicProfile,
} from "../src/config/live-llm-profile";
import type { RadarGenerateResponseData } from "../src/api/types";
import type { OpportunityCard } from "../src/schema/opportunity-card";
import type { FieldEvidenceItem, FieldEvidenceName } from "../src/schema/radar-mvp-contracts";

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail = ""): void {
  if (condition) {
    passed++;
    console.log(`PASS ${name}`);
  } else {
    failed++;
    console.log(`FAIL ${name}${detail ? ` -> ${sanitize(detail)}` : ""}`);
  }
}

function sanitize(message: unknown): string {
  let text = message instanceof Error ? message.message : String(message ?? "");
  for (const keyName of [
    "COMMERCIAL_LLM_API_KEY",
    "CONTEST_LLM_API_KEY",
    "DEEPSEEK_API_KEY",
    "DASHSCOPE_API_KEY",
    "SERPER_API_KEY",
  ]) {
    const value = process.env[keyName];
    if (value && value.length > 0) {
      text = text.split(value).join("[redacted]");
    }
  }
  return text;
}

function textOf(data: RadarGenerateResponseData): string {
  return JSON.stringify({
    profileSummary: data.profileSummary,
    clientProfile: data.spec.client_profile,
    opportunityScope: data.spec.opportunity_scope,
    coreGoals: data.spec.core_goals,
  });
}

function includesAny(value: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(value));
}

function noPresetLeakage(value: string): boolean {
  return !/RPA|AI\s*赛事|AI 比赛|乒乓球/.test(value);
}

function firstQuestion(data: RadarGenerateResponseData): string {
  return data.questionsToConfirm?.[0]?.question ?? "";
}

async function generateRadar(
  app: { request: (input: string, init?: RequestInit) => Response | Promise<Response> },
  description: string,
): Promise<{ status: number; success?: boolean; data?: RadarGenerateResponseData; error?: string }> {
  const response = await app.request("/api/radars/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ description }),
  });
  const json = await response.json() as {
    success?: boolean;
    data?: RadarGenerateResponseData;
    error?: { message?: string };
  };
  return {
    status: response.status,
    success: json.success,
    data: json.data,
    error: json.error?.message,
  };
}

function evidence(field: FieldEvidenceName, status: FieldEvidenceItem["status"], value = ""): FieldEvidenceItem {
  return {
    field,
    status,
    basis: status === "verified" || status === "partially_verified" ? "fetched_content" : "not_checked",
    sourceUrl: "https://www.nihonkiin.or.jp/match/",
    sourceDomain: "nihonkiin.or.jp",
    ...(value ? { value } : {}),
    checkedAt: new Date().toISOString(),
  };
}

function sampleLiveOpportunity(): OpportunityCard {
  return {
    title: "日本棋院赛事日程观察",
    type: "围棋赛事通知",
    organizer: "日本棋院",
    region: "日本",
    deadline: "待复核",
    reward_or_value: "待复核",
    eligibility: "待复核",
    materials_required: "待复核",
    match_reason: "模型判断：与围棋选手关注公开赛和职业赛事的画像相关。",
    next_action: "打开官方来源，复核报名入口、资格、费用和截止时间。",
    official_source_url: "https://www.nihonkiin.or.jp/match/",
    application_url: "",
    contact_info: "",
    risk_note: "搜索发现不等于已核验事实，行动前需复核关键字段。",
    backend_score: 78,
    visible_level: "B",
    status: "new",
    evidence_status: "needs_review",
    action_status: "monitor",
    opportunity_kind: "watch_signal",
    data_mode: "live",
    source_disclaimer: "搜索发现，待复核",
    field_evidence: [
      evidence("title", "verified", "日本棋院赛事日程观察"),
      evidence("source_url", "verified", "https://www.nihonkiin.or.jp/match/"),
      evidence("source_domain", "verified", "nihonkiin.or.jp"),
      evidence("source_type", "partially_verified", "官方组织网站"),
      evidence("registration_or_application_signal", "not_found"),
      evidence("date_or_deadline", "not_found"),
      evidence("fee", "not_found"),
      evidence("eligibility", "not_found"),
      evidence("contact_or_application_route", "not_found"),
    ],
  };
}

const FORBIDDEN_REPORT_CLAIMS = [
  "已确认报名资格",
  "已核验报名资格",
  "已确认费用",
  "已核验费用",
  "已确认截止日期",
  "已核验截止日期",
  "已确认联系人",
  "已核验联系人",
  "已确认报名状态",
  "已核验报名状态",
  "已确认版权义务",
  "已核验版权义务",
];

async function main(): Promise<void> {
  const packageJsonSource = readFileSync("package.json", "utf-8");
  const packageJson = JSON.parse(packageJsonSource) as { scripts?: Record<string, string> };
  const scriptSource = readFileSync("scripts/verify-live-llm.ts", "utf-8");

  check("verify:live-llm is opt-in and not part of verify:all", !String(packageJson.scripts?.["verify:all"] ?? "").includes("verify:live-llm"));
  check("verify:live-llm script uses contest profile", String(packageJson.scripts?.["verify:live-llm"] ?? "").includes("CHANCEPING_LLM_PROFILE=contest"));
  check("live LLM script does not print API key values or prefixes", !/API_KEY\s*=|substring\(|slice\(0,\s*8/.test(scriptSource));
  const ignored = spawnSync("git", ["check-ignore", "-q", "api.env"], { cwd: process.cwd(), stdio: "ignore" });
  check("api.env is git-ignored", ignored.status === 0);

  const missingConfigEnv = {
    CHANCEPING_ENABLE_LOCAL_LIVE_LLM: "true",
    CHANCEPING_LLM_PROFILE: "contest",
  };
  try {
    resolveLiveLlmProfile({ env: missingConfigEnv, nodeEnv: "development" });
    check("contest profile missing config fails clearly", false, "resolver succeeded unexpectedly");
  } catch (err) {
    check("contest profile missing config fails clearly", err instanceof LiveLlmProfileError && err.code === "LIVE_LLM_CONFIG_MISSING", sanitize(err));
  }
  try {
    resolveLiveLlmProfile({
      env: {
        ...process.env,
        CHANCEPING_ENABLE_LOCAL_LIVE_LLM: "true",
        CHANCEPING_LLM_PROFILE: "contest",
        CONTEST_LLM_PROVIDER: "qwen",
        CONTEST_LLM_MODEL: "qwen-plus",
        CONTEST_LLM_BASE_URL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        CONTEST_LLM_API_KEY: "redacted-test-key",
      },
      nodeEnv: "production",
    });
    check("production rejects live LLM", false, "resolver succeeded unexpectedly");
  } catch (err) {
    check("production rejects live LLM", err instanceof LiveLlmProfileError && err.code === "LIVE_LLM_PRODUCTION_DISABLED", sanitize(err));
  }

  const localEnv = loadLocalApiEnv({ enabled: true });
  check("api.env loads only through explicit live LLM script", localEnv.loaded, `reason=${localEnv.reason}`);

  process.env.DATA_MODE = "mock";
  process.env.LLM_MODE = "live";
  process.env.CHANCEPING_ENABLE_LOCAL_LIVE_LLM = "true";
  process.env.CHANCEPING_LLM_PROFILE = "contest";

  let publicProfile = "";
  try {
    const profile = resolveLiveLlmProfile();
    const publicInfo = toLiveLlmPublicProfile(profile);
    publicProfile = `${publicInfo.profile}/${publicInfo.provider}/${publicInfo.model}`;
    check("contest profile resolves as Qwen", publicInfo.profile === "contest" && publicInfo.provider === "qwen", publicProfile);
    check("contest profile has model without exposing key", Boolean(publicInfo.model) && !publicProfile.includes(profile.apiKey), publicProfile);
    console.log(`Live LLM profile: ${publicProfile}`);
  } catch (err) {
    check("contest profile resolves", false, sanitize(err));
  }

  if (!process.env.CONTEST_LLM_API_KEY && !process.env.DASHSCOPE_API_KEY) {
    console.log(`live LLM verification: ${passed} PASS / ${failed} FAIL`);
    process.exit(1);
  }

  const [{ createApp }, { createAppContext }] = await Promise.all([
    import("../src/api/app"),
    import("../src/api/context"),
  ]);
  const app = createApp(createAppContext());

  const cases = [
    {
      label: "go player fuzzy",
      description: "我是围棋选手",
      identity: /围棋选手/,
      question: /围棋机会|公开赛|职业定段赛|奖金赛事|培训营|赞助合作/,
      confidenceBelow: 85,
    },
    {
      label: "wedding company",
      description: "我们是婚庆公司",
      identity: /婚庆公司/,
      question: /机会|订单|客户|合作|婚庆/,
      confidenceBelow: 85,
    },
    {
      label: "employee benefit supplier",
      description: "我们是员工福利供应商",
      identity: /员工福利供应商/,
      question: /机会|订单|客户|合作|福利/,
      confidenceBelow: 85,
    },
    {
      label: "tender intent without identity",
      description: "我想找投标机会",
      identity: /未明确|我/,
      question: /你是谁|哪类公司|团队|机构/,
      confidenceBelow: 85,
    },
    {
      label: "headhunter",
      description: "我是一名猎头顾问",
      identity: /猎头顾问/,
      question: /机会|岗位|客户|线索|招聘/,
      confidenceBelow: 85,
    },
    {
      label: "heritage creative company",
      description: "我们是做文创非遗的公司",
      identity: /文创非遗|非遗|文创/,
      question: /机会|申报|补贴|客户|订单|合作/,
      confidenceBelow: 85,
    },
    {
      label: "student self improvement",
      description: "我是大学生，想找提升自己的机会",
      identity: /大学生/,
      question: /地区|时间|行动|排除|官网|机会/,
      confidenceBelow: 95,
    },
  ];

  for (const item of cases) {
    const result = await generateRadar(app, item.description);
    check(`${item.label}: API succeeds`, result.status === 200 && result.success === true, result.error ?? `status=${result.status}`);
    if (!result.data) continue;
    const text = textOf(result.data);
    check(`${item.label}: preserves user identity`, item.identity.test(text), text.slice(0, 240));
    check(`${item.label}: no preset industry leakage`, noPresetLeakage(text), text.slice(0, 240));
    check(`${item.label}: confidence is not default 100`, Number(result.data.requirementConfidence ?? 100) < item.confidenceBelow, `confidence=${result.data.requirementConfidence}`);
    check(`${item.label}: asks one natural clarification`, item.question.test(firstQuestion(result.data)), firstQuestion(result.data));
    check(`${item.label}: first round shows at most one question`, (result.data.questionsToConfirm?.length ?? 0) <= 1, `questions=${result.data.questionsToConfirm?.length ?? 0}`);
  }

  const clearResult = await generateRadar(app, "我是围棋选手，想盯未来30天国内外可报名的围棋公开赛和职业定段赛，优先看中国围棋协会、日本棋院、韩国棋院，排除培训广告");
  check("clear go profile generation succeeds", clearResult.status === 200 && clearResult.success === true, clearResult.error ?? `status=${clearResult.status}`);
  if (clearResult.data) {
    clearResult.data.spec.requirement_confidence.total = 95;
    clearResult.data.spec.confirmation_status.status = "confirmed";
    clearResult.data.spec.confirmation_status.user_confirmed = true;
    clearResult.data.spec.confirmation_status.confirmed_at = new Date().toISOString();
    const reportResponse = await app.request("/api/reports/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        radar_type: "custom",
        spec: clearResult.data.spec,
        opportunities: [sampleLiveOpportunity()],
        candidateAccounting: {
          rawCount: 3,
          deduplicatedCount: 1,
          assessedCount: 1,
          acceptedCount: 1,
          rejectedCount: 2,
        },
        executionLog: {
          queryExecutions: [{
            query: "site:nihonkiin.or.jp 囲碁 棋戦 日程",
            provider: "serper",
            startedAt: new Date().toISOString(),
            status: "succeeded",
            rawResultCount: 3,
          }],
          openedUrls: [{
            url: "https://www.nihonkiin.or.jp/match/",
            status: "succeeded",
            fetchedAt: new Date().toISOString(),
            title: "日本棋院 棋戦",
            wordCount: 500,
          }],
        },
        rawCandidates: [{
          title: "日本棋院 棋戦",
          url: "https://www.nihonkiin.or.jp/match/",
          sourceDomain: "nihonkiin.or.jp",
          provider: "serper",
          rank: 1,
          qualityStatus: "accepted",
        }],
      }),
    });
    const reportJson = await reportResponse.json() as {
      success?: boolean;
      data?: { markdown?: string };
      error?: { message?: string };
    };
    const markdown = reportJson.data?.markdown ?? "";
    check("live LLM report explanation succeeds", reportResponse.status === 200 && reportJson.success === true, reportJson.error?.message ?? `status=${reportResponse.status}`);
    check("report records live LLM profile only", markdown.includes("Live LLM profile：contest / qwen /") && !/sk-|COMMERCIAL_LLM_API_KEY|CONTEST_LLM_API_KEY|DEEPSEEK_API_KEY|DASHSCOPE_API_KEY|SERPER_API_KEY/.test(markdown));
    check("report keeps explanation inside model judgment", markdown.includes("以下内容属于基于 evidence status 的模型判断，不是字段级已核验事实。"));
    check("report keeps review-needed language", markdown.includes("待复核"));
    check("report avoids forbidden verified claims", !includesAny(markdown, FORBIDDEN_REPORT_CLAIMS.map((claim) => new RegExp(claim, "g"))));
  }

  console.log(`live LLM verification: ${passed} PASS / ${failed} FAIL`);
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`verify:live-llm failed: ${sanitize(err)}`);
  process.exit(1);
});
