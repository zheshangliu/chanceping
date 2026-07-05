import type { LLMAdapter } from "./llm-adapter";
import type { RadarReportInput } from "./radar-report-generator";
import type { LiveLlmPublicProfile } from "../config/live-llm-profile";
import type { FieldEvidenceName, FieldEvidenceStatus } from "../schema/radar-mvp-contracts";
import { parseJsonWithRepair } from "../utils/json-repair";

export interface LiveLlmEvidenceExplanationItem {
  title: string;
  opportunityValue: string;
  suggestedAction: string;
  riskNote: string;
  evidenceBasis: string;
  reviewNeeded: string[];
}

export interface LiveLlmEvidenceExplanation {
  profile: LiveLlmPublicProfile;
  generatedAt: string;
  items: LiveLlmEvidenceExplanationItem[];
  globalNotes: string[];
}

const ACTION_FIELDS: FieldEvidenceName[] = [
  "registration_or_application_signal",
  "date_or_deadline",
  "fee",
  "eligibility",
  "contact_or_application_route",
];

const FIELD_LABELS: Record<FieldEvidenceName, string> = {
  title: "标题",
  source_url: "来源链接",
  source_domain: "来源域名",
  source_type: "来源类型",
  registration_or_application_signal: "报名 / 申请信号",
  date_or_deadline: "日期 / 截止时间",
  fee: "费用",
  eligibility: "资格 / 适合对象",
  contact_or_application_route: "联系人 / 行动入口",
};

const FORBIDDEN_OVERCLAIMS = [
  "已确认报名资格",
  "已核验报名资格",
  "已确认费用",
  "已核验费用",
  "已确认截止日期",
  "已核验截止日期",
  "已确认联系人",
  "已核验联系人",
  "已确认报名状态",
  "已核验报名状态",
  "已确认版权义务",
  "已核验版权义务",
];

function compactText(value: unknown, fallback: string, maxLength = 160): string {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  return (text || fallback).slice(0, maxLength);
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? "").trim()).filter(Boolean).slice(0, 5);
}

function fieldStatus(
  statuses: Array<{ field: FieldEvidenceName; status: FieldEvidenceStatus }>,
  field: FieldEvidenceName,
): FieldEvidenceStatus | "missing" {
  return statuses.find((item) => item.field === field)?.status ?? "missing";
}

function reviewNeededFromEvidence(
  statuses: Array<{ field: FieldEvidenceName; status: FieldEvidenceStatus }>,
): string[] {
  return ACTION_FIELDS
    .filter((field) => {
      const status = fieldStatus(statuses, field);
      return status !== "verified" && status !== "partially_verified";
    })
    .map((field) => `${FIELD_LABELS[field]}待复核`);
}

function safeReviewPhrase(claim: string): string {
  if (/报名资格/.test(claim)) return "报名资格待复核";
  if (/费用/.test(claim)) return "费用待复核";
  if (/截止日期/.test(claim)) return "截止日期待复核";
  if (/联系人/.test(claim)) return "联系人待复核";
  if (/报名状态/.test(claim)) return "报名状态待复核";
  if (/版权义务/.test(claim)) return "版权义务待复核";
  return "关键事实待复核";
}

function sanitizeForbiddenOverclaims(text: string): string {
  return FORBIDDEN_OVERCLAIMS.reduce((result, claim) => (
    result.split(claim).join(safeReviewPhrase(claim))
  ), text);
}

function safeCompactText(value: unknown, fallback: string, maxLength = 160): string {
  return sanitizeForbiddenOverclaims(compactText(value, fallback, maxLength));
}

function buildPromptPayload(input: RadarReportInput): Record<string, unknown> {
  return {
    radar_profile: {
      identity: input.spec.profile_summary?.identity ?? input.spec.primary_subject ?? input.spec.client_profile.business_type,
      target: input.spec.profile_summary?.target ?? input.spec.core_goals.primary_goal,
      priorities: input.spec.profile_summary?.priorities ?? input.spec.core_goals.priority_order,
      regions_and_time: input.spec.profile_summary?.regionsAndTime ?? input.spec.core_goals.success_definition,
      exclusions: input.spec.profile_summary?.exclusions ?? input.spec.filter_rules.must_exclude,
      assumptions: input.spec.profile_summary?.assumptions ?? [],
    },
    candidate_accounting: input.candidateAccounting,
    opened_urls: (input.executionLog?.openedUrls ?? []).slice(0, 5).map((item) => ({
      url: item.url,
      status: item.status,
      title: item.title,
      word_count: item.wordCount,
      error_type: item.errorType,
    })),
    opportunities: input.opportunities.slice(0, 5).map((opp) => ({
      title: opp.title,
      type: opp.type,
      level: opp.visible_level,
      source_url: opp.official_source_url,
      source_domain: opp.field_evidence?.find((item) => item.field === "source_domain")?.value,
      match_reason: opp.match_reason,
      next_action: opp.next_action,
      risk_note: opp.risk_note,
      evidence_statuses: (opp.field_evidence ?? []).map((item) => ({
        field: item.field,
        status: item.status,
        basis: item.basis,
        value: item.value,
        source_domain: item.sourceDomain,
      })),
      review_needed: reviewNeededFromEvidence(opp.field_evidence ?? []),
    })),
  };
}

function normalizeExplanation(
  raw: unknown,
  input: RadarReportInput,
  profile: LiveLlmPublicProfile,
): LiveLlmEvidenceExplanation {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const rawItems = Array.isArray(obj.explanations) ? obj.explanations : [];
  const fallbackItems = input.opportunities.slice(0, 5).map((opp) => ({
    title: opp.title,
    opportunity_value: "与雷达画像有一定匹配，但仍需结合来源字段复核后行动。",
    suggested_action: "先打开官方来源，核对报名/申请入口、截止时间、资格和费用。",
    risk_note: "搜索发现不等于事实核验，关键行动字段需人工复核。",
    evidence_basis: "基于机会卡等级、匹配理由和字段级 evidence status 的模型判断。",
    review_needed: reviewNeededFromEvidence(opp.field_evidence ?? []),
  }));
  const sourceItems = rawItems.length > 0 ? rawItems : fallbackItems;
  const items = sourceItems.slice(0, 5).map((item, index) => {
    const record = (item ?? {}) as Record<string, unknown>;
    const opp = input.opportunities[index];
    const evidenceReview = reviewNeededFromEvidence(opp?.field_evidence ?? []);
    const normalized = {
      title: safeCompactText(record.title, opp?.title ?? `机会 ${index + 1}`, 120),
      opportunityValue: safeCompactText(record.opportunity_value, "模型判断：与画像存在匹配，但价值需结合来源复核。"),
      suggestedAction: safeCompactText(record.suggested_action, "先核对官方来源中的行动入口和关键条件。"),
      riskNote: safeCompactText(record.risk_note, "关键事实未全部核验，行动前需复核。"),
      evidenceBasis: safeCompactText(record.evidence_basis, "基于搜索发现、字段 evidence status 和机会卡匹配理由。"),
      reviewNeeded: Array.from(new Set([...stringArray(record.review_needed).map(sanitizeForbiddenOverclaims), ...evidenceReview])).slice(0, 6),
    };
    return normalized;
  });
  const globalNotes = stringArray(obj.global_notes).map((note) => safeCompactText(note, "模型判断，需复核", 180));

  return {
    profile,
    generatedAt: new Date().toISOString(),
    items,
    globalNotes: globalNotes.length > 0
      ? globalNotes
      : ["以下解释属于模型判断；搜索发现不等于字段级事实核验。"],
  };
}

export async function generateLiveLlmEvidenceExplanation(
  llmAdapter: LLMAdapter,
  input: RadarReportInput,
  profile: LiveLlmPublicProfile,
): Promise<LiveLlmEvidenceExplanation> {
  const payload = buildPromptPayload(input);
  const response = await llmAdapter.chat({
    response_format: "json",
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content: [
          "你是 ChancePing 的证据解释器，只能基于输入的 evidence status 解释机会价值、行动建议和风险。",
          "你必须保守：搜索发现不能写成已核验事实。",
          "不得编造截止时间、费用、资格、联系人、报名状态、版权义务或获奖义务。",
          "没有字段级 evidence 的内容必须写成模型判断或待复核。",
          "只输出 JSON，不要输出 Markdown。",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          "请基于下面 JSON 生成证据解释，返回结构：",
          "{",
          '  "explanations": [',
          "    {",
          '      "title": "机会标题",',
          '      "opportunity_value": "为什么可能值得关注，必须标注为模型判断",',
          '      "suggested_action": "下一步建议，不能声称已确认资格/费用/截止时间",',
          '      "risk_note": "风险提醒，强调待复核项",',
          '      "evidence_basis": "解释依据，引用 evidence status 而不是编造事实",',
          '      "review_needed": ["待复核字段"]',
          "    }",
          "  ],",
          '  "global_notes": ["全局说明"]',
          "}",
          "",
          JSON.stringify(payload),
        ].join("\n"),
      },
    ],
  });
  const parsed = parseJsonWithRepair<Record<string, unknown>>(response.content);
  return normalizeExplanation(parsed, input, profile);
}
