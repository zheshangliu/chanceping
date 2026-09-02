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
  return leads.map((lead) => `- ${lead.company_id}｜BusinessScore ${lead.business_score}｜${lead.manual_outreach ?? lead.generated_outreach ?? "待补充触达话术"}`);
}

function renderTrends(snapshot: WeeklySnapshot, types: string[]): string[] {
  const trends = snapshot.trends.filter((trend) => types.includes(trend.trend_type));
  return trends.length ? trends.map((trend) => `- ${trend.title}：${trend.summary}`) : ["- 暂无新增变化。"];
}

function renderActions(leads: WeeklySnapshot["leads"]): string[] {
  if (!leads.length) return ["- 暂无 BD Action。"];
  return leads.map((lead) => `- ${lead.company_id}：${lead.manual_action ?? lead.generated_action ?? "待生成"}`);
}
