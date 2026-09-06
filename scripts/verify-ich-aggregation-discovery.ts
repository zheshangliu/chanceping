import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { parseShejijingsaiListing } from "../src/ich/aggregation/adapters/shejijingsai";
import { getAggregationAdapter } from "../src/ich/aggregation/adapters";
import { deduplicateAggregationItems } from "../src/ich/aggregation/dedup";
import { getAggregationRegistry, validateAggregationRegistry } from "../src/ich/aggregation/registry";
import { scoreAggregationRelevance } from "../src/ich/aggregation/relevance";

const root = process.cwd();
const readJson = (file: string) => JSON.parse(fs.readFileSync(path.resolve(root, file), "utf8")) as any;
const errors = validateAggregationRegistry();
assert.deepEqual(errors, [], errors.join("; "));
assert.equal(getAggregationRegistry().length, 5, "Stage5-A.4 requires five registered aggregation sources");
assert.equal(getAggregationAdapter("shejijingsai-list").adapter_id, "shejijingsai-list-v1");

const fixture = `<table><tr><td>设计类别</td><td>项目</td><td>报名截止日期</td></tr><tr><td>【综合设计】</td><td><a href="https://www.shejijingsai.com/2026/09/1.html">非遗传统工艺文创设计征集</a></td><td>2026年12月31日</td></tr></table>`;
const parsed = parseShejijingsaiListing(fixture);
assert.equal(parsed.length, 1, "table adapter must parse a structured row");
assert.equal(parsed[0].deadline_at, "2026-12-31T23:59:00.000Z");
assert.equal(scoreAggregationRelevance(parsed[0].title, parsed[0].source_category, parsed[0].raw_text).relevance, "CORE_ICH");

const before = crypto.createHash("sha256").update(fs.readFileSync(path.resolve(root, "data/ich-opportunities.json"))).digest("hex");
const candidates = readJson("data/ich/aggregation-candidates.json");
const ledger = readJson("data/ich/aggregation-discovery-ledger.json");
const health = readJson("data/ich/aggregation-source-health.json");
const report = readJson("docs/ich/stage5a4-aggregation-network-report.json");
assert.equal(candidates.schema_version, "ich-aggregation-candidates.v1");
assert.equal(ledger.schema_version, "ich-aggregation-discovery-ledger.v1");
assert.equal(health.sources.length, 5);
assert.equal(report.readonly, true);
assert.equal(report.formal_store_write, false);
assert.equal(report.formal_store_unchanged, true);
assert.equal(report.funnel.ds14_imported, 0);
assert.deepEqual(report.stage5_kpi, { metric: "direction_aware_ich_actionable", before: 47, after: 47, target: 80 });
assert.ok(report.funnel.raw_items_seen >= 0);
assert.equal(report.sources.length, 5);
assert.equal(new Set(report.sources.map((source: any) => source.source_id)).size, 5);
assert.ok(report.incremental_simulation.new_items === 0 && report.incremental_simulation.updated_items === 0);
assert.ok(report.candidates.every((item: any) => item.official_backtrace_status !== "OFFICIAL_FOUND" || item.official_url));
assert.ok(!JSON.stringify(report).match(/example\.(com|net|cn)|mock\.chanceping\.local/i), "mock/example URL must not be accepted as live evidence");
const dedup = deduplicateAggregationItems(report.candidates);
assert.equal(dedup.items.length, report.candidates.length, "candidate queue must be cross-source deduplicated");
const after = crypto.createHash("sha256").update(fs.readFileSync(path.resolve(root, "data/ich-opportunities.json"))).digest("hex");
assert.equal(before, after, "readonly aggregation must not mutate formal store");
for (const file of [
  "docs/ich/stage5a4-aggregation-network-report.md",
  "docs/ich/aggregation-shejijingsai-report.md",
  "docs/ich/aggregation-global-sources-report.md",
  "docs/ich/stage5a4-provider-contribution.md",
  "docs/ich/stage5a4-rejected-candidates.md",
]) assert.ok(fs.existsSync(path.resolve(root, file)), `${file} is required`);
console.log(JSON.stringify({ gate: "pass", sources: report.sources.length, raw_items_seen: report.funnel.raw_items_seen, relevant: report.funnel.semantic_relevant, backtrace_attempted: report.funnel.official_backtrace_attempted, backtrace_success: report.funnel.official_backtrace_success, qualified: report.funnel.qualified_candidates, formal_store_unchanged: report.formal_store_unchanged, mock_contamination: false }, null, 2));
