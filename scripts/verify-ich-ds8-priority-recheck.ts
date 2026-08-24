import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const record = JSON.parse(fs.readFileSync(path.resolve("docs/ich/DS8-首批优先记录复核_V1.0.json"), "utf8")) as { formal_store_write: boolean; selected_count: number; results: Array<{ id: string; url_check: { accessible: boolean }; duplicate_slugs: string[] }> };
assert.equal(record.formal_store_write, false);
assert(record.selected_count > 0 && record.results.length === record.selected_count);
assert.equal(new Set(record.results.map((item) => item.id)).size, record.results.length);
assert(record.results.every((item) => item.duplicate_slugs.length === 0));
console.log(JSON.stringify({ gate: "pass", selected_count: record.selected_count, accessible_count: record.results.filter((item) => item.url_check.accessible).length, formal_store_write: false }, null, 2));
