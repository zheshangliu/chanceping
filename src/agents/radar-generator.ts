/**
 * RadarGenerator —— AI 雷达规格生成器（V1.5-05 新增）
 *
 * 来源：Task V1.5-05 第 3.2 节。
 *
 * 从自然语言描述生成 RadarRequirementSpec：
 *   1. 拼接 description + uploadedText 作为 LLM 输入
 *   2. 调用 LLM 生成 ExtractedRequirementInfo JSON
 *   3. JSON 修复（parseJsonWithRepair）
 *   4. 调用 RadarSpecCompiler.compile(info, "custom") 编译 Spec
 *   5. 调用 RadarSpecValidator 校验字段完整率
 *   6. 生成建议名称（从 info.opportunity_type.primary_types 取前 2 个 + "雷达"）
 *   7. 返回 RadarGenerateResult
 *
 * Mock 模式（LLM_MODE=mock）：不调 LLM，直接返回预设的 ExtractedRequirementInfo。
 */

import type { LLMAdapter } from "./llm-adapter";
import type { ExtractedRequirementInfo } from "../schema/extracted-requirement-info";
import type { RadarRequirementSpec, SourceStrategy } from "../schema/radar-requirement-spec";
import type { RadarProfileSummary } from "../schema/radar-profile-summary";
import type { RadarVersionSpec } from "../schema/radar-version-spec";
import { RadarSpecCompiler } from "./radar-spec-compiler";
import { RadarSpecValidator } from "../schema/radar-spec-validator";
import { parseJsonWithRepair } from "../utils/json-repair";
import { getLlmMode } from "../demo/data-mode";
import { buildRadarProfileSummary, questionsToConfirmPayload } from "./radar-profile-summary";
import { buildRadarVersionSpec } from "./radar-version-builder";
import { extractGenericMockRequirement, extractIdentity, interpretRequirement } from "./radar-requirement-interpreter";
import {
  RADAR_GENERATOR_SYSTEM_PROMPT,
  RADAR_GENERATOR_USER_PROMPT,
} from "../prompts/radar-generator-prompt";

// ============================================================
// 类型定义
// ============================================================

/** 雷达生成结果 */
export interface RadarGenerateResult {
  /** 生成的 RadarSpec */
  spec: RadarRequirementSpec;
  /** AI 建议的雷达名称（≤20 字） */
  suggestedName: string;
  /** 提取的结构化信息（用于调试和展示） */
  extractedInfo: ExtractedRequirementInfo;
  /** 字段完整率（0-100） */
  completeness: number;
  /** MVP chat-first: customer-visible profile summary */
  profileSummary: RadarProfileSummary;
  /** Chat-first radar builder: executable radar version for confirmation and search planning. */
  radarVersion: RadarVersionSpec;
  /** MVP chat-first: backend confidence copied from spec.requirement_confidence.total */
  requirementConfidence: number;
  /** MVP chat-first: normalized questions for frontend clarification */
  questionsToConfirm: Array<{ id: string; question: string; priority: number }>;
}

// ============================================================
// 常量
// ============================================================

/** 建议名称最大长度 */
const SUGGESTED_NAME_MAX_LEN = 20;

function createEmptySourceStrategy(): SourceStrategy {
  return {
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
  };
}

// ============================================================
// Mock 数据
// ============================================================

/** Mock mode uses a generic semantic fallback and leaves unknown fields empty. */
function createMockExtractedInfo(description: string): ExtractedRequirementInfo {
  return extractGenericMockRequirement(description);
}

function preserveExplicitIdentity(info: ExtractedRequirementInfo, description: string): ExtractedRequirementInfo {
  const explicitIdentity = extractIdentity(description.trim());
  if (!explicitIdentity) return info;
  return {
    ...info,
    client_identity: {
      ...info.client_identity,
      business_type: explicitIdentity,
    },
  };
}

// ============================================================
// 辅助函数
// ============================================================

/** 取数组值，缺失返回空数组 */
function arrOrEmpty<T>(v: T[] | undefined): T[] {
  return Array.isArray(v) ? v : [];
}

/**
 * 从 ExtractedRequirementInfo 生成建议名称（≤20 字）。
 * 规则：取 opportunity_type.primary_types 前 2 个 + "雷达"。
 */
function generateSuggestedName(info: ExtractedRequirementInfo): string {
  const primaryTypes = arrOrEmpty(info.opportunity_type?.primary_types);
  if (primaryTypes.length === 0) {
    const identity = info.client_identity?.business_type?.trim();
    return identity ? `${identity}雷达`.slice(0, SUGGESTED_NAME_MAX_LEN) : "我的自定义雷达";
  }
  const top2 = primaryTypes.slice(0, 2).join("");
  const name = `${top2}雷达`;
  // 截断到最大长度
  return name.length > SUGGESTED_NAME_MAX_LEN
    ? name.slice(0, SUGGESTED_NAME_MAX_LEN)
    : name;
}

function generateSuggestedNameFromRadarVersion(radarVersion: RadarVersionSpec, fallback: string): string {
  const base = radarVersion.oneSentencePositioning
    .split("/")[0]
    .replace(/机会雷达|雷达/g, "")
    .trim();
  const name = base ? `${base}雷达` : fallback;
  return name.length > SUGGESTED_NAME_MAX_LEN ? name.slice(0, SUGGESTED_NAME_MAX_LEN) : name;
}

function sourceNameFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function addUserSource(strategy: SourceStrategy, sourceName: string, sourceUrl: string): void {
  const normalizedUrl = sourceUrl.trim();
  if (!normalizedUrl) return;
  const exists = strategy.user_supplied_sources.some((source) => source.source_url === normalizedUrl);
  if (exists) return;
  strategy.user_supplied_sources.push({
    source_name: sourceName || sourceNameFromUrl(normalizedUrl),
    source_url: normalizedUrl,
    added_at: new Date().toISOString(),
    contributed_by: "user",
  });
}

function addManualSource(strategy: SourceStrategy, sourceName: string): void {
  const name = sourceName.trim();
  if (!name || strategy.manual_sources.includes(name)) return;
  strategy.manual_sources.push(name);
}

function applySourceHintsFromText(spec: RadarRequirementSpec, text: string): RadarRequirementSpec {
  const sourceStrategy: SourceStrategy = {
    ...createEmptySourceStrategy(),
    ...(spec.source_strategy ?? {}),
    user_supplied_sources: [...(spec.source_strategy?.user_supplied_sources ?? [])],
    manual_sources: [...(spec.source_strategy?.manual_sources ?? [])],
    source_priority: [...(spec.source_strategy?.source_priority ?? [])],
  };

  const urlMatches = text.match(/https?:\/\/[^\s，。；;、)）]+/gi) ?? [];
  for (const url of urlMatches) {
    addUserSource(sourceStrategy, sourceNameFromUrl(url), url);
  }

  if (/ITTF/i.test(text)) {
    addUserSource(sourceStrategy, "ITTF", "https://www.ittf.com/");
  }
  if (/WTT|World\s*Table\s*Tennis/i.test(text)) {
    addUserSource(sourceStrategy, "WTT", "https://worldtabletennis.com/");
  }
  if (/中国乒协|乒协官网|CTTA/i.test(text)) {
    addManualSource(sourceStrategy, "中国乒协官网");
  }
  const namedSourceSegment = text.match(/优先(?:看|查|关注)?\s*([^，,。\n；;]+)/)?.[1] ?? "";
  for (const sourceName of namedSourceSegment.split(/[、和或]/)) {
    if (/官网|平台|协会|政府网站|官方网站/.test(sourceName)) {
      addManualSource(sourceStrategy, sourceName.trim());
    }
  }

  sourceStrategy.source_priority = Array.from(new Set([
    ...sourceStrategy.source_priority,
    ...sourceStrategy.user_supplied_sources.map((source) => source.source_name),
    ...sourceStrategy.manual_sources,
  ]));

  return {
    ...spec,
    source_strategy: sourceStrategy,
  };
}

/**
 * 规范化 LLM 返回的 ExtractedRequirementInfo。
 * 确保所有必需字段存在（缺失时用空值填充）。
 */
function normalizeExtractedInfo(raw: unknown): ExtractedRequirementInfo {
  const rawObj = (raw ?? {}) as Record<string, unknown>;
  const obj = (
    rawObj.extracted_info && typeof rawObj.extracted_info === "object"
      ? rawObj.extracted_info
      : rawObj
  ) as Record<string, unknown>;
  const er = (obj.exclusion_rules ?? {}) as Record<string, unknown>;
  const mustExclude = arrOrEmpty(er.must_exclude as string[] | undefined);

  return {
    client_identity: (obj.client_identity ?? {}) as ExtractedRequirementInfo["client_identity"],
    business_goal: (obj.business_goal ?? {}) as ExtractedRequirementInfo["business_goal"],
    opportunity_type: (obj.opportunity_type ?? {}) as ExtractedRequirementInfo["opportunity_type"],
    region_scope: (obj.region_scope ?? {}) as ExtractedRequirementInfo["region_scope"],
    exclusion_rules: {
      must_exclude: mustExclude,
      low_priority_signals: arrOrEmpty(er.low_priority_signals as string[] | undefined),
      count: typeof er.count === "number" ? er.count : mustExclude.length,
    },
    action_scenario: (obj.action_scenario ?? {}) as ExtractedRequirementInfo["action_scenario"],
    report_format: (obj.report_format ?? {}) as ExtractedRequirementInfo["report_format"],
    opportunity_strategy: obj.opportunity_strategy && typeof obj.opportunity_strategy === "object"
      ? obj.opportunity_strategy as ExtractedRequirementInfo["opportunity_strategy"]
      : undefined,
  };
}

// ============================================================
// RadarGenerator 类
// ============================================================

/**
 * AI 雷达规格生成器。
 * 从自然语言描述生成 RadarRequirementSpec。
 */
export class RadarGenerator {
  private readonly llmAdapter: LLMAdapter;
  private readonly specCompiler: RadarSpecCompiler;
  private readonly validator: RadarSpecValidator;

  constructor(llmAdapter: LLMAdapter) {
    this.llmAdapter = llmAdapter;
    this.specCompiler = new RadarSpecCompiler();
    this.validator = new RadarSpecValidator();
  }

  /**
   * 从自然语言生成 RadarRequirementSpec。
   *
   * @param description 用户自然语言描述（如"我要盯 RPA 相关的比赛"）
   * @param uploadedText 可选的上传文件解析文本（追加到 description）
   * @returns 生成结果：spec + suggestedName + extractedInfo + completeness
   */
  async generate(
    description: string,
    uploadedText?: string,
  ): Promise<RadarGenerateResult> {
    // 拼接描述
    const fullDescription = uploadedText
      ? `${description}\n\n[上传文件内容]\n${uploadedText}`
      : description;

    // 判断 Mock 模式（V1.6a 自检修复:用 getLlmMode() 替代 process.env,确保默认值一致）
    const isMockMode = getLlmMode() === "mock";

    let extractedInfo: ExtractedRequirementInfo;

    if (isMockMode) {
      // Mock 模式：返回预设数据
      extractedInfo = createMockExtractedInfo(fullDescription);
    } else {
      // 真实模式：调用 LLM
      extractedInfo = await this.extractInfoViaLLM(fullDescription);
    }
    extractedInfo = preserveExplicitIdentity(extractedInfo, fullDescription);

    const interpretation = interpretRequirement(fullDescription, extractedInfo);

    // 编译 Spec
    const spec = applySourceHintsFromText(
      this.specCompiler.compile(extractedInfo, "custom", interpretation),
      fullDescription,
    );
    const profileSummary = buildRadarProfileSummary(spec);
    spec.primary_subject = profileSummary.identity;
    spec.profile_version = spec.profile_version ?? 1;
    spec.profile_summary = profileSummary;
    const radarVersion = buildRadarVersionSpec({
      spec,
      description: fullDescription,
      profileSummary,
      strategyDraft: extractedInfo.opportunity_strategy,
    });
    spec.radar_version = radarVersion;

    // 校验完整率
    const validation = this.validator.validate(spec);

    // 生成建议名称
    const suggestedName = generateSuggestedNameFromRadarVersion(radarVersion, generateSuggestedName(extractedInfo));

    return {
      spec,
      suggestedName,
      extractedInfo,
      completeness: validation.completeness,
      profileSummary,
      radarVersion,
      requirementConfidence: spec.requirement_confidence.total,
      questionsToConfirm: questionsToConfirmPayload(spec.questions_to_confirm),
    };
  }

  /**
   * 调用 LLM 提取 ExtractedRequirementInfo。
   * @param description 用户描述
   * @returns ExtractedRequirementInfo
   */
  private async extractInfoViaLLM(description: string): Promise<ExtractedRequirementInfo> {
    try {
      const response = await this.llmAdapter.chat({
        messages: [
          { role: "system", content: RADAR_GENERATOR_SYSTEM_PROMPT },
          { role: "user", content: RADAR_GENERATOR_USER_PROMPT(description) },
        ],
        response_format: "json",
        temperature: 0.3,
      });

      // JSON 修复解析
      const parsed = parseJsonWithRepair<Record<string, unknown>>(response.content);
      return normalizeExtractedInfo(parsed);
    } catch {
      // A provider/network failure still produces a draft only. The user must
      // confirm it before searching, so this never fabricates a search result.
      return createMockExtractedInfo(description);
    }
  }
}
