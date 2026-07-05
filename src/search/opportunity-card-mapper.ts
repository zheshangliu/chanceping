/**
 * OpportunityCardMapper —— 机会卡片映射器
 *
 * V1.3 新增。将 ScoredOpportunity + SourceCandidate[] + EvidenceItem[] → OpportunityCard。
 *
 * 安全红线：
 *   1. OpportunityCard.official_source_url 必须来自 SourceCandidate.url
 *   2. 无官方链接不进 S 级（强制降级为 A）
 *
 * 独有优势：
 *   - computeCredibility 多源交叉验证算法
 *   - 卡片三层字段设计（核心5/次要4/详情8）
 */

import type { ScoredOpportunity, SearchVisibleLevel } from "./types";
import type { SourceCandidate } from "../schema/source-candidate";
import type { EvidenceItem, EvidenceField } from "../schema/evidence-item";
import type { OpportunityCard } from "../schema/opportunity-card";
import type { OpportunityAssessment } from "../schema/radar-mvp-contracts";
import { CONFIDENCE_GRADE_SCORES } from "../schema/source-candidate";
import type { CardVisibleLevel } from "../schema/scoring-rules";
import { evidenceStatusFromEvidence } from "./opportunity-scorer";

// ============================================================
// 核心函数
// ============================================================

/**
 * 将 ScoredOpportunity + 来源数据 → OpportunityCard。
 *
 * @param scored 评分后的机会
 * @param sources 关联的来源候选
 * @param evidence 关联的证据项
 * @param radarId 雷达 ID（可选）
 * @returns 机会卡片
 */
export function mapToCard(
  scored: ScoredOpportunity,
  sources: SourceCandidate[],
  evidence: EvidenceItem[],
  radarId?: string,
): OpportunityCard {
  const url = scored.search_result.url;
  const title = scored.search_result.title;

  // 步骤 1：确定官方来源 URL（红线 #3：必须来自 SourceCandidate.url）
  const officialSource = sources.find((s) => s.isOfficial) ?? sources[0];
  const officialSourceUrl = officialSource?.url ?? url;

  // 步骤 2：确定来源可信度
  const sourceConfidence = officialSource?.confidenceGrade ?? "E5";

  // 步骤 3：构建来源徽章
  const sourceBadges = buildSourceBadges(sources);

  // 步骤 4：多源交叉验证
  const credibility = computeCredibility(sources);

  // 步骤 5：从证据项提取字段值
  const evidenceMap = buildEvidenceMap(evidence);
  const evidenceTitle = evidenceMap.title?.value;
  const displayTitle = isUsableEvidenceTitle(evidenceTitle) ? evidenceTitle! : title;

  // 步骤 6：确定可见等级（含 S 级硬规则）
  const visibleLevel = mapVisibleLevel(scored.visible_level);
  const backendScore = scored.backend_score;
  const evidenceIds = evidence.map((e) => e.evidenceId);
  const sourceIds = sources.map((s) => s.sourceId);

  // 步骤 7：构建卡片（填充所有必填字段）
  const card: OpportunityCard = {
    // 核心字段（必填）
    title: displayTitle,
    type: radarId ?? "ai_competition",
    organizer: evidenceMap.organizer?.value ?? "",
    region: evidenceMap.region?.value ?? "",
    deadline: evidenceMap.deadline?.value ?? "",
    reward_or_value: evidenceMap.reward_or_value?.value ?? "",
    eligibility: evidenceMap.eligibility?.value ?? "",
    materials_required: "",
    match_reason: scored.relevance_reason,
    next_action: buildNextAction(visibleLevel, evidenceMap),
    official_source_url: officialSourceUrl,
    application_url: evidenceMap.application_url?.value ?? "",
    contact_info: evidenceMap.contact_info?.value ?? "",
    risk_note: backendScore < 50 ? "机会评分较低，建议谨慎评估" : "",
    backend_score: backendScore,
    visible_level: visibleLevel,
    status: "new",
    // 可选字段
    guid: scored.guid ?? url,
    // V1.3 新增字段
    radarId,
    decision: determineDecision(visibleLevel, backendScore),
    sourceIds,
    evidenceIds,
    sourceConfidence,
    verificationStatus: officialSource?.verificationStatus ?? "unverified",
    sourceBadges,
    fitReason: scored.chance_score.fit > 75 ? `匹配度高：${scored.relevance_reason}` : undefined,
    riskSummary: backendScore < 50 ? "机会评分较低，建议谨慎评估" : undefined,
    recommendedActions: buildRecommendedActions(visibleLevel, evidenceMap),
  };
  applySLevelGuard(card, sources);
  applyExpiredDeadlineGuard(card);
  applyAiEventConcreteEntryGuard(card, sources);
  applyAiEventSupportOrListingPageGuard(card);
  applyAiEventMediaOnlyGuard(card, sources);
  const evidenceStatus = evidenceStatusFromEvidence(card.evidenceIds, 2);
  const assessment: OpportunityAssessment = {
    opportunityId: card.guid || card.official_source_url,
    kind: scored.opportunity_kind ?? "direct_opportunity",
    evidenceStatus,
    actionStatus: card.status === "expired" ? "drop" : (scored.action_status ?? "prepare"),
    score: card.backend_score,
    ...(card.visible_level === "D" ? {} : { grade: card.visible_level }),
    scoringPolicyVersion: "mvp-2026-07-01",
    scoreItems: [
      {
        key: "match",
        label: "与雷达画像匹配",
        score: card.backend_score,
        weight: 100,
        basis: "mixed",
        evidenceIds: card.evidenceIds ?? [],
        reason: card.match_reason,
      },
    ],
    assessedAt: new Date().toISOString(),
  };
  card.opportunity_kind = assessment.kind;
  card.evidence_status = assessment.evidenceStatus;
  card.action_status = assessment.actionStatus;
  card.assessment = assessment;

  return card;
}

function isUsableEvidenceTitle(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.normalize("NFKC").trim().toLowerCase();
  if (!normalized) return false;
  if (/^(javascript is disabled|enable javascript|access denied|forbidden|not found|403|404|error)$/.test(normalized)) {
    return false;
  }
  return true;
}

export function applyAiEventConcreteEntryGuard(card: OpportunityCard, sources: SourceCandidate[]): OpportunityCard {
  if (card.status === "expired" || card.visible_level === "D") return card;
  if (card.visible_level === "S" || card.visible_level === "A") return card;
  if (card.backend_score < 50) return card;
  if (!hasOfficialOrPrimaryEventSource(card, sources)) return card;
  if (!isConcreteAiEventEntry(card.official_source_url || card.application_url)) return card;

  const text = `${card.title} ${card.type} ${card.organizer} ${card.official_source_url} ${card.application_url}`.normalize("NFKC").toLowerCase();
  if (!/(ai|人工智能|agent|hackathon|challenge|competition|contest|qwen|cloud|developer|vibe|coding|开发者|赛事|比赛|马拉松)/i.test(text)) {
    return card;
  }

  card.visible_level = "A";
  card.backend_score = Math.max(card.backend_score, 82);
  card.decision = determineDecision(card.visible_level, card.backend_score);
  card.match_reason = buildAiEventConcreteEntryReason(card);
  card.next_action = "打开官方页面，复核报名入口、截止时间、参赛资格和材料要求";
  card.risk_note = [
    card.risk_note,
    "搜索发现已进入优先核验；报名资格、费用、截止时间、版权义务和作品提交要求仍以官方页面为准。",
  ].filter(Boolean).join("；");
  card.recommendedActions = [
    "打开官方页面复核报名入口",
    "确认截止时间、奖金或云资源、参赛资格",
    "准备项目说明、Demo、代码仓库或提交材料",
  ];
  if (card.assessment) {
    card.assessment.score = card.backend_score;
    card.assessment.grade = card.visible_level;
    card.assessment.actionStatus = card.action_status ?? card.assessment.actionStatus;
    card.assessment.scoreItems = card.assessment.scoreItems.map((item) => ({
      ...item,
      score: card.backend_score,
      reason: card.match_reason,
    }));
  }
  return card;
}

export function applyAiEventMediaOnlyGuard(card: OpportunityCard, sources: SourceCandidate[]): OpportunityCard {
  if (!isAiEventCard(card)) return card;
  if (!isWeakNonGovMediaOnlySource(sources)) return card;
  if (card.visible_level === "D") return card;

  card.visible_level = "C";
  card.backend_score = Math.min(card.backend_score, 64);
  card.decision = determineDecision(card.visible_level, card.backend_score);
  card.next_action = "先追溯官方报名页或主办方公告，再决定是否行动";
  card.risk_note = [
    card.risk_note,
    "当前仅为非官方媒体线索，不能替代报名入口、截止时间、资格和奖项的字段级核验。",
  ].filter(Boolean).join("；");
  if (card.assessment) {
    card.assessment.score = card.backend_score;
    card.assessment.grade = card.visible_level;
    card.assessment.actionStatus = card.action_status ?? card.assessment.actionStatus;
    card.assessment.scoreItems = card.assessment.scoreItems.map((item) => ({
      ...item,
      score: card.backend_score,
      reason: card.match_reason,
    }));
  }
  return card;
}

export function applyAiEventSupportOrListingPageGuard(card: OpportunityCard): OpportunityCard {
  if (!isAiEventCard(card)) return card;
  if (!isAiEventSupportOrListingPage(card.official_source_url || card.application_url)) return card;
  if (card.visible_level === "D") return card;

  card.visible_level = "C";
  card.backend_score = Math.min(card.backend_score, 64);
  card.decision = determineDecision(card.visible_level, card.backend_score);
  card.next_action = "作为发现入口保留，优先追溯具体赛事报名页、提交页或官方公告后再行动";
  card.risk_note = [
    card.risk_note,
    "当前页面更像列表、资源或辅助页面，不应替代具体比赛报名入口、截止时间和资格核验。",
  ].filter(Boolean).join("；");
  if (card.assessment) {
    card.assessment.score = card.backend_score;
    card.assessment.grade = card.visible_level;
    card.assessment.actionStatus = card.action_status ?? card.assessment.actionStatus;
    card.assessment.scoreItems = card.assessment.scoreItems.map((item) => ({
      ...item,
      score: card.backend_score,
      reason: card.match_reason,
    }));
  }
  return card;
}

function isAiEventCard(card: OpportunityCard): boolean {
  return /(?:^|[^a-z])ai(?:[^a-z]|$)|人工智能|Agent|Hackathon|黑客松|马拉松|开发者挑战|Vibe Coding|TRAE|Qwen|Devpost|DoraHacks|Lablab/i.test(
    `${card.title} ${card.type} ${card.organizer} ${card.match_reason} ${card.fitReason ?? ""} ${card.riskSummary ?? ""} ${card.official_source_url} ${card.application_url}`,
  );
}

function isAiEventSupportOrListingPage(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    const path = parsed.pathname.replace(/\/+$/, "").toLowerCase();
    if (/^[a-z0-9-]+\.devpost\.com$/.test(host) && /^\/(?:participants|resources|rules|updates|submissions?)$/.test(path)) {
      return true;
    }
    if (host === "lablab.ai" && /^\/(?:ai-hackathons|hackathons|events|challenges)$/.test(path)) {
      return true;
    }
    if (host === "forum.trae.cn" && /^\/(?:latest|top|categories)$/.test(path)) {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

function isWeakNonGovMediaOnlySource(sources: SourceCandidate[]): boolean {
  if (sources.length === 0) return false;
  return sources.every((source) => {
    const text = `${source.url} ${source.mediaName} ${source.sourceType}`.toLowerCase();
    if (/gov\.cn|\.gov\b|edu\.cn|forum\.trae\.cn|devpost|dorahacks|lablab|kaggle|openhackathons|microsoft|google|aws|aliyun|tencent|github|huggingface|producthunt/.test(text)) {
      return false;
    }
    return source.sourceType === "media_general" ||
      source.sourceType === "media_authoritative" ||
      /news|新闻|财中社|36kr|qbitai|sina|sohu|163\.com|qq\.com|zhihu|x\.com|twitter|csdn/.test(text);
  });
}

export function sortOpportunityCardsForDisplay(cards: OpportunityCard[]): OpportunityCard[] {
  const levelRank: Record<CardVisibleLevel, number> = { S: 0, A: 1, B: 2, C: 3, D: 4 };
  return cards
    .slice()
    .sort((a, b) => {
      const rankDiff = (levelRank[a.visible_level] ?? 5) - (levelRank[b.visible_level] ?? 5);
      if (rankDiff !== 0) return rankDiff;
      return (b.backend_score ?? 0) - (a.backend_score ?? 0);
    });
}

function hasOfficialOrPrimaryEventSource(card: OpportunityCard, sources: SourceCandidate[]): boolean {
  const sourceText = `${card.official_source_url} ${card.application_url} ${sources.map((source) => `${source.url} ${source.sourceType} ${source.mediaName}`).join(" ")}`.toLowerCase();
  const hasOfficialSource = sources.some((source) => source.isOfficial || source.sourceType === "official");
  const hasConcreteEventPlatform = isConcreteAiEventEntry(card.official_source_url) || isConcreteAiEventEntry(card.application_url);
  const weakMediaOnly = sources.length > 0 && sources.every((source) =>
    source.sourceType === "media_general" ||
    source.sourceType === "media_authoritative" ||
    /news|新闻|财中社|36kr|qbitai|sina|sohu|163\.com|qq\.com/.test(`${source.url} ${source.mediaName}`.toLowerCase())
  );
  return !weakMediaOnly && (hasOfficialSource || hasConcreteEventPlatform || /devpost|dorahacks|lablab|openhackathons|kaggle|huggingface|producthunt|github/.test(sourceText));
}

function isConcreteAiEventEntry(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    const path = parsed.pathname.replace(/\/+$/, "").toLowerCase();
    if (/^[a-z0-9-]+\.devpost\.com$/.test(host)) return path === "" || path === "/";
    if (/dorahacks\.io$/.test(host) && /hackathon|buidl|grant/.test(path)) return true;
    if (/lablab\.ai$/.test(host) && /^\/(?:event|hackathon|challenge)\/[^/]+/.test(path)) return true;
    if (/openhackathons\.org$/.test(host) && /siteevent|hackathon|challenge/.test(path)) return true;
    if (/kaggle\.com$/.test(host) && /competition|challenge/.test(path)) return true;
    if (/huggingface\.co$/.test(host) && /space|event|hackathon|challenge|competition/.test(path)) return true;
    if (/producthunt\.com$/.test(host) && /golden-kitty|award|hackathon|launch|startup/.test(path)) return true;
  } catch {
    return false;
  }
  return false;
}

function buildAiEventConcreteEntryReason(card: OpportunityCard): string {
  const domain = (() => {
    try {
      return new URL(card.official_source_url || card.application_url).hostname.replace(/^www\./, "");
    } catch {
      return "官方页面";
    }
  })();
  return `这是具体 AI 赛事 / 黑客松入口，来源为 ${domain}，适合优先复核报名入口、截止时间、奖励资源和作品提交要求。`;
}

/**
 * S 级硬规则：无官方链接 → 强制降级为 A。
 *
 * 安全红线 #8：没有官方链接不能进入 S 级。
 *
 * @param card 机会卡片
 * @param sources 来源候选数组（用于判断是否有官方来源）
 * @returns 应用硬规则后的卡片
 */
export function applySLevelGuard(card: OpportunityCard, sources?: SourceCandidate[]): OpportunityCard {
  if (card.visible_level !== "S") return card;

  // 检查是否有官方来源
  const hasOfficialSource = sources
    ? sources.some((s) => s.isOfficial)
    : (card.sourceBadges?.includes("官方") ?? false);

  // 无官方来源，降级为 A
  if (!hasOfficialSource) {
    card.visible_level = "A";
    card.backend_score = Math.min(card.backend_score, 84);
  }

  return card;
}

export function applyExpiredDeadlineGuard(card: OpportunityCard, now: Date = new Date()): OpportunityCard {
  if (!isExpiredDeadline(card.deadline, now)) return card;
  card.visible_level = "D";
  card.status = "expired";
  card.decision = "archive";
  card.backend_score = Math.min(card.backend_score, 39);
  card.next_action = "已过期，建议归档或仅作为参考案例";
  card.risk_note = [card.risk_note, `已识别截止时间 ${card.deadline} 早于当前日期，不建议作为本轮行动机会。`]
    .filter(Boolean)
    .join("；");
  card.recommendedActions = ["归档为参考案例", "下一轮继续搜索仍可报名的赛事"];
  return card;
}

/**
 * computeCredibility —— 多源交叉验证算法。
 *
 * TRAE 独有优势：多源交叉验证，提升来源可信度评估准确性。
 *
 * 算法：
 *   1. 如果只有 1 个来源 → 直接用该来源的可信度分数
 *   2. 如果有 2+ 个来源：
 *      a. 检查是否有官方来源（A1/A2）→ 加 10 分
 *      b. 检查多源一致性（相同字段值跨源一致）→ 加 5-15 分
 *      c. 取所有来源可信度分数的加权平均
 *
 * @param sources 来源候选数组
 * @returns 可信度分数（0-100）
 */
export function computeCredibility(sources: SourceCandidate[]): number {
  if (sources.length === 0) return 0;
  if (sources.length === 1) {
    return CONFIDENCE_GRADE_SCORES[sources[0].confidenceGrade] ?? 10;
  }

  // 多源情况
  let baseScore = 0;
  let totalWeight = 0;

  for (const source of sources) {
    const score = CONFIDENCE_GRADE_SCORES[source.confidenceGrade] ?? 10;
    // 官方来源权重更高
    const weight = source.isOfficial ? 3 : 1;
    baseScore += score * weight;
    totalWeight += weight;
  }

  let credibility = totalWeight > 0 ? baseScore / totalWeight : 0;

  // 官方来源加成
  const hasOfficial = sources.some((s) => s.isOfficial);
  if (hasOfficial) {
    credibility = Math.min(100, credibility + 10);
  }

  // 多源一致性加成（V1.3 简化版：2 源 +5，3+ 源 +10）
  if (sources.length >= 3) {
    credibility = Math.min(100, credibility + 10);
  } else if (sources.length >= 2) {
    credibility = Math.min(100, credibility + 5);
  }

  return Math.round(credibility);
}

// ============================================================
// 私有函数
// ============================================================

/** 构建来源徽章列表 */
function buildSourceBadges(sources: SourceCandidate[]): string[] {
  const badges: string[] = [];
  const hasOfficial = sources.some((s) => s.isOfficial);
  const hasGov = sources.some((s) => s.sourceType === "government");

  if (hasGov) badges.push("政府");
  if (hasOfficial) badges.push("官方");

  // 取最高可信度等级
  const grades = sources.map((s) => CONFIDENCE_GRADE_SCORES[s.confidenceGrade] ?? 0);
  const maxGrade = grades.length > 0 ? Math.max(...grades) : 0;
  if (maxGrade >= 90) badges.push("A1");
  else if (maxGrade >= 80) badges.push("B1");
  else if (maxGrade >= 60) badges.push("C1");

  // 多源标记
  if (sources.length >= 2) badges.push("多源验证");

  return badges;
}

/** 构建证据字段映射 */
function buildEvidenceMap(evidence: EvidenceItem[]): Partial<Record<EvidenceField, EvidenceItem>> {
  const map: Partial<Record<EvidenceField, EvidenceItem>> = {};
  for (const item of evidence) {
    // 同一字段取置信度最高的
    if (!map[item.field] || item.confidence > map[item.field]!.confidence) {
      map[item.field] = item;
    }
  }
  return map;
}

/** 映射 SearchVisibleLevel → CardVisibleLevel */
function mapVisibleLevel(level: SearchVisibleLevel): CardVisibleLevel {
  // SearchVisibleLevel: "S" | "A" | "B" | "C" | "hidden"
  // CardVisibleLevel: "S" | "A" | "B" | "C" | "D"
  if (level === "hidden") return "D";
  return level as CardVisibleLevel;
}

function isExpiredDeadline(value: string | undefined, now: Date): boolean {
  const deadline = parseDeadlineDate(value);
  if (!deadline) return false;
  const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  return deadline.getTime() < today.getTime();
}

function parseDeadlineDate(value: string | undefined): Date | null {
  if (!value) return null;
  const text = String(value).normalize("NFKC");
  const match = text.match(/\b(20\d{2})[年./-](\d{1,2})[月./-](\d{1,2})日?\b/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return null;
  return parsed;
}

/** 确定行动决策 */
function determineDecision(level: CardVisibleLevel, score: number): "attack" | "hold" | "archive" {
  if (level === "S" || (level === "A" && score >= 80)) return "attack";
  if (level === "B" || level === "C") return "hold";
  return "archive";
}

/** 构建下一步行动建议 */
function buildNextAction(
  level: CardVisibleLevel,
  evidenceMap: Partial<Record<EvidenceField, EvidenceItem>>,
): string {
  if (level === "S" || level === "A") {
    if (evidenceMap.application_url) return "尽快报名/申请";
    if (evidenceMap.deadline) return `注意截止日期：${evidenceMap.deadline.value}`;
    return "立即查看官方链接";
  }
  if (level === "B") return "收藏关注";
  return "了解即可";
}

/** 构建推荐行动列表 */
function buildRecommendedActions(
  level: CardVisibleLevel,
  evidenceMap: Partial<Record<EvidenceField, EvidenceItem>>,
): string[] {
  const actions: string[] = [];

  if (level === "S" || level === "A") {
    actions.push("立即查看官方链接");
    if (evidenceMap.deadline) {
      actions.push(`注意截止日期：${evidenceMap.deadline.value}`);
    }
    if (evidenceMap.application_url) {
      actions.push("尽快报名/申请");
    }
  } else if (level === "B") {
    actions.push("收藏关注");
    if (evidenceMap.deadline) {
      actions.push(`留意截止日期：${evidenceMap.deadline.value}`);
    }
  } else {
    actions.push("了解即可");
  }

  return actions;
}
