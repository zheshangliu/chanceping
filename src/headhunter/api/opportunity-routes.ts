import { Hono } from "hono";
import type { HeadHunterApiContext } from "./context";
import { requireAdmin, jsonBody } from "./route-utils";
import { isOpportunityWorkflowStatus } from "../model/opportunity";

export function opportunityRoutes(context: HeadHunterApiContext): Hono {
  const app = new Hono();
  app.get("/", async (c) => { const guard = requireAdmin(c, context); if (guard) return guard; return c.json(await context.stores.opportunities.list()); });
  app.get("/:opportunityId", async (c) => { const guard = requireAdmin(c, context); if (guard) return guard; const item = await context.stores.opportunities.get(c.req.param("opportunityId")); return item ? c.json(item) : c.json({ error: "not_found" }, 404); });
  app.patch("/:opportunityId/status", async (c) => { const guard = requireAdmin(c, context); if (guard) return guard; const item = await context.stores.opportunities.get(c.req.param("opportunityId")); if (!item) return c.json({ error: "not_found" }, 404); const body = await jsonBody(c); if (typeof body.status !== "string" || !isOpportunityWorkflowStatus(body.status)) return c.json({ error: "invalid_status" }, 400); const note = typeof body.note === "string" ? body.note.trim() : ""; const follow_up_notes = note ? [...(item.follow_up_notes || []), { text: note, created_at: new Date().toISOString() }] : item.follow_up_notes; const updated = { ...item, status: body.status, follow_up_notes, updated_at: new Date().toISOString() }; await context.stores.opportunities.upsert(updated); return c.json(updated); });
  return app;
}
