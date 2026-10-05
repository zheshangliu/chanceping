import assert from "node:assert/strict";
import { extractCardTranslationStatuses, extractMemoTranslationStatuses, extractOpportunityIds, sameStringSet, uniqueSortedIds } from "../src/opportunity-v2/v14-baseline";

const html = `
  <article data-opportunity-id="oppv2_bbbbbbbbbbbbbbbbbbbbbbbb"></article>
  <a href="/ich/opportunities/oppv2_aaaaaaaaaaaaaaaaaaaaaaaa?from=memo">detail</a>
  <a href="/ich/opportunities/oppv2_aaaaaaaaaaaaaaaaaaaaaaaa#facts">same</a>
`;
assert.deepEqual(extractOpportunityIds(html), [
  "oppv2_aaaaaaaaaaaaaaaaaaaaaaaa",
  "oppv2_bbbbbbbbbbbbbbbbbbbbbbbb",
]);
assert.deepEqual(uniqueSortedIds([["oppv2_b", "oppv2_a"], ["oppv2_a", "", "oppv2_c"]]), ["oppv2_a", "oppv2_b", "oppv2_c"]);
assert.deepEqual(extractOpportunityIds("[项目](/ich/opportunities/oppv2_cccccccccccccccccccccccc)"), ["oppv2_cccccccccccccccccccccccc"]);
assert.deepEqual(extractOpportunityIds('<a href="/ich/procurement/oppv2_ffffffffffffffffffffffff">purchase</a>'), ["oppv2_ffffffffffffffffffffffff"]);
assert.deepEqual(extractMemoTranslationStatuses('<tr data-opportunity-id="oppv2_dddddddddddddddddddddddd"><td>deadline</td><td><a>中文标题</a><small>Original title</small></td></tr>'), [{ id: "oppv2_dddddddddddddddddddddddd", status: "translated" }]);
assert.deepEqual(extractCardTranslationStatuses('<article class="ich-card"><a href="/ich/opportunities/oppv2_eeeeeeeeeeeeeeeeeeeeeeee"></a><span>中文待补</span></article>'), [{ id: "oppv2_eeeeeeeeeeeeeeeeeeeeeeee", status: "pending" }]);
assert.equal(sameStringSet(["b", "a", "a"], ["a", "b"]), true);
assert.equal(sameStringSet(["a", "b"], ["a"]), false);
console.log("V1.4 production baseline parsing fixtures: PASS");
