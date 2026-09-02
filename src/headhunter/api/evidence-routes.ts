import { Hono } from "hono";
import type { HeadHunterApiContext } from "./context";
import { requireAdmin, jsonBody } from "./route-utils";

export function evidenceRoutes(context: HeadHunterApiContext): Hono {
  const app = new Hono();
  app.patch("/:evidenceId/override", async (c) => {
    const guard = requireAdmin(c, context); if (guard) return guard;
    const body = await jsonBody(c);
    try {
      return c.json(await context.stores.evidence.applyOverride(c.req.param("evidenceId"), { edited_at: new Date().toISOString(), ...(typeof body.corrected_summary === "string" ? { corrected_summary: body.corrected_summary } : {}), ...(typeof body.note === "string" ? { note: body.note } : {}) }));
    } catch (error) { return c.json({ error: error instanceof Error ? error.message : "override_failed" }, 400); }
  });
  return app;
}
