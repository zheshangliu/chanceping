/**
 * 雷达报告生成器（radar_report_generator）
 *
 * 来源：Task 012 第 4 节。
 *
 * 输入：RadarRequirementSpec + OpportunityCard[]
 * 输出：符合 9 章节结构的雷达报告 Markdown
 *
 * 规则：
 *   - 确认度 ≥ 95% 且状态为 confirmed / ready_for_radar_plan：生成雷达报告 V0.4
 *   - 确认度 < 95% 或未确认：拒绝生成，返回 error
 *   - 机会按 visible_level（S/A/B/C）自动分组到对应章节
 *   - hidden 机会不进卡片，进入第 7 章节「不建议投入的机会」
 *   - 截止日期在 7 天内的机会进入第 4 章节「即将截止机会」
 *   - 空机会不拒绝生成，产出「本周暂无机会」的空报告
 *   - 所有内容从 Spec + 机会数据规则映射，不接入 LLM，不编造信息
 *
 * 雷达报告 ≠ 雷达方案。雷达报告是每周产出的含具体机会卡片的报告。
 */

import type { RadarRequirementSpec } from "../schema/radar-requirement-spec";
import type { OpportunityCard, OpportunityCardStatus } from "../schema/opportunity-card";
import type { VisibleLevel } from "../schema/scoring-rules";
import type { SourceCandidate } from "../schema/source-candidate";
import type { EvidenceItem } from "../schema/evidence-item";
import type { CandidateAccounting, FieldEvidenceItem, FieldEvidenceName, SearchExecutionLog } from "../schema/radar-mvp-contracts";
import type { RawCandidateAudit } from "../search/types";
import type { SourceHintCheck } from "../search/source-hints";
import type { LiveLlmEvidenceExplanation } from "./live-llm-report-explainer";
import { CONFIDENCE_GRADE_LABELS, SOURCE_TYPE_LABELS } from "../schema/source-candidate";
import { EVIDENCE_FIELD_LABELS } from "../schema/evidence-item";
import { BRAND } from "../brand/constants";
import { t } from "../i18n/locales";

// ============================================================
// 类型定义
// ============================================================

/** 雷达报告生成输入 */
export interface RadarReportInput {
  /** Task 009 编译产出的 Spec（含雷达方案配置） */
  spec: RadarRequirementSpec;
  /** 机会卡片数组（V0.4 阶段人工提供，V0.8 起搜索层自动产出） */
  opportunities: OpportunityCard[];
  /** 雷达类型（影响标题展示） */
  radar_type: "ai_competition" | "opc_policy" | "cultural_heritage" | "custom";
  /** 报告周期开始日期（YYYY-MM-DD） */
  period_start: string;
  /** 报告周期结束日期（YYYY-MM-DD） */
  period_end: string;
  /** 报告生成时间（ISO 字符串，可选，默认当前时间） */
  generated_at?: string;
  /** V1.3 新增：来源候选数据（可选，用于来源索引章节） */
  sourceCandidates?: SourceCandidate[];
  /** V1.3 新增：证据项数据（可选，用于来源索引章节的待复核字段） */
  evidenceItems?: EvidenceItem[];
  /** MVP UX Rescue：雷达画像展示（可选，前端可传入中文画像对象） */
  profile?: unknown;
  /** MVP UX Rescue：客户指定信号源检查状态 */
  sourceHintChecks?: SourceHintCheck[];
  /** Chat-first MVP：本次搜索候选统计，只能来自 run 结果。 */
  candidateAccounting?: CandidateAccounting;
  /** Live Evidence MVP：有限网页读取日志。 */
  executionLog?: SearchExecutionLog;
  /** Live Evidence MVP：原始候选审计摘要。 */
  rawCandidates?: RawCandidateAudit[];
  /** Live LLM MVP：基于字段证据的模型解释。 */
  liveLlmEvidenceExplanation?: LiveLlmEvidenceExplanation;
}

/** 雷达报告生成结果 */
export interface RadarReportResult {
  /** 是否成功生成 */
  success: boolean;
  /** 生成的 Markdown 雷达报告（success=true 时有值） */
  markdown: string | null;
  /** 失败原因（success=false 时有值） */
  error: string | null;
  /** 报告版本 */
  version: "V0.4";
  /** 生成时间（ISO 字符串） */
  generated_at: string;
  /** 报告统计 */
  stats: {
    total_opportunities: number;
    s_count: number;
    a_count: number;
    b_count: number;
    c_count: number;
    /** V1.3 新增：D 级（不推荐）数量 */
    d_count: number;
    hidden_count: number;
    expiring_soon_count: number;  // 7 天内截止
    excluded_count: number;       // 被排除的数量
    /** V1.3 新增：来源数量 */
    source_count: number;
    /** V1.3 新增：证据项数量 */
    evidence_count: number;
  };
  /** 章节数量（固定 9） */
  sections_count: number;
}

// ============================================================
// 雷达类型映射表（内置常量，非品牌文案）
// ============================================================

const RADAR_TYPE_NAMES: Record<RadarReportInput["radar_type"], string> = {
  ai_competition: "AI 赛事雷达",
  opc_policy: "OPC 政策雷达",
  cultural_heritage: "文创非遗雷达",
  custom: "自定义机会雷达",
};

// ============================================================
// 辅助函数
// ============================================================

/** 字符串格式化：空 → 「未明确」 */
function fmtStr(v: string | undefined): string {
  return typeof v === "string" && v.trim() !== "" ? v : "未明确";
}

/** 字符串数组格式化：用「、」连接；空 → 「暂无」 */
function fmtArr(v: string[] | undefined): string {
  return Array.isArray(v) && v.length > 0 ? v.join("、") : "暂无";
}

/** URL 格式化：空 → 「需人工复核」 */
function fmtUrl(v: string | undefined): string {
  return typeof v === "string" && v.trim() !== "" ? v : "需人工复核";
}

function isDemoOpportunity(opp: OpportunityCard): boolean {
  return opp.is_demo_data === true || opp.data_mode === "mock" || /演示|测试数据|mock/i.test(`${opp.risk_note}${opp.source_disclaimer ?? ""}`);
}

function isLiveOpportunity(opp: OpportunityCard): boolean {
  return opp.data_mode === "live" || /搜索发现|待复核/.test(`${opp.source_disclaimer ?? ""}`);
}

function fmtOpportunitySource(opp: OpportunityCard): string {
  if (isDemoOpportunity(opp)) {
    return "演示数据，未真实核验";
  }
  if (isLiveOpportunity(opp)) {
    return `${fmtUrl(opp.official_source_url)}（搜索发现，待复核）`;
  }
  return fmtUrl(opp.official_source_url);
}

/** 联系方式格式化：空 → 「未找到公开信息」 */
function fmtContact(v: string | undefined): string {
  return typeof v === "string" && v.trim() !== "" ? v : "未找到公开信息";
}

/** 机会状态映射到中文 */
function fmtStatus(status: OpportunityCardStatus): string {
  const map: Record<OpportunityCardStatus, string> = {
    new: "新发现",
    viewed: "已查看",
    tracking: "跟踪中",
    saved: "已保存",
    applied: "已报名",
    missed: "已错过",
    expired: "已过期",
    archived: "已归档",
    dismissed: "已忽略",
  };
  return map[status] ?? status;
}

/** 取 visible_level（含 hidden，用类型断言处理） */
function getVisibleLevel(opp: OpportunityCard): VisibleLevel {
  return opp.visible_level as VisibleLevel;
}

/** 解析日期字符串为 Date 对象（只取日期部分，忽略时分秒） */
function parseDate(dateStr: string): Date {
  // 取 YYYY-MM-DD 部分
  const datePart = dateStr.split("T")[0].split(" ")[0];
  const d = new Date(datePart + "T00:00:00Z");
  return d;
}

/** 计算距今天数（向下取整，基准日期到截止日期） */
function daysUntilDeadline(deadline: string, baseDate: Date): number {
  const d = parseDate(deadline);
  const diffMs = d.getTime() - baseDate.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/** 判断是否即将截止（7 天内含当天） */
function isExpiringSoon(deadline: string, baseDate: Date): boolean {
  const days = daysUntilDeadline(deadline, baseDate);
  return days >= 0 && days <= 7;
}

/** 判断是否已截止 */
function isExpired(deadline: string, baseDate: Date): boolean {
  const days = daysUntilDeadline(deadline, baseDate);
  return days < 0;
}

/**
 * 判断机会是否被排除（进入第 7 章节）。
 * 排除条件：
 *   - visible_level === "hidden"
 *   - 机会类型在 excluded_opportunity_types 中
 *   - 机会标题/类型匹配 must_exclude 关键词
 *   - 已截止（deadline < 基准日期）
 */
function isExcluded(
  opp: OpportunityCard,
  spec: RadarRequirementSpec,
  baseDate: Date,
): { excluded: boolean; reason: string } {
  const level = getVisibleLevel(opp);
  // hidden
  if (level === "hidden") {
    return { excluded: true, reason: "等级为 hidden，不主动展示" };
  }
  // V1.3 新增：D 级（不推荐）进入排除章节
  if (level === "D") {
    return { excluded: true, reason: "等级为 D（不推荐），不建议投入" };
  }

  // 类型匹配排除
  const excludedTypes = spec.opportunity_scope.excluded_opportunity_types ?? [];
  if (excludedTypes.some((t) => opp.type.includes(t) || t.includes(opp.type))) {
    return { excluded: true, reason: `机会类型在排除列表中（${opp.type}）` };
  }

  // 关键词匹配排除
  const mustExclude = spec.filter_rules.must_exclude ?? [];
  for (const kw of mustExclude) {
    if (opp.title.includes(kw) || opp.type.includes(kw)) {
      return { excluded: true, reason: `标题/类型匹配排除关键词「${kw}」` };
    }
  }

  // 已截止
  if (isExpired(opp.deadline, baseDate)) {
    return { excluded: true, reason: "机会已截止" };
  }

  return { excluded: false, reason: "" };
}

// ============================================================
// 各章节生成函数
// ============================================================

/** 元信息（标题 + 周期 + 版本 + 目标用户 + 生成时间） */
function buildHeader(
  spec: RadarRequirementSpec,
  radarTypeName: string,
  periodStart: string,
  periodEnd: string,
  generatedAt: string,
): string {
  const cp = spec.client_profile;
  const userType = fmtStr(cp.client_type);
  const industry = fmtStr(cp.industry);
  return [
    `# ${BRAND.product_name}｜本周${radarTypeName}报告`,
    "",
    `周期：${periodStart} 至 ${periodEnd}`,
    `雷达版本：V0.4`,
    `目标用户：${userType}（${industry}）`,
    `报告生成时间：${generatedAt}`,
    "",
    "---",
  ].join("\n");
}

/** 章节 0：本周一句话判断 */
function buildSection0(
  radarTypeName: string,
  stats: RadarReportResult["stats"],
  sLevelOpps: OpportunityCard[],
  expiringSoon: OpportunityCard[],
): string {
  const lines: string[] = [`## ${t("report.section.overview")}`, ""];

  if (stats.total_opportunities === 0) {
    lines.push(`本周${radarTypeName}暂无符合条件的新机会，下周继续追踪。`);
  } else {
    const topS = sLevelOpps[0];
    const expiringCount = expiringSoon.length;
    if (topS) {
      const reasonSummary = topS.match_reason.length > 40
        ? topS.match_reason.slice(0, 40) + "..."
        : topS.match_reason;
      lines.push(
        `本周${radarTypeName}共发现 ${stats.total_opportunities} 条机会（S 级 ${stats.s_count} 条，即将截止 ${expiringCount} 条），` +
        `对用户最直接的信号是「${topS.title}」——${reasonSummary}，建议本周优先关注。`,
      );
    } else {
      lines.push(
        `本周${radarTypeName}共发现 ${stats.total_opportunities} 条机会，无 S 级机会，` +
        `即将截止 ${expiringCount} 条，建议关注 A 级机会。`,
      );
    }
  }

  lines.push("", "---");
  return lines.join("\n");
}

/** 章节 1-3：S/A/B 级机会 */
function buildLevelSection(
  level: "S" | "A" | "B",
  opps: OpportunityCard[],
): string {
  const sectionTitleKey =
    level === "S" ? "report.section.sLevel" : level === "A" ? "report.section.aLevel" : "report.section.bLevel";
  const lines: string[] = [`## ${t(sectionTitleKey)}`, ""];

  if (opps.length === 0) {
    lines.push(`本周暂无 ${level} 级机会`);
  } else {
    opps.forEach((opp, i) => {
      lines.push(`### ${level}${i + 1}. ${opp.title}`);
      lines.push(`- 推荐理由：${opp.match_reason}`);
      lines.push(`- 行动窗口：${opp.deadline}`);
      if (i < opps.length - 1) lines.push("");
    });
  }

  lines.push("", "---");
  return lines.join("\n");
}

/** 章节 4：即将截止机会 */
function buildSection4(
  expiringSoon: Array<{ opp: OpportunityCard; days: number }>,
  periodStart: string,
  periodEnd: string,
): string {
  const lines: string[] = [`## ${t("report.section.expiringSoon")}`, ""];
  lines.push(`> 截止日期在 7 天内（${periodStart} 至 ${periodEnd}）的机会。`);
  lines.push("");

  if (expiringSoon.length === 0) {
    lines.push("本周无机会进入 7 天倒计时窗口");
  } else {
    lines.push("| 机会 | 等级 | 截止日期 | 距今天数 | 建议 |");
    lines.push("|---|---|---|---|---|");
    for (const { opp, days } of expiringSoon) {
      const level = getVisibleLevel(opp);
      lines.push(`| ${opp.title} | ${level} | ${opp.deadline} | ${days} 天 | ${opp.next_action} |`);
    }
  }

  lines.push("", "---");
  return lines.join("\n");
}

/** 章节 5：机会详情卡片 */
function buildSection5(opps: OpportunityCard[]): string {
  const lines: string[] = [`## ${t("report.section.detailCard")}`, ""];

  if (opps.length === 0) {
    lines.push("本周暂无机会详情卡片");
  } else {
    opps.forEach((opp, i) => {
      const level = getVisibleLevel(opp);
      lines.push(`### ${opp.title}`);
      lines.push("");
      lines.push(`- 推荐等级：${level}`);
      lines.push(`- 机会类型：${opp.type}`);
      lines.push(`- 主办方 / 发布方：${opp.organizer}`);
      lines.push(`- 地区：${opp.region}`);
      lines.push(`- 截止日期：${opp.deadline}`);
      lines.push(`- 奖励 / 补贴 / 价值：${opp.reward_or_value}`);
      lines.push(`- 适合对象：${opp.eligibility}`);
      lines.push(`- 为什么适合你：${opp.match_reason}`);
      lines.push(`- 下一步行动建议：${opp.next_action}`);
      lines.push(`- 官方来源链接：${fmtUrl(opp.official_source_url)}`);
      lines.push(`- 报名链接：${fmtUrl(opp.application_url)}`);
      lines.push(`- 联系方式：${fmtContact(opp.contact_info)}`);
      lines.push(`- 风险提醒：${opp.risk_note}`);
      lines.push(`- 是否建议保存：${opp.status === "saved" || opp.status === "new" ? "是" : "否"}`);
      lines.push(`- 是否需要截止提醒：${opp.deadline ? "是" : "否"}`);
      if (i < opps.length - 1) lines.push("");
    });
  }

  lines.push("", "---");
  return lines.join("\n");
}

/** 章节 6：本周建议行动 */
function buildSection6(
  sOpps: OpportunityCard[],
  aOpps: OpportunityCard[],
  expiringSoon: Array<{ opp: OpportunityCard; days: number }>,
  requiresManualReview: string[],
  bOpps: OpportunityCard[],
  baseDate: Date,
): string {
  const lines: string[] = [`## ${t("report.section.suggestedAction")}`, ""];

  const allOpps = [...sOpps, ...aOpps, ...bOpps];
  if (allOpps.length === 0) {
    lines.push("本周暂无机会，下周继续追踪");
    lines.push("", "---");
    return lines.join("\n");
  }

  // 1. 最优先行动：S 级中即将截止的 1 条
  const sExpiring = sOpps.find((o) => isExpiringSoon(o.deadline, baseDate));
  if (sExpiring) {
    lines.push(`1. 本周最优先行动：${sExpiring.title}（S 级，即将截止）`);
  } else if (expiringSoon.length > 0) {
    lines.push(`1. 本周最优先行动：${expiringSoon[0].opp.title}（即将截止）`);
  } else if (sOpps.length > 0) {
    lines.push(`1. 本周最优先行动：${sOpps[0].title}（S 级）`);
  } else {
    lines.push("1. 本周最优先行动：暂无 S 级即将截止机会");
  }

  // 2. 建议收藏：A 级中高价值
  if (aOpps.length > 0) {
    lines.push(`2. 本周建议收藏：${aOpps[0].title}（A 级高价值）`);
  } else {
    lines.push("2. 本周建议收藏：暂无 A 级机会");
  }

  // 3. 建议放弃
  lines.push("3. 本周建议放弃：见第 7 节");

  // 4. 需要人工复核
  if (requiresManualReview.length > 0) {
    lines.push(`4. 本周需要人工复核：${requiresManualReview[0]}`);
  } else {
    lines.push("4. 本周需要人工复核：暂无");
  }

  // 5. 下周继续追踪：B 级中远期
  const bFar = bOpps.find((o) => !isExpiringSoon(o.deadline, baseDate));
  if (bFar) {
    lines.push(`5. 下周继续追踪：${bFar.title}（B 级远期）`);
  } else if (bOpps.length > 0) {
    lines.push(`5. 下周继续追踪：${bOpps[0].title}（B 级）`);
  } else {
    lines.push("5. 下周继续追踪：暂无 B 级远期机会");
  }

  lines.push("", "---");
  return lines.join("\n");
}

/** 章节 7：不建议投入的机会 */
function buildSection7(
  excluded: Array<{ opp: OpportunityCard; reason: string }>,
): string {
  const lines: string[] = [`## ${t("report.section.excluded")}`, ""];
  lines.push("> 以下机会经筛选规则过滤后排除（excluded_opportunity_types / must_exclude / visible_level=hidden）。");
  lines.push("");

  if (excluded.length === 0) {
    lines.push("本周无排除机会");
  } else {
    excluded.forEach((item, i) => {
      lines.push(`${i + 1}. ${item.opp.title}`);
      lines.push(`   - 排除原因：${item.reason}`);
      lines.push(`   - 处理建议：直接排除 / 归档`);
    });
  }

  lines.push("", "---");
  return lines.join("\n");
}

/** 章节 8：下周继续追踪 */
function buildSection8(
  bOpps: OpportunityCard[],
  spec: RadarRequirementSpec,
  baseDate: Date,
): string {
  const lines: string[] = [`## ${t("report.section.nextWeekTracking")}`, ""];

  const hasItems = bOpps.length > 0 || (spec.keyword_strategy.core_keywords_zh?.length ?? 0) > 0;

  if (!hasItems) {
    lines.push("下周继续扫描新机会");
  } else {
    // B 级远期机会
    const bFar = bOpps.filter((o) => !isExpiringSoon(o.deadline, baseDate));
    for (const opp of bFar.slice(0, 3)) {
      lines.push(`- ${opp.title}：${opp.deadline}，${opp.next_action}`);
    }

    // 持续扫描关键词
    const coreKw = spec.keyword_strategy.core_keywords_zh ?? [];
    if (coreKw.length > 0) {
      lines.push(`- 持续扫描 ${coreKw.join("、")} 相关新机会`);
    }

    // 跟踪平台
    const platforms = spec.source_strategy?.platforms ?? [];
    if (platforms.length > 0) {
      lines.push(`- 跟踪 ${platforms.join("、")} 平台更新`);
    }
  }

  lines.push("");
  return lines.join("\n");
}

/** 章节 8.5：来源索引（V1.3 新增）
 *
 * 安全红线 #5：报告来源索引只能从 SourceCandidate[] 渲染，不调用 LLM，不编造 URL。
 * 按 SourceConfidenceGrade 排序（A1 > A2 > ... > E5），并列出待复核字段。
 */
function buildSourceIndex(
  sources: SourceCandidate[],
  evidence: EvidenceItem[],
): string {
  const lines: string[] = [`## ${t("report.section.sourceIndex")}`, ""];
  lines.push("> 本报告所有机会的来源信息，按可信度等级排列。");
  lines.push("");

  if (sources.length === 0) {
    lines.push("本周暂无来源信息");
    lines.push("", "---");
    return lines.join("\n");
  }

  // 按可信度等级排序（A1 > A2 > B1 > ... > E5）
  const gradeOrder: Record<string, number> = {
    A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C3: 6, D4: 7, E5: 8,
  };
  const sorted = [...sources].sort((a, b) =>
    (gradeOrder[a.confidenceGrade] ?? 99) - (gradeOrder[b.confidenceGrade] ?? 99),
  );

  lines.push("| # | 来源 | 类型 | 可信度 | 验证状态 | 链接 |");
  lines.push("|---|---|---|---|---|---|");
  sorted.forEach((s, i) => {
    const typeLabel = SOURCE_TYPE_LABELS[s.sourceType] ?? s.sourceType;
    const gradeLabel = CONFIDENCE_GRADE_LABELS[s.confidenceGrade] ?? s.confidenceGrade;
    const statusLabel =
      s.verificationStatus === "verified" ? "✓ 已验证"
        : s.verificationStatus === "partially_verified" ? "◐ 部分验证"
          : s.verificationStatus === "rejected" ? "✗ 已拒绝"
            : "○ 未验证";
    lines.push(
      `| ${i + 1} | ${s.mediaName} | ${typeLabel} | ${s.confidenceGrade}（${gradeLabel}） | ${statusLabel} | [查看](${s.url}) |`,
    );
  });

  // 待复核字段
  const needsReview = evidence.filter((e) => e.needsReview);
  if (needsReview.length > 0) {
    lines.push("");
    lines.push("### 待复核字段");
    lines.push("");
    needsReview.forEach((e) => {
      const fieldLabel = EVIDENCE_FIELD_LABELS[e.field] ?? e.field;
      lines.push(`- ${fieldLabel}：${e.value}（来源可信度不足，需人工复核）`);
    });
  }

  lines.push("", "---");
  return lines.join("\n");
}

/** 本周结论 */
function buildConclusion(
  sOpps: OpportunityCard[],
  aOpps: OpportunityCard[],
  bOpps: OpportunityCard[],
  expiringSoon: Array<{ opp: OpportunityCard; days: number }>,
  requiresManualReview: string[],
  baseDate: Date,
): string {
  const lines: string[] = [`## ${t("report.section.conclusion")}`, ""];

  const allOpps = [...sOpps, ...aOpps, ...bOpps];
  if (allOpps.length === 0) {
    lines.push("本周暂无机会，下周继续追踪");
    return lines.join("\n");
  }

  // 最值得优先行动：S 级中即将截止的 1 条
  const sExpiring = sOpps.find((o) => isExpiringSoon(o.deadline, baseDate))
    ?? (expiringSoon.length > 0 && getVisibleLevel(expiringSoon[0].opp) === "S" ? expiringSoon[0].opp : undefined)
    ?? sOpps[0];
  lines.push(`本周最值得优先行动的是：${sExpiring ? sExpiring.title : "暂无"}`);

  // 最适合保存观察：高价值但远期（S/A 级 + deadline > 14 天）
  const farHighValue = [...sOpps, ...aOpps].find((o) => daysUntilDeadline(o.deadline, baseDate) > 14);
  lines.push(`最适合保存观察的是：${farHighValue ? farHighValue.title : "暂无"}`);

  // 最需要人工复核
  lines.push(`最需要人工复核的是：${requiresManualReview.length > 0 ? requiresManualReview[0] : "暂无"}`);

  // 下周最应该继续追踪：B 级中远期 1 条
  const bFar = bOpps.find((o) => !isExpiringSoon(o.deadline, baseDate)) ?? bOpps[0];
  lines.push(`下周最应该继续追踪的是：${bFar ? bFar.title : "暂无"}`);

  return lines.join("\n");
}

function mvpSourceNames(spec: RadarRequirementSpec): string[] {
  const ss = spec.source_strategy;
  if (!ss) return [];
  return [
    ...(ss.user_supplied_sources ?? []).map((source) => source.source_url || source.source_name),
    ...(ss.manual_sources ?? []),
  ].filter(Boolean);
}

function getProfileValue(profile: unknown, key: string): unknown {
  if (!profile || typeof profile !== "object") return undefined;
  return (profile as Record<string, unknown>)[key];
}

function fmtUnknownArr(value: unknown): string {
  if (Array.isArray(value)) {
    return value.length > 0 ? value.map((item) => String(item)).join("、") : "暂无";
  }
  if (typeof value === "string" && value.trim()) return value;
  return "暂无";
}

function hasTimeSignal(value: string): boolean {
  return /(?:未来|接下来)?\s*\d+\s*(?:天|周|个月|月|年)|本周|本月|近期|长期|季度|截止|before|within\s+\d+\s+(?:days?|weeks?|months?)/i.test(value);
}

function mvpTimeRange(input: RadarReportInput): string {
  const profileValue = fmtUnknownArr(getProfileValue(input.profile, "时间范围"));
  const candidates = [
    profileValue,
    ...(input.spec.radar_version?.highValueCriteria ?? []),
    ...(input.spec.radar_version?.defaultAssumptions ?? []),
    ...(input.spec.core_goals.priority_order ?? []),
    input.spec.core_goals.success_definition,
  ];
  for (const candidate of candidates) {
    const parts = String(candidate ?? "").split(/[；;]/).map((part) => part.trim()).filter(Boolean);
    const match = parts.find(hasTimeSignal);
    if (match) return match;
  }
  return "近期可行动机会";
}

function buildMvpHeader(spec: RadarRequirementSpec, periodStart: string, periodEnd: string): string {
  const radarName = spec.core_goals.primary_goal || spec.client_profile.business_type || "我的机会雷达";
  return [
    "# ChancePing｜本周机会雷达报告",
    "",
    `雷达：${radarName}`,
    `周期：${periodStart} 至 ${periodEnd}`,
    "",
  ].join("\n");
}

function buildMvpDemoNotice(opps: OpportunityCard[]): string {
  if (!opps.some(isDemoOpportunity)) return "";
  return [
    "> 注意：本报告包含演示 / 测试数据，未真实联网搜索或核验官网。",
    "> 请勿把演示机会当作真实截止时间、参赛资格、报名费用、联系人或 BD 意向。",
    "",
  ].join("\n");
}

function buildMvpOverview(stats: RadarReportResult["stats"], topOpps: OpportunityCard[]): string {
  const lines = ["## 2. 本周一句话判断", ""];
  if (stats.total_opportunities === 0) {
    lines.push("本轮没有发现足够匹配、可行动的机会。");
    lines.push("");
    lines.push("建议：");
    lines.push("- 放宽地区");
    lines.push("- 减少排除条件");
    lines.push("- 增加指定信号源");
    lines.push("- 保存为长期雷达继续监控");
  } else {
    lines.push(`- 本轮共发现 ${stats.total_opportunities} 条机会，其中 S 级 ${stats.s_count} 条，A 级 ${stats.a_count} 条。`);
    lines.push(`- 最推荐关注：${topOpps.slice(0, 3).map((opp) => opp.title).join("、") || "暂无"}`);
    lines.push(`- 本周最重要动作：${topOpps[0]?.next_action || topOpps[0]?.match_reason || "先复核机会来源并准备材料"}`);
    lines.push("- 建议继续监控：是。");
  }
  lines.push("");
  return lines.join("\n");
}

function buildMvpProfile(input: RadarReportInput): string {
  const { spec, profile } = input;
  const radarVersion = spec.radar_version;
  const cp = spec.client_profile;
  const goals = spec.core_goals;
  const scope = spec.opportunity_scope;
  const region = spec.region_scope;
  const filters = spec.filter_rules;
  const sourceNames = fmtUnknownArr(getProfileValue(profile, "指定信号源")) !== "暂无"
    ? fmtUnknownArr(getProfileValue(profile, "指定信号源"))
    : fmtArr(mvpSourceNames(spec));
  const structuredRegions = fmtArr([...(region.primary_regions ?? []), ...(region.secondary_regions ?? [])]);
  const profileRegions = fmtUnknownArr(getProfileValue(profile, "地域范围"));
  const lines = [
    "## 1. 雷达画像",
    "",
    `- 用户身份：${fmtUnknownArr(getProfileValue(profile, "用户身份")) !== "暂无" ? fmtUnknownArr(getProfileValue(profile, "用户身份")) : fmtStr(cp.business_type || cp.client_type)}`,
    `- 关注机会：${fmtUnknownArr(getProfileValue(profile, "关注机会")) !== "暂无" ? fmtUnknownArr(getProfileValue(profile, "关注机会")) : fmtArr(scope.primary_opportunity_types)}`,
    `- 地域范围：${structuredRegions !== "暂无" ? structuredRegions : profileRegions}`,
    `- 时间范围：${mvpTimeRange(input)}`,
    `- 指定信号源：${sourceNames}`,
    `- 排除内容：${fmtUnknownArr(getProfileValue(profile, "排除内容")) !== "暂无" ? fmtUnknownArr(getProfileValue(profile, "排除内容")) : fmtArr([...(scope.excluded_opportunity_types ?? []), ...(filters.must_exclude ?? [])])}`,
    `- 排序偏好：${fmtUnknownArr(getProfileValue(profile, "排序偏好")) !== "暂无" ? fmtUnknownArr(getProfileValue(profile, "排序偏好")) : fmtArr(goals.priority_order)}`,
  ];
  if (radarVersion) {
    lines.push(
      "",
      "### 雷达版本",
      `- 版本：${radarVersion.version}`,
      `- 定位：${radarVersion.oneSentencePositioning}`,
      `- 这版雷达会盯什么：${fmtArr(radarVersion.opportunityIntents)}`,
      `- 不盯什么：${fmtArr(radarVersion.exclusionRules)}`,
      `- 优先看哪些来源：${fmtArr(radarVersion.prioritySourceArchetypes)}`,
      `- 什么算高价值：${fmtArr(radarVersion.highValueCriteria)}`,
      `- 查询族：${fmtArr(radarVersion.queryFamilies.map((family) => family.familyName))}`,
      `- 缺哪些信息：${fmtArr(radarVersion.missingConfig)}`,
      `- 默认假设：${fmtArr(radarVersion.defaultAssumptions)}`,
    );
    if (radarVersion.revisionNotes.length > 0) {
      lines.push(`- 本次修订：${radarVersion.revisionNotes.map((note) => note.detail).join("；")}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

function buildMvpOpportunityTable(opps: OpportunityCard[]): string {
  const lines = [
    "## 3. S / A / B 级机会总览",
    "",
    "| 等级 | 机会名称 | 截止时间 | 适配度 | 建议动作 | 来源 |",
    "|---|---|---|---|---|---|",
  ];
  if (opps.length === 0) {
    lines.push("| - | 本轮暂无机会 | - | - | 放宽条件或继续监控 | - |");
  } else {
    for (const opp of opps) {
      lines.push(`| ${getVisibleLevel(opp)} | ${opp.title} | ${fmtStr(opp.deadline)} | ${fmtStr(opp.match_reason)} | ${fmtStr(opp.next_action)} | ${fmtOpportunitySource(opp)} |`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

function buildMvpOpportunityDetails(opps: OpportunityCard[]): string {
  const lines = ["## 4. 机会详情卡片", ""];
  if (opps.length === 0) {
    lines.push("本轮暂无可详解机会。", "");
    return lines.join("\n");
  }
  opps.slice(0, 8).forEach((opp, index) => {
    lines.push(`### 机会 ${index + 1}：${opp.title}`);
    lines.push("#### 基本信息");
    lines.push(`- 级别：${getVisibleLevel(opp)}`);
    lines.push(`- 机会类型：${fmtStr(opp.opportunity_kind || opp.type)}`);
    lines.push(`- 证据状态：${fmtStr(opp.evidence_status || "needs_review")}`);
    lines.push(`- 行动状态：${fmtStr(opp.action_status || "prepare")}`);
    lines.push(`- 主办方 / 发布方：${fmtStr(opp.organizer)}`);
    lines.push(`- 地区：${fmtStr(opp.region)}`);
    lines.push(`- 截止时间：${fmtStr(opp.deadline)}`);
    lines.push("#### 为什么适合你");
    lines.push(fmtStr(opp.match_reason));
    lines.push("#### 推荐动作");
    lines.push(fmtStr(opp.next_action));
    lines.push("#### 风险提醒");
    lines.push(fmtStr(opp.risk_note));
    lines.push(isLiveOpportunity(opp) ? "#### 搜索发现来源" : "#### 官方来源");
    lines.push(fmtOpportunitySource(opp));
    lines.push("");
    lines.push(`- 风险提醒：${fmtStr(opp.risk_note || "待复核")}`);
    lines.push("");
  });
  return lines.join("\n");
}

function buildMvpWatchPool(excluded: Array<{ opp: OpportunityCard; reason: string }>): string {
  const lines = ["## 6. 不建议投入或需复核的机会", ""];
  if (excluded.length === 0) {
    lines.push("- 本轮没有明确需要排除的机会。");
  } else {
    excluded.forEach((item) => {
      lines.push(`- ${item.opp.title}：${item.reason}`);
    });
  }
  lines.push("");
  return lines.join("\n");
}

function buildMvpActionList(opps: OpportunityCard[]): string {
  const top = opps[0];
  const firstAction = top && isDemoOpportunity(top)
    ? `不要直接行动；接入真实搜索后再复核「${top.title}」来源、截止时间和资格要求`
    : top
      ? `打开来源并复核「${top.title}」报名要求`
      : "补充更多信号源或放宽关键词";
  return [
    "## 5. 本周行动清单",
    "",
    `- 今天要做：${firstAction}`,
    `- 本周要做：${top?.next_action || "继续监控并筛选新机会"}`,
    "- 后续准备：整理报名材料、截止时间和联系人信息。",
    "",
  ].join("\n");
}

type ReportActionDecision = "Attack" | "Hold" | "Monitor" | "Archive";

function uniqueList(items: string[], limit: number): string[] {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean))).slice(0, limit);
}

function actionDecision(input: RadarReportInput, opps: OpportunityCard[]): ReportActionDecision {
  const actionableKinds = new Set(["direct_opportunity", "business_lead", "channel_partner_lead", "customer_lead"]);
  const actionable = opps.filter((opp) => actionableKinds.has(opp.opportunity_kind ?? ""));
  if (actionable.some((opp) => !isDemoOpportunity(opp) && (getVisibleLevel(opp) === "S" || getVisibleLevel(opp) === "A"))) {
    return "Attack";
  }
  if (actionable.length > 0) {
    return "Hold";
  }
  if ((input.rawCandidates ?? []).length > 0 || input.candidateAccounting?.rawCount) {
    return "Monitor";
  }
  return "Monitor";
}

function actionLayerKeywords(input: RadarReportInput): string[] {
  return uniqueList([
    ...(input.spec.keyword_strategy?.core_keywords_zh ?? []),
    ...(input.spec.keyword_strategy?.core_keywords_en ?? []),
    ...(input.spec.opportunity_scope?.primary_opportunity_types ?? []),
    ...mvpSourceNames(input.spec),
    ...((input.rawCandidates ?? []).map((candidate) => candidate.sourceDomain)),
  ], 10);
}

function buildMaterialGaps(opps: OpportunityCard[]): string[] {
  const gaps = [
    "待复核：官方报名 / 申请 / 联系入口是否真实可用。",
    "待复核：截止时间、费用、资格、联系人、版权义务和获奖义务。",
  ];
  const top = opps[0];
  if (top?.materials_required && top.materials_required !== "待复核") {
    gaps.push(`模型判断：围绕「${top.title}」先整理 ${top.materials_required}。`);
  } else if (top) {
    gaps.push(`模型判断：围绕「${top.title}」先准备个人 / 公司介绍、项目说明、过往案例和可提交材料清单。`);
  } else {
    gaps.push("模型判断：先补充更明确的地区、机会类型和指定信号源，提升下一轮搜索命中率。");
  }
  if (opps.some((opp) => opp.opportunity_kind === "channel_partner_lead")) {
    gaps.push("模型判断：渠道伙伴线索需要补充产品定位、目标客群、合作模式、覆盖地区和伙伴支持材料。");
  }
  if (opps.some((opp) => opp.opportunity_kind === "customer_lead")) {
    gaps.push("模型判断：潜在客户线索需要补充客户画像、采购场景、价值证明和首轮外联材料。");
  }
  return uniqueList(gaps, 5);
}

function buildRecommendedAngles(spec: RadarRequirementSpec, opps: OpportunityCard[]): string[] {
  const identity = spec.client_profile?.business_type || spec.client_profile?.client_type || "当前用户";
  const target = fmtArr(spec.opportunity_scope?.primary_opportunity_types);
  const top = opps[0];
  const angles: string[] = [];
  if (!top) {
    angles.push(
      `模型判断：先把「${identity}」的雷达包装成持续监控 ${target} 的观察雷达，下一轮优先补足来源和地区。`,
    );
  } else if (top.opportunity_kind === "business_lead") {
    angles.push(
      `模型判断：把「${top.title}」作为可行动线索处理，先确认对方是否真实有采购、合作、招聘或报名需求。`,
      `模型判断：外联时不要声称对方意向已经证实，用「看到公开信号，想确认是否开放合作」作为开场。`,
    );
  } else if (top.opportunity_kind === "direct_opportunity") {
    angles.push(
      `模型判断：把「${top.title}」作为本周优先核验入口，先核对官方页面、截止时间和资格要求。`,
      `模型判断：若核验通过，再围绕「${identity}」与 ${target} 的匹配点准备提交材料。`,
    );
  } else {
    angles.push(`模型判断：「${top.title}」更适合作为观察或参考，不建议直接当作已经成立的机会行动。`);
  }

  if (opps.some((opp) => opp.opportunity_kind === "channel_partner_lead")) {
    angles.push("模型判断：渠道伙伴线索：先核对伙伴覆盖地区、产品适配和合作机制，再决定是否投入外联。");
  }
  if (opps.some((opp) => opp.opportunity_kind === "customer_lead")) {
    angles.push("模型判断：潜在客户线索：先验证真实需求、采购窗口和决策路径，不把公开页面当作已确认采购意向。");
  }
  return uniqueList(angles, 6);
}

function buildRiskNotes(opps: OpportunityCard[]): string[] {
  const fromCards = opps
    .map((opp) => opp.risk_note)
    .filter(Boolean)
    .slice(0, 3);
  return uniqueList([
    "待复核：搜索发现不能证明报名资格、费用、截止日期、联系人、采购意向、招聘意向或版权义务已经成立。",
    "待复核：费用、资格、版权 / 授权、地区限制、材料成本和执行周期可能影响是否投入。",
    ...fromCards.map((note) => `模型判断 / 待复核：${note}`),
  ], 6);
}

function buildNextActions(input: RadarReportInput, opps: OpportunityCard[]): string[] {
  const top = opps[0];
  if (!top) {
    const emptyActions = [
      "模型判断：补充 2-3 个指定信号源或官网名称。",
      "模型判断：放宽地区或时间窗口后重新盯一次。",
      "模型判断：保存为长期雷达，让系统持续监控新信号。",
    ];
    if ((input.rawCandidates ?? []).some((candidate) => candidate.semanticType === "association_directory")) {
      emptyActions.unshift("模型判断：协会目录：先建立目标名单，再逐个寻找公开联系入口；目录本身不是已确认机会。");
    }
    return emptyActions;
  }
  const actions = [
    `模型判断：今天先打开「${top.title}」来源，逐项复核行动入口、资格、费用和截止时间。`,
    "模型判断：把可报名 / 可申报 / 可联系的结果单独建表，标记负责人和截止日。",
    "模型判断：准备一版 100 字自我 / 公司介绍和一版项目说明，方便报名或外联复用。",
  ];
  const businessLead = opps.find((opp) => opp.opportunity_kind === "business_lead");
  if (businessLead) {
    actions.push(`模型判断：对「${businessLead.title}」只做联系确认，不把它当作采购、招聘或合作已经成立的机会。`);
  }
  if ((input.rawCandidates ?? []).some((candidate) => candidate.semanticType === "association_directory")) {
    actions.push("模型判断：协会目录：先建立目标名单，再逐个寻找公开联系入口；目录本身不是已确认机会。");
  }
  if (opps.some((opp) => opp.opportunity_kind === "channel_partner_lead")) {
    actions.push("模型判断：渠道伙伴先按地区、客户覆盖和合作模式排序，再逐一联系确认。");
  }
  if (opps.some((opp) => opp.opportunity_kind === "customer_lead")) {
    actions.push("模型判断：潜在客户先验证业务场景、采购周期和决策角色，不预设已有采购意向。");
  }
  actions.push("模型判断：保存本轮报告，下一轮对比新增来源、失败来源和低行动性来源变化。");
  return uniqueList(actions, 5);
}

function noCardObservationCandidates(input: RadarReportInput): RawCandidateAudit[] {
  return (input.rawCandidates ?? [])
    .filter((candidate) => candidate.title || candidate.url)
    .filter((candidate) => candidate.semanticType !== "rejected")
    .slice(0, 8);
}

function buildNoCardObservationBlock(input: RadarReportInput, opps: OpportunityCard[]): string[] {
  if (opps.length > 0) return [];
  const observations = noCardObservationCandidates(input);
  const lines = [
    "### no_card_observations: 无重点卡时的观察线索",
    "",
    "- 本轮未找到足够证据进入重点机会卡；这不等于没有信号，而是当前搜索发现不足以支持直接行动。",
    "",
  ];
  if (observations.length === 0) {
    lines.push("- 观察线索：暂无可列出的观察线索。");
  } else {
    lines.push("- 观察线索：");
    observations.forEach((candidate) => {
      const reason = candidate.qualityReason || candidate.relevanceAssessment?.reasonCodes?.join("、") || candidate.candidateJudgeAssessment?.reason || "证据不足，需下轮复核";
      lines.push(`  - ${candidate.title || candidate.url}：${candidate.url}（${reason}）`);
    });
  }
  lines.push(
    "",
    "- 为什么没有进入重点卡：候选缺少明确行动入口、字段级证据不足、来源页面偏观察 / 参考，或时间窗口和资格仍需复核。",
    "- 下一轮建议：补充优先平台、国家 / 地区、时间窗口和具体机会类型；同时改用更强 source / query 方向继续搜索。",
    "- source / query 方向：优先加入官方平台、供应商 / 卖家入口、申请 / 报名 / 入库 / 合作关键词，以及用户指定信号源。",
    "",
  );
  return lines;
}

function buildMvpActionLayer(input: RadarReportInput, opps: OpportunityCard[]): string {
  const decision = actionDecision(input, opps);
  const lines = [
    "## 8. 报告行动层",
    "",
    "> 本节是基于雷达画像、机会卡和来源状态生成的模型判断；所有未被字段级证据支持的内容均为待复核建议。",
    "",
    `- decision: ${decision}（模型判断）`,
    "",
    ...buildNoCardObservationBlock(input, opps),
    "### recommended_angle: 推荐打法 / 包装角度",
    "",
    ...buildRecommendedAngles(input.spec, opps).map((item) => `- ${item}`),
    "",
    "### material_gaps: 材料缺口与准备清单",
    "",
    ...buildMaterialGaps(opps).map((item) => `- ${item}`),
    "",
    "### risk_notes: 风险提醒",
    "",
    ...buildRiskNotes(opps).map((item) => `- ${item}`),
    "",
    "### next_actions: 本周建议动作",
    "",
    ...buildNextActions(input, opps).map((item, index) => `${index + 1}. ${item}`),
    "",
    "### monitoring_keywords: 下一轮监控关键词",
    "",
  ];
  const keywords = actionLayerKeywords(input);
  if (keywords.length === 0) {
    lines.push("- 待复核：暂无明确关键词，建议补充地区、机会类型和指定来源。");
  } else {
    keywords.forEach((keyword) => lines.push(`- ${keyword}`));
  }
  lines.push("");
  return lines.join("\n");
}

function buildMvpNextTracking(spec: RadarRequirementSpec): string {
  const keywords = [
    ...(spec.keyword_strategy.core_keywords_zh ?? []),
    ...(spec.keyword_strategy.core_keywords_en ?? []),
  ];
  return [
    "## 9. 下周继续追踪",
    "",
    `- 关键词：${fmtArr(keywords)}`,
    `- 来源网站：${fmtArr(mvpSourceNames(spec))}`,
    "- 时间窗口：未来 7 / 14 / 30 天。",
    "",
  ].join("\n");
}

function sourceStatusLabel(status: string | undefined): string {
  const map: Record<string, string> = {
    checked: "搜索发现，有结果",
    no_results: "待复核，暂无结果",
    failed: "搜索失败，待复核",
    invalid_url: "待复核，无效网址",
    name_only: "待复核，来源名称待转成网址",
    checked_with_results: "搜索发现，有结果",
    checked_no_results: "待复核，暂无结果",
    not_checked: "待复核，本轮未检查",
  };
  return status ? map[status] ?? status : "未知";
}

function buildCandidateAccountingTable(accounting?: CandidateAccounting): string[] {
  const lines = ["### 候选统计", ""];
  if (!accounting) {
    lines.push("- 本轮未收到 CandidateAccounting，报告不编造候选统计。");
    return lines;
  }
  lines.push("| 字段 | 数量 |");
  lines.push("|---|---:|");
  lines.push(`| rawCount | ${accounting.rawCount} |`);
  lines.push(`| deduplicatedCount | ${accounting.deduplicatedCount} |`);
  lines.push(`| assessedCount | ${accounting.assessedCount} |`);
  lines.push(`| acceptedCount | ${accounting.acceptedCount} |`);
  lines.push(`| rejectedCount | ${accounting.rejectedCount} |`);
  return lines;
}

const FIELD_LABELS: Record<FieldEvidenceName, string> = {
  title: "标题",
  source_url: "来源 URL",
  source_domain: "来源域名",
  source_type: "来源类型",
  registration_or_application_signal: "报名 / 申请信号",
  date_or_deadline: "日期 / 截止时间",
  fee: "费用",
  eligibility: "资格 / 适合对象",
  contact_or_application_route: "联系人 / 行动入口",
};

const FIELD_STATUS_LABELS: Record<FieldEvidenceItem["status"], string> = {
  verified: "已读取核验",
  partially_verified: "正文部分支持",
  unverified: "未核验",
  not_found: "正文未找到",
  failed: "读取失败",
};

function fieldEvidenceRows(opps: OpportunityCard[]): Array<{ opp: OpportunityCard; item: FieldEvidenceItem }> {
  return opps.flatMap((opp) => (opp.field_evidence ?? []).map((item) => ({ opp, item })));
}

function buildVerifiedFieldLines(opps: OpportunityCard[]): string[] {
  const rows = fieldEvidenceRows(opps)
    .filter(({ item }) => item.status === "verified" || item.status === "partially_verified")
    .slice(0, 24);
  if (rows.length === 0) {
    return ["- 暂无字段级已核验证据。"];
  }
  return [
    "- 说明：以下只表示有限网页读取取得字段证据；`正文部分支持` 仍需人工复核，不等于最终资格、费用或截止时间确认。",
    ...rows.map(({ opp, item }) => {
      const value = item.value ? `：${item.value}` : "";
      const evidence = item.evidenceText ? `；证据片段：${item.evidenceText.slice(0, 80)}` : "";
      return `- ${opp.title}｜${FIELD_LABELS[item.field]}${value}（${FIELD_STATUS_LABELS[item.status]}，来源：${item.sourceDomain}${evidence}）`;
    }),
  ];
}

function buildReviewFieldLines(opps: OpportunityCard[]): string[] {
  const actionFields = new Set<FieldEvidenceName>([
    "registration_or_application_signal",
    "date_or_deadline",
    "fee",
    "eligibility",
    "contact_or_application_route",
  ]);
  const rows = fieldEvidenceRows(opps)
    .filter(({ item }) => actionFields.has(item.field) && item.status !== "verified")
    .slice(0, 24);
  if (rows.length === 0) {
    return ["- 暂无。"];
  }
  return rows.map(({ opp, item }) =>
    `- ${opp.title}｜${FIELD_LABELS[item.field]}：${FIELD_STATUS_LABELS[item.status]}。`,
  );
}

function buildFailedSourceLines(input: RadarReportInput): string[] {
  const failed = (input.executionLog?.openedUrls ?? []).filter((item) => item.status === "failed");
  if (failed.length === 0) return ["- 暂无失败读取来源。"];
  return failed.map((item) => `- ${item.url}（${item.errorType || "failed"}，读取时间：${item.fetchedAt}）`);
}

function buildUncheckedSourceLines(input: RadarReportInput): string[] {
  const opened = new Set((input.executionLog?.openedUrls ?? []).map((item) => item.url));
  const unchecked = (input.rawCandidates ?? [])
    .filter((candidate) => candidate.url && !opened.has(candidate.url) && candidate.qualityStatus !== "low_action")
    .slice(0, 24);
  if (unchecked.length === 0) {
    return ["- 暂无未检查来源，或本轮未传入 rawCandidates。"];
  }
  return unchecked.map((candidate) => `- ${candidate.title || candidate.url}：${candidate.url}（已搜索到，但本轮未打开正文核验）`);
}

function buildLowActionSourceLines(input: RadarReportInput): string[] {
  const lowAction = (input.rawCandidates ?? [])
    .filter((candidate) => candidate.qualityStatus === "low_action")
    .slice(0, 24);
  if (lowAction.length === 0) {
    return ["- 暂无低行动性观察来源。"];
  }
  return lowAction.map((candidate) =>
    `- ${candidate.title || candidate.url}：${candidate.url}（${candidate.qualityReason || "低行动性来源"}，不进入重点推荐机会）`,
  );
}

function buildMvpSourceIndex(input: RadarReportInput, sources: SourceCandidate[]): string {
  const checks = input.sourceHintChecks ?? [];
  const hasDemoOpportunity = input.opportunities.some(isDemoOpportunity);
  const hasLiveOpportunity = input.opportunities.some(isLiveOpportunity);
  const lines = ["## 7. 来源与检查回执", "", "### 来源索引", "", "### 本轮重点检查来源", ""];
  lines.push("| 来源 | 状态 | 结果数 | 说明 |");
  lines.push("|---|---|---:|---|");
  if (checks.length === 0) {
    lines.push("| 未指定额外信号源 | not_checked | 0 | 可增加指定信号源提升命中率 |");
  } else {
    checks.forEach((check) => {
      const source = check.sourceUrl ? `${check.sourceName}：${check.sourceUrl}` : check.sourceName;
      const status = String(check.status);
      lines.push(`| ${source} | ${sourceStatusLabel(status)} | ${check.resultCount} | ${check.error || "待复核"} |`);
    });
  }
  lines.push("", ...buildCandidateAccountingTable(input.candidateAccounting));
  lines.push("", "### 搜索到的来源", "");
  if (hasDemoOpportunity) {
    lines.push("- 演示数据，未真实核验；本轮不提供可点击真实来源。");
  } else if (sources.length === 0) {
    const urls = Array.from(new Set(input.opportunities.map((opp) => opp.official_source_url).filter(Boolean)));
    if (urls.length === 0) {
      lines.push("- 暂无搜索来源链接。");
    } else {
      urls.forEach((url) => lines.push(`- ${url}（搜索发现，待复核）`));
    }
  } else {
    sources.forEach((source) => lines.push(`- ${source.mediaName}：${source.url}（搜索发现，待复核）`));
  }

  lines.push("", "### 低行动性观察来源", "");
  if (hasDemoOpportunity) {
    lines.push("- 演示数据未执行真实候选质量分层。");
  } else {
    lines.push(...buildLowActionSourceLines(input));
  }

  lines.push("", "### 字段已核验事实", "");
  if (hasDemoOpportunity) {
    lines.push("- 暂无。演示数据没有字段级核验证据。");
  } else if (input.opportunities.some((opp) => (opp.field_evidence ?? []).length > 0)) {
    lines.push(...buildVerifiedFieldLines(input.opportunities));
  } else if (hasLiveOpportunity) {
    lines.push("- 暂无。本轮只完成搜索发现，未抓取网页正文或进行字段级事实核验。");
  } else {
    const confirmed = input.opportunities.filter((opp) => opp.evidence_status === "confirmed" || opp.verificationStatus === "verified");
    if (confirmed.length === 0) {
      lines.push("- 暂无字段级已核验事实。");
    } else {
      confirmed.forEach((opp) => lines.push(`- ${opp.title}：来源已标记为已验证。`));
    }
  }

  lines.push("", "### 模型判断", "");
  if (input.liveLlmEvidenceExplanation) {
    const explanation = input.liveLlmEvidenceExplanation;
    lines.push(`- Live LLM profile：${explanation.profile.profile} / ${explanation.profile.provider} / ${explanation.profile.model}`);
    lines.push("- 以下内容属于基于 evidence status 的模型判断，不是字段级已核验事实。");
    explanation.globalNotes.forEach((note) => lines.push(`- ${note}`));
    explanation.items.forEach((item) => {
      lines.push(`- ${item.title}`);
      lines.push(`  - 价值解释：${item.opportunityValue}`);
      lines.push(`  - 建议动作：${item.suggestedAction}`);
      lines.push(`  - 风险提醒：${item.riskNote}`);
      lines.push(`  - 证据依据：${item.evidenceBasis}`);
      if (item.reviewNeeded.length > 0) {
        lines.push(`  - 待复核：${item.reviewNeeded.join("、")}`);
      }
    });
  }
  if (input.opportunities.length === 0) {
    lines.push("- 暂无模型判断。");
  } else {
    input.opportunities.slice(0, 8).forEach((opp) => {
      lines.push(`- ${opp.title}：等级 ${getVisibleLevel(opp)}；匹配理由为模型判断，需结合来源复核。`);
    });
  }

  const needsReview = checks.filter((check) => {
    const status = String(check.status);
    return status === "failed" || status === "no_results" || status === "invalid_url" || status === "checked_no_results";
  });
  lines.push("", "### 待复核项", "");
  if (hasDemoOpportunity) {
    lines.push("- 演示 / 测试数据未真实核验，所有来源字段均需接入真实搜索后复核。");
  } else if (input.opportunities.some((opp) => (opp.field_evidence ?? []).length > 0)) {
    lines.push(...buildReviewFieldLines(input.opportunities));
  } else if (hasLiveOpportunity) {
    lines.push("- 报名资格、费用、截止日期、联系人、版权义务、获奖义务。");
    lines.push("- 搜索结果标题和摘要只代表搜索发现，不代表官方事实确认。");
    if (needsReview.length > 0) {
      needsReview.forEach((check) => lines.push(`- ${check.sourceName || check.sourceUrl}（${check.status}）`));
    }
  } else if (needsReview.length === 0) {
    lines.push("- 暂无。");
  } else {
    needsReview.forEach((check) => lines.push(`- ${check.sourceName || check.sourceUrl}（${check.status}）`));
  }

  lines.push("", "### 失败来源", "");
  if (hasDemoOpportunity) {
    lines.push("- 演示数据未执行真实网页读取。");
  } else {
    lines.push(...buildFailedSourceLines(input));
  }

  lines.push("", "### 未检查来源", "");
  if (hasDemoOpportunity) {
    lines.push("- 演示数据没有真实候选来源。");
  } else {
    lines.push(...buildUncheckedSourceLines(input));
  }
  return lines.join("\n");
}

// ============================================================
// 核心导出函数
// ============================================================

/**
 * 生成雷达报告 V0.4。
 *
 * 规则：
 *   - 确认度 ≥ 95% 且状态为 confirmed / ready_for_radar_plan：生成 V0.4
 *   - 确认度 < 95% 或未确认：拒绝生成，返回 error
 *   - 空机会不拒绝生成，产出「本周暂无机会」的空报告
 *
 * @param input 雷达报告生成输入
 * @returns 雷达报告生成结果
 */
export function generateRadarReport(input: RadarReportInput): RadarReportResult {
  const { spec, opportunities, radar_type, period_start, period_end } = input;
  const generatedAt = input.generated_at ?? new Date().toISOString();

  // 自定义雷达允许客户明确确认默认假设后继续；固定旧雷达仍保留 95% 门槛。
  const customerAcceptedCustomProfile = radar_type === "custom" && spec.confirmation_status.user_confirmed;
  if (spec.requirement_confidence.total < 95 && !customerAcceptedCustomProfile) {
    return {
      success: false,
      markdown: null,
      error: `需求确认度仅 ${spec.requirement_confidence.total}%，低于 95% 阈值，拒绝生成雷达报告。请继续补充需求信息至确认度 ≥ 95%。`,
      version: "V0.4",
      generated_at: generatedAt,
      stats: {
        total_opportunities: 0, s_count: 0, a_count: 0, b_count: 0,
        c_count: 0, d_count: 0, hidden_count: 0,
        expiring_soon_count: 0, excluded_count: 0,
        source_count: 0, evidence_count: 0,
      },
      sections_count: 0,
    };
  }

  // 拒绝条件 2：确认状态非 confirmed / ready_for_radar_plan
  const status = spec.confirmation_status.status;
  if (status !== "confirmed" && status !== "ready_for_radar_plan") {
    return {
      success: false,
      markdown: null,
      error: `确认状态为 "${status}"，用户尚未确认，拒绝生成雷达报告。仅 confirmed 或 ready_for_radar_plan 状态可生成。`,
      version: "V0.4",
      generated_at: generatedAt,
      stats: {
        total_opportunities: 0, s_count: 0, a_count: 0, b_count: 0,
        c_count: 0, d_count: 0, hidden_count: 0,
        expiring_soon_count: 0, excluded_count: 0,
        source_count: 0, evidence_count: 0,
      },
      sections_count: 0,
    };
  }

  const baseDate = parseDate(generatedAt.split("T")[0]);

  // 机会分组
  const sOpps: OpportunityCard[] = [];
  const aOpps: OpportunityCard[] = [];
  const bOpps: OpportunityCard[] = [];
  const cOpps: OpportunityCard[] = [];
  const excluded: Array<{ opp: OpportunityCard; reason: string }> = [];

  for (const opp of opportunities) {
    const exclusionCheck = isExcluded(opp, spec, baseDate);
    if (exclusionCheck.excluded) {
      excluded.push({ opp, reason: exclusionCheck.reason });
      continue;
    }

    const level = getVisibleLevel(opp);
    switch (level) {
      case "S": sOpps.push(opp); break;
      case "A": aOpps.push(opp); break;
      case "B": bOpps.push(opp); break;
      case "C": cOpps.push(opp); break;
      // hidden 已在 isExcluded 中处理
    }
  }

  // 即将截止（从非排除的机会中筛选）
  const nonExcluded = [...sOpps, ...aOpps, ...bOpps, ...cOpps];
  const expiringSoon: Array<{ opp: OpportunityCard; days: number }> = [];
  for (const opp of nonExcluded) {
    if (isExpiringSoon(opp.deadline, baseDate)) {
      expiringSoon.push({ opp, days: daysUntilDeadline(opp.deadline, baseDate) });
    }
  }

  // hidden 统计
  const hiddenCount = opportunities.filter((o) => getVisibleLevel(o) === "hidden").length;
  // V1.3 新增：D 级统计
  const dCount = opportunities.filter((o) => getVisibleLevel(o) === "D").length;

  // 统计
  const stats: RadarReportResult["stats"] = {
    total_opportunities: opportunities.length,
    s_count: sOpps.length,
    a_count: aOpps.length,
    b_count: bOpps.length,
    c_count: cOpps.length,
    d_count: dCount,
    hidden_count: hiddenCount,
    expiring_soon_count: expiringSoon.length,
    excluded_count: excluded.length,
    source_count: input.sourceCandidates?.length ?? 0,
    evidence_count: input.evidenceItems?.length ?? 0,
  };

  // 需人工复核项
  const requiresManualReview = spec.filter_rules.requires_manual_review ?? [];

  // 详情卡片机会（非 hidden，非排除）
  const cardOpps = [...sOpps, ...aOpps, ...bOpps, ...cOpps];

  const rankedOpps = [...sOpps, ...aOpps, ...bOpps, ...cOpps];
  const parts: string[] = [
    buildMvpHeader(spec, period_start, period_end),
    buildMvpDemoNotice(opportunities),
    buildMvpProfile(input),
    buildMvpOverview(stats, rankedOpps),
    buildMvpOpportunityTable(rankedOpps),
    buildMvpOpportunityDetails(rankedOpps),
    buildMvpActionList(rankedOpps),
    buildMvpWatchPool(excluded),
    buildMvpSourceIndex(input, input.sourceCandidates ?? []),
    buildMvpActionLayer(input, rankedOpps),
    buildMvpNextTracking(spec),
  ];

  return {
    success: true,
    markdown: parts.join("\n"),
    error: null,
    version: "V0.4",
    generated_at: generatedAt,
    stats,
    sections_count: 9,
  };
}
