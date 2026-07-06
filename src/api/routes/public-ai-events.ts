import { Hono } from "hono";
import type { AppContext } from "../context";
import type { ApiResponse } from "../types";
import { buildPublicAiEventFeed, type PublicAiEventLifecycle } from "../../public/ai-events-publisher";
import {
  hydratePublicAiEventImages,
  syncAndHydratePublicAiEventsToStore,
  syncPublicAiEventsToStore,
} from "../../public/ai-events-store-sync";

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

function parseBoolean(value: string | undefined): boolean {
  return /^(1|true|yes|on)$/i.test(String(value ?? "").trim());
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

  app.post("/ai-events/sync", async (c) => {
    const start = Date.now();
    const hydrateImages = parseBoolean(c.req.query("hydrate_images"));
    const result = hydrateImages
      ? await syncAndHydratePublicAiEventsToStore(ctx.store, undefined, {
        hydrateImages: true,
        imageHydrationLimit: parsePositiveInt(c.req.query("image_limit"), 30, 120),
      })
      : syncPublicAiEventsToStore(ctx.store);
    return c.json({
      success: true,
      data: result,
      error: null,
      duration_ms: Date.now() - start,
    } satisfies ApiResponse);
  });

  app.post("/ai-events/hydrate-images", async (c) => {
    const start = Date.now();
    const limit = parsePositiveInt(c.req.query("limit"), 30, 120);
    const result = await hydratePublicAiEventImages(ctx.store, { limit });
    return c.json({
      success: true,
      data: result,
      error: null,
      duration_ms: Date.now() - start,
    } satisfies ApiResponse);
  });

  return app;
}
