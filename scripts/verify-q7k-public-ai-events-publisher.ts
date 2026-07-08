import type { OpportunityCard } from "../src/schema/opportunity-card";
import type { StoreEntry } from "../src/agents/opportunity-store";
import { buildPublicAiEventFeed } from "../src/public/ai-events-publisher";
import type { PublicAiEventSampleRoomData } from "../src/demo/ai-events-sample-room";

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
const sourceImageCard = makeCard({
  title: "AI Event With Source Cover：带官网图片的赛事",
  official_source_url: "https://source-cover-ai-event.example.org/register",
  application_url: "https://source-cover-ai-event.example.org/register",
  deadline: "2026-09-01",
});
(sourceImageCard as OpportunityCard & Record<string, unknown>).coverImageUrl = "https://source-cover-ai-event.example.org/cover.jpg";
(sourceImageCard as OpportunityCard & Record<string, unknown>).imageSourceUrl = "https://source-cover-ai-event.example.org/cover.jpg";
(sourceImageCard as OpportunityCard & Record<string, unknown>).imageStatus = "source_image";
const sourceImageEntry = makeEntry(sourceImageCard, { dedup_key: "source-image-entry" });
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

const feed = buildPublicAiEventFeed([databaseEntry, sourceImageEntry, lowQualityEntry], undefined, {
  lifecycle: "current",
  page: 1,
  pageSize: 12,
  now: "2026-07-06T00:00:00.000Z",
});
const emptySeedData: PublicAiEventSampleRoomData = {
  items: [],
  sourceNetwork: [],
  stats: {
    candidateCount: 0,
    displayableCount: 0,
    sourceCount: 0,
    officialEntryCount: 0,
    needsReviewCount: 0,
    lastCheckedAt: "2026-07-06",
  },
};
const controlledImageFeed = buildPublicAiEventFeed([databaseEntry, sourceImageEntry], emptySeedData, {
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
check("public feed counts only real source images as image coverage", feed.stats.imageCoverageCount >= 1 && feed.items.some((item) => item.imageStatus === "source_image"), JSON.stringify(feed.stats));
check("placeholder covers are excluded from image coverage stats", controlledImageFeed.stats.imageCoverageCount === 1, JSON.stringify(controlledImageFeed.stats));
check("public feed exposes official and aggregation source stats", typeof feed.stats.officialSourceCount === "number" && typeof feed.stats.aggregatorSourceCount === "number" && feed.stats.aggregatorSourceCount >= 1, JSON.stringify(feed.stats));
check("public feed still tracks total fallback volume", feed.stats.totalCount >= 30, `total=${feed.stats.totalCount}`);
check("public feed exposes database count", feed.stats.databaseCount >= 1, JSON.stringify(feed.stats));
check("public feed exposes seed count", feed.stats.seedCount >= 20, JSON.stringify(feed.stats));
check("public feed exposes collection freshness schedule", feed.stats.lastCollectedAt === "2026-07-05" && feed.stats.updateCadenceDays === 3 && feed.stats.nextScheduledCollectionAt === "2026-07-08", JSON.stringify(feed.stats));
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

const unknownDeadlineFeed = buildPublicAiEventFeed([
  makeEntry(makeCard({
    title: "Unknown Deadline AI Event：未知截止时间",
    official_source_url: "https://unknown-deadline-ai-event.example.org/",
    deadline: "9999-12-31",
  }), { dedup_key: "unknown-deadline-entry" }),
], emptySeedData, {
  lifecycle: "current",
  page: 1,
  pageSize: 12,
  now: "2026-07-06T00:00:00.000Z",
});
check("unknown deadline sentinel is hidden from public display", unknownDeadlineFeed.items[0]?.deadlineDisplay === "见官网" && unknownDeadlineFeed.items[0]?.deadlineSortKey === "9999-12-31", JSON.stringify(unknownDeadlineFeed.items[0]));

const closedTitleFeed = buildPublicAiEventFeed([
  makeEntry(makeCard({
    title: "AI Agent 全球专项赛已截止：标题标记历史赛事",
    official_source_url: "https://closed-title-ai-event.example.org/",
    deadline: "9999-12-31",
  }), { dedup_key: "closed-title-entry" }),
], emptySeedData, {
  lifecycle: "historical",
  page: 1,
  pageSize: 12,
  now: "2026-07-06T00:00:00.000Z",
});
check("closed title signal moves unknown-date event to historical feed", closedTitleFeed.items.some((item) => item.title.includes("已截止") && item.lifecycleStatus === "historical"), JSON.stringify(closedTitleFeed.items));

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

const longRewardFeed = buildPublicAiEventFeed([
  makeEntry(makeCard({
    title: "AI 创作活动新闻：不应把整段报道当作奖金",
    official_source_url: "https://gov.example/news/ai-creator-report",
    reward_or_value: "本报讯，某地举行人工智能创作交流活动，现场提到奖金、展示、扶持等关键词，但报道主要介绍嘉宾发言、产业趋势、城市政策、观众互动和活动背景，并没有给出明确奖池、云资源或提交规则。",
  }), { dedup_key: "long-reward-entry" }),
], emptySeedData, {
  lifecycle: "current",
  page: 1,
  pageSize: 12,
  now: "2026-07-06T00:00:00.000Z",
});
check("long news reward text is replaced with official-site fallback", longRewardFeed.items[0]?.prize === "见官网" && !longRewardFeed.items[0]?.reward.includes("本报讯"), JSON.stringify(longRewardFeed.items[0]));

const longLaunchNewsRewardFeed = buildPublicAiEventFeed([
  makeEntry(makeCard({
    title: "超级智能体大赛新闻：不能把发布会正文当作奖励",
    official_source_url: "https://www.gd.gov.cn/news/ai-agent-contest",
    reward_or_value: "随着屏幕被点亮，首届超级智能体大赛正式启幕，全球报名通道同步上线；同一现场，人工智能产业代表介绍了城市政策、创业扶持、项目展示和赛事安排，但页面未直接列出明确奖金、奖池或云资源额度。",
  }), { dedup_key: "long-launch-news-reward-entry" }),
], emptySeedData, {
  lifecycle: "current",
  page: 1,
  pageSize: 12,
  now: "2026-07-06T00:00:00.000Z",
});
check("long launch-news reward text is not shown as prize", longLaunchNewsRewardFeed.items[0]?.prize === "见官网" && longLaunchNewsRewardFeed.items[0]?.benefits.length === 0, JSON.stringify(longLaunchNewsRewardFeed.items[0]));

const longPartnerEventRewardFeed = buildPublicAiEventFeed([
  makeEntry(makeCard({
    title: "AWS AI 开发者挑战观察源：不应把活动目录正文当作奖励",
    official_source_url: "https://aws.amazon.com/events/ai/",
    reward_or_value: "View upcoming AWS Partner Events AWS Partner Network programs and global developer activities. Browse cloud credits sessions, startup programs and event pages before checking whether any specific challenge lists rewards.",
  }), { dedup_key: "long-partner-event-reward-entry" }),
], emptySeedData, {
  lifecycle: "current",
  page: 1,
  pageSize: 12,
  now: "2026-07-06T00:00:00.000Z",
});
check("long partner-event body text is not shown as prize", longPartnerEventRewardFeed.items[0]?.prize === "见官网" && longPartnerEventRewardFeed.items[0]?.benefits.length === 0, JSON.stringify(longPartnerEventRewardFeed.items[0]));

const mediumLengthGenericValueFeed = buildPublicAiEventFeed([
  makeEntry(makeCard({
    title: "Microsoft Agentic AI Hackathon：不能把议程介绍当作奖励",
    official_source_url: "https://event.ithome.com.tw/ai-agent-hackathon",
    reward_or_value: "接著 Marco 和 Mads 將帶領您深入了解全新的 Agent Service，透過實際案例與最佳實務，展示如何在不同商業情境中導入 AI Agent",
  }), { dedup_key: "medium-generic-value-entry" }),
], emptySeedData, {
  lifecycle: "current",
  page: 1,
  pageSize: 12,
  now: "2026-07-06T00:00:00.000Z",
});
check("medium generic agenda text is not shown as prize", mediumLengthGenericValueFeed.items[0]?.prize === "见官网" && mediumLengthGenericValueFeed.items[0]?.benefits.length === 0, JSON.stringify(mediumLengthGenericValueFeed.items[0]));

const platformIntroRewardFeed = buildPublicAiEventFeed([
  makeEntry(makeCard({
    title: "AI Studio Competition Hub：不能把平台简介整段当作奖励",
    official_source_url: "https://aistudio.baidu.com/competition",
    reward_or_value: "飞桨星河社区比赛平台，是国内领先的AI及大数据竞赛平台，已举办数百场国际AI大赛，提供千万级总奖池，汇聚50万来自全球多国的精英开发者，培养上万名顶尖选手 · 奖金 / 社区资源",
  }), { dedup_key: "platform-intro-reward-entry" }),
], emptySeedData, {
  lifecycle: "current",
  page: 1,
  pageSize: 12,
  now: "2026-07-06T00:00:00.000Z",
});
check("platform intro reward text is shortened", platformIntroRewardFeed.items[0]?.prize === "奖金 / 社区资源" && !platformIntroRewardFeed.items[0]?.reward.includes("飞桨星河社区比赛平台"), JSON.stringify(platformIntroRewardFeed.items[0]));

const officialPriorityFeed = buildPublicAiEventFeed([
  makeEntry(makeCard({
    title: "GitHub AI competition awesome 聚合线索",
    type: "AI competition list",
    official_source_url: "https://github.com/topics/ai-competition",
    organizer: "GitHub",
    deadline: "见官网",
    backend_score: 99,
    opportunity_kind: "watch_signal",
  }), { dedup_key: "aggregation-lead-entry" }),
  makeEntry(makeCard({
    title: "DoraHacks AI Agent Hackathon 官方入口",
    type: "AI Hackathon",
    official_source_url: "https://dorahacks.io/hackathon/ai-agent",
    organizer: "DoraHacks",
    deadline: "见官网",
    backend_score: 70,
    opportunity_kind: "direct_opportunity",
  }), { dedup_key: "official-entry" }),
], emptySeedData, {
  lifecycle: "current",
  page: 1,
  pageSize: 12,
  now: "2026-07-06T00:00:00.000Z",
});
check("official concrete entry outranks aggregation lead when deadlines are unknown", officialPriorityFeed.items[0]?.title.includes("DoraHacks"), JSON.stringify(officialPriorityFeed.items.map((item) => ({ title: item.title, priority: item.priority, sourceType: item.sourceType }))));

const observationSourcePriorityFeed = buildPublicAiEventFeed([
  makeEntry(makeCard({
    title: "GitHub 开发者活动和 Hackathon 观察源",
    type: "AI Hackathon source directory",
    official_source_url: "https://github.com/topics/hackathon",
    organizer: "GitHub",
    deadline: "2026-07-16",
    backend_score: 99,
    opportunity_kind: "watch_signal",
  }), { dedup_key: "dated-observation-source-entry" }),
  makeEntry(makeCard({
    title: "Qwen Cloud AI Hackathon 官方报名入口",
    type: "AI Hackathon",
    official_source_url: "https://qwencloud-hackathon.devpost.com/",
    organizer: "Qwen Cloud / Devpost",
    deadline: "见官网",
    backend_score: 70,
    opportunity_kind: "direct_opportunity",
  }), { dedup_key: "concrete-event-entry" }),
], emptySeedData, {
  lifecycle: "current",
  page: 1,
  pageSize: 12,
  now: "2026-07-06T00:00:00.000Z",
});
check("concrete event entry outranks dated observation source", observationSourcePriorityFeed.items[0]?.title.includes("Qwen Cloud"), JSON.stringify(observationSourcePriorityFeed.items.map((item) => ({ title: item.title, deadline: item.deadlineDisplay, candidateType: item.candidateType, sourceType: item.sourceType }))));

const entryListPriorityFeed = buildPublicAiEventFeed([
  makeEntry(makeCard({
    title: "AWS AI 开发者挑战观察源",
    type: "AI Hackathon source",
    official_source_url: "https://aws.amazon.com/events/ai/",
    organizer: "AWS",
    deadline: "2026-12-04",
    backend_score: 99,
    opportunity_kind: "watch_signal",
  }), { dedup_key: "cloud-observation-source-entry" }),
  makeEntry(makeCard({
    title: "Devpost AI / Machine Learning Hackathon 入口",
    type: "AI Hackathon source entry",
    official_source_url: "https://devpost.com/hackathons?themes[]=Machine%20Learning%2FAI",
    organizer: "Devpost",
    deadline: "见官网",
    backend_score: 50,
    opportunity_kind: "watch_signal",
  }), { dedup_key: "hackathon-entry-list" }),
], emptySeedData, {
  lifecycle: "current",
  page: 1,
  pageSize: 12,
  now: "2026-07-06T00:00:00.000Z",
});
check("entry list outranks observation source in public feed", entryListPriorityFeed.items[0]?.title.includes("Devpost AI"), JSON.stringify(entryListPriorityFeed.items.map((item) => ({ title: item.title, deadline: item.deadlineDisplay, candidateType: item.candidateType }))));

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
