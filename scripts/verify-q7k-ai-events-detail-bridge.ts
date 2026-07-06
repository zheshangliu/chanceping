import fs from "fs";
import path from "path";

import {
  PUBLIC_AI_EVENTS_RADAR_ID,
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

async function runProductDataCheck(): Promise<void> {
  process.env.DATA_MODE = "mock";
  process.env.LLM_MODE = "mock";
  process.env.STORE_TYPE = "meili";
  process.env.MEILI_MOCK = "true";

  const { createApp } = await import("../src/api/app");
  const { createAppContext } = await import("../src/api/context");
  const ctx = createAppContext();
  const app = createApp(ctx);

  const syncResponse = await app.request("/api/public/ai-events/sync", { method: "POST" });
  const syncJson = await syncResponse.json() as {
    success?: boolean;
    data?: { radarId?: string; totalForPublicRadar?: number; syncedCount?: number };
  };
  const opportunitiesResponse = await app.request(`/api/opportunities?radar_id=${PUBLIC_AI_EVENTS_RADAR_ID}&page_size=1000`);
  const opportunitiesJson = await opportunitiesResponse.json() as {
    success?: boolean;
    data?: { total?: number; entries?: unknown[] };
  };

  check("public AI events sync succeeds", syncResponse.status === 200 && syncJson.success === true);
  check("public AI events radar id is stable", syncJson.data?.radarId === PUBLIC_AI_EVENTS_RADAR_ID, JSON.stringify(syncJson.data));
  check("public AI events opportunity API exposes seed/public cards", Number(opportunitiesJson.data?.total ?? 0) >= 20, `total=${opportunitiesJson.data?.total}`);
  check("public AI events entries are available to product pages", Array.isArray(opportunitiesJson.data?.entries) && opportunitiesJson.data.entries.length >= 20, `entries=${opportunitiesJson.data?.entries?.length}`);
}

function runFrontendBridgeCheck(): void {
  const radarsJsPath = path.resolve(process.cwd(), "web", "radars.js");
  const radarsJs = fs.readFileSync(radarsJsPath, "utf8");
  const detailJsPath = path.resolve(process.cwd(), "web", "radar-detail.js");
  const detailJs = fs.readFileSync(detailJsPath, "utf8");
  const watchResultJsPath = path.resolve(process.cwd(), "web", "watch-result.js");
  const watchResultJs = fs.readFileSync(watchResultJsPath, "utf8");

  check("my radars JS knows public AI events radar id", radarsJs.includes(PUBLIC_AI_EVENTS_RADAR_ID));
  check("my radars JS detects AI events hero radar", /isAiEventsHeroRadar/.test(radarsJs));
  check("view opportunity result can use public AI events bridge", /getOpportunityRadarIdForView/.test(radarsJs) && radarsJs.includes("public_ai_events"));
  check("view result keeps private radar id for edit and rerun", radarsJs.includes("sourceRadarId") && radarsJs.includes("opportunityRadarId"));
  check("view result fetches enough public events", /getOpportunityPageSizeForView/.test(radarsJs) && /1000/.test(radarsJs));
  check("view result filters public events to current cards", /filterPublicAiEventCardsForView/.test(radarsJs) && /isCurrentPublicAiEventCard/.test(radarsJs));
  check("view result explains public AI events library", /公共赛事库|公开赛事库/.test(radarsJs));
  check("radar detail JS knows public AI events radar id", detailJs.includes(PUBLIC_AI_EVENTS_RADAR_ID));
  check("radar detail stored opportunities can use public bridge", /getOpportunityRadarIdForView/.test(detailJs) && /page_size=\$\{pageSize\}/.test(detailJs));
  check("radar detail filters public events to current cards", /filterPublicAiEventCardsForView/.test(detailJs) && /isCurrentPublicAiEventCard/.test(detailJs));
  check("radar detail explains public library source", /AI Events 公共赛事库/.test(detailJs) && /\/aievents/.test(detailJs));
  check("detail and result pages hide placeholder deadline dates", /displayDeadline/.test(detailJs) && /9999-12-31/.test(detailJs) && /displayDeadline/.test(watchResultJs) && /9999-12-31/.test(watchResultJs));
}

async function runDirectStoreCheck(): Promise<void> {
  const tmpDir = path.resolve(process.cwd(), "data", ".tmp");
  fs.mkdirSync(tmpDir, { recursive: true });
  const storePath = path.join(tmpDir, "q7k-ai-events-detail-bridge.json");
  if (fs.existsSync(storePath)) fs.rmSync(storePath);

  const { LocalFileStore } = await import("../src/agents/opportunity-store");
  const store = new LocalFileStore({ file_path: storePath, auto_flush: false });
  const result = syncPublicAiEventsToStore(store);
  const publicEntries = store.list({
    radarId: PUBLIC_AI_EVENTS_RADAR_ID,
    page: 1,
    page_size: 1000,
  }).entries;
  check("direct store sync imports seed/public AI events", result.totalForPublicRadar >= 20 && publicEntries.length >= 20, `total=${result.totalForPublicRadar}, entries=${publicEntries.length}`);
  check("direct store cards are scoped to public radar id", publicEntries.every((entry) => entry.radarIds?.includes(PUBLIC_AI_EVENTS_RADAR_ID)), publicEntries.slice(0, 3).map((entry) => JSON.stringify(entry.radarIds)).join("; "));

  if (fs.existsSync(storePath)) fs.rmSync(storePath);
}

console.log("\n[Q7K AI Events Detail Bridge] Public library and backend detail checks\n");

runDirectStoreCheck()
  .then(runProductDataCheck)
  .then(runFrontendBridgeCheck)
  .then(() => {
    console.log(`\nQ7K AI events detail bridge checks: ${passCount} PASS / ${failCount} FAIL`);
    if (failCount > 0) process.exit(1);
  })
  .catch((error) => {
    failCount += 1;
    console.error("[FAIL] detail bridge check threw", error);
    console.log(`\nQ7K AI events detail bridge checks: ${passCount} PASS / ${failCount} FAIL`);
    process.exit(1);
  });
