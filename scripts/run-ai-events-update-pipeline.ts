import { createStore } from "../src/agents/store-factory";
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

function parsePositiveInt(value: string | undefined, fallback: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(max, Math.floor(parsed)));
}

async function main(): Promise<void> {
  const store = createStore();
  store.load();
  const summary = await runPublicAiEventsUpdatePipeline(store, undefined, {
    hydrateImages: hasFlag("--hydrate-images"),
    imageHydrationLimit: parsePositiveInt(getArgValue("--image-limit"), 30, 120),
    collectSources: hasFlag("--collect-sources"),
    sourceMaxLinks: parsePositiveInt(getArgValue("--source-max-links"), 12, 30),
  });

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error("[AI Events Update Pipeline] failed", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
