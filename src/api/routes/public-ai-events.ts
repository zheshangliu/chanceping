import { Hono } from "hono";
import type { AppContext } from "../context";
import type { ApiResponse } from "../types";
import { buildPublicAiEventFeed, type PublicAiEventLifecycle } from "../../public/ai-events-publisher";
import { PUBLIC_AI_EVENTS_RADAR_ID } from "../../public/ai-events-store-sync";
import { getPublicAiEventsSourceHealthSummary } from "../../public/ai-events-update-pipeline";
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
    const publicEntries = listPublicAiEventEntries(ctx.store);
    const data = buildPublicAiEventFeed(publicEntries, seedData, {
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
      data: {
        ...data,
        operations: {
          lastCollectedAt: data.stats.lastCollectedAt,
          nextScheduledCollectionAt: data.stats.nextScheduledCollectionAt,
          updateCadenceDays: data.stats.updateCadenceDays,
          sourceHealth: getPublicAiEventsSourceHealthSummary(),
        },
      },
      error: null,
      duration_ms: Date.now() - start,
    } satisfies ApiResponse);
  });

  return app;
}
