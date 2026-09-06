import { Hono } from "hono";
import { filterOpportunityV2Radar, readOpportunityV2Pool, readOpportunityV2Sources } from "../../opportunity-v2";

export interface OpportunityV2IchRouteOptions {
  sourcesPath?: string;
  poolPath?: string;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/gu, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}

function queryOf(raw: Record<string, string>): { q?: string; region?: "CN" | "GLOBAL" } {
  return { ...(raw.q ? { q: raw.q } : {}), ...(raw.region === "CN" || raw.region === "GLOBAL" ? { region: raw.region } : {}) };
}

function categoryLabel(category: string): string {
  return ({ competition: "赛事 / 征集", exhibition_market: "展会 / 市集", procurement_project: "采购 / 项目", channel_collaboration: "渠道 / 合作", policy_funding: "资助 / 扶持", international: "国际交流" } as Record<string, string>)[category] ?? category;
}

function card(item: ReturnType<typeof filterOpportunityV2Radar>[number], index: number): string {
  const deadline = item.status === "UNKNOWN_DEADLINE" ? "截止时间待确认" : new Date(item.deadline as string).toLocaleDateString("zh-CN");
  return `<article class="card"><div class="index">${String(index + 1).padStart(2, "0")}</div><div><div class="labels"><span>${escapeHtml(categoryLabel(item.category))}</span><span>${escapeHtml(item.region)}</span></div><h2>${escapeHtml(item.title)}</h2><p>${escapeHtml(item.summary)}</p><div class="meta"><span>类型：${escapeHtml(categoryLabel(item.category))}</span><span>地区：${escapeHtml(item.region)}</span><span>截止日期：${escapeHtml(deadline)}</span><span>来源：${escapeHtml(item.source_name)}</span></div><a class="detail" href="${escapeHtml(item.detail_url)}" rel="noreferrer noopener" target="_blank">查看详情 ↗</a></div></article>`;
}

export function opportunityV2IchPagesRoutes(options: OpportunityV2IchRouteOptions = {}): Hono {
  const app = new Hono();
  app.get("/", (c) => {
    const sources = readOpportunityV2Sources(options.sourcesPath);
    const pool = readOpportunityV2Pool(options.poolPath);
    const items = filterOpportunityV2Radar(pool.opportunities, sources, queryOf(c.req.query()));
    const body = items.length ? items.map(card).join("") : `<section class="empty"><h2>暂无可展示机会</h2><p>当前没有符合条件的 RELEVANT、CURRENT 机会。</p></section>`;
    return c.html(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>非遗机会雷达｜ChancePing</title><meta name="description" content="发现最新、可行动的非遗相关机会。"><style>:root{--paper:#f5f0e6;--ink:#27251f;--muted:#716c61;--line:#d9d1c2;--green:#687d70;--blue:#304963;--clay:#b6533f}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.65 system-ui,"Noto Sans SC",sans-serif}.wrap{max-width:1240px;margin:auto;padding:0 34px 56px}.header{display:flex;justify-content:space-between;align-items:center;min-height:70px;border-bottom:1px solid var(--line)}.brand{font:26px Georgia,serif}.brand small{font:13px system-ui;color:var(--muted);margin-left:16px}.nav a{color:var(--blue);text-decoration:none;margin-left:18px;font-size:13px}.hero{padding:48px 0 30px;border-bottom:1px solid var(--line)}.kicker{color:var(--green);font-size:12px;letter-spacing:.12em}.hero h1{font:44px/1.2 Georgia,"Noto Serif SC",serif;margin:8px 0}.hero p{max-width:700px;color:var(--muted);margin:0}.summary{display:flex;gap:22px;color:var(--muted);font-size:13px;margin-top:18px}.search{display:flex;gap:8px;margin:20px 0}.search input{flex:1;border:1px solid var(--line);padding:11px;background:#fffaf1}.search button{border:0;background:var(--blue);color:#fff;padding:0 20px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 32px;border-top:1px solid var(--line)}.card{display:grid;grid-template-columns:42px 1fr;gap:14px;padding:22px 0;border-bottom:1px solid var(--line)}.index{font:25px Georgia,serif;color:#4c4b45}.labels{display:flex;gap:8px;color:var(--green);font-size:12px}.labels span{border:1px solid #bccabf;padding:1px 7px}.card h2{font:21px/1.35 Georgia,"Noto Serif SC",serif;margin:8px 0}.card p{color:#696459;margin:0 0 10px}.meta{display:flex;flex-wrap:wrap;gap:12px;color:var(--muted);font-size:12px}.detail{display:inline-block;margin-top:10px;color:var(--blue);text-decoration:none;font-size:13px}.empty{padding:30px 0;color:var(--muted)}@media(max-width:760px){.wrap{padding:0 18px 40px}.header{display:block;padding:15px 0}.nav{margin-top:10px}.nav a{margin:0 16px 0 0}.hero h1{font-size:34px}.grid{display:block}.card{grid-template-columns:32px 1fr}.meta{display:block}.meta span{display:block;margin-top:3px}}</style></head><body><main class="wrap"><header class="header"><div class="brand">ChancePing<small>盯机会 · 非遗机会雷达</small></div><nav class="nav"><a href="/ich">机会导航</a><a href="/opportunity-v2/admin/sources">Source Manager</a></nav></header><section class="hero"><div class="kicker">OPPORTUNITY V2 · SOURCE → FETCH → DEDUP → FILTER</div><h1>全国及全球非遗机会导航</h1><p>从当前来源池发现可参与的赛事、征集、展会、市集、采购与合作机会。</p><div class="summary"><span>${items.length} 条当前机会</span><span>默认仅展示 RELEVANT · CURRENT / UNKNOWN_DEADLINE</span></div></section><form class="search" method="get" action="/ich"><input name="q" value="${escapeHtml(c.req.query("q"))}" placeholder="搜索机会、来源或关键词"><button type="submit">搜索</button></form><section class="grid">${body}</section></main></body></html>`);
  });
  return app;
}
