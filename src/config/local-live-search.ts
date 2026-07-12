import type { DataMode } from "../demo/data-mode";
import type { SearchOrchestratorResult } from "../search/orchestrator";

export type SearchModeRequest = "mock" | "live";

export interface ResolveSearchDataModeOptions {
  requestedMode?: unknown;
  fallbackMode: DataMode;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  nodeEnv?: string;
}

export interface ResolveSearchDataModeResult {
  dataMode: DataMode;
  requestedLive: boolean;
  error?: {
    code: string;
    message: string;
    status: 403;
  };
}

export function isLocalLiveSearchEnabled(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
  nodeEnv = env.NODE_ENV ?? process.env.NODE_ENV ?? "",
): boolean {
  return env.CHANCEPING_ENABLE_LOCAL_LIVE_SEARCH === "true" && nodeEnv !== "production";
}

export function isLiveSearchExplicitlyEnabled(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
  nodeEnv = env.NODE_ENV ?? process.env.NODE_ENV ?? "",
): boolean {
  if (nodeEnv === "production") {
    return env.CHANCEPING_ENABLE_PRODUCTION_LIVE_SEARCH === "true";
  }
  return env.CHANCEPING_ENABLE_LOCAL_LIVE_SEARCH === "true";
}

export function resolveSearchDataMode(options: ResolveSearchDataModeOptions): ResolveSearchDataModeResult {
  const requestedMode = options.requestedMode === "live" ? "live" : options.requestedMode === "mock" ? "mock" : undefined;
  if (requestedMode === "mock") {
    return { dataMode: "mock", requestedLive: false };
  }
  if (requestedMode !== "live") {
    return { dataMode: options.fallbackMode, requestedLive: options.fallbackMode === "live" };
  }
  if (!isLiveSearchExplicitlyEnabled(options.env ?? process.env, options.nodeEnv)) {
    return {
      dataMode: options.fallbackMode,
      requestedLive: true,
      error: {
        code: "LIVE_SEARCH_DISABLED",
        message: "真实搜索未开启。请在对应环境显式开启后重试。",
        status: 403,
      },
    };
  }
  return { dataMode: "live", requestedLive: true };
}

function isMockLikeUrl(url: string): boolean {
  return /mock\.chanceping\.local|example\.(com|org|net|cn|edu)/i.test(url);
}

export function validateLiveSearchResult(result: SearchOrchestratorResult): string | null {
  const mockModeError = (result.errors ?? []).find((error) => error.includes("LIVE_PROVIDER_MOCK_MODE_BLOCKED"));
  if (mockModeError) {
    return mockModeError;
  }
  const rawCandidates = result.rawCandidates ?? [];
  const mockLike = rawCandidates.find((candidate) => isMockLikeUrl(candidate.url));
  if (mockLike) {
    return `真实搜索返回了演示候选 ${mockLike.sourceDomain || mockLike.url}，已阻止静默回退。`;
  }
  const demoCard = (result.opportunityCards ?? []).find((card) => card.is_demo_data === true || card.data_mode === "mock");
  if (demoCard) {
    return `真实搜索返回了演示机会「${demoCard.title}」，已阻止静默回退。`;
  }
  if (result.total_raw === 0 && result.errors.length > 0) {
    return `真实搜索失败或无真实候选：${result.errors.slice(0, 2).join("；")}`;
  }
  return null;
}
