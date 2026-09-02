import { Hono } from "hono";
import type { RadarRun } from "../model/radar-run";
import type { HeadHunterApiContext } from "./context";
import { requireAdmin, jsonBody } from "./route-utils";

export function runRoutes(context: HeadHunterApiContext): Hono {
  const app = new Hono();
  app.get("/", async (c) => { const guard = requireAdmin(c, context); if (guard) return guard; return c.json(await context.stores.runs.list()); });
  app.get("/:runId", async (c) => { const guard = requireAdmin(c, context); if (guard) return guard; const run = await context.stores.runs.get(c.req.param("runId")); return run ? c.json(run) : c.json({ error: "not_found" }, 404); });
  app.post("/", async (c) => { const guard = requireAdmin(c, context); if (guard) return guard; const body = await jsonBody(c); const now = new Date().toISOString(); const run: RadarRun = { radar_run_id: typeof body.radar_run_id === "string" ? body.radar_run_id : `run-${Date.now()}`, trigger_type: body.trigger_type === "scheduled" ? "scheduled" : "manual", started_at: now, finished_at: null, status: "running", queries: [], provider_usage: [], cost_summary: { known_cost: 0, unknown_cost: true, currency: "USD" }, company_count: 0, signal_count: 0, lead_count: 0 }; await context.stores.runs.upsert(run); return c.json(run, 201); });
  return app;
}
