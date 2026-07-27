import { Hono } from "hono";
import {
  getPublicIchOpportunity,
  isPublicIchOpportunity,
  queryIchOpportunities,
  type IchQueryResult,
  type PublicIchOpportunity,
} from "../../ich/query";
import { defaultIchStore, parseIchQuery, type IchReadRouteOptions } from "./public-ich";

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
const FILTER_LABELS: Record<string, string> = { all: "全部", current: "全部当前", closing_soon: "近期截止", long_term: "长期征集", history: "历史", guangzhou: "广州", guangdong: "广东省", greater_bay_area: "粤港澳大湾区", nationwide: "全国", hong_kong_macao_taiwan: "港澳台", overseas: "海外", online_or_unrestricted: "线上" };

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
  const robots = options.noindex ? '<meta name="robots" content="noindex,nofollow">' : "";
  const structuredData = (options.structuredData ?? [])
    .map((item) => `<script type="application/ld+json">${jsonLd(item)}</script>`)
    .join("");
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${escapeHtml(canonical)}">${robots}<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}"><meta property="og:type" content="website"><meta property="og:url" content="${escapeHtml(canonical)}">
<meta property="og:site_name" content="ChancePing 非遗机会雷达"><meta name="twitter:card" content="summary"><meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">${structuredData}
<style>
:root{--paper:#f5f0e6;--ink:#27251f;--muted:#716c61;--line:#d9d1c2;--celadon:#687d70;--indigo:#304963;--clay:#b6533f;--wash:#ebe4d6}
*{box-sizing:border-box}html{background:var(--paper)}body{margin:0;color:var(--ink);font:15px/1.65 "Noto Sans SC","Source Han Sans SC",system-ui,sans-serif;background:var(--paper)}a{color:inherit} .ich-site{max-width:1440px;margin:auto;padding:0 42px 56px}.ich-header{display:flex;align-items:center;justify-content:space-between;min-height:62px;border-bottom:1px solid var(--line)}.ich-brand{display:flex;align-items:center;gap:18px;text-decoration:none}.ich-brand strong{font:27px/1 "Times New Roman",serif;letter-spacing:-.8px}.ich-brand strong::after{content:"";display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--clay);margin:0 0 12px 2px}.ich-brand span{padding-left:18px;border-left:1px solid var(--line);font-family:serif}.ich-nav{display:flex;gap:28px;color:#5e5a51}.ich-nav a{text-decoration:none;padding:21px 0 15px;border-bottom:2px solid transparent}.ich-nav a[aria-current=page]{color:var(--indigo);border-color:var(--indigo)}.ich-hero{position:relative;min-height:254px;margin:0 0 20px;overflow:hidden;border-bottom:1px solid var(--line);background:#eee7da url('/assets/ich-paper-atlas-hero.png') right center/auto 100% no-repeat}.ich-hero-copy{position:relative;z-index:1;width:60%;padding:52px 0 34px;background:linear-gradient(90deg,var(--paper) 0%,rgba(245,240,230,.96) 75%,rgba(245,240,230,0) 100%)}.ich-kicker{margin:0 0 14px;color:var(--celadon);font-size:13px;letter-spacing:.08em}.ich-hero h1{margin:0 0 12px;font:44px/1.18 "Songti SC","Noto Serif SC",serif;letter-spacing:.02em}.ich-hero p{margin:0 0 14px;max-width:630px;color:#5f5a50;font-family:serif;font-size:16px}.ich-meta{display:flex;gap:24px;color:var(--muted);font-size:13px}.ich-search{display:flex;margin:0 0 14px;border:1px solid #cfc6b6;background:#fbf8f1}.ich-search input{min-width:0;flex:1;border:0;background:transparent;padding:14px 18px;color:var(--ink);font:15px inherit;outline:none}.ich-search button{border:0;background:var(--indigo);color:#fff;padding:0 28px;font-weight:700;cursor:pointer}.ich-filters{border-top:1px solid var(--line);border-bottom:1px solid var(--line)}.ich-category-row{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px;padding:14px 0}.ich-filter-button{border:1px solid var(--line);background:rgba(255,255,255,.3);padding:12px 10px;color:var(--ink);font:14px serif;cursor:pointer}.ich-filter-button:hover,.ich-filter-button.is-active{border-color:var(--celadon);background:#e8eee7;color:#345347}.ich-filter-button small{display:block;margin-top:2px;color:var(--muted);font:11px system-ui}.ich-filter-line{display:flex;align-items:center;gap:18px;padding:10px 0;border-top:1px solid var(--line);color:var(--muted);font-size:13px;overflow:auto;white-space:nowrap}.ich-filter-line a{color:var(--muted);text-decoration:none}.ich-filter-line a.is-active{color:var(--indigo);font-weight:700}.ich-sort{margin-left:auto;border:0;background:transparent;color:var(--muted);font:inherit}.ich-summary{display:flex;justify-content:space-between;gap:12px;padding:14px 0;color:var(--muted);font-size:13px}.ich-summary a{color:var(--celadon);text-decoration:none}.ich-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:32px;border-top:1px solid var(--line)}.ich-card{display:grid;grid-template-columns:40px minmax(0,1fr) 112px;gap:12px;padding:22px 0;border-bottom:1px solid var(--line)}.ich-card-index{font:25px/1 "Times New Roman",serif;color:#4c4b45}.ich-card-main{min-width:0}.ich-card-top,.ich-tags{display:flex;flex-wrap:wrap;gap:7px;align-items:center}.ich-status,.ich-category,.ich-tag{display:inline-flex;padding:2px 7px;border:1px solid var(--line);color:var(--muted);font-size:11px}.ich-status{border-color:#e7b8ad;color:var(--clay);background:#fbefe9}.ich-category{border-color:#bccabf;color:#526d5c;background:#edf2eb}.ich-card h2{margin:8px 0 6px;font:20px/1.35 "Songti SC","Noto Serif SC",serif}.ich-card h2 a{text-decoration:none}.ich-card h2 a:hover{text-decoration:underline}.ich-card p{margin:0 0 9px;color:#696459;font-size:13px}.ich-card-meta{display:flex;flex-wrap:wrap;gap:14px;color:var(--muted);font-size:12px}.ich-card-deadline{color:var(--clay);font-size:12px;white-space:nowrap}.ich-card-actions{display:flex;flex-direction:column;gap:9px;justify-content:center;align-items:flex-start;font-size:12px}.ich-card-actions a{text-decoration:none;color:var(--celadon);white-space:nowrap}.ich-card-actions a:last-child{color:var(--indigo)}.ich-pagination{display:flex;justify-content:center;gap:20px;padding:22px 0;color:var(--muted)}.ich-pagination a{text-decoration:none}.ich-pagination .current{padding:2px 10px;background:var(--indigo);color:#fff}.ich-lower{display:grid;grid-template-columns:1.2fr .8fr;gap:32px;padding-top:34px}.ich-lower section{border-top:1px solid var(--line);padding-top:16px}.ich-lower h2{margin:0 0 8px;font:21px/1.3 serif}.ich-lower p{margin:0;color:var(--muted);font-size:13px}.ich-footer{margin-top:34px;padding-top:18px;border-top:1px solid var(--line);color:var(--muted);font-size:12px}.ich-footer a{color:var(--celadon)}
@media(max-width:820px){.ich-site{padding:0 18px 42px}.ich-header{align-items:flex-start;padding:12px 0}.ich-nav{gap:12px;font-size:12px}.ich-nav a{padding:8px 0}.ich-hero{min-height:0;background-position:70% center}.ich-hero-copy{width:100%;padding:38px 0 28px;background:linear-gradient(90deg,var(--paper) 0%,rgba(245,240,230,.9) 70%,rgba(245,240,230,.3) 100%)}.ich-hero h1{font-size:34px}.ich-category-row{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.ich-filter-line{gap:12px}.ich-grid{display:block}.ich-card{grid-template-columns:32px minmax(0,1fr);gap:10px}.ich-card-actions{grid-column:2;flex-direction:row;border-top:1px solid var(--line);padding-top:10px}.ich-lower{display:block}.ich-lower section+section{margin-top:24px}}
</style><style>.ich-detail{padding:40px 0 12px}.ich-detail-kicker{color:var(--celadon);font-size:13px;letter-spacing:.08em}.ich-detail h1{max-width:920px;margin:10px 0 16px;font:42px/1.25 "Songti SC","Noto Serif SC",serif}.ich-detail-lede{max-width:820px;color:#5f5a50;font:18px/1.7 serif}.ich-detail-layout{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:42px;margin-top:30px}.ich-detail-main,.ich-detail-aside{border-top:1px solid var(--line);padding-top:18px}.ich-detail-main h2,.ich-detail-aside h2{margin:0 0 10px;font:21px/1.3 serif}.ich-detail-main p{color:#5f5a50}.ich-detail-aside{font-size:13px}.ich-detail-aside dl{margin:0}.ich-detail-aside dt{color:var(--muted);margin-top:12px}.ich-detail-aside dd{margin:2px 0 0}.ich-source-box{margin-top:28px;padding:18px;background:var(--wash);border:1px solid var(--line)}.ich-source-box a{color:var(--indigo)}@media(max-width:820px){.ich-detail{padding-top:24px}.ich-detail h1{font-size:32px}.ich-detail-layout{display:block}.ich-detail-aside{margin-top:26px}}</style>
</head><body><div class="ich-site"><header class="ich-header"><a class="ich-brand" href="/ich"><strong>ChancePing</strong><span>盯机会 · 非遗机会雷达</span></a><nav class="ich-nav"><a href="/ich" aria-current="page">机会导航</a><a href="/ich/history">历史机会</a><a href="/ich/source-principles">来源原则</a><a href="/ich/submit">提交来源</a></nav></header>${body}
<footer class="ich-footer"><strong>来源与可信度</strong>：我们优先采用政府、主办方和官方机构发布的信息；机会信息以官方最终通知为准。<br><a href="/ich/source-principles">了解来源原则</a> · <a href="/ich/submit">提交一条来源</a></footer></div></body></html>`;
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

function collectionStructuredData(name: string, description: string, path: string): unknown[] {
  return [{
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name,
    description,
    url: absoluteUrl(path),
    isPartOf: {
      "@type": "WebSite",
      name: "ChancePing 非遗机会雷达",
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
        name: "ChancePing 非遗机会雷达",
        url: absoluteUrl("/ich"),
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "非遗机会雷达", item: absoluteUrl("/ich") },
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
    const loaded = store.load();
    const parsed = parseIchQuery(c.req.query());
    if (!parsed.query) return c.text(parsed.error ?? "Invalid query", 400);
    const result = queryIchOpportunities(loaded.entries, { ...parsed.query, page_size: 8 }, now(), loaded.updatedAt);
    const title = "非遗机会雷达｜ChancePing";
    const description = "发现可信、可行动的非遗相关机会。";
    return c.html(shell(title, description, "/ich", listPage(result, false), {
      structuredData: collectionStructuredData(title, description, "/ich"),
    }));
  });
  app.get("/history", (c) => {
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
    "来源原则｜ChancePing 非遗机会雷达",
    "了解非遗机会雷达的来源等级、人工审核和发布原则。",
    "/ich/source-principles",
    `<main><h1>来源与审核原则</h1><section class="card"><p>我们优先采用政府公告、官方报名页和主办方正式通知。聚合页只作为发现线索，关键报名条件必须回到第一方来源核验。</p><p>未经审核的提交不会公开；无法确认的字段会明确标记，已撤回或失效的机会会离开当前列表。</p></section></main>`,
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
<button type="submit" style="padding:10px 18px">提交来源</button><span id="submit-status" class="meta" role="status"></span></form></section>
<script>const form=document.getElementById("source-form");const status=document.getElementById("submit-status");const startedAt=Date.now();form.addEventListener("submit",async event=>{event.preventDefault();status.textContent=" 正在提交…";const data=Object.fromEntries(new FormData(form).entries());data.form_started_at=startedAt;try{const response=await fetch("/api/public/ich/submissions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)});if(!response.ok)throw new Error("暂时无法提交，请稍后重试");form.reset();status.textContent=" 已收到，我们会进行人工核验。";}catch(error){status.textContent=" "+error.message;}});</script></main>`,
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
