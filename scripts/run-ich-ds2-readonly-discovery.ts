import fs from "node:fs";
import path from "node:path";
import { ICH_DS1B_ADAPTERS, type IchDs1bAdapter } from "../src/ich/source-adapters-v1";
import { getIchSourceRegistryV2 } from "../src/ich/source-registry-v2";
import { sha256, type IchDs2ReadonlyDiscoveryRun, type IchDs2SourceRun } from "../src/ich/discovery-runtime-v1";

interface HtmlResponse { status: number; finalUrl: string; html: string }
const outputPath = path.resolve(process.argv.includes("--output") ? process.argv[process.argv.indexOf("--output") + 1] : "docs/ich/DS2-只读发现运行记录_V1.0.json");
const maxDetails = Number(process.argv.includes("--max-details") ? process.argv[process.argv.indexOf("--max-details") + 1] : 3);
const timeoutMs = 20_000;
const storePath = path.resolve("data/ich-opportunities.json");
const registry = getIchSourceRegistryV2();

async function fetchHtml(url: string): Promise<HtmlResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { redirect: "follow", signal: controller.signal, headers: { "user-agent": "ChancePing-DS2-readonly-discovery/1.0" } });
    return { status: response.status, finalUrl: response.url, html: await response.text() };
  } finally { clearTimeout(timer); }
}

async function runSource(adapter: IchDs1bAdapter): Promise<IchDs2SourceRun> {
  const startedAt = new Date().toISOString();
  const source = registry.sources.find((entry) => entry.id === adapter.source_id);
  const base: IchDs2SourceRun = { source_id: adapter.source_id, adapter_id: adapter.adapter_id, discovery_url: adapter.discovery_url, access_mode: source?.access_mode ?? "manual", started_at: startedAt, finished_at: startedAt, status: "failed", http_status: null, final_url: null, raw_snapshot_hash: null, candidate_count: 0, candidates: [], errors: [] };
  try {
    const listing = await fetchHtml(adapter.discovery_url);
    base.http_status = listing.status;
    base.final_url = listing.finalUrl;
    base.raw_snapshot_hash = sha256(listing.html);
    if (listing.status < 200 || listing.status >= 400) {
      base.errors.push(`discovery endpoint HTTP ${listing.status}`);
      base.finished_at = new Date().toISOString();
      return base;
    }
    const links = adapter.selectDetailLinks(listing.html, listing.finalUrl).slice(0, Math.max(0, maxDetails));
    for (const link of links) {
      try {
        const detail = await fetchHtml(link.url);
        if (detail.status < 200 || detail.status >= 400) {
          base.errors.push(`${link.url}: HTTP ${detail.status}`);
          continue;
        }
        base.candidates.push(adapter.extractCandidate({ html: detail.html, sourceUrl: detail.finalUrl, discoveryUrl: adapter.discovery_url, listingTitle: link.listing_title }));
      } catch (error) {
        base.errors.push(`${link.url}: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`);
      }
    }
    base.candidate_count = base.candidates.length;
    base.status = base.errors.length === 0 ? "completed" : (base.candidates.length > 0 ? "partial" : "failed");
  } catch (error) {
    base.errors.push(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  }
  base.finished_at = new Date().toISOString();
  return base;
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const sourceRuns: IchDs2SourceRun[] = [];
  for (const adapter of ICH_DS1B_ADAPTERS) sourceRuns.push(await runSource(adapter));
  const finishedAt = new Date().toISOString();
  const run: IchDs2ReadonlyDiscoveryRun = {
    schema_version: "ich-ds2-readonly-discovery.v1",
    run_id: `ich-ds2-${startedAt.replace(/[-:.TZ]/g, "").slice(0, 14)}`,
    started_at: startedAt,
    finished_at: finishedAt,
    readonly: true,
    formal_store_write: false,
    formal_store_path: path.relative(process.cwd(), storePath),
    formal_store_before_sha256: sha256(fs.readFileSync(storePath)),
    source_count: sourceRuns.length,
    candidate_count: sourceRuns.reduce((sum, sourceRun) => sum + sourceRun.candidate_count, 0),
    source_runs: sourceRuns,
    gate: sourceRuns.every((sourceRun) => sourceRun.status === "completed") ? "pass" : sourceRuns.some((sourceRun) => sourceRun.candidate_count > 0) ? "pass_with_followups" : "failed",
  };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(run, null, 2)}\n`);
  console.log(JSON.stringify({ output: path.relative(process.cwd(), outputPath), run_id: run.run_id, source_count: run.source_count, candidate_count: run.candidate_count, statuses: sourceRuns.map((sourceRun) => ({ source_id: sourceRun.source_id, status: sourceRun.status, candidates: sourceRun.candidate_count, errors: sourceRun.errors.length })), readonly: run.readonly, formal_store_write: run.formal_store_write, gate: run.gate }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
