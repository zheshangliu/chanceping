import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const record = JSON.parse(fs.readFileSync(path.resolve("docs/ich/SRC-planned来源盘点_V1.0.json"), "utf8")) as { formal_store_write: boolean; planned_total: number; items: Array<{ source_id: string; recommended_mode: string }> };
assert.equal(record.formal_store_write, false);
assert(record.planned_total > 0 && record.items.length === record.planned_total);
assert.equal(new Set(record.items.map((item) => item.source_id)).size, record.items.length);
assert(record.items.every((item) => ["adapter_candidate", "manual_or_allowed_fetch", "manual_review"].includes(item.recommended_mode)));
console.log(JSON.stringify({ gate: "pass", planned_total: record.planned_total, formal_store_write: false }, null, 2));
