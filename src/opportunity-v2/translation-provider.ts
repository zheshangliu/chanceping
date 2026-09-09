import type { LLMAdapter } from "../agents/llm-adapter";
import { DeepSeekAdapter } from "../agents/deepseek-adapter";
import { QwenAdapter } from "../agents/qwen-adapter";
import { loadLocalApiEnv } from "../config/local-env";
import { resolveLiveLlmProfile, type LiveLlmApiProfile } from "../config/live-llm-profile";
import { createTranslatedOpportunityV2Translation, type OpportunityV2Translation } from "./display";
import type { OpportunityV2 } from "./types";

export interface OpportunityTranslationInput {
  title: string;
  summary: string;
  targetLanguage: "zh-CN";
}

export interface OpportunityTranslationResult {
  title_zh: string;
  summary_zh: string;
}

export interface OpportunityTranslationProvider {
  readonly id: string;
  readonly free: boolean;
  translate(input: OpportunityTranslationInput): Promise<OpportunityTranslationResult>;
}

export class TranslationProviderError extends Error {
  readonly code: "CREDENTIAL_NOT_CONFIGURED" | "PROVIDER_UNAVAILABLE" | "QUALITY_REJECTED";

  constructor(code: TranslationProviderError["code"], message: string) {
    super(message);
    this.name = "TranslationProviderError";
    this.code = code;
  }
}

export interface TranslationProviderConfig {
  providers: OpportunityTranslationProvider[];
  configuredFreeProviders: string[];
  deepseekConfigured: boolean;
  status: "READY" | "CREDENTIAL_NOT_CONFIGURED";
}

export function translationPrompt(input: OpportunityTranslationInput): { system: string; user: string } {
  return {
    system: "你是严格的中文赛事信息编辑。只根据给定来源原文，将标题和摘要翻译成简体中文。标题只保留赛事/征集名称，不要加入来源导航、Full details、Closing date或整张卡片内容。摘要只保留原文明确支持的主题、征集内容、提交形式、金额、年份和限制条件。保留专有名词、年份、金额、币种和否定条件；金额/费用必须出现在标题或摘要中，不得遗漏；没有原文支持的信息不要补写。若标题主要是品牌名或系列名且没有自然中文译名，可以保留该专有名词，不要为了翻译而臆造名称。来源摘要已经是中文时，直接保留其原文；不要输出空摘要。只返回JSON：{\"title_zh\":\"...\",\"summary_zh\":\"...\"}。",
    user: `原始标题：${input.title}\n原始摘要：${input.summary}`,
  };
}

export function createLlmTranslationProvider(id: "deepseek" | "qwen", adapter: LLMAdapter): OpportunityTranslationProvider {
  return {
    id,
    free: false,
    async translate(input) {
      const response = await adapter.chat({ response_format: "json", temperature: 0, messages: [
        { role: "system", content: translationPrompt(input).system },
        { role: "user", content: translationPrompt(input).user },
      ] });
      const parsed = response.parsed && typeof response.parsed === "object" ? response.parsed as Record<string, unknown> : {};
      const translatedSummary = String(parsed.summary_zh ?? "").trim();
      const translatedTitle = String(parsed.title_zh ?? "");
      const translatedText = `${translatedTitle} ${translatedSummary}`;
      const sourceCurrencyTokens = [...new Set((`${input.title}\n${input.summary}`.match(/(?:€|£|\$|¥|￥)\s?\d[\d,.]*/gu) ?? []))];
      const missingCurrencyTokens = sourceCurrencyTokens.filter((token) => !translatedText.replace(/\s+/gu, "").includes(token.replace(/\s+/gu, "")));
      const summaryWithFacts = [
        translatedSummary || (/^[\s\S]*[\u3400-\u9fff]/u.test(input.summary) ? input.summary : ""),
        ...missingCurrencyTokens.map((token) => `金额：${token}。`),
      ].filter(Boolean).join(" ");
      return {
        title_zh: translatedTitle,
        summary_zh: summaryWithFacts,
      };
    },
  };
}

function read(env: NodeJS.ProcessEnv | Record<string, string | undefined>, key: string): string {
  return String(env[key] ?? "").trim();
}

function makeLlmProvider(env: NodeJS.ProcessEnv | Record<string, string | undefined>, requested: "deepseek" | "qwen" = "deepseek"): OpportunityTranslationProvider | null {
  try {
    const profile = resolveLiveLlmProfile({ env }) as LiveLlmApiProfile;
    if (profile.provider !== requested) return null;
    const adapter = requested === "deepseek"
      ? new DeepSeekAdapter({ apiKey: profile.apiKey, model: profile.model, baseUrl: profile.baseUrl, mockMode: false, maxTokens: 4096 })
      : new QwenAdapter({ apiKey: profile.apiKey, model: profile.model, baseUrl: profile.baseUrl, mockMode: false, maxTokens: 4096 });
    return createLlmTranslationProvider(requested, adapter);
  } catch {
    return null;
  }
}

export function configuredTranslationProviders(env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env): TranslationProviderConfig {
  const providers: OpportunityTranslationProvider[] = [];
  const add = (factory: () => OpportunityTranslationProvider | null): void => {
    const provider = factory();
    if (provider && !providers.some((item) => item.id === provider.id)) providers.push(provider);
  };
  const selected = read(env, "CHANCEPING_TRANSLATION_PROVIDER").toLowerCase();
  const order = selected ? [selected, "azure", "google", "libretranslate", "deepseek"] : ["azure", "google", "libretranslate", "deepseek"];
  for (const id of order) {
    if (id === "azure") {
      const key = read(env, "AZURE_TRANSLATOR_KEY");
      const region = read(env, "AZURE_TRANSLATOR_REGION");
      if (key && region) {
        add(() => require("./translation-providers/azure-translator").createAzureTranslator({ key, region, endpoint: read(env, "AZURE_TRANSLATOR_ENDPOINT") || "https://api.cognitive.microsofttranslator.com" }));
      }
    } else if (id === "google") {
      const key = read(env, "GOOGLE_TRANSLATE_API_KEY");
      if (key) add(() => require("./translation-providers/google-translator").createGoogleTranslator({ key, endpoint: read(env, "GOOGLE_TRANSLATE_ENDPOINT") || "https://translation.googleapis.com" }));
    } else if (id === "libretranslate") {
      const url = read(env, "LIBRETRANSLATE_URL");
      if (url) add(() => require("./translation-providers/libretranslate").createLibreTranslate({ url, apiKey: read(env, "LIBRETRANSLATE_API_KEY") || undefined }));
    } else if (id === "deepseek") {
      add(() => makeLlmProvider(env));
    } else if (id === "qwen") {
      add(() => makeLlmProvider(env, "qwen"));
    }
  }
  return {
    providers,
    configuredFreeProviders: providers.filter((provider) => provider.free).map((provider) => provider.id),
    deepseekConfigured: providers.some((provider) => provider.id === "deepseek"),
    status: providers.length ? "READY" : "CREDENTIAL_NOT_CONFIGURED",
  };
}

export interface TranslationAttemptResult {
  translation: OpportunityV2Translation;
  provider_id: string | null;
  fallback_to_deepseek: boolean;
  characters_sent_to_free_provider: number;
  attempts: string[];
}

export async function translateWithProviderChain(
  item: OpportunityV2,
  providers: OpportunityTranslationProvider[],
  now = new Date(),
): Promise<TranslationAttemptResult> {
  const attempts: string[] = [];
  let characters = 0;
  let sawFreeFailure = false;
  for (const provider of providers) {
    if (provider.free) {
      characters += item.title.length + item.summary.length;
      sawFreeFailure = true;
    }
    try {
      const result = await provider.translate({ title: item.title, summary: item.summary, targetLanguage: "zh-CN" });
      const translation = createTranslatedOpportunityV2Translation(item, result, now);
      if (translation.status !== "translated") {
        attempts.push(`${provider.id}:quality_rejected`);
        continue;
      }
      attempts.push(`${provider.id}:translated`);
      return { translation, provider_id: provider.id, fallback_to_deepseek: sawFreeFailure && provider.id === "deepseek", characters_sent_to_free_provider: characters, attempts };
    } catch (error) {
      attempts.push(`${provider.id}:${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const error = attempts.length ? attempts.join(" | ") : "translation provider is not configured";
  return { translation: { ...createTranslatedOpportunityV2Translation(item, { title_zh: "", summary_zh: "" }, now), status: "failed", error: error.slice(0, 240) }, provider_id: null, fallback_to_deepseek: false, characters_sent_to_free_provider: characters, attempts };
}
