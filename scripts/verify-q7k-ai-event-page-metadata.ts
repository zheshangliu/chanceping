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
    title: "Qwen Cloud Hackathon：Build with Qwen",
    type: "AI Hackathon",
    organizer: "见官网",
    region: "见官网",
    deadline: "见官网",
    reward_or_value: "见官网",
    eligibility: "个人开发者、小团队、OPC 创业者",
    materials_required: "项目说明、Demo、提交作品链接",
    match_reason: "这是具体 AI 黑客松入口，适合 AI 产品创业者复核报名和提交作品。",
    next_action: "打开官方赛事页，查看报名入口、截止时间和提交要求。",
    official_source_url: "https://qwencloud-hackathon.devpost.com/",
    application_url: "",
    contact_info: "以官方页面为准",
    risk_note: "搜索发现不等于已核验事实，报名资格和奖项以官方页面为准。",
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

console.log("\n[Q7K AI Event Page Metadata] Official page extraction checks\n");

const qwenOfficialHtml = `
<!doctype html>
<html>
  <head>
    <title>Qwen Cloud Global AI Hackathon</title>
    <meta property="og:title" content="Qwen Cloud Global AI Hackathon">
    <meta property="og:image" content="/assets/qwen-hackathon-cover.jpg">
    <meta name="description" content="Submit AI agents by August 15, 2026. $99,000 prize pool, cloud credits, and global showcase opportunities.">
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Event",
        "name": "Qwen Cloud Global AI Hackathon",
        "endDate": "2026-08-15",
        "image": ["https://cdn.qwen.example/events/qwen-jsonld-cover.png"],
        "organizer": { "@type": "Organization", "name": "Qwen Cloud" },
        "location": { "@type": "VirtualLocation", "url": "https://qwencloud-hackathon.devpost.com/" },
        "offers": { "@type": "Offer", "url": "https://qwencloud-hackathon.devpost.com/register", "price": "0" }
      }
    </script>
  </head>
  <body>
    <main>
      <h1>Qwen Cloud Global AI Hackathon</h1>
      <a href="/register">Register now</a>
      <p>Submissions close on August 15, 2026.</p>
      <p>$99,000 prize pool plus Qwen Cloud credits and product showcase.</p>
    </main>
  </body>
</html>
`;

const extracted = extractAiEventPageMetadata(qwenOfficialHtml, "https://qwencloud-hackathon.devpost.com/");

check("extracts og:image and resolves relative URL", extracted.coverImageUrl === "https://qwencloud-hackathon.devpost.com/assets/qwen-hackathon-cover.jpg", JSON.stringify(extracted));
check("keeps image source as source_image", extracted.imageStatus === "source_image", JSON.stringify(extracted));
check("extracts deadline from JSON-LD or body", extracted.deadline === "2026-08-15", JSON.stringify(extracted));
check("extracts registration URL from JSON-LD offer", extracted.registrationUrl === "https://qwencloud-hackathon.devpost.com/register", JSON.stringify(extracted));
check("extracts prize or cloud reward text", /\$99,000|cloud credits|云资源/i.test(extracted.reward ?? ""), JSON.stringify(extracted));
check("extracts organizer from JSON-LD", extracted.organizer === "Qwen Cloud", JSON.stringify(extracted));

const jsonLdOnlyHtml = `
<html>
  <head>
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Event",
        "name": "AI Creator Challenge",
        "image": "https://creator.example/covers/creator.png",
        "startDate": "2026-09-01",
        "endDate": "2026-09-30"
      }
    </script>
  </head>
  <body><a href="https://creator.example/apply">Apply</a></body>
</html>
`;

const jsonLdOnly = extractAiEventPageMetadata(jsonLdOnlyHtml, "https://creator.example/events/ai-creator");
check("falls back to JSON-LD image when og:image missing", jsonLdOnly.coverImageUrl === "https://creator.example/covers/creator.png", JSON.stringify(jsonLdOnly));
check("extracts apply link when structured offer URL is absent", jsonLdOnly.registrationUrl === "https://creator.example/apply", JSON.stringify(jsonLdOnly));

const cardWithHtml = makeCard({
  official_source_url: "https://qwencloud-hackathon.devpost.com/",
  application_url: "",
  deadline: "见官网",
  reward_or_value: "见官网",
  organizer: "见官网",
} as Partial<OpportunityCard>) as OpportunityCard & { officialPageHtml?: string };
cardWithHtml.officialPageHtml = qwenOfficialHtml;

const feed = buildPublicAiEventFeed([makeEntry(cardWithHtml)], undefined, {
  lifecycle: "current",
  page: 1,
  pageSize: 12,
  now: "2026-07-06T00:00:00.000Z",
});
const item = feed.items[0];
const serialized = JSON.stringify(feed);

check("publisher applies extracted cover image to database card", item.coverImageUrl === "https://qwencloud-hackathon.devpost.com/assets/qwen-hackathon-cover.jpg", JSON.stringify(item));
check("publisher applies extracted deadline to sort key", item.deadlineSortKey === "2026-08-15" && item.deadlineDisplay === "2026-08-15", JSON.stringify(item));
check("publisher applies extracted registration URL", item.registrationUrl === "https://qwencloud-hackathon.devpost.com/register", JSON.stringify(item));
check("publisher applies extracted organizer", item.organizer === "Qwen Cloud", JSON.stringify(item));
check("publisher improves known fields with image and deadline", item.knownFields.includes("赛事图片") && item.knownFields.includes("截止时间"), JSON.stringify(item.knownFields));
check("publisher never exposes raw official HTML", !/<script|Register now|officialPageHtml/i.test(serialized), serialized.slice(0, 240));

console.log(`\nQ7K AI event page metadata checks: ${passCount} PASS / ${failCount} FAIL`);
if (failCount > 0) {
  process.exit(1);
}
