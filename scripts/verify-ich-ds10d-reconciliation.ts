import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const audit = JSON.parse(fs.readFileSync(path.resolve("docs/ich/DS10-D-状态迁移对账_V1.0.json"), "utf8")) as { gate: boolean; formal_store_write: boolean; opportunity_reconciliation: { current_drift: number; historical_drift: number; unexplained_current_drift: number; unexplained_historical_drift: number; transitions: Array<{ from: string; to: string }> }; source_reconciliation: { transitions: Array<{ from: string; to: string }> } };
assert.equal(audit.gate, true);
assert.equal(audit.formal_store_write, false);
assert.equal(audit.opportunity_reconciliation.unexplained_current_drift, 0);
assert.equal(audit.opportunity_reconciliation.unexplained_historical_drift, 0);
assert(audit.opportunity_reconciliation.transitions.length >= 1);
assert(audit.opportunity_reconciliation.transitions.every((item) => item.from !== item.to));
assert(audit.source_reconciliation.transitions.length >= 1);
assert(audit.source_reconciliation.transitions.every((item) => item.from === "planned" && item.to === "adapter_ready"));
console.log(JSON.stringify({ gate: "pass", current_drift_explained: true, historical_drift_explained: true, opportunity_transitions: audit.opportunity_reconciliation.transitions.length, source_promotions: audit.source_reconciliation.transitions.length, formal_store_write: false }, null, 2));
