import { Hono } from "hono";
import type { HeadHunterApiContext } from "./context";
import { requireAdmin, jsonBody } from "./route-utils";

export function trendRoutes(context: HeadHunterApiContext): Hono {
  const app = new Hono();
  app.get("/", async (c) => { const guard = requireAdmin(c, context); if (guard) return guard; return c.json(await context.stores.trends.list()); });
  app.patch("/:trendId", async (c) => { const guard = requireAdmin(c, context); if (guard) return guard; const rows = await context.stores.trends.list(); const trend = rows.find((row) => row.trend_id === c.req.param("trendId")); if (!trend) return c.json({ error: "not_found" }, 404); const body = await jsonBody(c); const updated = { ...trend, ...(typeof body.summary === "string" ? { summary: body.summary } : {}), last_seen_at: new Date().toISOString() }; await context.stores.trends.upsert(updated); return c.json(updated); });
  return app;
}
