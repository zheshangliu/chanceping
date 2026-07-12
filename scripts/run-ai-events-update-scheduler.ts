import { createStore } from "../src/agents/store-factory";
import { loadLocalApiEnv } from "../src/config/local-env";
import { runPublicAiEventsUpdatePipeline } from "../src/public/ai-events-update-pipeline";

function getArgValue(name: string): string | undefined {
  const prefix = `${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(name);
  if (index >= 0) return process.argv[index + 1];
  return undefined;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function parsePositiveNumber(value: string | undefined, fallback: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(max, parsed));
}

function parsePositiveInt(value: string | undefined, fallback: number, max: number): number {
  return Math.floor(parsePositiveNumber(value, fallback, max));
}

function parseCsv(value: string | undefined): string[] | undefined {
  const values = (value ?? "").split(",").map((item) => item.trim()).filter(Boolean);
  return values.length > 0 ? values : undefined;
}

async function runOnce(): Promise<void> {
  const store = createStore();
  store.load();
  const summary = await runPublicAiEventsUpdatePipeline(store, undefined, {
    hydrateImages: hasFlag("--hydrate-images"),
    imageHydrationLimit: parsePositiveInt(getArgValue("--image-limit"), 30, 120),
    collectSources: hasFlag("--collect-sources"),
    sourceMaxLinks: parsePositiveInt(getArgValue("--source-max-links"), 12, 30),
    discoverWithSearch: hasFlag("--discover-with-search"),
    sourceIds: parseCsv(getArgValue("--source-ids")),
  });
  console.log(JSON.stringify(summary, null, 2));
}

async function main(): Promise<void> {
  loadLocalApiEnv({ enabled: process.env.CHANCEPING_LOAD_API_ENV === "true" });
  const intervalHours = parsePositiveNumber(getArgValue("--interval-hours"), 72, 24 * 14);
  await runOnce();

  if (hasFlag("--once")) return;

  const intervalMs = intervalHours * 60 * 60 * 1000;
  console.log(`[AI Events Scheduler] next run in ${intervalHours}h`);
  const timer = setInterval(() => {
    runOnce().catch((error) => {
      console.error("[AI Events Scheduler] run failed", error instanceof Error ? error.message : String(error));
    });
  }, intervalMs);

  const shutdown = (): void => {
    clearInterval(timer);
    console.log("[AI Events Scheduler] stopped");
    process.exit(0);
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error("[AI Events Scheduler] failed", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
