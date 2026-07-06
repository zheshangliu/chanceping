import type { OpportunityCard } from "../src/schema/opportunity-card";
import type { StoreEntry } from "../src/agents/opportunity-store";
import { buildPublicAiEventFeed } from "../src/public/ai-events-publisher";

let passCount = 0;
let failCount = 0;

function check(name: string, condition: boolean, detail = ""): void {
  if (condition) {
    passCount += 1;
    console.log(`[PASS] ${name}`);
  } else {
    failCount += 1;
    console.error(`[FAIL] ${name}${detail ? `: ${detail}` : ""}`);
  }
}

function makeCard(overrides: Partial<OpportunityCard> = {}): OpportunityCard {
  return {
    title: "Qwen Cloud Hackathon：Build with Qwen",
    type: "AI Hackathon",
    organizer: "Qwen Cloud / Devpost",
    region: "全球线上",
    deadline: "2026-08-15",
    reward_or_value: "奖金池、云资源和项目展示机会",
    eligibility: "个人开发者、小团队、OPC 创业者",
    materials_required: "项目说明、Demo、提交作品链接",
    match_reason: "这是具体 AI 黑客松入口，适合 AI 产品创业者复核报名和提交作品。",
    next_action: "打开官方赛事页，复核报名入口、截止时间和提交要求。",
    official_source_url: "https://qwencloud-hackathon.devpost.com/",
    application_url: "https://qwencloud-hackathon.devpost.com/",
    contact_info: "以官方页面为准",
    risk_note: "搜索发现不等于已核验事实，报名资格和奖项需复核。",
    backend_score: 93,
    visible_level: "A",
    status: "new",
    opportunity_kind: "direct_opportunity",
    evidence_status: "partially_verified",
    action_status: "prepare",
    data_mode: "live",
    ...overrides,
  };
}

function makeEntry(card: OpportunityCard, overrides: Partial<StoreEntry> = {}): StoreEntry {
  return {
    card,
    radar_type: "ai_competition",
    added_at: "2026-07-05T10:00:00.000Z",
    updated_at: "2026-07-05T10:05:00.000Z",
    dedup_key: "internal-dedup-key",
    radarId: "radar-internal-id",
    radarIds: ["radar-internal-id"],
    contentHash: "internal-content-hash",
    changeRatio: 1,
    incremental: false,
    ...overrides,
  };
}

console.log("\n[Q7K Public AI Events Publisher] Database-first public feed checks\n");

const databaseEntry = makeEntry(makeCard());
const lowQualityEntry = makeEntry(
  makeCard({
    title: "AI 行业趋势文章：没有报名入口",
    official_source_url: "https://example.com/ai-news",
    visible_level: "D",
    opportunity_kind: "watch_signal",
    evidence_status: "unverified",
  }),
  { dedup_key: "hidden-entry", radar_type: "custom" },
);

const feed = buildPublicAiEventFeed([databaseEntry, lowQualityEntry], undefined, {
  lifecycle: "current",
  page: 1,
  pageSize: 12,
  now: "2026-07-06T00:00:00.000Z",
});
const serialized = JSON.stringify(feed);
const qwenItems = feed.items.filter((item) => /qwencloud-hackathon\.devpost\.com/i.test(item.officialUrl));
const firstItem = feed.items[0];

check("database cards are included before seed cards", firstItem?.publicSource === "database", firstItem ? JSON.stringify(firstItem).slice(0, 180) : "missing first item");
check("same official URL is deduplicated against seed candidate", qwenItems.length === 1, `count=${qwenItems.length}`);
check("hidden or non AI event entries are not published", !serialized.includes("AI 行业趋势文章"), serialized.slice(0, 180));
check("public card includes cover image field", typeof firstItem?.coverImageUrl === "string" && firstItem.coverImageUrl.length > 0, JSON.stringify(firstItem));
check("public card includes image source metadata", typeof firstItem?.imageSourceUrl === "string" && firstItem.imageSourceUrl.length > 0 && typeof firstItem?.imageStatus === "string" && firstItem.imageStatus.length > 0, JSON.stringify(firstItem));
check("public card includes prize field", typeof firstItem?.prize === "string" && firstItem.prize.includes("奖金"), JSON.stringify(firstItem));
check("public card includes registration URL", firstItem?.registrationUrl === "https://qwencloud-hackathon.devpost.com/", JSON.stringify(firstItem));
check("public card includes organizer and region", firstItem?.organizer === "Qwen Cloud / Devpost" && firstItem?.region === "全球线上", JSON.stringify(firstItem));
check("public card deadline sort key keeps local date", firstItem?.deadlineSortKey === "2026-08-15", JSON.stringify(firstItem));
check("public card includes event mode display", firstItem?.eventMode === "online" && firstItem?.eventModeLabel === "线上", JSON.stringify(firstItem));
check("public card includes participant type labels", Array.isArray(firstItem?.participantTypes) && firstItem.participantTypes.includes("individual") && firstItem.participantTypes.includes("team") && firstItem.participantTypeLabel.includes("个人开发者"), JSON.stringify(firstItem));
check("public card includes reward type labels", Array.isArray(firstItem?.rewardTypes) && firstItem.rewardTypes.includes("cash_prize") && firstItem.rewardTypes.includes("cloud_credits") && firstItem.rewardTypeLabel.includes("奖金"), JSON.stringify(firstItem));
check("public card includes organizer type", firstItem?.organizerType === "hackathon_platform" && firstItem?.organizerTypeLabel.includes("Hackathon"), JSON.stringify(firstItem));
check("public card includes field completeness", typeof firstItem?.fieldCompleteness === "number" && firstItem.fieldCompleteness >= 70 && Array.isArray(firstItem?.knownFields) && firstItem.knownFields.includes("报名入口"), JSON.stringify(firstItem));
check("public card is marked current", firstItem?.lifecycleStatus === "current", JSON.stringify(firstItem));
check("public card includes a primary AI event category", firstItem?.primaryCategory?.id === "ai_agent", JSON.stringify(firstItem));
check("public card includes multi-dimensional category tags", Array.isArray(firstItem?.categoryTags) && firstItem.categoryTags.some((tag) => tag.id === "ai_hackathon") && firstItem.categoryTags.some((tag) => tag.id === "cloud_startup"), JSON.stringify(firstItem));
check("public feed paginates items", feed.items.length <= 12 && feed.stats.page === 1 && feed.stats.pageSize === 12, JSON.stringify(feed.stats));
check("public feed exposes category facets", Array.isArray(feed.stats.categoryFacets) && feed.stats.categoryFacets.some((facet) => facet.id === "ai_agent" && facet.count > 0), JSON.stringify(feed.stats.categoryFacets));
check("public feed exposes image coverage stats", typeof feed.stats.imageCoverageCount === "number" && feed.stats.imageCoverageCount >= 1, JSON.stringify(feed.stats));
check("public feed exposes official and aggregation source stats", typeof feed.stats.officialSourceCount === "number" && typeof feed.stats.aggregatorSourceCount === "number" && feed.stats.aggregatorSourceCount >= 1, JSON.stringify(feed.stats));
check("public feed still tracks total fallback volume", feed.stats.totalCount >= 30, `total=${feed.stats.totalCount}`);
check("public feed exposes database count", feed.stats.databaseCount >= 1, JSON.stringify(feed.stats));
check("public feed exposes seed count", feed.stats.seedCount >= 20, JSON.stringify(feed.stats));
check("internal radar IDs are hidden", !/radarId|radarIds|radar-internal-id|dedup_key|internal-dedup-key|contentHash|internal-content-hash/i.test(serialized));
check("API keys are hidden", !/API_KEY|SERPER_API_KEY|COMMERCIAL_LLM_API_KEY|CONTEST_LLM_API_KEY|sk-[A-Za-z0-9]/i.test(serialized));
check("public feed does not push review burden to users", !/待复核|needs_review|review required|needs review/i.test(serialized), serialized.slice(0, 180));

const historicalFeed = buildPublicAiEventFeed([
  makeEntry(makeCard({
    title: "Historical AI Event：已过期赛事",
    official_source_url: "https://historical-ai-event.example.org/",
    deadline: "2026-01-10",
    status: "expired",
  }), { dedup_key: "historical-entry" }),
], undefined, {
  lifecycle: "historical",
  page: 1,
  pageSize: 12,
  now: "2026-07-06T00:00:00.000Z",
});
check("historical feed contains expired opportunities", historicalFeed.items.some((item) => item.lifecycleStatus === "historical" && item.title.includes("Historical AI Event")), JSON.stringify(historicalFeed.items.slice(0, 3)));

const creatorFeed = buildPublicAiEventFeed([
  makeEntry(makeCard({
    title: "AI Creator Challenge：短视频与自媒体创作赛",
    type: "AIGC Creator Challenge",
    official_source_url: "https://creator-ai-challenge.example.org/",
    reward_or_value: "奖金、曝光和品牌展示机会",
  }), { dedup_key: "creator-entry" }),
  makeEntry(makeCard({
    title: "AI Game Jam：NPC 与游戏智能体挑战",
    type: "AI Game Jam",
    official_source_url: "https://ai-game-jam.example.org/",
  }), { dedup_key: "game-entry" }),
], undefined, {
  lifecycle: "current",
  category: "aigc_creator",
  page: 1,
  pageSize: 12,
  now: "2026-07-06T00:00:00.000Z",
});
check("category filter returns matching creator opportunities", creatorFeed.items.some((item) => item.primaryCategory.id === "aigc_creator" || item.categoryTags.some((tag) => tag.id === "aigc_creator")), JSON.stringify(creatorFeed.items.slice(0, 5)));
check("category filter excludes unrelated game-only opportunities", !creatorFeed.items.some((item) => item.title.includes("AI Game Jam")), JSON.stringify(creatorFeed.items.slice(0, 5)));

async function runProductApiPathCheck(): Promise<void> {
  process.env.DATA_MODE = "mock";
  process.env.LLM_MODE = "mock";
  process.env.STORE_TYPE = "meili";
  process.env.MEILI_MOCK = "true";

  const { createApp } = await import("../src/api/app");
  const { createAppContext } = await import("../src/api/context");
  const ctx = createAppContext();
  const apiCard = makeCard({
    title: "Stored AI Event：产品路径入库赛事",
    official_source_url: "https://stored-ai-event.example.org/register",
    application_url: "https://stored-ai-event.example.org/register",
    organizer: "Stored AI Event Organizer",
    reward_or_value: "奖金池和展示机会待复核",
  });
  ctx.store.addBatch([apiCard], "ai_competition", "radar-product-path");

  const app = createApp(ctx);
  const response = await app.request("/api/public/ai-events?status=current&page=1&page_size=12");
  const json = await response.json() as { success?: boolean; data?: { items?: Array<Record<string, unknown>>; stats?: Record<string, unknown> } };
  const apiSerialized = JSON.stringify(json);
  const firstApiItem = json.data?.items?.[0] ?? {};

  check("product API path returns 200", response.status === 200, `status=${response.status}`);
  check("product API path succeeds", json.success === true, apiSerialized.slice(0, 180));
  check("product API path reads opportunity store first", firstApiItem.publicSource === "database", JSON.stringify(firstApiItem).slice(0, 180));
  check("product API path includes stored card title", apiSerialized.includes("Stored AI Event：产品路径入库赛事"), apiSerialized.slice(0, 180));
  check("product API path returns pagination", Number(json.data?.stats?.page) === 1 && Number(json.data?.stats?.pageSize) === 12, JSON.stringify(json.data?.stats));
  check("product API path returns category facets", Array.isArray(json.data?.stats?.categoryFacets) && json.data.stats.categoryFacets.length > 0, JSON.stringify(json.data?.stats));
  check("product API path returns rich AI event fields", typeof firstApiItem.eventModeLabel === "string" && typeof firstApiItem.participantTypeLabel === "string" && typeof firstApiItem.rewardTypeLabel === "string" && typeof firstApiItem.organizerTypeLabel === "string", JSON.stringify(firstApiItem).slice(0, 220));
  check("product API path returns image metadata fields", typeof firstApiItem.imageSourceUrl === "string" && typeof firstApiItem.imageStatus === "string", JSON.stringify(firstApiItem).slice(0, 220));
  check("product API path hides radar internals", !/radar-product-path|radarId|radarIds|dedup_key|contentHash/i.test(apiSerialized), apiSerialized.slice(0, 180));
}

runProductApiPathCheck()
  .then(() => {
    console.log(`\nQ7K public publisher checks: ${passCount} PASS / ${failCount} FAIL`);
    if (failCount > 0) {
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
