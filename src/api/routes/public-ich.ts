import path from "path";
import { Hono } from "hono";
import { IchOpportunityStore } from "../../ich/store";
import {
  ICH_FILTER_STATUSES,
  ICH_REGIONS,
  ICH_SORTS,
  getPublicIchOpportunity,
  queryIchOpportunities,
  type IchQuery,
} from "../../ich/query";
import { ICH_PRIMARY_CATEGORIES } from "../../ich/types";

export interface IchReadRouteOptions {
  store?: IchOpportunityStore;
  now?: () => Date;
}

export function defaultIchStore(): IchOpportunityStore {
  return new IchOpportunityStore(
    process.env.CHANCEPING_ICH_STORE_PATH || path.resolve(process.cwd(), "data/ich-opportunities.json"),
    path.resolve(process.cwd(), "src/ich/opportunities.verified.json"),
  );
}

export function parseIchQuery(raw: Record<string, string>): { query?: IchQuery; error?: string } {
  const q = (raw.q ?? "").trim();
  const category = raw.category ?? "all";
  const region = raw.region ?? "all";
  const status = raw.status ?? "current";
  const sort = raw.sort ?? "default";
  const page = raw.page === undefined ? 1 : Number(raw.page);
  const pageSize = raw.page_size === undefined ? 20 : Number(raw.page_size);
  if (q.length > 100) return { error: "q 最多允许 100 个字符" };
  if (category !== "all" && !ICH_PRIMARY_CATEGORIES.includes(category as never)) return { error: "category 参数无效" };
  if (!ICH_REGIONS.includes(region as never)) return { error: "region 参数无效" };
  if (!ICH_FILTER_STATUSES.includes(status as never)) return { error: "status 参数无效" };
  if (!ICH_SORTS.includes(sort as never)) return { error: "sort 参数无效" };
  if (!Number.isInteger(page) || page < 1) return { error: "page 必须为正整数" };
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 60) return { error: "page_size 必须是 1 至 60 的整数" };
  return { query: { q, category, region, status, sort, page, page_size: pageSize } as IchQuery };
}

export function publicIchRoutes(options: IchReadRouteOptions = {}): Hono {
  const app = new Hono();
  const store = options.store ?? defaultIchStore();
  const now = options.now ?? (() => new Date());

  app.get("/opportunities", (c) => {
    const parsed = parseIchQuery(c.req.query());
    if (!parsed.query) {
      return c.json({ error: { code: "INVALID_QUERY", message: parsed.error } }, 400);
    }
    const loaded = store.load();
    return c.json(queryIchOpportunities(loaded.entries, parsed.query, now(), loaded.updatedAt));
  });

  app.get("/opportunities/:slug", (c) => {
    const loaded = store.load();
    const item = getPublicIchOpportunity(loaded.entries, c.req.param("slug"), now());
    if (!item) return c.json({ error: { code: "NOT_FOUND", message: "非遗机会不存在或尚未发布" } }, 404);
    return c.json(item);
  });

  return app;
}
