import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { isForeignLanguageOpportunity } from "../src/opportunity-v2/display";
import { getOpportunityV2SourcePermission, getOpportunityV2SourcePermissionEvidence, sourceFreshness } from "../src/opportunity-v2/source-governance";
import { extractOpportunityIds } from "../src/opportunity-v2/v14-baseline";
import type { OpportunityV2 } from "../src/opportunity-v2/types";

type Obj = Record<string, unknown>;
interface Observation { status: number; body: string; }
interface SourceRow extends Obj { id: string; name: string; url: string; enabled: boolean; status: string; last_success_at?: string | null; current_contribution?: number; types?: string[]; }
interface PublicOpportunity extends OpportunityV2 { application_url?: string; official_url?: string; }
interface CoverageRow extends Obj { opportunity_id: string; view_types?: string[]; lane?: string; evidence?: Array<{ field?: string; source_url?: string; status?: string }>; }

const baseUrl = (process.env.CHANCEPING_V14_PRODUCTION_BASE_URL ?? "https://ich.chanceping.com").replace(/\/$/u, "");
const generatedAt = new Date().toISOString();
const runId = generatedAt.replace(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z");
const outputDir = path.resolve(process.env.CHANCEPING_V14_AUDIT_DIR ?? `audits/ich/v14/${runId}`);

function object(value: unknown): Obj { return value && typeof value === "object" && !Array.isArray(value) ? value as Obj : {}; }
function array(value: unknown): Obj[] { return Array.isArray(value) ? value.filter((entry): entry is Obj => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry)) : []; }
async function get(pathname: string): Promise<Observation> {
  const response = await fetch(new URL(pathname, `${baseUrl}/`), { signal: AbortSignal.timeout(30_000), redirect: "follow" });
  return { status: response.status, body: await response.text() };
}
function json(observation: Observation): Obj { try { return object(JSON.parse(observation.body)); } catch { return {}; } }
function unique(values: string[]): string[] { return [...new Set(values)].sort(); }
function sourceFamily(row: SourceRow): string {
  try {
    const labels = new URL(row.url).hostname.toLowerCase().replace(/^www\./u, "").replace(/\.$/u, "").split(".");
    const compoundSuffixes = new Set(["co.uk", "org.uk", "ac.uk", "com.cn", "net.cn", "org.cn", "co.kr", "or.kr", "com.au", "org.au"]);
    return labels.length < 2 ? labels.join(".") : compoundSuffixes.has(labels.slice(-2).join(".")) && labels.length >= 3 ? labels.slice(-3).join(".") : labels.slice(-2).join(".");
  } catch { return `source:${row.id}`; }
}
function statusLane(row: PublicOpportunity): string {
  if (row.status === "CURRENT") return "current";
  if (row.status === "UNKNOWN_DEADLINE") return "review";
  if (row.status === "EXPIRED") return "expired";
  return "unknown";
}
function write(name: string, value: unknown): void { fs.writeFileSync(path.join(outputDir, name), `${JSON.stringify(value, null, 2)}\n`, "utf8"); }

async function main(): Promise<void> {
  const observations = await Promise.all([
    get("/api/opportunity-v2/sources/overview"),
    get("/api/opportunity-v2/opportunities?limit=1000&page=1"),
    get("/api/opportunity-v2/workbench/coverage?limit=1000&page=1"),
    get("/api/opportunity-v2/workbench/opportunities?limit=1000&page=1"),
    get("/api/opportunity-v2/radar?limit=1000&page=1"),
    get("/ich/memo.json"),
    get("/ich/memo.md"),
  ]);
  const names = ["sources", "opportunities", "coverage", "procurement_workbench", "radar", "memo_json", "memo_markdown"] as const;
  const statuses = Object.fromEntries(names.map((name, index) => [name, observations[index].status]));
  if (Object.values(statuses).some((status) => status !== 200)) throw new Error(`Public audit endpoint failed: ${JSON.stringify(statuses)}`);
  const sourcePayload = json(observations[0]);
  const sources = array(sourcePayload.rows) as SourceRow[];
  const opportunityPayload = json(observations[1]);
  const opportunities = array(opportunityPayload.opportunities) as unknown as PublicOpportunity[];
  const coverageRows = array(json(observations[2]).opportunities) as CoverageRow[];
  const procurementRows = array(json(observations[3]).opportunities);
  const radarRows = array(json(observations[4]).opportunities) as unknown as PublicOpportunity[];
  const memoRows = array(json(observations[5]).items);
  const markdownIds = extractOpportunityIds(observations[6].body);
  const opportunityById = new Map(opportunities.map((item) => [item.id, item]));
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const generatedRows: Array<{ id: string; lane: string; view_type: string; source_ids: string[] }> = [];
  for (const item of opportunities) {
    if (item.category === "competition") generatedRows.push({ id: item.id, lane: statusLane(item), view_type: "competition_award", source_ids: unique([item.source_id, ...(item.discovered_by_sources ?? [])]) });
  }
  for (const row of procurementRows) {
    const id = String(row.opportunity_id ?? "");
    const item = opportunityById.get(id);
    if (id && item) generatedRows.push({ id, lane: String(row.lane ?? "unknown"), view_type: "procurement_order", source_ids: unique([item.source_id, ...(item.discovered_by_sources ?? [])]) });
  }
  for (const row of coverageRows) {
    const item = opportunityById.get(row.opportunity_id);
    if (!item) continue;
    for (const type of row.view_types ?? []) generatedRows.push({ id: row.opportunity_id, lane: String(row.lane ?? "unknown"), view_type: type, source_ids: unique([item.source_id, ...(item.discovered_by_sources ?? [])]) });
  }

  const sourceFamilies = new Map<string, { source_ids: Set<string>; names: Set<string>; registered: number; enabled: number; permission_states: Set<string> }>();
  for (const source of sources) {
    const family = sourceFamily(source);
    const row = sourceFamilies.get(family) ?? { source_ids: new Set<string>(), names: new Set<string>(), registered: 0, enabled: 0, permission_states: new Set<string>() };
    row.source_ids.add(source.id); row.names.add(source.name); row.registered += 1; row.enabled += source.enabled ? 1 : 0; row.permission_states.add(getOpportunityV2SourcePermission(source.id));
    sourceFamilies.set(family, row);
  }
  const matrix = new Map<string, { ids: Set<string>; current: Set<string>; early: Set<string>; review: Set<string>; research: Set<string>; foreign_title: Set<string>; official_link: Set<string>; sourced: Set<string> }>();
  for (const entry of generatedRows) {
    for (const sourceId of entry.source_ids) {
      const source = sourceById.get(sourceId);
      if (!source) continue;
      const family = sourceFamily(source);
      const key = `${family}\u0000${entry.view_type}`;
      const row = matrix.get(key) ?? { ids: new Set<string>(), current: new Set<string>(), early: new Set<string>(), review: new Set<string>(), research: new Set<string>(), foreign_title: new Set<string>(), official_link: new Set<string>(), sourced: new Set<string>() };
      const opportunity = opportunityById.get(entry.id);
      row.ids.add(entry.id); row.sourced.add(entry.id);
      if (entry.lane === "current") row.current.add(entry.id);
      if (entry.lane === "early") row.early.add(entry.id);
      if (entry.lane === "review" || entry.lane === "unknown") row.review.add(entry.id);
      if (entry.lane === "research") row.research.add(entry.id);
      if (opportunity && isForeignLanguageOpportunity(opportunity)) row.foreign_title.add(entry.id);
      if (entry.view_type === "procurement_order") {
        const hasSourceEvidence = procurementRows.some((candidate) => candidate.opportunity_id === entry.id && array(candidate.evidence).some((evidence) => Boolean(object(evidence).source_url)));
        if (hasSourceEvidence) row.official_link.add(entry.id);
      } else if (opportunity && (opportunity.official_url || opportunity.application_url || opportunity.detail_url)) row.official_link.add(entry.id);
      matrix.set(key, row);
    }
  }
  const contributionRows = [...matrix.entries()].map(([key, row]) => {
    const [family, view_type] = key.split("\u0000");
    const familyInfo = sourceFamilies.get(family)!;
    return { source_family: family, source_ids: [...familyInfo.source_ids].sort(), source_names: [...familyInfo.names].sort(), permission_states: [...familyInfo.permission_states].sort(), view_type, unique_opportunities: row.ids.size, current: row.current.size, early: row.early.size, review_or_unknown: row.review.size, research: row.research.size, foreign_title_candidates: row.foreign_title.size, with_official_or_source_evidence_link: row.official_link.size, opportunity_ids: [...row.ids].sort() };
  }).sort((a, b) => a.source_family.localeCompare(b.source_family) || a.view_type.localeCompare(b.view_type));

  const sourceRows = sources.map((source) => {
    const freshness = sourceFreshness(source.last_success_at, new Date(generatedAt));
    const permission = getOpportunityV2SourcePermission(source.id);
    const permissionEvidence = getOpportunityV2SourcePermissionEvidence(source.id);
    const contribution = opportunities.filter((item) => item.source_id === source.id || item.discovered_by_sources?.includes(source.id)).length;
    return { id: source.id, name: source.name, family: sourceFamily(source), region: source.region, types: source.types ?? [], registered: true, enabled: source.enabled, configured_status: source.status, permission_state: permission, permission_evidence: permissionEvidence.basis, permission_evidence_url: permissionEvidence.url, last_attempt_at: source.last_attempt_at ?? null, last_success_at: source.last_success_at ?? null, last_content_verified_at: null, freshness_status: freshness.status, freshness_age_hours: freshness.age_hours, publishable_public_contribution: permission === "COMPLIANCE_HOLD" ? 0 : contribution, contribution_is_non_additive: true };
  });
  const unsafe = opportunities.filter((item) => item.deadline_conflict_unsafe === true && item.deadline);
  const encodingPool = opportunities.filter((item) => item.encoding_error === true || item.encoding_error_fields?.length);
  const foreignPool = opportunities.filter((item) => isForeignLanguageOpportunity(item));
  const memoIds = memoRows.map((item) => String(item.id ?? "")).filter(Boolean);
  const memoJsonTitles = memoRows.filter((item) => isForeignLanguageOpportunity({ title: String(item.title ?? ""), summary: String(item.summary ?? "") } as OpportunityV2));
  const sourceEvidenceMissing = opportunities.filter((item) => !item.source_url && !item.detail_url);
  const audit = {
    schema_version: "chanceping.ich.v14.source-governance.v1",
    generated_at: generatedAt,
    candidate_head: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    production_base_url: baseUrl,
    public_only: true,
    http_status: statuses,
    source_registry: { registered: sources.length, enabled: sources.filter((source) => source.enabled).length, sources_with_public_last_success: sources.filter((source) => source.last_success_at).length, stale: sourceRows.filter((source) => source.freshness_status === "STALE").length, never_succeeded: sourceRows.filter((source) => source.freshness_status === "NEVER_SUCCEEDED").length, compliance_hold: sourceRows.filter((source) => source.permission_state === "COMPLIANCE_HOLD").length, not_reviewed: sourceRows.filter((source) => source.permission_state === "NOT_REVIEWED").length },
    counts: { public_opportunities_api: Number(opportunityPayload.total ?? opportunities.length), public_radar_api: Number(json(observations[4]).total ?? radarRows.length), procurement_workbench: Number(json(observations[3]).total ?? procurementRows.length), coverage_assessments: Number(json(observations[2]).total ?? coverageRows.length), memo_json: Number(json(observations[5]).total ?? memoRows.length), memo_markdown_ids: markdownIds.length },
    freshness_rule: "Configured operational target is 72h scheduler interval + 6h grace = 78h; last_success is not the same as content verification.",
    translation_visibility: { public_api_foreign_titles: foreignPool.length, public_memo_foreign_titles: memoJsonTitles.length, private_translation_cache_available: false, production_translation_performed_in_this_audit: false },
    source_rows: sourceRows,
    non_additive_family_view_contribution: contributionRows,
    limitations: ["Production public APIs do not expose runtime file paths/hashes or private translation sidecar.", "last_fetch/last_success does not prove content_changed_at or an official content verification.", "For 43 sources permission/license/robots/rate terms were not fully reviewed; their state is NOT_REVIEWED, not authorized.", "Contribution counts are deduplicated by opportunity id within each source-family × view-type cell and are not additive across families or types."],
  };
  const evidence = {
    schema_version: "chanceping.ich.v14.evidence-quality.v1", generated_at: generatedAt, production_base_url: baseUrl,
    public_opportunity_pool: opportunities.length, public_radar_records: radarRows.length, public_memo_records: memoRows.length,
    unsafe_exact_deadline_public_api_records: unsafe.map((item) => item.id),
    encoding_error_public_api_records: encodingPool.map((item) => item.id),
    missing_source_or_detail_link_records: sourceEvidenceMissing.map((item) => item.id),
    public_foreign_title_records: foreignPool.length,
    memo_json_markdown_id_count_equal: memoIds.length === markdownIds.length && memoIds.every((id) => markdownIds.includes(id)) && markdownIds.every((id) => memoIds.includes(id)),
    memo_json_markdown_ids_equal: new Set(memoIds).size === new Set(markdownIds).size && memoIds.every((id) => markdownIds.includes(id)) && markdownIds.every((id) => memoIds.includes(id)),
    public_exposure_only: true,
    unsafe_deadline_limitation: "Only records surfaced by the public opportunities API can be checked; hidden/internal pool records are not observable here.",
  };
  fs.mkdirSync(outputDir, { recursive: true });
  write("source-governance.json", audit);
  write("source-contribution-matrix.json", { schema_version: "chanceping.ich.v14.source-contribution-matrix.v1", generated_at: generatedAt, additive: false, dimensions: ["source host family", "view type", "lane"], view_types: ["competition_award", "procurement_order", "grant_funding", "exhibition_showcase", "market_channel", "residency_learning", "partnership_commission", "recognition_incubation"], rows: contributionRows });
  write("evidence-quality.json", evidence);
  console.log(JSON.stringify({ output_dir: outputDir, generated_at: generatedAt, sources: sources.length, opportunities: opportunities.length, radar: radarRows.length, procurement: procurementRows.length, coverage: coverageRows.length, memo: memoRows.length, stale: audit.source_registry.stale, hold: audit.source_registry.compliance_hold, not_reviewed: audit.source_registry.not_reviewed, unsafe_public: unsafe.length, encoding_errors_public: encodingPool.length, status: "READ_ONLY_AUDIT_COMPLETE" }, null, 2));
}

void main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
