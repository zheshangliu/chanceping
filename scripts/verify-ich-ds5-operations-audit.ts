import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const record = JSON.parse(fs.readFileSync(path.resolve("docs/ich/DS5-规模化运营运行记录_V1.0.json"), "utf8")) as { gate: string; formal_store_write: boolean; source_registry: { total: number; query_packs: number }; upstream_runs: { ds2_gate: string; ds3_gate: string }; next_scheduled_run_at: string; errors: string[] };
assert(["pass", "pass_with_followups"].includes(record.gate));
assert.equal(record.formal_store_write, false);
assert(record.source_registry.total >= 30);
assert(record.source_registry.query_packs >= 5);
assert(["pass", "pass_with_followups"].includes(record.upstream_runs.ds2_gate));
assert.equal(record.upstream_runs.ds3_gate, "pass");
assert(!Number.isNaN(Date.parse(record.next_scheduled_run_at)));
assert.equal(record.errors.length, 0);
assert(fs.readFileSync(path.resolve("docs/ich/DS5-规模化运营报告_V1.0.md"), "utf8").includes("DS5 规模化运营报告"));
console.log(JSON.stringify({ gate: "pass", sources: record.source_registry.total, next_scheduled_run_at: record.next_scheduled_run_at, formal_store_write: false }, null, 2));
