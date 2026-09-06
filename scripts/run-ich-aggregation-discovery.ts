import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getAggregationAdapter } from "../src/ich/aggregation/adapters";
import { enrichGenericItem } from "../src/ich/aggregation/adapters/generic-listing";
import { identityHash, sha256 } from "../src/ich/aggregation/adapters/common";
import { deduplicateAggregationItems } from "../src/ich/aggregation/dedup";
import { compareToLedger, readLedger, writeLedger } from "../src/ich/aggregation/ledger";
import { findOfficialLinks, backtraceStatus } from "../src/ich/aggregation/official-backtrace";
import { getAggregationRegistry } from "../src/ich/aggregation/registry";
import { isLikelyCurrent, scoreAggregationRelevance, semanticRelevance } from "../src/ich/aggregation/relevance";
import type { AggregationFunnel, AggregationItem, AggregationRunReport, SourceHealthRow } from "../src/ich/aggregation/types";

const root = process.cwd();
const now = new Date(process.argv.includes("--now") ? process.argv[process.argv.indexOf("--now") + 1] : new Date().toISOString());
if (Number.isNaN(now.getTime())) throw new Error("Invalid --now value");
const maxItems = Number(process.argv.includes("--max-items") ? process.argv[process.argv.indexOf("--max-items") + 1] : 200);
const maxBacktrace = Number(process.argv.includes("--max-backtrace") ? process.argv[process.argv.indexOf("--max-backtrace") + 1] : 10);
if (process.argv.includes("--write")) throw new Error("Aggregation discovery is readonly in Stage5-A.4; formal promotion requires a separate DS14 command.");
const formalStorePath = path.resolve(process.env.CHANCEPING_ICH_STORE_PATH ?? "data/ich-opportunities.json");
const ledgerPath = path.resolve(process.env.CHANCEPING_ICH_AGGREGATION_LEDGER_PATH ?? "data/ich/aggregation-discovery-ledger.json");
const candidatesPath = path.resolve(process.env.CHANCEPING_ICH_AGGREGATION_CANDIDATES_PATH ?? "data/ich/aggregation-candidates.json");
const healthPath = path.resolve(process.env.CHANCEPING_ICH_AGGREGATION_HEALTH_PATH ?? "data/ich/aggregation-source-health.json");
const reportPath = path.resolve("docs/ich/aggregation-run-report.json");
const reportMdPath = path.resolve("docs/ich/stage5a4-aggregation-network-report.md");
const networkJsonPath = path.resolve("docs/ich/stage5a4-aggregation-network-report.json");
const shejiReportPath = path.resolve("docs/ich/aggregation-shejijingsai-report.md");
const chuangsaiyunReportPath = path.resolve("docs/ich/aggregation-chuangsaiyun-report.md");
const globalReportPath = path.resolve("docs/ich/aggregation-global-sources-report.md");
const providerReportPath = path.resolve("docs/ich/stage5a4-provider-contribution.md");
const rejectedReportPath = path.resolve("docs/ich/stage5a4-rejected-candidates.md");
const timeoutMs = 20_000;

interface FetchResult { status: number; finalUrl: string; text: string; }

async function fetchText(url: string): Promise<FetchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { redirect: "follow", signal: controller.signal, headers: { "user-agent": "ChancePing-ICH-Aggregation/1.0 (+readonly; contact: sunny251610056@gmail.com)" } });
    return { status: response.status, finalUrl: response.url, text: await response.text() };
  } finally { clearTimeout(timer); }
}

function providerAvailable(): boolean {
  return Boolean(process.env.SERPER_API_KEY || process.env.BOCHA_API_KEY || process.env.DOUBAO_SEARCH_API_KEY || process.env.BRAVE_SEARCH_API_KEY);
}

function rowHealth(sourceId: string, checkedAt: string): SourceHealthRow {
  return { source_id: sourceId, reachable: false, http_status: null, last_checked_at: checkedAt, adapter_status: "PARSER_FAILED", parse_success: false, items_seen: 0, last_success_at: null, consecutive_failures: 1, error: null };
}

function makeItem(sourceId: string, parsed: Awaited<ReturnType<ReturnType<typeof getAggregationAdapter>["parseListing"]>>[number], discoveredAt: string): AggregationItem {
  const score = scoreAggregationRelevance(parsed.title, parsed.source_category, parsed.raw_text);
  const itemId = identityHash(sourceId, parsed.detail_url || parsed.title, parsed.deadline_at ?? "");
  const contentHash = sha256(JSON.stringify({ title: parsed.title, category: parsed.source_category, detail_url: parsed.detail_url, deadline: parsed.deadline_at, raw: parsed.raw_text }));
  return {
    item_id: itemId, source_id: sourceId, source_item_id: parsed.source_item_id, title: parsed.title, source_category: parsed.source_category, source_status: parsed.source_status ?? null,
    discovery_url: parsed.source_url, detail_url: parsed.detail_url, source_url: parsed.source_url, published_at: parsed.published_at,
    deadline_text: parsed.deadline_text, deadline_at: parsed.deadline_at, organizer: parsed.organizer, application_url: parsed.application_url,
    raw_text: parsed.raw_text, content_hash: contentHash, last_content_hash: null, first_seen_at: discoveredAt, last_seen_at: discoveredAt,
    status: "NEW", rule_relevance: score.rule_relevance, semantic_relevance: semanticRelevance({ title: parsed.title, raw_text: parsed.raw_text, relevance: score.relevance }),
    relevance: score.relevance, opportunity_type: score.category, official_backtrace_status: "PENDING_PROVIDER", official_url: null,
    discovered_by_sources: [sourceId],
  };
}

function markdownReport(report: AggregationRunReport): string {
  const bySource = new Map<string, AggregationItem[]>();
  for (const item of report.candidates) bySource.set(item.source_id, [...(bySource.get(item.source_id) ?? []), item]);
  const rows = report.sources.map((source) => {
    const items = bySource.get(source.source_id) ?? [];
    const health = report.source_health.find((row) => row.source_id === source.source_id);
    return `| ${source.source_id} | ${health?.items_seen ?? 0} | ${items.filter((item) => item.status === "NEW").length} | ${items.filter((item) => item.relevance === "CORE_ICH" || item.relevance === "ICH_ADJACENT").length} | ${items.filter((item) => item.official_backtrace_status === "OFFICIAL_FOUND").length} | ${health?.adapter_status ?? "未确认"} |`;
  });
  return [
    "# Stage5-A.4 聚合机会源自动发现网络运行报告", "", `运行时间：${report.finished_at}`, `只读：${report.readonly ? "是" : "否"}；正式库写入：${report.formal_store_write ? "是" : "否"}`,
    `正式库哈希保持不变：${report.formal_store_unchanged ? "是" : "否"}`, "", "## 来源与适配器", "", "| source_id | items_seen | new | relevant | official_backtrace_success | adapter_status |", "| --- | ---: | ---: | ---: | ---: | --- |", ...rows,
    "", "## Funnel", "", "```json", JSON.stringify(report.funnel, null, 2), "```", "", "## Baseline", "", `- baseline_total: ${report.baseline.baseline_total}`, `- currently_open: ${report.baseline.currently_open}`, `- already_expired: ${report.baseline.already_expired}`, `- likely_relevant: ${report.baseline.likely_relevant}`, `- incremental_simulation.new_items: ${report.incremental_simulation.new_items}`, `- incremental_simulation.updated_items: ${report.incremental_simulation.updated_items}`, "", "## Stage5 KPI", "", `- ${report.stage5_kpi.metric}: ${report.stage5_kpi.before} → ${report.stage5_kpi.after} / ${report.stage5_kpi.target}`,
    "", "## Gate", "", `- ${report.gate}`, "- 聚合站只负责发现；没有 `OFFICIAL_FOUND` 的候选不得进入正式库。", "- 官方回溯无法使用搜索 Provider 时标记 `PENDING_PROVIDER`，不伪造成功。", "",
  ].join("\n").replace(/\n+$/u, "\n");
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const beforeHash = crypto.createHash("sha256").update(fs.readFileSync(formalStorePath)).digest("hex");
  const registry = getAggregationRegistry();
  const parsedItems: AggregationItem[] = [];
  const health: SourceHealthRow[] = [];
  for (const source of registry) {
    const healthRow = rowHealth(source.source_id, startedAt);
    health.push(healthRow);
    try {
      const response = await fetchText(source.discovery_url);
      healthRow.http_status = response.status;
      healthRow.reachable = response.status >= 200 && response.status < 400;
      if (!healthRow.reachable) {
        healthRow.adapter_status = response.status === 401 || response.status === 403 ? "BLOCKED" : "PARSER_FAILED";
        healthRow.error = `HTTP ${response.status}; discovery not treated as success`;
        continue;
      }
      const adapter = getAggregationAdapter(source.source_id);
      const parsed = adapter.parseListing(response.text, response.finalUrl).slice(0, Math.max(0, maxItems));
      healthRow.items_seen = parsed.length;
      healthRow.parse_success = parsed.length > 0;
      healthRow.adapter_status = parsed.length > 0 ? "PASS" : "PARTIAL";
      healthRow.last_success_at = startedAt;
      healthRow.consecutive_failures = 0;
      for (const item of parsed) parsedItems.push(makeItem(source.source_id, item, startedAt));
    } catch (error) {
      healthRow.error = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      healthRow.adapter_status = /abort|timeout/i.test(healthRow.error) ? "BLOCKED" : "PARSER_FAILED";
    }
  }

  const deduped = deduplicateAggregationItems(parsedItems);
  const previous = readLedger(ledgerPath);
  const observedSourceIds = new Set(health.filter((row) => row.parse_success).map((row) => row.source_id));
  const compared = compareToLedger(deduped.items, previous, startedAt, observedSourceIds);
  let items = compared.items;
  const relevantForBacktrace = items.filter((item) => item.relevance === "CORE_ICH" || item.relevance === "ICH_ADJACENT").sort((a, b) => (b.rule_relevance ?? 0) - (a.rule_relevance ?? 0)).slice(0, Math.max(0, maxBacktrace));
  const backtraceIds = new Set(relevantForBacktrace.map((item) => item.item_id));
  for (const item of relevantForBacktrace) {
    let links: string[] = [];
    try {
      const detail = await fetchText(item.detail_url);
      if (detail.status >= 200 && detail.status < 400) {
        const adapter = getAggregationAdapter(item.source_id);
        const parsed = adapter.enrichItem ? adapter.enrichItem({ source_item_id: item.source_item_id, title: item.title, source_category: item.source_category, detail_url: item.detail_url, source_url: item.source_url, published_at: item.published_at, deadline_text: item.deadline_text, deadline_at: item.deadline_at, organizer: item.organizer, application_url: item.application_url, raw_text: item.raw_text }, detail.text, detail.finalUrl) : null;
        if (parsed) {
          item.title = parsed.title; item.deadline_text = parsed.deadline_text; item.deadline_at = parsed.deadline_at; item.raw_text = parsed.raw_text;
          item.content_hash = sha256(JSON.stringify({ title: item.title, detail_url: item.detail_url, deadline: item.deadline_at, raw: item.raw_text }));
        }
        links = findOfficialLinks(detail.text, detail.finalUrl);
      }
    } catch { /* recorded below as provider-pending/official-not-found */ }
    const outcome = backtraceStatus(item, links, providerAvailable());
    item.official_backtrace_status = outcome.status;
    item.official_url = outcome.official_url;
    if (outcome.status === "OFFICIAL_FOUND" && !item.application_url) item.application_url = outcome.official_url;
  }
  items = items.map((item) => backtraceIds.has(item.item_id) ? item : { ...item, official_backtrace_status: "PENDING_PROVIDER" as const });
  const funnel: AggregationFunnel = {
    raw_items_seen: parsedItems.length,
    new_items: compared.counts.NEW,
    updated_items: compared.counts.UPDATED,
    unchanged_items: compared.counts.UNCHANGED,
    removed_items: compared.counts.REMOVED,
    rule_relevant: items.filter((item) => item.rule_relevance > 0).length,
    semantic_relevant: items.filter((item) => item.relevance === "CORE_ICH" || item.relevance === "ICH_ADJACENT").length,
    official_backtrace_attempted: relevantForBacktrace.length,
    official_backtrace_success: items.filter((item) => item.official_backtrace_status === "OFFICIAL_FOUND").length,
    qualified_candidates: items.filter((item) => item.official_backtrace_status === "OFFICIAL_FOUND" && Boolean(item.title && item.deadline_at && item.application_url)).length,
    rejected_candidates: items.filter((item) => item.relevance === "IRRELEVANT" || item.official_backtrace_status === "OFFICIAL_NOT_FOUND").length,
    ds3_pass: 0,
    ds14_imported: 0,
  };
  for (const item of items) item.official_backtrace_status === "OFFICIAL_FOUND" && item.title && item.deadline_at && item.application_url ? void 0 : void 0;
  const finishedAt = new Date().toISOString();
  const afterHash = crypto.createHash("sha256").update(fs.readFileSync(formalStorePath)).digest("hex");
  const currentlyOpen = items.filter((item) => isLikelyCurrent(item.deadline_at, now)).length;
  const expired = items.filter((item) => item.deadline_at && !isLikelyCurrent(item.deadline_at, now)).length;
  const relevant = items.filter((item) => item.relevance === "CORE_ICH" || item.relevance === "ICH_ADJACENT").length;
  const report: AggregationRunReport = {
    schema_version: "ich-aggregation-discovery.v1", run_id: `ich-aggregation-${finishedAt.replace(/[-:.TZ]/g, "").slice(0, 14)}`, started_at: startedAt, finished_at: finishedAt,
    readonly: true, formal_store_write: false, formal_store_before_sha256: beforeHash, formal_store_after_sha256: afterHash, formal_store_unchanged: beforeHash === afterHash,
    baseline: { is_first_run: compared.isFirstRun, baseline_total: deduped.items.length, currently_open: currentlyOpen, already_expired: expired, likely_relevant: relevant },
    incremental_simulation: { new_items: 0, updated_items: 0 }, stage5_kpi: { metric: "direction_aware_ich_actionable", before: 47, after: 47 + funnel.ds14_imported, target: 80 }, sources: registry, source_health: health, funnel, candidates: items,
    gate: beforeHash === afterHash && health.some((row) => row.adapter_status === "PASS") ? (health.some((row) => row.adapter_status !== "PASS") ? "pass_with_followups" : "pass") : "blocked",
  };
  fs.mkdirSync(path.dirname(candidatesPath), { recursive: true });
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(candidatesPath, `${JSON.stringify({ schema_version: "ich-aggregation-candidates.v1", run_id: report.run_id, candidates: items }, null, 2)}\n`);
  fs.writeFileSync(healthPath, `${JSON.stringify({ schema_version: "ich-aggregation-source-health.v1", updated_at: finishedAt, sources: health }, null, 2)}\n`);
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(networkJsonPath, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(reportMdPath, markdownReport(report));
  const sourceItems = (sourceId: string) => items.filter((item) => item.source_id === sourceId);
  const shejiItems = sourceItems("shejijingsai-list");
  const globalIds = ["contest-watchers-open", "crafts-council-opportunities", "artconnect-opportunities", "competitions-archi"];
  const reportRows = (ids: string[]) => ids.map((id) => {
    const source = health.find((row) => row.source_id === id);
    const rows = sourceItems(id);
    return `| ${id} | ${source?.items_seen ?? 0} | ${rows.filter((item) => item.status === "NEW").length} | ${rows.filter((item) => item.relevance === "CORE_ICH" || item.relevance === "ICH_ADJACENT").length} | ${rows.filter((item) => item.official_backtrace_status === "OFFICIAL_FOUND").length} | ${source?.adapter_status ?? "未确认"} |`;
  });
  fs.writeFileSync(shejiReportPath, ["# 设计竞赛网聚合发现专项报告", "", `shejijingsai:`, `  items_seen: ${health.find((row) => row.source_id === "shejijingsai-list")?.items_seen ?? 0}`, `  new_items: ${shejiItems.filter((item) => item.status === "NEW").length}`, `  relevant: ${shejiItems.filter((item) => item.relevance === "CORE_ICH" || item.relevance === "ICH_ADJACENT").length}`, `  official_backtrace_success: ${shejiItems.filter((item) => item.official_backtrace_status === "OFFICIAL_FOUND").length}`, `  qualified: ${shejiItems.filter((item) => item.official_backtrace_status === "OFFICIAL_FOUND" && item.deadline_at && item.application_url).length}`, "", `- 页面总条数：${health.find((row) => row.source_id === "shejijingsai-list")?.items_seen ?? 0}`, `- 当前未截止条数：${shejiItems.filter((item) => isLikelyCurrent(item.deadline_at, now)).length}`, `- 规则命中数量：${shejiItems.filter((item) => item.rule_relevance > 0).length}`, `- 语义命中数量：${shejiItems.filter((item) => item.relevance !== "IRRELEVANT").length}`, `- CORE_ICH 数量：${shejiItems.filter((item) => item.relevance === "CORE_ICH").length}`, `- ICH_ADJACENT 数量：${shejiItems.filter((item) => item.relevance === "ICH_ADJACENT").length}`, `- 官方回溯成功数量：${shejiItems.filter((item) => item.official_backtrace_status === "OFFICIAL_FOUND").length}`, `- 重复数量：${deduped.duplicateCount}`, `- 最终合格数量：${shejiItems.filter((item) => item.official_backtrace_status === "OFFICIAL_FOUND" && item.deadline_at && item.application_url).length}`, "", "## Top Relevant Candidates", "", ...shejiItems.filter((item) => item.relevance !== "IRRELEVANT").sort((a, b) => b.rule_relevance - a.rule_relevance).slice(0, 20).map((item) => `- ${item.title} — ${item.deadline_text ?? "截止日期未确认"} — ${item.relevance} — ${item.detail_url}`), ""].join("\n").replace(/\n+$/u, "\n"));
  fs.writeFileSync(globalReportPath, ["# 海外聚合源发现报告", "", "| source_id | items_seen | new | relevant | official_backtrace_success | adapter_status |", "| --- | ---: | ---: | ---: | ---: | --- |", ...reportRows(globalIds), "", "Crafts Council 第三方机会必须回溯组织者官网；本轮若被 Cloudflare/HTTP 阻断，记录 BLOCKED，不视为适配成功。", ""].join("\n"));
  const chuangsaiyunItems = sourceItems("chuangsaiyun-competition-list");
  const chuangsaiyunHealth = health.find((row) => row.source_id === "chuangsaiyun-competition-list");
  fs.writeFileSync(chuangsaiyunReportPath, [
    "# 创赛云聚合发现专项报告", "", "- 来源页面：<https://www.chuangsaiyun.com/#/diy?id=150>", "- 技术状态：P0_ACTIVE（公开 diy 配置接口 + 公开赛事日历 HTML；适配器不模拟浏览器点击）", `- 页面总条数：${chuangsaiyunHealth?.items_seen ?? 0}`, `- 规则命中数量：${chuangsaiyunItems.filter((item) => item.rule_relevance > 0).length}`, `- 语义命中数量：${chuangsaiyunItems.filter((item) => item.relevance !== "IRRELEVANT").length}`, `- 官方回溯成功数量：${chuangsaiyunItems.filter((item) => item.official_backtrace_status === "OFFICIAL_FOUND").length}`, `- 合格数量：${chuangsaiyunItems.filter((item) => item.official_backtrace_status === "OFFICIAL_FOUND" && item.deadline_at && item.application_url).length}`, "", "聚合源只负责发现；正式发布必须回溯主办方官方详情页。", "", "## 贡献统计", "", "| metric | value |", "| --- | ---: |", `| items_seen | ${chuangsaiyunHealth?.items_seen ?? 0} |`, `| new_items | ${chuangsaiyunItems.filter((item) => item.status === "NEW").length} |`, `| relevant | ${chuangsaiyunItems.filter((item) => item.relevance === "CORE_ICH" || item.relevance === "ICH_ADJACENT").length} |`, `| official_backtrace_success | ${chuangsaiyunItems.filter((item) => item.official_backtrace_status === "OFFICIAL_FOUND").length} |`, `| qualified | ${chuangsaiyunItems.filter((item) => item.official_backtrace_status === "OFFICIAL_FOUND" && item.deadline_at && item.application_url).length} |`, "", "## Top Relevant Candidates", "", ...chuangsaiyunItems.filter((item) => item.relevance !== "IRRELEVANT").sort((a, b) => b.rule_relevance - a.rule_relevance).slice(0, 20).map((item) => `- ${item.title} — ${item.deadline_text ?? "截止日期未确认"} — ${item.relevance} — ${item.detail_url}`), "", "## 与设计竞赛网去重", "", "同一标题/截止日的聚合条目通过跨源 identity 合并，并保留 `discovered_by_sources`。", "",].join("\n"));
  fs.writeFileSync(providerReportPath, ["# Stage5-A.4 Provider Contribution", "", "本阶段只记录实际运行贡献；没有 Provider 配置时不把配置当成成功。", "", "| provider | queries | raw_results | official_sources_found | qualified_candidates |", "| --- | ---: | ---: | ---: | ---: |", `| direct-aggregation-adapters | ${registry.length} | ${parsedItems.length} | ${funnel.official_backtrace_success} | ${funnel.qualified_candidates} |`, `| search-provider-backtrace | ${providerAvailable() ? relevantForBacktrace.length : 0} | ${providerAvailable() ? relevantForBacktrace.length : 0} | 0 | 0 |`, "", "## Domestic source contribution (kept separate)", "", "| source_id | items_seen | new_items | relevant | official_backtrace_success | qualified |", "| --- | ---: | ---: | ---: | ---: | ---: |", ...["shejijingsai-list", "chuangsaiyun-competition-list"].map((id) => { const rows = sourceItems(id); const h = health.find((row) => row.source_id === id); return `| ${id} | ${h?.items_seen ?? 0} | ${rows.filter((item) => item.status === "NEW").length} | ${rows.filter((item) => item.relevance === "CORE_ICH" || item.relevance === "ICH_ADJACENT").length} | ${rows.filter((item) => item.official_backtrace_status === "OFFICIAL_FOUND").length} | ${rows.filter((item) => item.official_backtrace_status === "OFFICIAL_FOUND" && item.deadline_at && item.application_url).length} |`; }), ""].join("\n").replace(/\n+$/u, "\n"));
  fs.writeFileSync(rejectedReportPath, ["# Stage5-A.4 Rejected / Pending Candidates", "", "聚合源仅用于发现；以下记录未达到 L1/DS3，不进入正式机会库。", "", ...items.filter((item) => item.relevance === "IRRELEVANT" || item.official_backtrace_status !== "OFFICIAL_FOUND").slice(0, 500).map((item) => `- ${item.title} — ${item.relevance}; backtrace=${item.official_backtrace_status}; ${item.detail_url}`), ""].join("\n"));
  writeLedger(ledgerPath, compared.entries.map((entry) => {
    const current = items.find((item) => item.item_id === entry.item_id);
    const l1Complete = Boolean(current && current.official_backtrace_status === "OFFICIAL_FOUND" && current.title && current.deadline_at && current.application_url);
    return current ? { ...entry, official_backtrace_status: current.official_backtrace_status, candidate_status: l1Complete ? "qualified" : current.relevance === "IRRELEVANT" ? "rejected" : "pending" } : entry;
  }), finishedAt);
  console.log(JSON.stringify({ run_id: report.run_id, gate: report.gate, sources: health.map((row) => ({ source_id: row.source_id, adapter_status: row.adapter_status, items_seen: row.items_seen })), funnel, baseline: report.baseline, formal_store_unchanged: report.formal_store_unchanged, ledger: path.relative(root, ledgerPath) }, null, 2));
  if (report.gate === "blocked") process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
