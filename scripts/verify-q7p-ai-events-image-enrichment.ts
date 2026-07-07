import type { OpportunityCard } from "../src/schema/opportunity-card";
import type { StoreEntry } from "../src/agents/opportunity-store";
import { extractAiEventPageMetadata } from "../src/public/ai-event-page-metadata";
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
    title: "Legacy Logo Cover AI Hackathon",
    type: "AI Hackathon",
    organizer: "Hackathon Org",
    region: "全球线上",
    deadline: "2026-08-15",
    reward_or_value: "见官网",
    eligibility: "个人开发者、小团队、OPC 创业者",
    materials_required: "项目说明、Demo、提交作品链接",
    match_reason: "这是具体 AI 赛事入口，适合复核报名。",
    next_action: "打开官方赛事页查看报名要求。",
    official_source_url: "https://legacy-agent-hackathon.devpost.com/",
    application_url: "https://legacy-agent-hackathon.devpost.com/apply",
    contact_info: "以官网为准",
    risk_note: "以官网为准",
    backend_score: 86,
    visible_level: "A",
    status: "new",
    opportunity_kind: "direct_opportunity",
    evidence_status: "partially_verified",
    action_status: "prepare",
    data_mode: "live",
    ...overrides,
  };
}

function makeEntry(card: OpportunityCard): StoreEntry {
  return {
    card,
    radar_type: "ai_competition",
    added_at: "2026-07-06T00:00:00.000Z",
    updated_at: "2026-07-06T00:00:00.000Z",
    dedup_key: `dedup-${card.title}`,
    radarId: "ai-events-radar",
    radarIds: ["ai-events-radar"],
    contentHash: "hash",
    changeRatio: 1,
    incremental: false,
  };
}

console.log("\n[Q7P AI Events Image Enrichment] cover image extraction checks\n");

const imageSrcMetadata = extractAiEventPageMetadata(`
<!doctype html>
<html>
  <head>
    <title>AI Startup Challenge</title>
    <link rel="image_src" href="/assets/ai-startup-challenge-cover.jpg">
  </head>
  <body>
    <main>
      <h1>AI Startup Challenge</h1>
      <a href="/apply">Apply now</a>
    </main>
  </body>
</html>
`, "https://events.example.com/challenge");

check(
  "extracts legacy image_src link when social meta is absent",
  imageSrcMetadata.coverImageUrl === "https://events.example.com/assets/ai-startup-challenge-cover.jpg",
  JSON.stringify(imageSrcMetadata),
);

const noisyLogoMetadata = extractAiEventPageMetadata(`
<!doctype html>
<html>
  <head>
    <title>Global Agent Hackathon</title>
    <meta property="og:image" content="/favicon.png">
  </head>
  <body>
    <header><img src="/brand/logo.svg" alt="Brand logo"></header>
    <main>
      <section class="event-hero" style="background-image: url('/covers/global-agent-hackathon.webp')">
        <h1>Global Agent Hackathon</h1>
      </section>
      <a href="/register">Register now</a>
    </main>
  </body>
</html>
`, "https://hackathon.example.com/events/global-agent");

check(
  "ignores favicon/logo noise and prefers event hero artwork",
  noisyLogoMetadata.coverImageUrl === "https://hackathon.example.com/covers/global-agent-hackathon.webp",
  JSON.stringify(noisyLogoMetadata),
);

const lazyPictureMetadata = extractAiEventPageMetadata(`
<!doctype html>
<html>
  <body>
    <main>
      <picture>
        <source data-srcset="/images/agent-small.jpg 480w, /images/agent-wide.jpg 1600w" type="image/jpeg">
        <img src="/images/pixel.gif" data-original="/images/agent-card.jpg" alt="Agent hackathon cover">
      </picture>
    </main>
  </body>
</html>
`, "https://hackathon.example.com/events/lazy-agent");

check(
  "prefers largest lazy picture source over tracking or fallback pixels",
  lazyPictureMetadata.coverImageUrl === "https://hackathon.example.com/images/agent-wide.jpg",
  JSON.stringify(lazyPictureMetadata),
);

const embeddedScriptMetadata = extractAiEventPageMetadata(`
<!doctype html>
<html>
  <head><title>SuperAI NEXT Hackathon</title></head>
  <body>
    <script>
      window.__NUXT__ = {
        data: [{
          event: {
            title: "SuperAI NEXT Hackathon",
            banner: "https://cdn.dorahacks.io/static/hackathon/superai-next/banner.webp",
            cover: "https://cdn.dorahacks.io/static/hackathon/superai-next/card.png"
          }
        }]
      };
    </script>
  </body>
</html>
`, "https://dorahacks.io/hackathon/superai-next");

check(
  "extracts event banner images embedded in app payload scripts",
  embeddedScriptMetadata.coverImageUrl === "https://cdn.dorahacks.io/static/hackathon/superai-next/banner.webp",
  JSON.stringify(embeddedScriptMetadata),
);

const platformPayloadMetadata = extractAiEventPageMetadata(`
<!doctype html>
<html>
  <head><title>Qwen Cloud Global AI Hackathon</title></head>
  <body>
    <script id="__NEXT_DATA__" type="application/json">
      {
        "props": {
          "pageProps": {
            "hackathon": {
              "title": "Qwen Cloud Global AI Hackathon",
              "submission_deadline": "2026-08-08T23:59:00Z",
              "prize_amount": "$10,000 prize pool plus Qwen Cloud credits",
              "cover_image": "https://assets.devpost.com/qwen-cloud-hackathon/cover.png",
              "registration_url": "/submissions/new"
            },
            "event": {
              "deadline": "2026-08-08",
              "reward": "$10,000 prize pool"
            }
          }
        }
      }
    </script>
  </body>
</html>
`, "https://qwencloud-hackathon.devpost.com/");

check(
  "extracts deadline, reward and registration from Devpost-style app payload",
  platformPayloadMetadata.coverImageUrl === "https://assets.devpost.com/qwen-cloud-hackathon/cover.png"
    && platformPayloadMetadata.deadline === "2026-08-08"
    && platformPayloadMetadata.reward === "$10,000 prize pool plus Qwen Cloud credits"
    && platformPayloadMetadata.registrationUrl === "https://qwencloud-hackathon.devpost.com/submissions/new",
  JSON.stringify(platformPayloadMetadata),
);

const lablabPayloadMetadata = extractAiEventPageMetadata(`
<!doctype html>
<html>
  <head><title>Agent Builders Hackathon</title></head>
  <body>
    <script>
      self.__next_f.push([1, "deadline\\\":\\\"2026-09-12\\\",\\\"prize\\\":\\\"$5,000 + GPU credits\\\",\\\"coverImage\\\":\\\"https://cdn.lablab.ai/events/agent-builders/banner.webp\\\",\\\"applyUrl\\\":\\\"/event/agent-builders/register\\\""]);
    </script>
  </body>
</html>
`, "https://lablab.ai/event/agent-builders");

check(
  "extracts deadline, reward and registration from Lablab/Next payload fragments",
  lablabPayloadMetadata.coverImageUrl === "https://cdn.lablab.ai/events/agent-builders/banner.webp"
    && lablabPayloadMetadata.deadline === "2026-09-12"
    && lablabPayloadMetadata.reward === "$5,000 + GPU credits"
    && lablabPayloadMetadata.registrationUrl === "https://lablab.ai/event/agent-builders/register",
  JSON.stringify(lablabPayloadMetadata),
);

const jsonLdOfferMetadata = extractAiEventPageMetadata(`
<!doctype html>
<html>
  <head>
    <title>Agent Builder World Cup</title>
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Event",
        "name": "Agent Builder World Cup",
        "endDate": "2026-09-20T23:59:00+08:00",
        "image": {
          "url": "https://cdn.example.com/events/agent-world-cup/hero-cover.webp"
        },
        "offers": {
          "url": "https://agentworldcup.example.com/register",
          "name": "Register for the $50,000 prize pool"
        },
        "organizer": {
          "@type": "Organization",
          "name": "Agent World Cup"
        },
        "location": {
          "@type": "VirtualLocation",
          "url": "https://agentworldcup.example.com/live"
        }
      }
    </script>
  </head>
  <body></body>
</html>
`, "https://agentworldcup.example.com/");

check(
  "extracts JSON-LD event image, deadline, organizer, registration and offer reward",
  jsonLdOfferMetadata.coverImageUrl === "https://cdn.example.com/events/agent-world-cup/hero-cover.webp"
    && jsonLdOfferMetadata.deadline === "2026-09-20"
    && jsonLdOfferMetadata.registrationUrl === "https://agentworldcup.example.com/register"
    && jsonLdOfferMetadata.organizer === "Agent World Cup"
    && jsonLdOfferMetadata.region === "全球线上"
    && jsonLdOfferMetadata.reward === "Register for the $50,000 prize pool",
  JSON.stringify(jsonLdOfferMetadata),
);

const formDeadlineMetadata = extractAiEventPageMetadata(`
<!doctype html>
<html>
  <body>
    <main>
      <h1>AI Vibe Coding Challenge</h1>
      <form action="/submissions/new">
        <input name="deadline" value="Submission deadline: 2026/10/31">
        <button>Submit your project</button>
      </form>
      <p>Total prizes include RMB 100,000, cloud credits, and demo showcase.</p>
      <figure>
        <img data-src="/media/vibe-coding-challenge-poster.avif" alt="AI Vibe Coding Challenge poster">
      </figure>
    </main>
  </body>
</html>
`, "https://vibechallenge.example.cn/events/ai-vibe-coding");

check(
  "extracts form deadline, body reward and poster image from event pages",
  formDeadlineMetadata.deadline === "2026-10-31"
    && formDeadlineMetadata.reward === "Total prizes include RMB 100,000, cloud credits, and demo showcase"
    && formDeadlineMetadata.coverImageUrl === "https://vibechallenge.example.cn/media/vibe-coding-challenge-poster.avif",
  JSON.stringify(formDeadlineMetadata),
);

const logoOnlyMetadata = extractAiEventPageMetadata(`
<!doctype html>
<html>
  <head><meta property="og:image" content="/static/logo.png"></head>
  <body><img src="/static/favicon.ico"><img src="/static/avatar.png"></body>
</html>
`, "https://hackathon.example.com/events/logo-only");

check(
  "does not treat logo-only pages as having a usable source cover",
  !logoOnlyMetadata.coverImageUrl,
  JSON.stringify(logoOnlyMetadata),
);

const iconDirectoryMetadata = extractAiEventPageMetadata(`
<!doctype html>
<html>
  <head><meta property="og:image" content="https://cdn.example.com/site/icons/social/social.jpg"></head>
  <body><main><h1>AI Builder Challenge</h1></main></body>
</html>
`, "https://events.example.com/ai-builder");

check(
  "does not treat icons/social default images as usable event covers",
  !iconDirectoryMetadata.coverImageUrl,
  JSON.stringify(iconDirectoryMetadata),
);

const legacyLogoCard = makeCard() as OpportunityCard & Record<string, unknown>;
legacyLogoCard.coverImageUrl = "https://legacy-agent-hackathon.devpost.com/static/logo.png";
legacyLogoCard.imageStatus = "source_image";
legacyLogoCard.officialPageHtml = `
<!doctype html>
<html>
  <head><title>Legacy Logo Cover AI Hackathon</title></head>
  <body>
    <main>
      <section style="background-image:url('/covers/agent-hackathon-cover.jpg')">
        <h1>Legacy Logo Cover AI Hackathon</h1>
      </section>
      <a href="/apply">Apply now</a>
    </main>
  </body>
</html>
`;

const feed = buildPublicAiEventFeed([makeEntry(legacyLogoCard)], { items: [], sourceNetwork: [], stats: {
  candidateCount: 0,
  displayableCount: 0,
  sourceCount: 0,
  officialEntryCount: 0,
  needsReviewCount: 0,
  lastCheckedAt: "2026-07-06",
} }, {
  lifecycle: "current",
  page: 1,
  pageSize: 5,
  now: "2026-07-06T00:00:00.000Z",
});

check(
  "public feed replaces legacy stored logo covers with better page artwork",
  feed.items[0]?.coverImageUrl === "https://legacy-agent-hackathon.devpost.com/covers/agent-hackathon-cover.jpg",
  JSON.stringify(feed.items[0]),
);

const blockedPlatformCard = makeCard({
  title: "Global AI Hackathon Series with Qwen Cloud",
  official_source_url: "https://qwencloud-hackathon.devpost.com",
  application_url: "https://qwencloud-hackathon.devpost.com",
  organizer: "Devpost",
});
const blockedPlatformFeed = buildPublicAiEventFeed([makeEntry(blockedPlatformCard)], { items: [], sourceNetwork: [], stats: {
  candidateCount: 0,
  displayableCount: 0,
  sourceCount: 0,
  officialEntryCount: 0,
  needsReviewCount: 0,
  lastCheckedAt: "2026-07-06",
} }, {
  lifecycle: "current",
  page: 1,
  pageSize: 5,
  now: "2026-07-06T00:00:00.000Z",
});

check(
  "public feed uses platform cover for blocked priority AI event platforms",
  blockedPlatformFeed.items[0]?.coverImageUrl === "/assets/ai-event-cover-devpost.svg"
    && blockedPlatformFeed.items[0]?.imageStatus === "platform_placeholder",
  JSON.stringify(blockedPlatformFeed.items[0]),
);

const universityEventFeed = buildPublicAiEventFeed([makeEntry(makeCard({
  title: "关于举办2025首届全国人工智能应用创新大赛校赛的通知",
  organizer: "深圳技术大学",
  official_source_url: "https://design.sztu.edu.cn/info/1027/1044.htm",
  application_url: "https://design.sztu.edu.cn/info/1027/1044.htm",
  region: "中国 / 高校",
}))], { items: [], sourceNetwork: [], stats: {
  candidateCount: 0,
  displayableCount: 0,
  sourceCount: 0,
  officialEntryCount: 0,
  needsReviewCount: 0,
  lastCheckedAt: "2026-07-06",
} }, {
  lifecycle: "all",
  page: 1,
  pageSize: 5,
  now: "2026-07-06T00:00:00.000Z",
});

check(
  "university or government AI contest pages get competition platform cover fallback",
  universityEventFeed.items[0]?.coverImageUrl === "/assets/ai-event-cover-competition.svg"
    && universityEventFeed.items[0]?.imageStatus === "platform_placeholder",
  JSON.stringify(universityEventFeed.items[0]),
);

console.log(`\nQ7P AI Events image enrichment checks: ${passCount} PASS / ${failCount} FAIL`);
if (failCount > 0) {
  process.exit(1);
}
