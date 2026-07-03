import type { LLMAdapter } from "./llm-adapter";
import { reviseRadarVersion } from "./radar-version-reviser";
import type { RadarRequirementSpec } from "../schema/radar-requirement-spec";
import type {
  RadarRevisionRequest,
  RadarRevisionResult,
  RadarVersionDiff,
  RadarVersionQueryFamily,
  RadarVersionRevisionNote,
  RadarVersionSpec,
} from "../schema/radar-version-spec";
import type { OpportunityKind, SearchIntentType } from "../schema/radar-mvp-contracts";
import { parseJsonWithRepair } from "../utils/json-repair";

interface LlmRadarRevisionPayload {
  radarVersion?: Partial<RadarVersionSpec>;
  radar_version?: Partial<RadarVersionSpec>;
  radarDiff?: Partial<RadarVersionDiff>;
  radar_diff?: Partial<RadarVersionDiff>;
  suggestedName?: string;
  suggested_name?: string;
  confirmationPrompt?: string;
  confirmation_prompt?: string;
}

export interface RadarVersionLlmRevisionOptions {
  provider?: string;
  model?: string;
}

function unique(values: Array<string | undefined>, limit = 16): string[] {
  return Array.from(
    new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean)),
  ).slice(0, limit);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asStringArray(value: unknown, limit = 16): string[] {
  if (!Array.isArray(value)) return [];
  return unique(value.map((item) => typeof item === "string" ? item : undefined), limit);
}

function asRevisionNotes(value: unknown): RadarVersionRevisionNote[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set<RadarVersionRevisionNote["type"]>([
    "added",
    "removed",
    "upweighted",
    "downweighted",
    "assumption_changed",
    "query_shift",
    "source_shift",
  ]);
  return value
    .map((item) => {
      const record = asRecord(item);
      if (!record) return null;
      const type = asString(record.type) as RadarVersionRevisionNote["type"] | undefined;
      const detail = asString(record.detail);
      if (!type || !detail || !allowed.has(type)) return null;
      return { type, detail };
    })
    .filter((item): item is RadarVersionRevisionNote => Boolean(item))
    .slice(0, 20);
}

function diffToRevisionNotes(diff: RadarVersionDiff): RadarVersionRevisionNote[] {
  return [
    ...diff.added.map((detail) => ({ type: "added" as const, detail })),
    ...diff.removed.map((detail) => ({ type: "removed" as const, detail })),
    ...diff.upweighted.map((detail) => ({ type: "upweighted" as const, detail })),
    ...diff.downweighted.map((detail) => ({ type: "downweighted" as const, detail })),
    ...diff.assumptionChanges.map((detail) => ({ type: "assumption_changed" as const, detail })),
    ...diff.queryShifts.map((detail) => ({ type: "query_shift" as const, detail })),
    ...diff.sourceShifts.map((detail) => ({ type: "source_shift" as const, detail })),
  ].slice(0, 20);
}

function normalizeQueryFamily(value: unknown): RadarVersionQueryFamily | null {
  const record = asRecord(value);
  if (!record) return null;
  const familyName = asString(record.familyName) ?? asString(record.family_name);
  const sourceArchetype = asString(record.sourceArchetype) ?? asString(record.source_archetype);
  const whyThisFamily = asString(record.whyThisFamily) ?? asString(record.why_this_family);
  const queries = asStringArray(record.queries, 4);
  if (!familyName || !sourceArchetype || !whyThisFamily || queries.length === 0) return null;
  const intentType = (asString(record.intentType) ?? asString(record.intent_type) ?? "direct_opportunity") as SearchIntentType;
  const resultBucket = (asString(record.resultBucket) ?? asString(record.result_bucket) ?? intentType) as OpportunityKind;
  return {
    familyName,
    intentType,
    sourceArchetype,
    queries: queries.slice(0, 3),
    whyThisFamily,
    resultBucket,
  };
}

function normalizeQueryFamilies(value: unknown, fallback: RadarVersionQueryFamily[]): RadarVersionQueryFamily[] {
  const families = Array.isArray(value)
    ? value.map(normalizeQueryFamily).filter((family): family is RadarVersionQueryFamily => Boolean(family))
    : [];
  const seen = new Set<string>();
  const output: RadarVersionQueryFamily[] = [];
  for (const family of [...families, ...fallback]) {
    const key = `${family.familyName}::${family.sourceArchetype}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(family);
    if (output.length >= 8) break;
  }
  return output;
}

function hasForbiddenResultPayload(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasForbiddenResultPayload);
  const record = asRecord(value);
  if (!record) return false;
  const forbiddenKeys = new Set([
    "opportunityCards",
    "opportunity_cards",
    "opportunities",
    "searchResults",
    "search_results",
    "sourceCandidates",
    "source_candidates",
    "rawCandidates",
    "raw_candidates",
  ]);
  return Object.entries(record).some(([key, child]) => forbiddenKeys.has(key) || hasForbiddenResultPayload(child));
}

function parseLlmPayload(content: string, parsed?: unknown): { payload?: LlmRadarRevisionPayload; errors: string[] } {
  const raw = parsed && typeof parsed === "object" ? parsed : parseJsonWithRepair<unknown>(content);
  const record = asRecord(raw);
  if (!record) return { errors: ["LLM 输出不是 JSON object"] };
  if ("raw" in record) return { errors: ["LLM 输出无法解析为结构化 JSON"] };
  if (hasForbiddenResultPayload(record)) return { errors: ["LLM 输出包含搜索结果或机会卡字段，已拒绝"] };
  const radarVersion = asRecord(record.radarVersion) ?? asRecord(record.radar_version);
  const radarDiff = asRecord(record.radarDiff) ?? asRecord(record.radar_diff);
  if (!radarVersion && !radarDiff) return { errors: ["LLM 输出缺少 radarVersion/radarDiff"] };
  return {
    payload: record as LlmRadarRevisionPayload,
    errors: [],
  };
}

function mergeArray(draft: unknown, fallback: string[], limit = 16): string[] {
  const draftValues = asStringArray(draft, limit);
  return draftValues.length > 0 ? unique([...draftValues, ...fallback], limit) : fallback.slice(0, limit);
}

function mergeDiff(base: RadarVersionDiff, draft?: Partial<RadarVersionDiff>): RadarVersionDiff {
  if (!draft) return base;
  return {
    fromVersion: base.fromVersion,
    toVersion: base.toVersion,
    summary: asString(draft.summary) ?? base.summary,
    added: mergeArray(draft.added, base.added, 12),
    removed: mergeArray(draft.removed, base.removed, 12),
    upweighted: mergeArray(draft.upweighted, base.upweighted, 12),
    downweighted: mergeArray(draft.downweighted, base.downweighted, 12),
    assumptionChanges: mergeArray(draft.assumptionChanges, base.assumptionChanges, 12),
    queryShifts: mergeArray(draft.queryShifts, base.queryShifts, 12),
    sourceShifts: mergeArray(draft.sourceShifts, base.sourceShifts, 12),
    highValueCriteriaChanges: mergeArray(draft.highValueCriteriaChanges, base.highValueCriteriaChanges, 12),
    exclusionChanges: mergeArray(draft.exclusionChanges, base.exclusionChanges, 12),
  };
}

function mergeRadarVersion(base: RadarVersionSpec, draft: Partial<RadarVersionSpec> | undefined, diff: RadarVersionDiff): RadarVersionSpec {
  const revisionNotes = asRevisionNotes(draft?.revisionNotes);
  return {
    ...base,
    version: base.version,
    oneSentencePositioning: asString(draft?.oneSentencePositioning) ?? base.oneSentencePositioning,
    targetUser: asString(draft?.targetUser) ?? base.targetUser,
    businessContext: asString(draft?.businessContext) ?? base.businessContext,
    opportunityIntents: mergeArray(draft?.opportunityIntents, base.opportunityIntents, 14),
    highValueCriteria: unique([
      ...asStringArray(draft?.highValueCriteria, 14),
      ...diff.highValueCriteriaChanges,
      ...base.highValueCriteria,
    ], 14),
    exclusionRules: unique([
      ...asStringArray(draft?.exclusionRules, 14),
      ...diff.exclusionChanges,
      ...base.exclusionRules,
    ], 14),
    prioritySourceArchetypes: unique([
      ...asStringArray(draft?.prioritySourceArchetypes, 14),
      ...diff.sourceShifts,
      ...base.prioritySourceArchetypes,
    ], 14),
    queryFamilies: normalizeQueryFamilies(draft?.queryFamilies, base.queryFamilies),
    scoringRules: Array.isArray(draft?.scoringRules) ? draft.scoringRules as RadarVersionSpec["scoringRules"] : base.scoringRules,
    reportTemplate: mergeArray(draft?.reportTemplate, base.reportTemplate, 14),
    missingConfig: mergeArray(draft?.missingConfig, base.missingConfig, 14),
    defaultAssumptions: mergeArray(draft?.defaultAssumptions, base.defaultAssumptions, 14),
    revisionNotes: unique([
      ...revisionNotes.map((note) => `${note.type}:${note.detail}`),
      ...diffToRevisionNotes(diff).map((note) => `${note.type}:${note.detail}`),
      ...base.revisionNotes.map((note) => `${note.type}:${note.detail}`),
    ], 24).map((entry) => {
      const [type, ...detail] = entry.split(":");
      return { type: type as RadarVersionRevisionNote["type"], detail: detail.join(":") };
    }),
    resultBuckets: mergeArray(draft?.resultBuckets, base.resultBuckets, 12),
  };
}

function mergeSpec(base: RadarRequirementSpec, radarVersion: RadarVersionSpec, diff: RadarVersionDiff, input: RadarRevisionRequest): RadarRequirementSpec {
  return {
    ...base,
    client_profile: {
      ...base.client_profile,
      business_type: radarVersion.targetUser || base.client_profile.business_type,
      client_type: radarVersion.targetUser || base.client_profile.client_type,
    },
    core_goals: {
      ...base.core_goals,
      primary_goal: radarVersion.opportunityIntents[0] ?? base.core_goals.primary_goal,
      secondary_goals: unique([...radarVersion.opportunityIntents.slice(1), ...radarVersion.highValueCriteria, ...base.core_goals.secondary_goals], 14),
    },
    opportunity_scope: {
      ...base.opportunity_scope,
      primary_opportunity_types: unique([...radarVersion.opportunityIntents, ...base.opportunity_scope.primary_opportunity_types], 14),
      excluded_opportunity_types: unique([...radarVersion.exclusionRules, ...base.opportunity_scope.excluded_opportunity_types], 14),
      must_have_conditions: unique([...radarVersion.highValueCriteria, ...base.opportunity_scope.must_have_conditions], 14),
    },
    source_strategy: {
      ...(base.source_strategy ?? {
        official_sites: [],
        platforms: [],
        search_engines: [],
        social_media: [],
        rss_sources: [],
        manual_sources: [],
        source_priority: [],
        sources_used_in_report: [],
        user_supplied_sources: [],
        source_transparency_enabled: true,
      }),
      manual_sources: unique([
        ...(base.source_strategy?.manual_sources ?? []),
        ...radarVersion.prioritySourceArchetypes,
      ], 14),
      source_priority: unique([
        ...radarVersion.prioritySourceArchetypes,
        ...(base.source_strategy?.source_priority ?? []),
      ], 14),
    },
    filter_rules: {
      ...base.filter_rules,
      must_exclude: unique([...radarVersion.exclusionRules, ...base.filter_rules.must_exclude], 14),
      high_priority_signals: unique([...radarVersion.highValueCriteria, ...base.filter_rules.high_priority_signals], 14),
      low_priority_signals: unique([...diff.downweighted, ...base.filter_rules.low_priority_signals], 14),
    },
    keyword_strategy: {
      ...base.keyword_strategy,
      expanded_keywords_zh: unique([
        ...radarVersion.opportunityIntents,
        ...radarVersion.highValueCriteria,
        ...base.keyword_strategy.expanded_keywords_zh,
      ], 18),
      negative_keywords: unique([...radarVersion.exclusionRules, ...base.keyword_strategy.negative_keywords], 18),
    },
    confirmation_status: {
      ...(base.confirmation_status ?? {}),
      status: "confirmation_card_generated",
      user_confirmed: false,
      confirmed_at: "",
      last_user_feedback: input.userMessage,
      revision_count: (input.previousSpec.confirmation_status?.revision_count ?? 0) + 1,
    },
    radar_version: radarVersion,
  };
}

function fallbackResult(input: RadarRevisionRequest, errors: string[], options?: RadarVersionLlmRevisionOptions): RadarRevisionResult {
  const fallback = reviseRadarVersion(input);
  return {
    ...fallback,
    revisionSource: "llm_fallback",
    llmValidation: {
      attempted: true,
      used: false,
      fallbackUsed: true,
      errors,
      ...(options?.provider ? { provider: options.provider } : {}),
      ...(options?.model ? { model: options.model } : {}),
    },
  };
}

function buildPrompt(input: RadarRevisionRequest, base: RadarRevisionResult): string {
  return [
    "你是 ChancePing 的雷达版本修订器。你的任务不是搜索，不是生成机会卡，而是根据用户反馈修订 RadarVersionSpec。",
    "只输出 JSON object，不要 Markdown，不要解释。",
    "硬性规则：不得输出 opportunityCards、opportunities、searchResults、sourceCandidates、rawCandidates；不得编造搜索结果、截止时间、联系人、采购意向或报名状态。",
    "必须保持用户确认闸门：新版本只是 draft，用户确认前不能搜索。",
    "JSON 结构：{ radarVersion: Partial<RadarVersionSpec>, radarDiff: Partial<RadarVersionDiff>, suggestedName: string, confirmationPrompt: string }。",
    "请优先更新 targetUser、opportunityIntents、highValueCriteria、exclusionRules、prioritySourceArchetypes、queryFamilies、defaultAssumptions。",
    `用户本次反馈：${input.userMessage}`,
    `触发类型：${input.trigger}`,
    `上一版雷达：${JSON.stringify(input.previousRadarVersion)}`,
    `本地确定性草稿：${JSON.stringify({
      version: base.radarVersion.version,
      radarVersion: base.radarVersion,
      radarDiff: base.radarDiff,
    })}`,
    input.resultFeedback ? `结果反馈：${JSON.stringify(input.resultFeedback)}` : "",
  ].filter(Boolean).join("\n\n");
}

export async function reviseRadarVersionWithLlm(
  input: RadarRevisionRequest,
  llmAdapter: LLMAdapter | undefined,
  options: RadarVersionLlmRevisionOptions = {},
): Promise<RadarRevisionResult> {
  if (!llmAdapter) {
    return fallbackResult(input, ["缺少 LLM adapter"], options);
  }

  const base = reviseRadarVersion(input);
  let payload: LlmRadarRevisionPayload | undefined;
  try {
    const response = await llmAdapter.chat({
      messages: [
        {
          role: "system",
          content: "你只负责把用户反馈转成可执行的 RadarVersionSpec 修订草稿。严禁生成搜索结果或机会卡。",
        },
        { role: "user", content: buildPrompt(input, base) },
      ],
      response_format: "json",
      temperature: 0.2,
    });
    const parsed = parseLlmPayload(response.content, response.parsed);
    if (parsed.errors.length > 0 || !parsed.payload) {
      return fallbackResult(input, parsed.errors, options);
    }
    payload = parsed.payload;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fallbackResult(input, [`LLM 调用失败：${message}`], options);
  }

  const draftRadar = payload.radarVersion ?? payload.radar_version;
  const draftDiff = payload.radarDiff ?? payload.radar_diff;
  const mergedDiff = mergeDiff(base.radarDiff, draftDiff);
  const mergedRadar = mergeRadarVersion(base.radarVersion, draftRadar, mergedDiff);
  const mergedSpec = mergeSpec(base.spec, mergedRadar, mergedDiff, input);
  return {
    spec: mergedSpec,
    radarVersion: mergedRadar,
    radarDiff: mergedDiff,
    suggestedName: asString(payload.suggestedName) ?? asString(payload.suggested_name) ?? base.suggestedName,
    confirmationPrompt: asString(payload.confirmationPrompt) ?? asString(payload.confirmation_prompt) ?? `我已把雷达升级为 ${mergedRadar.version}。请确认是否按 ${mergedRadar.version} 盯一次。`,
    shouldSearchAfterConfirm: true,
    revisionSource: "llm",
    llmValidation: {
      attempted: true,
      used: true,
      fallbackUsed: false,
      errors: [],
      ...(options.provider ? { provider: options.provider } : {}),
      ...(options.model ? { model: options.model } : {}),
    },
  };
}
