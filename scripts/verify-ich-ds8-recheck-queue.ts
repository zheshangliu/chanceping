import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const record = JSON.parse(fs.readFileSync(path.resolve("docs/ich/DS8-待复核优先级队列_V1.0.json"), "utf8")) as { formal_store_write: boolean; input_total: number; stale_recheck_count: number; items: Array<{ id: string; slug: string; queue: string; priority: number }> };
assert.equal(record.formal_store_write, false);
assert.equal(record.items.length, record.stale_recheck_count);
assert.equal(new Set(record.items.map((item) => item.id)).size, record.items.length);
assert(record.items.every((item) => item.slug && item.queue && Number.isFinite(item.priority)));
assert(record.items.every((item, index, items) => index === 0 || items[index - 1].priority >= item.priority));
console.log(JSON.stringify({ gate: "pass", input_total: record.input_total, stale_recheck_count: record.stale_recheck_count, formal_store_write: false }, null, 2));
