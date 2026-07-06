import { Hono } from "hono";
import type { AppContext } from "../context";
import type { ApiResponse } from "../types";
import { buildPublicAiEventFeed, type PublicAiEventLifecycle } from "../../public/ai-events-publisher";

function parseLifecycle(value: string | undefined): PublicAiEventLifecycle | "all" {
  if (value === "historical" || value === "history") return "historical";
  if (value === "all") return "all";
  return "current";
}

function parsePositiveInt(value: string | undefined, fallback: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(max, Math.floor(parsed)));
}

export function publicAiEventsRoutes(ctx: AppContext): Hono {
  const app = new Hono();

  app.get("/ai-events", (c) => {
    const start = Date.now();
    const storedEntries = ctx.store.list({
      page: 1,
      page_size: 500,
      sort_by: "added_at",
      sort_order: "desc",
    }).entries;
    const data = buildPublicAiEventFeed(storedEntries, undefined, {
      lifecycle: parseLifecycle(c.req.query("status")),
      category: c.req.query("category") ?? "all",
      page: parsePositiveInt(c.req.query("page"), 1, 1000),
      pageSize: parsePositiveInt(c.req.query("page_size"), 24, 60),
    });

    return c.json({
      success: true,
      data,
      error: null,
      duration_ms: Date.now() - start,
    } satisfies ApiResponse);
  });

  return app;
}
