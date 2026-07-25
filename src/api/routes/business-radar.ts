import { Hono } from "hono";
import { BUSINESS_COMMON_CONFIG, BUSINESS_EDITIONS, BUSINESS_EDITION_IDS, getBusinessEdition, type BusinessEditionId } from "../../business/edition-config";
import { CATEGORY_LABELS, loadBusinessOpportunities, lifecycleStatus, RECOMMENDATION_LABELS, VERIFICATION_LABELS, type BusinessOpportunity } from "../../business/opportunity";
import { sourcesForEdition } from "../../business/source-catalog";
import type { ApiResponse } from "../types";

/** Keep a discovery feed useful when one trustworthy source has much higher volume. */
  function diversify(items: BusinessOpportunity[]): BusinessOpportunity[] {
  const result: BusinessOpportunity[] = [];
  const sourceCounts = new Map<string, number>();
  const categoryCounts = new Map<string, number>();
  const remaining = [...items];
    while (remaining.length) {
    const totalNext = result.length + 1;
    const candidateIndex = remaining.findIndex((item) => {
      const sourceOk = result.length === 0 || ((sourceCounts.get(item.sourceName) ?? 0) + 1) / totalNext <= 0.6;
      const categoryOk = item.category === "procurement" || (categoryCounts.get(item.category) ?? 0) < Math.ceil(totalNext * 0.35);
      return sourceOk && categoryOk;
    });
      if (candidateIndex < 0) break;
    const [item] = remaining.splice(candidateIndex, 1);
    result.push(item);
    sourceCounts.set(item.sourceName, (sourceCounts.get(item.sourceName) ?? 0) + 1);
    categoryCounts.set(item.category, (categoryCounts.get(item.category) ?? 0) + 1);
    }
    // Diversity is a presentation constraint. The filtered total is returned
    // separately, while the displayed feed remains intentionally balanced.
    return result;
}

export function businessRadarRoutes(): Hono {
  const app = new Hono();
  const allItems = () => loadBusinessOpportunities();
  const publicItem = (item: BusinessOpportunity) => ({ ...item, lifecycleStatus: lifecycleStatus(item), categoryLabel: CATEGORY_LABELS[item.category], verificationLabel: VERIFICATION_LABELS[item.verificationStatus], recommendationLabel: RECOMMENDATION_LABELS[item.recommendationLevel] });

  const scoreForProfile = (item: BusinessOpportunity, profile: { keywords?: string[]; industries?: string[]; regions?: string[]; categories?: string[] }) => {
    const terms = [...(profile.keywords ?? []), ...(profile.industries ?? [])].map((value) => value.toLowerCase()).filter(Boolean);
    const haystack = `${item.title} ${item.summary} ${item.keywords.join(" ")} ${item.industries.join(" ")}`.toLowerCase();
    const termHits = terms.filter((term) => haystack.includes(term)).length;
    const regionHit = (profile.regions ?? []).some((region) => item.regions.some((value) => value.includes(region)) || item.editions.includes(region as BusinessEditionId));
    const categoryHit = (profile.categories ?? []).includes(item.category);
    const score = Math.min(99, Math.max(35, 45 + termHits * 12 + (regionHit ? 10 : 0) + (categoryHit ? 8 : 0) + (item.recommendationLevel === "high" ? 8 : 0)));
    return { score, reasons: [termHits ? `命中 ${termHits} 个关注关键词` : "与关注方向存在基础关联", regionHit ? "地区范围匹配" : "地区范围待确认", categoryHit ? "机会类型匹配" : "建议结合企业阶段判断"] };
  };

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
    const deadlineFrom = c.req.query("deadline_from");
    const deadlineTo = c.req.query("deadline_to");
    const audience = (c.req.query("audience") ?? "").trim().toLowerCase();
    const diverse = c.req.query("diverse") === "1";
    const all = allItems().filter((item) => item.editions.includes(edition.id));
    let items = all.filter((item) => {
      const deadline = item.deadline ? Date.parse(item.deadline) : undefined;
      return (!query || `${item.title} ${item.summary} ${item.keywords.join(" ")} ${item.organizer}`.toLowerCase().includes(query))
        && (category === "all" || item.category === category)
        && (status === "all" || (status === "current" ? lifecycleStatus(item) !== "historical" : lifecycleStatus(item) === status))
        && (!deadlineFrom || (deadline !== undefined && deadline >= Date.parse(deadlineFrom)))
        && (!deadlineTo || (deadline !== undefined && deadline <= Date.parse(deadlineTo)))
        && (!audience || item.targetAudience.some((value) => value.toLowerCase().includes(audience)));
    });
    items = items.sort((a, b) => sort === "deadline" ? String(a.deadline ?? "9999").localeCompare(String(b.deadline ?? "9999")) : sort === "recommendation" ? ({ high: 0, medium: 1, observe: 2 }[a.recommendationLevel] - { high: 0, medium: 1, observe: 2 }[b.recommendationLevel]) : b.updatedAt.localeCompare(a.updatedAt));
    const displayed = diverse ? diversify(items) : items;
    return c.json({ success: true, data: { edition: edition.id, items: displayed.map(publicItem), total: items.length, displayedTotal: displayed.length, sourceDiversityApplied: diverse, totals: { all: all.length, current: all.filter((item) => lifecycleStatus(item) !== "historical").length, historical: all.filter((item) => lifecycleStatus(item) === "historical").length }, categories: Object.entries(CATEGORY_LABELS).map(([id, label]) => ({ id, label })) }, error: null, duration_ms: 0 } satisfies ApiResponse);
  });

  app.get("/opportunities/:slug", (c) => {
    const edition = getBusinessEdition(c.req.query("edition"));
    const item = allItems().find((candidate) => candidate.slug === c.req.param("slug") && (!edition || candidate.editions.includes(edition.id)));
    if (!item) return c.json({ success: false, data: null, error: { code: "OPPORTUNITY_NOT_FOUND", message: "机会不存在或不适用于当前地区版本" }, duration_ms: 0 } satisfies ApiResponse, 404);
    return c.json({ success: true, data: publicItem(item), error: null, duration_ms: 0 } satisfies ApiResponse);
  });

  app.post("/matches", async (c) => {
    const edition = getBusinessEdition(c.req.query("edition"));
    if (!edition) return c.json({ success: false, data: null, error: { code: "EDITION_REQUIRED", message: "需要有效的地区版本" }, duration_ms: 0 } satisfies ApiResponse, 400);
    const profile = await c.req.json().catch(() => ({})) as { keywords?: string[]; industries?: string[]; regions?: string[]; categories?: string[] };
    const matches = allItems().filter((item) => item.editions.includes(edition.id) && lifecycleStatus(item) !== "historical").map((item) => ({ item, ...scoreForProfile(item, profile) })).sort((a, b) => b.score - a.score || b.item.updatedAt.localeCompare(a.item.updatedAt)).slice(0, 20);
    return c.json({ success: true, data: { edition: edition.id, profile, gate: { passed: matches.length >= 20, reason: matches.length >= 20 ? "已达到首发匹配数量门槛" : "当前有效机会不足 20 条" }, items: matches.map(({ item, score, reasons }) => ({ ...publicItem(item), fitScore: score, fitReasons: reasons })) }, error: null, duration_ms: 0 } satisfies ApiResponse);
  });

  return app;
}
