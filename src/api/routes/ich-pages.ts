import { Hono } from "hono";
import {
  getPublicIchOpportunity,
  isPublicIchOpportunity,
  queryIchOpportunities,
  type IchQueryResult,
  type PublicIchOpportunity,
} from "../../ich/query";
import { defaultIchStore, parseIchQuery, type IchReadRouteOptions } from "./public-ich";
import { buildOpportunityV2Display, filterOpportunityV2Radar, formatOpportunityV2Date, opportunityV2LiveStatus, readOpportunityV2Pool, readOpportunityV2Sources, readOpportunityV2Translations, type OpportunityV2, type OpportunityV2Translation } from "../../opportunity-v2";

const ICH_ORIGIN = "https://ich.chanceping.com";

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char] as string);
}

const STATUS_LABELS: Record<string, string> = {
  opening_soon: "即将开始", active: "进行中", closing_soon: "即将截止", long_term: "长期有效",
  expired: "已截止", ended: "已结束", cancelled: "已取消", pending_confirmation: "待确认",
  source_unavailable: "来源暂不可用",
};
const FILTER_LABELS: Record<string, string> = { all: "全部来源", cn: "国内来源", browse: "全部可浏览", current: "正在征集", closing_soon: "近期截止", opening_soon: "即将开始", long_term: "长期征集", deadline_tbd: "日期待补", history: "历史", guangzhou: "广州", guangdong: "广东省", greater_bay_area: "粤港澳大湾区", nationwide: "全国", hong_kong_macao_taiwan: "港澳台", overseas: "海外来源", online_or_unrestricted: "线上" };

function publicDate(value: string | null | undefined): string {
  if (!value) return "持续更新中";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "持续更新中";
  return `最近更新：${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

function absoluteUrl(pathname: string): string {
  return new URL(pathname, ICH_ORIGIN).toString();
}

function jsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

interface ShellOptions {
  noindex?: boolean;
  structuredData?: unknown[];
}

function shell(title: string, description: string, canonicalPath: string, body: string, options: ShellOptions = {}): string {
  const canonical = absoluteUrl(canonicalPath);
  const navCurrent = (path: string): string => {
    const home = path === "/ich" && (canonicalPath === "/ich" || canonicalPath.startsWith("/ich/opportunities/"));
    return canonicalPath === path || home ? ' aria-current="page"' : "";
  };
  const robots = options.noindex ? '<meta name="robots" content="noindex,nofollow">' : "";
  const structuredData = (options.structuredData ?? [])
    .map((item) => `<script type="application/ld+json">${jsonLd(item)}</script>`)
    .join("");
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${escapeHtml(canonical)}">${robots}<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}"><meta property="og:type" content="website"><meta property="og:url" content="${escapeHtml(canonical)}">
<meta property="og:site_name" content="盯非遗 · ChancePing"><meta name="twitter:card" content="summary"><meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">${structuredData}
<style>
:root{--paper:#f5f0e6;--ink:#27251f;--muted:#716c61;--line:#d9d1c2;--celadon:#687d70;--indigo:#304963;--clay:#b6533f;--wash:#ebe4d6}
*{box-sizing:border-box}html{background:var(--paper)}body{margin:0;color:var(--ink);font:15px/1.65 "Noto Sans SC","Source Han Sans SC",system-ui,sans-serif;background:var(--paper)}a{color:inherit} .ich-site{max-width:1440px;margin:auto;padding:0 42px 56px}.ich-header{display:flex;align-items:center;justify-content:space-between;min-height:62px;border-bottom:1px solid var(--line)}.ich-brand{display:flex;align-items:center;gap:18px;min-width:0;text-decoration:none}.ich-brand-logo{display:block;flex:0 1 auto;width:auto;height:40px;max-width:min(300px,40vw);object-fit:contain;object-position:left center}.ich-brand-subtitle{min-width:0;max-width:42vw;padding-left:18px;border-left:1px solid var(--line);font-family:serif;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ich-nav{display:flex;gap:28px;color:#5e5a51}.ich-nav a{text-decoration:none;padding:21px 0 15px;border-bottom:2px solid transparent}.ich-nav a[aria-current=page]{color:var(--indigo);border-color:var(--indigo)}.ich-hero{position:relative;min-height:254px;margin:0 0 20px;overflow:hidden;border-bottom:1px solid var(--line);background:linear-gradient(90deg,var(--paper) 0%,rgba(245,240,230,.92) 35%,rgba(245,240,230,0) 72%),#eee7da url('/assets/ich-paper-atlas-hero.png') right center/auto 112% no-repeat}.ich-hero-copy{position:relative;z-index:1;width:60%;padding:52px 0 34px;background:linear-gradient(90deg,var(--paper) 0%,rgba(245,240,230,.96) 75%,rgba(245,240,230,0) 100%)}.ich-kicker{margin:0 0 14px;color:var(--celadon);font-size:13px;letter-spacing:.08em}.ich-hero h1{margin:0 0 12px;font:44px/1.18 "Songti SC","Noto Serif SC",serif;letter-spacing:.02em}.ich-hero p{margin:0 0 14px;max-width:630px;color:#5f5a50;font-family:serif;font-size:16px}.ich-meta{display:flex;gap:24px;color:var(--muted);font-size:13px}.ich-search{display:flex;margin:0 0 14px;border:1px solid #cfc6b6;background:#fbf8f1}.ich-search input{min-width:0;flex:1;border:0;background:transparent;padding:14px 18px;color:var(--ink);font:15px inherit;outline:none}.ich-search button{border:0;background:var(--indigo);color:#fff;padding:0 28px;font-weight:700;cursor:pointer}.ich-filters{border-top:1px solid var(--line);border-bottom:1px solid var(--line)}.ich-category-row{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px;padding:14px 0}.ich-filter-button{border:1px solid var(--line);background:rgba(255,255,255,.3);padding:12px 10px;color:var(--ink);font:14px serif;cursor:pointer}.ich-filter-button:hover,.ich-filter-button.is-active{border-color:var(--celadon);background:#e8eee7;color:#345347}.ich-filter-button small{display:block;margin-top:2px;color:var(--muted);font:11px system-ui}.ich-filter-line{display:flex;align-items:center;gap:18px;padding:10px 0;border-top:1px solid var(--line);color:var(--muted);font-size:13px;overflow:auto;white-space:nowrap}.ich-filter-line a{color:var(--muted);text-decoration:none}.ich-filter-line a.is-active{color:var(--indigo);font-weight:700}.ich-sort{margin-left:auto;border:0;background:transparent;color:var(--muted);font:inherit}.ich-summary{display:flex;justify-content:space-between;gap:12px;padding:14px 0;color:var(--muted);font-size:13px}.ich-summary a{color:var(--celadon);text-decoration:none}.ich-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:32px;border-top:1px solid var(--line)}.ich-card{display:grid;grid-template-columns:40px minmax(0,1fr) 112px;gap:12px;padding:22px 0;border-bottom:1px solid var(--line)}.ich-card-index{font:25px/1 "Times New Roman",serif;color:#4c4b45}.ich-card-main{min-width:0}.ich-card-top,.ich-tags{display:flex;flex-wrap:wrap;gap:7px;align-items:center}.ich-status,.ich-category,.ich-tag{display:inline-flex;padding:2px 7px;border:1px solid var(--line);color:var(--muted);font-size:11px}.ich-status{border-color:#e7b8ad;color:var(--clay);background:#fbefe9}.ich-category{border-color:#bccabf;color:#526d5c;background:#edf2eb}.ich-card h2{margin:8px 0 6px;font:20px/1.35 "Songti SC","Noto Serif SC",serif}.ich-card h2 a{text-decoration:none}.ich-card h2 a:hover{text-decoration:underline}.ich-card p{margin:0 0 9px;color:#696459;font-size:13px}.ich-card-meta{display:flex;flex-wrap:wrap;gap:14px;color:var(--muted);font-size:12px}.ich-card-deadline{color:var(--clay);font-size:12px;white-space:nowrap}.ich-card-actions{display:flex;flex-direction:column;gap:9px;justify-content:center;align-items:flex-start;font-size:12px}.ich-card-actions a{text-decoration:none;color:var(--celadon);white-space:nowrap}.ich-card-actions a:last-child{color:var(--indigo)}.ich-pagination{display:flex;justify-content:center;gap:20px;padding:22px 0;color:var(--muted)}.ich-pagination a{text-decoration:none}.ich-pagination .current{padding:2px 10px;background:var(--indigo);color:#fff}.ich-lower{display:grid;grid-template-columns:1.2fr .8fr;gap:32px;padding-top:34px}.ich-lower section{border-top:1px solid var(--line);padding-top:16px}.ich-lower h2{margin:0 0 8px;font:21px/1.3 serif}.ich-lower p{margin:0;color:var(--muted);font-size:13px}.ich-footer{margin-top:34px;padding-top:18px;border-top:1px solid var(--line);color:var(--muted);font-size:12px}.ich-footer a{color:var(--celadon)}
@media(max-width:820px){.ich-site{padding:0 18px 42px;overflow:hidden}.ich-meta{flex-wrap:wrap;gap:8px 18px}.ich-filters{overflow:hidden}.ich-pagination{overflow-x:auto}.ich-header{display:block;padding:12px 0 0}.ich-brand{gap:10px;min-height:42px;max-width:100%}.ich-brand-logo{height:32px;max-width:52vw}.ich-brand-subtitle{max-width:42vw;padding-left:10px;font-size:11px}.ich-nav{gap:20px;margin-top:10px;border-top:1px solid var(--line);font-size:12px;overflow-x:auto;white-space:nowrap;scrollbar-width:none}.ich-nav::-webkit-scrollbar{display:none}.ich-nav a{flex:0 0 auto;padding:10px 0 8px}.ich-hero{min-height:0;background-position:70% center}.ich-hero-copy{width:100%;padding:38px 0 28px;background:linear-gradient(90deg,var(--paper) 0%,rgba(245,240,230,.9) 70%,rgba(245,240,230,.3) 100%)}.ich-hero h1{font-size:34px}.ich-category-row{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.ich-filter-line{gap:12px}.ich-grid{display:block}.ich-card{grid-template-columns:32px minmax(0,1fr);gap:10px}.ich-card-actions{grid-column:2;flex-direction:row;border-top:1px solid var(--line);padding-top:10px}.ich-lower{display:block}.ich-lower section+section{margin-top:24px}}
</style><style>.ich-detail{padding:40px 0 12px}.ich-detail-kicker{color:var(--celadon);font-size:13px;letter-spacing:.08em}.ich-detail h1{max-width:920px;margin:10px 0 16px;font:42px/1.25 "Songti SC","Noto Serif SC",serif}.ich-detail-lede{max-width:820px;color:#5f5a50;font:18px/1.7 serif}.ich-detail-layout{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:42px;margin-top:30px}.ich-detail-main,.ich-detail-aside{border-top:1px solid var(--line);padding-top:18px}.ich-detail-main h2,.ich-detail-aside h2{margin:0 0 10px;font:21px/1.3 serif}.ich-detail-main p{color:#5f5a50}.ich-detail-aside{font-size:13px}.ich-detail-aside dl{margin:0}.ich-detail-aside dt{color:var(--muted);margin-top:12px}.ich-detail-aside dd{margin:2px 0 0}.ich-source-box{margin-top:28px;padding:18px;background:var(--wash);border:1px solid var(--line)}.ich-source-box a{color:var(--indigo)}@media(max-width:820px){.ich-detail{padding-top:24px}.ich-detail h1{font-size:32px}.ich-detail-layout{display:block}.ich-detail-aside{margin-top:26px}}</style>
<style>.ich-contact-page{padding:42px 0 12px}.ich-contact-hero{display:grid;grid-template-columns:220px minmax(0,1fr) 330px;gap:42px;padding:34px 0 38px;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}.ich-contact-heading h1{margin:8px 0 12px;font:34px/1.25 "Songti SC","Noto Serif SC",serif}.ich-contact-heading>p:last-child{color:var(--muted);font-family:serif}.ich-contact-copy>p{margin:0 0 20px;color:#544f46;font:17px/1.85 "Songti SC","Noto Serif SC",serif}.ich-contact-reasons{border-top:1px solid var(--line)}.ich-contact-reasons p{display:grid;grid-template-columns:34px minmax(0,1fr);gap:12px;margin:0;padding:14px 0;border-bottom:1px solid var(--line)}.ich-contact-reasons span{color:var(--clay);font:18px/1.4 "Times New Roman",serif}.ich-contact-details{display:flex;align-items:center;gap:0;margin-top:22px;padding:13px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line);font-style:normal;white-space:nowrap}.ich-contact-details>*{padding:0 18px}.ich-contact-details>*:first-child{padding-left:0}.ich-contact-details>*+*{border-left:1px solid var(--line)}.ich-contact-details a{color:var(--indigo);font-weight:700}.ich-contact-details span{color:var(--muted)}.ich-contact-name{color:var(--ink);font-family:"Songti SC","Noto Serif SC",serif;font-weight:700}.ich-contact-qr{margin:0;padding:12px;background:#fff;border:1px solid var(--line);align-self:start}.ich-contact-qr img{display:block;width:100%;height:auto}.ich-contact-qr figcaption{text-align:center;color:var(--muted);font-size:12px;padding:8px 0 2px}.ich-principles{display:grid;grid-template-columns:220px minmax(0,1fr);gap:42px;margin-top:28px;padding:30px;background:rgba(235,228,214,.52);border-top:1px solid var(--line);border-bottom:1px solid var(--line)}.ich-principles h2{margin:8px 0 0;font:28px/1.3 "Songti SC","Noto Serif SC",serif}.ich-principles-copy{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0;color:var(--muted)}.ich-principles-copy p{margin:0;padding:4px 28px 4px 0}.ich-principles-copy p+p{padding-left:28px;border-left:1px solid var(--line)}@media(max-width:1040px){.ich-contact-hero{grid-template-columns:180px minmax(0,1fr) 280px}.ich-principles{grid-template-columns:180px minmax(0,1fr)}}@media(max-width:820px){.ich-contact-page{padding-top:24px}.ich-contact-hero{grid-template-columns:1fr;gap:22px;padding-top:24px}.ich-contact-heading h1{font-size:31px}.ich-contact-copy>p{font-size:16px}.ich-contact-qr{width:min(100%,360px);justify-self:center}.ich-contact-details{font-size:11px}.ich-contact-details>*{padding:0 8px}.ich-principles{grid-template-columns:1fr;gap:18px;padding:24px}.ich-principles h2{font-size:25px}.ich-principles-copy{grid-template-columns:1fr}.ich-principles-copy p{padding:0}.ich-principles-copy p+p{margin-top:14px;padding:14px 0 0;border-top:1px solid var(--line);border-left:0}}@media(max-width:520px){.ich-contact-details{overflow-x:auto;scrollbar-width:none}.ich-contact-details::-webkit-scrollbar{display:none}.ich-contact-reasons p{grid-template-columns:28px minmax(0,1fr)}}</style>
</head><body><div class="ich-site"><header class="ich-header"><a class="ich-brand" href="/ich" aria-label="盯非遗，返回机会导航"><img class="ich-brand-logo" src="/assets/dingfeiyi-logo.png" alt="盯非遗"><span class="ich-brand-subtitle">全球文创・非遗・手工艺机会雷达</span></a><nav class="ich-nav"><a href="/ich"${navCurrent("/ich")}>机会导航</a><a href="/ich/memo"${navCurrent("/ich/memo")}>赛事备忘录</a><a href="/ich/history"${navCurrent("/ich/history")}>历史机会</a><a href="/ich/source-principles"${navCurrent("/ich/source-principles")}>联系作者</a><a href="/ich/submit"${navCurrent("/ich/submit")}>提交来源</a></nav></header>${body}
<footer class="ich-footer"><strong>盯非遗 · ChancePing</strong>：文创 · 非遗 · 手工艺机会导航。我们按 72 小时周期整理来源并保留原始链接，申请前请以来源页面的最新说明为准。<br><a href="/ich/source-principles">联系作者</a> · <a href="/ich/submit">提交一条来源</a></footer></div></body></html>`;
}

function card(item: PublicIchOpportunity, history: boolean, index: number): string {
  const deadline = item.dates.is_long_term ? "长期有效" : (item.dates.deadline_text || "截止时间待确认");
  const categoryLabels: Record<string, string> = { competition: "赛事 / 征集", exhibition_market: "展会 / 市集", procurement_project: "采购 / 项目", channel_collaboration: "渠道 / 合作", policy_funding: "资助 / 扶持", international: "国际交流" };
  const location = item.location.city || item.location.province_state || item.location.country_name || "未确认";
  const official = item.sources.find((source) => source.is_primary) ?? item.sources[0];
  const tags = item.secondary_tags.slice(0, 3).map((tag) => `<span class="ich-tag">${escapeHtml(tag)}</span>`).join("");
  return `<article class="ich-card"><div class="ich-card-index" aria-hidden="true">${String(index).padStart(2,"0")}</div><div class="ich-card-main"><div class="ich-card-top"><span class="ich-category">${escapeHtml(categoryLabels[item.primary_category] ?? item.primary_category)}</span><span class="ich-status">${escapeHtml(STATUS_LABELS[item.status] ?? item.status)}</span></div>
<h2><a href="/ich/opportunities/${encodeURIComponent(item.slug)}">${escapeHtml(item.title)}</a></h2><p>${escapeHtml(item.summary)}</p><div class="ich-card-meta"><span>主办方：${escapeHtml(item.organizer.name)}</span><span>地区：${escapeHtml(location)}</span><span class="ich-card-deadline">${history ? "历史状态" : "截止"}：${escapeHtml(deadline)}</span></div><div class="ich-tags">${tags}</div></div><div class="ich-card-actions"><a href="/ich/opportunities/${encodeURIComponent(item.slug)}">查看详情</a>${official ? `<a rel="nofollow noopener" href="${escapeHtml(official.url)}">官方来源</a>` : ""}</div></article>`;
}

function listPage(result: IchQueryResult, history: boolean): string {
  const items = result.items;
  const heading = history ? "历史非遗机会" : "全国及全球非遗机会导航";
  const intro = history ? "这里展示已截止、已结束、已取消或来源暂不可用的历史记录。" : "为非遗手艺人、工作室、品牌与文创团队，发现可参与的项目、赛事、采购与合作机会。";
  const empty = history ? "暂无历史机会记录。" : "当前暂无已发布的非遗机会。我们只在来源和基本信息达到发布条件后展示。";
  const queryParams = new URLSearchParams({ q: result.filters.q, category: result.filters.category, region: result.filters.region, status: result.filters.status, sort: result.filters.sort });
  const href = (patch: Record<string, string>) => { const next = new URLSearchParams(queryParams); Object.entries(patch).forEach(([key, value]) => next.set(key, value)); if (!("page" in patch)) next.delete("page"); return `/ich?${next.toString()}`; };
  const categories = [["competition","赛事 / 征集","比赛与作品征集"],["exhibition_market","项目合作","展会、市集与展销"],["procurement_project","采购 / 订单","采购与项目需求"],["channel_collaboration","渠道 / 合作","入驻与联名"],["policy_funding","资助 / 扶持","政策与资金"],["international","培训 / 国际","研学与交流"]];
  const regions = [["all","全部"],["guangzhou","广州"],["guangdong","广东省"],["greater_bay_area","粤港澳大湾区"],["nationwide","全国"],["hong_kong_macao_taiwan","港澳台"],["overseas","海外"],["online_or_unrestricted","线上"]];
  const statuses = [["current","全部当前"],["closing_soon","近期截止"],["long_term","长期征集"]];
  const content = items.length > 0 ? `<div class="ich-grid">${items.map((item, index) => card(item, history, (result.page - 1) * result.page_size + index + 1)).join("")}</div>` : `<section class="ich-notice"><h2>暂无可展示机会</h2><p>${empty}</p></section>`;
  const pagination = Array.from({length: result.total_pages}, (_, i) => i + 1).map((page) => page === result.page ? `<span class="current">${page}</span>` : `<a href="${href({page: String(page)})}">${page}</a>`).join("");
  return `<main><section class="ich-hero"><div class="ich-hero-copy"><p class="ich-kicker">ChancePing · 纸本地域目录</p><h1>${heading}</h1><p>${intro}</p><div class="ich-meta"><span>最近更新：${escapeHtml(result.last_updated_at || "持续更新中")}</span><span>当前机会：${result.total} 条</span></div></div></section><form class="ich-search" method="get" action="/ich"><input name="q" value="${escapeHtml(result.filters.q)}" placeholder="搜索机会名称、主办方、关键词（如：设计大赛、采购、资助）" aria-label="搜索非遗机会"><button type="submit">搜索</button></form><div class="ich-filters"><div class="ich-category-row">${categories.map(([key, label, hint]) => `<a class="ich-filter-button${result.filters.category === key ? " is-active" : ""}" href="${href({category:key})}">${label}<small>${hint}</small></a>`).join("")}</div><div class="ich-filter-line"><span>地区索引：</span>${regions.map(([key,label]) => `<a class="${result.filters.region === key ? "is-active" : ""}" href="${href({region:key})}">${label}</a>`).join("")}</div><div class="ich-filter-line"><span>状态：</span>${statuses.map(([key,label]) => `<a class="${result.filters.status === key ? "is-active" : ""}" href="${href({status:key})}">${label}</a>`).join("")}<a class="${history ? "is-active" : ""}" href="/ich/history">历史机会</a><form method="get" action="/ich"><input type="hidden" name="q" value="${escapeHtml(result.filters.q)}"><input type="hidden" name="category" value="${escapeHtml(result.filters.category)}"><input type="hidden" name="region" value="${escapeHtml(result.filters.region)}"><input type="hidden" name="status" value="${escapeHtml(result.filters.status)}"><select class="ich-sort" name="sort" aria-label="排序" onchange="this.form.submit()"><option value="default" ${result.filters.sort === "default" ? "selected" : ""}>排序：截止时间（近→远）</option><option value="newest" ${result.filters.sort === "newest" ? "selected" : ""}>排序：最新收录</option></select></form></div></div><div class="ich-summary"><span>已选条件：　地区：${escapeHtml(FILTER_LABELS[result.filters.region] ?? result.filters.region)}　·　状态：${escapeHtml(FILTER_LABELS[history ? "history" : result.filters.status] ?? result.filters.status)}</span><a href="/ich">清空筛选</a></div>${content}<div class="ich-pagination">${pagination || "<span>暂无分页</span>"}</div><div class="ich-lower"><section><h2>来源与可信度</h2><p>我们优先从政府官网、主办方官网和官方报名页整理机会，线索会标明核验状态。申请前请回到官方来源复核。</p></section><section><h2>持续发现</h2><p>机会覆盖赛事、展销、采购、渠道、资助与国际交流，持续更新中。</p></section></div></main>`;
}

interface V2IchPageResult {
  items: OpportunityV2[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
  q: string;
  category: string;
  region: string;
  status: string;
  sort: string;
  direction: string;
  work_format: string;
  event_region: string;
  source_id: string;
  new_this_week: number;
  global_total: number;
  source_count: number;
  total_known_deadline: number;
  total_long_term: number;
  total_deadline_tbd: number;
  updated_at: string | null;
  translations: OpportunityV2Translation[];
}

function v2StatusLabel(item: OpportunityV2): string {
  const status = opportunityV2LiveStatus(item);
  if (status === "EXPIRED") return "已截止";
  if (item.starts_at && new Date(item.starts_at).getTime() > Date.now()) return "即将开始";
  if (item.is_long_term) return "长期开放";
  if (status === "UNKNOWN_DEADLINE") return "日期待补";
  return "正在征集";
}

const NAVIGATION_MARKERS = [
  /skip to (?:content|main content)/iu,
  /close menu/iu,
  /\b(?:menu|login|sign in|pricing|about us|our work|projects|reports)\b/iu,
  /home\s*\/\s*(?:open calls|opportunities)/iu,
  /当前位置\s*:/u,
  /首页\s+热门推荐/u,
  /(?:본문 바로가기|주메뉴 바로가기|로그인|회원가입)/u,
];

function isNavigationNoise(value: string): boolean {
  const markerCount = NAVIGATION_MARKERS.reduce((count, marker) => count + (marker.test(value) ? 1 : 0), 0);
  return markerCount >= 3 || (markerCount >= 1 && /来源页面未提供更详细摘要/u.test(value));
}

function safeOpportunitySummary(value: string | null | undefined, deadlineConflict = false): string {
  const summary = String(value ?? "")
    .replace(/\s+/gu, " ")
    .replace(/^(?:报名中|征稿中|征集中|正在征集|开放报名)\s*/u, "")
    .replace(/(截止(?:时间|日期)?\s*[:：]?\s*20\d{2}[年./-]\d{1,2}[月./-]\d{1,2}(?:日)?(?:\s+\d{1,2}:\d{2})?)\s+\1/gu, "$1")
    .trim();
  if (!summary || isNavigationNoise(summary)) return "来源页面未提供可直接使用的赛事简介，请打开来源原文查看完整要求。";
  if (deadlineConflict) return "来源中的截止日期存在冲突，当前暂不展示精确日期，请打开来源原文核对。";
  if (/^中文待补$/u.test(summary)) return "当前显示来源原文，请打开来源页面查看完整要求。";
  return summary.slice(0, 360);
}

function dateKey(value: string | null | undefined, fallbackYear?: string): string | null {
  const text = String(value ?? "");
  const numeric = text.match(/(20\d{2})\s*[年./-]\s*(\d{1,2})\s*[月./-]\s*(\d{1,2})/u);
  if (numeric) return `${numeric[1]}-${numeric[2].padStart(2, "0")}-${numeric[3].padStart(2, "0")}`;
  const monthDay = text.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日?/u);
  if (monthDay && fallbackYear) return `${fallbackYear}-${monthDay[1].padStart(2, "0")}-${monthDay[2].padStart(2, "0")}`;
  const english = text.match(/\b([A-Z][a-z]{2,8})\s+(\d{1,2})(?:,\s*|\s+)(20\d{2})\b/u);
  if (english) {
    const month = new Date(`${english[1]} ${english[2]}, ${english[3]} 12:00:00Z`).getUTCMonth() + 1;
    return `${english[3]}-${String(month).padStart(2, "0")}-${english[2].padStart(2, "0")}`;
  }
  return null;
}

function explicitDeadlineKeys(value: string, fallbackYear?: string): string[] {
  const keys = new Set<string>();
  const pattern = /(?:截稿至|截止时间|截止日期|报名截止|投稿截止|申请截止|截止|deadline|closing date|due date)\s*[:：]?\s*((?:20\d{2}\s*[年./-]\s*\d{1,2}\s*[月./-]\s*\d{1,2}\s*日?)|(?:\d{1,2}\s*月\s*\d{1,2}\s*日?)|(?:[A-Z][a-z]{2,8}\s+\d{1,2}(?:,\s*|\s+)20\d{2}))/giu;
  for (const match of value.matchAll(pattern)) {
    const key = dateKey(match[1], fallbackYear);
    if (key) keys.add(key);
  }
  return [...keys];
}

interface DisplayDeadline {
  text: string;
  conflict: boolean;
}

function displayDeadline(item: OpportunityV2, summary: string): DisplayDeadline {
  if (item.is_long_term) return { text: "长期开放", conflict: false };
  if (!item.deadline) return { text: "截止日期待补", conflict: false };
  const structured = dateKey(item.deadline);
  const evidence = explicitDeadlineKeys(summary, structured?.slice(0, 4));
  const conflict = Boolean(structured && evidence.length > 0 && !evidence.includes(structured));
  return { text: conflict ? "截止时间待核实" : formatOpportunityV2Date(item.deadline), conflict };
}

function discoveryLabel(item: OpportunityV2): string {
  const count = new Set(item.discovered_by_sources).size;
  return count > 1 ? `另有 ${count - 1} 个发现来源` : "";
}

function activeChip(label: string, href: string): string {
  return `<a class="ich-filter-chip" href="${href}">${escapeHtml(label)} <span aria-hidden="true">×</span></a>`;
}

function v2Card(item: OpportunityV2, index: number, translations: OpportunityV2Translation[]): string {
  const categoryLabels: Record<string, string> = { competition: "赛事 / 征集", exhibition_market: "市集 / 展销", procurement_project: "采购 / 订单", channel_collaboration: "渠道 / 合作", policy_funding: "资助 / 扶持", international: "研修 / 交流" };
  const directions: Record<string, string> = { ich_innovation: "非遗创新", cultural_creative: "文创设计", craft_arts: "工艺美术", museum_tourism: "文博文旅", integrated_cultural_design: "综合文化设计", aigc_digital: "AIGC / 数字创作" };
  const display = buildOpportunityV2Display(item, translations);
  const deadline = displayDeadline(item, `${item.summary}\n${display.summary}`);
  const summary = safeOpportunitySummary(display.summary, deadline.conflict);
  const internalTags = new Set(["competition", "procurement_project", "exhibition_market", "channel_collaboration", "policy_funding", "international", "design", "open_call"]);
  const tags = [...(item.directions ?? []).map((tag) => directions[tag] ?? tag), ...item.tags]
    .filter((tag) => !internalTags.has(tag.toLowerCase()))
    .slice(0, 3)
    .map((tag) => `<span class="ich-tag">${escapeHtml(tag)}</span>`)
    .join("");
  const detailUrl = `/ich/opportunities/${encodeURIComponent(item.id)}`;
  const translationLabel = display.translation_status === "pending" ? `<span class="ich-translation-status">中文待补</span>` : display.translation_status === "failed" ? `<span class="ich-translation-status">中文翻译失败，显示原文</span>` : "";
  const original = display.original_title && display.translated ? `<details class="ich-original"><summary>原名</summary><span>${escapeHtml(display.original_title)}</span></details>` : "";
  const sourceCount = discoveryLabel(item);
  const deadlineWarning = deadline.conflict ? `<span class="ich-data-warning" title="来源摘要中的截止日期与结构化日期不一致">来源日期冲突，暂不显示精确日期</span>` : "";
  const detailLabel = `查看 ${display.title} 详情`;
  const sourceLabel = `打开 ${display.title} 来源原文`;
  return `<article class="ich-card"><div class="ich-card-index" aria-hidden="true">${String(index).padStart(2, "0")}</div><div class="ich-card-main"><div class="ich-card-top"><span class="ich-category">${escapeHtml(categoryLabels[item.category] ?? item.category)}</span><span class="ich-status">${escapeHtml(v2StatusLabel(item))}</span></div>
<h2><a aria-label="${escapeHtml(detailLabel)}" href="${detailUrl}">${escapeHtml(display.title)}</a></h2>${translationLabel}${original}<p>${escapeHtml(summary)}</p><div class="ich-card-meta"><span>来源：${escapeHtml(item.source_name)}</span>${sourceCount ? `<span class="ich-source-count">${escapeHtml(sourceCount)}</span>` : ""}<span class="ich-card-deadline">${escapeHtml(deadline.text)}</span>${deadlineWarning}</div><div class="ich-tags">${tags}</div></div><div class="ich-card-actions"><a aria-label="${escapeHtml(detailLabel)}" href="${detailUrl}">查看详情</a><a aria-label="${escapeHtml(sourceLabel)}" rel="nofollow noopener" href="${escapeHtml(item.detail_url || item.source_url)}">来源原文</a></div></article>`;
}

function v2ListPage(result: V2IchPageResult, history: boolean): string {
  const competitionView = result.category === "competition";
  const procurementView = result.category === "procurement_project";
  const heading = history ? "历史非遗机会" : competitionView ? "全球赛事，一站看全" : procurementView ? "采购与订单机会" : "文创、非遗与手工艺机会导航";
  const intro = history ? "这里展示机会池中已截止的历史记录。" : competitionView ? "持续聚合国内外设计、文创、非遗与手工艺赛事，并逐步扩展采购、合作、资助、市集与研修机会，让手艺人、设计师、工作室和文创团队更快找到值得行动的项目。" : procurementView ? "持续整理文化机构、文旅项目、文创产品与供应商征集等可响应的采购线索。" : "持续整理国内外赛事、征集、市集、采购、资助与合作机会。";
  const kicker = history ? "盯非遗 · 历史机会" : competitionView ? "国内外文创・非遗・手工艺赛事覆盖最全" : procurementView ? "文化机构与文创项目采购线索" : "全球文创・非遗・手工艺机会雷达";
  const queryParams = new URLSearchParams({ q: result.q, category: result.category, region: result.region, status: result.status, sort: result.sort, direction: result.direction, work_format: result.work_format, event_region: result.event_region, source_id: result.source_id });
  const href = (patch: Record<string, string>) => { const next = new URLSearchParams(queryParams); Object.entries(patch).forEach(([key, value]) => value ? next.set(key, value) : next.delete(key)); if (!("page" in patch)) next.delete("page"); return `${history ? "/ich/history" : "/ich"}?${next.toString()}`; };
  const categories = [["competition", "赛事 / 征集", "比赛与作品征集"], ["exhibition_market", "市集 / 展销", "市集、展会与展销"], ["procurement_project", "采购 / 订单", "采购与项目需求"], ["channel_collaboration", "渠道 / 合作", "入驻与联名"], ["policy_funding", "资助 / 扶持", "政策与资金"], ["international", "研修 / 交流", "研学、驻地与交流"]];
  const regions = [["all", "全部来源"], ["cn", "国内来源"], ["overseas", "海外来源"]];
  const statuses = [["browse", "全部可浏览"], ["current", "正在征集"], ["closing_soon", "近期截止"], ["opening_soon", "即将开始"], ["long_term", "长期征集"], ["deadline_tbd", "日期待补"]];
  const directions = [["", "全部赛事"], ["ich_innovation", "非遗创新"], ["cultural_creative", "文创设计"], ["craft_arts", "工艺美术"], ["museum_tourism", "文博文旅"], ["integrated_cultural_design", "综合文化设计"], ["aigc_digital", "AIGC / 数字创作"]];
  const formats = [["", "全部形式"], ["material_craft", "实物工艺"], ["product_design", "产品设计方案"], ["graphic_ip", "平面 / 插画 / IP"], ["packaging", "包装设计"], ["fashion_jewellery", "服饰 / 首饰"], ["video_animation", "视频 / 动画"], ["interaction_game", "交互 / 游戏"], ["mixed_media", "综合媒介"]];
  const empty = history ? "暂无历史机会记录。" : procurementView ? "系统正在持续监测国内外文创采购、供应商征集、博物馆选品、礼品定制与文化服务项目。普通无关政府采购不会进入公开列表。" : "当前暂无已发布的非遗机会。我们会持续从来源整理和更新。";
  const content = result.items.length > 0 ? `<div class="ich-grid">${result.items.map((item, index) => v2Card(item, (result.page - 1) * result.page_size + index + 1, result.translations)).join("")}</div>` : `<section class="ich-notice${procurementView ? " ich-procurement-empty" : ""}"><h2>${procurementView ? "暂无符合非遗 / 文创范围的当前采购机会" : "暂无可展示机会"}</h2><p>${empty}</p>${procurementView ? '<a class="ich-empty-action" href="/ich?category=all">查看全部机会</a>' : ""}</section>`;
  const pagination = Array.from({ length: result.total_pages }, (_, index) => index + 1).map((page) => page === result.page ? `<span class="current">${page}</span>` : `<a href="${href({ page: String(page) })}">${page}</a>`).join("");
  const active = (selected: boolean): string => selected ? ' class="is-active" aria-current="page"' : ' class=""';
  const categoryHtml = categories.map(([key, label, hint]) => `<a class="ich-filter-button${result.category === key ? " is-active" : ""}"${result.category === key ? ' aria-current="page"' : ""} href="${href({ category: key })}">${label}<small>${hint}</small></a>`).join("");
  const directionHtml = directions.map(([key, label]) => `<a${active(result.direction === key)} href="${href({ direction: key })}">${label}</a>`).join("");
  const regionHtml = regions.map(([key, label]) => `<a${active(result.region === key)} href="${href({ region: key })}">${label}</a>`).join("");
  const statusHtml = statuses.map(([key, label]) => `<a${active(result.status === key)} href="${href({ status: key })}">${label}</a>`).join("");
  const formatHtml = formats.map(([key, label]) => `<a${active(result.work_format === key)} href="${href({ work_format: key })}">${label}</a>`).join("");
  const sortPath = history ? "/ich/history" : "/ich";
  const preserved = { category: result.category, region: result.region, status: result.status, sort: result.sort, direction: result.direction, work_format: result.work_format, event_region: result.event_region, source_id: result.source_id };
  const searchHidden = Object.entries(preserved).map(([key, value]) => `<input type="hidden" name="${key}" value="${escapeHtml(value)}">`).join("");
  const sortHidden = Object.entries({ q: result.q, category: result.category, region: result.region, status: result.status, direction: result.direction, work_format: result.work_format, event_region: result.event_region, source_id: result.source_id }).map(([key, value]) => `<input type="hidden" name="${key}" value="${escapeHtml(value)}">`).join("");
  const sortHtml = `<form class="ich-sort-form" method="get" action="${sortPath}">${sortHidden}<select class="ich-sort" name="sort" aria-label="排序" onchange="this.form.submit()"><option value="default" ${result.sort === "default" ? "selected" : ""}>排序：截止时间（近→远）</option><option value="newest" ${result.sort === "newest" ? "selected" : ""}>排序：最新收录</option></select></form>`;
  const chipItems: Array<[string, string, string]> = [];
  if (result.q) chipItems.push([`搜索：${result.q}`, "q", ""]);
  if (result.category !== "competition") chipItems.push([categories.find(([key]) => key === result.category)?.[1] ?? result.category, "category", "all"]);
  if (result.region !== "all") chipItems.push([regions.find(([key]) => key === result.region)?.[1] ?? result.region, "region", "all"]);
  if (result.status !== "browse") chipItems.push([statuses.find(([key]) => key === result.status)?.[1] ?? result.status, "status", "browse"]);
  if (result.direction) chipItems.push([directions.find(([key]) => key === result.direction)?.[1] ?? result.direction, "direction", ""]);
  if (result.work_format) chipItems.push([formats.find(([key]) => key === result.work_format)?.[1] ?? result.work_format, "work_format", ""]);
  const chipHtml = chipItems.length ? chipItems.map(([label, key, value]) => activeChip(label, href({ [key]: value }))).join("") : '<span class="ich-filter-empty">全部机会</span>';
  const resultHeading = result.q ? `“${escapeHtml(result.q)}”的 ${result.total} 条结果` : `${result.total} 条${competitionView ? "可浏览赛事" : "可浏览机会"}`;
  const clearFilters = chipItems.length ? `<a href="${history ? "/ich/history" : "/ich"}">清空筛选</a>` : "";
  const heroStats = competitionView ? `<span>当前赛事：${result.total}</span><span>海外赛事：${result.global_total}</span><span>数据源：${result.source_count}</span><span>每72小时更新</span>` : `<span>${procurementView ? "当前采购" : "当前机会"}：${result.total}</span><span>数据源：${result.source_count}</span><span>每72小时更新</span>`;
  const uiStyle = `<style>.ich-card p{font-size:14px;line-height:1.75;color:#514d45}.ich-card-meta{font-size:13px;gap:10px 14px}.ich-source-count{color:var(--celadon);font-weight:600}.ich-data-warning{color:#8a4f33;font-weight:600}.ich-result-heading{font:19px/1.4 "Songti SC","Noto Serif SC",serif;color:var(--ink)}.ich-active-filters{display:flex;flex-wrap:wrap;align-items:center;gap:7px;margin-top:8px}.ich-filter-label{color:var(--muted);font-size:12px}.ich-filter-chip{display:inline-flex;gap:5px;align-items:center;border:1px solid #b8c7ba;background:#edf2eb;color:#345347!important;padding:3px 8px;border-radius:999px;text-decoration:none!important;font-size:12px}.ich-filter-empty{color:var(--muted);font-size:12px}.ich-disclaimer{margin:8px 0 0;color:var(--muted);font-size:12px}.ich-empty-action{display:inline-block;margin-top:14px;color:var(--indigo);font-weight:600;text-decoration:none}.ich-procurement-empty{max-width:760px}.ich-format-filter{padding-bottom:12px}@media(max-width:820px){.ich-card p{font-size:15px}.ich-summary{align-items:flex-start}.ich-summary>a{white-space:nowrap}.ich-filter-line{overflow-x:auto}.ich-format-filter{display:flex}}</style>`;
  return `${uiStyle}<main><section class="ich-hero"><div class="ich-hero-copy"><p class="ich-kicker">${kicker}</p><h1>${heading}</h1><p>${intro}</p><div class="ich-meta">${heroStats}<span>${publicDate(result.updated_at)}</span></div></div></section><form class="ich-search" method="get" action="${sortPath}">${searchHidden}<input name="q" value="${escapeHtml(result.q)}" placeholder="搜索比赛、征集、文创、非遗、手工艺关键词" aria-label="搜索非遗机会"><button type="submit">搜索</button></form><div class="ich-filters"><div class="ich-category-row">${categoryHtml}</div><div class="ich-filter-line"><span>赛事方向：</span>${directionHtml}</div><div class="ich-filter-line ich-format-filter"><span>作品形式：</span>${formatHtml}</div><div class="ich-filter-line"><span>来源地区：</span>${regionHtml}</div><div class="ich-filter-line"><span>截止状态：</span>${statusHtml}<a${active(history)} href="/ich/history">历史机会</a>${sortHtml}</div></div><div class="ich-summary"><div><strong class="ich-result-heading">${resultHeading}</strong><div class="ich-active-filters" aria-label="当前筛选条件">${chipItems.length ? `<span class="ich-filter-label">当前筛选</span>${chipHtml}` : ""}</div><p class="ich-disclaimer">所有机会均保留来源页面，申请前请以原始发布信息为准。${competitionView ? ' · <a href="/ich/memo">查看赛事备忘录</a>' : ""}</p></div>${clearFilters}</div>${content}<div class="ich-pagination">${pagination || "<span>暂无分页</span>"}</div></main>`;
}

function parseV2PageQuery(raw: Record<string, string>): { q: string; category: string; region: string; status: string; sort: string; direction: string; work_format: string; event_region: string; source_id: string; page: number } {
  const page = Math.max(1, Number.isInteger(Number(raw.page)) ? Number(raw.page) : 1);
  return { q: (raw.q ?? "").trim().slice(0, 100), category: raw.category ?? "competition", region: raw.region ?? "all", status: raw.status ?? "browse", sort: raw.sort ?? "default", direction: raw.direction ?? "", work_format: raw.work_format ?? "", event_region: raw.event_region ?? "", source_id: raw.source_id ?? "", page };
}

function queryOpportunityV2ForIch(options: { q: string; category: string; region: string; status: string; sort: string; direction: string; work_format: string; event_region: string; source_id: string; page: number; pageSize: number; history: boolean; sourcesPath?: string; poolPath?: string }): V2IchPageResult {
  const sources = readOpportunityV2Sources(options.sourcesPath);
  const pool = readOpportunityV2Pool(options.poolPath);
  const now = new Date();
  const region = ["overseas", "GLOBAL"].includes(options.region) ? "GLOBAL" : ["cn", "CN"].includes(options.region) ? "CN" : options.region === "all" ? undefined : ["guangzhou", "guangdong", "greater_bay_area", "nationwide", "online_or_unrestricted"].includes(options.region) ? "CN" : undefined;
  const status = options.history ? "history" : options.status === "browse" ? undefined : options.status;
  let filtered = filterOpportunityV2Radar(pool.opportunities, sources, { q: options.q, ...(region ? { region: region as "CN" | "GLOBAL" } : {}), ...(options.source_id ? { source_id: options.source_id } : {}), ...(options.category !== "all" ? { category: options.category } : {}), ...(options.direction ? { direction: options.direction.split(",").filter(Boolean) } : {}), ...(options.work_format ? { work_format: options.work_format.split(",").filter(Boolean) } : {}), ...(options.event_region ? { event_region: options.event_region as "mainland" | "hkmt" | "overseas" | "unknown" } : {}), ...(status ? { status: status as "current" | "closing_soon" | "opening_soon" | "long_term" | "deadline_tbd" | "history" } : {}), now });
  if (["guangzhou", "guangdong", "greater_bay_area"].includes(options.region)) {
    const needles: Record<string, string[]> = { guangzhou: ["广州", "guangzhou"], guangdong: ["广东", "guangdong"], greater_bay_area: ["大湾区", "粤港澳", "greater bay"] };
    filtered = filtered.filter((item) => item.event_location && needles[options.region].some((needle) => item.event_location?.toLowerCase().includes(needle.toLowerCase())));
  }
  if (options.region === "nationwide") filtered = filtered.filter((item) => item.participation_scope === "nationwide");
  if (options.region === "online_or_unrestricted") filtered = filtered.filter((item) => item.participation_mode === "online");
  if (options.sort === "newest") filtered.sort((a, b) => b.first_seen_at.localeCompare(a.first_seen_at));
  const total = filtered.length;
  const totalKnownDeadline = filtered.filter((item) => Boolean(item.deadline) && opportunityV2LiveStatus(item, now) !== "EXPIRED").length;
  const totalLongTerm = filtered.filter((item) => item.is_long_term).length;
  const totalDeadlineTbd = filtered.filter((item) => !item.deadline && !item.is_long_term).length;
  const totalPages = Math.max(1, Math.ceil(total / options.pageSize));
  const page = Math.min(options.page, totalPages);
  const weekStart = new Date(now); weekStart.setHours(0, 0, 0, 0); weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  const newThisWeek = filtered.filter((item) => new Date(item.first_seen_at).getTime() >= weekStart.getTime()).length;
  return { items: filtered.slice((page - 1) * options.pageSize, page * options.pageSize), page, page_size: options.pageSize, total, total_pages: totalPages, q: options.q, category: options.category, region: options.region, status: options.status, sort: options.sort, direction: options.direction, work_format: options.work_format, event_region: options.event_region, source_id: options.source_id, new_this_week: newThisWeek, global_total: filtered.filter((item) => item.region === "GLOBAL").length, source_count: sources.filter((source) => source.enabled && !["PAUSED", "NEEDS_ADAPTER"].includes(source.status)).length, total_known_deadline: totalKnownDeadline, total_long_term: totalLongTerm, total_deadline_tbd: totalDeadlineTbd, updated_at: pool.updated_at, translations: readOpportunityV2Translations() };
}

function memoDate(item: OpportunityV2): string {
  if (item.is_long_term) return "长期开放";
  if (!item.deadline) return "日期待补";
  return formatOpportunityV2Date(item.deadline);
}

function v2MemoPageBody(result: V2IchPageResult): string {
  const items = result.items;
  const rows = items.map((item, index) => {
    const display = buildOpportunityV2Display(item, result.translations);
    const directions: Record<string, string> = { ich_innovation: "非遗创新", cultural_creative: "文创设计", craft_arts: "工艺美术", museum_tourism: "文博文旅", integrated_cultural_design: "综合文化设计", aigc_digital: "AIGC / 数字创作" };
    const formats: Record<string, string> = { material_craft: "实物工艺", product_design: "产品设计方案", graphic_ip: "平面 / 插画 / IP", packaging: "包装设计", fashion_jewellery: "服饰 / 首饰", video_animation: "视频 / 动画", interaction_game: "交互 / 游戏", mixed_media: "综合媒介" };
    const dimensions = [...(item.directions ?? []).map((key) => directions[key] ?? key), ...(item.work_formats ?? []).map((key) => formats[key] ?? key)].slice(0, 3).join(" · ") || "分类待补充";
    const deadline = displayDeadline(item, `${item.summary}\n${display.summary}`);
    const detailLabel = `查看 ${display.title} 详情`;
    const sourceLabel = `打开 ${display.title} 来源原文`;
    const sourceCount = discoveryLabel(item);
    return `<tr><td>${escapeHtml(deadline.text)}${deadline.conflict ? `<small class="ich-data-warning">来源日期冲突，待核实</small>` : `<small>${escapeHtml(v2StatusLabel(item))}</small>`}</td><td><a aria-label="${escapeHtml(detailLabel)}" href="/ich/opportunities/${encodeURIComponent(item.id)}">${escapeHtml(display.title)}</a>${display.original_title ? `<small>${escapeHtml(display.original_title)}</small>` : ""}</td><td>${escapeHtml(dimensions)}</td><td>${escapeHtml(item.source_name)}${sourceCount ? `<small>${escapeHtml(sourceCount)}</small>` : ""}</td><td><a aria-label="${escapeHtml(detailLabel)}" href="/ich/opportunities/${encodeURIComponent(item.id)}">查看详情</a><br><a aria-label="${escapeHtml(sourceLabel)}" rel="nofollow noopener" href="${escapeHtml(item.detail_url || item.source_url)}">来源原文</a></td></tr>`;
  }).join("");
  const knownDeadline = result.total_known_deadline;
  const longTerm = result.total_long_term;
  const tbd = result.total_deadline_tbd;
  const queryParams = new URLSearchParams({ q: result.q, category: "competition", region: result.region, status: result.status, sort: result.sort, direction: result.direction, work_format: result.work_format, event_region: result.event_region, source_id: result.source_id });
  const href = (patch: Record<string, string>) => { const next = new URLSearchParams(queryParams); Object.entries(patch).forEach(([key, value]) => value ? next.set(key, value) : next.delete(key)); if (!("page" in patch)) next.delete("page"); return `/ich/memo?${next.toString()}`; };
  const searchHidden = Object.entries({ category: "competition", region: result.region, status: result.status, sort: result.sort, direction: result.direction, work_format: result.work_format, event_region: result.event_region, source_id: result.source_id }).map(([key, value]) => `<input type="hidden" name="${key}" value="${escapeHtml(value)}">`).join("");
  const searchForm = `<form class="ich-search" method="get" action="/ich/memo">${searchHidden}<input name="q" value="${escapeHtml(result.q)}" placeholder="搜索赛事名称、方向或来源" aria-label="搜索赛事备忘录"><button type="submit">搜索</button></form>`;
  const start = result.total === 0 ? 0 : (result.page - 1) * result.page_size + 1;
  const end = Math.min(result.page * result.page_size, result.total);
  const pageLinks = Array.from(new Set([1, result.page - 1, result.page, result.page + 1, result.total_pages])).filter((page) => page >= 1 && page <= result.total_pages).sort((a, b) => a - b).map((page) => page === result.page ? `<span class="current" aria-current="page">${page}</span>` : `<a href="${href({ page: String(page) })}">${page}</a>`).join("");
  const pagination = result.total_pages > 1 ? `<nav class="ich-pagination" aria-label="赛事备忘录分页"><span>${start}-${end} / ${result.total} 条</span>${result.page > 1 ? `<a href="${href({ page: String(result.page - 1) })}">上一页</a>` : ""}${pageLinks}${result.page < result.total_pages ? `<a href="${href({ page: String(result.page + 1) })}">下一页</a>` : ""}</nav>` : `<div class="ich-memo-count">${result.total} 条赛事</div>`;
  const sortHref = href({ sort: result.sort === "newest" ? "default" : "newest" });
  const stats = `<span>全部赛事 ${result.total}</span><span>已知截止 ${knownDeadline}</span><span>日期待补 ${tbd}</span>${longTerm > 0 ? `<span>长期开放 ${longTerm}</span>` : ""}`;
  const toolbar = `<div class="ich-memo-toolbar"><span class="ich-memo-toolbar-group"><strong>排序</strong><a href="${sortHref}">${result.sort === "newest" ? "按截止时间" : "按最新收录"}</a></span><span class="ich-memo-toolbar-group"><strong>视图</strong><a href="/ich/memo">表格</a><a href="/ich">卡片</a></span><span class="ich-memo-toolbar-group"><strong>导出</strong><a href="/api/opportunity-v2/radar?category=competition">JSON</a><a href="/ich/memo?format=markdown">Markdown</a></span></div>`;
  return `<main class="ich-memo"><section class="ich-memo-head"><div><p class="ich-kicker">赛事备忘录</p><h1>赛事备忘录</h1><p>国内外文创、非遗与手工艺赛事总表，按截止日期统一整理。</p></div>${toolbar}</section>${searchForm}<div class="ich-memo-stats">${stats}</div><div class="ich-filter-line"><span>赛事方向：</span><a class="${result.direction === "" ? "is-active" : ""}" href="${href({ direction: "" })}">全部方向</a><a class="${result.direction === "craft_arts" ? "is-active" : ""}" href="${href({ direction: "craft_arts" })}">工艺美术</a><a class="${result.direction === "cultural_creative" ? "is-active" : ""}" href="${href({ direction: "cultural_creative" })}">文创设计</a><a class="${result.direction === "aigc_digital" ? "is-active" : ""}" href="${href({ direction: "aigc_digital" })}">AIGC / 数字创作</a></div><table class="ich-memo-table"><caption class="sr-only">赛事备忘录列表</caption><thead><tr><th>截止时间</th><th>赛事名称</th><th>方向 / 作品形式</th><th>来源</th><th>操作</th></tr></thead><tbody>${rows || `<tr><td colspan="5">暂无可浏览赛事</td></tr>`}</tbody></table><div class="ich-memo-mobile">${items.map((item) => { const display = buildOpportunityV2Display(item, result.translations); const deadline = displayDeadline(item, `${item.summary}\n${display.summary}`); return `<article><strong>${escapeHtml(deadline.text)}</strong><a aria-label="查看 ${escapeHtml(display.title)} 详情" href="/ich/opportunities/${encodeURIComponent(item.id)}">${escapeHtml(display.title)}</a><small>${escapeHtml(item.source_name)}${discoveryLabel(item) ? ` · ${escapeHtml(discoveryLabel(item))}` : ""}</small></article>`; }).join("")}</div>${pagination}<style>.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}.ich-memo-count{padding:18px 0;color:var(--muted)}@media(max-width:700px){.ich-memo-head{display:block}.ich-memo-toolbar{margin-top:14px}.ich-memo-table{display:none}.ich-memo-mobile{display:block;margin-top:18px}.ich-memo-mobile article{display:grid;gap:4px;padding:14px 0;border-bottom:1px solid var(--line)}.ich-memo-mobile strong{color:var(--clay);font-size:13px}.ich-memo-mobile a{font:18px/1.4 "Songti SC","Noto Serif SC",serif;text-decoration:none}.ich-memo-mobile small{color:var(--muted)}}@media print{.ich-header,.ich-footer,.ich-memo-toolbar,.ich-filter-line{display:none!important}.ich-site{padding:0}.ich-memo-table{font-size:12px}}</style></main>`;
}

function v2MemoPage(result: V2IchPageResult): string {
  return `<style>.ich-memo-stats{display:flex;flex-wrap:wrap;gap:8px 18px;margin-top:16px;padding:12px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line);color:var(--muted)}.ich-memo-stats span+span{padding-left:18px;border-left:1px solid var(--line)}.ich-memo-toolbar{display:flex;flex-wrap:wrap;gap:10px 22px;align-items:center;margin-top:18px;color:var(--muted);font-size:13px}.ich-memo-toolbar-group{display:inline-flex;gap:10px;align-items:center}.ich-memo-toolbar strong{color:var(--ink);font-weight:600}.ich-memo-toolbar a{color:var(--indigo);text-decoration:none}.ich-memo-table{width:100%;margin-top:18px;border-collapse:collapse;table-layout:fixed}.ich-memo-table th,.ich-memo-table td{padding:13px 10px;border-top:1px solid var(--line);text-align:left;vertical-align:top;overflow-wrap:anywhere}.ich-memo-table th{font-weight:700;color:var(--ink);background:rgba(235,228,214,.38);position:sticky;top:0;z-index:1}.ich-memo-table th:nth-child(1){width:15%}.ich-memo-table th:nth-child(2){width:39%}.ich-memo-table th:nth-child(3){width:19%}.ich-memo-table th:nth-child(4){width:16%}.ich-memo-table th:nth-child(5){width:11%}.ich-memo-table td:first-child{color:var(--clay);font-weight:600}.ich-memo-table td a{color:var(--indigo);text-decoration:none}.ich-memo-table td a:hover{text-decoration:underline}.ich-memo-table small{display:block;margin-top:3px;color:var(--muted);font-size:11px;font-weight:400}@media(max-width:700px){.ich-memo-stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.ich-memo-stats span+span{padding-left:0;border-left:0}}</style>${v2MemoPageBody(result)}`;
}

function v2MemoMarkdown(result: V2IchPageResult): string {
  const lines = ["# 赛事备忘录", "", "国内外文创、非遗与手工艺赛事总表，按截止日期统一整理。", "", `- 全部赛事：${result.total}`, `- 已知截止：${result.total_known_deadline}`, `- 日期待补：${result.total_deadline_tbd}`, "", "| 截止日期 | 赛事名称 | 方向 / 作品形式 | 来源 |", "| --- | --- | --- | --- |"];
  for (const item of result.items) {
    const display = buildOpportunityV2Display(item, result.translations);
    const directions = (item.directions ?? []).join("、");
    const formats = (item.work_formats ?? []).join("、");
    lines.push(`| ${memoDate(item)} | [${display.title}](${item.detail_url}) | ${directions}${formats ? ` / ${formats}` : ""} | ${item.source_name} |`);
  }
  return `${lines.join("\n")}\n`;
}

function v2MemoJson(result: V2IchPageResult): Record<string, unknown> {
  return {
    generated_at: new Date().toISOString(),
    total: result.total,
    known_deadlines: result.total_known_deadline,
    unknown_deadlines: result.total_deadline_tbd,
    long_term: result.total_long_term,
    items: result.items.map((item) => {
      const display = buildOpportunityV2Display(item, result.translations);
      return {
        id: item.id,
        title: display.title,
        summary: display.summary,
        category: item.category,
        directions: item.directions ?? [],
        work_formats: item.work_formats ?? [],
        region: item.region,
        deadline: item.deadline,
        deadline_text: item.deadline_text ?? null,
        status: opportunityV2LiveStatus(item),
        source_name: item.source_name,
        source_id: item.source_id,
        detail_url: item.detail_url,
        discovered_by_sources: item.discovered_by_sources,
      };
    }),
  };
}

function collectionStructuredData(name: string, description: string, path: string): unknown[] {
  return [{
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name,
    description,
    url: absoluteUrl(path),
    isPartOf: {
      "@type": "WebSite",
      name: "盯非遗 · ChancePing",
      url: absoluteUrl("/ich"),
    },
  }];
}

function detailStructuredData(item: PublicIchOpportunity, path: string): unknown[] {
  const url = absoluteUrl(path);
  return [
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: item.title,
      description: item.seo?.meta_description || item.summary,
      url,
      datePublished: item.published_at,
      dateModified: item.updated_at,
      isPartOf: {
        "@type": "WebSite",
        name: "盯非遗 · ChancePing",
        url: absoluteUrl("/ich"),
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "盯非遗", item: absoluteUrl("/ich") },
        { "@type": "ListItem", position: 2, name: item.title, item: url },
      ],
    },
  ];
}

function escapeXml(value: unknown): string {
  return String(value ?? "").replace(/[<>&'"]/g, (character) => ({
    "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;",
  })[character] as string);
}

export function ichPagesRoutes(options: IchReadRouteOptions = {}): Hono {
  const app = new Hono();
  const store = options.store ?? defaultIchStore();
  const now = options.now ?? (() => new Date());

  app.get("/", (c) => {
    if (options.opportunityV2) {
      const query = parseV2PageQuery(c.req.query());
      const result = queryOpportunityV2ForIch({ ...query, pageSize: 8, history: false, sourcesPath: options.opportunityV2SourcesPath, poolPath: options.opportunityV2PoolPath });
      const title = "盯非遗｜文创、非遗与手工艺赛事机会导航";
      const description = "文创 · 非遗 · 手工艺机会导航，持续发现国内外赛事、征集与合作机会。";
      return c.html(shell(title, description, "/ich", v2ListPage(result, false), { structuredData: collectionStructuredData(title, description, "/ich") }));
    }
    const loaded = store.load();
    const parsed = parseIchQuery(c.req.query());
    if (!parsed.query) return c.text(parsed.error ?? "Invalid query", 400);
    const result = queryIchOpportunities(loaded.entries, { ...parsed.query, page_size: 8 }, now(), loaded.updatedAt);
    const title = "盯非遗｜文创、非遗与手工艺赛事机会导航";
    const description = "发现可信、可行动的非遗相关机会。";
    return c.html(shell(title, description, "/ich", listPage(result, false), {
      structuredData: collectionStructuredData(title, description, "/ich"),
    }));
  });
  app.get("/memo", (c) => {
    if (!options.opportunityV2) return c.redirect("/ich?category=competition");
    const query = parseV2PageQuery(c.req.query());
    const format = c.req.query("format");
    const result = queryOpportunityV2ForIch({ ...query, category: "competition", page: query.page, pageSize: format === "markdown" ? 10000 : 50, history: false, sourcesPath: options.opportunityV2SourcesPath, poolPath: options.opportunityV2PoolPath });
    if (format === "markdown") {
      return c.text(v2MemoMarkdown(result), 200, { "Content-Type": "text/markdown; charset=UTF-8", "Content-Disposition": "attachment; filename=ich-memo.md" });
    }
    return c.html(shell("赛事备忘录｜盯非遗", "按截止时间查看同一赛事池中的全部可浏览赛事。", "/ich/memo", v2MemoPage(result), { structuredData: collectionStructuredData("赛事备忘录", "按截止时间查看可浏览赛事。", "/ich/memo") }));
  });
  app.get("/memo.json", (c) => {
    if (!options.opportunityV2) return c.json({ error: "memo unavailable" }, 404);
    const query = parseV2PageQuery(c.req.query());
    const result = queryOpportunityV2ForIch({ ...query, category: "competition", page: 1, pageSize: 10000, history: false, sourcesPath: options.opportunityV2SourcesPath, poolPath: options.opportunityV2PoolPath });
    return c.json(v2MemoJson(result));
  });
  app.get("/memo.md", (c) => {
    if (!options.opportunityV2) return c.text("memo unavailable", 404);
    const query = parseV2PageQuery(c.req.query());
    const result = queryOpportunityV2ForIch({ ...query, category: "competition", page: 1, pageSize: 10000, history: false, sourcesPath: options.opportunityV2SourcesPath, poolPath: options.opportunityV2PoolPath });
    return c.text(v2MemoMarkdown(result), 200, { "Content-Type": "text/markdown; charset=UTF-8", "Content-Disposition": "attachment; filename=ich-memo.md" });
  });
  app.get("/history", (c) => {
    if (options.opportunityV2) {
      const query = parseV2PageQuery(c.req.query());
      const result = queryOpportunityV2ForIch({ ...query, status: "history", pageSize: 8, history: true, sourcesPath: options.opportunityV2SourcesPath, poolPath: options.opportunityV2PoolPath });
      const title = "盯非遗｜历史机会";
      const description = "查看已截止的文创、非遗与手工艺机会。";
      return c.html(shell(title, description, "/ich/history", v2ListPage(result, true), { structuredData: collectionStructuredData(title, description, "/ich/history") }));
    }
    const loaded = store.load();
    const parsed = parseIchQuery(c.req.query());
    if (!parsed.query) return c.text(parsed.error ?? "Invalid query", 400);
    const result = queryIchOpportunities(loaded.entries, { ...parsed.query, status: "history", page_size: 8 }, now(), loaded.updatedAt);
    const title = "历史非遗机会｜ChancePing";
    const description = "查看已截止、已结束或失效的非遗机会。";
    return c.html(shell(title, description, "/ich/history", listPage(result, true), {
      structuredData: collectionStructuredData(title, description, "/ich/history"),
    }));
  });
  app.get("/opportunities/:slug", (c) => {
    if (options.opportunityV2) {
      const item = readOpportunityV2Pool(options.opportunityV2PoolPath).opportunities.find((candidate) => candidate.id === c.req.param("slug"));
      if (!item) return c.html(shell("机会未找到｜盯非遗", "该机会不存在或已不在当前机会池。", c.req.path, "<main><h1>机会未找到</h1><p>该机会不存在或已不在当前机会池。</p></main>", { noindex: true }), 404);
      const display = buildOpportunityV2Display(item, readOpportunityV2Translations());
      const sources = readOpportunityV2Sources(options.opportunityV2SourcesPath).filter((source) => item.discovered_by_sources.includes(source.id));
      const categoryLabels: Record<string, string> = { competition: "赛事 / 征集", exhibition_market: "市集 / 展销", procurement_project: "采购 / 订单", channel_collaboration: "渠道 / 合作", policy_funding: "资助 / 扶持", international: "研修 / 交流" };
      const directions: Record<string, string> = { ich_innovation: "非遗创新", cultural_creative: "文创设计", craft_arts: "工艺美术", museum_tourism: "文博文旅", integrated_cultural_design: "综合文化设计", aigc_digital: "AIGC / 数字创作" };
      const formats: Record<string, string> = { material_craft: "实物工艺", product_design: "产品设计方案", graphic_ip: "平面 / 插画 / IP", packaging: "包装设计", fashion_jewellery: "服饰 / 首饰", video_animation: "视频 / 动画", interaction_game: "交互 / 游戏", mixed_media: "综合媒介" };
      const location = item.event_location || "";
      const deadlineInfo = displayDeadline(item, `${item.summary}\n${display.summary}`);
      const summary = safeOpportunitySummary(display.summary, deadlineInfo.conflict);
      const deadline = deadlineInfo.text;
      const sourceLinks = (sources.length ? sources : [{ id: item.source_id, name: item.source_name, url: item.source_url }]).map((source) => `<li><a rel="nofollow noopener" href="${escapeHtml(source.url)}">${escapeHtml(source.name)}</a></li>`).join("");
      const directionText = (item.directions ?? []).map((key) => directions[key] ?? key).join(" · ");
      const formatText = (item.work_formats ?? []).map((key) => formats[key] ?? key).join(" · ");
      const scopeText = item.participation_scope && item.participation_scope !== "unspecified" ? ({ nationwide: "全国", global: "全球", regional: "地区限制" }[item.participation_scope] ?? item.participation_scope) : "";
      const modeText = item.participation_mode && item.participation_mode !== "unspecified" ? ({ online: "线上", physical: "线下", onsite: "现场" }[item.participation_mode] ?? item.participation_mode) : "";
      const facts = [directionText && `方向：${escapeHtml(directionText)}`, formatText && `作品形式：${escapeHtml(formatText)}`, scopeText && `参赛范围：${escapeHtml(scopeText)}`, modeText && `参与方式：${escapeHtml(modeText)}`].filter(Boolean).join("<br>");
      const factsHeading = item.category === "procurement_project" ? "采购信息" : "赛事信息";
      const translationLabel = display.translation_status === "pending" ? `<span class="ich-translation-status">当前显示来源原文</span>` : display.translation_status === "failed" ? `<span class="ich-translation-status">中文翻译暂不可用，当前显示来源原文</span>` : "";
      const deadlineWarning = deadlineInfo.conflict ? `<p class="ich-data-warning">来源页面中的截止日期与结构化日期不一致，当前不显示不安全的精确日期，请打开来源原文核对。</p>` : "";
      const detailBody = `<main class="ich-detail"><p class="ich-detail-kicker">${escapeHtml(categoryLabels[item.category] ?? item.category)}</p><span class="ich-status">${escapeHtml(v2StatusLabel(item))}</span>${translationLabel}<h1>${escapeHtml(display.title)}</h1>${display.original_title && display.translated ? `<details class="ich-original"><summary>查看原名</summary><p>${escapeHtml(display.original_title)}</p></details>` : ""}<p class="ich-detail-lede">${escapeHtml(summary)}</p><div class="ich-detail-layout"><section class="ich-detail-main"><h2>${factsHeading}</h2><p>${facts || "来源页面未提供结构化字段，请打开来源原文查看完整要求。"}</p><h2>报名与材料</h2><p>${item.application_url ? `<a rel="nofollow noopener" href="${escapeHtml(item.application_url)}">${item.category === "procurement_project" ? "响应入口" : "报名入口"}</a>` : "请打开来源原文查看提交材料、格式、费用及资格要求。"}</p>${display.original_summary && display.translated ? `<details class="ich-original"><summary>查看来源摘要</summary><p>${escapeHtml(safeOpportunitySummary(display.original_summary))}</p></details>` : ""}${deadlineWarning}<p class="ich-detail-note">更多报名条件、材料要求和最新变更，请打开赛事来源页面查看。</p><div class="ich-source-box"><h2>来源原文</h2><ul>${sourceLinks}</ul><p><a rel="nofollow noopener" href="${escapeHtml(item.detail_url || item.source_url)}">打开赛事来源页面 ↗</a></p></div></section><aside class="ich-detail-aside"><h2>关键节点</h2><dl><dt>${item.category === "procurement_project" ? "响应截止" : "截止时间"}</dt><dd>${escapeHtml(deadline)}</dd>${location ? `<dt>举办地</dt><dd>${escapeHtml(location)}</dd>` : ""}${item.organizer ? `<dt>主办方 / 买方</dt><dd>${escapeHtml(item.organizer)}</dd>` : ""}<dt>发现来源</dt><dd>${escapeHtml(sources.map((source) => source.name).join("、") || item.source_name)}${discoveryLabel(item) ? `（${escapeHtml(discoveryLabel(item))}）` : ""}</dd></dl></aside></div></main>`;
      return c.html(shell(`${display.title}｜盯非遗`, summary, c.req.path, detailBody));
    }
    const loaded = store.load();
    const item = getPublicIchOpportunity(loaded.entries, c.req.param("slug"), now());
    if (!item) return c.html(shell(
      "机会未找到｜ChancePing",
      "该机会不存在或尚未发布。",
      c.req.path,
      "<main><h1>机会未找到</h1><p>该机会不存在、尚未发布或已被撤回。</p></main>",
      { noindex: true },
    ), 404);
    const source = item.sources.find((candidate) => candidate.is_primary) ?? item.sources[0];
    const categoryLabels: Record<string, string> = { competition: "赛事 / 征集", exhibition_market: "展会 / 市集", procurement_project: "采购 / 项目", channel_collaboration: "渠道 / 合作", policy_funding: "资助 / 扶持", international: "国际交流" };
    const location = item.location.city || item.location.province_state || item.location.country_name || "未确认";
    const body = `<main class="ich-detail"><p class="ich-detail-kicker">ChancePing · 纸本地域目录 / ${escapeHtml(categoryLabels[item.primary_category] ?? item.primary_category)}</p><span class="ich-status">${escapeHtml(STATUS_LABELS[item.status] ?? item.status)}</span><h1>${escapeHtml(item.title)}</h1><p class="ich-detail-lede">${escapeHtml(item.summary)}</p><div class="ich-detail-layout"><section class="ich-detail-main"><h2>机会说明</h2><p>这是一个面向非遗手艺人、工作室、品牌与文创团队的公开机会线索。申请条件、材料要求和最终有效性请以官方来源为准。</p><div class="ich-source-box"><h2>官方来源</h2>${source ? `<p><a rel="nofollow noopener" href="${escapeHtml(source.url)}">${escapeHtml(source.name)}</a><br><small>最近核验：${escapeHtml(source.last_checked_at)}</small></p>` : "<p>来源待确认，请勿据此报名。</p>"}</div></section><aside class="ich-detail-aside"><h2>机会信息</h2><dl><dt>主办方</dt><dd>${escapeHtml(item.organizer.name)}</dd><dt>地区</dt><dd>${escapeHtml(location)}</dd><dt>${item.dates.is_long_term ? "有效期" : "截止日期"}</dt><dd>${escapeHtml(item.dates.is_long_term ? "长期有效" : item.dates.deadline_text || "未确认")}</dd><dt>状态</dt><dd>${escapeHtml(STATUS_LABELS[item.status] ?? item.status)}</dd></dl></aside></div></main>`;
    const title = item.seo?.meta_title || `${item.title}｜ChancePing`;
    const description = item.seo?.meta_description || item.summary;
    const detailPath = `/ich/opportunities/${encodeURIComponent(item.slug)}`;
    return c.html(shell(title, description, detailPath, body, {
      noindex: item.seo?.noindex === true,
      structuredData: detailStructuredData(item, detailPath),
    }));
  });
  app.get("/source-principles", (c) => c.html(shell(
    "联系作者｜ChancePing 非遗机会雷达",
    "联系非遗机会雷达开发者，提出改进建议或定制专属机会雷达，并了解来源审核原则。",
    "/ich/source-principles",
    `<main class="ich-contact-page"><section class="ich-contact-hero"><header class="ich-contact-heading"><p class="ich-kicker">CUSTOM RADAR</p><h1>定制你的机会雷达</h1><p>把真正重要的机会，变成一套长期运行的发现系统。</p></header><div class="ich-contact-copy" style="min-width:0"><p>「非遗机会雷达」由盯机会 ChancePing 系统持续收集、整理与更新。ChancePing 也可以根据个人、创业团队、企业或机构的实际目标，定制专属机会雷达，持续盯住比赛、客户线索、采购项目、合作机会、政策扶持或行业信息。</p><div class="ich-contact-reasons"><p><span>01</span>如果你对本非遗机会雷达有任何改进意见或建议，希望让更多非遗从业者通过本雷达获益，欢迎联系。</p><p><span>02</span>如果你希望为自己的业务建立一套长期运行的机会雷达，欢迎联系开发者。</p></div><address class="ich-contact-details"><strong class="ich-contact-name">Jason 刘哲赏</strong><a href="mailto:sunny251610056@gmail.com">sunny251610056@gmail.com</a><span>微信：<strong>liuzheshangwx</strong></span></address></div><figure class="ich-contact-qr"><img src="/assets/ich-jason-wechat-qr.jpg" width="1194" height="1575" alt="开发者 Jason 刘哲赏的微信二维码"><figcaption>微信扫码联系 Jason</figcaption></figure></section><section class="ich-principles"><header><p class="ich-kicker">SOURCE &amp; REVIEW</p><h2>来源与审核原则</h2></header><div class="ich-principles-copy"><p>我们优先采用政府公告、官方报名页和主办方正式通知。聚合页只作为发现线索，关键报名条件必须回到第一方来源核验。</p><p>未经审核的提交不会公开；无法确认的字段会明确标记，已撤回或失效的机会会离开当前列表。</p></div></section></main>`,
  )));
  app.get("/sitemap.xml", (c) => {
    const loaded = store.load();
    const fixed = [
      { path: "/ich", lastmod: loaded.updatedAt },
      { path: "/ich/history", lastmod: loaded.updatedAt },
      { path: "/ich/source-principles", lastmod: loaded.updatedAt },
      { path: "/ich/submit", lastmod: loaded.updatedAt },
    ];
    const details = loaded.entries
      .filter(isPublicIchOpportunity)
      .filter((entry) => entry.seo?.noindex !== true)
      .map((entry) => ({
        path: `/ich/opportunities/${encodeURIComponent(entry.slug)}`,
        lastmod: entry.metadata.updated_at,
      }));
    const unique = new Map([...fixed, ...details].map((item) => [item.path, item]));
    const urls = [...unique.values()].map((item) =>
      `<url><loc>${escapeXml(absoluteUrl(item.path))}</loc>${item.lastmod ? `<lastmod>${escapeXml(item.lastmod)}</lastmod>` : ""}</url>`,
    ).join("");
    return c.body(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`, 200, {
      "Content-Type": "application/xml; charset=UTF-8",
      "Cache-Control": "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
    });
  });
  app.get("/robots.txt", (c) => c.text(
    `User-agent: *\nAllow: /ich\nDisallow: /ich/admin\nDisallow: /api/internal/\n\nSitemap: ${absoluteUrl("/ich/sitemap.xml")}\n`,
    200,
    {
      "Content-Type": "text/plain; charset=UTF-8",
      "Cache-Control": "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  ));
  app.get("/submit", (c) => c.html(shell(
    "提交非遗机会来源｜ChancePing",
    "向 ChancePing 提交非遗机会的官方来源链接。",
    "/ich/submit",
    `<main><h1>提交非遗机会来源</h1><section class="card"><p>请提交主办方、政府部门或官方报名页面的 HTTPS 链接。提交内容只进入人工审核队列，不会自动公开。</p>
<form id="source-form"><p><label>官方来源链接<br><input name="source_url" type="url" required maxlength="2048" placeholder="https://..." style="width:100%;box-sizing:border-box;padding:10px"></label></p>
<p><label>标题提示（可选）<br><input name="title_hint" maxlength="300" style="width:100%;box-sizing:border-box;padding:10px"></label></p>
<p><label>补充说明（可选）<br><textarea name="note" maxlength="2000" rows="5" style="width:100%;box-sizing:border-box;padding:10px"></textarea></label></p>
<p><label>联系邮箱（可选，仅用于核验）<br><input name="contact_email" type="email" maxlength="254" style="width:100%;box-sizing:border-box;padding:10px"></label></p>
<p aria-hidden="true" style="position:absolute;left:-10000px"><label>网站<input name="website" tabindex="-1" autocomplete="off"></label></p>
<button type="submit" style="padding:10px 18px">提交来源</button><span id="submit-status" class="meta" role="status" aria-live="polite"></span></form></section>
<script>const form=document.getElementById("source-form");const status=document.getElementById("submit-status");const button=form.querySelector('button[type="submit"]');let startedAt=Date.now();form.addEventListener("submit",async event=>{event.preventDefault();if(button.disabled)return;button.disabled=true;form.setAttribute("aria-busy","true");status.textContent=" 正在提交…";const data=Object.fromEntries(new FormData(form).entries());data.form_started_at=startedAt;try{const response=await fetch("/api/public/ich/submissions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)});const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.error?.message||"暂时无法提交，请稍后重试");form.reset();startedAt=Date.now();status.textContent=" 已收到，来源已进入人工审核队列。";}catch(error){status.textContent=" "+(error instanceof Error?error.message:"暂时无法提交，请稍后重试");}finally{button.disabled=false;form.removeAttribute("aria-busy");}});</script></main>`,
    { noindex: true },
  ), 200, {
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
  }));
  return app;
}
