import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const recordPath = path.resolve("docs/ich/DS4-发布候选审计记录_V1.0.json");
const reportPath = path.resolve("docs/ich/DS4-发布候选审计报告_V1.0.md");
const record = JSON.parse(fs.readFileSync(recordPath, "utf8")) as { gate: string; counts: { current: number; historical: number; total?: number }; formal_store: { total: number }; source_levels: { level12_ratio: number }; semantic_issue_count: number; duplicate_primary_urls: string[]; production_store_write: boolean; errors: string[] };
assert.equal(record.gate, "pass");
assert(record.counts.current >= 30);
assert(record.formal_store.total >= record.counts.current);
assert(record.source_levels.level12_ratio >= 0.8);
assert.equal(record.semantic_issue_count, 0);
assert.equal(record.duplicate_primary_urls.length, 0);
assert.equal(record.production_store_write, false);
assert.equal(record.errors.length, 0);
assert(fs.readFileSync(reportPath, "utf8").includes("DS4 发布候选审计报告"));
console.log(JSON.stringify({ gate: "pass", current: record.counts.current, historical: record.counts.historical, formal_store_total: record.formal_store.total }, null, 2));
