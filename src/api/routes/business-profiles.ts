import { Hono } from "hono";
import { BusinessProfileStore } from "../../business/profile-store";
import { resolveAuthenticatedUser, unauthorizedBusinessUser, type AuthenticatedUserResolver } from "./authenticated-user";

export interface BusinessProfileRouteOptions { resolveAuthenticatedUser?: AuthenticatedUserResolver; }

export function businessProfileRoutes(options: BusinessProfileRouteOptions = {}): Hono {
  const app = new Hono();
  const store = new BusinessProfileStore();

  app.get("/", async (c) => {
    const owner = await resolveAuthenticatedUser(c.req.raw, options.resolveAuthenticatedUser);
    if (!owner) return unauthorizedBusinessUser();
    return c.json({ success: true, data: { items: store.list(owner) }, error: null, duration_ms: 0 });
  });

  app.post("/", async (c) => {
    const owner = await resolveAuthenticatedUser(c.req.raw, options.resolveAuthenticatedUser);
    if (!owner) return unauthorizedBusinessUser();
    const body = await c.req.json().catch(() => ({}));
    return c.json({ success: true, data: store.create(owner, body), error: null, duration_ms: 0 }, 201);
  });

  app.get("/:id", async (c) => {
    const owner = await resolveAuthenticatedUser(c.req.raw, options.resolveAuthenticatedUser);
    if (!owner) return unauthorizedBusinessUser();
    const profile = store.get(owner, c.req.param("id"));
    if (!profile) return c.json({ success: false, data: null, error: { code: "PROFILE_NOT_FOUND", message: "企业画像不存在" }, duration_ms: 0 }, 404);
    return c.json({ success: true, data: profile, error: null, duration_ms: 0 });
  });

  return app;
}
