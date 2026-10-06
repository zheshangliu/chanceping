import { Hono } from "hono";
import { BusinessWorkflowStore } from "../../business/user-workflows";
import { loadBusinessOpportunities } from "../../business/opportunity";
import { resolveAuthenticatedUser, unauthorizedBusinessUser, type AuthenticatedUserResolver } from "./authenticated-user";

export interface BusinessWorkflowRouteOptions { resolveAuthenticatedUser?: AuthenticatedUserResolver; }

export function businessWorkflowRoutes(options: BusinessWorkflowRouteOptions = {}): Hono {
  const app = new Hono();
  const store = new BusinessWorkflowStore();
  const userFor = (request: Request) => resolveAuthenticatedUser(request, options.resolveAuthenticatedUser);

  app.get("/saved-filters", async (c) => {
    const user = await userFor(c.req.raw); if (!user) return unauthorizedBusinessUser();
    return c.json({ success: true, data: { items: store.savedFilters(user) }, error: null, duration_ms: 0 });
  });
  app.post("/saved-filters", async (c) => {
    const user = await userFor(c.req.raw); if (!user) return unauthorizedBusinessUser();
    const body = await c.req.json().catch(() => ({})) as { name?: string; edition?: string; filters?: Record<string, unknown> };
    if (!body.name || !body.edition) return c.json({ success: false, data: null, error: { code: "INVALID_FILTER", message: "name and edition are required" }, duration_ms: 0 }, 400);
    return c.json({ success: true, data: store.createSavedFilter(user, { name: body.name, edition: body.edition, filters: body.filters ?? {} }), error: null, duration_ms: 0 }, 201);
  });
  app.delete("/saved-filters/:id", async (c) => {
    const user = await userFor(c.req.raw); if (!user) return unauthorizedBusinessUser();
    return c.json({ success: true, data: { deleted: store.deleteSavedFilter(user, c.req.param("id")) }, error: null, duration_ms: 0 });
  });
  app.get("/favorites", async (c) => {
    const user = await userFor(c.req.raw); if (!user) return unauthorizedBusinessUser();
    return c.json({ success: true, data: { items: store.favorites(user) }, error: null, duration_ms: 0 });
  });
  app.post("/favorites", async (c) => {
    const user = await userFor(c.req.raw); if (!user) return unauthorizedBusinessUser();
    const body = await c.req.json().catch(() => ({})) as { opportunityId?: string };
    if (!body.opportunityId) return c.json({ success: false, data: null, error: { code: "INVALID_FAVORITE", message: "opportunityId is required" }, duration_ms: 0 }, 400);
    return c.json({ success: true, data: store.addFavorite(user, body.opportunityId), error: null, duration_ms: 0 }, 201);
  });
  app.delete("/favorites/:opportunityId", async (c) => {
    const user = await userFor(c.req.raw); if (!user) return unauthorizedBusinessUser();
    return c.json({ success: true, data: { deleted: store.deleteFavorite(user, c.req.param("opportunityId")) }, error: null, duration_ms: 0 });
  });
  app.get("/reminders", async (c) => {
    const user = await userFor(c.req.raw); if (!user) return unauthorizedBusinessUser();
    return c.json({ success: true, data: { items: store.reminders(user) }, error: null, duration_ms: 0 });
  });
  app.post("/reminders", async (c) => {
    const user = await userFor(c.req.raw); if (!user) return unauthorizedBusinessUser();
    const body = await c.req.json().catch(() => ({})) as { opportunityId?: string; remindAt?: string };
    if (!body.opportunityId || !body.remindAt) return c.json({ success: false, data: null, error: { code: "INVALID_REMINDER", message: "opportunityId and remindAt are required" }, duration_ms: 0 }, 400);
    try { return c.json({ success: true, data: store.createReminder(user, { opportunityId: body.opportunityId, remindAt: body.remindAt }), error: null, duration_ms: 0 }, 201); }
    catch (error) { return c.json({ success: false, data: null, error: { code: "INVALID_REMINDER", message: (error as Error).message }, duration_ms: 0 }, 400); }
  });

  // This endpoint exports public opportunity data and does not expose per-user workflow state.
  app.get("/export", (c) => {
    const edition = c.req.query("edition");
    const items = loadBusinessOpportunities().filter((item) => !edition || item.editions.includes(edition as never)).filter((item) => item.status !== "historical");
    return c.json({ success: true, data: { format: "json", edition: edition ?? "all", items }, error: null, duration_ms: 0 });
  });
  return app;
}
