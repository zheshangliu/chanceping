import fs from "fs";
import path from "path";
import { LocalFileStore } from "../src/agents/opportunity-store";
import { buildPublicAiEventFeed } from "../src/public/ai-events-publisher";
import { PUBLIC_AI_EVENTS_RADAR_ID } from "../src/public/ai-events-store-sync";
import { runPublicAiEventsUpdatePipeline } from "../src/public/ai-events-update-pipeline";

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

function removeIfExists(filePath: string): void {
  if (fs.existsSync(filePath)) {
    fs.rmSync(filePath);
  }
}

async function main(): Promise<void> {
  console.log("\n[Q7Q AI Events Update Pipeline] repeatable backend pipeline checks\n");

  const tmpDir = path.resolve(process.cwd(), "data", ".tmp");
  fs.mkdirSync(tmpDir, { recursive: true });
  const storePath = path.join(tmpDir, "q7q-ai-events-update-pipeline.json");
  removeIfExists(storePath);

  const referenceNow = "2026-07-06T00:00:00.000Z";
  const store = new LocalFileStore({ file_path: storePath, auto_flush: false });
  const baselineFeed = buildPublicAiEventFeed([], undefined, {
    lifecycle: "all",
    page: 1,
    pageSize: 60,
    now: referenceNow,
  });

  const firstRun = await runPublicAiEventsUpdatePipeline(store, undefined, {
    now: referenceNow,
    hydrateImages: false,
  });
  const totalAfterFirstRun = store.list({
    radarId: PUBLIC_AI_EVENTS_RADAR_ID,
    page: 1,
    page_size: 100000,
  }).total;
  const firstSerialized = JSON.stringify(firstRun);

  check("pipeline returns public AI events radar id", firstRun.radarId === PUBLIC_AI_EVENTS_RADAR_ID, firstSerialized.slice(0, 240));
  check("pipeline has explicit offline execution mode", firstRun.executionMode === "offline_store_refresh", firstSerialized.slice(0, 240));
  check("pipeline syncs baseline public event volume", firstRun.sync.syncedCount >= baselineFeed.stats.filteredCount, `synced=${firstRun.sync.syncedCount}, baseline=${baselineFeed.stats.filteredCount}`);
  check("pipeline writes entries into opportunity store", totalAfterFirstRun >= firstRun.sync.syncedCount, `store=${totalAfterFirstRun}, synced=${firstRun.sync.syncedCount}`);
  check("pipeline reports current public events", firstRun.publicFeed.currentCount > 0, JSON.stringify(firstRun.publicFeed));
  check("pipeline reports historical public events", firstRun.publicFeed.historicalCount > 0, JSON.stringify(firstRun.publicFeed));
  check("pipeline reports total published events", firstRun.publicFeed.totalCount >= baselineFeed.stats.totalCount, JSON.stringify(firstRun.publicFeed));
  check("pipeline reports pagination-ready published count", firstRun.publicFeed.pageSize > 0 && firstRun.publicFeed.totalPages >= 1, JSON.stringify(firstRun.publicFeed));
  check("pipeline reports image coverage buckets", firstRun.images.platformPlaceholderCount > 0 && firstRun.images.defaultPlaceholderCount >= 0 && firstRun.images.sourceImageCount >= 0, JSON.stringify(firstRun.images));
  check("pipeline reports source network shape", firstRun.sourceNetwork.sourceCount > 0 && firstRun.sourceNetwork.officialSourceCount > 0 && firstRun.sourceNetwork.aggregatorSourceCount > 0, JSON.stringify(firstRun.sourceNetwork));
  check("pipeline summary avoids live API wording", !/serper|deepseek|COMMERCIAL_LLM_API_KEY|SERPER_API_KEY|sk-[A-Za-z0-9]/i.test(firstSerialized), firstSerialized.slice(0, 240));

  const secondRun = await runPublicAiEventsUpdatePipeline(store, undefined, {
    now: referenceNow,
    hydrateImages: false,
  });
  const totalAfterSecondRun = store.list({
    radarId: PUBLIC_AI_EVENTS_RADAR_ID,
    page: 1,
    page_size: 100000,
  }).total;

  check("pipeline is idempotent for repeated backend refreshes", totalAfterSecondRun === totalAfterFirstRun, `first=${totalAfterFirstRun}, second=${totalAfterSecondRun}, run=${JSON.stringify(secondRun.sync)}`);

  const hydratedStorePath = path.join(tmpDir, "q7q-ai-events-update-pipeline-hydrated.json");
  removeIfExists(hydratedStorePath);
  const hydratedStore = new LocalFileStore({ file_path: hydratedStorePath, auto_flush: false });
  const hydratedRun = await runPublicAiEventsUpdatePipeline(hydratedStore, undefined, {
    now: referenceNow,
    hydrateImages: true,
    imageHydrationLimit: 2,
    fetchHtml: async (url) => `
      <!doctype html>
      <html>
        <head>
          <meta property="og:title" content="Hydrated ${url}">
          <meta property="og:image" content="https://assets.example.org/${encodeURIComponent(url)}.jpg">
        </head>
        <body><a href="/apply">Apply now</a></body>
      </html>
    `,
  });

  check("pipeline can hydrate source images in same backend pass", (hydratedRun.imageHydration?.hydratedCount ?? 0) === 2, JSON.stringify(hydratedRun.imageHydration));
  check("hydrated pipeline updates image coverage summary", hydratedRun.images.sourceImageCount >= 2, JSON.stringify(hydratedRun.images));

  removeIfExists(storePath);
  removeIfExists(hydratedStorePath);

  console.log(`\nQ7Q AI events update pipeline checks: ${passCount} PASS / ${failCount} FAIL`);
  if (failCount > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  failCount += 1;
  console.error("[FAIL] pipeline verification threw", error);
  console.log(`\nQ7Q AI events update pipeline checks: ${passCount} PASS / ${failCount} FAIL`);
  process.exit(1);
});
