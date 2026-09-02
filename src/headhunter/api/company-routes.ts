import { Hono } from "hono";
import type { HeadHunterApiContext } from "./context";
import { requireAdmin, jsonBody } from "./route-utils";

export function companyRoutes(context: HeadHunterApiContext): Hono {
  const app = new Hono();
  app.get("/", async (c) => { const guard = requireAdmin(c, context); if (guard) return guard; return c.json(await context.stores.companies.list()); });
  app.get("/:companyId", async (c) => { const guard = requireAdmin(c, context); if (guard) return guard; const company = await context.stores.companies.get(c.req.param("companyId")); return company ? c.json(company) : c.json({ error: "not_found" }, 404); });
  app.patch("/:companyId", async (c) => { const guard = requireAdmin(c, context); if (guard) return guard; const company = await context.stores.companies.get(c.req.param("companyId")); if (!company) return c.json({ error: "not_found" }, 404); const body = await jsonBody(c); const updated = { ...company, ...(typeof body.canonical_name === "string" ? { canonical_name: body.canonical_name } : {}), updated_at: new Date().toISOString() }; await context.stores.companies.upsert(updated); return c.json(updated); });
  app.patch("/evidence/:evidenceId/override", async (c) => { const guard = requireAdmin(c, context); if (guard) return guard; const body = await jsonBody(c); const override = { edited_at: new Date().toISOString(), ...(typeof body.corrected_summary === "string" ? { corrected_summary: body.corrected_summary } : {}), ...(typeof body.note === "string" ? { note: body.note } : {}) }; try { return c.json(await context.stores.evidence.applyOverride(c.req.param("evidenceId"), override)); } catch (error) { return c.json({ error: error instanceof Error ? error.message : "override_failed" }, 400); } });
  return app;
}
