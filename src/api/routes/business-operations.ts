import { Hono } from "hono";
import { loadSourceRegistry } from "../../business/data-pipeline";

export function businessOperationsRoutes(): Hono {
  const app = new Hono();
  app.use("*", async (c, next) => { const expected = process.env.CHANCEPING_BUSINESS_OPERATIONS_TOKEN; const auth = c.req.header("authorization"); if (!expected || auth !== `Bearer ${expected}`) return c.json({ success: false, data: null, error: { code: "UNAUTHORIZED", message: "需要运营权限" }, duration_ms: 0 }, 401); await next(); });
  app.get("/review-queue", (c) => { const registry = loadSourceRegistry(); return c.json({ success: true, data: { sources: registry.sources.filter((source) => source.health.includes("待") || source.integrationStatus === "TECHNICAL_REVIEW"), generatedAt: new Date().toISOString() }, error: null, duration_ms: 0 }); });
  return app;
}
