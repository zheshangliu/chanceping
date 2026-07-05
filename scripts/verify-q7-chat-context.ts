import fs from "fs";
import path from "path";
import { createApp } from "../src/api/app";
import { createAppContext } from "../src/api/context";
import type { LLMAdapter, LLMRequest, LLMResponse } from "../src/agents/llm-adapter";
import { reviseRadarVersionWithLlm } from "../src/agents/radar-version-llm-reviser";
import { createDefaultSpec } from "../src/schema/radar-requirement-spec";
import type { RadarRevisionRequest, RadarVersionSpec } from "../src/schema/radar-version-spec";

process.env.LLM_MODE = "mock";

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

function read(relativePath: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), relativePath), "utf-8");
}

class CapturingLlmAdapter implements LLMAdapter {
  requests: LLMRequest[] = [];

  constructor(private readonly content: string) {}

  async chat(request: LLMRequest): Promise<LLMResponse> {
    this.requests.push(request);
    return { content: this.content };
  }

  latestPrompt(): string {
    return this.requests
      .flatMap((request) => request.messages.map((message) => message.content))
      .join("\n\n");
  }
}

function createBaseRequest(overrides: Partial<RadarRevisionRequest> = {}): RadarRevisionRequest {
  const spec = createDefaultSpec();
  spec.client_profile.business_type = "个人开发者";
  spec.client_profile.client_type = "个人开发者";
  spec.core_goals.primary_goal = "寻找 AI 赛事机会";
  spec.opportunity_scope.primary_opportunity_types = ["AI 赛事", "Hackathon"];
  spec.confirmation_status = {
    status: "confirmed",
    user_confirmed: true,
    confirmed_at: "2026-07-03T00:00:00.000Z",
    last_user_feedback: "",
    revision_count: 0,
  };
  const radarVersion: RadarVersionSpec = {
    version: "V1.0",
    oneSentencePositioning: "个人开发者的 AI 赛事雷达",
    targetUser: "个人开发者",
    businessContext: "寻找 AI 比赛、Hackathon 和开发者机会。",
    opportunityIntents: ["AI 赛事", "Hackathon"],
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
  spec.radar_version = radarVersion;
  return {
    previousSpec: spec,
    previousRadarVersion: radarVersion,
    userMessage: "继续保留大湾区 OPC 视角，但不要展会资讯，只要可报名入口和云资源。",
    trigger: "requirement_correction",
    revisionMode: "llm",
    ...overrides,
  };
}

const validPayload = JSON.stringify({
  radarVersion: {
    targetUser: "大湾区 OPC / AI 产品创业者",
    opportunityIntents: ["可报名 AI 赛事", "AI Agent Hackathon", "云资源扶持"],
    highValueCriteria: ["有官方报名入口", "有奖金或云资源", "适合 OPC 创业者"],
    exclusionRules: ["展会资讯", "学生专属赛事", "培训广告"],
    prioritySourceArchetypes: ["官方赛事页", "云厂商开发者活动页", "Hackathon 平台"],
  },
  radarDiff: {
    summary: "根据聊天上下文保留 OPC 身份，并提高可报名和云资源机会。",
    added: ["大湾区 OPC 视角"],
    removed: [],
    upweighted: ["官方报名入口", "云资源"],
    downweighted: ["展会资讯"],
    assumptionChanges: ["继续沿用该聊天窗口确认过的 OPC 身份。"],
    queryShifts: ["加入 application、cloud credits、deadline 查询方向。"],
    sourceShifts: ["云厂商开发者活动页", "Hackathon 平台"],
    highValueCriteriaChanges: ["优先有报名入口和云资源。"],
    exclusionChanges: ["排除展会资讯。"],
  },
  suggestedName: "AI 赛事雷达",
  confirmationPrompt: "我已按上下文升级雷达，请确认是否按新版盯一次。",
});

async function runSourceChecks() {
  const radarsRoute = read("src/api/routes/radars.ts");
  const llmReviser = read("src/agents/radar-version-llm-reviser.ts");
  const heroChat = read("web/hero-radar-chat.js");
  const reviseCallStart = heroChat.indexOf('postJson("/api/radars/revise"');
  const reviseCallBlock = reviseCallStart >= 0 ? heroChat.slice(reviseCallStart, reviseCallStart + 700) : "";

  check("revise API reads radarChatStore context", /radarChatStore/.test(radarsRoute) && /chatWindowId|chat_window_id/.test(radarsRoute));
  check("LLM reviser prompt mentions chat context", /chatContext|memorySummary|recentMessages/.test(llmReviser));
  check("hero chat sends chatWindowId to revise API", /\/api\/radars\/revise/.test(reviseCallBlock) && /chatWindowId/.test(reviseCallBlock), reviseCallBlock);
}

async function runLlmPromptContextCheck() {
  const adapter = new CapturingLlmAdapter(validPayload);
  const request = createBaseRequest({
    chatWindowId: "radar_chat_context_test",
    chatContext: {
      chatWindowId: "radar_chat_context_test",
      title: "AI 赛事雷达",
      memorySummary: {
        summary: "用户是大湾区 OPC 创业者，只要可报名 AI 赛事。",
        targetUser: "大湾区 OPC 创业者",
        watchingFor: ["可报名 AI 赛事", "云资源", "奖金"],
        exclusions: ["展会资讯", "学生专属赛事"],
        confirmedRules: ["只要官方报名入口"],
        rejectedPatterns: ["纯新闻报道"],
        lastFeedback: "不要展会资讯",
        updatedAt: "2026-07-04T00:00:00.000Z",
      },
      recentMessages: [
        { role: "user", content: "我是大湾区 OPC，想找 AI 赛事。" },
        { role: "assistant", content: "我先帮你画 AI 赛事雷达 V1.0。" },
        { role: "user", content: "不要展会资讯，只要报名入口和云资源。" },
      ],
    },
  } as any);
  const result = await reviseRadarVersionWithLlm(request, adapter, { provider: "fake", model: "context-test" });
  const prompt = adapter.latestPrompt();
  check("LLM prompt includes memory summary", /大湾区 OPC 创业者/.test(prompt) && /只要可报名 AI 赛事/.test(prompt), prompt.slice(0, 400));
  check("LLM prompt includes recent chat messages", /我是大湾区 OPC/.test(prompt) && /不要展会资讯/.test(prompt), prompt.slice(0, 400));
  check("LLM prompt keeps context revision usable", result.revisionSource === "llm" && /OPC|云资源/.test(json(result.radarVersion)), json(result));
}

async function runApiContextCheck() {
  const dataDir = path.resolve(process.cwd(), "data/q7-chat-context-test");
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.mkdirSync(dataDir, { recursive: true });
  process.env.CHANCEPING_RADAR_CHAT_STORE_PATH = "data/q7-chat-context-test/radar-chat-windows.json";

  const adapter = new CapturingLlmAdapter(validPayload);
  const ctx = createAppContext();
  ctx.llmAdapter = adapter;
  const app = createApp(ctx);

  const createdResponse = await app.request("/api/radar-chats", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "AI 赛事雷达", draftRadarVersion: "V1.0" }),
  });
  const created = await createdResponse.json() as { data?: { id?: string } };
  const chatWindowId = created.data?.id ?? "";
  check("test chat window created", Boolean(chatWindowId), json(created));

  await app.request(`/api/radar-chats/${chatWindowId}/memory-summary`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      summary: "用户是大湾区 OPC 创业者，只看可报名 AI 赛事。",
      targetUser: "大湾区 OPC 创业者",
      watchingFor: ["可报名 AI 赛事", "云资源"],
      exclusions: ["展会资讯", "学生专属赛事"],
      confirmedRules: ["只要官方报名入口"],
      rejectedPatterns: ["纯新闻报道"],
      lastFeedback: "不要展会资讯",
    }),
  });
  for (const content of ["我是大湾区 OPC，想找 AI 马拉松。", "不要展会资讯，只要可报名入口和云资源。"]) {
    await app.request(`/api/radar-chats/${chatWindowId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "user", content }),
    });
  }

  const reviseResponse = await app.request("/api/radars/revise", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...createBaseRequest(),
      chatWindowId,
    }),
  });
  const body = await reviseResponse.json() as { success?: boolean; data?: any; error?: any };
  const prompt = adapter.latestPrompt();
  check("revision API accepts chatWindowId", reviseResponse.status === 200 && body.success === true, `${reviseResponse.status} ${json(body.error)}`);
  check("revision API injects memory summary into LLM prompt", /大湾区 OPC 创业者/.test(prompt) && /只看可报名 AI 赛事/.test(prompt), prompt.slice(0, 500));
  check("revision API injects recent chat into LLM prompt", /AI 马拉松/.test(prompt) && /可报名入口和云资源/.test(prompt), prompt.slice(0, 500));
  check("revision API exposes safe context diagnostics", body.data?.chatContextUsed === true && body.data?.chatContext?.messageCount >= 2, json(body.data?.chatContext));
}

runSourceChecks()
  .then(runLlmPromptContextCheck)
  .then(runApiContextCheck)
  .then(() => {
    if (fail > 0) {
      console.error(`Q.7 chat context: ${pass} PASS / ${fail} FAIL`);
      process.exit(1);
    }
    console.log(`Q.7 chat context: ${pass} PASS / 0 FAIL`);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
