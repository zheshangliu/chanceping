import type { WorkbenchAssessment } from "./procurement-workbench";

function csvCell(value: unknown): string {
  let text = value == null ? "" : String(value);
  if (/^[=+\-@]/u.test(text)) text = `'${text}`;
  return `"${text.replace(/"/gu, '""')}"`;
}

export function renderProcurementCsv(items: WorkbenchAssessment[]): string {
  const header = ["opportunity_id", "title", "buyer", "region", "lane", "business_fit", "eligibility_status", "budget", "currency", "deadline", "deadline_precision", "source_url", "fit_reasons", "missing_requirements"].map(csvCell).join(",");
  const rows = items.map((assessment) => {
    const item = assessment.opportunity;
    const publicDeadline = item.deadline_conflict_unsafe ? null : item.deadline;
    const precision = publicDeadline ? (publicDeadline.includes("T") ? "minute" : "date") : "unknown";
    return [assessment.opportunity_id, item.title, item.procurement?.buyer_name ?? "", item.region, assessment.lane, assessment.business_fit, assessment.eligibility_status, item.procurement?.budget_amount ?? "", item.procurement?.budget_currency ?? "", publicDeadline ?? "截止时间待核实", precision, item.detail_url || item.source_url, assessment.fit_reasons.join("；"), assessment.missing_requirements.join("；")].map(csvCell).join(",");
  });
  return `${[header, ...rows].join("\n")}\n`;
}

export function renderProcurementMarkdown(items: WorkbenchAssessment[], title = "采购机会工作台导出"): string {
  const lines = [`# ${title}`, "", `共 ${items.length} 条`, ""];
  for (const assessment of items) {
    const item = assessment.opportunity;
    lines.push(`## ${item.title}`, `- 买方：${item.procurement?.buyer_name ?? "待确认"}`, `- 地区：${item.event_location || item.region}`, `- 阶段：${assessment.lane} / ${item.procurement?.stage ?? "unknown"}`, `- 预算：${item.procurement?.budget_amount ?? "待公告确认"} ${item.procurement?.budget_currency ?? ""}`.trim(), `- 截止：${item.deadline_conflict_unsafe ? "截止时间待核实" : item.deadline ?? "待确认"}`, `- 我们能做的部分：${assessment.fit_reasons.join("；") || "待人工判断"}`, `- 资格缺口：${assessment.missing_requirements.join("；") || "待核验"}`, `- 官方来源：${item.detail_url || item.source_url}`, "");
  }
  return `${lines.join("\n")}\n`;
}
