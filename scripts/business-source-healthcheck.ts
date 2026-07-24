import fs from "node:fs";
import path from "node:path";
import { loadSourceRegistry, type SourceHealth } from "../src/business/data-pipeline";

const all = process.argv.includes("--all");
const outputIndex = process.argv.indexOf("--output");
const output = outputIndex >= 0 ? process.argv[outputIndex + 1] : undefined;
const sources = loadSourceRegistry().sources.filter((source) => all || source.priority === "P0").slice(0, all ? undefined : 15);

async function inspect(source: typeof sources[number]): Promise<SourceHealth> {
  const started = Date.now();
  try {
    const response = await fetch(source.entryUrl, { redirect: "follow", signal: AbortSignal.timeout(15_000), headers: { "user-agent": "ChancePing-BusinessRadar/1.0 source-healthcheck" } });
    const status = response.ok ? "HEALTHY" : (response.status === 401 || response.status === 403 ? "MANUAL_ONLY" : "DEGRADED");
    return { sourceId: source.sourceId, status, checkedAt: new Date().toISOString(), latencyMs: Date.now() - started, detail: `HTTP ${response.status} ${response.url}` };
  } catch (error) {
    return { sourceId: source.sourceId, status: "DOWN", checkedAt: new Date().toISOString(), latencyMs: Date.now() - started, detail: error instanceof Error ? error.message : String(error) };
  }
}

async function main(): Promise<void> {
  const results = await Promise.all(sources.map(inspect));
  const report = { generatedAt: new Date().toISOString(), checked: results.length, healthy: results.filter((item) => item.status === "HEALTHY").length, results };
  console.log(JSON.stringify(report, null, 2));
  if (output) {
    const absolute = path.resolve(output);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    const temporary = `${absolute}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(report, null, 2)}\n`);
    fs.renameSync(temporary, absolute);
  }
  if (results.some((item) => item.status === "DOWN")) process.exitCode = 1;
}

main();
