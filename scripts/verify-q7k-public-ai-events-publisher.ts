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

const feed = buildPublicAiEventFeed([databaseEntry, lowQualityEntry]);
const serialized = JSON.stringify(feed);
const qwenItems = feed.items.filter((item) => /qwencloud-hackathon\.devpost\.com/i.test(item.officialUrl));
const firstItem = feed.items[0];

check("database cards are included before seed cards", firstItem?.publicSource === "database", firstItem ? JSON.stringify(firstItem).slice(0, 180) : "missing first item");
check("same official URL is deduplicated against seed candidate", qwenItems.length === 1, `count=${qwenItems.length}`);
check("hidden or non AI event entries are not published", !serialized.includes("AI 行业趋势文章"), serialized.slice(0, 180));
check("public card includes cover image field", typeof firstItem?.coverImageUrl === "string" && firstItem.coverImageUrl.length > 0, JSON.stringify(firstItem));
check("public card includes prize field", typeof firstItem?.prize === "string" && firstItem.prize.includes("奖金"), JSON.stringify(firstItem));
check("public card includes registration URL", firstItem?.registrationUrl === "https://qwencloud-hackathon.devpost.com/", JSON.stringify(firstItem));
check("public card includes organizer and region", firstItem?.organizer === "Qwen Cloud / Devpost" && firstItem?.region === "全球线上", JSON.stringify(firstItem));
check("public feed still keeps seed fallback volume", feed.stats.candidateCount >= 30, `count=${feed.stats.candidateCount}`);
check("public feed exposes database count", feed.stats.databaseCount >= 1, JSON.stringify(feed.stats));
check("public feed exposes seed count", feed.stats.seedCount >= 20, JSON.stringify(feed.stats));
check("internal radar IDs are hidden", !/radarId|radarIds|radar-internal-id|dedup_key|internal-dedup-key|contentHash|internal-content-hash/i.test(serialized));
check("API keys are hidden", !/API_KEY|SERPER_API_KEY|COMMERCIAL_LLM_API_KEY|CONTEST_LLM_API_KEY|sk-[A-Za-z0-9]/i.test(serialized));
check("public page can show safe evidence language", /待复核|搜索发现|partially_verified|needs_review|official_entry_to_review/i.test(serialized), serialized.slice(0, 180));

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
  const response = await app.request("/api/public/ai-events");
  const json = await response.json() as { success?: boolean; data?: { items?: Array<Record<string, unknown>>; stats?: Record<string, unknown> } };
  const apiSerialized = JSON.stringify(json);
  const firstApiItem = json.data?.items?.[0] ?? {};

  check("product API path returns 200", response.status === 200, `status=${response.status}`);
  check("product API path succeeds", json.success === true, apiSerialized.slice(0, 180));
  check("product API path reads opportunity store first", firstApiItem.publicSource === "database", JSON.stringify(firstApiItem).slice(0, 180));
  check("product API path includes stored card title", apiSerialized.includes("Stored AI Event：产品路径入库赛事"), apiSerialized.slice(0, 180));
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
