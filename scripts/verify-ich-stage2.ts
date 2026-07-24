import { Hono } from "hono";
import { ichPagesRoutes } from "../src/api/routes/ich-pages";
import { publicIchRoutes } from "../src/api/routes/public-ich";
import type { IchOpportunityStore, IchStoreLoadResult } from "../src/ich/store";
import type { IchOpportunity } from "../src/ich/types";

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

function fixture(overrides: Partial<IchOpportunity> = {}): IchOpportunity {
  const base = {
    id: "internal-ich-1", slug: "guangzhou-ich-market", external_id: null,
    title: "广州非遗市集招募", title_original: "广州非物质文化遗产市集招募通知", title_en: null,
    summary: "面向全国非遗传承人与工作室开放。", description: "官方市集机会。",
    opportunity_value_text: "获得展销机会。", primary_category: "exhibition_market",
    secondary_tags: ["广彩", "市集"], classification_confidence: "high",
    classification_reason: "internal reason", classification_status: "confirmed",
    status: "active", status_reason: null, is_featured: true, is_published: true, archive_reason: null,
    organizer: { name: "广州市非遗保护中心", name_en: null, type: "public_cultural_institution", official_website: "https://example.gov.cn", contact_text: "internal contact" },
    location: { country_code: "CN", country_name: "中国", province_state: "广东省", city: "广州市", district: null, venue_text: "广州", region_groups: ["guangzhou", "guangdong", "greater_bay_area"], participation_scope: "nationwide", eligible_regions: ["全国"], is_online: false, is_hybrid: false, is_multi_location: false, location_status: "confirmed" },
    participation_mode: { mode: "offline", submission_method: "official_platform", requires_on_site_presence: true, participation_notes: null },
    dates: { published_at: "2026-07-01T00:00:00+08:00", application_start_at: "2026-07-01T00:00:00+08:00", deadline_at: "2026-08-20T23:59:59+08:00", deadline_text: "2026年8月20日", event_start_at: null, event_end_at: null, timezone: "Asia/Shanghai", is_deadline_all_day: true, is_long_term: false, date_status: "confirmed" },
    eligibility: { eligible_applicant_types: ["inheritor"], eligibility_text: "非遗传承人", ich_status_required: true, business_license_required: null, local_registration_required: false, recommendation_required: false, age_requirement_text: null, language_requirement_text: null, eligibility_status: "confirmed" },
    benefits: { value_types: ["sales"], prize_amount: null, prize_currency: null, funding_amount: null, funding_currency: null, procurement_budget_min: null, procurement_budget_max: null, procurement_currency: null, sales_opportunity: true, channel_opportunity: false, benefit_text: "展销" },
    costs: { application_fee_amount: null, application_fee_currency: null, booth_fee_amount: null, booth_fee_currency: null, deposit_amount: null, deposit_currency: null, commission_rate: null, travel_self_funded: null, accommodation_self_funded: null, materials_self_funded: null, shipping_self_funded: null, cost_text: "未披露", cost_status: "not_disclosed" },
    requirements: { documents_required: [], portfolio_required: null, sample_required: null, proposal_required: null, invoice_required: null, bidding_qualification_required: null, production_capacity_text: null, requirements_text: "以官方公告为准" },
    application: { application_url: "https://example.gov.cn/apply", application_email: null, application_phone: null, application_platform: "官网", application_steps: ["查看公告"], contact_text: null, application_status: "confirmed" },
    sources: [{ url: "https://example.gov.cn/notice", name: "官方公告", type: "government", level: "L1", is_primary: true, published_at: "2026-07-01T00:00:00+08:00", last_checked_at: "2026-07-20T00:00:00+08:00", is_accessible: true, notes: "internal source note" }],
    verification: { verification_status: "verified", verified_by: "manual", verified_at: "2026-07-20T00:00:00+08:00", source_conflict: false, conflict_notes: "internal conflict note", needs_recheck: false, recheck_after: null },
    seo: null,
    metadata: { created_at: "2026-07-01T00:00:00+08:00", updated_at: "2026-07-20T00:00:00+08:00", created_by: "secret-operator", updated_by: "secret-operator", first_discovered_at: "2026-07-01T00:00:00+08:00", last_checked_at: "2026-07-20T00:00:00+08:00", published_at: "2026-07-20T00:00:00+08:00", archived_at: null, data_version: "1.0", source_import_batch: "internal-batch" },
    duplicate_status: "unique", duplicate_of_id: null, merged_from_ids: [],
  } as IchOpportunity;
  return { ...base, ...overrides };
}

const unpublished = fixture({ id: "internal-ich-2", slug: "draft-opportunity", is_published: false });
const history = fixture({
  id: "internal-ich-3", slug: "history-opportunity", title: "已结束非遗展览",
  dates: { ...fixture().dates, deadline_at: "2026-01-01T00:00:00+08:00", deadline_text: "2026年1月1日" },
});
const entries = [fixture(), unpublished, history];
let loadCount = 0;
const store = {
  load(): IchStoreLoadResult {
    loadCount += 1;
    return { entries, invalidEntries: [], updatedAt: "2026-07-20T00:00:00+08:00" };
  },
} as IchOpportunityStore;
const fixedNow = () => new Date("2026-08-01T00:00:00+08:00");
const api = new Hono().route("/api/public/ich", publicIchRoutes({ store, now: fixedNow }));
const pages = new Hono().route("/ich", ichPagesRoutes({ store, now: fixedNow }));
const before = JSON.stringify(entries);

async function main(): Promise<void> {
console.log("\n[ICH Stage 2] Read-only API and SSR skeleton\n");

const listResponse = await api.request("/api/public/ich/opportunities");
const list = await listResponse.json() as Record<string, unknown>;
check("list API returns 200", listResponse.status === 200);
check("default list only includes current published opportunity", list.total === 1 && (list.items as unknown[]).length === 1);
check("GET requests do not mutate fixture data", JSON.stringify(entries) === before);

const combined = await (await api.request("/api/public/ich/opportunities?q=非物质文化遗产&category=exhibition_market&region=guangzhou&status=current")).json() as Record<string, unknown>;
check("combined filters and Chinese original-title search work", combined.total === 1);
const empty = await (await api.request("/api/public/ich/opportunities?q=不存在的机会")).json() as Record<string, unknown>;
check("empty result uses total_pages 0", empty.total === 0 && empty.total_pages === 0);
check("invalid enum returns fixed 400", (await api.request("/api/public/ich/opportunities?status=unknown")).status === 400);
check("page_size over 60 is rejected", (await api.request("/api/public/ich/opportunities?page_size=61")).status === 400);
check("unpublished detail returns 404", (await api.request("/api/public/ich/opportunities/draft-opportunity")).status === 404);

const detailResponse = await api.request("/api/public/ich/opportunities/guangzhou-ich-market");
const detailText = await detailResponse.text();
check("published detail returns 200", detailResponse.status === 200);
check("public JSON excludes internal id and operator metadata", !detailText.includes("internal-ich-1") && !detailText.includes("secret-operator"));
check("public JSON excludes source and conflict notes", !detailText.includes("internal source note") && !detailText.includes("internal conflict note"));

const homeResponse = await pages.request("/ich");
const home = await homeResponse.text();
check("SSR home initial HTML contains opportunity title", homeResponse.status === 200 && home.includes("广州非遗市集招募"));
check("SSR home includes canonical and OG metadata", home.includes('rel="canonical" href="/ich"') && home.includes('property="og:title"'));
check("SSR home contains internal detail link", home.includes('/ich/opportunities/guangzhou-ich-market'));

const detailPageResponse = await pages.request("/ich/opportunities/guangzhou-ich-market");
const detailPage = await detailPageResponse.text();
check("SSR detail includes organizer, status and official source", detailPage.includes("广州市非遗保护中心") && detailPage.includes("进行中") && detailPage.includes("官方公告"));
check("SSR unpublished detail is an HTML 404", (await pages.request("/ich/opportunities/draft-opportunity")).status === 404);
const historyPage = await (await pages.request("/ich/history")).text();
check("history page is explicit and has no immediate-action copy", historyPage.includes("历史非遗机会") && historyPage.includes("已结束非遗展览") && !historyPage.includes("立即报名"));

const emptyStore = { load: () => ({ entries: [], invalidEntries: [], updatedAt: null }) } as unknown as IchOpportunityStore;
const emptyPages = new Hono().route("/ich", ichPagesRoutes({ store: emptyStore, now: fixedNow }));
const emptyHome = await (await emptyPages.request("/ich")).text();
check("SSR formal empty state renders without fixture data", emptyHome.includes("暂无可展示机会") && emptyHome.includes("只在来源和基本信息达到发布条件后展示"));
check("route layer only invoked store.load", loadCount > 0 && JSON.stringify(entries) === before);

console.log(`\nICH Stage 2 result: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
