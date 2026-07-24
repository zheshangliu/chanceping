import { Hono } from "hono";
import { BUSINESS_COMMON_CONFIG, BUSINESS_EDITIONS, BUSINESS_EDITION_IDS, getBusinessEdition } from "../../business/edition-config";
import { CATEGORY_LABELS, loadBusinessOpportunities, lifecycleStatus, RECOMMENDATION_LABELS, VERIFICATION_LABELS, type BusinessOpportunity } from "../../business/opportunity";
import { sourcesForEdition } from "../../business/source-catalog";
import type { ApiResponse } from "../types";

export function businessRadarRoutes(): Hono {
  const app = new Hono();
  const allItems = () => loadBusinessOpportunities();
  const publicItem = (item: BusinessOpportunity) => ({ ...item, lifecycleStatus: lifecycleStatus(item), categoryLabel: CATEGORY_LABELS[item.category], verificationLabel: VERIFICATION_LABELS[item.verificationStatus], recommendationLabel: RECOMMENDATION_LABELS[item.recommendationLevel] });

  app.get("/editions", (c) => c.json({
    success: true,
    data: { common: BUSINESS_COMMON_CONFIG, defaultEdition: "guangzhou", editions: BUSINESS_EDITION_IDS.map((id) => BUSINESS_EDITIONS[id]) },
    error: null,
    duration_ms: 0,
  } satisfies ApiResponse));

  app.get("/editions/:edition", (c) => {
    const edition = getBusinessEdition(c.req.param("edition"));
    if (!edition) {
      return c.json({ success: false, data: null, error: { code: "EDITION_NOT_FOUND", message: "地区版本不存在" }, duration_ms: 0 } satisfies ApiResponse, 404);
    }
    return c.json({ success: true, data: { common: BUSINESS_COMMON_CONFIG, edition }, error: null, duration_ms: 0 } satisfies ApiResponse);
  });

  app.get("/sources", (c) => {
    const edition = getBusinessEdition(c.req.query("edition"));
    if (!edition) return c.json({ success: false, data: null, error: { code: "EDITION_REQUIRED", message: "需要有效的地区版本" }, duration_ms: 0 } satisfies ApiResponse, 400);
    return c.json({ success: true, data: { edition: edition.id, items: sourcesForEdition(edition.id) }, error: null, duration_ms: 0 } satisfies ApiResponse);
  });

  app.get("/opportunities", (c) => {
    const edition = getBusinessEdition(c.req.query("edition"));
    if (!edition) return c.json({ success: false, data: null, error: { code: "EDITION_REQUIRED", message: "需要有效的地区版本" }, duration_ms: 0 } satisfies ApiResponse, 400);
    const query = (c.req.query("q") ?? "").trim().toLowerCase();
    const category = c.req.query("category") ?? "all";
    const status = c.req.query("status") ?? "all";
    const sort = c.req.query("sort") ?? "updated";
    const all = allItems().filter((item) => item.editions.includes(edition.id));
    let items = all.filter((item) => (!query || `${item.title} ${item.summary} ${item.keywords.join(" ")} ${item.organizer}`.toLowerCase().includes(query)) && (category === "all" || item.category === category) && (status === "all" || (status === "current" ? lifecycleStatus(item) !== "historical" : lifecycleStatus(item) === status)));
    items = items.sort((a, b) => sort === "deadline" ? String(a.deadline ?? "9999").localeCompare(String(b.deadline ?? "9999")) : sort === "recommendation" ? ({ high: 0, medium: 1, observe: 2 }[a.recommendationLevel] - { high: 0, medium: 1, observe: 2 }[b.recommendationLevel]) : b.updatedAt.localeCompare(a.updatedAt));
    return c.json({ success: true, data: { edition: edition.id, items: items.map(publicItem), total: items.length, totals: { all: all.length, current: all.filter((item) => lifecycleStatus(item) !== "historical").length, historical: all.filter((item) => lifecycleStatus(item) === "historical").length }, categories: Object.entries(CATEGORY_LABELS).map(([id, label]) => ({ id, label })) }, error: null, duration_ms: 0 } satisfies ApiResponse);
  });

  app.get("/opportunities/:slug", (c) => {
    const edition = getBusinessEdition(c.req.query("edition"));
    const item = allItems().find((candidate) => candidate.slug === c.req.param("slug") && (!edition || candidate.editions.includes(edition.id)));
    if (!item) return c.json({ success: false, data: null, error: { code: "OPPORTUNITY_NOT_FOUND", message: "机会不存在或不适用于当前地区版本" }, duration_ms: 0 } satisfies ApiResponse, 404);
    return c.json({ success: true, data: publicItem(item), error: null, duration_ms: 0 } satisfies ApiResponse);
  });

  return app;
}
