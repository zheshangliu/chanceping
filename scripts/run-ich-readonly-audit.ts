import fs from "node:fs";
import path from "node:path";

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
  const responses = await Promise.all([
    capture("/health"),
    capture("/ich"),
    capture("/ich/memo"),
    capture("/ich/memo.json"),
    capture("/ich/memo.md"),
    capture("/api/opportunity-v2/radar?category=competition"),
    capture("/api/opportunity-v2/sources"),
    capture("/api/opportunity-v2/sources/overview"),
  ]);
  const byPath = new Map(responses.map((response) => [response.path, response]));
  const home = byPath.get("/ich")!;
  const memoHtml = byPath.get("/ich/memo")!;
  const memoJsonResponse = byPath.get("/ich/memo.json")!;
  const memoMarkdown = byPath.get("/ich/memo.md")!;
  const radarResponse = byPath.get("/api/opportunity-v2/radar?category=competition")!;
  const sourceResponse = byPath.get("/api/opportunity-v2/sources")!;
  const overviewResponse = byPath.get("/api/opportunity-v2/sources/overview")!;
  const memo = jsonBody<{ snapshot_id?: string; total?: number; items?: Array<{ id: string; title: string; detail_url: string; source_name: string; discovered_by_sources?: string[] }> }>(memoJsonResponse);
  const radar = jsonBody<{ total?: number; opportunities?: Array<{ id: string; title: string; source_name: string; region: string; status?: string }> }>(radarResponse);
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
  };
  checks.home_and_radar_counts_match = Number.isFinite(checks.home_competition_total) && checks.home_competition_total === checks.radar_competition_total;
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
    checks,
    complete: checks.http_all_200 && checks.source_pool_visible && checks.memo_json_markdown_same_ids && checks.memo_location_column_removed && checks.memo_noise_hidden && checks.loewe_visible_once && checks.home_and_radar_counts_match,
    files: ["manifest.json", "checks.json", "home.html", "memo.html", "memo.json", "memo.md", "radar.json", "sources.json", "source-overview.json"],
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
  write("README.md", `# 盯非遗生产只读巡检快照\n\n- 抓取时间：${capturedAt}\n- 生产地址：${baseUrl}\n- 生产 commit：${productionCommit ?? "未提供"}\n- 只读：是；运行时写入：否\n- 完整性：**${manifest.complete ? "通过" : "未通过"}**\n\n机器结果见 [manifest.json](./manifest.json) 和 [checks.json](./checks.json)。页面副本见 [home.html](./home.html)、[memo.html](./memo.html)，接口副本见 [memo.json](./memo.json)、[memo.md](./memo.md)、[radar.json](./radar.json)。\n`);
  console.log(JSON.stringify({ complete: manifest.complete, output_dir: outputDir, counts: manifest.counts, checks }, null, 2));
  if (!manifest.complete) process.exitCode = 1;
}

void main();
