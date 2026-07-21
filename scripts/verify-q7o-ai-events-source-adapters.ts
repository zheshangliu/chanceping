import type { OpportunityCard } from "../src/schema/opportunity-card";
import type { StoreEntry } from "../src/agents/opportunity-store";
import { buildPublicAiEventFeed } from "../src/public/ai-events-publisher";
import { AI_EVENT_SOURCE_NETWORK } from "../src/demo/ai-events-sample-room";

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
    title: "AI Hackathon",
    type: "AI Hackathon",
    organizer: "Official AI Event",
    region: "全球线上",
    deadline: "见官网",
    reward_or_value: "奖金、云资源和展示机会",
    eligibility: "个人开发者、小团队、OPC 创业者",
    materials_required: "Demo、项目说明、提交作品链接",
    match_reason: "这是 AI 赛事雷达发现的具体赛事入口，适合复核报名和提交作品。",
    next_action: "打开官方赛事页，确认报名入口、截止时间和提交要求。",
    official_source_url: "https://deadline-ai-event.example.org/",
    application_url: "https://deadline-ai-event.example.org/apply",
    contact_info: "以官方页面为准",
    risk_note: "搜索发现不等于已核验事实，报名资格和奖项以官网为准。",
    backend_score: 88,
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
    added_at: "2026-07-06T10:00:00.000Z",
    updated_at: "2026-07-06T10:05:00.000Z",
    dedup_key: id,
    radarId: "radar-ai-events",
    radarIds: ["radar-ai-events"],
    contentHash: `hash-${id}`,
    changeRatio: 1,
    incremental: false,
  };
}

console.log("\n[Q7O AI Events Source Adapters] Deadline and source registry checks\n");

const entries = [
  makeEntry(makeCard({
    title: "👉（6.16-7.15必看）大赛报名指南 - TRAE 官方中文社区",
    organizer: "TRAE 官方中文社区",
    official_source_url: "https://forum.trae.cn/ai-contest-guide",
    application_url: "https://forum.trae.cn/ai-contest-guide",
    match_reason: "这是 TRAE AI 创造力大赛报名指南，适合复核报名入口和提交规则。",
  }), "zh-date-range"),
  makeEntry(makeCard({
    title: "湾区 AI Agent 黑客松 7月31日截止报名",
    region: "大湾区 / 广州",
    official_source_url: "https://gz-ai-hackathon.gov.cn/apply",
    application_url: "https://gz-ai-hackathon.gov.cn/apply",
  }), "zh-month-day"),
  makeEntry(makeCard({
    title: "Global AI Buildathon",
    deadline: "Applications close August 15, 2026",
    official_source_url: "https://global-ai-buildathon.devpost.com/",
    application_url: "https://global-ai-buildathon.devpost.com/",
  }), "en-month-day"),
  makeEntry(makeCard({
    title: "AI 创业者雷达 Demo：未来 30-60 天可报名机会",
    deadline: "见官网",
    official_source_url: "https://unknown-date-ai-event.example.org/",
    application_url: "https://unknown-date-ai-event.example.org/",
  }), "unknown-date-no-false-positive"),
];

const feed = buildPublicAiEventFeed(entries, {
  items: [],
  sourceNetwork: AI_EVENT_SOURCE_NETWORK,
  stats: {
    candidateCount: 0,
    displayableCount: 0,
    sourceCount: AI_EVENT_SOURCE_NETWORK.length,
    officialEntryCount: 0,
    needsReviewCount: 0,
    lastCheckedAt: "2026-07-06",
  },
}, {
  lifecycle: "current",
  page: 1,
  pageSize: 20,
  now: "2026-07-06T00:00:00.000Z",
});

const byTitle = (snippet: string) => feed.items.find((item) => item.title.includes(snippet));
const trae = byTitle("6.16-7.15");
const gba = byTitle("7月31日");
const global = byTitle("Global AI Buildathon");
const unknown = byTitle("30-60");

check("Chinese numeric date range infers last date as deadline", trae?.deadlineSortKey === "2026-07-15" && trae.deadlineDisplay === "2026-07-15", JSON.stringify(trae));
check("Chinese month-day deadline is normalized", gba?.deadlineSortKey === "2026-07-31" && gba.deadlineDisplay === "2026-07-31", JSON.stringify(gba));
check("English close date is normalized", global?.deadlineSortKey === "2026-08-15" && global.deadlineDisplay === "2026-08-15", JSON.stringify(global));
check("relative 30-60 day phrasing does not create a fake deadline", unknown?.deadlineSortKey === "9999-12-31" && unknown.deadlineDisplay === "见官网", JSON.stringify(unknown));
check("deadline window facets move inferred dates out of unknown", feed.stats.deadlineWindowFacets.some((facet) => facet.id === "30d" && facet.count >= 2), JSON.stringify(feed.stats.deadlineWindowFacets));

const sourceText = AI_EVENT_SOURCE_NETWORK.map((source) => `${source.id} ${source.name} ${source.domain} ${source.trustTier}`).join(" | ");
check("CompeteHub remains an aggregation lead source, not official truth", /competehub.*aggregation_lead/i.test(sourceText), sourceText);
check("Arenix remains an aggregation benchmark source, not official truth", /arenix.*aggregation_lead/i.test(sourceText), sourceText);
check("source registry keeps official-first sources separate", AI_EVENT_SOURCE_NETWORK.some((source) => source.trustTier === "official_first") && AI_EVENT_SOURCE_NETWORK.some((source) => source.trustTier === "aggregation_lead"), sourceText);

const nextBatchSources = [
  { id: "challengerocket", domain: "challengerocket.com", expectedTier: "platform_index" },
  { id: "hackster", domain: "hackster.io", expectedTier: "platform_index" },
  { id: "replit", domain: "replit.com", expectedTier: "official_first" },
];

for (const expected of nextBatchSources) {
  const source = AI_EVENT_SOURCE_NETWORK.find((item) => item.id === expected.id);
  check(`next-batch source ${expected.id} is registered`, Boolean(source), JSON.stringify(AI_EVENT_SOURCE_NETWORK.map((item) => item.id)));
  check(
    `next-batch source ${expected.id} has correct domain and trust tier`,
    source?.domain === expected.domain && source.trustTier === expected.expectedTier,
    JSON.stringify(source),
  );
}

if (failCount > 0) {
  console.error(`\nQ7O source adapter checks failed: ${failCount} failed, ${passCount} passed.`);
  process.exit(1);
}

console.log(`\nQ7O source adapter checks passed: ${passCount} passed, ${failCount} failed.`);
