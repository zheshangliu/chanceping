import fs from "node:fs";
import path from "node:path";

interface MemoItem {
  id: string;
  title?: string;
  original_title?: string;
  summary?: string;
  original_summary?: string;
  source_id?: string;
  source_name?: string;
  deadline?: string | null;
  deadline_text?: string | null;
  status?: string;
  is_long_term?: boolean;
  detail_url?: string;
  discovered_by_sources?: string[];
  deadline_resolution?: string;
  deadline_conflicts?: Array<unknown>;
}

interface SourceRow {
  id: string;
  name: string;
  region?: string;
  status?: string;
}

interface HealthRow {
  source_id: string;
  deadline_attempted?: number;
  deadline_resolved?: number;
  deadline_unknown?: number;
  deadline_conflicts?: number;
}

interface CoverageRow {
  source_id: string;
  source_name: string;
  region: string | null;
  status: string | null;
  memo_current_competitions: number;
  known_deadline: number;
  unknown_deadline: number;
  unknown_rate: number;
  long_term: number;
  expired_in_memo: number;
  primary_records: number;
  discovered_by_contribution: number;
  evidence: { detail_url_exists: number; title_date: number; summary_date: number; deadline_text: number; no_usable_date_evidence: number };
  pool_records: number;
  pool_known_deadline: number;
  pool_unknown_deadline: number;
  expired_after_resolution: number;
  conflicts: number;
  resolution_counts: Record<string, number>;
  health?: HealthRow;
}

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8")) as T;
}

function hasDate(value: string): boolean {
  return /(?:20\d{2}\s*[年./-]\s*\d{1,2}\s*[月./-]\s*\d{1,2}|\d{1,2}\s*[月./-]\s*\d{1,2}|\d{1,2}\s*[/-]\s*\d{1,2}\s*[/-]\s*20\d{2}|\b20\d{2}-\d{1,2}-\d{1,2}\b|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2})/iu.test(value);
}

function pct(value: number, total: number): number {
  return total ? Number(((value / total) * 100).toFixed(2)) : 0;
}

function main(): void {
  const memoPath = arg("--memo") ?? process.env.CHANCEPING_AUDIT_MEMO_PATH ?? "audits/ich/production/latest/memo.json";
  const poolPath = arg("--pool") ?? process.env.CHANCEPING_AUDIT_POOL_PATH;
  const sourcesPath = arg("--sources") ?? process.env.CHANCEPING_AUDIT_SOURCES_PATH ?? "audits/ich/production/latest/sources.json";
  const healthPath = arg("--health") ?? process.env.CHANCEPING_AUDIT_HEALTH_PATH ?? "data/opportunity-v2/source-health.json";
  const memo = readJson<{ total?: number; known_deadlines?: number; unknown_deadlines?: number; coverage?: number | Record<string, unknown>; items?: MemoItem[] }>(memoPath);
  const sources = fs.existsSync(path.resolve(sourcesPath)) ? readJson<{ sources?: SourceRow[] }>(sourcesPath).sources ?? [] : [];
  const health = fs.existsSync(path.resolve(healthPath)) ? (readJson<{ sources?: HealthRow[] }>(healthPath).sources ?? []) : [];
  const byId = new Map(sources.map((source) => [source.id, source]));
  const healthById = new Map(health.map((row) => [row.source_id, row]));
  const rows = new Map<string, CoverageRow>();
  for (const item of memo.items ?? []) {
    const id = item.source_id ?? "unknown-source";
    const source = byId.get(id);
    const row = rows.get(id) ?? {
      source_id: id, source_name: item.source_name ?? source?.name ?? id, region: source?.region ?? null, status: source?.status ?? null,
      memo_current_competitions: 0, known_deadline: 0, unknown_deadline: 0, unknown_rate: 0, long_term: 0, expired_in_memo: 0, primary_records: 0, discovered_by_contribution: 0,
      evidence: { detail_url_exists: 0, title_date: 0, summary_date: 0, deadline_text: 0, no_usable_date_evidence: 0 }, pool_records: 0, pool_known_deadline: 0, pool_unknown_deadline: 0, expired_after_resolution: 0, conflicts: 0, resolution_counts: {}, health: healthById.get(id),
    };
    row.memo_current_competitions += 1;
    row.primary_records += item.source_id === id ? 1 : 0;
    row.discovered_by_contribution += item.discovered_by_sources?.includes(id) ? 1 : 0;
    row.known_deadline += item.deadline ? 1 : 0;
    row.unknown_deadline += item.deadline ? 0 : 1;
    row.long_term += item.is_long_term ? 1 : 0;
    row.expired_in_memo += item.status === "EXPIRED" ? 1 : 0;
    const title = `${item.title ?? ""} ${item.original_title ?? ""}`;
    const summary = `${item.summary ?? ""} ${item.original_summary ?? ""}`;
    if (item.detail_url) row.evidence.detail_url_exists += 1;
    if (hasDate(title)) row.evidence.title_date += 1;
    if (hasDate(summary)) row.evidence.summary_date += 1;
    if (item.deadline_text) row.evidence.deadline_text += 1;
    if (!item.deadline && !hasDate(title) && !hasDate(summary) && !item.deadline_text) row.evidence.no_usable_date_evidence += 1;
    rows.set(id, row);
  }
  if (poolPath && fs.existsSync(path.resolve(poolPath))) {
    const pool = readJson<{ opportunities?: MemoItem[] }>(poolPath).opportunities ?? [];
    for (const item of pool) {
      const id = item.source_id ?? "unknown-source";
      const source = byId.get(id);
      const row = rows.get(id) ?? {
        source_id: id, source_name: item.source_name ?? source?.name ?? id, region: source?.region ?? null, status: source?.status ?? null,
        memo_current_competitions: 0, known_deadline: 0, unknown_deadline: 0, unknown_rate: 0, long_term: 0, expired_in_memo: 0, primary_records: 0, discovered_by_contribution: 0,
        evidence: { detail_url_exists: 0, title_date: 0, summary_date: 0, deadline_text: 0, no_usable_date_evidence: 0 }, pool_records: 0, pool_known_deadline: 0, pool_unknown_deadline: 0, expired_after_resolution: 0, conflicts: 0, resolution_counts: {}, health: healthById.get(id),
      };
      row.pool_records += 1;
      row.pool_known_deadline += item.deadline ? 1 : 0;
      row.pool_unknown_deadline += item.deadline ? 0 : 1;
      row.expired_after_resolution += item.deadline && item.status === "EXPIRED" ? 1 : 0;
      row.conflicts += item.deadline_conflicts?.length ?? 0;
      const resolution = item.deadline_resolution ?? (item.deadline ? "found" : "not_recorded");
      row.resolution_counts[resolution] = (row.resolution_counts[resolution] ?? 0) + 1;
      rows.set(id, row);
    }
  }
  for (const row of rows.values()) row.unknown_rate = pct(row.unknown_deadline, row.memo_current_competitions);
  const topByUnknown = [...rows.values()].sort((a, b) => b.unknown_deadline - a.unknown_deadline || b.unknown_rate - a.unknown_rate).slice(0, 10);
  const topByRate = [...rows.values()].filter((row) => row.memo_current_competitions >= 5).sort((a, b) => b.unknown_rate - a.unknown_rate || b.unknown_deadline - a.unknown_deadline).slice(0, 10);
  const total = memo.total ?? (memo.items ?? []).length;
  const known = memo.known_deadlines ?? (memo.items ?? []).filter((item) => item.deadline).length;
  const unknown = memo.unknown_deadlines ?? total - known;
  const coverageValue = typeof memo.coverage === "number" ? memo.coverage : pct(known, total);
  const report = {
    schema_version: "chanceping.ich.deadline-coverage.v1",
    generated_at: new Date().toISOString(),
    input: { memo: path.resolve(memoPath), pool: poolPath ? path.resolve(poolPath) : null, sources: path.resolve(sourcesPath), health: path.resolve(healthPath) },
    baseline: { memo_total: total, known_deadline: known, unknown_deadline: unknown, coverage_rate: coverageValue },
    after_pool: poolPath && fs.existsSync(path.resolve(poolPath)) ? (() => { const items = readJson<{ opportunities?: MemoItem[] }>(poolPath).opportunities ?? []; const knownPool = items.filter((item) => item.deadline).length; return { pool_total: items.length, known_deadline: knownPool, unknown_deadline: items.length - knownPool, conflicts: items.reduce((count, item) => count + (item.deadline_conflicts?.length ?? 0), 0), expired_after_resolution: items.filter((item) => item.deadline && item.status === "EXPIRED").length, coverage_rate: pct(knownPool, items.length) }; })() : null,
    top_by_unknown_count: topByUnknown,
    top_by_unknown_rate: topByRate,
    sources: [...rows.values()].sort((a, b) => b.unknown_deadline - a.unknown_deadline),
  };
  const stamp = report.generated_at.replace(/[-:.TZ]/gu, "").slice(0, 14);
  const reportDir = path.resolve(process.env.CHANCEPING_DEADLINE_REPORT_DIR ?? "reports/ich");
  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(path.join(reportDir, `deadline-coverage-${stamp}.json`), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  const lines = ["# ICH Deadline Coverage Baseline", "", `Generated: ${report.generated_at}`, "", "## BASELINE", "", `- memo_total: ${total}`, `- known_deadline: ${known}`, `- unknown_deadline: ${unknown}`, `- coverage_rate: ${report.baseline.coverage_rate}%`, "", "## TOP 10 BY UNKNOWN COUNT", "", "| source | total | known | unknown | unknown rate |", "|---|---:|---:|---:|---:|", ...topByUnknown.map((row) => `| ${row.source_name} (${row.source_id}) | ${row.memo_current_competitions} | ${row.known_deadline} | ${row.unknown_deadline} | ${row.unknown_rate}% |`), "", "## TOP 10 BY UNKNOWN RATE (MIN 5)", "", "| source | total | known | unknown | unknown rate |", "|---|---:|---:|---:|---:|", ...topByRate.map((row) => `| ${row.source_name} (${row.source_id}) | ${row.memo_current_competitions} | ${row.known_deadline} | ${row.unknown_deadline} | ${row.unknown_rate}% |`)];
  fs.writeFileSync(path.join(reportDir, `deadline-coverage-${stamp}.md`), `${lines.join("\n")}\n`, "utf8");
  console.log(JSON.stringify({ baseline: report.baseline, top_by_unknown_count: topByUnknown.map((row) => ({ source_id: row.source_id, total: row.memo_current_competitions, unknown: row.unknown_deadline, unknown_rate: row.unknown_rate })), report_dir: reportDir }, null, 2));
}

main();
