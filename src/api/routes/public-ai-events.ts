import { Hono } from "hono";
import type { AppContext } from "../context";
import type { ApiResponse } from "../types";
import { getPublicAiEventSampleRoomData } from "../../demo/ai-events-sample-room";

export function publicAiEventsRoutes(_ctx: AppContext): Hono {
  const app = new Hono();

  app.get("/ai-events", (c) => {
    const start = Date.now();
    const data = getPublicAiEventSampleRoomData();

    return c.json({
      success: true,
      data,
      error: null,
      duration_ms: Date.now() - start,
    } satisfies ApiResponse);
  });

  return app;
}
