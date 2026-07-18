import assert from "node:assert/strict";
import { WELFARE_SHADOW_SOURCES } from "../src/public/welfare-opportunities";

const procurementIntent = WELFARE_SHADOW_SOURCES.find((source) => source.code === "OFF-N-002");
assert.equal(procurementIntent?.shadowAccess, "restricted", "procurement intent must never be auto-promoted after a failed access attempt");
console.log("PASS verify:welfare:shadow-assessment");
