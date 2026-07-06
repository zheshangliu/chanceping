import { Hono } from "hono";
import type { AppContext } from "../context";
import type { ApiResponse } from "../types";
import { buildPublicAiEventFeed } from "../../public/ai-events-publisher";

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
    const data = buildPublicAiEventFeed(storedEntries);

    return c.json({
      success: true,
      data,
      error: null,
      duration_ms: Date.now() - start,
    } satisfies ApiResponse);
  });

  return app;
}
