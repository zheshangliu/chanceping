import { Hono } from "hono";
import type { Context } from "hono";
import { BusinessProfileStore } from "../../business/profile-store";

export function businessProfileRoutes(): Hono {
  const app = new Hono();
  const store = new BusinessProfileStore();
  const user = (c: Context) => c.req.header("x-business-user") || c.req.query("userId") || "demo-user";
  app.get("/", (c) => c.json({ success: true, data: { items: store.list(user(c)) }, error: null, duration_ms: 0 }));
  app.post("/", async (c) => { const body = await c.req.json().catch(() => ({})); return c.json({ success: true, data: store.create(user(c), body), error: null, duration_ms: 0 }, 201); });
  app.get("/:id", (c) => { const profile = store.get(user(c), c.req.param("id")); if (!profile) return c.json({ success: false, data: null, error: { code: "PROFILE_NOT_FOUND", message: "企业画像不存在" }, duration_ms: 0 }, 404); return c.json({ success: true, data: profile, error: null, duration_ms: 0 }); });
  return app;
}
