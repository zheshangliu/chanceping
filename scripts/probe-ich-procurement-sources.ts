import fs from "node:fs/promises";
import path from "node:path";

type ResearchSource = {
  source_id: string; name: string; entry_url?: string; priority?: string; evidence_level?: string;
  source_role?: string; runtime_verified?: boolean; integration_status?: string; access_notes?: string;
};

const root = path.resolve(process.env.CHANCEPING_PROCUREMENT_CONFIG_DIR ?? "config/procurement");
const output = path.resolve(process.env.CHANCEPING_PROCUREMENT_PROBE_PATH ?? "reports/ich/procurement/source-probe.json");
const runtimeUrls: Record<string, string> = {
  "proc-uk-fts": "https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages?limit=100",
  "proc-ca-canadabuys": "https://canadabuys.canada.ca/opendata/pub/openTenderNotice-ouvertAvisAppelOffres.csv",
};

async function probe(url: string): Promise<{ http_status: number | null; content_type: string | null; bytes: number; access_constraint: string | null; sample_records: number; }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), url.endsWith(".csv") ? 30_000 : 10_000);
  try {
    const response = await fetch(url, { redirect: "follow", signal: controller.signal, headers: { "user-agent": "ChancePing-Procurement-Probe/1.0", accept: "application/json,text/csv,text/html;q=0.8,*/*;q=0.5" } });
    const reader = response.body?.getReader();
    let bytes = 0; let text = "";
    if (reader) { while (bytes < 256_000) { const next = await reader.read(); if (next.done) break; bytes += next.value.byteLength; if (text.length < 64_000) text += new TextDecoder().decode(next.value, { stream: true }); } await reader.cancel().catch(() => undefined); }
    const sample_records = (text.match(/"ocid"|"title-titre-eng"|<article\b|<tr\b/giu) ?? []).length;
    const access_constraint = response.status === 401 || response.status === 403 ? "ACCESS_DENIED_OR_WAF" : response.status === 429 ? "RATE_LIMITED" : response.status >= 500 ? "UPSTREAM_ERROR" : null;
    return { http_status: response.status, content_type: response.headers.get("content-type"), bytes, access_constraint, sample_records };
  } finally { clearTimeout(timer); }
}

function disposition(source: ResearchSource, result: Awaited<ReturnType<typeof probe>> | null, error: string | null): string {
  if (source.priority === "EXCLUDE") return "EXCLUDED_BY_PACKAGE";
  if (!source.entry_url && !runtimeUrls[source.source_id]) return "CHANNEL_OR_DISCOVERY_ONLY";
  if (error === "CREDENTIAL_NOT_CONFIGURED") return "BLOCKED_CREDENTIAL_NOT_CONFIGURED";
  if (error || result?.access_constraint) return "BLOCKED_PUBLIC_ACCESS";
  if (result && result.http_status && result.http_status >= 200 && result.http_status < 300 && result.sample_records > 0) return runtimeUrls[source.source_id] ? "LIVE_PUBLIC_CANDIDATE" : "PUBLIC_INDEX_RESEARCHED";
  if (result && result.http_status && result.http_status >= 200 && result.http_status < 300) return "PUBLIC_PAGE_NO_STRUCTURED_LISTING";
  return "NO_PUBLIC_LISTING_VERIFIED";
}

async function main(): Promise<void> {
  const payload = JSON.parse(await fs.readFile(path.join(root, "source-research.json"), "utf8")) as { sources: ResearchSource[] };
  const sources = payload.sources ?? [];
  const rows = await Promise.all(sources.map(async (source) => {
    const resolved_url = runtimeUrls[source.source_id] ?? source.entry_url ?? null;
    if (source.source_id === "proc-us-sam") return { source_id: source.source_id, name: source.name, priority: source.priority, resolved_url, observed_at: new Date().toISOString(), runtime_state: "BLOCKED_CREDENTIAL_NOT_CONFIGURED", disposition: "BLOCKED_CREDENTIAL_NOT_CONFIGURED", http_status: null, content_type: null, bytes: 0, sample_records: 0, adapter_id: null, reason: "Official SAM API requires a user-authorized API key; no key was used or created." };
    if (!resolved_url) return { source_id: source.source_id, name: source.name, priority: source.priority, resolved_url, observed_at: new Date().toISOString(), runtime_state: "RESEARCH_ONLY", disposition: disposition(source, null, null), http_status: null, content_type: null, bytes: 0, sample_records: 0, adapter_id: null, reason: source.access_notes ?? "No public listing URL in research directory." };
    try {
      const result = await probe(resolved_url);
      const dispositionValue = disposition(source, result, null);
      return { source_id: source.source_id, name: source.name, priority: source.priority, resolved_url, observed_at: new Date().toISOString(), runtime_state: dispositionValue === "LIVE_PUBLIC_CANDIDATE" ? "LIVE_PUBLIC" : "RESEARCH_ONLY", disposition: dispositionValue, http_status: result.http_status, content_type: result.content_type, bytes: result.bytes, sample_records: result.sample_records, adapter_id: runtimeUrls[source.source_id] ? `procurement-${source.source_id}` : null, reason: result.access_constraint ?? (result.sample_records ? "Public response observed; adapter/runtime qualification is bounded to the configured endpoint." : "Public page reached, but no structured notice records were identified by the bounded probe.") };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { source_id: source.source_id, name: source.name, priority: source.priority, resolved_url, observed_at: new Date().toISOString(), runtime_state: "BLOCKED", disposition: "BLOCKED_PUBLIC_ACCESS", http_status: null, content_type: null, bytes: 0, sample_records: 0, adapter_id: null, reason: message };
    }
  }));
  const counts = rows.reduce<Record<string, number>>((acc, row) => { acc[row.disposition] = (acc[row.disposition] ?? 0) + 1; return acc; }, {});
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, JSON.stringify({ schema_version: "chanceping-ich-procurement-source-probe.v1", observed_at: new Date().toISOString(), source_count: rows.length, counts, sources: rows }, null, 2) + "\n");
  console.log(JSON.stringify({ source_count: rows.length, counts, output }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
