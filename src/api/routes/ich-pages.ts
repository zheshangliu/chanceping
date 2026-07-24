import { Hono } from "hono";
import {
  getPublicIchOpportunity,
  isPublicIchOpportunity,
  queryIchOpportunities,
  type IchQuery,
  type PublicIchOpportunity,
} from "../../ich/query";
import { defaultIchStore, type IchReadRouteOptions } from "./public-ich";

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
<style>body{font:16px/1.65 system-ui,sans-serif;max-width:1040px;margin:auto;padding:24px;color:#17231d;background:#f7faf7}a{color:#146b3a}header,footer,.card,.notice{background:#fff;border:1px solid #dbe7df;border-radius:14px;padding:20px;margin:0 0 18px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}.card{margin:0}.meta{color:#52645a;font-size:14px}.status{display:inline-block;padding:2px 9px;border-radius:99px;background:#e7f5eb}h1,h2{line-height:1.25}</style>
</head><body><header><a href="/ich">ChancePing · 非遗机会雷达</a>　<a href="/ich/history">历史机会</a></header>${body}
<footer><strong>信息原则</strong>：仅展示已发布且通过基础审核的机会。请以主办方官方来源为准。本站不代替报名资格判断，也不保证机会持续有效。<br><a href="/ich/source-principles">来源原则</a> · <a href="/ich/submit">提交来源</a></footer></body></html>`;
}

function card(item: PublicIchOpportunity, history: boolean): string {
  const deadline = item.dates.is_long_term ? "长期有效" : (item.dates.deadline_text || "截止时间待确认");
  return `<article class="card"><span class="status">${escapeHtml(STATUS_LABELS[item.status] ?? item.status)}</span>
<h2><a href="/ich/opportunities/${encodeURIComponent(item.slug)}">${escapeHtml(item.title)}</a></h2>
<p>${escapeHtml(item.summary)}</p><p class="meta">主办方：${escapeHtml(item.organizer.name)}<br>
地区：${escapeHtml(item.location.city || item.location.province_state || item.location.country_name || "未确认")}<br>
${history ? "历史状态" : "截止"}：${escapeHtml(deadline)}</p></article>`;
}

function listPage(items: PublicIchOpportunity[], history: boolean): string {
  const heading = history ? "历史非遗机会" : "盯机会 · 非遗机会雷达";
  const intro = history ? "这里展示已截止、已结束、已取消或来源暂不可用的历史记录。" : "持续整理赛事、展销、项目采购、渠道合作、政策资金与国际交流机会。";
  const empty = history ? "暂无历史机会记录。" : "当前暂无已发布的非遗机会。我们只在来源和基本信息达到发布条件后展示。";
  const content = items.length > 0 ? `<div class="grid">${items.map((item) => card(item, history)).join("")}</div>` : `<section class="notice"><h2>暂无可展示机会</h2><p>${empty}</p></section>`;
  return `<main><h1>${heading}</h1><p>${intro}</p><p class="meta">筛选：${history ? "历史状态" : "当前机会"} · 默认排序</p>${content}</main>`;
}

const baseQuery: IchQuery = { q: "", category: "all", region: "all", status: "current", sort: "default", page: 1, page_size: 20 };

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
    const result = queryIchOpportunities(loaded.entries, baseQuery, now(), loaded.updatedAt);
    const title = "非遗机会雷达｜ChancePing";
    const description = "发现可信、可行动的非遗相关机会。";
    return c.html(shell(title, description, "/ich", listPage(result.items, false), {
      structuredData: collectionStructuredData(title, description, "/ich"),
    }));
  });
  app.get("/history", (c) => {
    const loaded = store.load();
    const result = queryIchOpportunities(loaded.entries, { ...baseQuery, status: "history" }, now(), loaded.updatedAt);
    const title = "历史非遗机会｜ChancePing";
    const description = "查看已截止、已结束或失效的非遗机会。";
    return c.html(shell(title, description, "/ich/history", listPage(result.items, true), {
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
    const body = `<main><article class="card"><span class="status">${escapeHtml(STATUS_LABELS[item.status] ?? item.status)}</span>
<h1>${escapeHtml(item.title)}</h1><p>${escapeHtml(item.summary)}</p>
<h2>机会信息</h2><p>主办方：${escapeHtml(item.organizer.name)}<br>地区：${escapeHtml(item.location.city || item.location.province_state || "未确认")}<br>
截止：${escapeHtml(item.dates.is_long_term ? "长期有效" : item.dates.deadline_text || "未确认")}</p>
<h2>官方来源</h2>${source ? `<p><a rel="nofollow noopener" href="${escapeHtml(source.url)}">${escapeHtml(source.name)}</a>（最近核验：${escapeHtml(source.last_checked_at)}）</p>` : "<p>来源待确认，请勿据此报名。</p>"}
</article></main>`;
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
