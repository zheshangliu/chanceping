import type { ExtractedRequirementInfo } from "../schema/extracted-requirement-info";
import {
  CONFIDENCE_WEIGHTS,
  computeConfidenceTotal,
  createDefaultConfidence,
  type ConfidenceDimensionKey,
  type RequirementConfidence,
} from "../schema/requirement-confidence";
import type { QuestionToConfirm } from "../schema/radar-requirement-spec";

export interface RequirementInterpretation {
  confidence: RequirementConfidence;
  questions: QuestionToConfirm[];
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function cleanPhrase(value: string): string {
  return value
    .replace(/^一(?:名|家|个)/, "")
    .replace(/^(?:主要|专门)/, "")
    .replace(/(?:然后|目前|现在)$/, "")
    .trim();
}

export function extractIdentity(text: string): string {
  const direct = text.match(/(?:^|[\n。；;])\s*(?:我|我们)(?:是一名|是一家|是|代表)([^，,。\n；;]{1,40})/);
  if (direct?.[1]) return cleanPhrase(direct[1]);

  const clientService = text.match(/(?:^|[\n。；;])\s*我们(?:主要|专门)?帮客户做([^，,。\n；;]{1,40})/);
  if (clientService?.[1]) return `${cleanPhrase(clientService[1])}服务团队`;

  const service = text.match(/(?:^|[\n。；;])\s*我们(?:主要|专门)?做([^，,。\n；;]{1,40})/);
  if (service?.[1]) return `${cleanPhrase(service[1])}服务团队`;
  return "";
}

function domainFromIdentity(identity: string): string {
  return identity
    .replace(/(?:服务团队|有限公司|公司|工作室|机构|团队|选手|顾问|从业者|个人)$/g, "")
    .trim();
}

function hasOpportunityIntent(text: string): boolean {
  return /想(?:要)?(?:盯|寻找|找|了解|关注|参加|获得|接到|承接|监控)|要(?:盯|寻找|找|了解|关注)|希望(?:盯|寻找|找|了解|关注|获得)|需要(?:寻找|找|了解|关注|申请)|正在寻找|\[用户补充回答\]/.test(text);
}

function extractOpportunityTypes(text: string, domain: string): string[] {
  if (!hasOpportunityIntent(text)) return [];
  const types: string[] = [];
  const domainLabel = domain || "";

  if (/b2b\s*商品交易|商品交易\s*SaaS|B2B\s*商品|零售行业|retail/i.test(text) && /SaaS|软件|系统|平台|B2B/i.test(text)) {
    types.push("零售商品交易 SaaS 渠道合作");
    types.push("零售客户线索");
  }
  if (/研学需求/.test(text)) types.push("研学需求");
  if (/客户线索|找[^，,。\n；;]{0,12}客户|国企单位和企业/.test(text)) types.push("客户线索");
  if (/投标|招标/.test(text)) types.push("投标机会");
  if (/补贴/.test(text) && /申报|申请/.test(text)) types.push("补贴申报");
  if (/政策申报|项目申报/.test(text)) types.push("项目申报");
  if (/订单/.test(text)) types.push(`${domainLabel || "业务"}订单`);
  if (/招聘|岗位/.test(text)) types.push("招聘机会");
  if (/培训营/.test(text)) types.push(`${domainLabel}培训营`);
  if (/赞助/.test(text)) types.push(`${domainLabel}赞助合作`);
  if (/合作/.test(text)) types.push(`${domainLabel || "项目"}合作`);
  if (/公开赛/.test(text)) types.push(`${domainLabel}公开赛`);
  if (/定段赛/.test(text)) types.push(`${domainLabel}职业定段赛`);
  if (/比赛|竞赛|大赛|赛事/.test(text)) {
    types.push(`${/RPA/i.test(text) ? "RPA" : domainLabel}比赛` || "比赛");
  }

  if (types.length === 0) {
    const phrase = text.match(/(?:想(?:要)?|要|希望|需要)(?:盯|寻找|找|了解|关注|获得|接到|承接|监控)?\s*([^，,。\n；;]{2,40})/)?.[1] ?? "";
    const cleaned = phrase
      .replace(/未来\s*\d+\s*天(?:内)?|本周|本月|近期|长期/g, "")
      .replace(/国内外|中国|国内|海外|国际|全球/g, "")
      .replace(/^可(?:报名|申请|联系)的?/, "")
      .trim();
    if (cleaned) types.push(cleaned);
  }
  return unique(types);
}

function extractRegions(text: string): string[] {
  const regions: string[] = [];
  if (/中国|国内|全国|国内外/.test(text)) regions.push("中国");
  if (/国外|海外|国际|全球|国内外/.test(text)) regions.push("国际");
  if (/东南亚|东盟|ASEAN|Southeast\s*Asia/i.test(text)) regions.push("东南亚");
  for (const region of ["北京", "上海", "广州", "深圳", "杭州", "广东", "大湾区", "香港", "澳门", "台湾", "新加坡", "马来西亚", "越南", "泰国", "印尼", "菲律宾"]) {
    if (text.includes(region)) regions.push(region);
  }
  return unique(regions);
}

function extractTimeWindow(text: string): string {
  const futureDays = text.match(/未来\s*(\d+)\s*天(?:内)?/);
  if (futureDays) return `未来${futureDays[1]}天内可行动`;
  if (/本周/.test(text)) return "本周内可行动";
  if (/本月/.test(text)) return "本月内可行动";
  if (/长期/.test(text)) return "长期持续监控";
  if (/近期|即将/.test(text)) return "近期可行动";
  if (/可报名/.test(text)) return "近期仍可报名";
  return "";
}

function extractAfter(text: string, marker: RegExp): string[] {
  const match = text.match(marker);
  if (!match?.[1]) return [];
  return unique(match[1].split(/[、，,和或]/).map((item) => item.trim()));
}

function extractActionIntent(text: string, opportunities: string[]): string {
  if (!hasOpportunityIntent(text)) return "";
  if (/报名|参赛/.test(text)) return "报名比赛";
  if (/补贴/.test(text) && /申请|申报/.test(text)) return "申请补贴";
  if (/申报/.test(text)) return "申报项目";
  if (/客户线索|获客|接到|订单/.test(text)) return "寻找客户";
  if (/岗位|招聘|投递/.test(text)) return "寻找招聘线索";
  if (/投标|招标|合作/.test(text)) return "寻找合作";
  return opportunities.length > 0 ? "保存观察" : "";
}

function classifyClientType(identity: string): string {
  if (!identity) return "";
  if (/公司|机构/.test(identity)) return "公司";
  if (/团队|工作室/.test(identity)) return "团队";
  return "个人";
}

/**
 * Deterministic semantic fallback for mock mode. It extracts the user's own
 * words and intentionally leaves missing dimensions empty so clarification
 * can happen. It is not an industry-template catalogue.
 */
export function extractGenericMockRequirement(description: string): ExtractedRequirementInfo {
  const text = description.trim();
  const identity = extractIdentity(text);
  const domain = domainFromIdentity(identity);
  const opportunities = extractOpportunityTypes(text, domain);
  const regions = extractRegions(text);
  const timeWindow = extractTimeWindow(text);
  const exclusions = extractAfter(text, /(?:排除|不要|不想要)\s*([^。\n；;]+)/);
  const priorities = extractAfter(text, /优先(?:看|考虑|关注)?\s*([^，,。\n；;]+)/);
  const actionIntent = extractActionIntent(text, opportunities);
  const reportFrequency = /每天|每日/.test(text) ? "每日" : /每周|本周/.test(text) ? "每周" : "";
  const reportFormat = /Markdown|报告/i.test(text) ? "markdown" : "";

  return {
    client_identity: {
      client_type: classifyClientType(identity),
      industry: domain,
      business_type: identity,
      core_capabilities: domain ? [domain] : [],
      products_or_projects: [],
      company_stage: "",
      regions: regions,
      notes: "",
    },
    business_goal: {
      primary_goal: opportunities.length > 0 ? `寻找${opportunities.join("、")}` : "",
      secondary_goals: [],
      success_definition: timeWindow,
      priority_order: priorities,
    },
    opportunity_type: {
      primary_types: opportunities,
      secondary_types: [],
      excluded_types: exclusions,
      must_have_conditions: [],
    },
    region_scope: {
      primary_regions: regions,
      secondary_regions: [],
      excluded_regions: [],
      overseas_allowed: regions.includes("国际") || regions.includes("东南亚"),
      global_allowed: /全球|国内外/.test(text),
    },
    exclusion_rules: {
      must_exclude: exclusions,
      low_priority_signals: [],
      count: exclusions.length,
    },
    action_scenario: {
      action_intent: actionIntent,
      priority_order: priorities,
    },
    report_format: {
      frequency: reportFrequency,
      format: reportFormat,
      must_include_sections: [],
    },
  };
}

function setDimension(
  confidence: RequirementConfidence,
  key: ConfidenceDimensionKey,
  score: number,
  reason: string,
): void {
  confidence[key] = { score, weight: CONFIDENCE_WEIGHTS[key], reason };
}

function missingQuestion(
  question: string,
  field: string,
  why: string,
  priority: QuestionToConfirm["priority"] = "high",
): QuestionToConfirm {
  return { question, related_field: field, why_it_matters: why, priority };
}

/** Build evidence-aware confidence from the user's text, not from filled defaults. */
export function interpretRequirement(
  description: string,
  info: ExtractedRequirementInfo,
): RequirementInterpretation {
  const text = description.trim();
  const identity = extractIdentity(text);
  const domain = domainFromIdentity(identity);
  const identityExplicit = Boolean(identity);
  const opportunityExplicit = hasOpportunityIntent(text) && (info.opportunity_type.primary_types?.length ?? 0) > 0;
  const regionExplicit = (info.region_scope.primary_regions?.length ?? 0) > 0;
  const timeExplicit = Boolean(extractTimeWindow(text));
  const exclusionExplicit = /排除|不要|不想要/.test(text) && (info.exclusion_rules.count ?? 0) > 0;
  const actionExplicit = /报名|参赛|申报|申请|投标|联系|获客|接到|投递|销售/.test(text);
  const reportExplicit = /每天|每日|每周|Markdown|报告/i.test(text);
  const priorityExplicit = /优先/.test(text);

  const confidence = createDefaultConfidence();
  setDimension(
    confidence,
    "client_identity",
    identityExplicit ? 95 : info.client_identity.business_type ? 45 : 0,
    identityExplicit ? `用户明确表达：${identity}` : info.client_identity.business_type ? "AI 推断：主体尚未得到用户确认" : "信息缺失：用户身份未说明",
  );
  setDimension(
    confidence,
    "business_goal",
    opportunityExplicit ? (timeExplicit || priorityExplicit ? 95 : 75) : info.business_goal.primary_goal ? 45 : 0,
    opportunityExplicit ? `用户明确表达：${info.business_goal.primary_goal}` : info.business_goal.primary_goal ? "AI 推断：业务目标来自上下文" : "信息缺失：行动目标未说明",
  );
  setDimension(
    confidence,
    "opportunity_type",
    opportunityExplicit ? (exclusionExplicit ? 95 : 90) : 0,
    opportunityExplicit ? `用户明确表达：${(info.opportunity_type.primary_types ?? []).join("、")}` : "信息缺失：机会类型未说明",
  );
  setDimension(
    confidence,
    "region_scope",
    regionExplicit ? ((info.region_scope.primary_regions ?? []).length > 1 ? 95 : 80) : 0,
    regionExplicit ? `用户明确表达：${(info.region_scope.primary_regions ?? []).join("、")}` : "信息缺失：地域范围未说明",
  );
  setDimension(
    confidence,
    "exclusion_rules",
    exclusionExplicit ? 90 : 0,
    exclusionExplicit ? `用户明确表达：${(info.exclusion_rules.must_exclude ?? []).join("、")}` : "信息缺失：排除条件未说明",
  );
  setDimension(
    confidence,
    "action_scenario",
    actionExplicit ? 90 : opportunityExplicit && info.action_scenario.action_intent ? 55 : 0,
    actionExplicit ? `用户明确表达：${info.action_scenario.action_intent}` : opportunityExplicit ? "AI 推断：先按发现并保存机会处理" : "信息缺失：拿到机会后的行动未说明",
  );
  setDimension(
    confidence,
    "report_format",
    reportExplicit ? 75 : 55,
    reportExplicit ? "用户明确表达了报告频率或格式" : "AI 推断：默认生成每周 Markdown 报告",
  );
  confidence.total = computeConfidenceTotal(confidence);

  const questions: QuestionToConfirm[] = [];
  if (!opportunityExplicit) {
    const opportunityQuestion = domain === "围棋"
      ? "你主要想盯哪些围棋机会，例如公开赛、职业定段赛、奖金赛事、培训营、赞助合作，还是其他机会？"
      : `你主要想盯哪些${domain ? `与${domain}相关的` : ""}机会，例如比赛、项目申报、客户线索、订单合作，还是其他机会？`;
    questions.push(missingQuestion(opportunityQuestion, "opportunity_type", "机会类型决定搜索关键词和筛选标准"));
  }
  if (!identityExplicit) {
    questions.push(missingQuestion("为了判断机会是否适合你，你是谁，或代表哪类公司、团队或机构？", "client_identity", "主体身份决定匹配条件"));
  }
  if (!regionExplicit && !timeExplicit) {
    questions.push(missingQuestion("你希望优先看哪些地区和时间范围，例如国内外、未来30天或长期监控？", "region_scope", "地区和时间范围会显著影响搜索结果", "medium"));
  } else if (!regionExplicit) {
    questions.push(missingQuestion("你希望优先看哪些地区，例如中国、海外、城市或行业范围？", "region_scope", "地区范围会显著影响搜索结果", "medium"));
  } else if (!timeExplicit) {
    questions.push(missingQuestion("你希望优先看什么时间窗口，例如本周、未来30天、未来60天或长期监控？", "time_window", "时间窗口会影响搜索结果和行动优先级", "medium"));
  }
  if (!actionExplicit || !exclusionExplicit) {
    questions.push(missingQuestion("找到机会后你准备采取什么行动？还有哪些内容需要排除或哪些官网要优先看？", "action_scenario", "行动和排除条件能减少无效结果", "medium"));
  }

  return { confidence, questions };
}
