import fs from "node:fs";
import path from "node:path";
import { extractDeadlineText, parseDateText } from "../src/ich/aggregation/adapters/common";
import { filterOpportunityV2Radar, opportunityStatus, readOpportunityV2Pool, readOpportunityV2Sources, canonicalOpportunityTitle, type OpportunityV2, type OpportunityV2Source, type OpportunityV2SourceHealth } from "../src/opportunity-v2";

const NEW_SOURCE_IDS = [
  "cfw-cultural-ip", "whaleideas-competition", "1zj-cultural-competition", "chuangyisai-cultural",
  "zcool-challenges", "zjmtcn-product-competition", "iuben-cultural-competition", "everyart-competition", "gtn9-competition",
];
const DEFAULT_BASELINE_PATH = "docs/ich/domestic-competition-source-expansion-round1-baseline.json";
const DEFAULT_REPORT_PATH = "docs/ich/domestic-competition-source-expansion-round1-report.md";

interface BaselineSnapshot {
  captured_at: string;
  pool: number;
  displayed: number;
  cn: number;
  global: number;
  identity_keys: string[];
  source_ids: string[];
}

function loadJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8")) as T;
}

function captureBaseline(outputPath: string): void {
  const sources = readOpportunityV2Sources();
  const baselineSources = sources.filter((source) => !NEW_SOURCE_IDS.includes(source.id));
  const pool = readOpportunityV2Pool();
  const radar = filterOpportunityV2Radar(pool.opportunities, baselineSources);
  const snapshot: BaselineSnapshot = {
    captured_at: new Date().toISOString(),
    pool: pool.opportunities.length,
    displayed: radar.length,
    cn: radar.filter((item) => item.region === "CN").length,
    global: radar.filter((item) => item.region === "GLOBAL").length,
    identity_keys: pool.opportunities.map((item) => canonicalOpportunityTitle(item.title)),
    source_ids: baselineSources.map((source) => source.id),
  };
  fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
  fs.writeFileSync(path.resolve(outputPath), `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(snapshot, null, 2));
}

function sourceName(sources: OpportunityV2Source[], id: string): string {
  return sources.find((source) => source.id === id)?.name ?? id;
}

function sourceIdsFor(item: OpportunityV2, ids: Set<string>): string[] {
  return item.discovered_by_sources.filter((id) => ids.has(id));
}

function markdownCell(value: unknown): string {
  return String(value ?? "").replace(/\|/gu, "\\|").replace(/\n/gu, " ");
}

function auditNow(): Date {
  const value = new Date(process.env.CHANCEPING_OPPORTUNITY_V2_AUDIT_NOW ?? new Date().toISOString());
  if (Number.isNaN(value.getTime())) throw new Error("Invalid CHANCEPING_OPPORTUNITY_V2_AUDIT_NOW");
  return value;
}

function explicitExpiredText(item: OpportunityV2, now: Date): boolean {
  const context = `${item.title} ${item.summary}`;
  const deadlineText = extractDeadlineText(context);
  const parsed = parseDateText(deadlineText, now, context);
  return Boolean(!item.deadline && parsed && opportunityStatus(parsed, now) === "EXPIRED");
}

function structuredExpired(item: OpportunityV2, now: Date): boolean {
  return Boolean(item.deadline && opportunityStatus(item.deadline, now) === "EXPIRED");
}

function renderReport(baseline: BaselineSnapshot, reportPath: string): void {
  const sources = readOpportunityV2Sources();
  const pool = readOpportunityV2Pool();
  const healthFile = loadJson<{ sources?: OpportunityV2SourceHealth[] }>("data/opportunity-v2/source-health.json");
  const healthById = new Map((healthFile.sources ?? []).map((row) => [row.source_id, row]));
  const baselineKeys = new Set(baseline.identity_keys);
  const newIds = new Set(NEW_SOURCE_IDS);
  const radar = filterOpportunityV2Radar(pool.opportunities, sources);
  const newUnique = radar.filter((item) => sourceIdsFor(item, newIds).length > 0 && !baselineKeys.has(canonicalOpportunityTitle(item.title)));
  const newUniquePool = pool.opportunities.filter((item) => sourceIdsFor(item, newIds).length > 0 && !baselineKeys.has(canonicalOpportunityTitle(item.title)));
  const duplicateItems = pool.opportunities.filter((item) => sourceIdsFor(item, newIds).length > 0 && baselineKeys.has(canonicalOpportunityTitle(item.title)));
  const cnRadar = radar.filter((item) => item.region === "CN");
  const globalRadar = radar.filter((item) => item.region === "GLOBAL");
  const domesticCurrent = pool.opportunities.filter((item) => item.region === "CN" && item.radar_relevance === "RELEVANT" && ["CURRENT", "UNKNOWN_DEADLINE"].includes(item.status));

  const sourceRows = NEW_SOURCE_IDS.map((id) => {
    const source = sources.find((item) => item.id === id);
    const health = healthById.get(id);
    const related = pool.opportunities.filter((item) => sourceIdsFor(item, new Set([id])).length > 0);
    const relevant = related.filter((item) => item.radar_relevance === "RELEVANT");
    const displayed = radar.filter((item) => sourceIdsFor(item, new Set([id])).length > 0);
    const unique = newUnique.filter((item) => sourceIdsFor(item, new Set([id])).length > 0);
    return {
      id,
      url: source?.url ?? "",
      http: health?.http_status ?? "not fetched",
      parser: health?.format ?? "none",
      status: source?.status ?? "MISSING",
      items: health?.items_seen ?? 0,
      relevant: relevant.length,
      displayed: displayed.length,
      duplicates: related.filter((item) => baselineKeys.has(canonicalOpportunityTitle(item.title))).length,
      new_unique: unique.length,
    };
  });

  const overlap = new Map<string, { title: string; sources: Set<string> }>();
  for (const item of pool.opportunities.filter((candidate) => candidate.radar_relevance === "RELEVANT")) {
    const ids = item.discovered_by_sources.filter((id) => sources.some((source) => source.id === id));
    if (ids.length < 2) continue;
    const key = canonicalOpportunityTitle(item.title);
    const existing = overlap.get(key);
    if (existing) ids.forEach((id) => existing.sources.add(id));
    else overlap.set(key, { title: item.title, sources: new Set(ids) });
  }
  const overlapRows = [...overlap.values()].sort((a, b) => b.sources.size - a.sources.size || a.title.localeCompare(b.title));

  const known = [
    ["国文奖", /国文奖/iu], ["山东手造", /山东手造|齐品淄博/iu], ["新粹奖", /新粹奖/iu], ["妈祖杯", /妈祖杯|妈祖安澜/iu],
    ["长城文创", /长城文创/iu], ["这礼是成都", /这礼是成都/iu], ["粤港澳大湾区文创", /粤港澳大湾区文化创意设计大赛/iu],
  ].map(([label, pattern]) => {
    const items = pool.opportunities.filter((item) => (pattern as RegExp).test(`${item.title} ${item.summary}`));
    const discovered = [...new Set(items.flatMap((item) => item.discovered_by_sources))];
    return { label: label as string, count: discovered.length, sources: discovered.map((id) => sourceName(sources, id)) };
  });

  const now = auditNow();
  const auditItems = [...newUniquePool].sort((a, b) => a.id.localeCompare(b.id)).slice(0, 30);
  const isResultNews = (item: OpportunityV2): boolean => /(?:获奖名单|结果公布|评审结果|新闻|资讯|招聘|公示)/iu.test(`${item.title} ${item.summary}`);
  const isNavigationNoise = (item: OpportunityV2): boolean => /(?:\/about|\/contact|\/archive|\/blog|\/podcast|mailto:|tel:)/iu.test(`${item.title} ${item.detail_url}`);
  const expiredStructured = auditItems.filter((item) => structuredExpired(item, now));
  const expiredTextDetected = auditItems.filter((item) => explicitExpiredText(item, now));
  const quality = {
    audited: auditItems.length,
    real: auditItems.filter((item) => !structuredExpired(item, now) && !explicitExpiredText(item, now) && !isResultNews(item) && item.radar_relevance !== "IRRELEVANT" && !isNavigationNoise(item)).length,
    expired_structured: expiredStructured.length,
    expired_text_detected: expiredTextDetected.length,
    result_news: auditItems.filter(isResultNews).length,
    irrelevant: auditItems.filter((item) => item.radar_relevance === "IRRELEVANT").length,
    navigation_noise: auditItems.filter(isNavigationNoise).length,
  };
  const radarIds = new Set(radar.map((item) => item.id));
  const expiredRemovedFromRadar = newUniquePool.filter((item) => (structuredExpired(item, now) || explicitExpiredText(item, now)) && !radarIds.has(item.id)).length;

  const lines: string[] = [
    "# Domestic Competition Source Expansion Round 1",
    "",
    `- Baseline captured: ${baseline.captured_at}`,
    `- After run: ${new Date().toISOString()}`,
    "- Production deployed: NO",
    "",
    "## Source Pool",
    "",
    `- before: ${baseline.source_ids.length}`,
    `- after: ${sources.length}`,
    `- new sources: ${NEW_SOURCE_IDS.length}`,
    "",
    "## New Source Status",
    "",
    "| Source | URL | HTTP | Parser | Status | Items | Relevant | Displayed | Duplicates | New unique |",
    "|---|---|---:|---|---|---:|---:|---:|---:|---:|",
    ...sourceRows.map((row) => `| ${markdownCell(sourceName(sources, row.id))} | ${markdownCell(row.url)} | ${row.http} | ${row.parser} | ${row.status} | ${row.items} | ${row.relevant} | ${row.displayed} | ${row.duplicates} | ${row.new_unique} |`),
    "",
    "## Fetch / Radar",
    "",
    `- raw: ${(healthFile.sources ?? []).reduce((sum, row) => sum + row.items_seen, 0)}`,
    `- pool: ${pool.opportunities.length}`,
    `- displayed: ${radar.length}`,
    `- CN: ${cnRadar.length}`,
    `- GLOBAL: ${globalRadar.length}`,
    "",
    "## Domestic Competition",
    "",
    `- baseline current relevant competitions: ${baseline.cn}`,
    `- after current relevant competitions: ${domesticCurrent.length}`,
    `- duplicates with existing sources: ${duplicateItems.length}`,
    `- NEW UNIQUE COMPETITIONS: ${newUnique.length}`,
    `- expired removed from radar: ${expiredRemovedFromRadar}`,
    "",
    "### Top Unique Contributing Sources",
    "",
    ...sourceRows.slice().sort((a, b) => b.new_unique - a.new_unique || b.relevant - a.relevant).map((row, index) => `${index + 1}. ${sourceName(sources, row.id)} — new_unique ${row.new_unique}, relevant ${row.relevant}`),
    "",
    "## Multi-Source Coverage",
    "",
    ...(overlapRows.length ? overlapRows.slice(0, 30).map((row) => `- ${markdownCell(row.title)} — ${[...row.sources].map((id) => sourceName(sources, id)).join(" / ")} (source_count: ${row.sources.size})`) : ["- none"]),
    "",
    "## Known Competition Coverage",
    "",
    ...known.map((row) => `- ${row.label}: ${row.count} sources${row.sources.length ? ` — ${row.sources.join(" / ")}` : ""}`),
    "",
    "## Quality Audit",
    "",
    `- audited: ${quality.audited}`,
    `- real: ${quality.real}`,
    `- expired_structured: ${quality.expired_structured}`,
    `- expired_text_detected: ${quality.expired_text_detected}`,
    `- result/news: ${quality.result_news}`,
    `- irrelevant: ${quality.irrelevant}`,
    `- navigation_noise: ${quality.navigation_noise}`,
    "",
    "## 20 New Unique Samples",
    "",
    ...(newUnique.length ? newUnique.slice().sort((a, b) => a.id.localeCompare(b.id)).slice(0, 20).map((item, index) => ` ${index + 1}. **${markdownCell(item.title)}** — deadline: ${item.deadline ?? "UNKNOWN_DEADLINE"}; source: ${markdownCell(item.source_name)}; [detail](${item.detail_url})`) : ["- none"]),
    "",
    "## Source Family",
    "",
    "- No same-family relationship was confirmed from the live source pages; 文创赛网/鲸创意、征集码头、优本视觉 remain separate source records. Overlap is measured through opportunity deduplication only.",
    "",
    "## Regression",
    "",
    `- LOEWE regression: ${filterOpportunityV2Radar(pool.opportunities, sources).filter((item) => /loewe foundation.*craft prize|craft prize.*loewe foundation/iu.test(item.title)).length === 1 ? "PASS (visible once)" : "FAIL"}`,
    "- UI modified: NO",
    "- production deployed: NO",
    "",
  ];
  fs.mkdirSync(path.dirname(path.resolve(reportPath)), { recursive: true });
  fs.writeFileSync(path.resolve(reportPath), `${lines.join("\n")}\n`, "utf8");
  console.log(JSON.stringify({ report: reportPath, pool: pool.opportunities.length, displayed: radar.length, cn: cnRadar.length, global: globalRadar.length, new_unique: newUnique.length, audited: quality.audited }, null, 2));
}

const mode = process.argv[2];
if (mode === "--capture-baseline") captureBaseline(process.argv[3] ?? DEFAULT_BASELINE_PATH);
else if (mode === "--report") renderReport(loadJson<BaselineSnapshot>(process.argv[3] ?? DEFAULT_BASELINE_PATH), process.argv[4] ?? DEFAULT_REPORT_PATH);
else throw new Error("Usage: tsx scripts/audit-domestic-competition-expansion.ts --capture-baseline [path] | --report [baseline path] [report path]");
