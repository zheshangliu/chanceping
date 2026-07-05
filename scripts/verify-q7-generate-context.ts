import fs from "fs";
import path from "path";
import { createApp } from "../src/api/app";
import { createAppContext } from "../src/api/context";
import type { LLMAdapter, LLMRequest, LLMResponse } from "../src/agents/llm-adapter";
import type { RadarGenerateResponseData } from "../src/api/types";

process.env.LLM_MODE = "live";

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

  async chat(request: LLMRequest): Promise<LLMResponse> {
    this.requests.push(request);
    return {
      content: JSON.stringify({
        client_identity: {
          client_type: "个人",
          industry: "AI 产品",
          business_type: "大湾区 OPC / AI 产品创业者",
          core_capabilities: ["AI 产品开发"],
          products_or_projects: ["AI 工具"],
          company_stage: "OPC",
          regions: ["大湾区"],
          notes: "来自雷达聊天窗口上下文",
        },
        business_goal: {
          primary_goal: "寻找可报名 AI 赛事和 AI 马拉松机会",
          secondary_goals: ["寻找云资源", "寻找奖金", "寻找产品展示机会"],
          success_definition: "找到 30-60 天内可报名、可提交作品、适合 OPC 的机会",
          priority_order: ["可报名", "云资源", "奖金", "产品展示"],
        },
        opportunity_type: {
          primary_types: ["AI 赛事", "AI Agent Hackathon", "AI 马拉松"],
          secondary_types: ["云厂商开发者挑战", "产品展示机会"],
          excluded_types: ["展会资讯", "学生专属赛事"],
          must_have_conditions: ["报名入口", "可提交作品", "适合个人开发者或小团队"],
        },
        region_scope: {
          primary_regions: ["大湾区"],
          secondary_regions: ["海外", "线上"],
          excluded_regions: [],
          overseas_allowed: true,
          global_allowed: true,
        },
        exclusion_rules: {
          must_exclude: ["展会资讯", "培训广告", "学生专属赛事"],
          low_priority_signals: ["纯新闻报道", "历史活动"],
          count: 3,
        },
        action_scenario: {
          action_intent: "报名/申请/提交作品",
          priority_order: ["报名", "申请云资源", "收藏关注"],
        },
        report_format: {
          frequency: "本周",
          format: "markdown",
          must_include_sections: ["S/A/B/C 评级", "报名入口", "材料清单", "风险提醒"],
        },
        opportunity_strategy: {
          source_archetypes: ["official_event_site", "hackathon_platform", "cloud_developer_event_page"],
          high_value_criteria: ["有报名入口", "有截止时间", "有奖金或云资源", "适合 OPC"],
          search_themes: [
            {
              theme_name: "AI Hackathon 报名入口",
              intent_type: "direct_opportunity",
              source_archetype: "hackathon_platform",
              query_family: "AI hackathon application",
              why_this_theme: "寻找可报名和可提交作品的比赛入口",
              result_bucket: "direct_opportunity",
              query_variants: [
                { query: "AI Agent Hackathon application deadline", variant: "action_keyword" },
                { query: "site:devpost.com AI hackathon Qwen Cloud", variant: "official_source" },
              ],
            },
          ],
        },
      }),
    };
  }

  latestPrompt(): string {
    return this.requests
      .flatMap((request) => request.messages.map((message) => message.content))
      .join("\n\n");
  }
}

async function post(app: ReturnType<typeof createApp>, pathName: string, body: unknown) {
  const response = await app.request(pathName, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return {
    status: response.status,
    json: await response.json() as { success?: boolean; data?: RadarGenerateResponseData & Record<string, unknown>; error?: unknown },
  };
}

async function put(app: ReturnType<typeof createApp>, pathName: string, body: unknown) {
  return app.request(pathName, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function runSourceChecks() {
  const route = read("src/api/routes/radars.ts");
  const types = read("src/api/types.ts");
  check("generate request supports chatWindowId", /interface RadarGenerateRequest[\s\S]*chatWindowId/.test(types));
  check("generate route hydrates radar chat context", /hydrateRadarGenerateChatContext|hydrateRadarChatContext/.test(route) && /radarChatStore/.test(route));
  check("generate route appends chat context before generator", /appendRadarGenerateChatContext/.test(route));
}

async function runApiCheck() {
  const dataDir = path.resolve(process.cwd(), "data/q7-generate-context-test");
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.mkdirSync(dataDir, { recursive: true });
  process.env.CHANCEPING_RADAR_CHAT_STORE_PATH = "data/q7-generate-context-test/radar-chat-windows.json";

  const adapter = new CapturingLlmAdapter();
  process.env.LLM_MODE = "mock";
  const ctx = createAppContext();
  ctx.llmAdapter = adapter;
  process.env.LLM_MODE = "live";
  const app = createApp(ctx);

  const created = await post(app, "/api/radar-chats", { title: "AI 赛事雷达", draftRadarVersion: "V1.0" });
  const chatWindowId = String(created.json.data?.id ?? "");
  check("test chat window created", Boolean(chatWindowId), json(created));

  await put(app, `/api/radar-chats/${chatWindowId}/memory-summary`, {
    summary: "用户是大湾区 OPC 创业者，只要 30-60 天内可报名 AI 赛事、AI 马拉松和云资源机会。",
    targetUser: "大湾区 OPC 创业者",
    watchingFor: ["可报名 AI 赛事", "AI 马拉松", "云资源", "奖金"],
    exclusions: ["展会资讯", "学生专属赛事", "培训广告"],
    confirmedRules: ["优先官方报名入口", "适合个人开发者或小团队"],
    rejectedPatterns: ["纯新闻报道", "历史活动"],
    lastFeedback: "不要展会资讯，只要报名入口和云资源。",
  });
  await post(app, `/api/radar-chats/${chatWindowId}/messages`, {
    role: "user",
    content: "我是大湾区 OPC，想找 AI 马拉松和 AI Agent Hackathon。",
  });
  await post(app, `/api/radar-chats/${chatWindowId}/messages`, {
    role: "user",
    content: "不要学生专属，也不要展会新闻，要能报名和提交作品。",
  });

  const generated = await post(app, "/api/radars/generate", {
    description: "继续帮我画雷达",
    chatWindowId,
  });
  const prompt = adapter.latestPrompt();
  check("generate API succeeds with chatWindowId", generated.status === 200 && generated.json.success === true, `${generated.status} ${json(generated.json.error)}`);
  check("generate prompt includes memory summary", /大湾区 OPC 创业者/.test(prompt) && /30-60 天内可报名 AI 赛事/.test(prompt), prompt.slice(0, 800));
  check("generate prompt includes recent chat messages", /AI Agent Hackathon/.test(prompt) && /不要学生专属/.test(prompt), prompt.slice(0, 800));
  check("generate response exposes safe context diagnostics", generated.json.data?.chatContextUsed === true && Number(generated.json.data?.chatContext?.messageCount ?? 0) >= 2, json(generated.json.data?.chatContext));
  check("generated radar keeps contextual identity", /OPC|大湾区/.test(json(generated.json.data?.radarVersion)) && /AI/.test(json(generated.json.data?.radarVersion)), json(generated.json.data?.radarVersion));
}

runSourceChecks()
  .then(runApiCheck)
  .then(() => {
    if (fail > 0) {
      console.error(`Q.7 generate context: ${pass} PASS / ${fail} FAIL`);
      process.exit(1);
    }
    console.log(`Q.7 generate context: ${pass} PASS / ${fail} FAIL`);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
