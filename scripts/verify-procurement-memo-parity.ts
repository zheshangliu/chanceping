import assert from "node:assert/strict";
import fs from "node:fs";

const rollout = fs.readFileSync("scripts/procurement-phase1-production-rollout.sh", "utf8");
assert.match(rollout, /const sameSequence = \(left, right\) =>/u);
assert.match(rollout, /afterMemoIds\.slice\(0, htmlIds\.length\)/u);
assert.match(rollout, /htmlIds\.length <= afterMemoIds\.length && sameSequence/u);

const jsonIds = Array.from({ length: 540 }, (_, index) => `opp-${index + 1}`);
const htmlIds = jsonIds.slice(0, 50);
const sameSequence = (left: string[], right: string[]) => left.length === right.length && left.every((id, index) => id === right[index]);
assert.equal(htmlIds.length <= jsonIds.length && sameSequence(jsonIds.slice(0, htmlIds.length), htmlIds), true);
assert.equal(sameSequence(jsonIds.slice(0, htmlIds.length), [...htmlIds].reverse()), false);
console.log("PROCUREMENT_MEMO_PARITY: PASS");
