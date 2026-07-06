import type { OpportunityCard } from "../src/schema/opportunity-card";
import type { StoreEntry } from "../src/agents/opportunity-store";
import { buildPublicAiEventFeed } from "../src/public/ai-events-publisher";
import { extractAiEventPageMetadata } from "../src/public/ai-event-page-metadata";

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
    title: "Qwen Cloud AI Hackathon",
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

function makeEntry(card: OpportunityCard, id: string): StoreEntry {
  return {
    card,
    radar_type: "ai_competition",
    added_at: "2026-07-05T10:00:00.000Z",
    updated_at: "2026-07-05T10:05:00.000Z",
    dedup_key: id,
    radarId: "radar-ai-events",
    radarIds: ["radar-ai-events"],
    contentHash: `hash-${id}`,
    changeRatio: 1,
    incremental: false,
  };
}

console.log("\n[Q7N AI Events Public Filters] Public feed metadata and filter checks\n");

const entries = [
  makeEntry(makeCard({
    title: "Guangzhou AI Agent Challenge",
    region: "大湾区 / 广州",
    deadline: "2026-07-20",
    reward_or_value: "奖金 20 万元，产品展示机会",
    official_source_url: "https://gz-ai-challenge.gov.cn/apply",
    application_url: "https://gz-ai-challenge.gov.cn/apply",
  }), "gba-cash"),
  makeEntry(makeCard({
    title: "Global Cloud Credits AI Buildathon",
    region: "全球线上",
    deadline: "2026-08-25",
    reward_or_value: "云资源 credits、API credits 和 Demo Day",
    official_source_url: "https://global-ai-buildathon.devpost.com/",
    application_url: "https://global-ai-buildathon.devpost.com/",
  }), "global-cloud"),
  makeEntry(makeCard({
    title: "US AI Startup Showcase",
    region: "United States / North America",
    deadline: "2026-10-15",
    reward_or_value: "showcase opportunity",
    official_source_url: "https://ai-startup-showcase.example.org/apply",
    application_url: "https://ai-startup-showcase.example.org/apply",
  }), "north-america-showcase"),
  makeEntry(makeCard({
    title: "Deadline Unknown AI Grant",
    region: "Europe",
    deadline: "见官网",
    reward_or_value: "grant and incubator support",
    official_source_url: "https://eu-ai-grant.example.org",
    application_url: "https://eu-ai-grant.example.org/apply",
  }), "deadline-unknown"),
];

const allFeed = buildPublicAiEventFeed(entries, { items: [], sourceNetwork: [], stats: {
  candidateCount: 0,
  displayableCount: 0,
  sourceCount: 0,
  officialEntryCount: 0,
  needsReviewCount: 0,
  lastCheckedAt: "2026-07-06",
} }, {
  lifecycle: "current",
  page: 1,
  pageSize: 20,
  now: "2026-07-06T00:00:00.000Z",
});

check("feed exposes region facets", Array.isArray(allFeed.stats.regionFacets) && allFeed.stats.regionFacets.length >= 3, JSON.stringify(allFeed.stats.regionFacets));
check("feed exposes reward facets", Array.isArray(allFeed.stats.rewardFacets) && allFeed.stats.rewardFacets.some((facet) => facet.id === "cash_prize"), JSON.stringify(allFeed.stats.rewardFacets));
check("feed exposes deadline window facets", Array.isArray(allFeed.stats.deadlineWindowFacets) && allFeed.stats.deadlineWindowFacets.some((facet) => facet.id === "30d"), JSON.stringify(allFeed.stats.deadlineWindowFacets));
check("cards expose normalized region group", allFeed.items.some((item) => item.regionGroup === "china_gba" && item.regionGroupLabel.includes("大湾区")), JSON.stringify(allFeed.items.map((item) => ({ title: item.title, regionGroup: item.regionGroup }))));
check("cards expose normalized deadline window", allFeed.items.some((item) => item.deadlineWindow === "30d"), JSON.stringify(allFeed.items.map((item) => ({ title: item.title, deadlineWindow: item.deadlineWindow }))));

const gbaCashFeed = buildPublicAiEventFeed(entries, undefined, {
  lifecycle: "current",
  region: "china_gba",
  reward: "cash_prize",
  deadlineWindow: "30d",
  page: 1,
  pageSize: 20,
  now: "2026-07-06T00:00:00.000Z",
});

check("region + reward + deadline filters narrow public feed", gbaCashFeed.items.length === 1 && gbaCashFeed.items[0]?.title === "Guangzhou AI Agent Challenge", JSON.stringify(gbaCashFeed.items.map((item) => item.title)));
check("global online filter works", buildPublicAiEventFeed(entries, undefined, {
  lifecycle: "current",
  region: "global_online",
  page: 1,
  pageSize: 20,
  now: "2026-07-06T00:00:00.000Z",
}).items.some((item) => item.title.includes("Global Cloud")), "missing global online event");
check("unknown deadline filter works", buildPublicAiEventFeed(entries, undefined, {
  lifecycle: "current",
  deadlineWindow: "unknown",
  page: 1,
  pageSize: 20,
  now: "2026-07-06T00:00:00.000Z",
}).items.some((item) => item.title.includes("Deadline Unknown")), "missing unknown deadline event");

const metadata = extractAiEventPageMetadata(`
<!doctype html>
<html>
  <head>
    <meta property="og:title" content="Q7N AI Event">
    <meta property="og:image:secure_url" content="/secure-cover.jpg">
    <meta name="prize" content="$50,000 prize pool and cloud credits">
    <meta name="event:deadline" content="August 15, 2026">
  </head>
  <body>
    <picture>
      <source srcset="/fallback-1200.webp 1200w, /fallback-800.webp 800w">
      <img alt="Fallback event cover" src="/fallback.jpg">
    </picture>
    <section style="background-image:url('/background-event.jpg')">Join the AI event.</section>
    <a href="/register">Register now</a>
  </body>
</html>
`, "https://events.example.com/page");

check("metadata extractor reads og:image:secure_url", metadata.coverImageUrl === "https://events.example.com/secure-cover.jpg", JSON.stringify(metadata));
check("metadata extractor reads prize-like meta", metadata.reward === "$50,000 prize pool and cloud credits", JSON.stringify(metadata));
check("metadata extractor reads event deadline meta", metadata.deadline === "2026-08-15", JSON.stringify(metadata));

const sourceOnlyMetadata = extractAiEventPageMetadata(`
<html><body>
  <picture>
    <source srcset="/source-1200.webp 1200w, /source-800.webp 800w">
  </picture>
</body></html>
`, "https://events.example.com/page");

check("metadata extractor falls back to picture source images", sourceOnlyMetadata.coverImageUrl === "https://events.example.com/source-1200.webp", JSON.stringify(sourceOnlyMetadata));

const longRewardFeed = buildPublicAiEventFeed([
  makeEntry(makeCard({
    title: "Tianchi Agent Builder Challenge",
    region: "中国",
    deadline: "见官网",
    reward_or_value: "欢迎来大家来天池参与天池大数据竞赛,进行真实业务场景演练,参与天池大赛还有机会获得百万奖金池",
    official_source_url: "https://tianchi.aliyun.com/competition/agent-builder",
    application_url: "https://tianchi.aliyun.com/competition/agent-builder",
  }), "long-reward"),
], { items: [], sourceNetwork: [], stats: {
  candidateCount: 0,
  displayableCount: 0,
  sourceCount: 0,
  officialEntryCount: 0,
  needsReviewCount: 0,
  lastCheckedAt: "2026-07-06",
} }, {
  lifecycle: "current",
  page: 1,
  pageSize: 10,
  now: "2026-07-06T00:00:00.000Z",
});
const longReward = longRewardFeed.items[0]?.reward ?? "";
check("long marketing reward text is compressed for public cards", longReward.length <= 30 && /奖金|奖池/.test(longReward), longReward);

if (failCount > 0) {
  console.error(`\nQ7N AI Events public filters failed: ${failCount} failed, ${passCount} passed.`);
  process.exit(1);
}

console.log(`\nQ7N AI Events public filters passed: ${passCount} passed, ${failCount} failed.`);
