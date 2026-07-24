import { Hono } from "hono";
import type { ApiResponse } from "../types";
import {
  buildWelfareFeed,
  loadPersistedWelfareOpportunities,
  loadPersistedWelfareCandidates,
  loadRecordedWelfareOpportunities,
  renderWelfareMarkdown,
} from "../../public/welfare-opportunities";

function positiveInt(value: string | undefined, fallback: number, max: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(max, Math.floor(parsed))) : fallback;
}

function allRecords() {
  const persisted = loadPersistedWelfareOpportunities();
  return persisted.length > 0 ? persisted : loadRecordedWelfareOpportunities();
}

export function publicWelfareOpportunityRoutes(): Hono {
  const app = new Hono();
  app.get("/opportunities", (c) => {
    const start = Date.now();
    const status = c.req.query("status");
    const data = buildWelfareFeed(allRecords(), {
      status: status === "historical" || status === "all" ? status : "current",
      type: c.req.query("type") ?? "all",
      scene: c.req.query("scene") ?? "all",
      region: c.req.query("region") ?? "all",
      deadlineWindow: c.req.query("deadline_window") ?? "all",
      sort: c.req.query("sort") === "sales" ? "sales" : "deadline",
      supplierFit: c.req.query("supplier_fit") ?? "all",
      page: positiveInt(c.req.query("page"), 1, 1000),
      pageSize: positiveInt(c.req.query("page_size"), 24, 60),
    });
    return c.json({ success: true, data, error: null, duration_ms: Date.now() - start } satisfies ApiResponse);
  });

  app.get("/report.md", (c) => {
    c.header("Content-Type", "text/markdown; charset=utf-8");
    c.header("Cache-Control", "no-cache");
    return c.body(renderWelfareMarkdown(allRecords()));
  });
  app.get("/candidates", (c) => {
    const start = Date.now();
    const sourceCode = c.req.query("source") ?? "all";
    const page = positiveInt(c.req.query("page"), 1, 1000);
    const pageSize = positiveInt(c.req.query("page_size"), 24, 60);
    const all = loadPersistedWelfareCandidates().filter((item) => sourceCode === "all" || item.sourceCode === sourceCode);
    const totalPages = Math.max(1, Math.ceil(all.length / pageSize));
    const safePage = Math.min(page, totalPages);
    const items = all.slice((safePage - 1) * pageSize, safePage * pageSize);
    return c.json({ success: true, data: { items, stats: { totalCount: all.length, page: safePage, pageSize, totalPages } }, error: null, duration_ms: Date.now() - start } satisfies ApiResponse);
  });
  return app;
}
