import fs from "node:fs";
import path from "node:path";
import { hasEncodingCorruption } from "../src/ich/aggregation/adapters/common";

const baseUrl = (process.env.CHANCEPING_AUDIT_BASE_URL ?? "https://ich.chanceping.com").replace(/\/$/u, "");
const outputDir = path.resolve(process.env.CHANCEPING_AUDIT_OUTPUT ?? process.argv[2] ?? "audits/ich/production/latest");
const productionCommit = process.env.CHANCEPING_PRODUCTION_COMMIT ?? process.argv[3] ?? null;
const capturedAt = new Date().toISOString();

interface CapturedResponse {
  path: string;
  url: string;
  status: number;
  content_type: string;
  body: string;
  error?: string;
}

async function capture(route: string): Promise<CapturedResponse> {
  const url = `${baseUrl}${route}`;
  try {
    const response = await fetch(url, { headers: { "user-agent": "ChancePing-ICH-Readonly-Audit/1.0" } });
    return { path: route, url, status: response.status, content_type: response.headers.get("content-type") ?? "", body: await response.text() };
  } catch (error) {
    return { path: route, url, status: 0, content_type: "", body: "", error: error instanceof Error ? error.message : String(error) };
  }
}

function jsonBody<T>(response: CapturedResponse): T | null {
  try { return JSON.parse(response.body) as T; } catch { return null; }
}

function write(name: string, value: string): void {
  fs.writeFileSync(path.join(outputDir, name), value, "utf8");
}

async function main(): Promise<void> {
  fs.mkdirSync(outputDir, { recursive: true });
  const filterCases = [
    { key: "memo", route: "/ich/memo" },
    { key: "direction_cultural_creative", route: "/ich/memo?direction=cultural_creative" },
    { key: "work_format_product_design", route: "/ich/memo?work_format=product_design" },
    { key: "status_current", route: "/ich/memo?status=current" },
    { key: "status_deadline_tbd", route: "/ich/memo?status=deadline_tbd" },
    { key: "sort_nearest", route: "/ich/memo?sort=nearest" },
    { key: "source_whaleideas", route: "/ich/memo?source_id=whaleideas-competition" },
    { key: "direction_format_status", route: "/ich/memo?direction=cultural_creative&work_format=product_design&status=current" },
  ];
  const responses = await Promise.all([
    capture("/health"),
    capture("/ich"),
    capture("/ich/memo"),
    capture("/ich/memo.json"),
    capture("/ich/memo.md"),
    capture("/api/opportunity-v2/radar?category=competition"),
    capture("/api/opportunity-v2/sources"),
    capture("/api/opportunity-v2/sources/overview"),
    ...filterCases.flatMap(({ route }) => [capture(route), capture(route.replace("/ich/memo", "/ich/memo.json")), capture(route.replace("/ich/memo", "/ich/memo.md"))]),
  ]);
  const byPath = new Map(responses.map((response) => [response.path, response]));
  const home = byPath.get("/ich")!;
  const memoHtml = byPath.get("/ich/memo")!;
  const memoJsonResponse = byPath.get("/ich/memo.json")!;
  const memoMarkdown = byPath.get("/ich/memo.md")!;
  const radarResponse = byPath.get("/api/opportunity-v2/radar?category=competition")!;
  const sourceResponse = byPath.get("/api/opportunity-v2/sources")!;
  const overviewResponse = byPath.get("/api/opportunity-v2/sources/overview")!;
  const memo = jsonBody<{ snapshot_id?: string; total?: number; items?: Array<{ id: string; title: string; original_title?: string | null; summary?: string; original_summary?: string | null; detail_url: string; source_name: string; source_id?: string; deadline?: string | null; discovered_by_sources?: string[] }> }>(memoJsonResponse);
  const radar = jsonBody<{ total?: number; opportunities?: Array<{ id: string; title: string; summary?: string; source_name: string; source_id?: string; region: string; status?: string }> }>(radarResponse);
  const sources = jsonBody<{ sources?: Array<{ id: string; name: string; status: string }> }>(sourceResponse);
  const overview = jsonBody<{ summary?: Record<string, number>; next_run_at?: string | null }>(overviewResponse);
  const memoItems = memo?.items ?? [];
  const radarItems = radar?.opportunities ?? [];
  const sourceNames = new Set((sources?.sources ?? []).map((source) => source.name));
  const memoIds = new Set(memoItems.map((item) => item.id));
  const markdownIds = [...memoMarkdown.body.matchAll(/^\|\s*(oppv2_[^|\s]+)\s*\|/gmu)].map((match) => match[1]);
  const noisyTitle = /^(?:privacy policy|terms(?: of use| of sale)?|press(?: & media)?|advertising|archives?|renew my membership|submit a listing|podcast|中文\s*zh)$/iu;
  const loewe = memoItems.filter((item) => /loewe.*craft prize|craft prize.*loewe/iu.test(item.title));
  const checks = {
    http_all_200: responses.every((response) => response.status === 200),
    source_pool_visible: Array.isArray(sources?.sources) && sources.sources.length > 0,
    source_count: sources?.sources?.length ?? null,
    home_competition_total: Number(home.body.match(/(?:可浏览赛事|可浏览机会)：\s*(\d+)/u)?.[1] ?? NaN),
    radar_competition_total: radar?.total ?? null,
    memo_total: memo?.total ?? null,
    memo_json_markdown_same_ids: memoIds.size === markdownIds.length && [...memoIds].every((id) => markdownIds.includes(id)),
    memo_location_column_removed: !/赛事所在地|地点待补充/gu.test(memoHtml.body),
    memo_noise_hidden: memoItems.every((item) => !noisyTitle.test(item.title)),
    loewe_visible_once: loewe.length === 1,
    loewe_sources: loewe[0]?.discovered_by_sources ?? [],
    named_sources_visible: ["Craft Scotland", "Heritage Crafts", "ASEF culture360 Opportunities"].filter((name) => sourceNames.has(name)),
    no_expired_default_radar: radarItems.every((item) => item.status !== "EXPIRED"),
    home_and_radar_counts_match: false,
    encoding_quality_memo_errors: null as number | null,
    encoding_quality_radar_errors: null as number | null,
  };
  checks.home_and_radar_counts_match = Number.isFinite(checks.home_competition_total) && checks.home_competition_total === checks.radar_competition_total;
  const poolPath = process.env.CHANCEPING_AUDIT_POOL_PATH;
  const poolEncoding = (() => {
    if (!poolPath || !fs.existsSync(poolPath)) return { errors: 0, by_source: {} as Record<string, { errors: number; sample_ids: string[] }>, sample_ids: [] as string[] };
    try {
      const pool = JSON.parse(fs.readFileSync(poolPath, "utf8")) as { opportunities?: Array<{ id: string; source_id: string; title?: string; summary?: string }> };
      const bySource: Record<string, { errors: number; sample_ids: string[] }> = {};
      const sampleIds: string[] = [];
      for (const item of pool.opportunities ?? []) {
        const error = hasEncodingCorruption(item.title) || hasEncodingCorruption(item.summary);
        if (!error) continue;
        const row = bySource[item.source_id] ?? { errors: 0, sample_ids: [] };
        row.errors += 1;
        if (row.sample_ids.length < 10) row.sample_ids.push(item.id);
        if (sampleIds.length < 20) sampleIds.push(item.id);
        bySource[item.source_id] = row;
      }
      return { errors: sampleIds.length ? Object.values(bySource).reduce((total, row) => total + row.errors, 0) : 0, by_source: bySource, sample_ids: sampleIds };
    } catch {
      return { errors: 0, by_source: {} as Record<string, { errors: number; sample_ids: string[] }>, sample_ids: [] as string[] };
    }
  })();
  const endpointEncoding = (items: Array<{ id: string; title?: string; original_title?: string | null; summary?: string; original_summary?: string | null; source_id?: string }>) => {
    const bySource: Record<string, { errors: number; sample_ids: string[] }> = {};
    const sampleIds: string[] = [];
    for (const item of items) {
      const error = hasEncodingCorruption(item.original_title ?? item.title) || hasEncodingCorruption(item.original_summary ?? item.summary);
      if (!error) continue;
      const source = item.source_id ?? "unknown";
      const row = bySource[source] ?? { errors: 0, sample_ids: [] };
      row.errors += 1;
      if (row.sample_ids.length < 10) row.sample_ids.push(item.id);
      if (sampleIds.length < 20) sampleIds.push(item.id);
      bySource[source] = row;
    }
    return { errors: sampleIds.length ? Object.values(bySource).reduce((total, row) => total + row.errors, 0) : 0, by_source: bySource, sample_ids: sampleIds };
  };
  const memoEncoding = endpointEncoding(memoItems);
  const radarEncoding = endpointEncoding(radarItems);
  const encodingQuality = {
    pool_encoding_errors: poolEncoding.errors,
    memo_encoding_errors: memoEncoding.errors,
    radar_encoding_errors: radarEncoding.errors,
    by_source: { pool: poolEncoding.by_source, memo: memoEncoding.by_source, radar: radarEncoding.by_source },
    sample_ids: { pool: poolEncoding.sample_ids, memo: memoEncoding.sample_ids, radar: radarEncoding.sample_ids },
    gate: memoEncoding.errors === 0 && radarEncoding.errors === 0,
  };
  checks.encoding_quality_memo_errors = encodingQuality.memo_encoding_errors;
  checks.encoding_quality_radar_errors = encodingQuality.radar_encoding_errors;
  const filterMatrix = filterCases.map(({ key, route }) => {
    const html = byPath.get(route);
    const jsonRoute = route.replace("/ich/memo", "/ich/memo.json");
    const markdownRoute = route.replace("/ich/memo", "/ich/memo.md");
    const json = byPath.get(jsonRoute);
    const markdown = byPath.get(markdownRoute);
    const parsed = json ? jsonBody<{ total?: number; items?: Array<{ id: string }> }>(json) : null;
    const jsonIds = parsed?.items?.map((item) => item.id) ?? [];
    const markdownIdsForRoute = markdown ? [...markdown.body.matchAll(/^\|\s*(oppv2_[^|\s]+)\s*\|/gmu)].map((match) => match[1]) : [];
    const htmlIds = html ? [...html.body.matchAll(/data-opportunity-id="([^"]+)"/gu)].map((match) => match[1]) : [];
    const likelyFilter = key !== "memo" && !key.startsWith("sort_");
    return { key, url: `${baseUrl}${route}`, status: html?.status ?? 0, total: parsed?.total ?? htmlIds.length, first10_ids: jsonIds.slice(0, 10), html_ids_same: JSON.stringify(htmlIds) === JSON.stringify(jsonIds), json_markdown_ids_same: JSON.stringify(jsonIds) === JSON.stringify(markdownIdsForRoute), suspicious_unchanged: likelyFilter && jsonIds.length === memoIds.size && jsonIds.every((id) => memoIds.has(id)) };
  });
  const deadlineCoverage = { memo_total: memo?.total ?? memoItems.length, known_deadline: memoItems.filter((item) => item.deadline).length, unknown_deadline: memoItems.filter((item) => !item.deadline).length, coverage_rate: memoItems.length ? Number(((memoItems.filter((item) => item.deadline).length / memoItems.length) * 100).toFixed(2)) : 0 };
  const sourceCoverage = { captured_at: capturedAt, sources: sources?.sources ?? [], overview: overview?.summary ?? null };
  const deadlineResolution = (() => {
    if (!poolPath || !fs.existsSync(poolPath)) return { captured_at: capturedAt, source_health: sourceCoverage.overview };
    try {
      const pool = JSON.parse(fs.readFileSync(poolPath, "utf8")) as { opportunities?: Array<{ source_id: string; deadline?: string | null; deadline_resolution?: string; deadline_conflicts?: unknown[]; status?: string }> };
      const byResolution: Record<string, number> = {};
      const bySource: Record<string, { records: number; known: number; unknown: number; conflicts: number }> = {};
      for (const item of pool.opportunities ?? []) {
        const resolution = item.deadline_resolution ?? (item.deadline ? "found" : "not_recorded");
        byResolution[resolution] = (byResolution[resolution] ?? 0) + 1;
        const row = bySource[item.source_id] ?? { records: 0, known: 0, unknown: 0, conflicts: 0 };
        row.records += 1;
        row.known += item.deadline ? 1 : 0;
        row.unknown += item.deadline ? 0 : 1;
        row.conflicts += item.deadline_conflicts?.length ?? 0;
        bySource[item.source_id] = row;
      }
      return { captured_at: capturedAt, pool_path: poolPath, total: pool.opportunities?.length ?? 0, by_resolution: byResolution, by_source: bySource };
    } catch (error) {
      return { captured_at: capturedAt, error: error instanceof Error ? error.message : String(error) };
    }
  })();
  const manifest = {
    schema_version: "chanceping.ich.readonly-audit.v1",
    captured_at: capturedAt,
    base_url: baseUrl,
    production_commit: productionCommit,
    production_read_only: true,
    no_runtime_writes: true,
    endpoints: responses.map(({ path: route, url, status, content_type, error }) => ({ path: route, url, status, content_type, ...(error ? { error } : {}) })),
    counts: { sources: checks.source_count, radar_competitions: checks.radar_competition_total, memo_competitions: checks.memo_total, memo_known_source_names: sourceNames.size },
    source_overview_summary: overview?.summary ?? null,
    next_run_at: overview?.next_run_at ?? null,
    deadline_coverage: deadlineCoverage,
    filter_matrix: filterMatrix,
    checks,
    encoding_quality: encodingQuality,
    complete: checks.http_all_200 && checks.source_pool_visible && checks.memo_json_markdown_same_ids && checks.memo_location_column_removed && checks.memo_noise_hidden && checks.loewe_visible_once && checks.home_and_radar_counts_match && encodingQuality.gate,
    files: ["manifest.json", "checks.json", "home.html", "memo.html", "memo.json", "memo.md", "radar.json", "sources.json", "source-overview.json", "deadline-resolution.json", "source-coverage.json", "filter-matrix.json", "encoding-quality.json"],
  };
  write("manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);
  write("checks.json", `${JSON.stringify(checks, null, 2)}\n`);
  write("home.html", home.body);
  write("memo.html", memoHtml.body);
  write("memo.json", memoJsonResponse.body);
  write("memo.md", memoMarkdown.body);
  write("radar.json", radarResponse.body);
  write("sources.json", sourceResponse.body);
  write("source-overview.json", overviewResponse.body);
  write("deadline-resolution.json", `${JSON.stringify(deadlineResolution, null, 2)}\n`);
  write("source-coverage.json", `${JSON.stringify(sourceCoverage, null, 2)}\n`);
  write("filter-matrix.json", `${JSON.stringify(filterMatrix, null, 2)}\n`);
  write("encoding-quality.json", `${JSON.stringify(encodingQuality, null, 2)}\n`);
  write("README.md", `# 盯非遗生产只读巡检快照\n\n- 抓取时间：${capturedAt}\n- 生产地址：${baseUrl}\n- 生产 commit：${productionCommit ?? "未提供"}\n- 只读：是；运行时写入：否\n- 完整性：**${manifest.complete ? "通过" : "未通过"}**\n\n机器结果见 [manifest.json](./manifest.json)、[checks.json](./checks.json) 和 [encoding-quality.json](./encoding-quality.json)。页面副本见 [home.html](./home.html)、[memo.html](./memo.html)，接口副本见 [memo.json](./memo.json)、[memo.md](./memo.md)、[radar.json](./radar.json)。\n`);
  console.log(JSON.stringify({ complete: manifest.complete, output_dir: outputDir, counts: manifest.counts, checks }, null, 2));
  if (!manifest.complete) process.exitCode = 1;
}

void main();
