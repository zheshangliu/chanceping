import assert from "node:assert/strict";
import { renderFinancePage } from "../src/headhunter/ui/finance-page";
import { createApp } from "../src/api/app";

async function main(): Promise<void> {
  const previous = process.env.FINANCE_PUBLIC_MODE;
  process.env.FINANCE_PUBLIC_MODE = "true";
  try {
    const weekly = renderFinancePage("/weekly");
    const visible = weekly.split("</style>")[1].split("<script")[0];
    for (const label of ["周报", "机会池", "关注公司", "公司库", "管理", "雷达介绍", "今天联系谁？", "今日行动", "Top 3 推荐行动"]) assert.match(visible, new RegExp(label));
    assert.doesNotMatch(visible, /finance-about-card/);
    for (const label of ["Candidate URLs", "联系人资料", "机器 A 候选", "Provider", "Funnel"]) assert.doesNotMatch(visible, new RegExp(label));
    for (const label of ["业务动因", "事实依据", "系统判断", "业务建议", "查看并执行", "每页", "value=\"5\"", "value=\"10\"", "value=\"30\""]) assert.match(weekly, new RegExp(label));
    for (const path of ["/opportunities", "/watchlist", "/companies", "/runs", "/about"]) assert.match(renderFinancePage(path), /finance-executive-shell/);
    const about = renderFinancePage("/about");
    assert.match(about, /雷达介绍/);
    assert.match(about, /data-about-page/);
    assert.match(about, /SOURCE &amp; REVIEW/);
    assert.match(weekly, /finance-table { background:transparent/);
    assert.match(weekly, /finance-executive-shell \.finance-topbar { width:calc/);
    assert.match(weekly, /维优BD雷达｜ChancePing Finance/);
    const detail = renderFinancePage("/opportunities/acceptance-opportunity");
    assert.match(detail, /机会详情/);
    assert.match(detail, /data-opportunity-form/);
    assert.match(detail, /复制首触话术/);

    const app = createApp();
    const request = (path: string, init: RequestInit = {}) => app.request(`https://finance.chanceping.com${path}`, { ...init, headers: { host: "finance.chanceping.com", ...(init.headers || {}) } });
    assert.equal((await request("/weekly")).status, 200);
    assert.equal((await request("/opportunities/acceptance-opportunity")).status, 200);
    const mutation = await request("/api/finance/opportunities/acceptance-opportunity/status", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "contacted", note: "acceptance" }) });
    assert.equal(mutation.status, 401);
    console.log(JSON.stringify({ status: "PASS", gates: { chinese_navigation: "PASS", executive_brief: "PASS", action_center: "PASS", progressive_disclosure: "PASS", opportunity_detail: "PASS", public_mutation_boundary: "PASS" } }));
  } finally {
    if (previous === undefined) delete process.env.FINANCE_PUBLIC_MODE;
    else process.env.FINANCE_PUBLIC_MODE = previous;
  }
}

void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
