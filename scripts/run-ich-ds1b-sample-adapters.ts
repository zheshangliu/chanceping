import fs from "node:fs";
import path from "node:path";
import { ICH_DS1B_ADAPTERS, type IchCandidateSample } from "../src/ich/source-adapters-v1";

interface AdapterRun {
  adapter_id: string;
  source_id: string;
  discovery_url: string;
  listing_status: number | null;
  selected_detail_urls: string[];
  samples: IchCandidateSample[];
  error: string | null;
}

interface Report {
  schema_version: "ich-ds1b-sample-run.v1";
  ran_at: string;
  readonly: true;
  formal_store_write: false;
  minimum_samples_per_adapter: 3;
  adapter_count: number;
  total_samples: number;
  gate: "pass" | "fail";
  runs: AdapterRun[];
}

const outputPath = path.resolve(process.argv.includes("--output") ? process.argv[process.argv.indexOf("--output") + 1] : "docs/ich/DS1-B-候选样本运行记录_V1.0.json");
const timeoutMs = 20_000;

async function fetchHtml(url: string): Promise<{ status: number; finalUrl: string; html: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { redirect: "follow", signal: controller.signal, headers: { "user-agent": "ChancePing-DS1B-readonly-sample-adapter/1.0" } });
    return { status: response.status, finalUrl: response.url, html: await response.text() };
  } finally {
    clearTimeout(timeout);
  }
}

async function runAdapter(adapter: (typeof ICH_DS1B_ADAPTERS)[number]): Promise<AdapterRun> {
  try {
    const listing = await fetchHtml(adapter.discovery_url);
    const selected = adapter.selectDetailLinks(listing.html, listing.finalUrl).slice(0, 3);
    const samples: IchCandidateSample[] = [];
    for (const item of selected) {
      const detail = await fetchHtml(item.url);
      if (detail.status >= 200 && detail.status < 400) samples.push(adapter.extractCandidate({ html: detail.html, sourceUrl: detail.finalUrl, discoveryUrl: adapter.discovery_url, listingTitle: item.listing_title }));
    }
    return { adapter_id: adapter.adapter_id, source_id: adapter.source_id, discovery_url: adapter.discovery_url, listing_status: listing.status, selected_detail_urls: selected.map((item) => item.url), samples, error: null };
  } catch (error) {
    return { adapter_id: adapter.adapter_id, source_id: adapter.source_id, discovery_url: adapter.discovery_url, listing_status: null, selected_detail_urls: [], samples: [], error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) };
  }
}

async function main(): Promise<void> {
  const runs = [] as AdapterRun[];
  for (const adapter of ICH_DS1B_ADAPTERS) runs.push(await runAdapter(adapter));
  const gate = runs.every((run) => run.samples.length >= 3 && run.error === null);
  const report: Report = { schema_version: "ich-ds1b-sample-run.v1", ran_at: new Date().toISOString(), readonly: true, formal_store_write: false, minimum_samples_per_adapter: 3, adapter_count: runs.length, total_samples: runs.reduce((count, run) => count + run.samples.length, 0), gate: gate ? "pass" : "fail", runs };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ output: path.relative(process.cwd(), outputPath), adapter_count: report.adapter_count, samples: report.total_samples, per_adapter: runs.map((run) => ({ adapter_id: run.adapter_id, samples: run.samples.length, selected: run.selected_detail_urls.length, error: run.error })), gate: report.gate }, null, 2));
  if (!gate) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
