/**
 * Web UI 静态文件服务路由
 *
 * 来源：Task 025 第 5.1 节。Task 035 新增 /assets/* 二进制静态资源路由。
 *
 * 提供：
 *   - GET /           → web/index.html
 *   - GET /styles.css → web/styles.css
 *   - GET /home.js    → web/home.js（Task 038 新增）
 *   - GET /mvp-templates.js → web/mvp-templates.js（MVP UX Rescue 新增）
 *   - GET /source-hints.js → web/source-hints.js（MVP UX Rescue 新增）
 *   - GET /radar-profile.js → web/radar-profile.js（MVP UX Rescue 新增）
 *   - GET /watch-result.js → web/watch-result.js（MVP UX Rescue 新增）
 *   - GET /hero-radar-chat.js → web/hero-radar-chat.js（Q.7-D 新增）
 *   - GET /requirement-chat.js → web/requirement-chat.js（Task 038 新增）
 *   - GET /search.js  → web/search.js（Task 039 新增）
 *   - GET /watch-rules-editor.js → web/watch-rules-editor.js
 *   - GET /assets/*   → web/assets/* 二进制静态资源（Logo 等）
 *   - GET /*          → fallback 到 index.html（SPA 模式）
 *
 * 使用 fs.readFileSync + c.body() 实现，兼容性最好（参考附录 C）。
 * 不引入新依赖，用 Node.js 内置 fs + path。
 */

import { Hono } from "hono";
import type { Context } from "hono";
import fs from "fs";
import path from "path";
import { BUSINESS_EDITION_IDS } from "../../business/edition-config";
import { renderFinancePage } from "../../headhunter/ui/finance-page";
import type { HeadHunterApiContext } from "../../headhunter/api/context";
import { createHeadHunterApiContext } from "../../headhunter/api/context";
import { hydrateLeads } from "../../headhunter/api/presentation";
import { renderWeeklyMarkdown } from "../../headhunter/reports/markdown-export";

/** 根据文件扩展名推断 Content-Type */
function getContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".webp": "image/webp",
  };
  return map[ext] ?? "application/octet-stream";
}

/**
 * 创建 Web UI 静态文件服务路由。
 *
 * @returns Hono 实例，挂载到根路径 /
 */
export function webUiRoutes(financeContext?: HeadHunterApiContext): Hono {
  const app = new Hono();
  const webDir = path.resolve(process.cwd(), "web");

  /**
   * 返回指定静态文件（文本）。
   * 文件不存在时返回 404 JSON（与全局 404 处理一致）。
   */
  function serveFile(relativePath: string, contentType: string) {
    return (c: Context) => {
      const fullPath = path.join(webDir, relativePath);
      // V1.6a 自检修复:路径遍历防护,确保解析后路径仍在 webDir 内
      if (!fullPath.startsWith(webDir + path.sep) && fullPath !== webDir) {
        return c.json({ success: false, data: null, error: { code: "FORBIDDEN", message: "非法路径" }, duration_ms: 0 }, 403);
      }
      if (!fs.existsSync(fullPath)) {
        return c.json(
          { success: false, data: null, error: { code: "NOT_FOUND", message: "文件不存在" }, duration_ms: 0 },
          404,
        );
      }
      const content = fs.readFileSync(fullPath, "utf-8");
      c.header("Content-Type", contentType);
      c.header("Cache-Control", "no-cache");
      return c.body(content);
    };
  }

  /**
   * 返回指定二进制静态资源（Logo 等图片）。
   * 使用 Buffer 读取，避免 utf-8 编码损坏二进制文件。
   */
  function serveBinaryFile(relativePath: string) {
    return (c: Context) => {
      const fullPath = path.join(webDir, relativePath);
      if (!fs.existsSync(fullPath)) {
        return c.json(
          {
            success: false,
            data: null,
            error: {
              code: "NOT_FOUND",
              message: `静态资源不存在: ${relativePath}`,
            },
            duration_ms: 0,
          },
          404,
        );
      }
      const content = fs.readFileSync(fullPath);
      c.header("Content-Type", getContentType(fullPath));
      c.header("Cache-Control", "public, max-age=86400");
      return c.body(content as unknown as ArrayBuffer);
    };
  }

  const serveBusinessApp = serveFile("business.html", "text/html; charset=utf-8");
  const isBusinessHost = (c: Context) => (c.req.header("host") ?? "").split(":")[0].toLowerCase() === "business.chanceping.com";
  const isFinanceHost = (c: Context) => (c.req.header("host") ?? "").split(":")[0].toLowerCase() === "finance.chanceping.com";

  app.get("/login", (c) => isFinanceHost(c) ? c.html(renderFinancePage("/login")) : c.json({ success: false, data: null, error: { code: "NOT_FOUND", message: "页面不存在" }, duration_ms: 0 }, 404));
  for (const financePath of ["/weekly", "/leads/a", "/leads/b", "/trends", "/companies", "/runs", "/opportunities", "/watchlist"]) app.get(financePath, (c) => { if (!isFinanceHost(c)) return c.json({ success: false, data: null, error: { code: "NOT_FOUND", message: "页面不存在" }, duration_ms: 0 }, 404); c.header("Cache-Control", "public, max-age=300, stale-while-revalidate=600"); return c.html(renderFinancePage(financePath)); });
  app.get("/opportunities/:opportunityId", (c) => { if (!isFinanceHost(c)) return c.json({ success: false, data: null, error: { code: "NOT_FOUND", message: "页面不存在" }, duration_ms: 0 }, 404); c.header("Cache-Control", "public, max-age=300, stale-while-revalidate=600"); return c.html(renderFinancePage(`/opportunities/${c.req.param("opportunityId")}`)); });

  const getFinanceContext = (): HeadHunterApiContext => financeContext ?? createHeadHunterApiContext();
  const publishedWeekly = async () => {
    const context = getFinanceContext();
    const rows = await context.stores.weeklySnapshots.list();
    const row = rows.filter((item) => item.published).sort((a, b) => b.week_key.localeCompare(a.week_key))[0];
    return row ? { ...row, leads: await hydrateLeads(row.leads, context) } : null;
  };
  const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] ?? char));
  const requirePublicFinance = (c: Context): Response | null => isFinanceHost(c) && process.env.FINANCE_PUBLIC_MODE === "true" ? null : c.json({ success: false, data: null, error: { code: "UNAUTHORIZED", message: "Finance weekly reader requires public mode" }, duration_ms: 0 }, 401);
  app.get("/weekly.md", async (c) => { const denied = requirePublicFinance(c); if (denied) return denied; const snapshot = await publishedWeekly(); if (!snapshot) return c.text("暂无已发布周报\n", 404); c.header("Content-Type", "text/markdown; charset=utf-8"); c.header("Cache-Control", "public, max-age=300, stale-while-revalidate=600"); return c.body(renderWeeklyMarkdown(snapshot)); });
  app.get("/weekly/plain", async (c) => { const denied = requirePublicFinance(c); if (denied) return denied; const snapshot = await publishedWeekly(); if (!snapshot) return c.html("<!doctype html><html lang=\"zh-CN\"><head><meta name=\"robots\" content=\"index,follow\"><link rel=\"canonical\" href=\"https://finance.chanceping.com/weekly\"></head><body><main><h1>暂无已发布周报</h1></main></body></html>", 404); const markdown = renderWeeklyMarkdown(snapshot); const html = `<!doctype html><html lang=\"zh-CN\"><head><meta charset=\"utf-8\"><meta name=\"robots\" content=\"index,follow\"><link rel=\"canonical\" href=\"https://finance.chanceping.com/weekly\"><title>维优 BD 情报周报｜${escapeHtml(snapshot.week_key)}</title></head><body><main><pre>${escapeHtml(markdown)}</pre></main></body></html>`; c.header("Cache-Control", "public, max-age=300, stale-while-revalidate=600"); return c.html(html); });

  // The production Business subdomain shares this service. Its root is the
  // default Guangzhou edition; the main site root remains unchanged.
  app.get("/", (c) => isFinanceHost(c) ? c.redirect(process.env.FINANCE_PUBLIC_MODE === "true" ? "/weekly" : "/login", 302) : isBusinessHost(c) ? c.redirect("/guangzhou", 302) : serveFile("index.html", "text/html; charset=utf-8")(c));
  app.get("/robots.txt", (c) => { if (!isFinanceHost(c)) return c.json({ success: false, data: null, error: { code: "NOT_FOUND", message: "文件不存在" }, duration_ms: 0 }, 404); c.header("Content-Type", "text/plain; charset=utf-8"); c.header("Cache-Control", "public, max-age=3600"); return c.body("User-agent: *\nAllow: /\nSitemap: https://finance.chanceping.com/sitemap.xml\n"); });
  app.get("/sitemap.xml", (c) => { if (!isFinanceHost(c)) return c.json({ success: false, data: null, error: { code: "NOT_FOUND", message: "文件不存在" }, duration_ms: 0 }, 404); c.header("Content-Type", "application/xml; charset=utf-8"); c.header("Cache-Control", "public, max-age=3600"); const urls = ["/", "/weekly", "/weekly/plain", "/weekly.md"].map((item) => `<url><loc>https://finance.chanceping.com${item}</loc></url>`).join(""); return c.body(`<?xml version=\"1.0\" encoding=\"UTF-8\"?><urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">${urls}</urlset>`); });
  app.get("/aievents", serveFile("ai-events.html", "text/html; charset=utf-8"));
  app.get("/ai-events", serveFile("ai-events.html", "text/html; charset=utf-8"));
  app.get("/fuli", serveFile("welfare.html", "text/html; charset=utf-8"));
  app.get("/welfare", serveFile("welfare.html", "text/html; charset=utf-8"));
  for (const edition of BUSINESS_EDITION_IDS) {
    app.get(`/${edition}`, serveBusinessApp);
    app.get(`/${edition}/*`, serveBusinessApp);
  }

  // 静态资源
  app.get("/styles.css", serveFile("styles.css", "text/css; charset=utf-8"));
  app.get("/ai-events-hybrid.css", serveFile("ai-events-hybrid.css", "text/css; charset=utf-8"));
  app.get("/welfare.css", serveFile("welfare.css", "text/css; charset=utf-8"));
  app.get("/business.css", serveFile("business.css", "text/css; charset=utf-8"));
  app.get(
    "/home.js",
    serveFile("home.js", "application/javascript; charset=utf-8"),
  );
  app.get(
    "/backend-i18n.js",
    serveFile("backend-i18n.js", "application/javascript; charset=utf-8"),
  );
  app.get(
    "/mvp-templates.js",
    serveFile("mvp-templates.js", "application/javascript; charset=utf-8"),
  );
  app.get(
    "/source-hints.js",
    serveFile("source-hints.js", "application/javascript; charset=utf-8"),
  );
  app.get(
    "/radar-profile.js",
    serveFile("radar-profile.js", "application/javascript; charset=utf-8"),
  );
  app.get(
    "/watch-result.js",
    serveFile("watch-result.js", "application/javascript; charset=utf-8"),
  );
  app.get(
    "/hero-radar-chat.js",
    serveFile("hero-radar-chat.js", "application/javascript; charset=utf-8"),
  );
  app.get(
    "/ai-events.js",
    serveFile("ai-events.js", "application/javascript; charset=utf-8"),
  );
  app.get(
    "/welfare.js",
    serveFile("welfare.js", "application/javascript; charset=utf-8"),
  );
  app.get(
    "/business.js",
    serveFile("business.js", "application/javascript; charset=utf-8"),
  );
  app.get(
    "/requirement-chat.js",
    serveFile("requirement-chat.js", "application/javascript; charset=utf-8"),
  );
  app.get(
    "/search.js",
    serveFile("search.js", "application/javascript; charset=utf-8"),
  );
  app.get(
    "/opportunities.js",
    serveFile("opportunities.js", "application/javascript; charset=utf-8"),
  );
  app.get(
    "/reports.js",
    serveFile("reports.js", "application/javascript; charset=utf-8"),
  );
  app.get(
    "/watch-rules-editor.js",
    serveFile("watch-rules-editor.js", "application/javascript; charset=utf-8"),
  );
  app.get(
    "/backend-user.js",
    serveFile("backend-user.js", "application/javascript; charset=utf-8"),
  );
  // V1.6a 自检修复:注册雷达前端 JS 静态路由(之前 404)
  app.get(
    "/radars.js",
    serveFile("radars.js", "application/javascript; charset=utf-8"),
  );
  app.get(
    "/radar-detail.js",
    serveFile("radar-detail.js", "application/javascript; charset=utf-8"),
  );

  // 二进制静态资源（Logo 等）：/assets/logo.png → web/assets/logo.png
  app.get("/assets/:filename", (c) => {
    const filename = c.req.param("filename");
    // V1.6a 自检修复:禁止路径遍历
    if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
      return c.json({ success: false, data: null, error: { code: "FORBIDDEN", message: "非法文件名" }, duration_ms: 0 }, 403);
    }
    return serveBinaryFile(`assets/${filename}`)(c);
  });

  // 注意：不添加 SPA fallback（/* 通配会捕获 /nonexistent 等路径，
  // 导致全局 404 处理失效）。单页编辑器无需客户端路由。

  return app;
}
