/**
 * Read-only historical TikHub spend audit.
 *
 * This script only reads existing JSON/Markdown/log artifacts. It never
 * imports a provider client, loads an API key, or performs a network request.
 * Pass one or more artifact roots with --root when historical evidence lives
 * outside the current checkout (for example, after a repository move).
 */
import { readFile, readdir } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve } from "node:path";

interface AuditRow {
  endpoint: string;
  calls: number | null;
  known_unit_price_usd: number | null;
  known_subtotal_usd: number | null;
  run_id: string | null;
  triggering_script_or_file: string;
  timestamp_range: string | null;
  confidence: string;
}

interface JsonRecord { [key: string]: unknown }

const ENDPOINT_ALIASES: Record<string, string> = {
  search_jobs: "search_jobs",
  get_user_profile: "get_user_profile",
  get_company_profile: "get_company_profile",
};

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const roots = argumentValues(args, "--root").map((root) => resolve(root));
  const scanRoots = roots.length > 0 ? roots : [resolve("data/benchmarks"), resolve("docs/phase5")];
  const files = (await Promise.all(scanRoots.map((root) => walk(root)))).flat();
  const rows: AuditRow[] = [];
  for (const file of files) {
    const text = await safeRead(file);
    if (!text || !/tikhub/i.test(`${file}\n${text}`)) continue;
    const parsed = parseJson(text);
    if (basename(file) === "benchmark-run.json" && parsed) collectBenchmarkRun(parsed, file, rows);
    if (basename(file) === "diagnostic.json" && parsed) collectDiagnostic(parsed, file, rows);
  }

  // This is the operator-confirmed billing observation from the prior run,
  // not a value inferred from an artifact. It is intentionally marked as such
  // because no billing export was committed to the repository.
  const confirmedCalls = numberArgument(args, "--confirmed-search-jobs-calls");
  const confirmedUnitPrice = numberArgument(args, "--confirmed-search-jobs-unit-price");
  if (confirmedCalls !== null || confirmedUnitPrice !== null) {
    const calls = confirmedCalls ?? null;
    const unit = confirmedUnitPrice ?? null;
    rows.push({
      endpoint: "search_jobs",
      calls,
      known_unit_price_usd: unit,
      known_subtotal_usd: calls !== null && unit !== null ? round(calls * unit) : null,
      run_id: stringArgument(args, "--confirmed-run-id"),
      triggering_script_or_file: "operator-confirmed billing observation (no billing export in repo)",
      timestamp_range: stringArgument(args, "--confirmed-timestamp-range"),
      confidence: "USER_CONFIRMED; artifact/billing receipt not present",
    });
  }

  const report = renderReport(scanRoots, rows);
  const output = stringArgument(args, "--out");
  if (output) {
    const { mkdir, writeFile } = await import("node:fs/promises");
    const destination = isAbsolute(output) ? output : resolve(output);
    await mkdir(resolve(destination, ".."), { recursive: true });
    await writeFile(destination, `${report}\n`, "utf8");
  }
  console.log(report);
}

function collectBenchmarkRun(record: JsonRecord, file: string, rows: AuditRow[]): void {
  const runId = stringValue(record.runId) ?? stringValue(record.run_id);
  const timestamp = stringValue(record.startedAt) ?? stringValue(record.started_at);
  const requestCount = objectValue(record.requestCount);
  const aggregate = numberValue(requestCount?.tikhub);
  if (aggregate !== null) rows.push({
    endpoint: "TIKHUB_ALL_ENDPOINTS",
    calls: aggregate,
    known_unit_price_usd: null,
    known_subtotal_usd: null,
    run_id: runId,
    triggering_script_or_file: file,
    timestamp_range: timestamp,
    confidence: "RECORDED aggregate; endpoint allocation unavailable",
  });

  const jobMetrics = objectValue(record.jobMetrics);
  const jobCalls = numberValue(jobMetrics?.totalRequests);
  if (jobCalls !== null) rows.push({
    endpoint: "search_jobs",
    calls: jobCalls,
    known_unit_price_usd: null,
    known_subtotal_usd: null,
    run_id: runId,
    triggering_script_or_file: file,
    timestamp_range: timestamp,
    confidence: "RECORDED job metric; price and failed-attempt accounting not in artifact",
  });

  const employmentFile = join(file, "..", "employment-verification-results.json");
  // The sibling file is collected separately by collectDiagnostic only when
  // it is a diagnostic artifact; no request count is inferred from candidates.
  void employmentFile;
}

function collectDiagnostic(record: JsonRecord, file: string, rows: AuditRow[]): void {
  const endpoint = endpointName(stringValue(record.endpoint));
  const calls = numberValue(record.requestCount) ?? numberValue(record.selectedCount);
  if (!endpoint || calls === null) return;
  rows.push({
    endpoint,
    calls,
    known_unit_price_usd: null,
    known_subtotal_usd: null,
    run_id: stringValue(record.runId) ?? stringValue(record.run_id),
    triggering_script_or_file: file,
    timestamp_range: stringValue(record.startedAt) ?? stringValue(record.started_at),
    confidence: "RECORDED diagnostic request count; price not in artifact",
  });
}

function renderReport(roots: string[], rows: AuditRow[]): string {
  const lines = [
    "# V1.2.1 TikHub Cost Audit",
    "",
    "Read-only audit: no API client, API key, health check, or network request is used.",
    `Artifact roots: ${roots.join(", ")}`,
    "",
    "| Endpoint | Calls | Known Unit Price (USD) | Known Subtotal (USD) | Run ID | Triggering Script / File | Timestamp Range | Confidence |",
    "| --- | ---: | ---: | ---: | --- | --- | --- | --- |",
  ];
  if (rows.length === 0) lines.push("| UNCONFIRMED | — | — | — | — | no matching artifacts found | — | UNCONFIRMED |");
  for (const row of rows) lines.push(`| ${row.endpoint} | ${displayNumber(row.calls)} | ${displayMoney(row.known_unit_price_usd)} | ${displayMoney(row.known_subtotal_usd)} | ${row.run_id ?? "—"} | ${row.triggering_script_or_file} | ${row.timestamp_range ?? "—"} | ${row.confidence} |`);
  lines.push("", "## Accounting rules", "", "- Rows labelled `RECORDED aggregate` are not added to endpoint rows; they are an aggregate cross-check.", "- Missing prices, failed-attempt accounting, or billing exports remain `UNCONFIRMED`; this audit never treats unknown as zero.", "- Historical raw evidence is not modified.");
  return lines.join("\n");
}

async function walk(root: string): Promise<string[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
      const full = join(root, entry.name);
      if (entry.isDirectory()) files.push(...await walk(full));
      else if (entry.isFile() && /\.(?:json|md|log|txt)$/i.test(entry.name)) files.push(full);
    }
    return files;
  } catch { return []; }
}

async function safeRead(file: string): Promise<string | null> { try { return await readFile(file, "utf8"); } catch { return null; } }
function parseJson(text: string): JsonRecord | null { try { const parsed: unknown = JSON.parse(text); return objectValue(parsed); } catch { return null; } }
function argumentValues(args: string[], name: string): string[] { const values: string[] = []; for (let i = 0; i < args.length; i += 1) if (args[i] === name && args[i + 1]) values.push(args[i + 1]); return values; }
function stringArgument(args: string[], name: string): string | null { return argumentValues(args, name)[0] ?? null; }
function numberArgument(args: string[], name: string): number | null { const value = stringArgument(args, name); if (value === null) return null; const number = Number(value); return Number.isFinite(number) ? number : null; }
function endpointName(value: string | null): string | null { if (!value) return null; const match = Object.keys(ENDPOINT_ALIASES).find((key) => value.includes(key)); return match ? ENDPOINT_ALIASES[match] : null; }
function objectValue(value: unknown): JsonRecord | null { return typeof value === "object" && value !== null && !Array.isArray(value) ? value as JsonRecord : null; }
function numberValue(value: unknown): number | null { return typeof value === "number" && Number.isFinite(value) ? value : null; }
function stringValue(value: unknown): string | null { return typeof value === "string" && value.length > 0 ? value : null; }
function displayNumber(value: number | null): string { return value === null ? "—" : String(value); }
function displayMoney(value: number | null): string { return value === null ? "—" : value.toFixed(3); }
function round(value: number): number { return Math.round(value * 1000) / 1000; }

void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
