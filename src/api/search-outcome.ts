import type { DataMode } from "../demo/data-mode";
import type { SearchOrchestratorResult } from "../search/orchestrator";

export type SearchRunOutcomeStatus = "succeeded" | "no_results" | "insufficient_results" | "failed";

export interface SearchRunOutcome {
  status: SearchRunOutcomeStatus;
  message: string;
  canSaveRadar: boolean;
  canRetry: boolean;
  canSwitchToDemo: boolean;
  errorCode?: string;
}

function liveSearchErrorCode(liveValidationError: string): string {
  return liveValidationError.includes("LIVE_PROVIDER_MOCK_MODE_BLOCKED")
    ? "LIVE_PROVIDER_MOCK_MODE_BLOCKED"
    : "LIVE_SEARCH_FAILED";
}

export function buildSearchRunOutcome(
  result: SearchOrchestratorResult,
  dataMode: DataMode,
  liveValidationError?: string | null,
): SearchRunOutcome {
  const isLive = dataMode === "live";
  const cardCount = result.opportunityCards?.length ?? 0;
  const rawCount = result.total_raw ?? result.rawCandidates?.length ?? 0;
  if (liveValidationError) {
    const errorCode = liveSearchErrorCode(liveValidationError);
    const prefix = errorCode === "LIVE_PROVIDER_MOCK_MODE_BLOCKED"
      ? "本轮真实搜索环境错误"
      : "本轮真实搜索失败";
    return {
      status: "failed",
      message: `${prefix}：${liveValidationError} 雷达策略已生成，你可以先保存这个雷达，之后继续盯机会。`,
      canSaveRadar: true,
      canRetry: true,
      canSwitchToDemo: isLive,
      errorCode,
    };
  }
  if (rawCount === 0) {
    return {
      status: "no_results",
      message: isLive
        ? "本轮真实搜索没有发现候选来源，但雷达策略已生成。你可以先保存这个雷达，之后继续盯机会。"
        : "本轮没有发现候选来源，但雷达策略已生成。你可以先保存这个雷达，之后继续盯机会。",
      canSaveRadar: true,
      canRetry: true,
      canSwitchToDemo: isLive,
      errorCode: "NO_RESULTS",
    };
  }
  if (cardCount === 0) {
    return {
      status: "insufficient_results",
      message: isLive
        ? "本轮真实搜索结果不足，没有形成重点机会卡。雷达策略已生成，你可以先保存后继续监控。"
        : "本轮搜索结果不足，没有形成重点机会卡。雷达策略已生成，你可以先保存后继续监控。",
      canSaveRadar: true,
      canRetry: true,
      canSwitchToDemo: isLive,
      errorCode: "INSUFFICIENT_RESULTS",
    };
  }
  return {
    status: "succeeded",
    message: `本轮发现 ${cardCount} 条重点机会。`,
    canSaveRadar: true,
    canRetry: true,
    canSwitchToDemo: false,
  };
}

export function withSearchRunOutcome<T extends SearchOrchestratorResult>(
  result: T,
  dataMode: DataMode,
  liveValidationError?: string | null,
): T & { runOutcome: SearchRunOutcome } {
  const existingErrors = result.errors ?? [];
  const errors = liveValidationError && !existingErrors.includes(liveValidationError)
    ? [...existingErrors, liveValidationError]
    : existingErrors;
  return {
    ...result,
    errors,
    opportunityCards: result.opportunityCards ?? [],
    sourceCandidates: result.sourceCandidates ?? [],
    sourceHintChecks: result.sourceHintChecks ?? [],
    rawCandidates: result.rawCandidates ?? [],
    runOutcome: buildSearchRunOutcome({ ...result, errors }, dataMode, liveValidationError),
  };
}
