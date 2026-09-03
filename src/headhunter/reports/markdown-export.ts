import type { WeeklySnapshot } from "../model/weekly-snapshot";

export function renderWeeklyMarkdown(snapshot: WeeklySnapshot): string {
  const title = `# 维优 BD 情报周报｜${snapshot.week_key.replace("-W", " W")}`;
  const actionable = snapshot.leads.filter((lead) => lead.lead_pool === "A_ACTIONABLE");
  const highValue = snapshot.leads.filter((lead) => lead.business_score >= 70);
  const actions = snapshot.leads.filter((lead) => lead.generated_action || lead.manual_action);
  const lines = [title, "", "## 一、本周必须联系", ...renderLeads(actionable), "", "## 二、高价值活动", ...renderLeads(highValue), "", "## 三、重要政策 / 市场变化", ...renderTrends(snapshot, ["policy", "market"]), "", "## 四、招聘市场变化", ...renderTrends(snapshot, ["industry", "hiring_market"]), "", "## 五、本周 BD Action", ...renderActions(actions)];
  return `${lines.join("\n").trim()}\n`;
}

function renderLeads(leads: WeeklySnapshot["leads"]): string[] {
  if (leads.length === 0) return ["- 暂无符合条件的公司。"];
  return leads.flatMap((lead) => {
    const lines = [`### ${lead.company_name ?? lead.company_id}${lead.industry || lead.region ? `｜${[lead.industry, lead.region].filter(Boolean).join(" · ")}` : ""}`];
    lines.push(`- 为什么现在：${lead.why_now_zh ?? lead.opportunity_summary ?? "待补充业务解释"}`);
    lines.push(`- 主要触发：${lead.trigger_summary_zh ?? "待补充触发事件"}`);
    if (lead.primary_trigger?.source_url) lines.push(`- 核心证据：[${lead.primary_trigger.source_name ?? "查看原文"}](${lead.primary_trigger.source_url})`);
    lines.push(`- 潜在人才需求：${lead.talent_need_zh ?? "待补充"}`);
    lines.push(`- 维优切入点：${lead.service_wedge_zh ?? "待补充"}`);
    lines.push(`- 本周行动：${lead.manual_action ?? lead.bd_action_zh ?? lead.generated_action ?? "待补充"}`);
    lines.push(`- 首触话术：${lead.manual_outreach ?? lead.first_touch_script_zh ?? lead.generated_outreach ?? "待补充"}`);
    const evidenceLines = (lead.evidences ?? []).filter((item) => item.source_url).map((item) => `  - [${item.title}](${item.source_url})｜${item.source_name}${item.published_at ? `｜${item.published_at}` : ""}`);
    if (evidenceLines.length) lines.push("- 证据：", ...evidenceLines);
    const contactLines = [...(lead.contacts ?? []).filter((item) => item.url || item.email || item.phone).map((item) => `  - ${item.name ?? item.title ?? item.contact_type}：${item.url ?? item.email ?? item.phone}`), ...(lead.official_contact_entries ?? []).map((item) => `  - ${item.label}：${item.url ?? item.email ?? item.phone ?? ""}`)];
    if (contactLines.length) lines.push("- 联系入口：", ...contactLines);
    lines.push(`- 辅助评分：BusinessScore ${lead.business_score} · Freshness ${lead.freshness_score} · Final ${lead.final_rank_score}`);
    return lines;
  });
}

function renderTrends(snapshot: WeeklySnapshot, types: string[]): string[] {
  const trends = snapshot.trends.filter((trend) => types.includes(trend.trend_type));
  return trends.length ? trends.map((trend) => {
    const links = (trend.evidence_ids ?? []).map((id) => `[证据 ${id}]`).join("、");
    const summary = trend.fact_summary_zh ?? trend.summary;
    const relevance = trend.relevance_to_gbs_zh ?? trend.implication_for_gbs_zh;
    const source = trend.source_url ? `｜[${trend.source_name ?? "查看原文"}](${trend.source_url})` : "";
    return `- ${trend.title}${trend.published_at ? `（${trend.published_at}）` : ""}：${summary}${relevance ? `｜与维优的关系：${relevance}` : ""}${source}${links ? `｜${links}` : ""}`;
  }) : ["- 暂无新增变化。"];
}

function renderActions(leads: WeeklySnapshot["leads"]): string[] {
  if (!leads.length) return ["- 暂无 BD Action。"];
  return leads.map((lead) => `- ${lead.company_id}：${lead.manual_action ?? lead.generated_action ?? "待生成"}`);
}
