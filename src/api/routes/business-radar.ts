import { Hono } from "hono";
import { BUSINESS_COMMON_CONFIG, BUSINESS_EDITIONS, BUSINESS_EDITION_IDS, getBusinessEdition } from "../../business/edition-config";
import type { ApiResponse } from "../types";

/** Public configuration only. Opportunity records are intentionally not part of Sprint 1. */
export function businessRadarRoutes(): Hono {
  const app = new Hono();

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

  return app;
}
