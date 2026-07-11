import { Hono } from "hono";
import type { AppContext } from "../context";
import type { ApiResponse } from "../types";
import { buildPublicAiEventFeed, type PublicAiEventLifecycle } from "../../public/ai-events-publisher";
import {
  hydratePublicAiEventImages,
  PUBLIC_AI_EVENTS_RADAR_ID,
  syncPublicAiEventsToStore,
} from "../../public/ai-events-store-sync";
import { runPublicAiEventsUpdatePipeline } from "../../public/ai-events-update-pipeline";
import { getPublicAiEventSampleRoomData } from "../../demo/ai-events-sample-room";
import type { OpportunityStore, StoreEntry } from "../../agents/opportunity-store";

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

function listPublicAiEventEntries(store: OpportunityStore): StoreEntry[] {
  return store.list({
    radarId: PUBLIC_AI_EVENTS_RADAR_ID,
    page: 1,
    page_size: 100000,
    sort_by: "deadline",
    sort_order: "asc",
  }).entries;
}

export function publicAiEventsRoutes(ctx: AppContext): Hono {
  const app = new Hono();

  app.get("/ai-events", (c) => {
    const start = Date.now();
    const seedData = getPublicAiEventSampleRoomData();
    let publicEntries = listPublicAiEventEntries(ctx.store);
    if (publicEntries.length < seedData.items.length) {
      syncPublicAiEventsToStore(ctx.store, seedData);
      publicEntries = listPublicAiEventEntries(ctx.store);
    }
    const sourceNetworkOnlyData = {
      ...seedData,
      items: [],
    };
    const data = buildPublicAiEventFeed(publicEntries, sourceNetworkOnlyData, {
      lifecycle: parseLifecycle(c.req.query("status")),
      category: c.req.query("category") ?? "all",
      region: c.req.query("region") ?? "all",
      reward: c.req.query("reward") ?? "all",
      deadlineWindow: c.req.query("deadline_window") ?? "all",
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
    const result = await runPublicAiEventsUpdatePipeline(ctx.store, undefined, {
      hydrateImages,
      imageHydrationLimit: parsePositiveInt(c.req.query("image_limit"), 30, 120),
      collectSources: parseBoolean(c.req.query("collect_sources")),
      sourceMaxLinks: parsePositiveInt(c.req.query("source_max_links"), 12, 30),
      discoverWithSearch: parseBoolean(c.req.query("discover_with_search")),
    });
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
