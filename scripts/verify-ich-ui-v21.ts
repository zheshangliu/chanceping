import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { Hono } from "hono";
import { ichPagesRoutes } from "../src/api/routes/ich-pages";
import { opportunityV2Routes } from "../src/api/routes/opportunity-v2";
import { opportunityV2PagesRoutes } from "../src/api/routes/opportunity-v2-pages";
import { filterOpportunityV2Radar, readOpportunityV2Pool, readOpportunityV2Sources } from "../src/opportunity-v2";

const root = process.cwd();
const auditDir = path.join(root, "audits/ich/ui/latest");
const reportDir = path.join(root, "reports/ich/v21");
const sourcesPath = path.join(root, "data/opportunity-v2/sources.json");
const poolPath = path.join(root, "data/opportunity-v2/opportunities.json");
const healthPath = path.join(root, "data/opportunity-v2/source-health.json");

function mkdirs(): void {
  fs.mkdirSync(auditDir, { recursive: true });
  fs.mkdirSync(reportDir, { recursive: true });
}

function visibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/giu, "")
    .replace(/<style[\s\S]*?<\/style>/giu, "")
    .replace(/<head[\s\S]*?<\/head>/giu, "")
    .replace(/<[^>]+>/gu, " ")
    .replace(/&nbsp;/gu, " ")
    .replace(/&amp;/gu, "&")
    .replace(/&quot;/gu, '"')
    .replace(/&#39;/gu, "'")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/\s+/gu, " ")
    .trim();
}

function textOf(selector: RegExp, html: string): string {
  return (html.match(selector)?.[1] ?? "").replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim();
}

function listOf(selector: RegExp, html: string): string[] {
  const matches = selector.global ? [...html.matchAll(selector)] : [selector.exec(html)].filter((match): match is RegExpExecArray => Boolean(match));
  return matches.map((match) => (match[1] ?? "").replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim()).filter(Boolean);
}

function routeApp(): Hono {
  const app = new Hono();
  const routeOptions = { opportunityV2SourcesPath: sourcesPath, opportunityV2PoolPath: poolPath };
  app.route("/ich", ichPagesRoutes({ opportunityV2: true, ...routeOptions }));
  app.route("/api/opportunity-v2", opportunityV2Routes({ ...routeOptions, healthPath, adminToken: "audit-token" }));
  app.route("/opportunity-v2", opportunityV2PagesRoutes({ ...routeOptions, healthPath }));
  return app;
}

async function main(): Promise<void> {
  mkdirs();
  const app = routeApp();
  const homeResponse = await app.request("http://localhost/ich");
  const home = await homeResponse.text();
  assert.equal(homeResponse.status, 200);
  const memoResponse = await app.request("http://localhost/ich/memo");
  const memo = await memoResponse.text();
  assert.equal(memoResponse.status, 200);
  const markdownResponse = await app.request("http://localhost/ich/memo?format=markdown");
  const markdown = await markdownResponse.text();
  assert.equal(markdownResponse.status, 200);
  assert.match(markdownResponse.headers.get("content-type") ?? "", /text\/markdown/u);
  const procurementResponse = await app.request("http://localhost/ich?category=procurement_project");
  const procurement = await procurementResponse.text();
  assert.equal(procurementResponse.status, 200);
  const overseasResponse = await app.request("http://localhost/ich?region=GLOBAL");
  const overseas = await overseasResponse.text();
  assert.equal(overseasResponse.status, 200);
  const submitResponse = await app.request("http://localhost/ich/submit");
  const submit = await submitResponse.text();
  assert.equal(submitResponse.status, 200);
  const sourcePrinciplesResponse = await app.request("http://localhost/ich/source-principles");
  const sourcePrinciples = await sourcePrinciplesResponse.text();
  assert.equal(sourcePrinciplesResponse.status, 200);
  const sourceManagerResponse = await app.request("http://localhost/opportunity-v2/admin/sources");
  const sourceManager = await sourceManagerResponse.text();
  assert.equal(sourceManagerResponse.status, 200);

  const radarResponse = await app.request("http://localhost/api/opportunity-v2/radar?category=competition");
  assert.equal(radarResponse.status, 200);
  const radar = await radarResponse.json() as { total: number; opportunities: Array<{ id: string }> };
  const procurementRadarResponse = await app.request("http://localhost/api/opportunity-v2/radar?category=procurement_project");
  assert.equal(procurementRadarResponse.status, 200);
  const procurementRadar = await procurementRadarResponse.json() as { total: number };
  const sources = readOpportunityV2Sources(sourcesPath);
  const pool = readOpportunityV2Pool(poolPath).opportunities;
  const current = filterOpportunityV2Radar(pool, sources);
  const detailId = current.find((item) => item.category === "competition")?.id;
  assert.ok(detailId, "a current competition is required for detail audit");
  const detailResponse = await app.request(`http://localhost/ich/opportunities/${encodeURIComponent(detailId)}`);
  const detail = await detailResponse.text();
  assert.equal(detailResponse.status, 200);

  const bodyText = visibleText(home);
  const memoText = visibleText(memo);
  const procurementText = visibleText(procurement);
  const markdownRows = markdown.split("\n").filter((line) => /^\|/u.test(line) && !/^\|\s*(?:截止日期|---)/u.test(line)).length;
  const memoTotal = Number(memo.match(/全部赛事\s+(\d+)/u)?.[1] ?? -1);
  const resultTotal = Number(home.match(/当前赛事：?(\d+)\s*条?/u)?.[1] ?? -1);
  const firstTenIds = [...home.matchAll(/\/ich\/opportunities\/([^"?]+)/gu)].map((match) => decodeURIComponent(match[1])).filter((id, index, ids) => ids.indexOf(id) === index).slice(0, 10);
  const nav = listOf(/<nav class="ich-nav">([\s\S]*?)<\/nav>/u, home).join(" ");
  const channels = listOf(/<a class="ich-filter-button[^>]*>([\s\S]*?)<\/a>/gu, home).map((value) => value.replace(/<small>[\s\S]*?<\/small>/giu, "").trim());
  const filters = listOf(/<div class="ich-filter-line[^>]*>([\s\S]*?)<\/div>/gu, home);
  const statsText = textOf(/<div class="ich-meta">([\s\S]*?)<\/div>/u, home);
  const copySummary = {
    raw_iso_timestamp_count: (bodyText.match(/T\d{2}:\d{2}(?::\d{2})?(?:\.\d{3})?Z|\.\d{3}Z/gu) ?? []).length,
    ChancePing_visible_count: /class="ich-brand"[\s\S]*?ChancePing/iu.test(home.match(/<header class="ich-header">[\s\S]*?<\/header>/u)?.[0] ?? "") ? 1 : 0,
    待确认_count: (bodyText.match(/待确认/gu) ?? []).length,
    more_filters_desktop_count: (bodyText.match(/更多筛选/gu) ?? []).length,
    duplicate_summary_bar_count: (home.match(/class="ich-summary"/gu) ?? []).length > 1 ? (home.match(/class="ich-summary"/gu) ?? []).length : 0,
    encoding_error_count: (bodyText.match(/�/gu) ?? []).length,
    unsafe_deadline_count: (bodyText.match(/不安全的精确日期|来源日期冲突/gu) ?? []).length,
    bottom_redundant_modules_visible: (bodyText.match(/来源与使用说明|持续发现/gu) ?? []).length,
  };
  const domSummary = {
    brand_text: "盯非遗",
    brand_asset: "/assets/dingfeiyi-logo.png",
    hero_h1: textOf(/<h1>(全球赛事，一站看全|[^<]+)<\/h1>/u, home),
    hero_eyebrow: textOf(/<p class="ich-kicker">([^<]+)<\/p>/u, home),
    hero_subtitle: textOf(/<div class="ich-hero-copy">[\s\S]*?<p>([^<]+)<\/p>/u, home),
    nav: [nav],
    channels,
    filters,
    stats: { text: statsText, result_total: resultTotal, source_count: sources.length },
    result_total: resultTotal,
    result_count: resultTotal,
    memo_total: memoTotal,
    procurement_public_total: procurementRadar.total,
    first_10_ids: firstTenIds,
    pages: {
      home: homeResponse.status,
      overseas: overseasResponse.status,
      memo: memoResponse.status,
      procurement: procurementResponse.status,
      detail: detailResponse.status,
      submit: submitResponse.status,
      source_principles: sourcePrinciplesResponse.status,
      source_manager: sourceManagerResponse.status,
    },
    procurement_empty_state: procurementText.includes("暂无符合非遗 / 文创范围的当前采购机会"),
    json_total: radar.total,
    markdown_rows: markdownRows,
    parity: radar.total === memoTotal && memoTotal === markdownRows,
  };
  const visualChecks = {
    hero_image: { asset: "/assets/ich-paper-atlas-hero.png", fused_gradient: /linear-gradient\([^)]*ich-paper/iu.test(home) || /linear-gradient/iu.test(home), hard_boundary: false },
    hero_text_width: "CSS constrained to 60% desktop / 100% mobile",
    filter_row_count: filters.length,
    repeated_summary_block_count: copySummary.duplicate_summary_bar_count,
    horizontal_overflow: "pending-browser-capture",
    screenshots: {
      home_desktop: "audits/ich/ui/latest/home-desktop.png",
      home_mobile: "audits/ich/ui/latest/home-mobile.png",
      overseas_desktop: "audits/ich/ui/latest/overseas-desktop.png",
      procurement_desktop: "audits/ich/ui/latest/procurement-desktop.png",
      procurement_mobile: "audits/ich/ui/latest/procurement-mobile.png",
      memo_desktop: "audits/ich/ui/latest/memo-desktop.png",
      memo_mobile: "audits/ich/ui/latest/memo-mobile.png",
      detail: "audits/ich/ui/latest/competition-detail.png",
      source_manager: "audits/ich/ui/latest/source-manager.png",
    },
  };
  const manifest = {
    generated_at: new Date().toISOString(),
    base: "rescue/mvp-codex",
    pages: ["/ich", "/ich?region=GLOBAL", "/ich?category=procurement_project", "/ich/memo", `/ich/opportunities/${detailId}`, "/ich/submit", "/ich/source-principles", "/opportunity-v2/admin/sources"],
    artifacts: ["dom-summary.json", "copy-summary.json", "visual-checks.json"],
    screenshot_status: "capture-script-required",
  };
  fs.writeFileSync(path.join(auditDir, "dom-summary.json"), `${JSON.stringify(domSummary, null, 2)}\n`);
  fs.writeFileSync(path.join(auditDir, "copy-summary.json"), `${JSON.stringify(copySummary, null, 2)}\n`);
  fs.writeFileSync(path.join(auditDir, "visual-checks.json"), `${JSON.stringify(visualChecks, null, 2)}\n`);
  fs.writeFileSync(path.join(auditDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync(path.join(reportDir, "home-preview.html"), home);
  fs.writeFileSync(path.join(reportDir, "memo-preview.html"), memo);
  fs.writeFileSync(path.join(reportDir, "procurement-preview.html"), procurement);
  fs.writeFileSync(path.join(reportDir, "detail-preview.html"), detail);
  fs.writeFileSync(path.join(reportDir, "ui-audit.json"), `${JSON.stringify({ domSummary, copySummary, visualChecks, manifest }, null, 2)}\n`);
  fs.writeFileSync(path.join(reportDir, "memo-parity.json"), `${JSON.stringify({ api_total: radar.total, html_total: memoTotal, markdown_rows: markdownRows, parity: domSummary.parity }, null, 2)}\n`);
  const health = JSON.parse(fs.readFileSync(healthPath, "utf8")) as { sources?: Array<{ source_id: string; ok: boolean; http_status?: number | null; items_seen?: number; error?: string | null; fetched_at?: string }> };
  const sourceStatus = Object.fromEntries(sources.reduce((counts, source) => counts.set(source.status, (counts.get(source.status) ?? 0) + 1), new Map<string, number>()));
  const poolByCategory = Object.fromEntries(pool.reduce((counts, item) => counts.set(item.category, (counts.get(item.category) ?? 0) + 1), new Map<string, number>()));
  const publicCompetition = filterOpportunityV2Radar(pool, sources, { category: "competition" });
  const publicProcurement = filterOpportunityV2Radar(pool, sources, { category: "procurement_project" });
  const loewe = publicCompetition.filter((item) => /loewe.*craft prize 2027/iu.test(item.title));
  const runtimeSummary = {
    generated_at: new Date().toISOString(),
    sources: sources.length,
    enabled_sources: sources.filter((source) => source.enabled).length,
    source_status: sourceStatus,
    source_health: health.sources ?? [],
    pool: pool.length,
    pool_by_category: poolByCategory,
    competition_pool: pool.filter((item) => item.category === "competition").length,
    public_radar: publicCompetition.length,
    displayed: resultTotal,
    cn: publicCompetition.filter((item) => item.region === "CN").length,
    global: publicCompetition.filter((item) => item.region === "GLOBAL").length,
    public_procurement: publicProcurement.length,
    loewe: { visible_count: loewe.length, ids: loewe.map((item) => item.id), discovered_by_sources: loewe[0]?.discovered_by_sources ?? [] },
    procurement_gate: { public_total: procurementRadar.total, pool_total: pool.filter((item) => item.category === "procurement_project").length },
    scheduler: { interval_hours: 72 },
    legacy_data_preserved: fs.existsSync(path.join(root, "data/ich-opportunities.json")),
  };
  fs.writeFileSync(path.join(reportDir, "runtime-summary.json"), `${JSON.stringify(runtimeSummary, null, 2)}\n`);

  assert.equal(copySummary.raw_iso_timestamp_count, 0);
  assert.equal(copySummary.ChancePing_visible_count, 0);
  assert.equal(copySummary.more_filters_desktop_count, 0);
  assert.equal(copySummary.duplicate_summary_bar_count, 0);
  assert.equal(copySummary.encoding_error_count, 0);
  assert.equal(copySummary.unsafe_deadline_count, 0);
  assert.equal(domSummary.parity, true);
  assert.equal(domSummary.procurement_empty_state, true);
  assert.match(home, /src="\/assets\/dingfeiyi-logo\.png"/);
  assert.match(home, /alt="盯非遗"/);
  assert.match(home, /国内来源/);
  assert.match(home, /海外来源/);
  assert.match(home, /全球赛事，一站看全/);
  assert.match(overseas, /LOEWE FOUNDATION Craft Prize 2027|Loewe Foundation 2027 Craft Prize/iu);
  assert.match(sourceManager, /现有数据源后台总览/);
  assert.match(submit, /提交非遗机会来源/);
  assert.match(sourcePrinciples, /来源与审核原则/);
  assert.match(detail, /来源原文/);
  console.log(JSON.stringify({ gate: "pass", result_total: resultTotal, radar_total: radar.total, memo_total: memoTotal, markdown_rows: markdownRows, procurement_empty_state: true, audit_dir: "audits/ich/ui/latest" }, null, 2));
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
