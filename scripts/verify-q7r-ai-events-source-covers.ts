import { getPublicAiEventSampleRoomData } from "../src/demo/ai-events-sample-room";
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

console.log("\n[Q7R AI Events Source Covers] platform-specific cover checks\n");

const seedData = getPublicAiEventSampleRoomData();
const feed = buildPublicAiEventFeed([], seedData, {
  lifecycle: "all",
  page: 1,
  pageSize: 60,
  now: "2026-07-06T00:00:00.000Z",
});

check("sample room feed has at least 45 source-backed AI event seeds", feed.stats.totalCount >= 45, `total=${feed.stats.totalCount}`);

const requiredSources = [
  { id: "codabench", label: "Codabench", domain: "codabench.org", cover: "/assets/ai-event-cover-codabench.svg" },
  { id: "evalai", label: "EvalAI", domain: "eval.ai", cover: "/assets/ai-event-cover-evalai.svg" },
  { id: "grand-challenge", label: "Grand Challenge", domain: "grand-challenge.org", cover: "/assets/ai-event-cover-grandchallenge.svg" },
  { id: "xfyun", label: "科大讯飞", domain: "xfyun.cn", cover: "/assets/ai-event-cover-xfyun.svg" },
  { id: "project-odyssey", label: "Project Odyssey", domain: "projectodyssey.ai", cover: "/assets/ai-event-cover-project-odyssey.svg" },
  { id: "reply", label: "Reply AI Film Festival", domain: "reply.com", cover: "/assets/ai-event-cover-reply.svg" },
];

const thirdBatchSources = [
  { id: "mlh", label: "Major League Hacking", domain: "mlh.io", cover: "/assets/ai-event-cover-mlh.svg" },
  { id: "tapnow", label: "TapNow", domain: "tapnow.com", cover: "/assets/ai-event-cover-aigc-video.svg" },
  { id: "pika", label: "Pika", domain: "pika.art", cover: "/assets/ai-event-cover-aigc-video.svg" },
  { id: "kling", label: "Kling", domain: "klingai.com", cover: "/assets/ai-event-cover-aigc-video.svg" },
  { id: "dreamina", label: "Dreamina", domain: "dreamina.jianying.com", cover: "/assets/ai-event-cover-dreamina.svg" },
  { id: "volcengine", label: "火山引擎", domain: "volcengine.com", cover: "/assets/ai-event-cover-volcengine.svg" },
  { id: "tencent-cloud", label: "腾讯云开发者", domain: "cloud.tencent.com", cover: "/assets/ai-event-cover-tencent-cloud.svg" },
];

for (const source of requiredSources) {
  const items = feed.items.filter((item) =>
    item.sourceDomain.includes(source.domain) ||
    item.officialUrl.includes(source.domain) ||
    item.title.toLowerCase().includes(source.label.toLowerCase()),
  );
  check(`${source.label} appears in public feed`, items.length > 0, source.domain);
  check(
    `${source.label} uses platform-specific cover`,
    items.some((item) => item.coverImageUrl === source.cover && item.imageStatus === "platform_placeholder"),
    JSON.stringify(items.map((item) => ({
      title: item.title,
      coverImageUrl: item.coverImageUrl,
      imageStatus: item.imageStatus,
    })).slice(0, 3)),
  );
}

for (const source of thirdBatchSources) {
  const sourceNetworkMatch = seedData.sourceNetwork.find((item) =>
    item.id === source.id ||
    item.domain === source.domain ||
    item.name.toLowerCase().includes(source.label.toLowerCase()),
  );
  check(`${source.label} is registered as third-batch source`, Boolean(sourceNetworkMatch), JSON.stringify(sourceNetworkMatch));
  const items = feed.items.filter((item) =>
    item.sourceDomain.includes(source.domain) ||
    item.officialUrl.includes(source.domain) ||
    item.sourceName.toLowerCase().includes(source.label.toLowerCase()) ||
    item.title.toLowerCase().includes(source.label.toLowerCase()),
  );
  check(`${source.label} appears in public feed`, items.length > 0, source.domain);
  check(
    `${source.label} uses third-batch platform cover`,
    items.some((item) => item.coverImageUrl === source.cover && item.imageStatus === "platform_placeholder"),
    JSON.stringify(items.map((item) => ({
      title: item.title,
      coverImageUrl: item.coverImageUrl,
      imageStatus: item.imageStatus,
    })).slice(0, 3)),
  );
}

const defaultPlaceholderCount = feed.items.filter((item) => item.imageStatus === "default_placeholder").length;
check("current public feed avoids default image placeholders", defaultPlaceholderCount === 0, `defaultPlaceholderCount=${defaultPlaceholderCount}`);
const defaultCoverUrlCount = feed.items.filter((item) => item.coverImageUrl === "/assets/ai-event-placeholder.svg").length;
check("current public feed avoids default cover URLs", defaultCoverUrlCount === 0, `defaultCoverUrlCount=${defaultCoverUrlCount}`);

const mlContestsSource = seedData.sourceNetwork.find((source) => source.domain === "mlcontests.com");
check("ML Contests remains a source-network aggregation lead", mlContestsSource?.trustTier === "aggregation_lead", JSON.stringify(mlContestsSource));
check("ML Contests aggregation lead is not forced into public opportunity cards", !feed.items.some((item) => item.sourceDomain === "mlcontests.com"));

console.log(`\nQ7R AI events source cover checks: ${passCount} PASS / ${failCount} FAIL`);

if (failCount > 0) {
  process.exit(1);
}
