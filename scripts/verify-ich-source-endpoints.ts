import fs from "node:fs";
import path from "node:path";
import { getIchSourceRegistryV2, type IchSourceRegistryV2Entry } from "../src/ich/source-registry-v2";

type PageType = "listing" | "search" | "homepage_or_landing" | "blocked" | "error" | "unknown";

interface EndpointResult {
  id: string;
  name: string;
  canonical_url: string;
  access_mode: IchSourceRegistryV2Entry["access_mode"];
  checked_at: string;
  status: number | null;
  ok: boolean;
  final_url: string | null;
  content_type: string | null;
  response_bytes: number | null;
  title: string | null;
  page_type: PageType;
  page_type_basis: string;
  javascript_required: boolean | null;
  javascript_signals: string[];
  link_count: number | null;
  pagination_signal: boolean | null;
  elapsed_ms: number;
  error: string | null;
}

interface EndpointReport {
  schema_version: "ich-source-endpoints.v1";
  checked_at: string;
  readonly: true;
  registry_schema_version: string;
  total: number;
  status_counts: Record<string, number>;
  page_type_counts: Record<string, number>;
  follow_up_ids: string[];
  gate: "pass" | "pass_with_followups" | "incomplete";
  results: EndpointResult[];
}

const registry = getIchSourceRegistryV2();
const outputArgIndex = process.argv.indexOf("--output");
const outputPath = path.resolve(
  outputArgIndex >= 0 && process.argv[outputArgIndex + 1]
    ? process.argv[outputArgIndex + 1]
    : "docs/ich/DS1-A-来源端点核验记录_V1.0.json",
);
const timeoutArgIndex = process.argv.indexOf("--timeout-ms");
const timeoutMs = Number(timeoutArgIndex >= 0 ? process.argv[timeoutArgIndex + 1] : 20_000);
const concurrencyArgIndex = process.argv.indexOf("--concurrency");
const concurrency = Math.max(1, Number(concurrencyArgIndex >= 0 ? process.argv[concurrencyArgIndex + 1] : 6));
const userAgent = "ChancePing-DS1-readonly-verifier/1.0";

function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match?.[1]?.replace(/\s+/g, " ").trim() || null;
}

function classifyPage(source: IchSourceRegistryV2Entry, finalUrl: string | null, html: string, status: number | null): { pageType: PageType; basis: string } {
  if (status === null) return { pageType: "error", basis: "No HTTP response; network/error path" };
  if (status === 401 || status === 403 || status === 429) return { pageType: "blocked", basis: `HTTP ${status}` };
  if (status >= 400) return { pageType: "unknown", basis: `HTTP ${status}` };
  const url = finalUrl ? new URL(finalUrl) : new URL(source.canonical_url);
  const pathName = url.pathname.toLowerCase();
  const listingSignals = /notice|notices|ggzy|cggg|opportunit|open-call|open_calls|program|programs|sector-support|whzx|tzgg|index\.htm/.test(`${pathName}${url.search}`);
  if (source.access_mode === "search" || Boolean(url.search)) return { pageType: "search", basis: "Configured search mode or query URL (INFERENCE)" };
  if (listingSignals || /<article\b|<li\b/i.test(html) && (html.match(/<a\b/gi)?.length ?? 0) >= 8) {
    return { pageType: "listing", basis: "Listing URL/path or repeated links detected (INFERENCE)" };
  }
  if (pathName === "/" || /\/index(?:\.html?|\/?)?$/.test(pathName)) {
    return { pageType: "homepage_or_landing", basis: "Root/index path; not a concrete opportunity detail page (INFERENCE)" };
  }
  return { pageType: "unknown", basis: "No reliable page-type signal" };
}

async function fetchOne(source: IchSourceRegistryV2Entry): Promise<EndpointResult> {
  const checkedAt = new Date().toISOString();
  const started = Date.now();
  let lastError: string | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(source.canonical_url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: { "user-agent": userAgent },
      });
      const body = await response.text();
      const javascriptSignals = [
        "enable javascript",
        "javascript required",
        "请启用javascript",
        "__next_data__",
        "window.__nuxt__",
        "cf-chl-",
      ].filter((signal) => body.toLowerCase().includes(signal));
      const scriptCount = body.match(/<script\b/gi)?.length ?? 0;
      const linkCount = body.match(/<a\b/gi)?.length ?? 0;
      const page = classifyPage(source, response.url, body, response.status);
      return {
        id: source.id,
        name: source.name,
        canonical_url: source.canonical_url,
        access_mode: source.access_mode,
        checked_at: checkedAt,
        status: response.status,
        ok: response.status >= 200 && response.status < 400,
        final_url: response.url,
        content_type: response.headers.get("content-type"),
        response_bytes: Buffer.byteLength(body),
        title: extractTitle(body),
        page_type: page.pageType,
        page_type_basis: page.basis,
        javascript_required: response.status === 403 || javascriptSignals.length > 0 || (body.length < 1200 && scriptCount > 0),
        javascript_signals: javascriptSignals,
        link_count: linkCount,
        pagination_signal: /分页|下一页|next|page=|pagination/i.test(body),
        elapsed_ms: Date.now() - started,
        error: null,
      };
    } catch (error) {
      lastError = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    } finally {
      clearTimeout(timeout);
    }
  }
  return {
    id: source.id,
    name: source.name,
    canonical_url: source.canonical_url,
    access_mode: source.access_mode,
    checked_at: checkedAt,
    status: null,
    ok: false,
    final_url: null,
    content_type: null,
    response_bytes: null,
    title: null,
    page_type: "error",
    page_type_basis: "No HTTP response after readonly retry",
    javascript_required: null,
    javascript_signals: [],
    link_count: null,
    pagination_signal: null,
    elapsed_ms: Date.now() - started,
    error: lastError,
  };
}

async function main(): Promise<void> {
  const results: EndpointResult[] = [];
  for (let index = 0; index < registry.sources.length; index += concurrency) {
    const batch = registry.sources.slice(index, index + concurrency);
    results.push(...await Promise.all(batch.map(fetchOne)));
  }
  const statusCounts = results.reduce<Record<string, number>>((counts, result) => {
    const key = result.status === null ? "error" : String(result.status);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
  const pageTypeCounts = results.reduce<Record<string, number>>((counts, result) => {
    counts[result.page_type] = (counts[result.page_type] ?? 0) + 1;
    return counts;
  }, {});
  const followUpIds = results
    .filter((result) => !result.ok || result.page_type === "blocked" || result.javascript_required === true)
    .map((result) => result.id);
  const report: EndpointReport = {
    schema_version: "ich-source-endpoints.v1",
    checked_at: new Date().toISOString(),
    readonly: true,
    registry_schema_version: registry.schema_version,
    total: results.length,
    status_counts: statusCounts,
    page_type_counts: pageTypeCounts,
    follow_up_ids: followUpIds,
    gate: results.length === registry.sources.length
      ? (followUpIds.length === 0 ? "pass" : "pass_with_followups")
      : "incomplete",
    results,
  };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({
    output: path.relative(process.cwd(), outputPath),
    total: report.total,
    status_counts: report.status_counts,
    page_type_counts: report.page_type_counts,
    follow_up_count: report.follow_up_ids.length,
    gate: report.gate,
  }, null, 2));
  if (report.gate === "incomplete") process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
