import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const queue = JSON.parse(fs.readFileSync(path.resolve("docs/ich/DS8-待复核优先级队列_V1.0.json"), "utf8")) as { items: unknown[]; input_total: number };
const audit = JSON.parse(fs.readFileSync(path.resolve("docs/ich/DS8-全量复核动作账本_V1.0.json"), "utf8")) as { queue_input_total: number; original_queue_input_total: number; processed_count: number; readonly: boolean; formal_store_write: boolean; formal_store_before_sha256: string; formal_store_after_sha256: string; formal_publish_blocked_count: number; results: Array<{ formal_publish_blocked: boolean; id: string; disposition: string }> ; gate: string };
const store = fs.readFileSync(path.resolve("data/ich-opportunities.json"));
assert.equal(audit.queue_input_total, queue.items.length, "full ledger must cover every queue item");
assert.ok(audit.original_queue_input_total >= 107, "ledger must preserve original 107-record requirement");
assert.equal(audit.processed_count, queue.items.length, "processed count must equal queue count");
assert.equal(audit.readonly, true, "full recheck must be readonly");
assert.equal(audit.formal_store_write, false, "full recheck must not write formal store");
assert.equal(audit.formal_store_before_sha256, audit.formal_store_after_sha256, "formal store hash must be unchanged");
assert.equal(audit.formal_store_after_sha256, crypto.createHash("sha256").update(store).digest("hex"), "ledger after hash must match current store");
assert.equal(audit.formal_publish_blocked_count, audit.processed_count, "every record must remain publish-blocked");
assert.ok(audit.results.every((item) => item.formal_publish_blocked && item.id && item.disposition), "every result needs a blocked disposition");
assert.equal(audit.gate, "pass_with_followups", "full recheck gate must preserve follow-up state");
console.log(JSON.stringify({ gate: "pass", queue_count: queue.items.length, processed_count: audit.processed_count, formal_store_write: false, formal_store_unchanged: true }, null, 2));
