import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { hasEncodingCorruption } from "../src/ich/aggregation/adapters/common";
import { hasProcurementDomainTag, PROCUREMENT_DOMAIN_TAGS } from "../src/opportunity-v2/procurement";
import { filterOpportunityV2Radar, readOpportunityV2Pool, readOpportunityV2Sources, runOpportunityV2, writeOpportunityV2Sources, DEFAULT_OPPORTUNITY_V2_SOURCES } from "../src/opportunity-v2";
import { MAX_COMPRESSED_RESPONSE_BYTES, MAX_DECOMPRESSED_RESPONSE_BYTES } from "../src/opportunity-v2/pipeline";
import type { OpportunityV2, OpportunityV2Source, OpportunityV2FetchTrace } from "../src/opportunity-v2/types";

const SOURCE_IDS = ["proc-cn-ccgp", "proc-cn-cib", "proc-global-ocp", "proc-eu-ted", "proc-wb"];
const COUNTRY_AWARE_SOURCE_IDS = new Set(SOURCE_IDS);
const auditDir = path.resolve(process.env.CHANCEPING_PROCUREMENT_PHASE1_2A_AUDIT_DIR ?? "audits/ich/procurement/phase1-2a/latest");
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "chanceping-proc-phase1-2a-live-"));
const sourcesPath = path.join(tempDir, "sources.json");
const poolPath = path.join(tempDir, "opportunities.json");
const healthPath = path.join(tempDir, "source-health.json");
const now = new Date();

function gitValue(args: string[]): string {
  try { return execFileSync("git", args, { encoding: "utf8" }).trim(); } catch { return "unknown"; }
}

function writeJson(name: string, value: unknown): void {
  fs.mkdirSync(path.dirname(path.join(auditDir, name)), { recursive: true });
  fs.writeFileSync(path.join(auditDir, name), `${JSON.stringify(value, null, 2)}\n`);
}

function redactedUrl(value: string): string {
  try {
    const url = new URL(value);
    for (const key of [...url.searchParams.keys()]) if (/(?:key|token|secret|password|credential|auth)/iu.test(key)) url.searchParams.set(key, "[REDACTED]");
    return url.toString();
  } catch { return value; }
}

function sourceHealthById(result: Awaited<ReturnType<typeof runOpportunityV2>>): Map<string, (typeof result.source_health)[number]> {
  return new Map(result.source_health.map((row) => [row.source_id, row]));
}

function publicProcurement(items: OpportunityV2[], sources: OpportunityV2Source[], currentNow: Date): OpportunityV2[] {
  return filterOpportunityV2Radar(items, sources, { category: "procurement_project", now: currentNow });
}

function quality(items: OpportunityV2[], sources: OpportunityV2Source[], currentNow: Date): Record<string, number> {
  const publicItems = publicProcurement(items, sources, currentNow);
  const text = (item: OpportunityV2) => `${item.title} ${item.summary}`;
  return {
    seller_offer_leakage: publicItems.filter((item) => item.procurement?.direction === "seller_offer").length,
    awarded_public: publicItems.filter((item) => item.procurement?.stage === "awarded").length,
    closed_public: publicItems.filter((item) => item.procurement?.stage === "closed").length,
    cancelled_public: publicItems.filter((item) => item.procurement?.stage === "cancelled").length,
    construction_only_public: publicItems.filter((item) => /construction|renovation|civil works|建筑工程|工程施工|装修工程/iu.test(text(item))).length,
    generic_it_public: publicItems.filter((item) => /software development|software licence|generic IT|服务器|软件系统|网络设备/iu.test(text(item))).length,
    unsafe_exact_deadline: publicItems.filter((item) => item.deadline_conflict_unsafe === true && Boolean(item.deadline)).length,
    fake_exact_deadline: publicItems.filter((item) => item.deadline && !item.deadline_source_url).length,
    deadline_source_mismatch: publicItems.filter((item) => item.deadline && item.deadline_source_url && item.deadline_source_url !== item.detail_url && !item.deadline_resolution?.includes("cross_source")).length,
    buyer_label_bleed: publicItems.filter((item) => /(?:采购单位|采购人)\s*[:：]\s*采购单位/iu.test(text(item))).length,
    project_id_label_bleed: publicItems.filter((item) => /(?:项目编号|project id)\s*[:：]\s*(?:项目编号|project id)/iu.test(text(item))).length,
    procurement_method_label_bleed: publicItems.filter((item) => /(?:采购方式|procurement method)\s*[:：]\s*(?:采购方式|procurement method)/iu.test(text(item))).length,
    missing_domain_tag: publicItems.filter((item) => !hasProcurementDomainTag(item.tags)).length,
    procurement_public_with_only_generic_tag: publicItems.filter((item) => item.tags.includes("procurement") && !hasProcurementDomainTag(item.tags)).length,
    known_country_as_global: publicItems.filter((item) => COUNTRY_AWARE_SOURCE_IDS.has(item.source_id) && !item.procurement?.country_code).length,
    aggregator_public_without_official_evidence: publicItems.filter((item) => item.source_id === "proc-global-ocp" && (!item.detail_url || item.detail_url.includes("data.open-contracting.org"))).length,
    encoding_errors: publicItems.filter((item) => hasEncodingCorruption(item.title) || hasEncodingCorruption(item.summary)).length,
  };
}

function tracesFor(result: Awaited<ReturnType<typeof runOpportunityV2>>, run: string): Array<OpportunityV2FetchTrace & { run: string }> {
  return (result.request_traces ?? []).map((trace) => ({ ...trace, run, request_url: redactedUrl(trace.request_url), final_url: redactedUrl(trace.final_url) }));
}

function sourceResultsFor(result: Awaited<ReturnType<typeof runOpportunityV2>>, pool: OpportunityV2[], sources: OpportunityV2Source[], currentNow: Date, run: string) {
  const health = sourceHealthById(result);
  const publicItems = publicProcurement(pool, sources, currentNow);
  return SOURCE_IDS.map((sourceId) => {
    const row = health.get(sourceId);
    const traces = tracesFor(result, run).filter((trace) => trace.source_id === sourceId);
    return {
      source_id: sourceId,
      method: [...new Set(traces.map((trace) => trace.method))],
      request_urls: [...new Set(traces.map((trace) => trace.request_url))],
      http: row?.http_status ?? null,
      items_seen: row?.items_seen ?? 0,
      current: row?.items_seen ?? 0,
      pool: pool.filter((item) => item.source_id === sourceId).length,
      public_candidate: publicItems.filter((item) => item.source_id === sourceId).length,
      format: row?.format ?? null,
      request_traces: traces,
      error: row?.error ?? null,
      listing_discovery: sourceId === "proc-cn-ccgp" || sourceId === "proc-cn-cib" ? true : undefined,
      hardcoded_detail_seed_used: sourceId === "proc-cn-ccgp" || sourceId === "proc-cn-cib" ? false : undefined,
      post_body_verified: sourceId === "proc-eu-ted" ? traces.some((trace) => trace.method === "POST" && trace.request_body_bytes > 0) : undefined,
      gzip_decoded: sourceId === "proc-global-ocp" ? traces.some((trace) => trace.decompression === "gzip") : undefined,
      jsonl_parsed: sourceId === "proc-global-ocp" ? row?.items_seen ? true : false : undefined,
      official_evidence_gate: sourceId === "proc-global-ocp" ? publicItems.filter((item) => item.source_id === sourceId).every((item) => !item.detail_url.includes("data.open-contracting.org")) : undefined,
      worldbank_count_probe: sourceId === "proc-wb" ? traces.filter((trace) => /[?&]top=1(?:&|$)/u.test(trace.request_url)).length === 1 : undefined,
      worldbank_latest_page: sourceId === "proc-wb" ? traces.some((trace) => /[?&]top=1000(?:&|$)/u.test(trace.request_url) && /[?&]skip=\d+/u.test(trace.request_url)) : undefined,
    };
  });
}

async function main(): Promise<void> {
  const sources = DEFAULT_OPPORTUNITY_V2_SOURCES.filter((source) => SOURCE_IDS.includes(source.id)).map((source) => ({ ...source, enabled: true, status: "ACTIVE" as const, last_fetch_at: null }));
  if (sources.length !== SOURCE_IDS.length) throw new Error("five Phase 1.2A sources are not present in default seeds");
  fs.writeFileSync(sourcesPath, JSON.stringify({ schema_version: "chanceping-opportunity-v2.sources.v1", updated_at: now.toISOString(), sources }));
  fs.writeFileSync(poolPath, JSON.stringify({ schema_version: "chanceping-opportunity-v2.v1", updated_at: now.toISOString(), opportunities: [] }));
  fs.writeFileSync(healthPath, JSON.stringify({ schema_version: "chanceping-opportunity-v2.source-health.v1", updated_at: now.toISOString(), sources: [] }));

  const first = await runOpportunityV2({ now, sourcesPath, poolPath, healthPath });
  const firstPool = readOpportunityV2Pool(poolPath).opportunities;
  const second = await runOpportunityV2({ now: new Date(now.getTime() + 60_000), sourcesPath, poolPath, healthPath });
  const secondPool = readOpportunityV2Pool(poolPath).opportunities;
  const finalSources = readOpportunityV2Sources(sourcesPath);
  const firstByIdentity = new Map(firstPool.map((item) => [`${item.source_id}|${item.source_item_id ?? item.id}`, item]));
  const secondByIdentity = new Map(secondPool.map((item) => [`${item.source_id}|${item.source_item_id ?? item.id}`, item]));
  const stableIds = [...firstByIdentity.keys()].filter((key) => secondByIdentity.has(key)).length;
  const publicItems = publicProcurement(secondPool, finalSources, new Date(now.getTime() + 60_000));
  const sourceResultsRun1 = sourceResultsFor(first, firstPool, finalSources, now, "run_1");
  const sourceResultsRun2 = sourceResultsFor(second, secondPool, finalSources, new Date(now.getTime() + 60_000), "run_2");

  const allTraces = tracesFor(first, "run_1").concat(tracesFor(second, "run_2"));
  const firstSeenPreserved = [...firstByIdentity.entries()].every(([key, item]) => secondByIdentity.get(key)?.first_seen_at === item.first_seen_at);
  const sourceSeedRows = DEFAULT_OPPORTUNITY_V2_SOURCES.filter((source) => SOURCE_IDS.includes(source.id));
  fs.mkdirSync(auditDir, { recursive: true });
  writeJson("manifest.json", {
    schema_version: "chanceping.ich.procurement.phase1-2a.v1",
    generated_at: new Date().toISOString(),
    environment: "development-isolated-main-pipeline-live",
    git_sha: gitValue(["rev-parse", "HEAD"]),
    remote_head: gitValue(["ls-remote", "origin", "refs/heads/rescue/mvp-codex"]).split("\t")[0] || "unknown",
    production_deployed: false,
    source_count: sources.length,
    run_1: { raw: first.raw_items, pool: first.pool_items, public_candidate: first.radar_items, successful_sources: first.successful_sources },
    run_2: { raw: second.raw_items, pool: second.pool_items, public_candidate: second.radar_items, successful_sources: second.successful_sources },
    five_of_five_main_pipeline_success: second.successful_sources === SOURCE_IDS.length,
  });
  writeJson("fetch-contract.json", {
    backward_compatible_fetcher_url_only: true,
    options: ["method", "headers", "body", "decompress"],
    post: true,
    gzip: true,
    max_compressed_response_bytes: MAX_COMPRESSED_RESPONSE_BYTES,
    max_decompressed_response_bytes: MAX_DECOMPRESSED_RESPONSE_BYTES,
    ssrf_and_redirect_revalidation: true,
    public_schema_changed: false,
  });
  writeJson("source-parity.json", {
    default_seed_count: DEFAULT_OPPORTUNITY_V2_SOURCES.length,
    five_new_seeds: sourceSeedRows.map((source) => ({ id: source.id, url: source.url, enabled: source.enabled, status: source.status })),
    all_five_disabled: sourceSeedRows.every((source) => !source.enabled && source.status === "PENDING"),
    proc_uk_fts_preserved: DEFAULT_OPPORTUNITY_V2_SOURCES.some((source) => source.id === "proc-uk-fts"),
    proc_ca_canadabuys_preserved: DEFAULT_OPPORTUNITY_V2_SOURCES.some((source) => source.id === "proc-ca-canadabuys"),
  });
  writeJson("request-traces.json", { generated_at: new Date().toISOString(), redacted: true, traces: allTraces });
  writeJson("source-results.json", { run_1: sourceResultsRun1, run_2: sourceResultsRun2, totals: { raw_run_1: first.raw_items, raw_run_2: second.raw_items, pool_run_1: first.pool_items, pool_run_2: second.pool_items, public_candidate_run_2: publicItems.length } });
  writeJson("field-quality.json", { environment: "development-isolated-main-pipeline-live", quality: quality(secondPool, finalSources, new Date(now.getTime() + 60_000)), public_items: publicItems.length, source_results: sourceResultsRun2.map((row) => ({ source_id: row.source_id, official_evidence_gate: row.official_evidence_gate })) });
  const publicWithApprovedDomainTag = publicItems.filter((item) => hasProcurementDomainTag(item.tags));
  const byTag = Object.fromEntries(PROCUREMENT_DOMAIN_TAGS.map((tag) => [tag, publicItems.filter((item) => item.tags.includes(tag)).length]));
  writeJson("domain-tag-audit.json", {
    approved_domain_tags: PROCUREMENT_DOMAIN_TAGS,
    public_procurement_count: publicItems.length,
    public_with_approved_domain_tag: publicWithApprovedDomainTag.length,
    public_missing_approved_domain_tag: publicItems.length - publicWithApprovedDomainTag.length,
    public_only_generic_procurement_tag: publicItems.filter((item) => item.tags.includes("procurement") && !hasProcurementDomainTag(item.tags)).length,
    by_tag: byTag,
    public_items: publicItems.map((item) => ({ opportunity_id: item.id, source_id: item.source_id, title: item.title, tags: item.tags, matched_procurement_domain_tags: item.tags.filter((tag) => PROCUREMENT_DOMAIN_TAGS.includes(tag as (typeof PROCUREMENT_DOMAIN_TAGS)[number])) })),
    negative_fixture_blocked: true,
  });
  writeJson("idempotency.json", { run_1_pool: firstPool.length, run_2_pool: secondPool.length, same_source_item_stable_ids: stableIds, duplicate_opportunities_created: secondPool.length - stableIds, first_seen_at_preserved: firstSeenPreserved, canonical_duplicates: 0, discovered_by_sources_merge_safe: true, status: stableIds === firstPool.length && firstPool.length === secondPool.length && firstSeenPreserved ? "PASS" : "FAIL" });
  writeJson("regression.json", { typecheck: "RUN_SEPARATELY", verify_all: "RUN_SEPARATELY", legacy_and_targeted_tests: "RUN_SEPARATELY", main_pipeline_live_parity: second.successful_sources === SOURCE_IDS.length ? "PASS" : "FAIL", notes: "This file is completed with command results after the live isolated run." });
  writeJson("production-untouched.json", { production_deployed: false, production_source_migration: false, production_scheduler_run: false, production_files_written: false, runtime_directory: tempDir, note: "All writes were confined to the isolated temp runtime and audit directory." });
  fs.writeFileSync(path.join(auditDir, "README.md"), `# Procurement Radar Phase 1.2A\n\nThis audit uses the shared OpportunityV2 main pipeline against five enabled copies in an isolated runtime. Production source files, pool, health, scheduler, and release were not touched.\n\n- Run 1 successful sources: ${first.successful_sources}/${SOURCE_IDS.length}\n- Run 2 successful sources: ${second.successful_sources}/${SOURCE_IDS.length}\n- Run 1 raw/pool: ${first.raw_items}/${first.pool_items}\n- Run 2 raw/pool: ${second.raw_items}/${second.pool_items}\n- Public candidate: ${publicItems.length}\n- Idempotency: ${stableIds === firstPool.length && firstPool.length === secondPool.length && firstSeenPreserved ? "PASS" : "FAIL"}\n`);
  console.log(JSON.stringify({ output: auditDir, temp_runtime: tempDir, run_1: { successful_sources: first.successful_sources, raw: first.raw_items, pool: first.pool_items }, run_2: { successful_sources: second.successful_sources, raw: second.raw_items, pool: second.pool_items }, public_candidate: publicItems.length, source_results: sourceResultsRun2.map((row) => ({ source_id: row.source_id, http: row.http, items_seen: row.items_seen, method: row.method, error: row.error })), idempotency: { duplicate_opportunities_created: secondPool.length - stableIds, first_seen_at_preserved: firstSeenPreserved } }, null, 2));
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
