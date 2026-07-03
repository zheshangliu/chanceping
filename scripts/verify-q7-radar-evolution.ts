import { readFileSync } from "node:fs";
import { createApp } from "../src/api/app";
import { createAppContext } from "../src/api/context";
import { reviseRadarVersion, nextRadarVersionId } from "../src/agents/radar-version-reviser";
import { createDefaultSpec } from "../src/schema/radar-requirement-spec";
import type { RadarRevisionRequest, RadarRevisionResult, RadarVersionDiff, RadarVersionSpec } from "../src/schema/radar-version-spec";

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

function json(value: unknown): string {
  return JSON.stringify(value);
}

const previousSpec = createDefaultSpec();
previousSpec.client_profile.business_type = "个人开发者";
previousSpec.core_goals.primary_goal = "寻找 AI 比赛机会";
previousSpec.opportunity_scope.primary_opportunity_types = ["AI 比赛", "Hackathon"];
previousSpec.confirmation_status = {
  status: "confirmed",
  user_confirmed: true,
  confirmed_at: "2026-07-03T00:00:00.000Z",
  last_user_feedback: "",
  revision_count: 0,
};

const previousVersion: RadarVersionSpec = {
  version: "V1.0",
  oneSentencePositioning: "个人开发者的 AI 比赛机会雷达",
  targetUser: "个人开发者",
  businessContext: "寻找 AI 比赛、Hackathon 和开发者机会。",
  opportunityIntents: ["AI 比赛", "Hackathon"],
  highValueCriteria: ["有报名入口"],
  exclusionRules: ["排除培训广告"],
  prioritySourceArchetypes: ["official_event_site"],
  queryFamilies: [],
  scoringRules: [],
  reportTemplate: [],
  missingConfig: [],
  defaultAssumptions: [],
  revisionNotes: [],
  resultBuckets: ["direct_opportunity", "watch_signal", "reference_case", "rejected"],
};
previousSpec.radar_version = previousVersion;

const diff: RadarVersionDiff = {
  fromVersion: "V1.0",
  toVersion: "V1.1",
  summary: "降低展会资讯，提高可报名比赛入口。",
  added: ["奖金、云资源、上架展示机会"],
  removed: ["学生专属赛事"],
  upweighted: ["AI Agent 大赛", "开发者挑战赛", "云厂商扶持"],
  downweighted: ["展会资讯", "行业趋势新闻"],
  assumptionChanges: ["默认用户为 OPC 创业者，不是学生参赛者。"],
  queryShifts: ["加入 registration/application/deadline/action route 查询方向。"],
  sourceShifts: ["优先官方赛事页、Devpost、云厂商开发者大赛页。"],
  highValueCriteriaChanges: ["必须能形成报名、申请或官方复核动作。"],
  exclusionChanges: ["排除纯展会新闻、培训广告和已结束资讯。"],
};

const request: RadarRevisionRequest = {
  previousSpec,
  previousRadarVersion: previousVersion,
  userMessage: "不要展会资讯，我要能报名的比赛",
  trigger: "strategy_adjustment",
};

const result: RadarRevisionResult = {
  spec: previousSpec,
  radarVersion: { ...previousVersion, version: "V1.1", revisionNotes: [{ type: "query_shift", detail: diff.summary }] },
  radarDiff: diff,
  suggestedName: "AI 比赛机会雷达",
  confirmationPrompt: "是否按 V1.1 盯一次？",
  shouldSearchAfterConfirm: true,
};

check("RadarVersionDiff exposes version transition", diff.fromVersion === "V1.0" && diff.toVersion === "V1.1");
check("RadarRevisionRequest preserves previous version", request.previousRadarVersion.version === "V1.0");
check("RadarRevisionResult returns revised version", result.radarVersion.version === "V1.1");
check("RadarRevisionResult returns visible diff", result.radarDiff.queryShifts.length > 0);

const minor = nextRadarVersionId("V1.0", "minor");
const major = nextRadarVersionId("V1.2", "major");
check("minor version increments decimal", minor === "V1.1", minor);
check("major version increments major and resets minor", major === "V2.0", major);

const revised = reviseRadarVersion({
  previousSpec,
  previousRadarVersion: previousVersion,
  userMessage: "我不是学生，我是 OPC 创业者，优先奖金、云资源、能上架展示的比赛。",
  trigger: "requirement_correction",
});

check("revision returns a higher version", revised.radarVersion.version !== previousVersion.version, revised.radarVersion.version);
check("revision diff mentions target correction", /OPC|创业者|开发者/.test(json(revised.radarDiff)), json(revised.radarDiff));
check("revision keeps search confirmation gated", revised.shouldSearchAfterConfirm === true);
check("revision writes revision notes", revised.radarVersion.revisionNotes.length > 0);
check("revision updates high value criteria", /奖金|云资源|展示/.test(json(revised.radarVersion.highValueCriteria)), json(revised.radarVersion.highValueCriteria));
check("revision updates exclusions", /学生/.test(json(revised.radarVersion.exclusionRules)), json(revised.radarVersion.exclusionRules));
check("revision updates source strategy", revised.radarVersion.prioritySourceArchetypes.length >= previousVersion.prioritySourceArchetypes.length);
check("revision updates query strategy", revised.radarVersion.queryFamilies.length > previousVersion.queryFamilies.length || revised.radarVersion.opportunityIntents.length > previousVersion.opportunityIntents.length);
check("revision records default assumptions", /创业者|开发者/.test(json(revised.radarVersion.defaultAssumptions)), json(revised.radarVersion.defaultAssumptions));
check("revision requires re-confirmation", revised.spec.confirmation_status?.user_confirmed === false, json(revised.spec.confirmation_status));

const feedbackRevision = reviseRadarVersion({
  previousSpec: revised.spec,
  previousRadarVersion: revised.radarVersion,
  userMessage: "这些结果不对",
  trigger: "result_feedback",
  resultFeedback: {
    expectedOpportunityType: "可报名 AI 比赛",
    rejectedReason: "不要展会资讯和行业新闻",
    rejectedCardTitles: ["某 AI 展会资讯"],
    freeText: "我要能报名、能提交作品的入口。",
  },
});

check("result feedback stays structured", feedbackRevision.spec.confirmation_status?.last_user_feedback?.includes("这些结果不对") === true);
check("result feedback changes exclusions", /展会|资讯|新闻/.test(json(feedbackRevision.radarVersion.exclusionRules)), json(feedbackRevision.radarVersion.exclusionRules));
check("result feedback changes high value criteria", /报名|提交|入口/.test(json(feedbackRevision.radarVersion.highValueCriteria)), json(feedbackRevision.radarVersion.highValueCriteria));
check("result feedback changes query/source shifts", feedbackRevision.radarDiff.queryShifts.length + feedbackRevision.radarDiff.sourceShifts.length > 0, json(feedbackRevision.radarDiff));

async function runApiChecks() {
  const app = createApp(createAppContext());
  const apiResponse = await app.request("/api/radars/revise", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      previousSpec,
      previousRadarVersion: previousVersion,
      userMessage: "不要展会资讯，我要能报名的比赛",
      trigger: "strategy_adjustment",
    }),
  });
  const apiJson = await apiResponse.json() as { success: boolean; data?: RadarRevisionResult; error?: { code: string; message: string } };

  check("POST /api/radars/revise returns 200", apiResponse.status === 200, String(apiResponse.status));
  check("POST /api/radars/revise succeeds", apiJson.success === true, JSON.stringify(apiJson.error ?? {}));
  check("revision API returns higher version", Boolean(apiJson.data?.radarVersion.version && apiJson.data.radarVersion.version !== "V1.0"), apiJson.data?.radarVersion.version ?? "");
  check("revision API returns diff", Boolean(apiJson.data?.radarDiff.summary), JSON.stringify(apiJson.data?.radarDiff ?? {}));
  check("revision API keeps draft unconfirmed", apiJson.data?.spec.confirmation_status?.user_confirmed === false, json(apiJson.data?.spec.confirmation_status));

  const reviserSource = readFileSync("src/agents/radar-version-reviser.ts", "utf8");
  check("reviser has no AI competition product branch", !/if\s*\([^)]*AI\s*比赛|switch\s*\([^)]*AI\s*比赛|case\s+['\"]AI\s*比赛/.test(reviserSource));
}

runApiChecks()
  .then(() => {
    if (fail > 0) {
      console.error(`Q.7 radar evolution: ${pass} PASS / ${fail} FAIL`);
      process.exit(1);
    }
    console.log(`Q.7 radar evolution: ${pass} PASS / 0 FAIL`);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
