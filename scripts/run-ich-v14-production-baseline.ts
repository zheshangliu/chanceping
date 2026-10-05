import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { extractCardTranslationStatuses, extractMemoTranslationStatuses, extractOpportunityIds, extractProductionHealthVersion, sameStringSet, uniqueSortedIds } from "../src/opportunity-v2/v14-baseline";
import { isForeignLanguageOpportunity } from "../src/opportunity-v2/display";
import type { OpportunityV2 } from "../src/opportunity-v2/types";

type JsonObject = Record<string, unknown>;
interface HttpObservation { status: number; content_type: string; body: string; }
interface PageObservation { path: string; status: number; ids: string[]; translation_statuses: Array<{ id: string; status: string }>; pages_read: number; }

const baseUrl = (process.env.CHANCEPING_V14_PRODUCTION_BASE_URL ?? "https://ich.chanceping.com").replace(/\/$/u, "");
const generatedAt = new Date().toISOString();
const runId = generatedAt.replace(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z");
const outputDir = path.resolve(process.env.CHANCEPING_V14_AUDIT_DIR ?? `audits/ich/v14/${runId}`);
const observations: Record<string, HttpObservation> = {};

function isObject(value: unknown): value is JsonObject { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function readArray(value: unknown, key: string): JsonObject[] {
  if (!isObject(value) || !Array.isArray(value[key])) return [];
  return (value[key] as unknown[]).filter(isObject);
}
function idsOf(value: unknown, key: string): string[] {
  return readArray(value, key).map((row) => String(row.id ?? "")).filter(Boolean).sort();
}
function jsonOf(result: HttpObservation): JsonObject {
  try { const parsed: unknown = JSON.parse(result.body); return isObject(parsed) ? parsed : {}; } catch { return {}; }
}
async function get(pathname: string): Promise<HttpObservation> {
  const response = await fetch(new URL(pathname, `${baseUrl}/`), { signal: AbortSignal.timeout(30000), redirect: "follow" });
  return { status: response.status, content_type: response.headers.get("content-type") ?? "", body: await response.text() };
}
async function probeStatusOnly(pathname: string, headers?: Record<string, string>): Promise<number> {
  const response = await fetch(new URL(pathname, `${baseUrl}/`), { headers, signal: AbortSignal.timeout(30000), redirect: "follow" });
  const status = response.status;
  await response.body?.cancel();
  return status;
}

async function crawlHtml(pathname: string): Promise<PageObservation> {
  const collected: string[] = [];
  const statuses: Array<{ id: string; status: string }> = [];
  const previousPages = new Set<string>();
  let finalStatus = 0;
  let pagesRead = 0;
  for (let page = 1; page <= 250; page += 1) {
    const url = new URL(pathname, `${baseUrl}/`);
    url.searchParams.set("page", String(page));
    const result = await get(`${url.pathname}${url.search}`);
    finalStatus = result.status;
    if (result.status !== 200) break;
    pagesRead += 1;
    const ids = extractOpportunityIds(result.body);
    const signature = ids.join("|");
    if (!ids.length || previousPages.has(signature)) break;
    previousPages.add(signature);
    collected.push(...ids);
    statuses.push(...extractCardTranslationStatuses(result.body), ...extractMemoTranslationStatuses(result.body));
  }
  return { path: pathname, status: finalStatus, ids: uniqueSortedIds([collected]), translation_statuses: statuses, pages_read: pagesRead };
}

async function main(): Promise<void> {
  const [healthResponse, sourceResponse, radarResponse, opportunitiesResponse, procurementResponse, coverageResponse, memoResponse] = await Promise.all([
    get("/health"),
    get("/api/opportunity-v2/sources/overview"),
    get("/api/opportunity-v2/radar?limit=500&page=1"),
    get("/api/opportunity-v2/opportunities?limit=500&page=1"),
    get("/api/opportunity-v2/workbench/opportunities?limit=500"),
    get("/api/opportunity-v2/workbench/coverage?limit=500"),
    get("/ich/memo.json"),
  ]);
  observations.health = healthResponse;
  observations.sources = sourceResponse;
  observations.radar = radarResponse;
  observations.opportunities = opportunitiesResponse;
  observations.procurement = procurementResponse;
  observations.coverage = coverageResponse;
  observations.memo_json = memoResponse;
  const pagePaths = {
    competition: "/ich?category=competition&status=browse",
    overseas: "/ich?category=competition&region=overseas&status=browse",
    procurement: "/ich?category=procurement_project&status=browse",
    exhibition_market: "/ich?category=exhibition_market&status=browse",
    channel_collaboration: "/ich?category=channel_collaboration&status=browse",
    policy_funding: "/ich?category=policy_funding&status=browse",
    international: "/ich?category=international&status=browse",
    procurement_workbench: "/ich/procurement",
    coverage_workbench: "/ich/opportunities",
    memo_html: "/ich/memo",
  };
  const pageEntries = await Promise.all(Object.entries(pagePaths).map(async ([key, pagePath]) => [key, await crawlHtml(pagePath)] as const));
  const pages = Object.fromEntries(pageEntries) as Record<string, PageObservation>;
  const memoMarkdown = await get("/ich/memo.md");
  observations.memo_markdown = memoMarkdown;
  const privateFollowupProbes = {
    anonymous_list_http: await probeStatusOnly("/api/opportunity-v2/workbench/followups"),
    forged_query_http: await probeStatusOnly("/api/opportunity-v2/workbench/followups?user_id=v14-audit-placeholder"),
    forged_header_http: await probeStatusOnly("/api/opportunity-v2/workbench/followups/oppv2-v14-placeholder", { "x-business-user": "v14-audit-placeholder" }),
    response_bodies_read: false,
    placeholder_identity: "v14-audit-placeholder",
  };
  const radar = jsonOf(radarResponse);
  const memo = jsonOf(memoResponse);
  const sourceOverview = jsonOf(sourceResponse);
  const poolItems = readArray(radar, "opportunities") as unknown as OpportunityV2[];
  const sources = readArray(sourceOverview, "rows");
  const memoItems = readArray(memo, "items");
  const rawForeignRadar = poolItems.filter((item) => isForeignLanguageOpportunity(item));
  const rawForeignMemo = memoItems.filter((item) => isForeignLanguageOpportunity({ title: String(item.title ?? ""), summary: String(item.summary ?? "") }));
  const competitionIds = uniqueSortedIds([pages.competition.ids, pages.overseas.ids]);
  const memoHtmlStatusById = new Map(pages.memo_html.translation_statuses.map((row) => [row.id, row.status]));
  const htmlCardStatusById = new Map([...pages.competition.translation_statuses, ...pages.overseas.translation_statuses, ...pages.procurement.translation_statuses].map((row) => [row.id, row.status]));
  const countRendered = (ids: string[], foreignIds: Set<string>, statusById: Map<string, string>) => {
    const candidates = ids.filter((id) => foreignIds.has(id));
    const counts = { visible_foreign_title_candidates: candidates.length, translated: 0, pending: 0, failed: 0, unlabeled_or_unverified: 0, no_rendered_card: 0 };
    for (const id of candidates) {
      const status = statusById.get(id);
      if (status === "translated") counts.translated += 1;
      else if (status === "pending") counts.pending += 1;
      else if (status === "failed") counts.failed += 1;
      else if (status === "unlabeled") counts.unlabeled_or_unverified += 1;
      else counts.no_rendered_card += 1;
    }
    return counts;
  };
  const radarForeignIds = new Set(rawForeignRadar.map((item) => item.id));
  const memoForeignIds = new Set(rawForeignMemo.map((item) => String(item.id ?? "")));
  const renderedTranslation = {
    public_competition_and_overseas: countRendered(competitionIds, radarForeignIds, htmlCardStatusById),
    public_procurement: countRendered(pages.procurement.ids, radarForeignIds, htmlCardStatusById),
    memo_json_visible: countRendered(pages.memo_html.ids, memoForeignIds, memoHtmlStatusById),
    raw_foreign_title_candidates_radar: rawForeignRadar.length,
    raw_foreign_title_candidates_memo: rawForeignMemo.length,
    per_id_failure_codes: "NOT_PUBLICLY_EXPOSED",
  };
  const sourceSummary = isObject(sourceOverview.summary) ? sourceOverview.summary : {};
  const artconnect = sources.find((source) => source.id === "artconnect-opportunities") ?? null;
  const apiIds = idsOf(radar, "opportunities");
  const memoIds = idsOf(memo, "items");
  const memoMarkdownIds = extractOpportunityIds(memoMarkdown.body);
  const memoHtmlIds = pages.memo_html.ids;
  const unionIds = uniqueSortedIds([apiIds, memoIds, ...Object.values(pages).map((page) => page.ids)]);
  const detailSampleId = pages.competition.ids[0] ?? memoIds[0] ?? "";
  const detailResponse = detailSampleId ? await get(`/ich/opportunities/${encodeURIComponent(detailSampleId)}`) : { status: 404, content_type: "", body: "" };
  observations.detail_sample = detailResponse;
  const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const productionVersion = jsonOf(healthResponse);
  const resultStatus = Object.fromEntries(Object.entries(observations).map(([name, result]) => [name, result.status]));
  const baseline = {
    schema_version: "chanceping.ich.v14.production-baseline.v1",
    generated_at: generatedAt,
    production_base_url: baseUrl,
    observed_candidate_head: head,
    http_status: resultStatus,
    production_version: productionVersion,
    source_summary: sourceSummary,
    next_run_at: sourceOverview.next_run_at ?? null,
    source_ids_and_states: sources.map((row) => ({ id: row.id, name: row.name, enabled: row.enabled, status: row.status, last_attempt_at: row.last_attempt_at ?? null, last_success_at: row.last_success_at ?? null, items_seen: row.items_seen ?? null, current_contribution: row.current_contribution ?? null })),
    surfaces: Object.fromEntries(Object.entries(pages).map(([key, value]) => [key, { path: value.path, http_status: value.status, pages_read: value.pages_read, total: value.ids.length, ids: value.ids }])),
    api: {
      radar_total: Number(radar.total ?? 0), radar_ids: apiIds,
      opportunities_total: Number(jsonOf(opportunitiesResponse).total ?? 0), opportunities_ids: idsOf(jsonOf(opportunitiesResponse), "opportunities"),
      procurement_total: Number(jsonOf(procurementResponse).total ?? 0), procurement_ids: idsOf(jsonOf(procurementResponse), "opportunities"),
      coverage_total: Number(jsonOf(coverageResponse).total ?? 0), coverage_ids: idsOf(jsonOf(coverageResponse), "opportunities"),
      memo_total: Number(memo.total ?? 0), memo_ids: memoIds,
      memo_markdown_ids: memoMarkdownIds,
      memo_html_all_page_ids: memoHtmlIds,
      memo_json_markdown_parity: memoIds.length > 0 && sameStringSet(memoIds, memoMarkdownIds),
      memo_html_is_subset_of_json: memoHtmlIds.every((id) => memoIds.includes(id)),
    },
    private_followup_access_probes: privateFollowupProbes,
    translation_visibility: {
      ...renderedTranslation,
      limitation: "Production translation sidecar and per-ID internal failure codes are not exposed by public endpoints; no private runtime was read.",
    },
    all_public_ids_unique_union: unionIds,
    all_public_ids_unique_union_count: unionIds.length,
    artconnect: artconnect ? { id: artconnect.id, enabled: artconnect.enabled, status: artconnect.status, last_success_at: artconnect.last_success_at ?? null, items_seen: artconnect.items_seen ?? null, current_contribution: artconnect.current_contribution ?? null, permission_state: "NOT_EXPOSED_AND_NO_WRITTEN_AUTHORIZATION_FOUND" } : { id: "artconnect-opportunities", registered: false, permission_state: "NOT_EXPOSED_AND_NO_WRITTEN_AUTHORIZATION_FOUND" },
  };
  const failedEndpoints = Object.entries(resultStatus).filter(([, status]) => status !== 200).map(([name, status]) => ({ name, status }));
  const consistencyFailures = [
    ...(baseline.api.memo_json_markdown_parity ? [] : ["Memo JSON and Markdown ID sets differ"]),
    ...(baseline.api.memo_html_is_subset_of_json ? [] : ["Memo HTML contains IDs absent from JSON"]),
  ];
  fs.mkdirSync(outputDir, { recursive: true });
  const write = (name: string, value: unknown): void => fs.writeFileSync(path.join(outputDir, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
  write("baseline.json", baseline);
  write("capability-inventory.json", {
    schema_version: "chanceping.ich.v14.capability-inventory.v1",
    generated_at: generatedAt,
    candidate_head: head,
    known_existing: ["OpportunityV2 public APIs", "V2 source overview and scheduler timestamp", "DeepSeek display translation CLI", "translation sidecar support in code", "procurement and coverage workbench", "follow-up sidecar and change feed", "protected GitHub production workflow"],
    production_observed: { health_version: extractProductionHealthVersion(productionVersion), source_count: sourceSummary.registered ?? null, pool_count: radar.total ?? null, memo_count: memo.total ?? null, page_sets: Object.fromEntries(Object.entries(pages).map(([key, value]) => [key, value.ids.length])) },
    not_publicly_observable: ["private translation sidecar contents and per-ID quality failure codes", "actual systemd timer enabled/active state", "production runtime files and file hashes", "server-side authenticated end-user identity", "ArtConnect written automation/redistribution authorization"],
    endpoints_with_non_200: failedEndpoints,
  });
  write("runtime-contract.json", {
    schema_version: "chanceping.ich.v14.runtime-contract.v1",
    generated_at: generatedAt,
    expected_production_paths_from_existing_contract: ["/var/lib/chanceping/opportunity-v2/sources.json", "/var/lib/chanceping/opportunity-v2/opportunities.json", "/var/lib/chanceping/opportunity-v2/source-health.json", "/var/lib/chanceping/opportunity-v2/translations.json", "/var/lib/chanceping/opportunity-v2/scheduler.json", "/var/lib/chanceping/opportunity-v2/procurement-followups.json", "/var/lib/chanceping/opportunity-v2/procurement-change-feed.json"],
    public_observations: { source_registry_count: sourceSummary.registered ?? null, public_pool_count: radar.total ?? null, scheduler_next_run_at: sourceOverview.next_run_at ?? null },
    application_process_path_verified: false,
    translation_cli_runtime_path_verified: false,
    scheduler_file_path_and_timer_state_verified: false,
    same_runtime_read_write_contract: "NOT_VERIFIED; public API cannot expose file paths or hashes",
  });
  write("permissions-readiness.json", {
    schema_version: "chanceping.ich.v14.permissions-readiness.v1",
    generated_at: generatedAt,
    status: "ACCESS_BLOCKED",
    production_fetch_post: { status: 403, code: "FORBIDDEN", message: "需要后台权限", interpretation: "caller credential absent/invalid; does not prove server token is unconfigured" },
    authorized_translation_runner: "NOT_FOUND",
    authorized_runtime_read_runner: "NOT_FOUND",
    protected_deployment: "WORKFLOW_EXISTS_BUT_IS_NOT_A_RUNTIME_TRANSLATION_OR_FETCH_RUNNER",
    no_bypass_used: true,
  });
  write("translation-failures.json", {
    schema_version: "chanceping.ich.v14.translation-failures.v1",
    generated_at: generatedAt,
    status: "PRIVATE_SIDECAR_UNAVAILABLE",
    current_api_foreign_title_candidates_radar: rawForeignRadar.length,
    current_api_foreign_title_candidates_memo: rawForeignMemo.length,
    current_rendered_status_counts: renderedTranslation,
    per_id_failures: null,
    historical_477_id_baseline: "BASELINE_IDS_UNAVAILABLE; public endpoints do not expose the historical IDs or private translation cache",
  });
  const gateFailures = [...failedEndpoints.map((entry) => `${entry.name} HTTP ${entry.status}`), ...consistencyFailures];
  console.log(JSON.stringify({ output_dir: outputDir, candidate_head: head, health: resultStatus.health, sources: sourceSummary.registered ?? null, radar: radar.total ?? null, memo: memo.total ?? null, pages: Object.fromEntries(Object.entries(pages).map(([key, value]) => [key, value.ids.length])), memo_json_markdown_parity: baseline.api.memo_json_markdown_parity, consistency_failures: consistencyFailures, status: gateFailures.length ? "FAIL" : "PASS" }, null, 2));
  if (gateFailures.length) process.exitCode = 1;
}

void main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
