import { Hono, type Context } from "hono";
import { filterOpportunityV2Radar, readOpportunityV2Pool, readOpportunityV2Sources, type OpportunityV2 } from "../../opportunity-v2";
import type { OpportunityV2RouteOptions } from "./opportunity-v2";

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/gu, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}

function card(item: OpportunityV2): string {
  const deadline = item.status === "UNKNOWN_DEADLINE" ? "截止时间待确认" : new Date(item.deadline as string).toLocaleDateString("zh-CN");
  return `<article class="card"><div class="eyebrow">${escapeHtml(item.category)} · ${escapeHtml(item.region)}</div><h2>${escapeHtml(item.title)}</h2><p>${escapeHtml(item.summary)}</p><div class="meta"><span>来源：${escapeHtml(item.source_name)}</span><span>截止：${escapeHtml(deadline)}</span></div><a href="${escapeHtml(item.detail_url)}" rel="noreferrer" target="_blank">查看详情 ↗</a></article>`;
}

export function opportunityV2PagesRoutes(options: OpportunityV2RouteOptions = {}): Hono {
  const app = new Hono();
  const render = (c: Context) => {
    const sources = readOpportunityV2Sources(options.sourcesPath);
    const opportunities = filterOpportunityV2Radar(readOpportunityV2Pool(options.poolPath).opportunities, sources);
    const body = opportunities.length ? opportunities.map(card).join("") : `<div class="empty">还没有可展示的机会。请先运行 V2 聚合抓取。</div>`;
    return c.html(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>非遗机会雷达 V2 · ChancePing</title><style>body{margin:0;background:#f5f1e8;color:#28261f;font:15px/1.65 system-ui,sans-serif}.wrap{max-width:1120px;margin:auto;padding:28px 22px 60px}header{display:flex;justify-content:space-between;align-items:end;border-bottom:1px solid #d8cfbf;padding-bottom:18px}h1{font:36px Georgia,serif;margin:0}header p{color:#706a5f;margin:5px 0 0}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 28px;margin-top:12px}.card{border-bottom:1px solid #d8cfbf;padding:22px 0}.eyebrow{color:#637b6c;font-size:12px}.card h2{font:21px Georgia,serif;margin:7px 0}.card p{color:#6b655b;margin:0 0 10px}.meta{display:flex;gap:18px;color:#837b6e;font-size:12px;margin-bottom:9px}.card a{color:#31506a;text-decoration:none}.empty{margin-top:35px;padding:30px;background:#ebe4d6;color:#6b655b}@media(max-width:700px){header{display:block}.grid{display:block}h1{font-size:30px}}</style></head><body><main class="wrap"><header><div><h1>非遗机会雷达</h1><p>Source Pool → Opportunity Pool → Radar View · V2 Simple Aggregator</p></div><strong>${opportunities.length} 条当前机会</strong></header><section class="grid">${body}</section></main></body></html>`);
  };
  app.get("/", render);
  app.get("", render);
  return app;
}
