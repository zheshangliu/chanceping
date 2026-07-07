import { loadLocalApiEnv } from "../src/config/local-env";
import {
  resolveLiveLlmProfile,
  toLiveLlmPublicProfile,
  type LiveLlmApiProfile,
  type LiveLlmProfileName,
} from "../src/config/live-llm-profile";
import { QwenAdapter } from "../src/agents/qwen-adapter";
import { DeepSeekAdapter } from "../src/agents/deepseek-adapter";
import type { LLMAdapter, LLMRequest } from "../src/agents/llm-adapter";

type PromptCase = {
  id: "requirement_understanding" | "result_feedback" | "report_explanation";
  request: LLMRequest;
};

type ComparisonResult = {
  promptId: PromptCase["id"];
  profile: LiveLlmProfileName;
  provider: string;
  model: string;
  ok: boolean;
  latencyMs: number;
  contentLength: number;
  parsedKeys: string[];
  errorCode?: string;
  outputPreview?: string;
};

const RUN_FLAG = "CHANCEPING_RUN_LLM_COMPARISON";
const PROMPTS: PromptCase[] = [
  {
    id: "requirement_understanding",
    request: {
      response_format: "json",
      temperature: 0.2,
      messages: [
        { role: "system", content: "你是 ChancePing 的雷达画像解释器。只输出 JSON。" },
        {
          role: "user",
          content: "我是大湾区 OPC 创业者，想找未来 30-60 天内仍可报名、适合个人开发者参加的 AI 比赛、Hackathon 和云资源扶持机会。",
        },
      ],
    },
  },
  {
    id: "result_feedback",
    request: {
      response_format: "json",
      temperature: 0.2,
      messages: [
        { role: "system", content: "你是 ChancePing 的雷达修订助手。只输出 JSON。" },
        {
          role: "user",
          content: "这些结果不对，我要能报名和提交作品的比赛，不要展会新闻、培训广告、学生专属比赛。",
        },
      ],
    },
  },
  {
    id: "report_explanation",
    request: {
      response_format: "text",
      temperature: 0.2,
      messages: [
        { role: "system", content: "你是 ChancePing 的报告解释助手。不能编造截止时间、奖金、资格或联系人。" },
        {
          role: "user",
          content: "基于一个已发现但字段待核验的 AI Hackathon 来源，给 OPC 创业者写 3 条行动建议和 2 条风险提醒。",
        },
      ],
    },
  },
];

function sanitize(text: string): string {
  let sanitized = text;
  for (const keyName of [
    "COMMERCIAL_LLM_API_KEY",
    "CONTEST_LLM_API_KEY",
    "DEEPSEEK_API_KEY",
    "DASHSCOPE_API_KEY",
  ]) {
    const value = process.env[keyName];
    if (value) sanitized = sanitized.split(value).join("[redacted]");
  }
  return sanitized.replace(/sk-[A-Za-z0-9_-]+/g, "[redacted]");
}

function createAdapter(profile: LiveLlmApiProfile): LLMAdapter {
  if (profile.provider === "qwen") {
    return new QwenAdapter({
      model: profile.model,
      apiKey: profile.apiKey,
      baseUrl: profile.baseUrl,
      mockMode: false,
    });
  }
  return new DeepSeekAdapter({
    model: profile.model,
    apiKey: profile.apiKey,
    baseUrl: profile.baseUrl,
    mockMode: false,
  });
}

async function compareProfile(profileName: LiveLlmProfileName): Promise<ComparisonResult[]> {
  const profileEnv: Record<string, string | undefined> = {
    ...process.env,
    CHANCEPING_ENABLE_LOCAL_LIVE_LLM: "true",
    CHANCEPING_LLM_PROFILE: profileName,
  };
  const profile = resolveLiveLlmProfile({ env: profileEnv, nodeEnv: "development" });
  const publicProfile = toLiveLlmPublicProfile(profile);
  const adapter = createAdapter(profile);
  const results: ComparisonResult[] = [];

  for (const prompt of PROMPTS) {
    const startedAt = Date.now();
    try {
      const response = await adapter.chat(prompt.request);
      const parsedKeys = response.parsed && typeof response.parsed === "object"
        ? Object.keys(response.parsed as Record<string, unknown>).slice(0, 12)
        : [];
      results.push({
        promptId: prompt.id,
        ...publicProfile,
        ok: true,
        latencyMs: Date.now() - startedAt,
        contentLength: response.content.length,
        parsedKeys,
        outputPreview: sanitize(response.content).slice(0, 180),
      });
    } catch (error) {
      results.push({
        promptId: prompt.id,
        ...publicProfile,
        ok: false,
        latencyMs: Date.now() - startedAt,
        contentLength: 0,
        parsedKeys: [],
        errorCode: sanitize(error instanceof Error ? error.message : String(error)).slice(0, 180),
      });
    }
  }

  return results;
}

async function main(): Promise<void> {
  if (process.env[RUN_FLAG] !== "true") {
    console.error(`${RUN_FLAG}=true is required. This comparison intentionally does not run from verify:all.`);
    process.exit(2);
  }

  const loaded = loadLocalApiEnv({ enabled: process.env.CHANCEPING_LOAD_API_ENV === "true" });
  console.log("QWEN_VS_DEEPSEEK_COMPARISON");
  console.log(`api.env status: ${loaded.reason}; keys: ${loaded.keysLoaded.concat(loaded.keysSkippedExisting).join(",") || "none"}`);
  console.log("This script records public profile/provider/model, latency, output shape, and a short sanitized preview only.");

  const results = [
    ...(await compareProfile("commercial")),
    ...(await compareProfile("contest")),
  ];

  console.log(`RESULT_JSON: ${JSON.stringify(results, null, 2)}`);
}

main().catch((error) => {
  console.error(sanitize(error instanceof Error ? error.message : String(error)));
  process.exit(1);
});
