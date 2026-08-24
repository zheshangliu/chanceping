import { Hono } from "hono";
import { ichPagesRoutes } from "../src/api/routes/ich-pages";
import { createIchFixture } from "./fixtures/ich-opportunity";
import type { IchOpportunityStore, IchStoreLoadResult } from "../src/ich/store";

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail = ""): void {
  if (condition) {
    passed += 1;
    console.log(`[PASS] ${name}`);
  } else {
    failed += 1;
    console.error(`[FAIL] ${name}${detail ? `: ${detail}` : ""}`);
  }
}

const published = createIchFixture({
  id: "published",
  slug: "seo-visible",
  title: 'SEO <script>alert("x")</script>',
  summary: "公开摘要",
  is_published: true,
  classification_status: "confirmed",
  metadata: {
    ...createIchFixture().metadata,
    published_at: "2026-07-20T00:00:00+08:00",
    updated_at: "2026-07-21T00:00:00+08:00",
  },
  workflow: {
    ...createIchFixture().workflow,
    state: "published",
  },
});
const noindex = createIchFixture({
  id: "noindex",
  slug: "seo-hidden",
  is_published: true,
  classification_status: "confirmed",
  seo: {
    meta_title: null,
    meta_description: null,
    canonical_url: null,
    og_title: null,
    og_description: null,
    og_image: null,
    noindex: true,
  },
  workflow: { ...createIchFixture().workflow, state: "published" },
});
const draft = createIchFixture({ id: "draft", slug: "draft-hidden" });
const entries = [published, noindex, draft];
let loads = 0;
const store = {
  load(): IchStoreLoadResult {
    loads += 1;
    return {
      entries,
      invalidEntries: [],
      updatedAt: "2026-07-21T00:00:00+08:00",
    };
  },
} as IchOpportunityStore;
const before = JSON.stringify(entries);
const app = new Hono().route("/ich", ichPagesRoutes({
  store,
  now: () => new Date("2026-07-24T00:00:00+08:00"),
}));

async function main(): Promise<void> {
  console.log("\n[ICH Stage 4A] SEO, structured data, sitemap and robots\n");

  const home = await (await app.request("/ich")).text();
  check("home canonical is absolute production URL", home.includes('rel="canonical" href="https://ich.chanceping.com/ich"'));
  check("home OG URL matches canonical", home.includes('property="og:url" content="https://ich.chanceping.com/ich"'));
  check("home has Twitter metadata", home.includes('name="twitter:card" content="summary"'));

  const detailResponse = await app.request("/ich/opportunities/seo-visible");
  const detail = await detailResponse.text();
  check("detail returns SSR HTML", detailResponse.status === 200 && detail.includes("公开摘要"));
  check("detail canonical and OG URL match", detail.includes('href="https://ich.chanceping.com/ich/opportunities/seo-visible"') &&
    detail.includes('property="og:url" content="https://ich.chanceping.com/ich/opportunities/seo-visible"'));
  check("visible content escapes title XSS", !detail.includes('<script>alert("x")</script>'));
  check("JSON-LD escapes script opening characters", !detail.includes('<script>alert') && detail.includes("\\u003cscript>"));
  const blocks = [...detail.matchAll(/<script type="application\/ld\+json">(.+?)<\/script>/g)].map((match) => JSON.parse(match[1]));
  check("detail has parseable WebPage and BreadcrumbList JSON-LD", blocks.some((item) => item["@type"] === "WebPage") &&
    blocks.some((item) => item["@type"] === "BreadcrumbList"));
  check("JSON-LD contains no internal operator fields", !JSON.stringify(blocks).includes("workflow") &&
    !JSON.stringify(blocks).includes("created_by"));

  const missing = await (await app.request("/ich/opportunities/not-found")).text();
  check("missing detail is noindex", missing.includes('name="robots" content="noindex,nofollow"'));

  const sitemapResponse = await app.request("/ich/sitemap.xml");
  const sitemap = await sitemapResponse.text();
  check("sitemap is XML with cache policy", sitemapResponse.headers.get("content-type")?.includes("application/xml") === true &&
    sitemapResponse.headers.get("cache-control") === "public, max-age=300");
  check("sitemap includes fixed and published detail pages", sitemap.includes("https://ich.chanceping.com/ich/history") &&
    sitemap.includes("https://ich.chanceping.com/ich/opportunities/seo-visible"));
  check("sitemap excludes drafts and noindex details", !sitemap.includes("draft-hidden") && !sitemap.includes("seo-hidden"));
  check("sitemap advertises available submit form", sitemap.includes("https://ich.chanceping.com/ich/submit"));

  const robotsResponse = await app.request("/ich/robots.txt");
  const robots = await robotsResponse.text();
  check("robots points at canonical sitemap", robots.includes("Sitemap: https://ich.chanceping.com/ich/sitemap.xml"));
  check("robots blocks admin and internal API", robots.includes("Disallow: /ich/admin") && robots.includes("Disallow: /api/internal/"));

  const principles = await app.request("/ich/source-principles");
  const principlesHtml = await principles.text();
  check("contact author page retains source principles", principles.status === 200 &&
    principlesHtml.includes("联系作者｜ChancePing 非遗机会雷达") &&
    principlesHtml.includes("来源与审核原则"));
  check("ICH navigation labels the contact author destination", principlesHtml.includes(
    '<a href="/ich/source-principles" aria-current="page">联系作者</a>',
  ));
  check("contact author page exposes requested radar description and contact channels",
    principlesHtml.includes("定制你的机会雷达") &&
    principlesHtml.includes("持续盯住比赛、客户线索、采购项目、合作机会、政策扶持或行业信息") &&
    principlesHtml.includes('<address class="ich-contact-details"><strong class="ich-contact-name">Jason 刘哲赏</strong><a href="mailto:sunny251610056@gmail.com">') &&
    principlesHtml.includes('href="mailto:sunny251610056@gmail.com"') &&
    principlesHtml.includes("liuzheshangwx") &&
    principlesHtml.includes('/assets/ich-jason-wechat-qr.jpg'));
  check("contact author page footer uses the contact label",
    principlesHtml.includes('<a href="/ich/source-principles">联系作者</a> ·'));
  check("all SEO GET requests remain read-only", loads > 0 && JSON.stringify(entries) === before);

  console.log(`\nICH Stage 4A result: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
