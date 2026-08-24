import assert from "node:assert/strict";
import fs from "node:fs";

const audit = JSON.parse(fs.readFileSync("docs/ich/DS12-来源扩展状态审计_V1.0.json", "utf8")) as Record<string, unknown>;
assert.equal(audit.stage, "DS12");
assert.equal(audit.gate, "pass_with_followups");
assert.equal(audit.promotion_decision, "eligible_for_registry_status_promotion");
assert.equal(audit.formal_store_write, false);
assert.deepEqual(audit.source_ids, ["gdmoa", "unesco-ich"]);
const sources = audit.sources as Array<Record<string, unknown>>;
assert.equal(sources.length, 2);
assert.ok(sources.every((source) => source.before_status === "planned" && source.promotion_eligible === true && source.adapter_samples === 3 && source.ds1c_candidates === 3 && source.ds2_status === "completed" && source.ds3_approved === 0));
console.log(JSON.stringify({ stage: audit.stage, gate: audit.gate, promotion_decision: audit.promotion_decision, source_ids: audit.source_ids, formal_store_write: audit.formal_store_write }, null, 2));
