import fs from "fs";
import path from "path";
import { serve } from "@hono/node-server";
import { loadLocalApiEnv } from "../src/config/local-env";

const port = Number(process.env.PORT ?? "3304");
const q4DataDir = process.env.Q4_DATA_DIR ?? "data/q4-live";
const files = {
  radars: `${q4DataDir}/radars.json`,
  runs: `${q4DataDir}/radar-runs.json`,
  opps: `${q4DataDir}/opportunity-store.json`,
  watch: `${q4DataDir}/watch-rules.txt`,
  reports: `${q4DataDir}/report-index.json`,
};

function cleanupQ4Data(): void {
  if (process.env.Q4_KEEP_DATA === "true") return;
  const absDir = path.resolve(process.cwd(), q4DataDir);
  if (fs.existsSync(absDir)) fs.rmSync(absDir, { recursive: true, force: true });
  fs.mkdirSync(absDir, { recursive: true });
}

async function createQ4Context(): Promise<import("../src/api/context").AppContext> {
  const [
    { createAdapter },
    { LocalFileStore },
    { StarManager },
    { JsonRadarStore, JsonRadarRunStore },
    { RadarRegistry },
    { JsonReportStore },
    { LocalWatchStore },
    { FileParserRouter },
  ] = await Promise.all([
    import("../src/agents/model-router"),
    import("../src/agents/opportunity-store"),
    import("../src/agents/star-manager"),
    import("../src/agents/radar-store"),
    import("../src/agents/radar-registry"),
    import("../src/agents/report-store"),
    import("../src/watch/watch-store"),
    import("../src/search/file-parser-router"),
  ]);
  const store = new LocalFileStore({ file_path: files.opps });
  store.load();
  const radarStore = new JsonRadarStore({ file_path: files.radars });
  const radarRunStore = new JsonRadarRunStore({ file_path: files.runs });
  const radarRegistry = new RadarRegistry(radarStore);
  radarRegistry.initialize();
  return {
    llmAdapter: createAdapter(),
    store,
    starManager: new StarManager(store),
    watchStore: new LocalWatchStore({ file_path: files.watch }),
    conversations: new Map(),
    fileParser: new FileParserRouter(),
    radarStore,
    radarRunStore,
    radarRegistry,
    reportStore: new JsonReportStore({ file_path: files.reports }),
  };
}

async function main(): Promise<void> {
  if (process.env.CHANCEPING_LOAD_API_ENV !== "true") {
    throw new Error("Q4 live server requires CHANCEPING_LOAD_API_ENV=true; api.env is local-only and must be explicitly enabled.");
  }
  const localEnv = loadLocalApiEnv({ enabled: process.env.CHANCEPING_LOAD_API_ENV === "true" });
  if (localEnv.loaded) {
    console.log(`[Q4] api.env loaded (${localEnv.keysLoaded.length} keys, values hidden)`);
  } else {
    console.log(`[Q4] api.env not loaded: ${localEnv.reason}`);
  }
  cleanupQ4Data();
  process.env.DATA_MODE = process.env.DATA_MODE ?? "mock";
  process.env.LLM_MODE = process.env.LLM_MODE ?? "live";
  process.env.CHANCEPING_ENABLE_LOCAL_LIVE_SEARCH = process.env.CHANCEPING_ENABLE_LOCAL_LIVE_SEARCH ?? "true";
  process.env.CHANCEPING_ENABLE_LOCAL_LIVE_LLM = process.env.CHANCEPING_ENABLE_LOCAL_LIVE_LLM ?? "true";
  process.env.CHANCEPING_LLM_PROFILE = process.env.CHANCEPING_LLM_PROFILE ?? "contest";

  if (!process.env.SERPER_API_KEY) {
    throw new Error("Q4 live server requires SERPER_API_KEY after api.env load; key value is not printed.");
  }
  if (
    process.env.CHANCEPING_LLM_PROFILE === "contest"
    && !process.env.CONTEST_LLM_API_KEY
    && !process.env.DASHSCOPE_API_KEY
  ) {
    throw new Error("Q4 live server requires contest Qwen LLM API key after api.env load; key value is not printed.");
  }

  const [{ createApp }, { providerRegistry }] = await Promise.all([
    import("../src/api/app"),
    import("../src/search/provider-registry"),
  ]);
  const serperProvider = providerRegistry.get("serper") as { mockMode?: boolean } | undefined;
  if (!serperProvider || serperProvider.mockMode === true) {
    throw new Error("Q4 live server blocked: serper provider is in mockMode after api.env load.");
  }

  const app = createApp(await createQ4Context());
  console.log(`[Q4] isolated live server: http://127.0.0.1:${port}`);
  console.log(`[Q4] data dir: ${q4DataDir}`);
  console.log("[Q4] live provider guard: serper mockMode=false (key hidden)");
  serve({ fetch: app.fetch, port });
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[Q4] server failed: ${message}`);
  process.exit(1);
});
