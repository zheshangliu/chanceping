import fs from "fs";
import path from "path";
import { LocalFileStore } from "../src/agents/opportunity-store";
import { buildPublicAiEventFeed } from "../src/public/ai-events-publisher";
import {
  hydratePublicAiEventImages,
  PUBLIC_AI_EVENTS_RADAR_ID,
  syncAndHydratePublicAiEventsToStore,
  syncPublicAiEventsToStore,
} from "../src/public/ai-events-store-sync";

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

function cardExtras(card: unknown): Record<string, unknown> {
  return card as Record<string, unknown>;
}

console.log("\n[Q7K AI Events Store Sync] Public feed to opportunity store checks\n");

const tmpDir = path.resolve(process.cwd(), "data", ".tmp");
fs.mkdirSync(tmpDir, { recursive: true });
const storePath = path.join(tmpDir, "q7k-ai-events-store-sync.json");
if (fs.existsSync(storePath)) {
  fs.rmSync(storePath);
}

const store = new LocalFileStore({ file_path: storePath, auto_flush: false });
const referenceNow = "2026-07-06T00:00:00.000Z";
const feedBeforeSync = buildPublicAiEventFeed([], undefined, {
  lifecycle: "all",
  page: 1,
  pageSize: 60,
  now: referenceNow,
});

const result = syncPublicAiEventsToStore(store, undefined, { now: referenceNow });
const publicRadarEntries = store.list({
  radarId: PUBLIC_AI_EVENTS_RADAR_ID,
  page: 1,
  page_size: 1000,
  sort_by: "deadline",
  sort_order: "asc",
}).entries;
const serialized = JSON.stringify(publicRadarEntries);

check("sync returns public radar id", result.radarId === PUBLIC_AI_EVENTS_RADAR_ID, JSON.stringify(result));
check("sync imports public feed candidates", result.syncedCount >= feedBeforeSync.stats.filteredCount, JSON.stringify(result));
check("public radar query sees synced entries", publicRadarEntries.length >= feedBeforeSync.stats.filteredCount, `entries=${publicRadarEntries.length}, feed=${feedBeforeSync.stats.filteredCount}`);
check("each synced entry includes public radar id", publicRadarEntries.every((entry) => entry.radarIds?.includes(PUBLIC_AI_EVENTS_RADAR_ID)), publicRadarEntries.slice(0, 3).map((entry) => JSON.stringify(entry.radarIds)).join("; "));
check("synced cards remain AI competition radar type", publicRadarEntries.every((entry) => entry.radar_type === "ai_competition"), publicRadarEntries.slice(0, 3).map((entry) => entry.radar_type).join(", "));
check("synced cards expose official source URLs", publicRadarEntries.every((entry) => entry.card.official_source_url.startsWith("http")), publicRadarEntries.slice(0, 3).map((entry) => entry.card.official_source_url).join(", "));
check("synced cards keep public image metadata", publicRadarEntries.every((entry) => typeof cardExtras(entry.card).coverImageUrl === "string" && typeof cardExtras(entry.card).imageStatus === "string"), serialized.slice(0, 240));
check("synced cards keep event metadata", publicRadarEntries.every((entry) => typeof cardExtras(entry.card).eventModeLabel === "string" && typeof cardExtras(entry.card).participantTypeLabel === "string" && typeof cardExtras(entry.card).rewardTypeLabel === "string"), serialized.slice(0, 240));
check("synced cards do not push review burden wording into public-facing fields", !/待复核|needs_review|needs review|review required/i.test(serialized), serialized.slice(0, 240));
check("sync reports real image coverage separately", typeof result.imageCoverageCount === "number" && result.imageCoverageCount >= 0, JSON.stringify(result));

  const publicRouteSource = fs.readFileSync(path.resolve(process.cwd(), "src/api/routes/public-ai-events.ts"), "utf8");
  const imageSyncSource = fs.readFileSync(path.resolve(process.cwd(), "src/public/ai-events-store-sync.ts"), "utf8");
  check("public AI events route reads from public radar store", publicRouteSource.includes("PUBLIC_AI_EVENTS_RADAR_ID") && publicRouteSource.includes("listPublicAiEventEntries") && publicRouteSource.includes("syncPublicAiEventsToStore"));
  check("public AI events route keeps source network but not duplicate seed cards", publicRouteSource.includes("items: []") && publicRouteSource.includes("getPublicAiEventSampleRoomData"));
  check("image hydration default can process the second batch", /parsePositiveInt\(c\.req\.query\("limit"\),\s*30,\s*120\)/.test(publicRouteSource) && /DEFAULT_IMAGE_HYDRATION_LIMIT\s*=\s*30/.test(imageSyncSource), "expected default 30 and max 120 for image hydration");
check("sync API exposes opt-in image hydration through update pipeline", /hydrate_images/.test(publicRouteSource) && /image_limit/.test(publicRouteSource) && /runPublicAiEventsUpdatePipeline/.test(publicRouteSource), "expected sync route to support hydrate_images and image_limit through update pipeline");

const totalAfterFirstSync = store.list({
  radarId: PUBLIC_AI_EVENTS_RADAR_ID,
  page: 1,
  page_size: 1000,
}).total;
const result2 = syncPublicAiEventsToStore(store, undefined, { now: referenceNow });
const totalAfterSecondSync = store.list({
  radarId: PUBLIC_AI_EVENTS_RADAR_ID,
  page: 1,
  page_size: 1000,
}).total;

check("sync is idempotent", totalAfterSecondSync === totalAfterFirstSync, `first=${totalAfterFirstSync}, second=${totalAfterSecondSync}, result=${JSON.stringify(result2)}`);

async function runImageHydrationCheck(): Promise<void> {
  const hydrated = await hydratePublicAiEventImages(store, {
    limit: 1,
    fetchHtml: async () => `
      <html>
        <head>
          <meta property="og:title" content="Hydrated AI Event" />
          <meta property="og:image" content="https://official-ai-event.example.org/cover.png" />
          <meta name="prize" content="Total prizes include RMB 100,000, cloud credits, and demo showcase for selected builders." />
        </head>
        <body><a href="/register">Register now</a></body>
      </html>
    `,
  });
  const hydratedEntries = store.list({
    radarId: PUBLIC_AI_EVENTS_RADAR_ID,
    page: 1,
    page_size: 1000,
  }).entries;
  check("image hydrator writes source image metadata", hydrated.hydratedCount === 1 && hydratedEntries.some((entry) => cardExtras(entry.card).imageStatus === "source_image" && cardExtras(entry.card).coverImageUrl === "https://official-ai-event.example.org/cover.png"), JSON.stringify(hydrated));
  check(
    "image hydrator compresses long reward metadata before backend write",
    hydratedEntries.some((entry) => {
      const extras = cardExtras(entry.card);
      return typeof entry.card.reward_or_value === "string"
        && entry.card.reward_or_value.length <= 30
        && /云资源|展示机会|奖金/.test(entry.card.reward_or_value)
        && extras.prize === entry.card.reward_or_value;
    }),
    JSON.stringify(hydratedEntries.map((entry) => ({
      title: entry.card.title,
      reward: entry.card.reward_or_value,
      prize: cardExtras(entry.card).prize,
    })).slice(0, 5)),
  );

  const combinedStorePath = path.join(tmpDir, "q7k-ai-events-combined-sync.json");
  if (fs.existsSync(combinedStorePath)) {
    fs.rmSync(combinedStorePath);
  }
  const combinedStore = new LocalFileStore({ file_path: combinedStorePath, auto_flush: false });
  const combined = await syncAndHydratePublicAiEventsToStore(combinedStore, undefined, {
    now: referenceNow,
    hydrateImages: true,
    imageHydrationLimit: 1,
    fetchHtml: async () => `
      <html>
        <head>
          <meta property="og:title" content="Combined Hydrated AI Event" />
          <meta property="og:image" content="https://combined-official-ai-event.example.org/cover.png" />
        </head>
        <body><a href="/apply">Apply now</a></body>
      </html>
    `,
  });
  const combinedEntries = combinedStore.list({
    radarId: PUBLIC_AI_EVENTS_RADAR_ID,
    page: 1,
    page_size: 1000,
  }).entries;
  check("combined sync can hydrate images in the same backend pass", combined.imageHydration?.hydratedCount === 1 && combinedEntries.some((entry) => cardExtras(entry.card).coverImageUrl === "https://combined-official-ai-event.example.org/cover.png"), JSON.stringify(combined));
  if (fs.existsSync(combinedStorePath)) {
    fs.rmSync(combinedStorePath);
  }
}

async function runProductApiPathCheck(): Promise<void> {
  process.env.DATA_MODE = "mock";
  process.env.LLM_MODE = "mock";
  process.env.STORE_TYPE = "meili";
  process.env.MEILI_MOCK = "true";

  const { createApp } = await import("../src/api/app");
  const { createAppContext } = await import("../src/api/context");
  const ctx = createAppContext();
  const app = createApp(ctx);
  const initialPublicFeedResponse = await app.request("/api/public/ai-events?status=current&page=1&page_size=12");
  const initialPublicFeedJson = await initialPublicFeedResponse.json() as {
    success?: boolean;
    data?: { stats?: { databaseCount?: number; seedCount?: number; currentCount?: number }; items?: Array<Record<string, unknown>> };
  };
  const initialOpportunitiesResponse = await app.request(`/api/opportunities?radar_id=${PUBLIC_AI_EVENTS_RADAR_ID}&page_size=1000`);
  const initialOpportunitiesJson = await initialOpportunitiesResponse.json() as {
    success?: boolean;
    data?: { total?: number; entries?: Array<Record<string, unknown>> };
  };
  const syncResponse = await app.request("/api/public/ai-events/sync", { method: "POST" });
  const syncJson = await syncResponse.json() as {
    success?: boolean;
    data?: { radarId?: string; totalForPublicRadar?: number; syncedCount?: number };
  };
  const opportunitiesResponse = await app.request(`/api/opportunities?radar_id=${PUBLIC_AI_EVENTS_RADAR_ID}&page_size=1000`);
  const opportunitiesJson = await opportunitiesResponse.json() as {
    success?: boolean;
    data?: { total?: number; entries?: Array<Record<string, unknown>> };
  };
  const apiSerialized = JSON.stringify({ syncJson, opportunitiesJson });

  check("public feed lazily initializes public radar store", initialPublicFeedResponse.status === 200 && initialPublicFeedJson.success === true && Number(initialOpportunitiesJson.data?.total ?? 0) >= Number(initialPublicFeedJson.data?.stats?.currentCount ?? 0), JSON.stringify({ initialPublicFeedJson, initialOpportunitiesJson }).slice(0, 240));
  check("public feed is backed by database cards after lazy init", Number(initialPublicFeedJson.data?.stats?.databaseCount ?? 0) > 0 && Number(initialPublicFeedJson.data?.stats?.seedCount ?? 1) === 0, JSON.stringify(initialPublicFeedJson.data?.stats));
  check("product sync API returns 200", syncResponse.status === 200, `status=${syncResponse.status}`);
  check("product sync API succeeds", syncJson.success === true, apiSerialized.slice(0, 240));
  check("product sync API returns public radar id", syncJson.data?.radarId === PUBLIC_AI_EVENTS_RADAR_ID, apiSerialized.slice(0, 240));
  check("product opportunities API returns 200", opportunitiesResponse.status === 200, `status=${opportunitiesResponse.status}`);
  check("product opportunities API sees public synced entries", Number(opportunitiesJson.data?.total ?? 0) >= Number(syncJson.data?.syncedCount ?? 0), apiSerialized.slice(0, 240));
  check("product API keeps public image fields", apiSerialized.includes("coverImageUrl") && apiSerialized.includes("imageStatus"), apiSerialized.slice(0, 240));
  check("product API does not leak env keys", !/API_KEY|SERPER_API_KEY|COMMERCIAL_LLM_API_KEY|CONTEST_LLM_API_KEY|sk-[A-Za-z0-9]/i.test(apiSerialized), apiSerialized.slice(0, 240));
}

runImageHydrationCheck()
  .then(runProductApiPathCheck)
  .then(() => {
    if (fs.existsSync(storePath)) {
      fs.rmSync(storePath);
    }
    console.log(`\nQ7K AI events store sync checks: ${passCount} PASS / ${failCount} FAIL`);
    if (failCount > 0) {
      process.exit(1);
    }
  })
  .catch((error) => {
    failCount += 1;
    console.error("[FAIL] product API path threw", error);
    if (fs.existsSync(storePath)) {
      fs.rmSync(storePath);
    }
    console.log(`\nQ7K AI events store sync checks: ${passCount} PASS / ${failCount} FAIL`);
    process.exit(1);
  });
