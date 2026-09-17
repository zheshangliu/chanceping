import type { IchOpportunity } from "./types";

export interface IchSemanticIssue {
  field: string;
  reason: string;
}

const REPEATED_FIELDS = [
  "description",
  "eligibility.eligibility_text",
  "benefits.benefit_text",
  "costs.cost_text",
  "requirements.requirements_text",
  "application.application_email",
  "application.application_platform",
  "seo.meta_title",
  "seo.meta_description",
  "seo.og_title",
  "seo.og_description",
] as const;

const PLACEHOLDER_VALUES = new Set([
  "未确认。",
  "未确认",
  "未披露。",
  "未披露",
  "暂无",
  "null",
]);

function getPath(value: IchOpportunity, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => {
    if (!current || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[key];
  }, value);
}

function primarySource(entry: IchOpportunity) {
  return entry.sources.find((source) => source.is_primary) ?? entry.sources[0] ?? null;
}

function sourceHost(entry: IchOpportunity): string | null {
  const source = primarySource(entry);
  if (!source) return null;
  try {
    return new URL(source.url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isCanonicalGuangdongCompetition(entry: IchOpportunity): boolean {
  const host = sourceHost(entry);
  return Boolean(
    host && (host === "yuexiu.gov.cn" || host.endsWith(".yuexiu.gov.cn")) &&
      /广东省非物质文化遗产创意设计大赛/.test(entry.title),
  );
}

function meaningful(value: unknown): value is string {
  return typeof value === "string" && value.trim().length >= 20 &&
    !PLACEHOLDER_VALUES.has(value.trim()) &&
    !/^(未确认|未披露|暂无|费用未在本条摘要中确认)/.test(value.trim());
}

/**
 * Detects fields that were copied from the known Guangdong competition template
 * or are repeated across unrelated source domains. This is intentionally a
 * blocking check for new imports: a source page may be reused, but semantic
 * fields must not silently travel with it.
 */
export function findIchSemanticIssues(entry: IchOpportunity, contextEntries: IchOpportunity[] = []): IchSemanticIssue[] {
  const issues: IchSemanticIssue[] = [];
  const canonical = isCanonicalGuangdongCompetition(entry);
  const source = primarySource(entry);
  const host = sourceHost(entry);

  const knownTemplateValues: Array<[string, unknown, string]> = [
    ["description", entry.description, "广东赛事描述模板"],
    ["eligibility.eligibility_text", entry.eligibility.eligibility_text, "广东赛事资格模板"],
    ["benefits.benefit_text", entry.benefits.benefit_text, "广东赛事奖项模板"],
    ["costs.cost_text", entry.costs.cost_text, "广东赛事费用模板"],
    ["requirements.requirements_text", entry.requirements.requirements_text, "广东赛事要求模板"],
    ["application.application_email", entry.application.application_email, "广东赛事报名邮箱模板"],
    ["seo.meta_title", entry.seo?.meta_title, "广东赛事 SEO 标题模板"],
    ["seo.meta_description", entry.seo?.meta_description, "广东赛事 SEO 描述模板"],
    ["seo.og_title", entry.seo?.og_title, "广东赛事 OG 标题模板"],
    ["seo.og_description", entry.seo?.og_description, "广东赛事 OG 描述模板"],
  ];
  const markers = [
    "广东非遗项目为核心",
    "gdsfycyds@qq.com",
    "第十一届广东省非遗创意设计大赛",
    "2026广东省非遗创意设计大赛",
    "官方通知明确本次大赛不收取任何报名费用",
  ];
  for (const [field, value, label] of knownTemplateValues) {
    if (typeof value !== "string" || !markers.some((marker) => value.includes(marker))) continue;
    if (!canonical) issues.push({ field, reason: `检测到${label}，但来源 ${host ?? "未确认"} 与该赛事不匹配` });
  }

  const siblings = [...contextEntries, entry];
  for (const field of REPEATED_FIELDS) {
    const value = getPath(entry, field);
    if (!meaningful(value)) continue;
    const sameValue = siblings.filter((candidate) => getPath(candidate, field) === value);
    const hosts = new Set(sameValue.map(sourceHost).filter((item): item is string => Boolean(item)));
    if (sameValue.length >= 3 && hosts.size >= 3 && !canonical) {
      issues.push({ field, reason: `同一字段在 ${sameValue.length} 条不同来源记录中完全相同，疑似模板复制` });
    }
  }

  if (source && source.is_primary && !host) issues.push({ field: "sources[primary].url", reason: "主来源 URL 无法解析主机名" });
  return issues;
}

export function hasIchSemanticIssues(entry: IchOpportunity, contextEntries: IchOpportunity[] = []): boolean {
  return findIchSemanticIssues(entry, contextEntries).length > 0;
}

export function isKnownTemplateContaminated(entry: IchOpportunity): boolean {
  return findIchSemanticIssues(entry).some((issue) => issue.reason.includes("模板"));
}

/**
 * Keep the useful clue (title, URL, dates and source note), but remove fields
 * that are not proven by the record's own source. This is used by the DS0
 * repair command and is deliberately reversible through the git diff/backup.
 */
export function sanitizeIchTemplateContamination(entry: IchOpportunity, now: string): IchOpportunity {
  const next = structuredClone(entry);
  const unknown = "未确认。请以官方来源最新页面为准。";
  next.description = null;
  next.opportunity_value_text = null;
  next.eligibility = {
    ...next.eligibility,
    eligible_applicant_types: ["unknown"],
    eligibility_text: unknown,
    ich_status_required: null,
    business_license_required: null,
    local_registration_required: null,
    recommendation_required: null,
    age_requirement_text: null,
    language_requirement_text: null,
    eligibility_status: "unknown",
  };
  next.benefits = {
    ...next.benefits,
    value_types: [],
    prize_amount: null,
    prize_currency: null,
    funding_amount: null,
    funding_currency: null,
    procurement_budget_min: null,
    procurement_budget_max: null,
    procurement_currency: null,
    sales_opportunity: null,
    channel_opportunity: null,
    benefit_text: unknown,
  };
  next.costs = {
    ...next.costs,
    application_fee_amount: null,
    application_fee_currency: null,
    booth_fee_amount: null,
    booth_fee_currency: null,
    deposit_amount: null,
    commission_rate: null,
    travel_self_funded: null,
    accommodation_self_funded: null,
    materials_self_funded: null,
    shipping_self_funded: null,
    cost_text: unknown,
    cost_status: "unknown",
  };
  next.requirements = {
    ...next.requirements,
    documents_required: [],
    portfolio_required: null,
    sample_required: null,
    proposal_required: null,
    invoice_required: null,
    bidding_qualification_required: null,
    production_capacity_text: null,
    requirements_text: unknown,
  };
  next.application = {
    ...next.application,
    application_email: null,
    application_phone: null,
    application_platform: null,
    application_steps: [],
    application_status: "unknown",
  };
  next.seo = null;
  next.verification = {
    ...next.verification,
    verification_status: "partially_verified",
    verified_at: now,
    source_conflict: true,
    conflict_notes: "DS0 检测到与其他机会重复的模板字段；标题、来源、日期和摘要保留为待回溯线索，详细字段不作为事实展示。",
    needs_recheck: true,
    recheck_after: now,
  };
  next.metadata = { ...next.metadata, updated_at: now, last_checked_at: now, updated_by: "ich-ds0-integrity-repair" };
  const revision = next.workflow.revision + 1;
  next.workflow = {
    ...next.workflow,
    revision,
    review_reason: "DS0：模板字段已清除，等待按原始来源重新核验。",
    history: [...next.workflow.history, {
      action: "updated",
      from: next.workflow.state,
      to: next.workflow.state,
      actor: "ich-ds0-integrity-repair",
      at: now,
      reason: "清除跨机会复制字段，保留标题、来源和线索信息。",
      revision,
    }],
  };
  return next;
}
