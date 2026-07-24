import { Hono } from "hono";
import { getPublicIchOpportunity, queryIchOpportunities, type IchQuery, type PublicIchOpportunity } from "../../ich/query";
import { defaultIchStore, type IchReadRouteOptions } from "./public-ich";

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

function shell(title: string, description: string, canonicalPath: string, body: string): string {
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${escapeHtml(canonicalPath)}"><meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}"><meta property="og:type" content="website">
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

export function ichPagesRoutes(options: IchReadRouteOptions = {}): Hono {
  const app = new Hono();
  const store = options.store ?? defaultIchStore();
  const now = options.now ?? (() => new Date());

  app.get("/", (c) => {
    const loaded = store.load();
    const result = queryIchOpportunities(loaded.entries, baseQuery, now(), loaded.updatedAt);
    return c.html(shell("非遗机会雷达｜ChancePing", "发现可信、可行动的非遗相关机会。", "/ich", listPage(result.items, false)));
  });
  app.get("/history", (c) => {
    const loaded = store.load();
    const result = queryIchOpportunities(loaded.entries, { ...baseQuery, status: "history" }, now(), loaded.updatedAt);
    return c.html(shell("历史非遗机会｜ChancePing", "查看已截止、已结束或失效的非遗机会。", "/ich/history", listPage(result.items, true)));
  });
  app.get("/opportunities/:slug", (c) => {
    const loaded = store.load();
    const item = getPublicIchOpportunity(loaded.entries, c.req.param("slug"), now());
    if (!item) return c.html(shell("机会未找到｜ChancePing", "该机会不存在或尚未发布。", c.req.path, "<main><h1>机会未找到</h1><p>该机会不存在、尚未发布或已被撤回。</p></main>"), 404);
    const source = item.sources.find((candidate) => candidate.is_primary) ?? item.sources[0];
    const body = `<main><article class="card"><span class="status">${escapeHtml(STATUS_LABELS[item.status] ?? item.status)}</span>
<h1>${escapeHtml(item.title)}</h1><p>${escapeHtml(item.summary)}</p>
<h2>机会信息</h2><p>主办方：${escapeHtml(item.organizer.name)}<br>地区：${escapeHtml(item.location.city || item.location.province_state || "未确认")}<br>
截止：${escapeHtml(item.dates.is_long_term ? "长期有效" : item.dates.deadline_text || "未确认")}</p>
<h2>官方来源</h2>${source ? `<p><a rel="nofollow noopener" href="${escapeHtml(source.url)}">${escapeHtml(source.name)}</a>（最近核验：${escapeHtml(source.last_checked_at)}）</p>` : "<p>来源待确认，请勿据此报名。</p>"}
</article></main>`;
    const title = item.seo?.meta_title || `${item.title}｜ChancePing`;
    const description = item.seo?.meta_description || item.summary;
    return c.html(shell(title, description, `/ich/opportunities/${encodeURIComponent(item.slug)}`, body));
  });
  return app;
}
