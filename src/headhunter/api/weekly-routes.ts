import { Hono } from "hono";
import type { HeadHunterApiContext } from "./context";
import { requireAdmin, jsonBody } from "./route-utils";
import { renderWeeklyMarkdown } from "../reports/markdown-export";

export function weeklyRoutes(context: HeadHunterApiContext): Hono {
  const app = new Hono();
  app.get("/current", async (c) => { const guard = requireAdmin(c, context); if (guard) return guard; const rows = await context.stores.weeklySnapshots.list(); return c.json(rows.filter((row) => row.published).sort((a, b) => b.week_key.localeCompare(a.week_key))[0] ?? null); });
  app.get("/:weekKey", async (c) => { const guard = requireAdmin(c, context); if (guard) return guard; const row = await context.stores.weeklySnapshots.getPublished(c.req.param("weekKey")); return row ? c.json(row) : c.json({ error: "not_found" }, 404); });
  app.get("/:weekKey/markdown", async (c) => { const guard = requireAdmin(c, context); if (guard) return guard; const row = await context.stores.weeklySnapshots.getPublished(c.req.param("weekKey")); return row ? c.text(renderWeeklyMarkdown(row), 200, { "content-type": "text/markdown; charset=utf-8" }) : c.json({ error: "not_found" }, 404); });
  app.post("/:weekKey/publish-run/:runId", async (c) => { const guard = requireAdmin(c, context); if (guard) return guard; const row = await context.stores.weeklySnapshots.getPublished(c.req.param("weekKey")); if (!row || row.radar_run_id !== c.req.param("runId")) return c.json({ error: "snapshot_or_run_not_found" }, 404); return c.json(row); });
  app.post("/:weekKey/manual-publish", async (c) => { const guard = requireAdmin(c, context); if (guard) return guard; const row = await context.stores.weeklySnapshots.getPublished(c.req.param("weekKey")); if (!row) return c.json({ error: "not_found" }, 404); const body = await jsonBody(c); const updated = { ...row, published: true, markdown: typeof body.markdown === "string" ? body.markdown : renderWeeklyMarkdown(row), updated_at: new Date().toISOString() }; await context.stores.weeklySnapshots.upsertPublished(updated); return c.json(updated); });
  return app;
}
