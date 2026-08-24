import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const record = JSON.parse(fs.readFileSync(path.resolve("docs/ich/DS7-来源流程覆盖审计记录_V1.0.json"), "utf8")) as { gate: string; workflow_count: number; adapter_count: number; manual_workflow_count: number; gba_workflow_count: number; international_workflow_count: number; formal_store_write: boolean; errors: string[]; category_coverage: Record<string, number> };
assert.equal(record.gate, "pass");
assert(record.workflow_count >= 10);
assert(record.adapter_count >= 3);
assert(record.manual_workflow_count >= 7);
assert(record.gba_workflow_count >= 4);
assert(record.international_workflow_count >= 2);
assert.equal(record.formal_store_write, false);
assert.equal(record.errors.length, 0);
for (const count of Object.values(record.category_coverage)) assert(count >= 1);
console.log(JSON.stringify({ gate: "pass", workflow_count: record.workflow_count, adapters: record.adapter_count, manual: record.manual_workflow_count, formal_store_write: false }, null, 2));
