export type LiveLlmProfileName = "commercial" | "contest";
export type LiveLlmProvider = "deepseek" | "qwen";

export interface LiveLlmApiProfile {
  profile: LiveLlmProfileName;
  provider: LiveLlmProvider;
  model: string;
  baseUrl: string;
  apiKey: string;
}

export interface LiveLlmPublicProfile {
  profile: LiveLlmProfileName;
  provider: LiveLlmProvider;
  model: string;
}

export type LiveLlmProfileErrorCode =
  | "LIVE_LLM_DISABLED"
  | "LIVE_LLM_PRODUCTION_DISABLED"
  | "LIVE_LLM_PROFILE_MISSING"
  | "LIVE_LLM_PROFILE_UNSUPPORTED"
  | "LIVE_LLM_PROVIDER_UNSUPPORTED"
  | "LIVE_LLM_CONFIG_MISSING";

export class LiveLlmProfileError extends Error {
  readonly code: LiveLlmProfileErrorCode;

  constructor(code: LiveLlmProfileErrorCode, message: string) {
    super(message);
    this.name = "LiveLlmProfileError";
    this.code = code;
  }
}

export interface ResolveLiveLlmProfileOptions {
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  nodeEnv?: string;
}

const ENABLE_LOCAL_LIVE_LLM = "CHANCEPING_ENABLE_LOCAL_LIVE_LLM";

function readEnv(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
  key: string,
): string {
  return String(env[key] ?? "").trim();
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function parseProfileName(value: string): LiveLlmProfileName {
  if (value === "commercial" || value === "contest") {
    return value;
  }
  throw new LiveLlmProfileError(
    "LIVE_LLM_PROFILE_UNSUPPORTED",
    `不支持的 CHANCEPING_LLM_PROFILE：${value || "未设置"}`,
  );
}

function parseProvider(value: string): LiveLlmProvider {
  const provider = value.toLowerCase();
  if (provider === "deepseek" || provider === "qwen") {
    return provider;
  }
  throw new LiveLlmProfileError(
    "LIVE_LLM_PROVIDER_UNSUPPORTED",
    `不支持的 LLM provider：${value || "未设置"}`,
  );
}

function resolveCommercialProfile(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
): LiveLlmApiProfile {
  const legacyDeepSeekKey = readEnv(env, "DEEPSEEK_API_KEY");
  const provider = readEnv(env, "COMMERCIAL_LLM_PROVIDER") || (legacyDeepSeekKey ? "deepseek" : "");
  const model = readEnv(env, "COMMERCIAL_LLM_MODEL") || readEnv(env, "DEEPSEEK_MODEL") || (legacyDeepSeekKey ? "deepseek-chat" : "");
  const baseUrl = readEnv(env, "COMMERCIAL_LLM_BASE_URL") || readEnv(env, "DEEPSEEK_BASE_URL") || (legacyDeepSeekKey ? "https://api.deepseek.com/v1" : "");
  const apiKey = readEnv(env, "COMMERCIAL_LLM_API_KEY") || legacyDeepSeekKey;
  const missing = [
    ["COMMERCIAL_LLM_PROVIDER", provider],
    ["COMMERCIAL_LLM_MODEL", model],
    ["COMMERCIAL_LLM_BASE_URL", baseUrl],
    ["COMMERCIAL_LLM_API_KEY", apiKey],
  ].filter(([, value]) => !value).map(([key]) => key);

  if (missing.length > 0) {
    throw new LiveLlmProfileError(
      "LIVE_LLM_CONFIG_MISSING",
      `commercial LLM profile 配置缺失：${missing.join(", ")}`,
    );
  }

  return {
    profile: "commercial",
    provider: parseProvider(provider),
    model,
    baseUrl: normalizeBaseUrl(baseUrl),
    apiKey,
  };
}

function resolveContestProfile(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
): LiveLlmApiProfile {
  const legacyQwenKey = readEnv(env, "DASHSCOPE_API_KEY");
  const provider = readEnv(env, "CONTEST_LLM_PROVIDER") || (legacyQwenKey ? "qwen" : "");
  const model = readEnv(env, "CONTEST_LLM_MODEL") || readEnv(env, "QWEN_MODEL") || (legacyQwenKey ? "qwen-plus" : "");
  const baseUrl = readEnv(env, "CONTEST_LLM_BASE_URL") || readEnv(env, "DASHSCOPE_BASE_URL") || (legacyQwenKey ? "https://dashscope.aliyuncs.com/compatible-mode/v1" : "");
  const apiKey = readEnv(env, "CONTEST_LLM_API_KEY") || legacyQwenKey;
  const missing = [
    ["CONTEST_LLM_PROVIDER", provider],
    ["CONTEST_LLM_MODEL", model],
    ["CONTEST_LLM_BASE_URL", baseUrl],
    ["CONTEST_LLM_API_KEY", apiKey],
  ].filter(([, value]) => !value).map(([key]) => key);

  if (missing.length > 0) {
    throw new LiveLlmProfileError(
      "LIVE_LLM_CONFIG_MISSING",
      `contest LLM profile 配置缺失：${missing.join(", ")}`,
    );
  }

  return {
    profile: "contest",
    provider: parseProvider(provider),
    model,
    baseUrl: normalizeBaseUrl(baseUrl),
    apiKey,
  };
}

export function isLocalLiveLlmExplicitlyEnabled(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
  nodeEnv: string = env.NODE_ENV ?? process.env.NODE_ENV ?? "",
): boolean {
  return readEnv(env, ENABLE_LOCAL_LIVE_LLM) === "true" && nodeEnv !== "production";
}

export function resolveLiveLlmProfile(
  options: ResolveLiveLlmProfileOptions = {},
): LiveLlmApiProfile {
  const env = options.env ?? process.env;
  const nodeEnv = options.nodeEnv ?? env.NODE_ENV ?? process.env.NODE_ENV ?? "";
  if (nodeEnv === "production") {
    throw new LiveLlmProfileError(
      "LIVE_LLM_PRODUCTION_DISABLED",
      "production 环境默认拒绝 live LLM",
    );
  }
  if (readEnv(env, ENABLE_LOCAL_LIVE_LLM) !== "true") {
    throw new LiveLlmProfileError(
      "LIVE_LLM_DISABLED",
      "live LLM 只允许本地显式开启：CHANCEPING_ENABLE_LOCAL_LIVE_LLM=true",
    );
  }

  const profileValue = readEnv(env, "CHANCEPING_LLM_PROFILE");
  if (!profileValue) {
    throw new LiveLlmProfileError(
      "LIVE_LLM_PROFILE_MISSING",
      "CHANCEPING_LLM_PROFILE 必须显式设置为 commercial 或 contest",
    );
  }

  const profile = parseProfileName(profileValue);
  return profile === "commercial"
    ? resolveCommercialProfile(env)
    : resolveContestProfile(env);
}

export function toLiveLlmPublicProfile(profile: LiveLlmApiProfile): LiveLlmPublicProfile {
  return {
    profile: profile.profile,
    provider: profile.provider,
    model: profile.model,
  };
}
