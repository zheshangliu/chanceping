import assert from "node:assert/strict";
import path from "node:path";
import { Hono } from "hono";
import { IchOpportunityStore } from "../src/ich/store";
import { getPublicIchOpportunity } from "../src/ich/query";
import { publicIchRoutes } from "../src/api/routes/public-ich";
import { ichPagesRoutes } from "../src/api/routes/ich-pages";

const NOW = new Date("2026-08-24T16:00:00+08:00");
const store = new IchOpportunityStore(path.resolve(process.cwd(), "data/ich-opportunities.json"));
const loaded = store.load();
const slug = "2026-guangdong-cultural-tourism-subsidy-platform-selection";
const entry = getPublicIchOpportunity(loaded.entries, slug, NOW);
assert(entry, "controlled-import entry must be publicly readable");
const importedEntry = entry;

async function request(app: Hono, url: string): Promise<Response> {
  return app.fetch(new Request(`http://localhost${url}`));
}

async function main(): Promise<void> {
  const api = publicIchRoutes({ store, now: () => NOW });
  const listResponse = await request(api, "/opportunities?q=广东金秋文旅消费惠民补贴&status=current&page_size=60");
  assert.equal(listResponse.status, 200);
  const list = await listResponse.json() as { total: number; items: Array<{ slug: string; title: string }> };
  assert(list.total >= 1, "public API should return at least one matching opportunity");
  assert(list.items.some((item) => item.slug === slug), "public API must include controlled-import slug");

  const detailResponse = await request(api, `/opportunities/${encodeURIComponent(slug)}`);
  assert.equal(detailResponse.status, 200);
  const detail = await detailResponse.json() as { title: string; sources: Array<{ url: string }>; published_at: string | null };
  assert.equal(detail.title, importedEntry.title);
  assert(detail.published_at, "public API detail must expose published_at");
  assert(detail.sources.some((source) => source.url === "https://whly.gd.gov.cn/open_newggl/content/post_4944921.html"));

  const pages = ichPagesRoutes({ store, now: () => NOW });
  const homeResponse = await request(pages, "/?q=广东金秋文旅消费惠民补贴&status=current");
  assert.equal(homeResponse.status, 200);
  const homeHtml = await homeResponse.text();
  assert(homeHtml.includes(importedEntry.title), "SSR home must render controlled-import title");
  assert(homeHtml.includes("当前机会"), "SSR home must render current count");

  const pageResponse = await request(pages, `/opportunities/${encodeURIComponent(slug)}`);
  assert.equal(pageResponse.status, 200);
  const detailHtml = await pageResponse.text();
  assert(detailHtml.includes(importedEntry.title), "SSR detail must render controlled-import title");
  assert(detailHtml.includes("https://whly.gd.gov.cn/open_newggl/content/post_4944921.html"), "SSR detail must render official source");

  console.log(JSON.stringify({
    gate: "pass",
    formal_store_count: loaded.entries.length,
    slug,
    api_list_status: listResponse.status,
    api_detail_status: detailResponse.status,
    ssr_home_status: homeResponse.status,
    ssr_detail_status: pageResponse.status,
    published_at: detail.published_at,
  }, null, 2));
}

void main();
