import fs from "node:fs/promises";
import path from "node:path";
import { readOpportunityV2Pool, readOpportunityV2Sources, filterOpportunityV2Radar } from "../src/opportunity-v2";

async function main(): Promise<void> {
  const out = path.resolve(process.env.CHANCEPING_PROCUREMENT_AUDIT_DIR ?? "audits/ich/procurement/latest");
  await fs.mkdir(out, { recursive: true });
  const probePath = path.resolve(process.env.CHANCEPING_PROCUREMENT_PROBE_PATH ?? "reports/ich/procurement/source-probe.json");
  const probe = JSON.parse(await fs.readFile(probePath, "utf8"));
  const sources = readOpportunityV2Sources(); const pool = readOpportunityV2Pool(); const radar = filterOpportunityV2Radar(pool.opportunities, sources, { category: ["procurement_project"] });
  const procurement = pool.opportunities.filter((item) => item.category === "procurement_project");
  const coverage = JSON.parse(await fs.readFile("config/procurement/coverage-matrix.json", "utf8"));
  const baselinePath = process.env.CHANCEPING_PROCUREMENT_BASELINE_POOL_PATH ? path.resolve(process.env.CHANCEPING_PROCUREMENT_BASELINE_POOL_PATH) : null;
  const baseline = baselinePath ? JSON.parse(await fs.readFile(baselinePath, "utf8")) as { opportunities: Array<{ id: string; category: string; source_id?: string; source_item_id?: string; detail_url?: string }> } : null;
  const normalizeDetailUrl = (value: string | undefined): string => {
    if (!value) return "";
    try {
      const url = new URL(value);
      url.hash = "";
      return url.toString().replace(/\/$/u, "");
    } catch {
      return value;
    }
  };
  // A source may add source_item_id after an older row was stored. Compare
  // both stable identities so that this normal enrichment is not reported as
  // a competition regression; the source URL remains the fallback alias.
  const identityAliases = (item: { source_id?: string; source_item_id?: string; detail_url?: string; id: string }): string[] => {
    const source = item.source_id ?? "";
    const aliases = [`${source}|id:${item.id}`];
    if (item.source_item_id) aliases.push(`${source}|item:${item.source_item_id}`);
    const url = normalizeDetailUrl(item.detail_url);
    if (url) aliases.push(`${source}|url:${url}`);
    return aliases;
  };
  const baselineCompetition = (baseline?.opportunities ?? []).filter((item) => item.category === "competition");
  const afterAllAliases = new Set(pool.opportunities.flatMap(identityAliases));
  const afterCompetitionAliases = new Set(pool.opportunities.filter((item) => item.category === "competition").flatMap(identityAliases));
  const missing = baselineCompetition.filter((item) => !identityAliases(item).some((alias) => afterAllAliases.has(alias)));
  const reclassified = baselineCompetition.filter((item) => identityAliases(item).some((alias) => afterAllAliases.has(alias)) && !identityAliases(item).some((alias) => afterCompetitionAliases.has(alias)));
  const competitionRegression = {
    baseline_count: baselineCompetition.length,
    after_count: pool.opportunities.filter((item) => item.category === "competition").length,
    missing_ids: missing.map((item) => `${item.source_id ?? ""}|${item.source_item_id ?? item.detail_url ?? item.id}`).slice(0, 50),
    missing_count: missing.length,
    reclassified_ids: reclassified.map((item) => `${item.source_id ?? ""}|${item.source_item_id ?? item.detail_url ?? item.id}`).slice(0, 50),
    reclassified_count: reclassified.length,
    preserved: missing.length === 0 && reclassified.length === 0,
  };
  const checks = { seller_offer_in_current: procurement.some((item) => item.procurement?.direction === "seller_offer"), awarded_or_cancelled_in_current: procurement.some((item) => ["awarded", "cancelled", "closed"].includes(item.procurement?.stage ?? "")), competition_count: pool.opportunities.filter((item) => item.category === "competition").length, procurement_count: procurement.length, procurement_radar_count: radar.length, source_registry_count: probe.source_count, competition_regression: competitionRegression };
  const manifest = { schema_version: "chanceping-ich-procurement-audit.v1", generated_at: new Date().toISOString(), environment: "development-isolated-copy", production_deployed: false, source_probe: path.relative(process.cwd(), probePath) || path.basename(probePath), source_pool_count: sources.length, pool_count: pool.opportunities.length, radar_count: radar.length, checks };
  await Promise.all([
    fs.writeFile(path.join(out, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n"),
    fs.writeFile(path.join(out, "sources.json"), JSON.stringify(sources, null, 2) + "\n"),
    fs.writeFile(path.join(out, "source-probe.json"), JSON.stringify(probe, null, 2) + "\n"),
    fs.writeFile(path.join(out, "opportunities.json"), JSON.stringify(procurement, null, 2) + "\n"),
    fs.writeFile(path.join(out, "coverage.json"), JSON.stringify(coverage, null, 2) + "\n"),
    fs.writeFile(path.join(out, "checks.json"), JSON.stringify(checks, null, 2) + "\n"),
    fs.writeFile(path.join(out, "competition-regression.json"), JSON.stringify(competitionRegression, null, 2) + "\n"),
  ]);
  console.log(JSON.stringify({ ...manifest, output: out }, null, 2));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
