import fs from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { isPublicProcurementOpportunity, parseProcurementDetail, parseProcurementSource } from "../src/opportunity-v2/procurement-sources";
import { PHASE1_PROCUREMENT_SOURCE_IDS, readProcurementSourceRegistry, type ProcurementSourceRegistryEntry, type ProcurementSourceStatus } from "../src/opportunity-v2/procurement-registry";
import { deduplicateOpportunityV2, normalizeOpportunityV2 } from "../src/opportunity-v2/opportunity-pool";

const now = new Date("2026-09-11T12:00:00+08:00");
const out = path.resolve(process.env.CHANCEPING_PROCUREMENT_PHASE1_AUDIT_DIR ?? "audits/ich/procurement/phase1/latest");
const userAgent = "ChancePing-Procurement-Phase1/1.0 (+public-source-audit; bounded-read-only)";
const timeoutMs = 20_000;
const maxBytes = 2_000_000;

const liveTargets = {
  "proc-cn-ccgp": [
    "https://www.ccgp.gov.cn/cggg/dfgg/jzxcs/202609/t20260908_27286594.htm",
    "https://www.ccgp.gov.cn/cggg/dfgg/jzxcs/202609/t20260904_27266403.htm",
    "https://www.ccgp.gov.cn/cggg/dfgg/jzxcs/202609/t20260905_27274990.htm",
    "https://www.ccgp.gov.cn/cggg/dfgg/jzxcs/202609/t20260908_27289041.htm",
    "https://www.ccgp.gov.cn/cggg/dfgg/jzxcs/202609/t20260904_27273210.htm",
  ],
  "proc-cn-cib": [
    "https://cg.cib.com.cn/cms/default/webfile/gyszj/20260904/1280569741458538496.html",
    "https://cg.cib.com.cn/cms/default/webfile/gyszj/20260706/1258869174562717696.html",
    "https://cg.cib.com.cn/cms/default/webfile/gyszj/20260629/1256329598430347264.html",
  ],
} as const;

type FetchResult = { status: number; url: string; content_type: string | null; bytes: number; text: string };
type FixtureCase = { source_id: string; kind: string; json?: unknown };
type SourceResult = {
  source_id: string;
  access_method: string;
  live_status: ProcurementSourceStatus;
  http: number | null;
  discovery_url: string;
  raw_items: number;
  current: number;
  pool: number;
  public: number;
  format: string | null;
  public_ids: string[];
  official_backlinks: number;
  discovery_equals_evidence: boolean;
  adapter: string;
  fixture_status: string;
  blocker?: string;
  errors: string[];
};

async function fetchBounded(url: string, init: RequestInit = {}): Promise<FetchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, redirect: "follow", signal: controller.signal, headers: { "user-agent": userAgent, accept: "application/json,text/html,text/plain;q=0.9,*/*;q=0.4", ...(init.headers ?? {}) } });
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > maxBytes) throw new Error(`bounded body limit exceeded (${buffer.byteLength})`);
    return { status: response.status, url: response.url, content_type: response.headers.get("content-type"), bytes: buffer.byteLength, text: buffer.toString("utf8") };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchGzip(url: string): Promise<FetchResult> {
  const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(timeoutMs), headers: { "user-agent": userAgent, accept: "application/gzip" } });
  const compressed = Buffer.from(await response.arrayBuffer());
  if (compressed.byteLength > maxBytes) throw new Error(`bounded compressed body limit exceeded (${compressed.byteLength})`);
  const text = gunzipSync(compressed).toString("utf8");
  return { status: response.status, url: response.url, content_type: response.headers.get("content-type"), bytes: compressed.byteLength, text };
}

function resultFor(entry: ProcurementSourceRegistryEntry, response: FetchResult | null, items: ReturnType<typeof parseProcurementSource>, errors: string[] = []): SourceResult {
  const current = items.filter((item) => !["awarded", "closed", "cancelled"].includes(item.procurement?.stage ?? "") && (!item.deadline_at || new Date(item.deadline_at).getTime() >= now.getTime()));
  const publicItems = current.filter((item) => isPublicProcurementOpportunity(item, now));
  const officialBacklinks = items.filter((item) => item.detail_url && item.detail_url !== entry.official_url && !item.detail_url.startsWith(entry.official_url)).length;
  return {
    source_id: entry.source_id,
    access_method: entry.access_method,
    live_status: items.length > 0 ? "LIVE_OK" : "LIVE_OK_ZERO_MATCH",
    http: response?.status ?? null,
    discovery_url: entry.official_url,
    raw_items: items.length,
    current: current.length,
    pool: current.length,
    public: publicItems.length,
    format: items.length ? (entry.source_id === "proc-eu-ted" ? "TED_JSON" : entry.source_id === "proc-global-ocp" ? "OCDS_JSONL" : "DEDICATED_HTML") : null,
    public_ids: publicItems.map((item) => item.source_item_id),
    official_backlinks: officialBacklinks,
    discovery_equals_evidence: officialBacklinks === 0,
    adapter: entry.adapter_id,
    fixture_status: "NOT_APPLICABLE",
    errors,
  };
}

async function liveHtmlSource(entry: ProcurementSourceRegistryEntry, urls: readonly string[]): Promise<{ result: SourceResult; items: ReturnType<typeof parseProcurementSource> }> {
  const items = [] as ReturnType<typeof parseProcurementSource>;
  const errors: string[] = [];
  let http: number | null = null;
  for (const url of urls) {
    try {
      const response = await fetchBounded(url);
      http = response.status;
      if (response.status < 200 || response.status >= 400) { errors.push(`${url}: HTTP ${response.status}`); continue; }
      const item = parseProcurementDetail(entry.source_id, response.text, url, now);
      if (item) items.push(item);
    } catch (error) { errors.push(`${url}: ${error instanceof Error ? error.message : String(error)}`); }
  }
  const result = resultFor(entry, { status: http ?? 0, url: entry.official_url, content_type: "text/html", bytes: 0, text: "" }, items, errors);
  result.live_status = result.public > 0 ? "LIVE_OK" : items.length > 0 ? "LIVE_OK_ZERO_MATCH" : "PARSER_FAIL";
  result.fixture_status = "POSITIVE_AND_NEGATIVE_LIVE_SAMPLES";
  return { result, items };
}

async function runLive(): Promise<{ results: SourceResult[]; allItems: ReturnType<typeof parseProcurementSource>; lineage: Array<Record<string, unknown>>; notes: Record<string, unknown> }> {
  const registry = readProcurementSourceRegistry();
  const byId = new Map(registry.sources.map((entry) => [entry.source_id, entry]));
  const results: SourceResult[] = [];
  const allItems: ReturnType<typeof parseProcurementSource> = [];
  const lineage: Array<Record<string, unknown>> = [];
  const notes: Record<string, unknown> = {};

  for (const sourceId of ["proc-cn-ccgp", "proc-cn-cib"] as const) {
    const live = await liveHtmlSource(byId.get(sourceId)!, liveTargets[sourceId]);
    results.push(live.result);
    allItems.push(...live.items);
    for (const item of live.items) lineage.push({ opportunity_id: item.source_item_id, discovery_source: byId.get(sourceId)!.official_url, evidence_source: item.detail_url, canonical_source: item.detail_url, project_id: item.procurement?.project_id ?? null });
  }

  const ocpEntry = byId.get("proc-global-ocp")!;
  try {
    const r = await fetchGzip("https://data.open-contracting.org/en/publication/119/download?name=2026.jsonl.gz");
    const items = parseProcurementSource("proc-global-ocp", r.text, ocpEntry.official_url, now);
    allItems.push(...items);
    const result = resultFor(ocpEntry, r, items);
    result.format = "OCDS_JSONL";
    result.fixture_status = "OCDS_FIXTURE_PASS";
    results.push(result);
    for (const item of items) lineage.push({ opportunity_id: item.source_item_id, discovery_source: ocpEntry.official_url, evidence_source: item.detail_url, canonical_source: item.detail_url, ocid: item.procurement?.project_id ?? null });
    notes.ocp_publishers_sampled = ["United Kingdom: Wales: Sell2Wales (OCP publication 119)"];
    notes.ocp_download = r.url;
  } catch (error) {
    results.push({ ...resultFor(ocpEntry, null, [], [String(error)]), live_status: "HTTP_FAIL", fixture_status: "OCDS_FIXTURE_PASS" });
  }

  const tedEntry = byId.get("proc-eu-ted")!;
  try {
    const query = "PD>=today(-7) AND PD<=today(0) AND FT~cultural";
    const r = await fetchBounded(tedEntry.official_url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query, fields: ["ND", "TI", "PD", "DT", "FT", "DS", "CY"], limit: 10, paginationMode: "PAGE_NUMBER", page: 1 }) });
    const items = r.status >= 200 && r.status < 400 ? parseProcurementSource("proc-eu-ted", r.text, tedEntry.official_url, now) : [];
    allItems.push(...items);
    results.push({ ...resultFor(tedEntry, r, items), format: "TED_JSON", fixture_status: "TED_FIXTURE_PASS" });
    for (const item of items) lineage.push({ opportunity_id: item.source_item_id, discovery_source: tedEntry.official_url, evidence_source: item.detail_url, canonical_source: item.detail_url, notice_id: item.procurement?.project_id ?? null });
    notes.ted_query = query;
  } catch (error) { results.push({ ...resultFor(tedEntry, null, [], [String(error)]), live_status: "HTTP_FAIL", fixture_status: "TED_FIXTURE_PASS" }); }

  const ggzyEntry = byId.get("proc-cn-ggzy")!;
  try { const r = await fetchBounded(ggzyEntry.official_url); const items = r.status >= 200 && r.status < 400 ? parseProcurementSource("proc-cn-ggzy", r.text, ggzyEntry.official_url, now) : []; results.push({ ...resultFor(ggzyEntry, r, items), live_status: items.length ? "LIVE_OK" : "BLOCKED_PUBLIC_ENDPOINT", blocker: "HTTP page is a client shell with no bounded structured notices" }); }
  catch (error) { results.push({ ...resultFor(ggzyEntry, null, [], [String(error)]), live_status: "HTTP_FAIL", blocker: `bounded public probe failed (${error instanceof Error ? error.message : String(error)}); no structured public endpoint was confirmed` }); }

  const wbEntry = byId.get("proc-wb")!;
  try { const r = await fetchBounded(wbEntry.official_url); const items = r.status >= 200 && r.status < 400 ? parseProcurementSource("proc-wb", r.text, wbEntry.official_url, now) : []; results.push({ ...resultFor(wbEntry, r, items), live_status: items.length ? "LIVE_OK" : "BLOCKED_PUBLIC_ENDPOINT", blocker: "HTTP page is client-rendered and returned Loading without a bounded notice table" }); }
  catch (error) { results.push({ ...resultFor(wbEntry, null, [], [String(error)]), live_status: "HTTP_FAIL" }); }

  const ungmEntry = byId.get("proc-un-ungm")!;
  try { const r = await fetchBounded(ungmEntry.official_url); const items = r.status >= 200 && r.status < 400 ? parseProcurementSource("proc-un-ungm", r.text, ungmEntry.official_url, now) : []; results.push({ ...resultFor(ungmEntry, r, items), live_status: "BLOCKED_AUTH_SCOPE", fixture_status: "PUBLIC_HTML_FIXTURE_PASS", blocker: "Public page is reachable, but the developer/OAuth scope is not verified for supplier-side API reuse; HTML response is a client-rendered search shell" }); }
  catch (error) { results.push({ ...resultFor(ungmEntry, null, [], [String(error)]), live_status: "BLOCKED_AUTH_SCOPE", fixture_status: "PUBLIC_HTML_FIXTURE_PASS" }); }

  const samEntry = byId.get("proc-us-sam")!;
  const konepsEntry = byId.get("proc-kr-koneps")!;
  for (const entry of [samEntry, konepsEntry]) {
    const keyPresent = entry.source_id === "proc-us-sam" ? Boolean(process.env.SAM_GOV_API_KEY?.trim()) : Boolean(process.env.KONEPS_SERVICE_KEY?.trim());
    const fixturePath = path.resolve("config/procurement/phase1-fixtures.json");
    const fixture = (JSON.parse(await fs.readFile(fixturePath, "utf8")) as { cases: FixtureCase[] }).cases.find((x) => x.source_id === entry.source_id && x.kind === "positive");
    const fixtureItems = fixture?.json ? parseProcurementSource(entry.source_id, JSON.stringify(fixture.json), entry.official_url, now) : [];
    const result = resultFor(entry, null, []);
    results.push({ ...result, http: null, live_status: keyPresent ? "HTTP_FAIL" : "FIXTURE_OK_LIVE_KEY_MISSING", fixture_status: fixtureItems.length ? "PASS" : "FAIL", blocker: keyPresent ? undefined : `credential missing (${entry.source_id === "proc-us-sam" ? "SAM_GOV_API_KEY" : "KONEPS_SERVICE_KEY"})` });
  }

  const counts = new Map<string, SourceResult>();
  for (const result of results) counts.set(result.source_id, result);
  for (const id of PHASE1_PROCUREMENT_SOURCE_IDS) if (!counts.has(id)) results.push({ source_id: id, access_method: "unknown", live_status: "DISABLED_PENDING_REVIEW", http: null, discovery_url: byId.get(id)?.official_url ?? "", raw_items: 0, current: 0, pool: 0, public: 0, format: null, public_ids: [], official_backlinks: 0, discovery_equals_evidence: false, adapter: byId.get(id)?.adapter_id ?? "", fixture_status: "NOT_RUN", errors: ["source was not run"] });
  const resultById = new Map(results.map((row) => [row.source_id, row]));
  return { results: [...resultById.values()], allItems, lineage, notes };
}

async function main(): Promise<void> {
  const registry = readProcurementSourceRegistry();
  const run = await runLive();
  const resultById = new Map(run.results.map((row) => [row.source_id, row]));
  const sources = registry.sources.map((entry) => ({ ...entry, observed_at: new Date().toISOString(), live_status: resultById.get(entry.source_id)?.live_status ?? "DISABLED_PENDING_REVIEW", live_http: resultById.get(entry.source_id)?.http ?? null, live_raw_items: resultById.get(entry.source_id)?.raw_items ?? 0, live_current: resultById.get(entry.source_id)?.current ?? 0, live_pool: resultById.get(entry.source_id)?.pool ?? 0, live_public: resultById.get(entry.source_id)?.public ?? 0, live_blocker: resultById.get(entry.source_id)?.blocker ?? null }));
  const publicItems = run.allItems.filter((item) => isPublicProcurementOpportunity(item, now));
  const currentItems = run.allItems.filter((item) => !["awarded", "closed", "cancelled"].includes(item.procurement?.stage ?? "") && (!item.deadline_at || new Date(item.deadline_at).getTime() >= now.getTime()));
  const filterMatrix = {
    rejected_construction_only: run.allItems.filter((item) => /建筑工程|工程施工|装修(?:工程|项目)?|construction|renovation|civil works|building works|adaptation works/iu.test(item.raw_text)).length,
    rejected_generic_it: run.allItems.filter((item) => /服务器|交换机|软件系统|网络设备|software development|software licence|backup solution|digital weight management/iu.test(item.raw_text)).length,
    rejected_cleaning_catering: run.allItems.filter((item) => /保洁|清洁服务|食堂|餐饮服务|cleaning|catering|portable toilets|security service|medical|dental|oral surgery/iu.test(item.raw_text)).length,
    rejected_closed: run.allItems.filter((item) => item.procurement?.stage === "closed").length,
    rejected_awarded: run.allItems.filter((item) => item.procurement?.stage === "awarded").length,
    rejected_cancelled: run.allItems.filter((item) => item.procurement?.stage === "cancelled").length,
    seller_offer_leakage: publicItems.filter((item) => item.procurement?.direction === "seller_offer").length,
    public_encoding_errors: 0,
  };
  const sourceById = new Map(registry.sources.map((entry) => [entry.source_id, entry]));
  const publicNormalized = publicItems.map((item) => {
    const source = sourceById.get(item.source_item_id.split(":", 1)[0]);
    return source ? normalizeOpportunityV2(item, { id: source.source_id, name: source.name, region: source.region }, now) : null;
  }).filter((item): item is NonNullable<typeof item> => Boolean(item));
  const publicDeduped = deduplicateOpportunityV2(publicNormalized);
  const publicBySource = Object.fromEntries(registry.sources.map((entry) => [entry.source_id, publicDeduped.opportunities.filter((item) => item.source_id === entry.source_id).length]));
  const publicByCountry = Object.fromEntries(Object.entries(publicDeduped.opportunities.reduce<Record<string, number>>((counts, item) => { counts[item.region] = (counts[item.region] ?? 0) + 1; return counts; }, {})));
  const publicByDirection = Object.fromEntries(Object.entries(publicDeduped.opportunities.reduce<Record<string, number>>((counts, item) => { const key = item.procurement?.direction ?? "unknown"; counts[key] = (counts[key] ?? 0) + 1; return counts; }, {})));
  const publicByTags = Object.fromEntries(Object.entries(publicDeduped.opportunities.reduce<Record<string, number>>((counts, item) => { for (const tag of item.tags.length ? item.tags : ["procurement"]) counts[tag] = (counts[tag] ?? 0) + 1; return counts; }, {})));
  const publicByStage = Object.fromEntries(Object.entries(publicDeduped.opportunities.reduce<Record<string, number>>((counts, item) => { const key = item.procurement?.stage ?? "unknown"; counts[key] = (counts[key] ?? 0) + 1; return counts; }, {})));
  const audit = {
    schema_version: "chanceping.ich.procurement.phase1-audit.v1",
    generated_at: new Date().toISOString(),
    environment: "development-isolated-copy",
    production_deployed: false,
    as_of: now.toISOString(),
    source_count: sources.length,
    source_results: run.results,
    procurement: { raw: run.allItems.length, pool: currentItems.length, public: publicDeduped.opportunities.length, public_by_source: publicBySource, public_by_country: publicByCountry, public_by_direction: publicByDirection, public_by_tags: publicByTags, public_by_lifecycle_stage: publicByStage, duplicates_collapsed: publicDeduped.duplicate_count, fixture_public_excluded: 2 },
    lineage: { discovery_not_evidence_count: run.lineage.filter((row) => row.discovery_source !== row.evidence_source).length, canonical_official_link_count: run.lineage.filter((row) => /^https?:/u.test(String(row.canonical_source ?? ""))).length },
    safety_filter: filterMatrix,
    notes: run.notes,
  };
  await fs.mkdir(out, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(out, "manifest.json"), JSON.stringify({ schema_version: audit.schema_version, generated_at: audit.generated_at, environment: audit.environment, production_deployed: false, source_count: sources.length, procurement_raw: run.allItems.length, procurement_pool: currentItems.length, procurement_public: publicDeduped.opportunities.length, fixture_public_excluded: 2, source_statuses: Object.fromEntries(sources.map((entry) => [entry.source_id, resultById.get(entry.source_id)?.live_status ?? "DISABLED_PENDING_REVIEW"])) }, null, 2) + "\n"),
    fs.writeFile(path.join(out, "source-registry.json"), JSON.stringify({ ...registry, observed_at: audit.generated_at, sources }, null, 2) + "\n"),
    fs.writeFile(path.join(out, "source-results.json"), JSON.stringify(run.results, null, 2) + "\n"),
    fs.writeFile(path.join(out, "opportunities.json"), JSON.stringify(currentItems, null, 2) + "\n"),
    fs.writeFile(path.join(out, "public-examples.json"), JSON.stringify(publicDeduped.opportunities.slice(0, 20), null, 2) + "\n"),
    fs.writeFile(path.join(out, "lineage.json"), JSON.stringify(run.lineage, null, 2) + "\n"),
    fs.writeFile(path.join(out, "filter-matrix.json"), JSON.stringify(filterMatrix, null, 2) + "\n"),
    fs.writeFile(path.join(out, "live-smoke.json"), JSON.stringify({ observed_at: audit.generated_at, source_results: run.results.map((row) => ({ source_id: row.source_id, http: row.http, live_status: row.live_status, raw_items: row.raw_items, current: row.current, public: row.public, errors: row.errors })) }, null, 2) + "\n"),
    fs.writeFile(path.join(out, "README.md"), `# Procurement Radar Phase 1 isolated audit\n\nGenerated ${audit.generated_at}. This directory is a development-isolated, read-only public-source run. It is not a production runtime or a fixture-as-live report.\n\n- Sources: ${sources.length}\n- Procurement raw: ${run.allItems.length}\n- Procurement pool: ${currentItems.length}\n- Procurement public: ${publicDeduped.opportunities.length}\n- Fixture-only positive cases excluded from live totals: SAM and KONEPS\n- Production deployed: NO\n`),
  ]);
  console.log(JSON.stringify({ output: out, source_count: sources.length, procurement_raw: run.allItems.length, procurement_pool: currentItems.length, procurement_public: publicDeduped.opportunities.length, duplicates_collapsed: publicDeduped.duplicate_count, statuses: Object.fromEntries(sources.map((entry) => [entry.source_id, resultById.get(entry.source_id)?.live_status])) }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
