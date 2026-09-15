import { Hono } from "hono";
import { readProcurementChangeFeed, renderProcurementDigestMarkdown } from "../../opportunity-v2/procurement-change-feed";
import { coverageWorkbenchDetailPage, coverageWorkbenchPage, procurementWorkbenchDetailPage, procurementWorkbenchPage, type ProcurementWorkbenchRouteOptions } from "./procurement-workbench";

function escapeHtml(value: unknown): string { return String(value ?? "").replace(/[&<>"']/gu, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] ?? char)); }

function changeFeedPage(options: ProcurementWorkbenchRouteOptions = {}): string {
  const feed = readProcurementChangeFeed(options.changeFeedPath);
  const markdown = renderProcurementDigestMarkdown(feed.events);
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>采购变更摘要｜盯非遗</title><style>body{margin:0;background:#f5f0e7;color:#2d2925;font-family:Georgia,"Songti SC",serif}.wrap{max-width:960px;margin:0 auto;padding:32px 22px}a{color:#173f5f}pre{white-space:pre-wrap;line-height:1.6;border-top:1px solid #b9aa98;padding-top:22px}</style></head><body><main class="wrap"><p><a href="/ich/procurement">← 返回采购工作台</a></p><h1>采购机会变更摘要</h1><p>只记录语义变化；仅 last_seen 更新不会重复提醒。当前事件：${feed.events.length} 条。</p><pre>${escapeHtml(markdown)}</pre></main></body></html>`;
}

export function procurementWorkbenchPageRoutes(options: ProcurementWorkbenchRouteOptions = {}): Hono {
  const app = new Hono();
  app.get("/procurement", (c) => c.html(procurementWorkbenchPage(options)));
  app.get("/procurement/changes", (c) => c.html(changeFeedPage(options)));
  app.get("/procurement/:id", (c) => {
    const html = procurementWorkbenchDetailPage(options, c.req.param("id"));
    return c.html(html, html.includes("采购机会不存在") ? 404 : 200);
  });
  app.get("/opportunities", (c) => c.html(coverageWorkbenchPage(options, c.req.query())));
  app.get("/opportunities/:id", async (c, next) => {
    const html = coverageWorkbenchDetailPage(options, c.req.param("id"));
    if (html.includes("综合机会不存在")) return next();
    return c.html(html, 200);
  });
  return app;
}
