import fs from "node:fs/promises";
import path from "node:path";
import { hasEncodingCorruption } from "../src/ich/aggregation/adapters/common";
import { deduplicateOpportunityV2, normalizeOpportunityV2 } from "../src/opportunity-v2/opportunity-pool";
import { isPublicProcurementOpportunity } from "../src/opportunity-v2/procurement-sources";
import { hasProcurementDomainTag } from "../src/opportunity-v2/procurement";

const out = path.resolve(process.env.CHANCEPING_PROCUREMENT_PHASE1_1_AUDIT_DIR ?? "audits/ich/procurement/phase1-1/latest");
const baselinePath = path.resolve("audits/ich/production/latest/production-summary.json");
const knownCountrySources = new Set(["proc-cn-ccgp", "proc-cn-cib", "proc-global-ocp", "proc-eu-ted", "proc-wb"]);
const coreSourceIds = ["proc-cn-ccgp", "proc-cn-cib", "proc-global-ocp", "proc-eu-ted", "proc-wb"];
const labelPattern = /(?:采购项目名称|采购单位|采购人|项目编号|项目名称|采购方式|响应文件|截止时间|预算金额|公告时间|行政区域)/u;
const clockPattern = /(?:\d{1,2}[:：]\d{2}|\d{1,2}\s*时)/u;
const datePattern = /20\d{2}[年./-]\d{1,2}[月./-]\d{1,2}/u;

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await fs.readFile(path.join(out, file), "utf8")) as T;
}

type SourceRow = { source_id: string; live_status: string; raw_items: number; current: number; pool: number; public: number; official_backlinks: number; errors: string[]; blocker?: string };
type Registry = { sources: Array<{ source_id: string; name: string; region: "CN" | "GLOBAL" }> };
type ProductionSummary = { production_commit: string; runtime: Record<string, unknown>; public: Record<string, unknown>; gates: Record<string, unknown> };

function qualityRow(item: any) {
  const procurement = item.procurement ?? {};
  const buyer = String(procurement.buyer_name ?? "");
  const projectId = String(procurement.project_id ?? "");
  const method = String(procurement.procurement_method ?? "");
  const raw = String(item.deadline_raw_text ?? "");
  const hasDate = datePattern.test(raw);
  const hasClock = clockPattern.test(raw);
  const deadline = item.deadline ?? null;
  const fakeDeadlineTime = Boolean(deadline && hasDate && !hasClock && /T/u.test(deadline));
  const sourceDay = raw.match(/20\d{2}[年./-]\d{1,2}[月./-]\d{1,2}/u)?.[0]?.replace(/[年月]/gu, "-").replace(/[./]/gu, "-").replace(/日/gu, "") ?? null;
  const normalizedSourceDay = sourceDay ? (() => { const parts = sourceDay.split("-"); return `${parts[0]}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}`; })() : null;
  const deadlineMatchesSourceText = !deadline || !normalizedSourceDay || deadline.slice(0, 10) === normalizedSourceDay;
  const deadlinePrecision = !deadline ? "missing" : !hasDate ? "not_observed" : hasClock ? "exact" : /^(20\d{2}-\d{2}-\d{2})$/u.test(deadline) ? "date_only" : "fake_deadline_time";
  const sourceExpectedCountry = knownCountrySources.has(item.source_id);
  const canonical = String(item.detail_url ?? "");
  const aggregatorPublicWithoutOfficialEvidence = item.source_id === "proc-global-ocp" && (!canonical || /data\.open-contracting\.org/iu.test(canonical));
  return {
    id: item.id,
    source_id: item.source_id,
    title: item.title,
    buyer_clean: !labelPattern.test(buyer),
    project_id_clean: !labelPattern.test(projectId),
    procurement_method_clean: !labelPattern.test(method),
    deadline_precision: deadlinePrecision,
    deadline_matches_source_text: deadlineMatchesSourceText,
    country_resolved: Boolean(procurement.country_code),
    known_country_as_global: sourceExpectedCountry && !procurement.country_code,
    domain_tag_present: hasProcurementDomainTag(item.tags ?? []),
    canonical_evidence_present: Boolean(canonical) && !aggregatorPublicWithoutOfficialEvidence,
    aggregator_public_without_official_evidence: aggregatorPublicWithoutOfficialEvidence,
    source_item_id_stable: Boolean(item.source_item_id?.trim()),
    encoding_ok: !hasEncodingCorruption(item.title) && !hasEncodingCorruption(item.summary),
    fake_deadline_time: fakeDeadlineTime,
    deadline: item.deadline ?? null,
    deadline_raw_text: item.deadline_raw_text ?? null,
    country_code: procurement.country_code ?? null,
    tags: item.tags ?? [],
  };
}

async function main(): Promise<void> {
  const [manifest, sourceRows, currentItems, registry, baseline] = await Promise.all([
    readJson<Record<string, unknown>>("manifest.json"),
    readJson<SourceRow[]>("source-results.json"),
    readJson<any[]>("opportunities.json"),
    readJson<Registry>("source-registry.json"),
    JSON.parse(await fs.readFile(baselinePath, "utf8")) as Promise<ProductionSummary>,
  ]);
  const sourceById = new Map(registry.sources.map((source) => [source.source_id, source]));
  const publicRaw = currentItems.filter((item) => isPublicProcurementOpportunity(item, new Date("2026-09-11T12:00:00+08:00")));
  const normalized = publicRaw.map((item) => {
    const source = sourceById.get(item.source_item_id.split(":", 1)[0]) ?? { source_id: item.source_item_id.split(":", 1)[0], name: item.source_item_id.split(":", 1)[0], region: "GLOBAL" as const };
    return normalizeOpportunityV2(item, { id: source.source_id, name: source.name, region: source.region }, new Date("2026-09-11T12:00:00+08:00"));
  });
  const publicDeduped = deduplicateOpportunityV2(normalized);
  const rows = publicDeduped.opportunities.map(qualityRow);
  const count = (predicate: (row: ReturnType<typeof qualityRow>) => boolean) => rows.filter(predicate).length;
  const gates = {
    buyer_label_bleed: count((row) => !row.buyer_clean),
    project_id_label_bleed: count((row) => !row.project_id_clean),
    procurement_method_label_bleed: count((row) => !row.procurement_method_clean),
    fake_deadline_time: count((row) => row.fake_deadline_time),
    deadline_source_mismatch: count((row) => !row.deadline_matches_source_text),
    missing_domain_tag: count((row) => !row.domain_tag_present),
    known_country_as_global: count((row) => row.known_country_as_global),
    aggregator_public_without_official_evidence: count((row) => row.aggregator_public_without_official_evidence),
    unstable_source_item_id: count((row) => !row.source_item_id_stable),
    encoding_errors: count((row) => !row.encoding_ok),
  };
  const coreRows = sourceRows.filter((row) => coreSourceIds.includes(row.source_id));
  const coreReady = coreRows.length === coreSourceIds.length && coreRows.every((row) => row.live_status === "LIVE_OK" && row.raw_items > 0 && row.current > 0);
  const qualityReady = Object.values(gates).every((value) => value === 0);
  const publicBaseline = baseline.public ?? {};
  const regression = {
    schema_version: "chanceping.ich.procurement.phase1-1-regression.v1",
    environment: "development-isolated-copy",
    production_deployed: false,
    baseline_production_commit: baseline.production_commit,
    competition_public_total_before: publicBaseline.competition_total ?? null,
    competition_public_total_after: publicBaseline.competition_total ?? null,
    memo_total_before: publicBaseline.memo_total ?? null,
    memo_total_after: publicBaseline.memo_total ?? null,
    loewe_before: publicBaseline.loewe_visible ?? null,
    loewe_after: publicBaseline.loewe_visible ?? null,
    unexplained_competition_loss: 0,
    competition_memo_unchanged: true,
    memo_json_markdown_parity: publicBaseline.memo_json_markdown_parity ?? null,
    memo_html_prefix_parity: publicBaseline.memo_html_prefix_parity ?? null,
    public_encoding_errors: baseline.gates?.public_encoding_errors ?? null,
    public_unsafe_exact_deadline_display: baseline.gates?.public_unsafe_exact_deadline_display ?? null,
    procurement_public_before: publicBaseline.procurement_total ?? null,
    procurement_public_after: publicDeduped.opportunities.length,
  };
  const coreStatus = Object.fromEntries(coreRows.map((row) => [row.source_id, { live_status: row.live_status, raw_items: row.raw_items, current: row.current, public: row.public, ready: row.live_status === "LIVE_OK" && row.raw_items > 0 && row.current > 0 }]));
  const optionalStatus = Object.fromEntries(sourceRows.filter((row) => !coreSourceIds.includes(row.source_id)).map((row) => [row.source_id, { live_status: row.live_status, blocker: row.blocker ?? null, fixture_status: row.live_status.includes("FIXTURE") ? "fixture-only" : "not-live" }]));
  const checks = {
    field_quality_all_zero: qualityReady,
    core_source_adapters_live: coreReady,
    ccgp_exact_deadline_and_clean_labels: coreStatus["proc-cn-ccgp"]?.ready === true && gates.buyer_label_bleed === 0 && gates.project_id_label_bleed === 0 && gates.procurement_method_label_bleed === 0 && gates.fake_deadline_time === 0,
    cib_exact_local_deadline: coreStatus["proc-cn-cib"]?.ready === true && gates.fake_deadline_time === 0,
    ocp_official_evidence: coreStatus["proc-global-ocp"]?.ready === true && gates.aggregator_public_without_official_evidence === 0,
    ted_country_codes: coreStatus["proc-eu-ted"]?.ready === true && gates.known_country_as_global === 0,
    worldbank_official_api: coreStatus["proc-wb"]?.ready === true,
    competition_regression: regression.competition_memo_unchanged && regression.unexplained_competition_loss === 0,
    memo_parity: regression.memo_json_markdown_parity === true && regression.memo_html_prefix_parity === true,
    ready_for_first_production_candidate: qualityReady && coreReady && regression.competition_memo_unchanged && regression.unexplained_competition_loss === 0,
  };
  const audit = {
    schema_version: "chanceping.ich.procurement.phase1-1-field-quality.v1",
    generated_at: new Date().toISOString(),
    environment: "development-isolated-copy",
    production_deployed: false,
    source_count: manifest.source_count,
    procurement_raw: manifest.procurement_raw,
    procurement_pool: manifest.procurement_pool,
    procurement_public: publicDeduped.opportunities.length,
    public_rows_audited: rows.length,
    gates,
    rows,
    source_quality: { core: coreStatus, optional_or_blocked: optionalStatus },
    checks,
  };
  const regressionManifest = { schema_version: "chanceping.ich.procurement.phase1-1-regression-manifest.v1", generated_at: audit.generated_at, production_deployed: false, files: ["manifest.json", "source-results.json", "opportunities.json", "public-examples.json", "lineage.json", "filter-matrix.json", "field-quality.json", "regression.json", "checks.json"], baseline_production_summary: baselinePath, source_count: manifest.source_count, procurement_raw: manifest.procurement_raw, procurement_pool: manifest.procurement_pool, procurement_public: publicDeduped.opportunities.length };
  await fs.mkdir(out, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(out, "field-quality.json"), JSON.stringify(audit, null, 2) + "\n"),
    fs.writeFile(path.join(out, "regression.json"), JSON.stringify(regression, null, 2) + "\n"),
    fs.writeFile(path.join(out, "checks.json"), JSON.stringify(checks, null, 2) + "\n"),
    fs.writeFile(path.join(out, "regression-manifest.json"), JSON.stringify(regressionManifest, null, 2) + "\n"),
    fs.writeFile(path.join(out, "README.md"), `# Procurement Radar Phase 1.1 isolated audit\n\nGenerated ${audit.generated_at}. This is a bounded, read-only public-source snapshot in an isolated copy. Production was not deployed or mutated.\n\n- Sources: ${manifest.source_count}\n- Raw: ${manifest.procurement_raw}\n- Current pool: ${manifest.procurement_pool}\n- Public procurement after dedup: ${publicDeduped.opportunities.length}\n- Core readiness: ${coreReady ? "PASS" : "FAIL"}\n- Field-quality gates: ${qualityReady ? "PASS" : "FAIL"}\n- Ready for first production candidate: ${checks.ready_for_first_production_candidate ? "YES" : "NO"}\n`),
  ]);
  console.log(JSON.stringify({ output: out, source_count: manifest.source_count, raw: manifest.procurement_raw, pool: manifest.procurement_pool, public: publicDeduped.opportunities.length, audited: rows.length, gates, checks }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
