import { Hono } from "hono";
import type { HeadHunterApiContext } from "./context";
import { requireAdmin, jsonBody } from "./route-utils";
import type { WatchlistCompany } from "../model/watchlist";

export function watchlistRoutes(context: HeadHunterApiContext): Hono {
  const app = new Hono();
  app.get("/", async (c) => { const guard = requireAdmin(c, context); if (guard) return guard; const items = await context.stores.watchlist.list(); const companies = await context.stores.companies.list(); return c.json(items.map((item) => ({ ...item, company: companies.find((company) => company.company_id === item.company_id) ?? null }))); });
  app.post("/", async (c) => { const guard = requireAdmin(c, context); if (guard) return guard; const body = await jsonBody(c); if (typeof body.company_id !== "string" || !(await context.stores.companies.get(body.company_id))) return c.json({ error: "company_not_found" }, 400); const now = new Date().toISOString(); const item: WatchlistCompany = { watchlist_id: `watch-${body.company_id}`, company_id: body.company_id, status: body.status === "paused" ? "paused" : "watching", priority: body.priority === "high" ? "high" : "normal", note: typeof body.note === "string" ? body.note : null, last_snapshot_week: null, created_at: now, updated_at: now }; await context.stores.watchlist.upsert(item); return c.json(item, 201); });
  app.patch("/:watchlistId", async (c) => { const guard = requireAdmin(c, context); if (guard) return guard; const item = await context.stores.watchlist.get(c.req.param("watchlistId")); if (!item) return c.json({ error: "not_found" }, 404); const body = await jsonBody(c); const status = body.status === "watching" || body.status === "paused" || body.status === "archived" ? body.status : item.status; const priority = body.priority === "high" || body.priority === "normal" ? body.priority : item.priority; const updated: WatchlistCompany = { ...item, status, priority, ...(typeof body.note === "string" ? { note: body.note } : {}), updated_at: new Date().toISOString() }; await context.stores.watchlist.upsert(updated); return c.json(updated); });
  return app;
}
