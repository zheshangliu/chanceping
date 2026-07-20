import fs, { readFileSync } from "fs";
import path from "path";
import packageJson from "../package.json";
import { LocalFileStore } from "../src/agents/opportunity-store";
import { buildPublicAiEventFeed } from "../src/public/ai-events-publisher";
import {
  hydratePublicAiEventImages,
  PUBLIC_AI_EVENTS_RADAR_ID,
  publicAiEventCardToOpportunityCard,
} from "../src/public/ai-events-store-sync";
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
  check("pipeline has explicit offline execution mode when source collection is disabled", firstRun.executionMode === "offline_store_refresh", firstSerialized.slice(0, 240));
  check("pipeline syncs baseline public event volume", firstRun.sync.syncedCount >= baselineFeed.stats.filteredCount, `synced=${firstRun.sync.syncedCount}, baseline=${baselineFeed.stats.filteredCount}`);
  check("pipeline writes entries into opportunity store", totalAfterFirstRun >= firstRun.sync.syncedCount, `store=${totalAfterFirstRun}, synced=${firstRun.sync.syncedCount}`);
  check("pipeline reports current public events", firstRun.publicFeed.currentCount > 0, JSON.stringify(firstRun.publicFeed));
  check("pipeline reports historical public events", firstRun.publicFeed.historicalCount > 0, JSON.stringify(firstRun.publicFeed));
  check("pipeline reports total published events", firstRun.publicFeed.totalCount >= baselineFeed.stats.totalCount, JSON.stringify(firstRun.publicFeed));
  check("pipeline reports pagination-ready published count", firstRun.publicFeed.pageSize > 0 && firstRun.publicFeed.totalPages >= 1, JSON.stringify(firstRun.publicFeed));
  check("pipeline reports image coverage buckets", firstRun.images.platformPlaceholderCount > 0 && firstRun.images.defaultPlaceholderCount >= 0 && firstRun.images.sourceImageCount >= 0, JSON.stringify(firstRun.images));
  check("pipeline reports source network shape", firstRun.sourceNetwork.sourceCount > 0 && firstRun.sourceNetwork.officialSourceCount > 0 && firstRun.sourceNetwork.aggregatorSourceCount > 0, JSON.stringify(firstRun.sourceNetwork));
  check("pipeline summary avoids live API wording", !/serper|deepseek|COMMERCIAL_LLM_API_KEY|SERPER_API_KEY|sk-[A-Za-z0-9]/i.test(firstSerialized), firstSerialized.slice(0, 240));

  const collectedStorePath = path.join(tmpDir, "q7q-ai-events-update-pipeline-collected.json");
  removeIfExists(collectedStorePath);
  const collectedStore = new LocalFileStore({ file_path: collectedStorePath, auto_flush: false });
  const sourceHtml: Record<string, string> = {
    "https://devpost.com/hackathons": `
      <a href="https://future-ai.devpost.com/">Future AI Agent Hackathon</a>
      <a href="https://future-ai.devpost.com/rules">Rules</a>
      <a href="https://devpost.com/hackathons">All hackathons</a>
    `,
    "https://dorahacks.io/hackathon": `
      <a href="https://dorahacks.io/hackathon/ai-builders-2026">AI Builders Hackathon</a>
      <a href="https://dorahacks.io/">DoraHacks home</a>
    `,
    "https://lablab.ai/event": `
      <a href="https://lablab.ai/event/agent-sprint">LLM Agent Sprint Hackathon</a>
      <a href="https://lablab.ai/event">All events</a>
    `,
    "https://www.kaggle.com/competitions": `
      <a href="https://www.kaggle.com/competitions/ai-model-benchmark">AI Model Benchmark Competition</a>
      <a href="https://www.kaggle.com/competitions">All competitions</a>
    `,
    "https://taikai.network/": `
      <a href="/en/builders/hackathons/ai-builders-2026/overview">AI Builders Hackathon 2026</a>
      <a href="/en/hackathons">All TAIKAI hackathons</a>
    `,
    "https://challengerocket.com/": `
      <a href="/ai-builders-2026/">AI Builders Challenge 2026</a>
      <a href="/ai-builders-2026/rules">Challenge rules</a>
      <a href="/run-outstanding-hackathons">Run a hackathon</a>
    `,
    "https://www.hackster.io/contests": `
      <a href="/contests/ai-edge-challenge">AI Edge Challenge</a>
      <a href="/contests/ai-edge-challenge/rules">Contest rules</a>
      <a href="/contests">All contests</a>
    `,
  };
  const collectedRun = await runPublicAiEventsUpdatePipeline(collectedStore, undefined, {
    now: referenceNow,
    collectSources: true,
    hydrateImages: false,
    fetchHtml: async (url) => sourceHtml[url] ?? "",
  });
  const collectedEntries = collectedStore.list({
    radarId: PUBLIC_AI_EVENTS_RADAR_ID,
    page: 1,
    page_size: 100000,
  }).entries;
  check("source-enabled pipeline declares source index collection mode", collectedRun.executionMode === "source_index_collection", JSON.stringify(collectedRun));
  const sourceCollectorSource = readFileSync("src/public/ai-events-source-collector.ts", "utf8");
  check(
    "validated second-batch sources join the default scheduler set",
    sourceCollectorSource.includes('"mlh"') && sourceCollectorSource.includes('"hackerearth"') && sourceCollectorSource.includes('"devfolio"'),
    "MLH, HackerEarth and Devfolio should be active after source-by-source validation",
  );
  check(
    "TAIKAI joins the default scheduler after concrete current-path validation",
    sourceCollectorSource.includes('"taikai"') && /taikai\.network[\s\S]*hackathons/.test(sourceCollectorSource),
    "TAIKAI must accept concrete /en/{organization}/hackathons/{event}/overview URLs",
  );
  check(
    "ChallengeRocket joins the default scheduler only with a concrete root-level challenge URL",
    sourceCollectorSource.includes('"challengerocket"') && /sourceId === "challengerocket"/.test(sourceCollectorSource),
    "ChallengeRocket must reject product pages and nested rule pages.",
  );
  check(
    "Hackster joins the default scheduler only with a concrete contest detail URL",
    sourceCollectorSource.includes('"hackster"') && /sourceId === "hackster"/.test(sourceCollectorSource),
    "Hackster must reject the contests index and nested support pages.",
  );
  check("source collection discovers concrete event pages from active source indexes", collectedRun.sourceCollection?.discoveredCardCount === 7, JSON.stringify(collectedRun.sourceCollection));
  check(
    "source collection records every enabled source health result",
    (collectedRun.sourceCollection?.sources.length ?? 0) >= 9 &&
      ["devpost", "dorahacks", "lablab", "kaggle", "taikai", "challengerocket", "hackster"].every((id) =>
        collectedRun.sourceCollection?.sources.some((source) => source.sourceId === id && source.status === "collected"),
      ),
    JSON.stringify(collectedRun.sourceCollection),
  );
  check("source collection excludes index and rule pages", !collectedEntries.some((entry) => /\/rules$|devpost\.com\/hackathons$/i.test(entry.card.official_source_url)), JSON.stringify(collectedEntries.map((entry) => entry.card.official_source_url)));
  check("source collection preserves concrete pages in public radar store", collectedEntries.some((entry) => entry.card.official_source_url === "https://future-ai.devpost.com/"), JSON.stringify(collectedEntries.map((entry) => entry.card.official_source_url)));
  check(
    "ChallengeRocket preserves only its concrete challenge page",
    collectedEntries.some((entry) => entry.card.official_source_url === "https://challengerocket.com/ai-builders-2026/")
      && !collectedEntries.some((entry) => /challengerocket\.com\/(?:ai-builders-2026\/rules|run-outstanding-hackathons)/i.test(entry.card.official_source_url)),
    JSON.stringify(collectedEntries.map((entry) => entry.card.official_source_url)),
  );
  check(
    "Hackster preserves only its concrete contest page",
    collectedEntries.some((entry) => entry.card.official_source_url === "https://www.hackster.io/contests/ai-edge-challenge")
      && !collectedEntries.some((entry) => /hackster\.io\/contests\/ai-edge-challenge\/(?:rules|submissions)/i.test(entry.card.official_source_url)),
    JSON.stringify(collectedEntries.map((entry) => entry.card.official_source_url)),
  );

  const repeatedCollectedRun = await runPublicAiEventsUpdatePipeline(collectedStore, undefined, {
    now: referenceNow,
    collectSources: true,
    hydrateImages: false,
    fetchHtml: async (url) => sourceHtml[url] ?? "",
  });
  const repeatedCollectionCount = collectedStore.list({ radarId: PUBLIC_AI_EVENTS_RADAR_ID, page: 1, page_size: 100000 }).total;
  check("source collection stays deduplicated on repeated refresh", repeatedCollectionCount === collectedEntries.length, `first=${collectedEntries.length}, second=${repeatedCollectionCount}, run=${JSON.stringify(repeatedCollectedRun.sourceCollection)}`);

  const fallbackStorePath = path.join(tmpDir, "q7q-ai-events-update-pipeline-search-fallback.json");
  removeIfExists(fallbackStorePath);
  const fallbackStore = new LocalFileStore({ file_path: fallbackStorePath, auto_flush: false });
  const fallbackRun = await runPublicAiEventsUpdatePipeline(fallbackStore, undefined, {
    now: referenceNow,
    collectSources: true,
    discoverWithSearch: true,
    hydrateImages: false,
    fetchHtml: async (url) => url.includes("devpost.com/hackathons") ? "<main>rendered by client</main>" : sourceHtml[url] ?? "",
    sourceSearch: async (_query, source) => source.id === "devpost"
      ? [{
        title: "AI Agent Buildathon",
        url: "https://agent-buildathon.devpost.com/",
        snippet: "AI hackathon registration and submission details.",
        source_provider: "test",
        source_type: "web",
      }]
      : [],
  });
  check("search fallback recovers a concrete event when a dynamic source index is empty", fallbackRun.sourceCollection?.sources.some((source) => source.sourceId === "devpost" && source.discoveryMethod === "search_fallback" && source.discoveredCount === 1) === true, JSON.stringify(fallbackRun.sourceCollection));

  const secondBatchStorePath = path.join(tmpDir, "q7q-ai-events-second-batch.json");
  const secondBatchHealthPath = path.join(tmpDir, "q7q-ai-events-second-batch-health.json");
  removeIfExists(secondBatchStorePath);
  removeIfExists(secondBatchHealthPath);
  const secondBatchStore = new LocalFileStore({ file_path: secondBatchStorePath, auto_flush: false });
  const secondBatchRun = await runPublicAiEventsUpdatePipeline(secondBatchStore, undefined, {
    now: referenceNow,
    collectSources: true,
    sourceIds: ["mlh", "hackerearth", "taikai", "devfolio"],
    discoverWithSearch: true,
    hydrateImages: false,
    sourceHealthPath: secondBatchHealthPath,
    fetchHtml: async () => "<main>rendered by client</main>",
    sourceSearch: async (_query, source) => [{
      title: `${source.name} AI Hackathon 2026`,
      url: {
        mlh: "https://mlh.io/events/ai-builders-2026",
        hackerearth: "https://www.hackerearth.com/challenges/hackathon/ai-builders-2026/",
        taikai: "https://taikai.network/en/builders/hackathons/ai-builders-2026/overview",
        devfolio: "https://devfolio.co/hackathons/ai-builders-2026",
      }[source.id] ?? "https://invalid.example.com",
      snippet: "AI hackathon registration and submission details.",
      source_provider: "test",
      source_type: "web",
    }],
  });
  check("second batch can be run explicitly without changing default scheduler sources", secondBatchRun.sourceCollection?.sources.length === 4 && secondBatchRun.sourceCollection.sources.every((source) => source.discoveryMethod === "search_fallback" && source.status === "collected"), JSON.stringify(secondBatchRun.sourceCollection));
  const healthSnapshot = JSON.parse(readFileSync(secondBatchHealthPath, "utf-8")) as { runs?: number; sources?: Record<string, { lastAcceptedCount?: number }> };
  check("source collection persists health telemetry", healthSnapshot.runs === 1 && healthSnapshot.sources?.mlh?.lastAcceptedCount === 1 && healthSnapshot.sources?.devfolio?.lastAcceptedCount === 1, JSON.stringify(healthSnapshot));

  const failedCollectionStorePath = path.join(tmpDir, "q7q-ai-events-update-pipeline-collection-failed.json");
  removeIfExists(failedCollectionStorePath);
  removeIfExists(fallbackStorePath);
  const failedCollectionStore = new LocalFileStore({ file_path: failedCollectionStorePath, auto_flush: false });
  const failedCollectionRun = await runPublicAiEventsUpdatePipeline(failedCollectionStore, undefined, {
    now: referenceNow,
    collectSources: true,
    hydrateImages: false,
    fetchHtml: async (url) => {
      if (url.includes("dorahacks")) throw new Error("synthetic DoraHacks timeout");
      return sourceHtml[url] ?? "";
    },
  });
  check("source collection surfaces a failed source rather than pretending refresh success", failedCollectionRun.sourceCollection?.sources.some((source) => source.sourceId === "dorahacks" && source.status === "failed" && source.error?.includes("synthetic DoraHacks timeout")) === true, JSON.stringify(failedCollectionRun.sourceCollection));

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

  const metadataStorePath = path.join(tmpDir, "q7q-ai-events-update-pipeline-metadata.json");
  removeIfExists(metadataStorePath);
  const metadataStore = new LocalFileStore({ file_path: metadataStorePath, auto_flush: false });
  const sourceImageCard = publicAiEventCardToOpportunityCard({
    ...baselineFeed.items[0],
    title: "Existing Cover, Missing Fields AI Hackathon",
    officialUrl: "https://metadata.example.com/hackathon",
    registrationUrl: "https://metadata.example.com/hackathon",
    deadline: "见官网",
    deadlineDisplay: "见官网",
    prize: "见官网",
    reward: "见官网",
    region: "见官网",
    coverImageUrl: "https://metadata.example.com/already-hydrated-cover.jpg",
    imageStatus: "source_image",
  });
  metadataStore.addBatch([sourceImageCard], "ai_competition", PUBLIC_AI_EVENTS_RADAR_ID);
  const metadataResult = await hydratePublicAiEventImages(metadataStore, {
    limit: 1,
    fetchHtml: async () => `
      <html><head>
        <meta property="og:title" content="Existing Cover, Missing Fields AI Hackathon">
      </head><body>
        <a href="/register">Register now</a>
        <p>Submission deadline: 2026-09-30</p>
        <p>$25,000 prize pool</p>
      </body></html>`,
  });
  const metadataEntry = metadataStore.list({ radarId: PUBLIC_AI_EVENTS_RADAR_ID, page: 1, page_size: 5 }).entries[0];
  check(
    "metadata hydrator revisits an event with an existing source cover",
    metadataResult.checkedCount === 1 && metadataResult.metadataEnrichedCount === 1,
    JSON.stringify(metadataResult),
  );
  check(
    "metadata hydrator fills deadline reward and registration without replacing a valid cover",
    metadataEntry?.card.deadline === "2026-09-30"
      && metadataEntry?.card.reward_or_value.includes("$25,000")
      && metadataEntry?.card.application_url === "https://metadata.example.com/register"
      && (metadataEntry.card as unknown as Record<string, unknown>).coverImageUrl === "https://metadata.example.com/already-hydrated-cover.jpg",
    JSON.stringify(metadataEntry?.card),
  );

  const logoFallbackStorePath = path.join(tmpDir, "q7q-ai-events-update-pipeline-logo-fallback.json");
  removeIfExists(logoFallbackStorePath);
  removeIfExists(metadataStorePath);
  const logoFallbackStore = new LocalFileStore({ file_path: logoFallbackStorePath, auto_flush: false });
  const logoFallbackRun = await runPublicAiEventsUpdatePipeline(logoFallbackStore, undefined, {
    now: referenceNow,
    hydrateImages: true,
    imageHydrationLimit: 1,
    fetchHtml: async () => `
      <!doctype html>
      <html>
        <head>
          <meta property="og:title" content="Logo Only AI Hackathon">
          <meta property="og:image" content="/static/logo.png">
        </head>
        <body>
          <header><img class="brand-logo" src="/assets/source-brand-logo.svg" alt="Logo Only Hackathon"></header>
          <main><h1>Logo Only AI Hackathon</h1><a href="/apply">Apply now</a></main>
        </body>
      </html>
    `,
  });
  const logoFallbackEntries = logoFallbackStore.list({
    radarId: PUBLIC_AI_EVENTS_RADAR_ID,
    page: 1,
    page_size: 100000,
  }).entries;
  check(
    "hydrator uses source logo as cover fallback when event artwork is absent",
    logoFallbackEntries.some((entry) => {
      const extras = entry.card as unknown as Record<string, unknown>;
      return extras.imageStatus === "source_logo"
        && typeof extras.coverImageUrl === "string"
        && extras.coverImageUrl.endsWith("/assets/source-brand-logo.svg");
    }),
    JSON.stringify(logoFallbackEntries.slice(0, 2).map((entry) => ({
      title: entry.card.title,
      coverImageUrl: (entry.card as unknown as Record<string, unknown>).coverImageUrl,
      imageStatus: (entry.card as unknown as Record<string, unknown>).imageStatus,
    }))),
  );
  check(
    "pipeline reports source logo fallback images separately from source event images",
    (logoFallbackRun.imageHydration as { sourceLogoCount?: number } | undefined)?.sourceLogoCount === 1
      && (logoFallbackRun.images as { sourceLogoCount?: number }).sourceLogoCount === 1,
    JSON.stringify({ imageHydration: logoFallbackRun.imageHydration, images: logoFallbackRun.images }),
  );

  const failedHydrationStorePath = path.join(tmpDir, "q7q-ai-events-update-pipeline-failed-hydration.json");
  removeIfExists(failedHydrationStorePath);
  removeIfExists(secondBatchStorePath);
  removeIfExists(secondBatchHealthPath);
  removeIfExists(collectedStorePath);
  removeIfExists(failedCollectionStorePath);
  const failedHydrationStore = new LocalFileStore({ file_path: failedHydrationStorePath, auto_flush: false });
  const failedHydrationRun = await runPublicAiEventsUpdatePipeline(failedHydrationStore, undefined, {
    now: referenceNow,
    hydrateImages: true,
    imageHydrationLimit: 2,
    fetchHtml: async (url) => {
      throw new Error(`synthetic image fetch failure for ${url}`);
    },
  });
  const failedDiagnostics = failedHydrationRun.imageHydration as
    | (NonNullable<typeof failedHydrationRun.imageHydration> & {
        failedDomains?: Array<{ domain: string; count: number }>;
        failedUrls?: Array<{ url: string; domain: string; reason: string }>;
      })
    | undefined;
  check("failed image hydration reports failed domains", (failedDiagnostics?.failedDomains?.length ?? 0) > 0, JSON.stringify(failedHydrationRun.imageHydration));
  check("failed image hydration reports failed urls and reasons", (failedDiagnostics?.failedUrls?.[0]?.reason ?? "").includes("synthetic image fetch failure"), JSON.stringify(failedHydrationRun.imageHydration));

  const schedulerPath = path.resolve(process.cwd(), "scripts", "run-ai-events-update-scheduler.ts");
  const schedulerSource = fs.existsSync(schedulerPath) ? fs.readFileSync(schedulerPath, "utf8") : "";
  check(
    "package exposes local AI events scheduled update script",
    (packageJson as { scripts?: Record<string, string> }).scripts?.["ai-events:update:scheduled"] === "tsx scripts/run-ai-events-update-scheduler.ts",
    JSON.stringify((packageJson as { scripts?: Record<string, string> }).scripts?.["ai-events:update:scheduled"] ?? null),
  );
  check("scheduled update script exists", fs.existsSync(schedulerPath), schedulerPath);
  const manualPipelinePath = path.resolve(process.cwd(), "scripts", "run-ai-events-update-pipeline.ts");
  const manualPipelineSource = fs.existsSync(manualPipelinePath) ? fs.readFileSync(manualPipelinePath, "utf8") : "";
  check(
    "manual update script can explicitly load local api.env",
    /loadLocalApiEnv/.test(manualPipelineSource) && /CHANCEPING_LOAD_API_ENV/.test(manualPipelineSource),
    manualPipelineSource.slice(0, 240),
  );
  check("scheduled update script supports one-shot dry run", /--once/.test(schedulerSource) && /runPublicAiEventsUpdatePipeline/.test(schedulerSource), schedulerSource.slice(0, 240));
  check("scheduled update script defaults to 72 hour cadence", /72/.test(schedulerSource) && /interval-hours/.test(schedulerSource), schedulerSource.slice(0, 240));

  removeIfExists(storePath);
  removeIfExists(hydratedStorePath);
  removeIfExists(logoFallbackStorePath);
  removeIfExists(failedHydrationStorePath);

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
