import type {
  RadarRevisionRequest,
  RadarRevisionResult,
  RadarVersionDiff,
  RadarVersionId,
  RadarVersionQueryFamily,
  RadarVersionRevisionNote,
  RadarVersionSpec,
} from "../schema/radar-version-spec";

type VersionBump = "minor" | "major";

function unique(values: Array<string | undefined>, limit = 16): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => String(value ?? "").trim())
        .filter(Boolean),
    ),
  ).slice(0, limit);
}

function hasAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function firstNonEmpty(...values: Array<string | undefined>): string {
  for (const value of values) {
    if (value && value.trim()) return value.trim();
  }
  return "";
}

function normalizeSegment(value: string): string {
  return value
    .replace(/^[，。；、\s]+|[，。；、\s]+$/g, "")
    .replace(/^(我|我们|本人|本公司|团队)(主要)?(想|要|希望|需要|正在)?/g, "")
    .trim();
}

function extractIdentity(text: string): string | undefined {
  const correction = /(?:我|我们|本人|本公司|团队)?不是[^，。；\n]*[，,]?(?:我是|我们是|而是)([^，。；\n]+)/.exec(text);
  if (correction?.[1]) return normalizeSegment(correction[1]);
  const direct = /(?:我是|我们是|本公司是|团队是)([^，。；\n]+)/.exec(text);
  if (direct?.[1]) return normalizeSegment(direct[1]);
  return undefined;
}

function extractWantedOpportunity(text: string, expectedOpportunityType?: string): string | undefined {
  if (expectedOpportunityType?.trim()) return expectedOpportunityType.trim();
  const direct = /(?:我要|我想要|我们要|我们想要|优先要|只要|寻找|找)([^，。；\n]*(?:机会|比赛|赛事|客户|线索|采购|招标|投标|申报|合作|报名|申请|入口))/.exec(text);
  if (direct?.[1]) return normalizeSegment(direct[1]);
  return undefined;
}

function isActionRefinement(value?: string): boolean {
  if (!value) return false;
  return hasAny(value, [/报名|申请|提交|入口|截止|可行动|registration|application|submit|deadline|entry/i]);
}

function looksLikeValueCriterion(value?: string): boolean {
  if (!value) return false;
  return hasAny(value, [/奖金|奖项|资源|云资源|展示|上架|激励|联系人|官方复核|高价值|prize|cloud|showcase/i]);
}

function bestPreviousOpportunity(values: string[]): string {
  const candidates = values
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .filter((value) => !looksLikeValueCriterion(value));
  return firstNonEmpty(...candidates, values.find(Boolean));
}

function extractNegativeRules(text: string, rejectedReason?: string): string[] {
  const combined = `${text}\n${rejectedReason ?? ""}`;
  const rules: string[] = [];
  const patterns = [
    /(?:不要|排除|不想要|别给我|不需要)([^，。；\n]+)/g,
    /(?:不是我要的|结果不对|不符合)([^，。；\n]*)/g,
  ];
  for (const pattern of patterns) {
    for (const match of combined.matchAll(pattern)) {
      const segment = normalizeSegment(match[1] ?? "");
      if (segment) rules.push(segment);
    }
  }
  if (hasAny(combined, [/不是学生|不要学生|排除学生|非学生/])) {
    rules.push("学生专属机会");
  }
  return unique(rules, 8);
}

function actionCriteria(text: string, expectedOpportunityType?: string): string[] {
  const values: string[] = [];
  const combined = `${text}\n${expectedOpportunityType ?? ""}`;
  if (hasAny(combined, [/报名|申请|提交|投稿|entry|registration|application|submit|apply/i])) {
    values.push("必须能形成报名、申请、提交或官方复核动作");
  }
  if (hasAny(combined, [/奖金|奖项|云资源|资源包|上架|展示|showcase|cloud|prize/i])) {
    values.push("优先有奖金、资源支持、上架展示或明确激励");
  }
  if (hasAny(combined, [/客户|线索|代理|渠道|合作|联系人|contact|partner|lead/i])) {
    values.push("必须能形成可联系、可跟进、需复核的业务线索");
  }
  if (hasAny(combined, [/采购|招标|投标|供应商|入库|procurement|tender|bid|supplier/i])) {
    values.push("优先官方采购、招标、投标或供应商入库入口");
  }
  if (expectedOpportunityType?.trim()) {
    values.push(`更贴近用户指定的机会类型：${expectedOpportunityType.trim()}`);
  }
  return unique(values, 8);
}

function sourcePreferences(text: string): string[] {
  const values: string[] = [];
  if (hasAny(text, [/官网|官方|主办方|official/i])) values.push("official announcement / official application page");
  if (hasAny(text, [/平台|marketplace|portal|入口/i])) values.push("application portal / platform entry");
  if (hasAny(text, [/协会|联盟|商会|association|chamber/i])) values.push("association directory / official association page");
  if (hasAny(text, [/政府|采购|招标|补贴|申报|government|grant|tender/i])) values.push("government grant / procurement portal");
  if (hasAny(text, [/云厂商|开发者|developer|cloud|challenge|hackathon/i])) values.push("developer platform / challenge page");
  if (values.length === 0 && hasAny(text, [/报名|申请|提交|入口|registration|application/i])) values.push("official application route");
  return unique(values, 8);
}

function queryShiftLines(text: string, expectedOpportunityType?: string): string[] {
  const values: string[] = [];
  const combined = `${text}\n${expectedOpportunityType ?? ""}`;
  if (hasAny(combined, [/报名|申请|提交|投稿|registration|application|submit|deadline|entry/i])) {
    values.push("加入 registration、application、deadline、entry、submit 等行动入口查询方向");
  }
  if (hasAny(combined, [/奖金|云资源|上架|展示|prize|cloud|showcase/i])) {
    values.push("加入 prize、cloud credits、showcase、startup support 等价值信号查询方向");
  }
  if (hasAny(combined, [/客户|线索|代理|渠道|合作|contact|partner|lead/i])) {
    values.push("加入 contact、partner、supplier、directory、lead 等可联系线索查询方向");
  }
  if (hasAny(combined, [/采购|招标|投标|供应商|procurement|tender|bid|supplier/i])) {
    values.push("加入 procurement、tender、bid、supplier registration 等采购入口查询方向");
  }
  if (expectedOpportunityType?.trim()) values.push(`围绕“${expectedOpportunityType.trim()}”重写查询族`);
  return unique(values, 8);
}

function classifyBump(text: string, trigger: RadarRevisionRequest["trigger"]): VersionBump {
  if (trigger === "result_feedback") return "minor";
  if (hasAny(text, [/不要[^，。；\n]*(?:我要|改成)/, /不是[^，。；\n]*(?:机会|比赛|赛事|客户|线索|申报|招聘|投标|采购)/, /改成[^，。；\n]*(?:客户|线索|代理|投标|申报|招聘|采购)/])) {
    return "major";
  }
  return "minor";
}

export function nextRadarVersionId(current: RadarVersionId, bump: VersionBump): RadarVersionId {
  const match = /^V(\d+)\.(\d+)$/.exec(current);
  const major = match ? Number(match[1]) : 1;
  const minor = match ? Number(match[2]) : 0;
  if (bump === "major") return `V${major + 1}.0`;
  return `V${major}.${minor + 1}`;
}

function buildRevisionQueryFamily(args: {
  targetUser: string;
  wantedOpportunity?: string;
  criteria: string[];
  sources: string[];
}): RadarVersionQueryFamily {
  const target = args.targetUser || "用户";
  const opportunity = args.wantedOpportunity || "可行动机会";
  const actionWords = args.criteria.join(" ");
  return {
    familyName: "revision action route",
    intentType: "direct_opportunity",
    sourceArchetype: args.sources[0] || "official application route",
    queries: unique([
      `${target} ${opportunity} 报名 申请 官方入口`,
      `${opportunity} registration application deadline official`,
      actionWords ? `${target} ${opportunity} ${actionWords}` : undefined,
    ], 3),
    whyThisFamily: "根据用户修订后的目标，优先寻找能形成下一步行动的入口。",
    resultBucket: "direct_opportunity",
  };
}

function buildDiff(params: {
  previous: RadarVersionSpec;
  nextVersion: RadarVersionId;
  targetIdentity?: string;
  wantedOpportunity?: string;
  negativeRules: string[];
  criteria: string[];
  sources: string[];
  queryShifts: string[];
  rejectedCardTitles: string[];
  userMessage: string;
}): RadarVersionDiff {
  const removed = unique([
    hasAny(params.userMessage, [/不是学生|不要学生|排除学生/]) ? "学生专属机会优先级" : undefined,
    ...params.rejectedCardTitles.map((title) => `不再把“${title}”作为重点机会样例`),
  ], 8);
  const downweighted = unique([
    ...params.negativeRules,
    hasAny(params.userMessage, [/展会|资讯|新闻|趋势|expo|news/i]) ? "展会资讯、行业新闻、趋势文章、无行动入口页面" : undefined,
  ], 10);

  return {
    fromVersion: params.previous.version,
    toVersion: params.nextVersion,
    summary: params.wantedOpportunity
      ? `按用户反馈升级为更聚焦“${params.wantedOpportunity}”的雷达策略。`
      : "根据用户反馈更新雷达策略。",
    added: unique([
      params.targetIdentity ? `${params.targetIdentity}视角` : undefined,
      params.wantedOpportunity,
      ...params.criteria,
    ], 10),
    removed,
    upweighted: unique([...params.criteria, params.wantedOpportunity], 10),
    downweighted,
    assumptionChanges: unique([
      params.targetIdentity ? `默认用户身份调整为：${params.targetIdentity}` : undefined,
    ], 8),
    queryShifts: params.queryShifts,
    sourceShifts: params.sources,
    highValueCriteriaChanges: params.criteria,
    exclusionChanges: unique([...params.negativeRules, ...downweighted], 10),
  };
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

function uniqueFamilies(families: RadarVersionQueryFamily[], limit = 8): RadarVersionQueryFamily[] {
  const seen = new Set<string>();
  const output: RadarVersionQueryFamily[] = [];
  for (const family of families) {
    const key = family.familyName === "revision action route" ? family.familyName : `${family.familyName}::${family.sourceArchetype}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(family);
    if (output.length >= limit) break;
  }
  return output;
}

export function reviseRadarVersion(input: RadarRevisionRequest): RadarRevisionResult {
  const previous = input.previousRadarVersion;
  const resultFeedback = input.resultFeedback;
  const combinedMessage = [
    input.userMessage,
    resultFeedback?.expectedOpportunityType,
    resultFeedback?.rejectedReason,
    resultFeedback?.freeText,
    ...(resultFeedback?.rejectedCardTitles ?? []),
  ].filter(Boolean).join("\n");

  const targetIdentity = extractIdentity(combinedMessage);
  const wantedOpportunity = extractWantedOpportunity(combinedMessage, resultFeedback?.expectedOpportunityType);
  const previousMainOpportunity = bestPreviousOpportunity([
    ...(previous.opportunityIntents ?? []),
    input.previousSpec.core_goals?.primary_goal,
    ...(input.previousSpec.opportunity_scope?.primary_opportunity_types ?? []),
  ]);
  const effectiveOpportunity = isActionRefinement(wantedOpportunity) && previousMainOpportunity
    ? `${previousMainOpportunity}（${wantedOpportunity}）`
    : wantedOpportunity;
  const criteria = actionCriteria(combinedMessage, wantedOpportunity);
  const negativeRules = extractNegativeRules(combinedMessage, resultFeedback?.rejectedReason);
  const sources = sourcePreferences(combinedMessage);
  const queryShifts = queryShiftLines(combinedMessage, wantedOpportunity);
  const nextVersion = nextRadarVersionId(previous.version, classifyBump(combinedMessage, input.trigger));
  const diff = buildDiff({
    previous,
    nextVersion,
    targetIdentity,
    wantedOpportunity,
    negativeRules,
    criteria,
    sources,
    queryShifts,
    rejectedCardTitles: resultFeedback?.rejectedCardTitles ?? [],
    userMessage: combinedMessage,
  });
  const nextTargetUser = firstNonEmpty(targetIdentity, previous.targetUser, input.previousSpec.client_profile?.business_type);
  const revisionFamily = buildRevisionQueryFamily({
    targetUser: nextTargetUser,
    wantedOpportunity: effectiveOpportunity,
    criteria: unique([...criteria, ...diff.highValueCriteriaChanges], 8),
    sources: unique([...sources, ...previous.prioritySourceArchetypes], 8),
  });
  const nextRadarVersion: RadarVersionSpec = {
    ...previous,
    version: nextVersion,
    targetUser: nextTargetUser,
    opportunityIntents: unique([effectiveOpportunity, wantedOpportunity, ...criteria, ...(previous.opportunityIntents ?? [])], 12),
    highValueCriteria: unique([...criteria, ...diff.highValueCriteriaChanges, ...diff.added, ...(previous.highValueCriteria ?? [])], 12),
    exclusionRules: unique([...diff.exclusionChanges, ...diff.downweighted.map((item) => `降权：${item}`), ...(previous.exclusionRules ?? [])], 12),
    prioritySourceArchetypes: unique([...sources, ...diff.sourceShifts, ...(previous.prioritySourceArchetypes ?? [])], 12),
    queryFamilies: uniqueFamilies([revisionFamily, ...(previous.queryFamilies ?? [])]),
    defaultAssumptions: unique([...diff.assumptionChanges, ...(previous.defaultAssumptions ?? [])], 12),
    revisionNotes: unique([...diffToRevisionNotes(diff), ...(previous.revisionNotes ?? [])].map((note) => `${note.type}:${note.detail}`), 20)
      .map((entry) => {
        const [type, ...detail] = entry.split(":");
        return { type: type as RadarVersionRevisionNote["type"], detail: detail.join(":") };
      }),
  };

  const nextSpec = {
    ...input.previousSpec,
    client_profile: {
      ...input.previousSpec.client_profile,
      ...(targetIdentity ? { business_type: targetIdentity, client_type: targetIdentity } : {}),
    },
    core_goals: {
      ...input.previousSpec.core_goals,
      ...(effectiveOpportunity ? { primary_goal: effectiveOpportunity } : {}),
      secondary_goals: unique([wantedOpportunity, ...criteria, ...(input.previousSpec.core_goals?.secondary_goals ?? [])], 10),
    },
    opportunity_scope: {
      ...input.previousSpec.opportunity_scope,
      primary_opportunity_types: unique([effectiveOpportunity, wantedOpportunity, ...(input.previousSpec.opportunity_scope?.primary_opportunity_types ?? [])], 10),
      excluded_opportunity_types: unique([...diff.exclusionChanges, ...(input.previousSpec.opportunity_scope?.excluded_opportunity_types ?? [])], 12),
      must_have_conditions: unique([...criteria, ...(input.previousSpec.opportunity_scope?.must_have_conditions ?? [])], 12),
    },
    filter_rules: {
      ...input.previousSpec.filter_rules,
      must_exclude: unique([...diff.exclusionChanges, ...(input.previousSpec.filter_rules?.must_exclude ?? [])], 12),
      high_priority_signals: unique([...criteria, ...(input.previousSpec.filter_rules?.high_priority_signals ?? [])], 12),
      low_priority_signals: unique([...diff.downweighted, ...(input.previousSpec.filter_rules?.low_priority_signals ?? [])], 12),
    },
    keyword_strategy: {
      ...input.previousSpec.keyword_strategy,
      expanded_keywords_zh: unique([wantedOpportunity, ...criteria, ...(input.previousSpec.keyword_strategy?.expanded_keywords_zh ?? [])], 12),
      negative_keywords: unique([...diff.exclusionChanges, ...diff.downweighted, ...(input.previousSpec.keyword_strategy?.negative_keywords ?? [])], 12),
    },
    confirmation_status: {
      ...(input.previousSpec.confirmation_status ?? {}),
      status: "confirmation_card_generated" as const,
      user_confirmed: false,
      confirmed_at: "",
      last_user_feedback: input.userMessage,
      revision_count: (input.previousSpec.confirmation_status?.revision_count ?? 0) + 1,
    },
    radar_version: nextRadarVersion,
  };

  return {
    spec: nextSpec,
    radarVersion: nextRadarVersion,
    radarDiff: diff,
    suggestedName: nextRadarVersion.oneSentencePositioning || `${nextTargetUser || "我的"}机会雷达`,
    confirmationPrompt: `我已把雷达升级为 ${nextVersion}。请确认是否按 ${nextVersion} 盯一次。`,
    shouldSearchAfterConfirm: true,
  };
}
